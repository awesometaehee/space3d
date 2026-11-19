import { ApprovalStore } from '../../data/approvals';
import { CalendarStore } from '../../data/calendar';
import { LeaveStore } from '../../data/leave';
import { SEATED_TEAM, otherPresence } from '../../data/people';
import { colleagueById } from '../../data/calendar';
import { dateKey } from '../../data/meetingRooms';
import type { Member, PresenceStatus } from '../../data/presence';
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

  private readonly presence = new Map<string, PresenceStatus>();

  constructor(private readonly now: () => Date = () => new Date()) {
    this.approvals = new ApprovalStore(now);
    this.calendar = new CalendarStore(now);
    this.leave = new LeaveStore(now);
  }

  /** 재실 상태 받기 (지금은 화면의 가상 재실 구독을 그대로 넘겨받는다. 실제로는 재실 API) */
  setPresence(members: Member[]): void {
    this.presence.clear();
    for (const m of members) this.presence.set(m.id, m.status);
  }

  /** 지금 재실 상태. 오늘 휴가면 부재 (사유 없이) */
  statusOf(id: string): PresenceStatus {
    const today = dateKey(this.now());
    if (this.leave.awayOn(today).some((r) => r.personId === id && r.kind === '연차')) return 'away';
    if (colleagueById(id)?.team === SEATED_TEAM) return this.presence.get(id) ?? 'working';
    return otherPresence(id);
  }

  /** 화면이 처음 열릴 때의 공유 상태 (AG-UI STATE_SNAPSHOT에 해당) */
  initialState(): AgentState {
    return emptyState();
  }
}
