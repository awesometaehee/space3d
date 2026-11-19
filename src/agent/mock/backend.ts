import { ApprovalStore } from '../../data/approvals';
import { CalendarStore } from '../../data/calendar';
import { LeaveStore } from '../../data/leave';
import { BookingStore } from '../../data/meetingRooms';
import { emptyState, type AgentState } from '../state';

/**
 * 가상 그룹웨어 백엔드. 업무 영역마다 저장소를 하나씩 둔다.
 * 실제 연동 시에는 에이전트 서버가 그룹웨어 API를 사용자 본인의 권한으로 부른다.
 */
export class GroupwareBackend {
  readonly rooms = new BookingStore();
  readonly approvals: ApprovalStore;
  readonly calendar: CalendarStore;
  readonly leave: LeaveStore;

  constructor(now: () => Date = () => new Date()) {
    this.approvals = new ApprovalStore(now);
    this.calendar = new CalendarStore(now);
    this.leave = new LeaveStore(now);
  }

  /** 화면이 처음 열릴 때의 공유 상태 (AG-UI STATE_SNAPSHOT에 해당) */
  initialState(): AgentState {
    return emptyState();
  }
}
