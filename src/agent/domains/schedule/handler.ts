import { DAY_CLOSE, DAY_OPEN, DIRECTORY, LUNCH, ME_ID, colleagueById, type Colleague } from '../../../data/calendar';
import { MEETING_ROOMS, formatDate, roomById, toMinutes } from '../../../data/meetingRooms';
import type { AgUiEvent, JsonPatchOp } from '../../agui';
import type { HandlerContext, MockHandler } from '../../mock/types';
import { formatDuration, PERIOD_LABEL } from '../meetingRoom/intent';
import {
  buildRequest,
  matchSchedule,
  matchScheduleFollowUp,
  parseSchedule,
  type ScheduleRequest,
  type ScheduleStage,
} from './intent';
import {
  SCHEDULE_TOOL,
  type ConfirmInviteArgs,
  type ConfirmInviteResult,
  type PickAttendeesArgs,
  type PickAttendeesResult,
  type PickMeetingRoomArgs,
  type PickMeetingRoomResult,
  type ShowCommonTimesArgs,
  type ShowCommonTimesResult,
  type ShowInviteResultArgs,
  type TimeCandidate,
} from './tools';

/** 추천 후보 수와 하루에 넣을 최대 후보 수 */
const MAX_CANDIDATES = 6;
const PER_DAY = 2;

const people = (ids: string[]) => ids.map(colleagueById).filter((c): c is Colleague => !!c);

function patch(ops: JsonPatchOp[]): AgUiEvent {
  return { type: 'STATE_DELTA', delta: ops };
}
const setStage = (stage: ScheduleStage) => patch([{ op: 'replace', path: '/schedule/stage', value: stage }]);
const setRequest = (req: ScheduleRequest | null) => patch([{ op: 'replace', path: '/schedule/request', value: req }]);

function periodRange(req: ScheduleRequest): [number, number] {
  if (req.period === 'morning') return [DAY_OPEN, LUNCH[0]];
  if (req.period === 'afternoon') return [LUNCH[1], DAY_CLOSE];
  return [DAY_OPEN, DAY_CLOSE];
}

/** 참석자 공통 빈 시간: 히트맵 + 추천 후보 */
export function commonTimes(ctx: HandlerContext, req: ScheduleRequest): ShowCommonTimesArgs {
  const cal = ctx.backend.calendar;
  const ids = [ME_ID, ...req.attendeeIds];
  const names = new Map(people(req.attendeeIds).map((c) => [c.id, c.name]));
  names.set(ME_ID, '나');
  const [from, to] = periodRange(req);

  const all: TimeCandidate[] = req.dates.flatMap((date) =>
    cal.windows(ids, date, req.durationMin, from, to).map((w) => ({
      date,
      dateLabel: formatDate(date),
      start: w.start,
      end: w.end,
      missing: ids.filter((id) => !w.freeIds.includes(id)).map((id) => names.get(id) ?? id),
    })),
  );
  // 내가 안 되는 시간은 빼고, 빠지는 사람이 적은 순 → 이른 날짜·시간 순
  const ranked = all
    .filter((c) => !c.missing.includes('나') && c.missing.length <= Math.max(1, Math.floor(ids.length / 3)))
    .sort((a, b) => a.missing.length - b.missing.length || a.date.localeCompare(b.date) || toMinutes(a.start) - toMinutes(b.start));
  const perDay = new Map<string, number>();
  const candidates: TimeCandidate[] = [];
  for (const c of ranked) {
    if (candidates.length >= MAX_CANDIDATES) break;
    const n = perDay.get(c.date) ?? 0;
    // 바로 앞 후보와 겹치는 시간은 건너뛰어 고르게 퍼뜨린다
    if (n >= PER_DAY || candidates.some((x) => x.date === c.date && x.end > c.start && x.start < c.end)) continue;
    perDay.set(c.date, n + 1);
    candidates.push(c);
  }
  candidates.sort((a, b) => a.missing.length - b.missing.length || a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

  return {
    title: req.title,
    rangeLabel: req.rangeLabel,
    durationMin: req.durationMin,
    attendees: people(req.attendeeIds),
    total: ids.length,
    days: req.dates.map((date) => ({ date, label: formatDate(date), free: cal.dayCells(ids, date).free })),
    candidates,
  };
}

function roomChoices(ctx: HandlerContext, req: ScheduleRequest): PickMeetingRoomArgs {
  const slot = req.slot!;
  const total = req.attendeeIds.length + 1;
  return {
    dateLabel: formatDate(slot.date),
    start: slot.start,
    end: slot.end,
    people: total,
    rooms: MEETING_ROOMS.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      equipment: r.equipment,
      fits: r.capacity >= total,
      free: ctx.backend.rooms.isFree(r.id, slot.date, slot.start, slot.end),
    })),
  };
}

function inviteDraft(ctx: HandlerContext, req: ScheduleRequest): ConfirmInviteArgs {
  const slot = req.slot!;
  const attendees = people(req.attendeeIds);
  return {
    title: req.title,
    date: slot.date,
    dateLabel: formatDate(slot.date),
    start: slot.start,
    end: slot.end,
    roomId: req.roomId,
    roomName: req.roomId ? (roomById(req.roomId)?.name ?? req.roomId) : null,
    attendees,
    missing: attendees.filter((c) => !ctx.backend.calendar.isFree(c.id, slot.date, slot.start, slot.end)).map((c) => c.name),
  };
}

async function* askAttendees(ctx: HandlerContext, req: ScheduleRequest, lead: string): AsyncGenerator<AgUiEvent> {
  yield setRequest(req);
  yield setStage('attendees');
  yield* ctx.say(lead);
  const args: PickAttendeesArgs = { people: DIRECTORY, selected: req.attendeeIds };
  yield* ctx.callTool(SCHEDULE_TOOL.pickAttendees, args);
}

async function* showTimes(ctx: HandlerContext, req: ScheduleRequest, lead: string): AsyncGenerator<AgUiEvent> {
  yield setRequest(req);
  yield setStage('time');
  const args = commonTimes(ctx, req);
  const full = args.candidates.filter((c) => c.missing.length === 0).length;
  const scope = `${req.rangeLabel} ${req.period === 'any' ? '' : `${PERIOD_LABEL[req.period]} `}`;
  let reply = `${lead}${scope}${args.total}명(나 포함)이 ${formatDuration(req.durationMin)} 동안 모일 수 있는 시간을 찾았어요. `;
  if (full) reply += `모두 되는 후보가 ${full}개 있어요. 골라 주세요.`;
  else if (args.candidates.length) reply += '모두 되는 시간은 없어서, 빠지는 사람이 가장 적은 시간을 골랐어요.';
  else reply += '맞는 시간이 없어요. 기간이나 회의 길이를 바꿔서 말씀해 주세요.';
  yield* ctx.say(reply);
  if (args.candidates.length || args.days.some((d) => d.free.some((n) => n > 0))) {
    yield* ctx.callTool(SCHEDULE_TOOL.showCommonTimes, args);
  }
}

async function* cancelled(ctx: HandlerContext): AsyncGenerator<AgUiEvent> {
  yield setRequest(null);
  yield setStage(null);
  yield* ctx.say('일정 조율을 그만뒀어요. 필요하면 다시 말씀해 주세요.');
}

/** 일정 조율 모의 처리기 */
export const scheduleHandler: MockHandler = {
  id: 'schedule',
  tools: new Set(Object.values(SCHEDULE_TOOL)),
  match(text, state) {
    const following = state.activeDomain === 'schedule' && !!state.schedule.request;
    return Math.max(matchSchedule(text), following ? matchScheduleFollowUp(text) : 0);
  },

  async *onUser(text, ctx) {
    const prev = ctx.state.activeDomain === 'schedule' ? ctx.state.schedule.request : null;
    const parsed = parseSchedule(text, ctx.now);
    const req = buildRequest(parsed, ctx.now, prev);
    if (!req.attendeeIds.length) {
      return yield* askAttendees(ctx, req, '누구와 회의할지 알려 주세요. 이름이나 팀을 골라 주시면 빈 시간을 찾아볼게요.');
    }
    const names = people(req.attendeeIds);
    const who =
      parsed.teams.length && names.every((c) => parsed.teams.includes(c.team))
        ? parsed.teams.join('·')
        : names.length > 3
          ? `${names.slice(0, 3).map((c) => c.name).join('·')} 외 ${names.length - 3}명`
          : names.map((c) => c.name).join('·');
    yield* showTimes(ctx, req, `${who}${prev ? ', 바꾼 조건으로' : '과'} `);
  },

  async *onToolResult(toolName, result, ctx) {
    const req = ctx.state.schedule.request;
    if (!req) {
      yield* ctx.say('진행 중인 일정 조율을 찾지 못했어요. 처음부터 다시 말씀해 주세요.');
      return;
    }

    if (toolName === SCHEDULE_TOOL.pickAttendees) {
      const r = result as PickAttendeesResult;
      if ('cancelled' in r) return yield* cancelled(ctx);
      const next = { ...req, attendeeIds: r.attendeeIds.filter((id) => colleagueById(id)) };
      if (!next.attendeeIds.length) return yield* askAttendees(ctx, next, '한 명 이상 골라 주세요.');
      return yield* showTimes(ctx, next, `${next.attendeeIds.length}명을 넣어 `);
    }

    if (toolName === SCHEDULE_TOOL.showCommonTimes) {
      const r = result as ShowCommonTimesResult;
      if ('cancelled' in r) return yield* cancelled(ctx);
      if ('editAttendees' in r) return yield* askAttendees(ctx, req, '참석자를 바꿔 주세요.');
      const next: ScheduleRequest = { ...req, slot: { date: r.date, start: r.start, end: r.end }, roomId: null };
      // 회의실을 고르는 단계: 화면이 복셀 중심으로 바뀌고 쓸 수 있는 방이 강조된다
      yield setRequest(next);
      yield setStage('room');
      const args = roomChoices(ctx, next);
      const usable = args.rooms.filter((x) => x.fits && x.free).length;
      yield* ctx.say(
        usable
          ? `${args.dateLabel} ${r.start}–${r.end}로 할게요. 쓸 수 있는 회의실 ${usable}곳을 표시했어요. 회의실 없이 진행해도 돼요.`
          : `${args.dateLabel} ${r.start}–${r.end}에는 ${args.people}명이 들어갈 빈 회의실이 없어요. 회의실 없이 진행하거나 다른 시간을 골라 주세요.`,
      );
      yield* ctx.callTool(SCHEDULE_TOOL.pickMeetingRoom, args);
      return;
    }

    if (toolName === SCHEDULE_TOOL.pickMeetingRoom) {
      const r = result as PickMeetingRoomResult;
      if ('cancelled' in r) return yield* cancelled(ctx);
      if ('back' in r) return yield* showTimes(ctx, { ...req, slot: null }, '다시 ');
      const room = r.roomId ? roomById(r.roomId) : null;
      if (r.roomId && !room) return yield* ctx.say('고른 회의실을 찾지 못했어요. 다시 골라 주세요.');
      const next = { ...req, roomId: room?.id ?? null };
      yield setRequest(next);
      yield setStage('confirm');
      const args = inviteDraft(ctx, next);
      yield* ctx.say(
        `${room ? room.name : '회의실 없이'}로 할게요. 초대 내용을 확인해 주세요.${args.missing.length ? ` ${args.missing.join('·')}님은 이 시간에 다른 일정이 있어요.` : ''}`,
      );
      yield* ctx.callTool(SCHEDULE_TOOL.confirmInvite, args);
      return;
    }

    if (toolName === SCHEDULE_TOOL.confirmInvite) {
      const r = result as ConfirmInviteResult;
      if (!r.confirmed) return yield* cancelled(ctx);
      const draft = ctx.lastArgs<ConfirmInviteArgs>(SCHEDULE_TOOL.confirmInvite);
      if (!draft) return yield* ctx.say('확인할 초대 내용을 찾지 못했어요. 다시 시도해 주세요.');
      const title = r.title.trim() || draft.title;
      const ops: JsonPatchOp[] = [];
      if (draft.roomId) {
        try {
          const booking = ctx.backend.rooms.book({ roomId: draft.roomId, date: draft.date, start: draft.start, end: draft.end, title });
          ops.push({ op: 'add', path: '/meetingRoom/bookings/-', value: booking });
        } catch (error) {
          yield* ctx.say(`회의실을 잡지 못했어요: ${(error as Error).message} 다른 회의실을 골라 주세요.`);
          yield setStage('room');
          yield* ctx.callTool(SCHEDULE_TOOL.pickMeetingRoom, roomChoices(ctx, req));
          return;
        }
      }
      const event = ctx.backend.calendar.add({
        date: draft.date,
        start: draft.start,
        end: draft.end,
        title,
        attendeeIds: [ME_ID, ...draft.attendees.map((c) => c.id)],
        roomId: draft.roomId,
      });
      ops.push(
        { op: 'add', path: '/schedule/events/-', value: event },
        { op: 'replace', path: '/schedule/request', value: null },
        { op: 'replace', path: '/schedule/stage', value: null },
      );
      yield patch(ops);
      yield* ctx.say(
        `${draft.dateLabel} ${draft.start}–${draft.end} "${title}" 일정을 등록하고 ${draft.attendees.length}명에게 초대를 보냈어요.${draft.roomId ? ` ${draft.roomName}도 예약했어요.` : ''}`,
      );
      const args: ShowInviteResultArgs = { event, dateLabel: draft.dateLabel, roomName: draft.roomName, attendees: draft.attendees };
      yield* ctx.callTool(SCHEDULE_TOOL.showInviteResult, args);
    }
  },
};
