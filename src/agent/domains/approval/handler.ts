import { DEFAULT_DRAFT_LINE, formatWon, type ApprovalDoc, type DraftInput } from '../../../data/approvals';
import type { AgUiEvent } from '../../agui';
import type { HandlerContext, MockHandler } from '../../mock/types';
import { DRAFT_FIELD_LABEL, matchApproval, matchApprovalFollowUp, parseApprovalIntent, type DraftField } from './intent';
import { APPROVAL_TOOL, type ShowDraftArgs, type ShowDraftResult, type ShowDraftResultArgs } from './tools';
import { describeFilter, filterInbox, openInbox, warnCount, type ApprovalView } from './view';

/** 결재함 화면을 바꾼다: 공유 상태의 보기 상태를 통째로 바꾸면 화면이 따라 움직인다 */
function setView(view: ApprovalView): AgUiEvent {
  return { type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/approval/view', value: view }] };
}

function summarize(doc: ApprovalDoc): string {
  const warns = doc.notes.filter((n) => n.level === 'warn').map((n) => n.text);
  const oks = doc.notes.filter((n) => n.level === 'ok').map((n) => n.text);
  let text = `${doc.drafter.name} ${doc.drafter.title}이 올린 ${doc.form}`;
  text += doc.amount ? `으로 ${formatWon(doc.amount)}이에요. ` : '이에요. ';
  text += warns.length ? `확인할 점: ${warns.join(' ')} ` : '눈에 띄는 문제는 없어요. ';
  if (oks.length) text += `${oks.join(' ')} `;
  return `${text}최종 판단은 직접 해 주세요.`;
}

function commentFor(doc: ApprovalDoc, decision: 'approve' | 'reject'): string {
  const warns = doc.notes.filter((n) => n.level === 'warn').map((n) => n.text.replace(/요\.$/, '요'));
  if (decision === 'approve') return warns.length ? `확인했습니다. 다음에는 ${warns[0]} 점을 미리 챙겨 주세요.` : '확인했습니다.';
  return warns.length
    ? `보완 요청드립니다. ${warns.join(', ')}. 보완해서 다시 올려 주세요.`
    : '보완 요청드립니다. (사유를 적어 주세요)';
}

async function* showDraft(ctx: HandlerContext, draft: DraftInput, missing: DraftField[], lead: string): AsyncGenerator<AgUiEvent> {
  const need = missing.map((f) => DRAFT_FIELD_LABEL[f]);
  yield* ctx.say(need.length ? `${lead} ${need.join('·')}은 비어 있으니 채워 주세요.` : `${lead} 내용을 확인하고 상신해 주세요.`);
  const args: ShowDraftArgs = { draft, line: DEFAULT_DRAFT_LINE, missing };
  yield* ctx.callTool(APPROVAL_TOOL.showDraft, args);
}

/** 전자결재 모의 처리기 */
export const approvalHandler: MockHandler = {
  id: 'approval',
  tools: new Set(Object.values(APPROVAL_TOOL)),
  match(text, state) {
    const following = state.activeDomain === 'approval' || state.approval.view.open;
    return Math.max(matchApproval(text), following ? matchApprovalFollowUp(text) : 0);
  },

  async *onUser(text, ctx) {
    const store = ctx.backend.approvals;
    const current = ctx.state.approval.view;
    const inbox = store.inbox();
    const intent = parseApprovalIntent(text, ctx.now, inbox);
    // 문서를 말하지 않았으면 지금 열어 둔 문서를 가리킨 것으로 본다
    const target = (id: string | null) => store.get(id ?? current.selectedId ?? '');

    switch (intent.kind) {
      case 'draft': {
        const label = intent.draft.form === '구매요청' ? '구매요청서' : '지출결의서';
        return yield* showDraft(ctx, intent.draft, intent.missing, `${label} 초안을 만들었어요.`);
      }

      case 'bulk': {
        yield setView(openInbox());
        return yield* ctx.say(
          `결재는 한 번에 처리하지 않고 문서를 하나씩 확인한 뒤 진행해요. 결재함에 ${inbox.length}건을 띄워 두었어요.`,
        );
      }

      case 'summary': {
        const doc = target(intent.docId);
        if (!doc) {
          yield setView(current.open ? current : openInbox());
          return yield* ctx.say('어떤 문서를 볼까요? 결재함에서 문서를 열거나 제목을 말해 주세요.');
        }
        yield setView({ ...(current.open ? current : openInbox()), tab: 'inbox', selectedId: doc.id });
        return yield* ctx.say(summarize(doc));
      }

      case 'comment': {
        const doc = target(intent.docId);
        if (!doc) {
          yield setView(current.open ? current : openInbox());
          return yield* ctx.say('어떤 문서의 의견을 쓸까요? 결재함에서 문서를 먼저 열어 주세요.');
        }
        const base = current.open ? current : openInbox();
        yield setView({ ...base, tab: 'inbox', selectedId: doc.id, commentDraft: { docId: doc.id, text: commentFor(doc, intent.decision) } });
        const verb = intent.decision === 'reject' ? '반려' : '승인';
        return yield* ctx.say(`의견 칸에 ${verb} 의견 초안을 넣었어요. 고친 뒤 [${verb}]을 눌러 확정해 주세요.`);
      }

      case 'decide': {
        const doc = target(intent.docId);
        const base = current.open ? current : openInbox();
        yield setView({ ...base, tab: 'inbox', selectedId: doc?.id ?? null });
        const verb = intent.decision === 'reject' ? '반려' : '승인';
        return yield* ctx.say(
          doc
            ? `결재는 직접 확정해 주세요. "${doc.title}" 문서를 열어 두었어요. 내용을 확인하고 [${verb}]을 눌러 주세요.`
            : `결재는 직접 확정해 주세요. 결재함에서 문서를 열고 [${verb}]을 눌러 주세요.`,
        );
      }

      case 'view': {
        const base = intent.reset || !current.open ? openInbox() : current;
        const view: ApprovalView = { ...base, ...intent.patch, open: true, commentDraft: null };
        if (!('selectedId' in intent.patch)) view.selectedId = null;
        yield setView(view);

        if (view.tab === 'processed') {
          const n = store.snapshot().processed.length;
          return yield* ctx.say(n ? `이번에 처리한 문서 ${n}건이에요.` : '아직 처리한 문서가 없어요.');
        }
        if (view.tab === 'drafted') {
          const n = store.snapshot().drafted.length;
          return yield* ctx.say(n ? `내가 올린 문서 ${n}건이에요.` : '아직 올린 문서가 없어요. "택시비 23,000원 지출결의 올려줘"처럼 말해 보세요.');
        }
        if (view.selectedId) {
          const doc = store.get(view.selectedId);
          if (doc) {
            const w = warnCount(doc);
            return yield* ctx.say(`"${doc.title}" 문서를 열었어요. ${w ? `확인할 점이 ${w}가지 있어요.` : '눈에 띄는 문제는 없어요.'}`);
          }
        }
        const rows = filterInbox(inbox, view);
        const cond = describeFilter(view);
        if (cond) return yield* ctx.say(rows.length ? `${cond} 조건으로 ${rows.length}건이에요.` : `${cond} 조건에 맞는 문서가 없어요.`);
        if (!inbox.length) return yield* ctx.say('지금 처리할 결재가 없어요.');
        const urgent = inbox.filter((d) => d.urgent).length;
        return yield* ctx.say(
          `결재할 문서가 ${inbox.length}건 있어요.${urgent ? ` 긴급 ${urgent}건을 맨 위에 두었어요.` : ''} 문서를 눌러 내용을 보세요.`,
        );
      }
    }
  },

  async *onToolResult(toolName, result, ctx) {
    if (toolName !== APPROVAL_TOOL.showDraft) return;
    const r = result as ShowDraftResult;
    if ('cancelled' in r) return yield* ctx.say('기안을 취소했어요. 작성한 내용은 저장하지 않았어요.');
    let drafted;
    try {
      drafted = ctx.backend.approvals.submit(r.draft);
    } catch (error) {
      const missing: DraftField[] = [];
      if (!r.draft.title.trim()) missing.push('title');
      if (!(r.draft.amount > 0)) missing.push('amount');
      if (!r.draft.purpose.trim()) missing.push('purpose');
      return yield* showDraft(ctx, r.draft, missing, `상신하지 못했어요: ${(error as Error).message}`);
    }
    const reviewer = drafted.line.find((s) => s.status === 'current')?.person;
    yield* ctx.say(
      `${formatWon(drafted.amount)} "${drafted.title}"을 상신했어요.` +
        (reviewer ? ` 이제 ${reviewer.name} ${reviewer.title}이 검토할 차례예요. 결재함의 "내가 올린 문서"에서 볼 수 있어요.` : ''),
    );
    const args: ShowDraftResultArgs = { drafted, form: r.draft.form };
    yield* ctx.callTool(APPROVAL_TOOL.showDraftResult, args);
  },
};
