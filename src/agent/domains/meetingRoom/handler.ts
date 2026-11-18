import { MEETING_ROOMS, formatDate, roomById } from '../../../data/meetingRooms';
import type { AgUiEvent } from '../../agui';
import type { HandlerContext, MockHandler } from '../../mock/types';
import { PERIOD_LABEL, formatDuration, matchMeetingRoom, parseIntent, type BookingRequest } from './intent';
import {
  ROOM_TOOL,
  type ConfirmBookingArgs,
  type ConfirmBookingResult,
  type ShowBookingResultArgs,
  type ShowRoomOptionsArgs,
  type ShowRoomOptionsResult,
  type ShowTimeSlotsArgs,
  type ShowTimeSlotsResult,
} from './tools';

function roomOptions(ctx: HandlerContext, req: BookingRequest): ShowRoomOptionsArgs {
  const store = ctx.backend.rooms;
  return {
    date: req.date,
    dateLabel: formatDate(req.date),
    period: req.period,
    people: req.people,
    durationMin: req.durationMin,
    rooms: MEETING_ROOMS.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      equipment: r.equipment,
      fits: r.capacity >= req.people,
      freeSlots: store.slots(r.id, req.date, req.period, req.durationMin).filter((s) => s.available).length,
    })),
  };
}

function timeSlots(ctx: HandlerContext, req: BookingRequest, roomId: string): ShowTimeSlotsArgs {
  return {
    roomId,
    roomName: roomById(roomId)?.name ?? roomId,
    date: req.date,
    dateLabel: formatDate(req.date),
    durationMin: req.durationMin,
    slots: ctx.backend.rooms.slots(roomId, req.date, req.period, req.durationMin),
  };
}

async function* cancelled(ctx: HandlerContext): AsyncGenerator<AgUiEvent> {
  yield { type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/meetingRoom/request', value: null }] };
  yield* ctx.say('예약을 취소했어요. 필요하면 다시 말씀해 주세요.');
}

/** 회의실 예약 모의 처리기 */
export const meetingRoomHandler: MockHandler = {
  id: 'meetingRoom',
  tools: new Set(Object.values(ROOM_TOOL)),
  match: (text) => matchMeetingRoom(text),

  async *onUser(text, ctx) {
    const intent = parseIntent(text, ctx.now);
    const r = intent.request;
    yield { type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/meetingRoom/request', value: r }] };
    const options = roomOptions(ctx, r);
    const fitting = options.rooms.filter((room) => room.fits && room.freeSlots > 0);
    const assumed = [
      intent.defaulted.includes('date') && '날짜(오늘)',
      intent.defaulted.includes('people') && `인원(${r.people}명)`,
      intent.defaulted.includes('duration') && `회의 길이(${formatDuration(r.durationMin)})`,
    ].filter(Boolean);
    let reply = `${options.dateLabel} ${PERIOD_LABEL[r.period]} ${r.people}명, ${formatDuration(r.durationMin)} 회의할 곳을 찾아봤어요. `;
    if (assumed.length) reply += `말씀이 없던 ${assumed.join('·')}은 기본값으로 잡았어요. `;
    reply += fitting.length
      ? `${fitting.length}곳이 가능해요. 카드나 화면 속 회의실을 눌러 골라 주세요.`
      : '조건에 맞는 빈 회의실이 없어요. 인원이나 시간대를 바꿔서 다시 말씀해 주세요.';
    yield* ctx.say(reply);
    if (fitting.length) yield* ctx.callTool(ROOM_TOOL.showRoomOptions, options);
  },

  async *onToolResult(toolName, result, ctx) {
    const req = ctx.state.meetingRoom.request;
    if (!req) {
      yield* ctx.say('진행 중인 예약 요청을 찾지 못했어요. 처음부터 다시 말씀해 주세요.');
      return;
    }

    if (toolName === ROOM_TOOL.showRoomOptions) {
      const r = result as ShowRoomOptionsResult;
      if ('cancelled' in r) return yield* cancelled(ctx);
      const args = timeSlots(ctx, req, r.roomId);
      yield* ctx.say(`${args.roomName}의 빈 시간이에요. 원하는 시간을 골라 주세요.`);
      yield* ctx.callTool(ROOM_TOOL.showTimeSlots, args);
      return;
    }

    if (toolName === ROOM_TOOL.showTimeSlots) {
      const r = result as ShowTimeSlotsResult;
      if ('cancelled' in r) return yield* cancelled(ctx);
      if ('back' in r) {
        yield* ctx.say('다른 회의실을 다시 보여 드릴게요.');
        yield* ctx.callTool(ROOM_TOOL.showRoomOptions, roomOptions(ctx, req));
        return;
      }
      const roomId = ctx.lastArgs<ShowTimeSlotsArgs>(ROOM_TOOL.showTimeSlots)?.roomId;
      if (!roomId) return yield* ctx.say('선택한 회의실을 찾지 못했어요. 다시 시도해 주세요.');
      const args: ConfirmBookingArgs = {
        roomId,
        roomName: roomById(roomId)?.name ?? roomId,
        date: req.date,
        dateLabel: formatDate(req.date),
        start: r.start,
        end: r.end,
        people: req.people,
        title: '팀 회의',
      };
      yield* ctx.say('이대로 예약할까요? 회의 제목은 바꿀 수 있어요.');
      yield* ctx.callTool(ROOM_TOOL.confirmBooking, args);
      return;
    }

    if (toolName === ROOM_TOOL.confirmBooking) {
      const r = result as ConfirmBookingResult;
      if (!r.confirmed) return yield* cancelled(ctx);
      const draft = ctx.lastArgs<ConfirmBookingArgs>(ROOM_TOOL.confirmBooking);
      if (!draft) return yield* ctx.say('확인할 예약 내용을 찾지 못했어요. 다시 시도해 주세요.');
      let booking;
      try {
        booking = ctx.backend.rooms.book({
          roomId: draft.roomId,
          date: draft.date,
          start: draft.start,
          end: draft.end,
          title: r.title.trim() || draft.title,
        });
      } catch (error) {
        yield* ctx.say(`예약하지 못했어요: ${(error as Error).message} 다른 시간을 골라 주세요.`);
        yield* ctx.callTool(ROOM_TOOL.showTimeSlots, timeSlots(ctx, req, draft.roomId));
        return;
      }
      yield {
        type: 'STATE_DELTA',
        delta: [
          { op: 'add', path: '/meetingRoom/bookings/-', value: booking },
          { op: 'replace', path: '/meetingRoom/request', value: null },
        ],
      };
      const args: ShowBookingResultArgs = { booking, roomName: draft.roomName, dateLabel: draft.dateLabel };
      yield* ctx.say(`${draft.roomName} ${draft.start}–${draft.end} 예약을 마쳤어요.`);
      yield* ctx.callTool(ROOM_TOOL.showBookingResult, args);
    }
    // 표시용 도구의 응답 등은 따로 답하지 않는다
  },
};
