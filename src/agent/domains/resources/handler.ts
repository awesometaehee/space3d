import { formatDate } from '../../../data/meetingRooms';
import {
  KIND_LABEL,
  RESOURCES,
  SLOT_LABEL,
  SLOT_TIME,
  resourceById,
  type ResourceKind,
  type ResourceSlot,
} from '../../../data/resources';
import type { AgUiEvent } from '../../agui';
import { josa } from '../../parse';
import type { HandlerContext, MockHandler } from '../../mock/types';
import { matchResources, parseResources, type ResourceRequest } from './intent';
import {
  RESOURCE_TOOL,
  type ConfirmResourceArgs,
  type ConfirmResourceResult,
  type MyReservationsArgs,
  type PickResourceArgs,
  type PickResourceResult,
  type ResourceResultArgs,
} from './tools';

const setRequest = (req: ResourceRequest | null): AgUiEvent => ({
  type: 'STATE_DELTA',
  delta: [{ op: 'replace', path: '/resources/request', value: req }],
});

const NOTES: Record<ResourceKind, string[]> = {
  vehicle: ['키는 안내 데스크에서 받아 가세요.', '운행 후 주행 기록을 남겨 주세요.'],
  equipment: ['안내 데스크에서 빌리고 같은 날 반납해 주세요.'],
  desk: ['쓰고 나면 책상을 비워 주세요.'],
};

export function pickArgs(ctx: HandlerContext, req: ResourceRequest): PickResourceArgs {
  return {
    kind: req.kind,
    kindLabel: KIND_LABEL[req.kind],
    date: req.date,
    dateLabel: formatDate(req.date),
    slot: req.slot,
    items: RESOURCES.filter((r) => r.kind === req.kind && (!req.item || r.item === req.item)).map((r) => ({
      id: r.id,
      name: r.name,
      detail: r.detail,
      free: ctx.backend.resources.availability(r.id, req.date),
    })),
  };
}

async function* showPick(ctx: HandlerContext, req: ResourceRequest, lead: string): AsyncGenerator<AgUiEvent> {
  yield setRequest(req);
  const args = pickArgs(ctx, req);
  const want: ResourceSlot = req.slot ?? 'day';
  const free = args.items.filter((i) => (req.slot ? i.free[want] : i.free.am || i.free.pm));
  const when = `${args.dateLabel}${req.slot ? ` ${SLOT_LABEL[req.slot]}` : ''}`;
  const k = args.kindLabel;
  let reply = `${lead}${when}에 쓸 수 있는 ${k}${free.length ? `${josa(k, '은', '는')} ${free.length}개예요.` : `${josa(k, '이', '가')} 없어요.`} `;
  if (free.length) reply += req.kind === 'desk' ? '카드나 사무실 화면에서 자리를 눌러 골라 주세요.' : '시간대를 눌러 골라 주세요.';
  else reply += '다른 날짜나 시간대로 다시 말씀해 주세요.';
  yield* ctx.say(reply);
  if (free.length) yield* ctx.callTool(RESOURCE_TOOL.pick, args);
  else yield setRequest(null);
}

/** 자원 예약 모의 처리기 */
export const resourcesHandler: MockHandler = {
  id: 'resources',
  tools: new Set(Object.values(RESOURCE_TOOL)),
  match: (text) => matchResources(text),

  async *onUser(text, ctx) {
    const intent = parseResources(text, ctx.now);
    if (intent.kind === 'mine') {
      yield setRequest(null);
      const items: MyReservationsArgs['items'] = ctx.backend.resources.mine().map((r) => {
        const res = resourceById(r.resourceId);
        return {
          id: r.id,
          name: res?.name ?? r.resourceId,
          kindLabel: res ? KIND_LABEL[res.kind] : '',
          dateLabel: formatDate(r.date),
          slotLabel: `${SLOT_LABEL[r.slot]} ${SLOT_TIME[r.slot]}`,
          purpose: r.purpose,
        };
      });
      yield* ctx.say(items.length ? `예정된 자원 예약이 ${items.length}건 있어요.` : '예정된 자원 예약이 없어요. 예: "내일 법인차 쓸 수 있어?"');
      if (items.length) yield* ctx.callTool(RESOURCE_TOOL.mine, { items } satisfies MyReservationsArgs);
      return;
    }
    yield* showPick(ctx, intent.request, intent.dateGuessed ? '날짜를 말씀하지 않아서 오늘로 봤어요. ' : '');
  },

  async *onToolResult(toolName, result, ctx) {
    const req = ctx.state.resources.request;
    if (!req) {
      yield* ctx.say('진행 중인 예약 요청을 찾지 못했어요. 처음부터 다시 말씀해 주세요.');
      return;
    }

    if (toolName === RESOURCE_TOOL.pick) {
      const r = result as PickResourceResult;
      if ('cancelled' in r) {
        yield setRequest(null);
        return yield* ctx.say('예약을 그만뒀어요.');
      }
      const res = resourceById(r.resourceId);
      if (!res) return yield* ctx.say('고른 자원을 찾지 못했어요. 다시 골라 주세요.');
      const args: ConfirmResourceArgs = {
        resourceId: res.id,
        name: res.name,
        kind: res.kind,
        date: req.date,
        dateLabel: formatDate(req.date),
        slot: r.slot,
        slotLabel: SLOT_LABEL[r.slot],
        time: SLOT_TIME[r.slot],
        purposeLabel: res.kind === 'vehicle' ? '행선지' : '용도',
        notes: NOTES[res.kind],
      };
      yield setRequest({ ...req, slot: r.slot });
      yield* ctx.say(`${res.name}, ${args.dateLabel} ${args.slotLabel}(${args.time})로 예약할까요?`);
      yield* ctx.callTool(RESOURCE_TOOL.confirm, args);
      return;
    }

    if (toolName === RESOURCE_TOOL.confirm) {
      const r = result as ConfirmResourceResult;
      if ('back' in r) return yield* showPick(ctx, req, '다시 ');
      if (!r.confirmed) {
        yield setRequest(null);
        return yield* ctx.say('예약을 그만뒀어요.');
      }
      const draft = ctx.lastArgs<ConfirmResourceArgs>(RESOURCE_TOOL.confirm);
      if (!draft) return yield* ctx.say('확인할 예약 내용을 찾지 못했어요. 다시 시도해 주세요.');
      let reservation;
      try {
        reservation = ctx.backend.resources.book({ resourceId: draft.resourceId, date: draft.date, slot: draft.slot, purpose: r.purpose });
      } catch (error) {
        yield* ctx.say(`예약하지 못했어요: ${(error as Error).message} 다른 자원이나 시간대를 골라 주세요.`);
        yield* ctx.callTool(RESOURCE_TOOL.pick, pickArgs(ctx, req));
        return;
      }
      yield {
        type: 'STATE_DELTA',
        delta: [
          { op: 'add', path: '/resources/reservations/-', value: reservation },
          { op: 'replace', path: '/resources/request', value: null },
        ],
      };
      yield* ctx.say(`${draft.name} ${draft.dateLabel} ${draft.slotLabel} 예약을 마쳤어요. ${draft.notes[0] ?? ''}`.trim());
      const args: ResourceResultArgs = { reservation, name: draft.name, dateLabel: draft.dateLabel, slotLabel: draft.slotLabel, time: draft.time };
      yield* ctx.callTool(RESOURCE_TOOL.result, args);
    }
  },
};
