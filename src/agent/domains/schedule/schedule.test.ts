import { describe, expect, it } from 'vitest';
import { isSpatial } from '../../catalog';
import { NOW, setup } from '../../testing';
import { matchSchedule, parseSchedule } from './intent';
import { matchMeetingRoom } from '../meetingRoom/intent';
import {
  SCHEDULE_TOOL,
  type ConfirmInviteArgs,
  type PickAttendeesArgs,
  type PickMeetingRoomArgs,
  type ShowCommonTimesArgs,
} from './tools';

describe('일정 요청 해석', () => {
  it('팀·기간·길이를 읽는다', () => {
    const p = parseSchedule('다음 주 기획팀이랑 1시간 회의 잡아줘', NOW);
    expect(p.teams).toEqual(['기획팀']);
    expect(p.attendeeIds).toEqual(['p1', 'p2', 'p3']);
    expect(p.dates).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']);
    expect(p.durationMin).toBe(60);
  });

  it('이름과 요일을 읽는다', () => {
    const p = parseSchedule('한결님, 아름 수석이랑 금요일 오후 30분 리뷰', NOW);
    expect(p.attendeeIds.sort()).toEqual(['d1', 'p1']);
    expect(p.dates).toEqual(['2026-11-20']);
    expect(p.period).toBe('afternoon');
    expect(p.durationMin).toBe(30);
    expect(p.title).toBe('리뷰');
  });

  it('낱말 안의 이름은 사람으로 보지 않는다', () => {
    expect(parseSchedule('아름다운 한결같은 새벽에 회의', NOW).attendeeIds).toEqual([]);
  });

  it('사람과 잡는 회의는 회의실 예약보다 일정 조율이 맡는다', () => {
    const text = '다음 주 기획팀이랑 회의 잡아줘';
    expect(matchSchedule(text)).toBeGreaterThan(matchMeetingRoom(text));
    expect(matchSchedule('내일 오후 4명 회의실 잡아줘')).toBe(0);
  });
});

describe('일정 조율 흐름', () => {
  it('공통 빈 시간 → 회의실 → 초대 확인 → 등록까지 진행한다', async () => {
    const t = setup();
    await t.say('다음 주 기획팀이랑 1시간 회의 잡아줘');
    expect(t.c.state.activeDomain).toBe('schedule');
    expect(t.c.state.schedule.stage).toBe('time');
    expect(isSpatial(t.c.state)).toBe(false); // 시간 찾기는 넓은 패널
    expect(t.card?.function.name).toBe(SCHEDULE_TOOL.showCommonTimes);

    const times = t.args<ShowCommonTimesArgs>();
    expect(times.total).toBe(4);
    expect(times.days).toHaveLength(5);
    expect(times.days.every((d) => d.free.length === 18)).toBe(true);
    expect(times.candidates.length).toBeGreaterThan(0);
    // 모두 되는 후보가 앞에 온다
    const missing = times.candidates.map((c) => c.missing.length);
    expect([...missing].sort((a, b) => a - b)).toEqual(missing);
    const pick = times.candidates[0];
    // 추천 후보는 실제로 그 사람들 일정과 맞는다
    expect(t.backend.calendar.isFree('me', pick.date, pick.start, pick.end)).toBe(true);
    for (const c of times.attendees) {
      expect(t.backend.calendar.isFree(c.id, pick.date, pick.start, pick.end)).toBe(!pick.missing.includes(c.name));
    }

    await t.answer({ date: pick.date, start: pick.start, end: pick.end });
    expect(t.c.state.schedule.stage).toBe('room');
    expect(isSpatial(t.c.state)).toBe(true); // 회의실을 고를 때는 복셀 중심
    expect(t.card?.function.name).toBe(SCHEDULE_TOOL.pickMeetingRoom);
    const rooms = t.args<PickMeetingRoomArgs>();
    expect(rooms.people).toBe(4);
    const room = rooms.rooms.find((r) => r.fits && r.free);

    await t.answer({ roomId: room?.id ?? null });
    expect(t.card?.function.name).toBe(SCHEDULE_TOOL.confirmInvite);
    const invite = t.args<ConfirmInviteArgs>();
    expect(invite.attendees.map((c) => c.id)).toEqual(['p1', 'p2', 'p3']);
    expect(invite.roomId).toBe(room?.id ?? null);

    await t.answer({ confirmed: true, title: '기획 협의', note: '' });
    expect(t.card?.function.name).toBe(SCHEDULE_TOOL.showInviteResult);
    expect(t.c.state.schedule.request).toBeNull();
    expect(t.c.state.schedule.stage).toBeNull();
    expect(t.c.state.schedule.events[0]).toMatchObject({ title: '기획 협의', date: pick.date, start: pick.start });
    // 등록한 뒤에는 참석자 모두 그 시간이 바쁘다
    expect(t.backend.calendar.isFree('p1', pick.date, pick.start, pick.end)).toBe(false);
    if (room) {
      expect(t.c.state.meetingRoom.bookings[0]).toMatchObject({ roomId: room.id, title: '기획 협의' });
      expect(t.backend.rooms.isFree(room.id, pick.date, pick.start, pick.end)).toBe(false);
    }
  });

  it('참석자를 말하지 않으면 참석자 카드부터 띄운다', async () => {
    const t = setup();
    await t.say('일정 조율해줘');
    expect(t.c.state.schedule.stage).toBe('attendees');
    expect(t.card?.function.name).toBe(SCHEDULE_TOOL.pickAttendees);
    expect(t.args<PickAttendeesArgs>().selected).toEqual([]);

    await t.answer({ attendeeIds: ['d1', 'd2'] });
    expect(t.card?.function.name).toBe(SCHEDULE_TOOL.showCommonTimes);
    expect(t.args<ShowCommonTimesArgs>().total).toBe(3);
  });

  it('조율 중에 조건만 말하면 참석자는 그대로 두고 다시 찾는다', async () => {
    const t = setup();
    await t.say('다음 주 디자인팀이랑 1시간 회의 잡아줘');
    await t.say('오전으로 30분만');
    const times = t.args<ShowCommonTimesArgs>();
    expect(times.attendees.map((c) => c.team)).toEqual(['디자인팀', '디자인팀', '디자인팀']);
    expect(times.durationMin).toBe(30);
    expect(times.candidates.every((c) => c.end <= '12:00')).toBe(true);
  });

  it('회의실 없이 진행할 수 있고, 취소하면 요청을 비운다', async () => {
    const t = setup();
    await t.say('다음 주 영업지원팀이랑 미팅');
    const c = t.args<ShowCommonTimesArgs>().candidates[0];
    await t.answer({ date: c.date, start: c.start, end: c.end });
    await t.answer({ roomId: null });
    expect(t.args<ConfirmInviteArgs>().roomName).toBeNull();
    expect(isSpatial(t.c.state)).toBe(false);
    await t.answer({ confirmed: false });
    expect(t.c.state.schedule.request).toBeNull();
    expect(t.card).toBeUndefined();
  });
});
