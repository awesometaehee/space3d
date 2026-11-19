import { roomById } from '../../../data/meetingRooms';
import type { DomainUI, SceneHint } from '../../domain';
import { SCHEDULE_CARDS } from './cards';
import { SCHEDULE_DISPLAY_ONLY, SCHEDULE_TOOL, SCHEDULE_TOOLS, type PickMeetingRoomArgs, type ShowInviteResultArgs } from './tools';

/**
 * 일정 조율: 화면 쪽 묶음.
 * 시간 찾기(히트맵)는 넓은 패널이 좋고, 회의실을 고를 때만 복셀이 필요하다.
 * 그래서 공간 업무 여부를 영역 전체가 아니라 지금 단계(schedule.stage)로 정한다.
 */
export const scheduleUI: DomainUI = {
  id: 'schedule',
  tools: SCHEDULE_TOOLS,
  cards: SCHEDULE_CARDS,
  displayOnly: SCHEDULE_DISPLAY_ONLY,
  spatial: (state) => state.schedule.stage === 'room' || (state.schedule.stage === 'confirm' && !!state.schedule.request?.roomId),
  scene(call, args, streaming): SceneHint | null {
    const hint: SceneHint = { candidates: [], active: null, focus: [], pickCallId: null };
    if (call.function.name === SCHEDULE_TOOL.pickMeetingRoom) {
      const rooms = ((args as Partial<PickMeetingRoomArgs> | undefined)?.rooms ?? []).filter(
        (r) => r && r.fits === true && r.free === true && roomById(r.id),
      );
      hint.candidates = rooms.map((r) => r.id);
      hint.focus = hint.candidates;
      if (!streaming) hint.pickCallId = call.id;
      return hint;
    }
    if (call.function.name === SCHEDULE_TOOL.confirmInvite && typeof args?.roomId === 'string' && roomById(args.roomId)) {
      hint.active = args.roomId;
      hint.focus = [args.roomId];
      return hint;
    }
    if (call.function.name === SCHEDULE_TOOL.showInviteResult) {
      const roomId = (args as Partial<ShowInviteResultArgs> | undefined)?.event?.roomId;
      if (roomId) hint.focus = [roomId];
      return hint;
    }
    return null;
  },
};
