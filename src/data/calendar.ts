// PoC용 가상 조직도·일정 데이터. 실제 임직원 정보가 아니다.
// 업무 연락처 수준(이름·팀·직급)만 두고, 일정은 "바쁨"만 알 수 있게 한다 (남의 일정 제목은 보여 주지 않는다).
// 실제 연동 시 이 모듈만 그룹웨어 조직도·일정 API로 교체한다.

import { dateKey, toHHMM, toMinutes, type DateKey } from './meetingRooms';

export interface Colleague {
  id: string;
  name: string;
  team: string;
  title: string;
}

/** 나 (일정을 잡는 사람). 참석자 수에는 항상 포함된다 */
export const ME_ID = 'me';

const TEAM = (team: string, people: Array<[string, string]>, prefix: string): Colleague[] =>
  people.map(([name, title], i) => ({ id: `${prefix}${i + 1}`, name, team, title }));

/** 플랫폼팀(내 팀)은 복셀 재실 목록과 같은 가상 인물이다 */
export const DIRECTORY: Colleague[] = [
  ...TEAM(
    '플랫폼팀',
    [
      ['여름', '매니저'], ['단비', '책임'], ['도담', '선임'], ['라온', '매니저'], ['마루', '수석'], ['새벽', '선임'],
      ['하랑', '매니저'], ['가온', '책임'], ['누리', '선임'], ['다솜', '매니저'], ['미르', '선임'], ['바다', '책임'],
    ],
    'm',
  ),
  ...TEAM('기획팀', [['한결', '책임'], ['소망', '선임'], ['하늘', '매니저']], 'p'),
  ...TEAM('디자인팀', [['아름', '수석'], ['초롱', '선임'], ['나래', '매니저']], 'd'),
  ...TEAM('영업지원팀', [['든솔', '책임'], ['세찬', '매니저']], 's'),
];

export const TEAMS = [...new Set(DIRECTORY.map((c) => c.team))];

export const colleagueById = (id: string) => DIRECTORY.find((c) => c.id === id);

export interface CalendarEvent {
  id: string;
  date: DateKey;
  start: string;
  end: string;
  title: string;
  /** 나를 포함한 참석자 id */
  attendeeIds: string[];
  roomId: string | null;
}

/** 30분 칸 하나의 가능 여부 */
export interface DayCells {
  date: DateKey;
  /** 09:00부터 30분 칸마다 비어 있는 사람 수. 점심(12~13시)이나 지난 시간은 -1 */
  free: number[];
}

export const DAY_OPEN = 9 * 60;
export const DAY_CLOSE = 18 * 60;
export const LUNCH = [12 * 60, 13 * 60] as const;
export const CELL_MIN = 30;
export const CELLS_PER_DAY = (DAY_CLOSE - DAY_OPEN) / CELL_MIN;

interface Busy {
  start: number;
  end: number;
}

/** 사람·날짜마다 항상 같은 결과가 나오는 가상 기존 일정 */
function seededBusy(personId: string, date: DateKey): Busy[] {
  let s = 7;
  for (const ch of personId + date) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const result: Busy[] = [];
  const count = 1 + Math.floor(next() * 3);
  for (let i = 0; i < count; i++) {
    const start = DAY_OPEN + Math.floor(next() * 17) * CELL_MIN;
    const end = Math.min(DAY_CLOSE, start + (1 + Math.floor(next() * 4)) * CELL_MIN);
    result.push({ start, end });
  }
  return result;
}

const isWeekend = (key: DateKey) => {
  const [y, m, d] = key.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
};

/**
 * 가상 일정 저장소. 화면을 새로 고치면 초기화된다.
 * 다른 사람의 일정은 "바쁨"으로만 알 수 있다.
 */
export class CalendarStore {
  private readonly made: CalendarEvent[] = [];
  private seq = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  private busy(personId: string, date: DateKey): Busy[] {
    if (isWeekend(date)) return [{ start: 0, end: 24 * 60 }];
    const mine = this.made
      .filter((e) => e.date === date && e.attendeeIds.includes(personId))
      .map((e) => ({ start: toMinutes(e.start), end: toMinutes(e.end) }));
    return [...seededBusy(personId, date), ...mine];
  }

  isFree(personId: string, date: DateKey, start: string, end: string): boolean {
    const s = toMinutes(start);
    const e = toMinutes(end);
    return this.busy(personId, date).every((b) => b.end <= s || b.start >= e);
  }

  /** 지금보다 지난 칸인지 (오늘이면 지금 이후만) */
  private past(date: DateKey, startMin: number): boolean {
    const now = this.now();
    const today = dateKey(now);
    if (date < today) return true;
    return date === today && startMin < now.getHours() * 60 + now.getMinutes();
  }

  /** 하루를 30분 칸으로 나눠 칸마다 비어 있는 사람 수를 센다 */
  dayCells(personIds: string[], date: DateKey): DayCells {
    const free: number[] = [];
    for (let i = 0; i < CELLS_PER_DAY; i++) {
      const s = DAY_OPEN + i * CELL_MIN;
      if ((s >= LUNCH[0] && s < LUNCH[1]) || this.past(date, s)) {
        free.push(-1);
        continue;
      }
      free.push(personIds.filter((p) => this.isFree(p, date, toHHMM(s), toHHMM(s + CELL_MIN))).length);
    }
    return { date, free };
  }

  /**
   * 회의 후보 시간: 길이만큼 이어지는 30분 간격 시작 시각마다 참석 가능한 사람을 센다.
   * 점심시간에 걸치거나 지난 시간은 뺀다.
   */
  windows(personIds: string[], date: DateKey, durationMin: number, from = DAY_OPEN, to = DAY_CLOSE) {
    const result: Array<{ date: DateKey; start: string; end: string; freeIds: string[] }> = [];
    for (let s = from; s + durationMin <= to; s += CELL_MIN) {
      const e = s + durationMin;
      if (s < LUNCH[1] && e > LUNCH[0]) continue;
      if (this.past(date, s)) continue;
      const start = toHHMM(s);
      const end = toHHMM(e);
      result.push({ date, start, end, freeIds: personIds.filter((p) => this.isFree(p, date, start, end)) });
    }
    return result;
  }

  add(input: Omit<CalendarEvent, 'id'>): CalendarEvent {
    const event = { ...input, id: `ev-${++this.seq}` };
    this.made.push(event);
    return event;
  }

  /** 이번 대화에서 만든 일정 */
  events(): CalendarEvent[] {
    return [...this.made];
  }
}

/** 평일만 */
export function businessDays(from: Date, count: number): DateKey[] {
  const days: DateKey[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (days.length < count) {
    const key = dateKey(d);
    if (!isWeekend(key)) days.push(key);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export { isWeekend };
