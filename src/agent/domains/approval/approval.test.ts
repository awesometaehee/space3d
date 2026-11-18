import { describe, expect, it } from 'vitest';
import { ApprovalStore } from '../../../data/approvals';
import { NOW, setup } from '../../testing';
import { parseApprovalIntent } from './intent';
import { APPROVAL_TOOL, type ShowDraftArgs } from './tools';
import { describeFilter, filterInbox, openInbox } from './view';

const inbox = new ApprovalStore(() => NOW).inbox();

describe('결재함 보기 조건', () => {
  it('긴급·확인 필요·양식·검색·정렬을 적용한다', () => {
    const ids = (v: Parameters<typeof filterInbox>[1]) => filterInbox(inbox, v).map((d) => d.id);
    expect(ids(openInbox())).toEqual(['ap-2', 'ap-1', 'ap-3', 'ap-4']); // 긴급 먼저, 그다음 오래된 순
    expect(ids({ ...openInbox(), only: 'urgent' })).toEqual(['ap-2']);
    expect(ids({ ...openInbox(), only: 'review' })).toEqual(['ap-2', 'ap-3']);
    expect(ids({ ...openInbox(), form: '휴가신청' })).toEqual(['ap-4']);
    expect(ids({ ...openInbox(), query: '단비' })).toEqual(['ap-1']);
    expect(ids({ ...openInbox(), sort: 'amount' })).toEqual(['ap-2', 'ap-3', 'ap-1', 'ap-4']);
    expect(describeFilter({ ...openInbox(), only: 'review', sort: 'amount' })).toBe('확인 필요 · 금액 큰 순');
  });
});

describe('결재 요청 해석', () => {
  it('보기 조건·문서·요약·의견·일괄을 구분한다', () => {
    const p = (t: string) => parseApprovalIntent(t, NOW, inbox);
    expect(p('결재할 거 보여줘')).toEqual({ kind: 'view', patch: {}, reset: true });
    expect(p('긴급한 것만')).toEqual({ kind: 'view', patch: { tab: 'inbox', only: 'urgent' }, reset: false });
    expect(p('확인이 필요한 것만 보여줘')).toMatchObject({ patch: { only: 'review' } });
    expect(p('금액 큰 순으로 정렬해줘')).toMatchObject({ patch: { sort: 'amount' } });
    expect(p('단비가 올린 결재')).toMatchObject({ patch: { query: '단비' } });
    expect(p('모니터 결재 열어줘')).toEqual({ kind: 'view', patch: { tab: 'inbox', selectedId: 'ap-2' }, reset: false });
    expect(p('이 문서 요약해줘')).toEqual({ kind: 'summary', docId: null });
    expect(p('반려 사유 써줘')).toEqual({ kind: 'comment', docId: null, decision: 'reject' });
    expect(p('이거 승인해줘')).toEqual({ kind: 'decide', docId: null, decision: 'approve' });
    expect(p('결재 다 승인해줘')).toEqual({ kind: 'bulk' });
    expect(p('처리한 문서 보여줘')).toMatchObject({ patch: { tab: 'processed' } });
    expect(p('내가 올린 문서')).toMatchObject({ patch: { tab: 'drafted' } });
  });

  it('지출결의 초안을 만든다', () => {
    expect(parseApprovalIntent('어제 택시비 23,000원 지출결의 올려줘', NOW, inbox)).toEqual({
      kind: 'draft',
      missing: [],
      draft: { form: '지출결의', title: '택시비 지출', amount: 23000, usedOn: '2026-11-17', payment: '법인카드', purpose: '택시비' },
    });
    const empty = parseApprovalIntent('지출결의서 써줘', NOW, inbox);
    expect(empty.kind === 'draft' && empty.missing).toEqual(['title', 'amount', 'purpose']);
  });
});

describe('에이전트가 결재함 화면을 조작한다 (공유 상태)', () => {
  it('결재함을 열고, 조건을 걸고, 문서를 연다', async () => {
    const t = setup();
    await t.say('결재할 거 보여줘');
    expect(t.calledTools()).toEqual([]); // 카드 대신 작업 화면을 연다
    expect(t.c.state.approval.view).toMatchObject({ open: true, tab: 'inbox', only: 'all' });
    expect(t.text()).toContain('4건');

    // 결재 단어가 없어도 결재함을 보고 있으면 이어지는 말로 알아듣는다
    await t.say('확인이 필요한 것만');
    expect(t.c.state.approval.view.only).toBe('review');
    expect(t.text()).toContain('확인 필요 조건으로 2건');

    await t.say('모니터 결재 열어줘');
    expect(t.c.state.approval.view.selectedId).toBe('ap-2');
  });

  it('화면에서 연 문서를 "이 문서"로 알아듣고 요약·의견 초안을 넣는다', async () => {
    const t = setup();
    await t.say('결재함 열어줘');
    // 사용자가 화면에서 출장 문서를 연다 (화면 → 공유 상태)
    t.setState((s) => ({ ...s, approval: { view: { ...s.approval.view, selectedId: 'ap-3' } } }));

    await t.say('이 문서 요약해줘');
    expect(t.text()).toContain('숙박비');
    expect(t.text()).toContain('최종 판단은 직접');

    await t.say('반려 사유 써줘');
    expect(t.c.state.approval.view.commentDraft).toMatchObject({ docId: 'ap-3' });
    expect(t.c.state.approval.view.commentDraft?.text).toContain('일정표');
    // 에이전트는 처리하지 않는다: 문서는 그대로 결재함에 있다
    expect(t.backend.approvals.get('ap-3')).toBeDefined();
  });

  it('승인·반려와 일괄 처리 요청은 확정하지 않고 사람에게 넘긴다', async () => {
    const t = setup();
    await t.say('모니터 결재 승인해줘');
    expect(t.c.state.approval.view.selectedId).toBe('ap-2');
    expect(t.text()).toContain('직접 확정');
    expect(t.backend.approvals.inbox()).toHaveLength(4);

    await t.say('결재 전부 승인해줘');
    expect(t.text()).toContain('하나씩');
    expect(t.backend.approvals.inbox()).toHaveLength(4);
  });

  it('화면에서 처리한 결과를 처리한 문서 탭에서 알려 준다', async () => {
    const t = setup();
    t.backend.approvals.decide('ap-1', 'approve', ''); // 사용자가 화면에서 승인
    await t.say('처리한 문서 보여줘');
    expect(t.c.state.approval.view.tab).toBe('processed');
    expect(t.text()).toContain('1건');
  });
});

describe('저장소', () => {
  it('사유 없는 반려를 거절하고, 처리하면 구독자에게 알린다', () => {
    const store = new ApprovalStore(() => NOW);
    let calls = 0;
    store.subscribe(() => calls++);
    const before = store.snapshot();
    expect(() => store.decide('ap-3', 'reject', ' ')).toThrow('사유');
    expect(store.snapshot()).toBe(before); // 바뀌지 않으면 같은 객체
    store.decide('ap-3', 'reject', '일정표 첨부');
    expect(calls).toBe(1);
    expect(store.snapshot().inbox.map((d) => d.id)).not.toContain('ap-3');
    expect(store.snapshot().processed[0]).toMatchObject({ docId: 'ap-3', decision: 'reject', drafter: '도담 책임' });
  });
});

describe('기안 흐름 (대화 카드)', () => {
  it('초안 → 상신 → 완료 카드, 내가 올린 문서에 쌓인다', async () => {
    const t = setup();
    await t.say('어제 택시비 23,000원 지출결의 올려줘');
    expect(t.card?.function.name).toBe(APPROVAL_TOOL.showDraft);
    const { draft } = t.args<ShowDraftArgs>();

    await t.answer({ submitted: true, draft: { ...draft, purpose: '고객사 미팅 이동 택시비' } });
    expect(t.card?.function.name).toBe(APPROVAL_TOOL.showDraftResult);
    const drafted = t.backend.approvals.snapshot().drafted;
    expect(drafted[0]).toMatchObject({ title: '택시비 지출', amount: 23000, form: '지출결의' });
    expect(drafted[0].number).toMatch(/^지출-2026-\d{4}$/);
  });

  it('빈칸이 있으면 상신하지 않고 초안을 다시 보여 준다', async () => {
    const t = setup();
    await t.say('지출결의서 써줘');
    const { draft } = t.args<ShowDraftArgs>();
    await t.answer({ submitted: true, draft: { ...draft, title: '도서 구입' } });
    expect(t.card?.function.name).toBe(APPROVAL_TOOL.showDraft);
    expect(t.args<ShowDraftArgs>().missing).toEqual(['amount', 'purpose']);
    expect(t.backend.approvals.snapshot().drafted).toHaveLength(0);
  });
});
