import type { Booking } from '../data/meetingRooms';
import { CLOSED_VIEW, type ApprovalView } from './domains/approval/view';
import type { BookingRequest } from './domains/meetingRoom/intent';
import type { ScheduleRequest, ScheduleStage } from './domains/schedule/intent';
import type { CalendarEvent } from '../data/calendar';
import type { LeaveRecord } from '../data/leave';

/**
 * 에이전트와 화면이 함께 보는 공유 상태 (AG-UI STATE_SNAPSHOT / STATE_DELTA).
 * 업무 영역마다 한 칸씩 둔다. 업무 데이터 자체(결재 문서 등)는 여기 두지 않고 그룹웨어 API에서 읽는다.
 * 여기에는 "지금 무엇을 하고 있고, 화면이 무엇을 보여 주는지"만 둔다.
 */
export interface AgentState {
  /**
   * 에이전트가 지금 처리 중인 업무 영역 id (없으면 null).
   * 화면은 이것으로 레이아웃을 정한다: 공간 업무면 복셀 중심, 아니면 넓은 패널.
   */
  activeDomain: string | null;
  meetingRoom: {
    /** 이번 대화에서 만든 예약 */
    bookings: Booking[];
    /** 진행 중인 요청. 여러 번의 실행(run)에 걸쳐 이어진다 */
    request: BookingRequest | null;
  };
  schedule: {
    /** 진행 중인 일정 조율 (참석자·기간·고른 시간·회의실) */
    request: ScheduleRequest | null;
    /** 지금 단계. 회의실을 고를 때만 복셀 중심 레이아웃이 된다 */
    stage: ScheduleStage;
    /** 이번 대화에서 등록한 일정 */
    events: CalendarEvent[];
  };
  leave: {
    /** 이번 대화에서 상신한 내 휴가 */
    submitted: LeaveRecord[];
  };
  approval: {
    /** 결재함 작업 화면의 보기 상태 (화면과 에이전트가 함께 바꾼다) */
    view: ApprovalView;
  };
}

export function emptyState(): AgentState {
  return {
    activeDomain: null,
    meetingRoom: { bookings: [], request: null },
    schedule: { request: null, stage: null, events: [] },
    leave: { submitted: [] },
    approval: { view: CLOSED_VIEW },
  };
}
