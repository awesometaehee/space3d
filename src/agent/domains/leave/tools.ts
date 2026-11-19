import type { LineStep } from '../../../data/approvals';
import type { LeaveBalance, LeaveKind, LeaveRecord, WorkDay } from '../../../data/leave';
import type { DateKey } from '../../../data/meetingRooms';
import type { ToolDefinition } from '../../agui';

/**
 * 휴가·근태 영역의 화면 도구.
 * 휴가 신청은 전자결재(휴가신청)로 상신된다. 사유 칸은 두지 않는다.
 */

export interface LeaveRequestArgs {
  kind: LeaveKind;
  dates: DateKey[];
  dateLabels: string[];
  balance: LeaveBalance;
  /** 대결자 후보 (내 팀 책임급 이상). away: 신청한 날 중 하루라도 부재 */
  delegates: Array<{ id: string; name: string; title: string; away: boolean }>;
  delegateId: string | null;
  /** 신청한 날마다 이미 부재인 팀원 */
  teamAway: Array<{ date: DateKey; label: string; names: string[]; ids: string[] }>;
  /** 신청한 날마다 내 일정 수 (제목은 보여 주지 않는다) */
  myEvents: Array<{ date: DateKey; label: string; count: number }>;
  line: LineStep[];
}
export type LeaveRequestResult = { submitted: true; kind: LeaveKind; delegateId: string } | { cancelled: true };

export interface LeaveResultArgs {
  records: LeaveRecord[];
  kind: LeaveKind;
  periodLabel: string;
  number: string;
  /** 결재 차례인 사람 "가람 본부장" */
  approver: string;
  delegate: string;
  remaining: number;
}

export interface LeaveStatusArgs {
  balance: LeaveBalance;
  mine: Array<{ date: DateKey; label: string; kind: LeaveKind; status: LeaveRecord['status'] }>;
  /** 앞으로 2주 팀원 부재 (사유 없이) */
  team: Array<{ date: DateKey; label: string; people: Array<{ name: string; kind: LeaveKind }> }>;
}

export interface AttendanceArgs {
  days: Array<WorkDay & { label: string }>;
  totalMin: number;
  /** 주 소정 근로 40시간 */
  standardMin: number;
  /** 주 최대 52시간 */
  limitMin: number;
}

export const LEAVE_TOOL = {
  request: 'leave_request',
  result: 'show_leave_result',
  status: 'show_leave_status',
  attendance: 'show_attendance',
} as const;

export const LEAVE_DISPLAY_ONLY = [LEAVE_TOOL.result, LEAVE_TOOL.status, LEAVE_TOOL.attendance];

export const LEAVE_TOOLS: ToolDefinition[] = [
  {
    name: LEAVE_TOOL.request,
    description: '휴가 신청서(종류·날짜·잔여 연차·대결자·팀 부재·결재선)를 보여 주고 상신 확인을 받는다.',
    parameters: { type: 'object', required: ['kind', 'dates', 'balance', 'delegates'] },
  },
  {
    name: LEAVE_TOOL.result,
    description: '상신한 휴가신청을 요약 카드로 보여 준다.',
    parameters: { type: 'object', required: ['records', 'number'] },
  },
  {
    name: LEAVE_TOOL.status,
    description: '내 연차 현황과 앞으로의 팀 부재 일정을 보여 준다.',
    parameters: { type: 'object', required: ['balance'] },
  },
  {
    name: LEAVE_TOOL.attendance,
    description: '이번 주 내 출퇴근 기록과 근무시간을 보여 준다.',
    parameters: { type: 'object', required: ['days', 'totalMin'] },
  },
];
