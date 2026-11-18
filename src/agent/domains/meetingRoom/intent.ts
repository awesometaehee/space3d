import type { DateKey, DayPeriod } from '../../../data/meetingRooms';
import { parseDate } from '../../parse';

export interface BookingRequest {
  date: DateKey;
  period: DayPeriod;
  people: number;
  durationMin: number;
}

export interface ParsedIntent {
  request: BookingRequest;
  /** 사용자가 직접 말하지 않아 기본값을 쓴 항목 */
  defaulted: Array<'date' | 'people' | 'duration'>;
}

const DEFAULT_PEOPLE = 4;
const DEFAULT_DURATION = 60;

/** 회의실 예약 요청 같은지 (0~1). 라우터가 업무 영역을 고를 때 쓴다 */
export function matchMeetingRoom(text: string): number {
  if (/회의실|미팅\s*룸|포커스\s*룸/.test(text)) return 1;
  if (/(회의|미팅).*(잡|예약|할\s*곳|할\s*데)/.test(text)) return 0.8;
  if (/회의|미팅|예약/.test(text)) return 0.4;
  return 0;
}

/**
 * 모의 에이전트용 규칙 기반 해석기. 실제 에이전트에서는 LLM이 이 역할을 한다.
 * 예) "내일 오후 4명 회의실 잡아줘", "11월 20일 오전 6인 1시간 반 회의"
 */
export function parseIntent(text: string, now: Date): ParsedIntent {
  const t = text.replace(/\s+/g, ' ');
  const defaulted: ParsedIntent['defaulted'] = [];

  const { date, found } = parseDate(t, now);
  if (!found) defaulted.push('date');

  const period: DayPeriod = /오전|아침/.test(t) ? 'morning' : /오후|점심\s*(?:이후|후)|저녁/.test(t) ? 'afternoon' : 'any';

  const peopleMatch = t.match(/(\d+)\s*(?:명|인)/);
  const people = peopleMatch ? Math.max(1, Number(peopleMatch[1])) : DEFAULT_PEOPLE;
  if (!peopleMatch) defaulted.push('people');

  let durationMin = 0;
  const hours = t.match(/(\d+)\s*시간(\s*반)?/);
  const mins = t.match(/(\d+)\s*분/);
  if (hours) durationMin += Number(hours[1]) * 60 + (hours[2] ? 30 : 0);
  if (mins) durationMin += Number(mins[1]);
  if (durationMin === 0) {
    durationMin = DEFAULT_DURATION;
    defaulted.push('duration');
  }
  // 30분 단위로 맞추고 30분~4시간으로 제한한다
  durationMin = Math.min(240, Math.max(30, Math.round(durationMin / 30) * 30));

  return { request: { date, period, people, durationMin }, defaulted };
}

export const PERIOD_LABEL: Record<DayPeriod, string> = { morning: '오전', afternoon: '오후', any: '하루 중' };

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}시간` : '', m ? `${m}분` : ''].filter(Boolean).join(' ');
}
