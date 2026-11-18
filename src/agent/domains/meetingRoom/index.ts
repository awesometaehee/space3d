import { roomById } from '../../../data/meetingRooms';
import type { DomainUI, SceneHint } from '../../domain';
import { ROOM_CARDS } from './cards';
import { ROOM_DISPLAY_ONLY, ROOM_TOOL, ROOM_TOOLS, type ShowBookingResultArgs, type ShowRoomOptionsArgs } from './tools';

/** 회의실 예약: 화면 쪽 묶음 */
export const meetingRoomUI: DomainUI = {
  id: 'meetingRoom',
  tools: ROOM_TOOLS,
  cards: ROOM_CARDS,
  displayOnly: ROOM_DISPLAY_ONLY,
  scene(call, args, streaming): SceneHint | null {
    const hint: SceneHint = { candidates: [], active: null, focus: [], pickCallId: null };
    if (call.function.name === ROOM_TOOL.showRoomOptions) {
      const rooms = ((args as Partial<ShowRoomOptionsArgs> | undefined)?.rooms ?? []).filter(
        (r) => r && typeof r.freeSlots === 'number' && r.fits && r.freeSlots > 0 && roomById(r.id),
      );
      hint.candidates = rooms.map((r) => r.id);
      hint.focus = hint.candidates;
      if (!streaming) hint.pickCallId = call.id;
      return hint;
    }
    if (call.function.name === ROOM_TOOL.showBookingResult) {
      const roomId = (args as Partial<ShowBookingResultArgs> | undefined)?.booking?.roomId;
      if (roomId) hint.focus = [roomId];
      return hint;
    }
    // 시간 선택·확인 카드: 보고 있는 방
    if (typeof args?.roomId === 'string' && roomById(args.roomId)) {
      hint.active = args.roomId;
      hint.focus = [args.roomId];
      return hint;
    }
    return null;
  },
};
