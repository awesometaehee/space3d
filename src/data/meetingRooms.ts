// PoC용 가상 회의실·예약 데이터. 실제 사내 회의실 정보가 아니다.
// 실제 연동 시 이 모듈만 그룹웨어 회의실 예약 API로 교체한다.

export interface MeetingRoom {
  /** 3D 장면의 MEETING_ROOM_ZONES id와 같다 */
  id: string;
  name: string;
  capacity: number;
  equipment: string[];
}

export const MEETING_ROOMS: MeetingRoom[] = [
  { id: 'room-a', name: '회의실 A', capacity: 6, equipment: ['화이트보드', '빔프로젝터'] },
  { id: 'room-b', name: '회의실 B', capacity: 4, equipment: ['TV 화면 공유'] },
  { id: 'room-c', name: '포커스룸 C', capacity: 4, equipment: ['원형 테이블'] },
];

export const roomById = (id: string) => MEETING_ROOMS.find((r) => r.id === id);

/** 'YYYY-MM-DD' */
export type DateKey = string;

export interface Booking {
  id: string;
  roomId: string;
  date: DateKey;
  /** 'HH:MM' */
  start: string;
  end: string;
  title: string;
}

export interface Slot {
  start: string;
  end: string;
  available: boolean;
}

export type DayPeriod = 'morning' | 'afternoon' | 'any';

const OPEN = 9 * 60;
const CLOSE = 18 * 60;
const LUNCH = [12 * 60, 13 * 60] as const;

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const toHHMM = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function dateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
export function formatDate(key: DateKey): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}월 ${d}일 (${WEEKDAY[date.getDay()]})`;
}

/** 날짜·방마다 항상 같은 결과가 나오는 가상 기존 예약 */
function seededBusy(roomId: string, date: DateKey): Booking[] {
  let s = 0;
  for (const ch of roomId + date) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const result: Booking[] = [];
  const count = 2 + Math.floor(next() * 3);
  for (let i = 0; i < count; i++) {
    const start = OPEN + Math.floor(next() * 16) * 30;
    const end = Math.min(CLOSE, start + (1 + Math.floor(next() * 3)) * 30);
    result.push({ id: `seed-${roomId}-${date}-${i}`, roomId, date, start: toHHMM(start), end: toHHMM(end), title: '기존 예약' });
  }
  return result;
}

/**
 * 가상 예약 저장소. 화면을 새로 고치면 초기화된다.
 * 에이전트(백엔드 역할)만 이 저장소를 바꾼다.
 */
export class BookingStore {
  private readonly made: Booking[] = [];
  private seq = 0;

  bookingsFor(roomId: string, date: DateKey): Booking[] {
    return [...seededBusy(roomId, date), ...this.made.filter((b) => b.roomId === roomId && b.date === date)];
  }

  isFree(roomId: string, date: DateKey, start: string, end: string): boolean {
    const s = toMinutes(start);
    const e = toMinutes(end);
    return this.bookingsFor(roomId, date).every((b) => toMinutes(b.end) <= s || toMinutes(b.start) >= e);
  }

  /** 기간 안에서 durationMin 길이로 30분 간격 후보를 만든다. 점심시간은 뺀다. */
  slots(roomId: string, date: DateKey, period: DayPeriod, durationMin: number): Slot[] {
    const from = period === 'afternoon' ? LUNCH[1] : OPEN;
    const to = period === 'morning' ? LUNCH[0] : CLOSE;
    const result: Slot[] = [];
    for (let s = from; s + durationMin <= to; s += 30) {
      const e = s + durationMin;
      if (s < LUNCH[1] && e > LUNCH[0]) continue;
      const start = toHHMM(s);
      const end = toHHMM(e);
      result.push({ start, end, available: this.isFree(roomId, date, start, end) });
    }
    return result;
  }

  book(input: Omit<Booking, 'id'>): Booking {
    if (!roomById(input.roomId)) throw new Error(`알 수 없는 회의실: ${input.roomId}`);
    if (!this.isFree(input.roomId, input.date, input.start, input.end)) {
      throw new Error('이미 예약된 시간입니다.');
    }
    const booking = { ...input, id: `bk-${++this.seq}` };
    this.made.push(booking);
    return booking;
  }
}
