import { describe, expect, it } from 'vitest';
import { NOW, setup } from '../../testing';
import { parseIntent } from './intent';
import { ROOM_TOOL, type ShowRoomOptionsArgs, type ShowTimeSlotsArgs } from './tools';

describe('회의실 요청 해석', () => {
  it('날짜·시간대·인원·길이를 읽는다', () => {
    const r = parseIntent('내일 오후 6명 1시간 반 회의실 잡아줘', NOW);
    expect(r.request).toEqual({ date: '2026-11-19', period: 'afternoon', people: 6, durationMin: 90 });
    expect(r.defaulted).toEqual([]);
  });

  it('말하지 않은 값은 기본값으로 채우고 표시한다', () => {
    const r = parseIntent('회의실 예약', NOW);
    expect(r.request).toMatchObject({ date: '2026-11-18', period: 'any', people: 4, durationMin: 60 });
    expect(r.defaulted).toEqual(['date', 'people', 'duration']);
  });

  it('지난 날짜는 다음 달로 본다', () => {
    expect(parseIntent('3일 2명 미팅', NOW).request.date).toBe('2026-12-03');
    expect(parseIntent('11월 25일 회의', NOW).request.date).toBe('2026-11-25');
  });
});

describe('회의실 예약 흐름', () => {
  it('회의실 → 시간 → 확인 → 예약 완료까지 카드를 차례로 띄운다', async () => {
    const t = setup();
    await t.say('내일 오후 4명 회의실 잡아줘');
    expect(t.events[0].type).toBe('RUN_STARTED');
    expect(t.events.at(-1)?.type).toBe('RUN_FINISHED');
    expect(t.c.state.meetingRoom.request).toMatchObject({ date: '2026-11-19', people: 4 });
    expect(t.card?.function.name).toBe(ROOM_TOOL.showRoomOptions);
    const options = t.args<ShowRoomOptionsArgs>();
    expect(options.rooms.map((x) => x.id)).toEqual(['room-a', 'room-b', 'room-c']);
    const room = options.rooms.find((x) => x.fits && x.freeSlots > 0)!;

    await t.answer({ roomId: room.id });
    expect(t.card?.function.name).toBe(ROOM_TOOL.showTimeSlots);
    const slots = t.args<ShowTimeSlotsArgs>();
    expect(slots.slots.every((s) => s.start >= '13:00')).toBe(true); // 오후만
    const slot = slots.slots.find((s) => s.available)!;

    await t.answer({ start: slot.start, end: slot.end });
    expect(t.card?.function.name).toBe(ROOM_TOOL.confirmBooking);

    await t.answer({ confirmed: true, title: '주간 회의' });
    expect(t.card?.function.name).toBe(ROOM_TOOL.showBookingResult);
    expect(t.c.state.meetingRoom.bookings[0]).toMatchObject({ roomId: room.id, date: '2026-11-19', start: slot.start, title: '주간 회의' });
    expect(t.c.state.meetingRoom.request).toBeNull();
    expect(t.backend.rooms.isFree(room.id, '2026-11-19', slot.start, slot.end)).toBe(false);
  });

  it('취소하면 요청을 비우고 카드를 더 띄우지 않는다', async () => {
    const t = setup();
    await t.say('오늘 2명 회의실');
    await t.answer({ cancelled: true });
    expect(t.c.state.meetingRoom.request).toBeNull();
    expect(t.card).toBeUndefined();
  });

  it('인원이 너무 많으면 카드 없이 안내만 한다', async () => {
    const t = setup();
    await t.say('내일 20명 회의실');
    expect(t.calledTools()).toEqual([]);
    expect(t.text()).toContain('빈 회의실이 없어요');
  });
});
