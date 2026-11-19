import type { CalendarEvent, Colleague } from '../../../data/calendar';
import type { DateKey } from '../../../data/meetingRooms';
import type { ToolDefinition } from '../../agui';

/**
 * 일정 조율 영역의 화면 도구.
 * 흐름: (참석자 고르기) → 공통 빈 시간 → 회의실 → 초대 확인 → 완료
 */

export interface PickAttendeesArgs {
  /** 고를 수 있는 사람 (조직도) */
  people: Colleague[];
  /** 미리 골라 둔 사람 */
  selected: string[];
}
export type PickAttendeesResult = { attendeeIds: string[] } | { cancelled: true };

export interface TimeCandidate {
  date: DateKey;
  dateLabel: string;
  start: string;
  end: string;
  /** 참석할 수 없는 사람 이름 (비어 있으면 모두 가능) */
  missing: string[];
}

export interface ShowCommonTimesArgs {
  title: string;
  rangeLabel: string;
  durationMin: number;
  /** 나를 뺀 참석자 */
  attendees: Colleague[];
  /** 나를 포함한 인원 */
  total: number;
  /** 날짜별 30분 칸의 가능 인원 (히트맵) */
  days: Array<{ date: DateKey; label: string; free: number[] }>;
  /** 추천 후보 (모두 가능한 시간 먼저) */
  candidates: TimeCandidate[];
}
export type ShowCommonTimesResult =
  | { date: DateKey; start: string; end: string }
  | { editAttendees: true }
  | { cancelled: true };

export interface PickMeetingRoomArgs {
  dateLabel: string;
  start: string;
  end: string;
  people: number;
  rooms: Array<{ id: string; name: string; capacity: number; equipment: string[]; fits: boolean; free: boolean }>;
}
/** roomId가 null이면 회의실 없이 (온라인) */
export type PickMeetingRoomResult = { roomId: string | null } | { back: true } | { cancelled: true };

export interface ConfirmInviteArgs {
  title: string;
  date: DateKey;
  dateLabel: string;
  start: string;
  end: string;
  roomId: string | null;
  roomName: string | null;
  attendees: Colleague[];
  /** 참석할 수 없는 것으로 보이는 사람 */
  missing: string[];
}
export type ConfirmInviteResult = { confirmed: true; title: string; note: string } | { confirmed: false };

export interface ShowInviteResultArgs {
  event: CalendarEvent;
  dateLabel: string;
  roomName: string | null;
  attendees: Colleague[];
}

export const SCHEDULE_TOOL = {
  pickAttendees: 'pick_attendees',
  showCommonTimes: 'show_common_times',
  pickMeetingRoom: 'pick_meeting_room',
  confirmInvite: 'confirm_invite',
  showInviteResult: 'show_invite_result',
} as const;

export const SCHEDULE_DISPLAY_ONLY = [SCHEDULE_TOOL.showInviteResult];

export const SCHEDULE_TOOLS: ToolDefinition[] = [
  {
    name: SCHEDULE_TOOL.pickAttendees,
    description: '조직도에서 회의 참석자를 고르게 하고, 고른 사람 id를 돌려받는다.',
    parameters: { type: 'object', required: ['people', 'selected'] },
  },
  {
    name: SCHEDULE_TOOL.showCommonTimes,
    description: '참석자들의 공통 빈 시간을 히트맵과 추천 후보로 보여 주고, 고른 시간을 돌려받는다.',
    parameters: { type: 'object', required: ['attendees', 'days', 'candidates'] },
  },
  {
    name: SCHEDULE_TOOL.pickMeetingRoom,
    description: '고른 시간에 쓸 수 있는 회의실을 보여 주고, 고른 회의실(또는 회의실 없음)을 돌려받는다.',
    parameters: { type: 'object', required: ['rooms'] },
  },
  {
    name: SCHEDULE_TOOL.confirmInvite,
    description: '초대 내용을 보여 주고 보내기 전 최종 확인을 받는다.',
    parameters: { type: 'object', required: ['title', 'date', 'start', 'end', 'attendees'] },
  },
  {
    name: SCHEDULE_TOOL.showInviteResult,
    description: '등록한 일정과 보낸 초대를 요약 카드로 보여 준다.',
    parameters: { type: 'object', required: ['event'] },
  },
];
