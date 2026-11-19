import { DIRECTORY, TEAMS, businessDays } from '../../../data/calendar';
import type { DateKey, DayPeriod } from '../../../data/meetingRooms';
import { addDays, parseDateRange } from '../../parse';

/** 진행 중인 일정 조율 요청 (공유 상태 schedule.request) */
export interface ScheduleRequest {
  /** 나를 뺀 참석자 id */
  attendeeIds: string[];
  /** 찾아볼 날짜들 (평일) */
  dates: DateKey[];
  /** "다음 주", "11월 20일 (금)" 같은 범위 이름 */
  rangeLabel: string;
  period: DayPeriod;
  durationMin: number;
  title: string;
  /** 고른 시간 (시간을 고른 뒤 채운다) */
  slot: { date: DateKey; start: string; end: string } | null;
  /** 고른 회의실. null은 아직 안 골랐거나 회의실 없이 진행 */
  roomId: string | null;
}

/** 지금 단계. 화면 배치에 쓴다: 회의실을 고를 때만 복셀 중심 */
export type ScheduleStage = 'attendees' | 'time' | 'room' | 'confirm' | null;

export interface ParsedSchedule {
  attendeeIds: string[];
  /** 요청에서 읽은 팀 이름 (제목에 쓴다) */
  teams: string[];
  dates: DateKey[] | null;
  rangeLabel: string | null;
  period: DayPeriod | null;
  durationMin: number | null;
  title: string | null;
}

/** 요청에서 참석자 찾기: 팀 이름이면 팀 전체, 이름이면 그 사람 */
function findAttendees(t: string): { ids: string[]; teams: string[] } {
  const teams = TEAMS.filter((team) => t.includes(team) || t.includes(team.replace(/팀$/, ' 팀')));
  if (/우리\s*팀|팀원/.test(t) && !teams.includes('플랫폼팀')) teams.push('플랫폼팀');
  const ids = new Set(DIRECTORY.filter((c) => teams.includes(c.team)).map((c) => c.id));
  for (const c of DIRECTORY) {
    // 이름 뒤에 조사·호칭이 붙어도 읽는다: "한결님", "아름 수석이랑"
    if (new RegExp(`${c.name}(?=$|[^가-힣]|님|씨|이랑|랑|과|와|하고|이|도|${c.title})`).test(t)) ids.add(c.id);
  }
  return { ids: [...ids], teams };
}

const TITLE_WORDS: Array<[RegExp, string]> = [
  [/킥\s*오프/, '킥오프'],
  [/회고/, '회고'],
  [/리뷰/, '리뷰'],
  [/브레인\s*스토밍|아이디어/, '아이디어 회의'],
  [/워크\s*숍/, '워크숍'],
  [/주간/, '주간 회의'],
  [/1\s*on\s*1|원온원|면담/i, '1:1 미팅'],
];

/**
 * 모의 에이전트용 규칙 기반 해석기. 실제 에이전트에서는 LLM이 이 역할을 한다.
 * 예) "다음 주 기획팀이랑 1시간 회의 잡아줘", "한결, 아름이랑 목요일 오후 30분 미팅"
 */
export function parseSchedule(text: string, now: Date): ParsedSchedule {
  const t = text.replace(/\s+/g, ' ');
  const { ids, teams } = findAttendees(t);
  const range = parseDateRange(t, now);

  const period: DayPeriod | null = /오전|아침/.test(t) ? 'morning' : /오후|점심\s*(?:이후|후)/.test(t) ? 'afternoon' : null;

  let durationMin = 0;
  const hours = t.match(/(\d+)\s*시간(\s*반)?/);
  const mins = t.match(/(\d+)\s*분/);
  if (hours) durationMin += Number(hours[1]) * 60 + (hours[2] ? 30 : 0);
  if (mins) durationMin += Number(mins[1]);

  const title = TITLE_WORDS.find(([re]) => re.test(t))?.[1] ?? null;

  return {
    attendeeIds: ids,
    teams,
    dates: range?.dates ?? null,
    rangeLabel: range?.label ?? null,
    period,
    durationMin: durationMin ? Math.min(240, Math.max(30, Math.round(durationMin / 30) * 30)) : null,
    title,
  };
}

/** 일정 조율 요청 같은지 (0~1) */
export function matchSchedule(text: string): number {
  if (/일정\s*(조율|잡|맞)|시간\s*(맞춰|조율)|빈\s*시간|가능한\s*시간|언제\s*(돼|되|가능)|초대/.test(text)) return 1;
  const { ids } = findAttendees(text);
  // 사람·팀과 함께 회의를 잡으면 회의실 예약(0.8)보다 일정 조율이 먼저다
  if (ids.length && /회의|미팅|모임|만나|약속|싱크|킥\s*오프|리뷰|회고|워크\s*숍/.test(text)) return 0.9;
  return 0;
}

/** 조율 중일 때 이어지는 말 ("목요일로", "오전으로", "30분만") */
export function matchScheduleFollowUp(text: string): number {
  return /요일|오전|오후|시간|분|주|내일|모레|일|추가|빼|제외|참석|같이|다시/.test(text) ? 0.5 : 0;
}

export const DEFAULT_DURATION = 60;
export const DEFAULT_DAYS = 5;

/** 말하지 않은 값을 채워 요청을 만든다 (조율 중이었으면 이전 값을 이어 쓴다) */
export function buildRequest(p: ParsedSchedule, now: Date, prev: ScheduleRequest | null): ScheduleRequest {
  let dates = p.dates ?? prev?.dates;
  let rangeLabel = p.rangeLabel ?? prev?.rangeLabel;
  if (!dates || !rangeLabel) {
    dates = businessDays(addDays(now, 1), DEFAULT_DAYS);
    rangeLabel = `앞으로 ${DEFAULT_DAYS}일 (평일)`;
  }
  const attendeeIds = p.attendeeIds.length ? p.attendeeIds : (prev?.attendeeIds ?? []);
  const teamTitle = p.teams.length ? `${p.teams.join('·')} ` : '';
  return {
    attendeeIds,
    dates,
    rangeLabel,
    period: p.period ?? prev?.period ?? 'any',
    durationMin: p.durationMin ?? prev?.durationMin ?? DEFAULT_DURATION,
    title: p.title ? `${teamTitle}${p.title}` : (prev?.title ?? `${teamTitle}업무 협의`),
    slot: null,
    roomId: null,
  };
}
