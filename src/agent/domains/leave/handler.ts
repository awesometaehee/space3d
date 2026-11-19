import { LEAVE_LINE } from '../../../data/approvals';
import { DIRECTORY, ME_ID, businessDays, colleagueById } from '../../../data/calendar';
import { leaveDays, type LeaveKind } from '../../../data/leave';
import { dateKey, formatDate, type DateKey } from '../../../data/meetingRooms';
import type { AgUiEvent } from '../../agui';
import type { HandlerContext, MockHandler } from '../../mock/types';
import { addDays } from '../../parse';
import { matchLeave, matchLeaveFollowUp, parseLeave } from './intent';
import {
  LEAVE_TOOL,
  type AttendanceArgs,
  type LeaveRequestArgs,
  type LeaveRequestResult,
  type LeaveResultArgs,
  type LeaveStatusArgs,
} from './tools';

const MY_TEAM = '플랫폼팀';
/** 대결자는 내 팀 책임급 이상에서 고른다 */
const DELEGATE_TITLES = ['수석', '책임'];

const nameOf = (id: string) => colleagueById(id)?.name ?? id;

export function periodLabel(dates: DateKey[]): string {
  if (dates.length === 1) return formatDate(dates[0]);
  return `${formatDate(dates[0])} ~ ${formatDate(dates[dates.length - 1])} (${dates.length}일)`;
}

export function requestArgs(ctx: HandlerContext, kind: LeaveKind, dates: DateKey[]): LeaveRequestArgs {
  const store = ctx.backend.leave;
  const awayIds = new Set(dates.flatMap((d) => store.awayOn(d).map((r) => r.personId)));
  const delegates = DIRECTORY.filter((c) => c.team === MY_TEAM && DELEGATE_TITLES.includes(c.title)).map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    away: awayIds.has(c.id),
  }));
  return {
    kind: dates.length > 1 ? '연차' : kind,
    dates,
    dateLabels: dates.map(formatDate),
    balance: store.balance(),
    delegates,
    delegateId: delegates.find((d) => !d.away)?.id ?? null,
    teamAway: dates
      .map((date) => {
        const away = store.awayOn(date);
        return { date, label: formatDate(date), names: away.map((r) => nameOf(r.personId)), ids: away.map((r) => r.personId) };
      })
      .filter((d) => d.names.length),
    myEvents: dates
      .map((date) => ({ date, label: formatDate(date), count: ctx.backend.calendar.countBusy(ME_ID, date) }))
      .filter((d) => d.count > 0),
    line: LEAVE_LINE,
  };
}

function statusArgs(ctx: HandlerContext): LeaveStatusArgs {
  const store = ctx.backend.leave;
  const today = dateKey(ctx.now);
  const until = businessDays(addDays(ctx.now, 1), 10).at(-1) ?? today;
  const byDate = new Map<DateKey, LeaveStatusArgs['team'][number]>();
  for (const r of store.teamAway(today, until)) {
    const row = byDate.get(r.date) ?? { date: r.date, label: formatDate(r.date), people: [] };
    row.people.push({ name: nameOf(r.personId), kind: r.kind });
    byDate.set(r.date, row);
  }
  return {
    balance: store.balance(),
    mine: store.mine().map((r) => ({ date: r.date, label: formatDate(r.date), kind: r.kind, status: r.status })),
    team: [...byDate.values()],
  };
}

function attendanceArgs(ctx: HandlerContext): AttendanceArgs {
  const days = ctx.backend.leave.week().map((d) => ({ ...d, label: formatDate(d.date) }));
  return { days, totalMin: days.reduce((n, d) => n + d.minutes, 0), standardMin: 40 * 60, limitMin: 52 * 60 };
}

const hours = (min: number) => `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}`;

/** 휴가·근태 모의 처리기 */
export const leaveHandler: MockHandler = {
  id: 'leave',
  tools: new Set(Object.values(LEAVE_TOOL)),
  match(text, state) {
    return Math.max(matchLeave(text), state.activeDomain === 'leave' ? matchLeaveFollowUp(text) : 0);
  },

  async *onUser(text, ctx) {
    const intent = parseLeave(text, ctx.now);

    if (intent.kind === 'attendance') {
      const args = attendanceArgs(ctx);
      const left = args.limitMin - args.totalMin;
      yield* ctx.say(
        `이번 주 지금까지 ${hours(args.totalMin)} 일했어요. 주 52시간까지 ${hours(Math.max(0, left))} 남았어요. 오늘은 아직 퇴근 기록 전이라 지금 시각까지로 셌어요.`,
      );
      yield* ctx.callTool(LEAVE_TOOL.attendance, args);
      return;
    }

    if (intent.kind === 'status') {
      const args = statusArgs(ctx);
      yield* ctx.say(
        `올해 연차 ${args.balance.total}일 중 ${args.balance.used}일을 썼고, ${args.balance.remaining}일 남았어요.` +
          (args.team.length ? ` 앞으로 2주 동안 팀 부재 일정도 함께 보여 드릴게요.` : ''),
      );
      yield* ctx.callTool(LEAVE_TOOL.status, args);
      return;
    }

    const notes: string[] = [];
    if (intent.mentionedReason) notes.push('휴가 사유는 적지 않아도 돼요. 건강 관련 내용은 기록하지 않고 연차로만 올릴게요.');
    if (!intent.dates.length) {
      yield* ctx.say(
        [...notes, '언제 쉬실지 날짜를 알려 주세요. 예: "금요일 연차", "26~27일 휴가", "내일 오전 반차"'].join(' '),
      );
      return;
    }
    const args = requestArgs(ctx, intent.leave, intent.dates);
    if (intent.halfGuessed && args.kind !== '연차') notes.push('반차는 오후로 잡았어요. 카드에서 바꿀 수 있어요.');
    if (intent.leave !== '연차' && args.kind === '연차') notes.push('반차는 하루만 신청할 수 있어서 연차로 바꿨어요.');
    const away = args.teamAway.flatMap((d) => d.names);
    if (away.length) notes.push(`그날 팀에서 ${[...new Set(away)].join('·')}님도 부재예요.`);
    if (args.myEvents.length) notes.push(`그날 내 일정이 ${args.myEvents.reduce((n, d) => n + d.count, 0)}건 있어요.`);
    yield* ctx.say(
      `${periodLabel(args.dates)} ${args.kind} 신청서를 만들었어요. ${notes.join(' ')} 대결자를 확인하고 상신해 주세요.`.replace(/\s+/g, ' '),
    );
    yield* ctx.callTool(LEAVE_TOOL.request, args);
  },

  async *onToolResult(toolName, result, ctx): AsyncGenerator<AgUiEvent> {
    if (toolName !== LEAVE_TOOL.request) return;
    const r = result as LeaveRequestResult;
    if ('cancelled' in r) return yield* ctx.say('휴가 신청을 취소했어요.');
    const draft = ctx.lastArgs<LeaveRequestArgs>(LEAVE_TOOL.request);
    if (!draft) return yield* ctx.say('신청서 내용을 찾지 못했어요. 다시 말씀해 주세요.');

    let records;
    try {
      records = ctx.backend.leave.request(r.kind, draft.dates, r.delegateId);
    } catch (error) {
      yield* ctx.say(`상신하지 못했어요: ${(error as Error).message}`);
      return;
    }
    const days = leaveDays(r.kind) * draft.dates.length;
    const period = periodLabel(draft.dates);
    const drafted = ctx.backend.approvals.submitLeave(
      r.kind === '연차' ? `연차 ${draft.dates.length}일` : r.kind,
      r.kind === '연차' ? `${days}일` : '0.5일',
    );
    const approver = drafted.line.find((s) => s.status === 'current')?.person;
    yield { type: 'STATE_DELTA', delta: records.map((value) => ({ op: 'add' as const, path: '/leave/submitted/-', value })) };
    const args: LeaveResultArgs = {
      records,
      kind: r.kind,
      periodLabel: period,
      number: drafted.number,
      approver: approver ? `${approver.name} ${approver.title}` : '',
      delegate: `${nameOf(r.delegateId)} ${colleagueById(r.delegateId)?.title ?? ''}`.trim(),
      remaining: ctx.backend.leave.balance().remaining,
    };
    yield* ctx.say(
      `${period} ${r.kind}를 상신했어요.${args.approver ? ` ${args.approver}이 결재할 차례예요.` : ''} 결재함의 "내가 올린 문서"에서도 볼 수 있어요.`,
    );
    yield* ctx.callTool(LEAVE_TOOL.result, args);
  },
};
