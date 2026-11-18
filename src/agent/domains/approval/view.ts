import type { ApprovalDoc, ApprovalForm } from '../../../data/approvals';

/**
 * 결재함 작업 화면의 보기 상태. AG-UI 공유 상태에 들어 있어서
 * - 사용자가 화면에서 바꾸면 다음 실행 때 에이전트가 "지금 무엇을 보고 있는지" 안다.
 * - 에이전트가 STATE_DELTA로 바꾸면 화면이 그대로 따라 움직인다 (필터 걸기, 문서 열기 등).
 */
export type ApprovalTab = 'inbox' | 'processed' | 'drafted';
export type ApprovalOnly = 'all' | 'urgent' | 'review';
export type ApprovalSort = 'default' | 'amount' | 'recent';

export interface ApprovalView {
  open: boolean;
  tab: ApprovalTab;
  /** 제목·기안자·문서 번호 검색 */
  query: string;
  form: ApprovalForm | 'all';
  only: ApprovalOnly;
  sort: ApprovalSort;
  /** 상세를 연 문서 */
  selectedId: string | null;
  /** 에이전트가 써 준 의견 초안. 사용자가 고쳐서 쓰고, 처리는 사용자가 버튼으로 한다 */
  commentDraft: { docId: string; text: string } | null;
}

export const CLOSED_VIEW: ApprovalView = {
  open: false,
  tab: 'inbox',
  query: '',
  form: 'all',
  only: 'all',
  sort: 'default',
  selectedId: null,
  commentDraft: null,
};

/** 결재함을 처음 상태(필터 없음)로 연다 */
export const openInbox = (): ApprovalView => ({ ...CLOSED_VIEW, open: true });

export const FORMS: ApprovalForm[] = ['지출결의', '구매요청', '출장신청', '휴가신청'];

export const ONLY_LABEL: Record<ApprovalOnly, string> = { all: '전체', urgent: '긴급', review: '확인 필요' };
export const SORT_LABEL: Record<ApprovalSort, string> = {
  default: '긴급·오래된 순',
  amount: '금액 큰 순',
  recent: '최근 순',
};

export const warnCount = (d: ApprovalDoc) => d.notes.filter((n) => n.level === 'warn').length;

/** 결재할 문서에 보기 조건(검색·양식·긴급/확인 필요·정렬)을 적용한다 */
export function filterInbox(docs: ApprovalDoc[], view: ApprovalView): ApprovalDoc[] {
  const q = view.query.trim();
  const rows = docs.filter(
    (d) =>
      (view.form === 'all' || d.form === view.form) &&
      (view.only !== 'urgent' || d.urgent) &&
      (view.only !== 'review' || warnCount(d) > 0) &&
      (!q || [d.title, d.number, d.drafter.name, d.form].some((s) => s.includes(q))),
  );
  if (view.sort === 'amount') return [...rows].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  if (view.sort === 'recent') return [...rows].sort((a, b) => b.submittedOn.localeCompare(a.submittedOn));
  return rows; // 저장소 순서 = 긴급 먼저, 그다음 오래된 순
}

/** 지금 걸린 조건을 사람이 읽는 말로 */
export function describeFilter(view: ApprovalView): string {
  const parts: string[] = [];
  if (view.only !== 'all') parts.push(ONLY_LABEL[view.only]);
  if (view.form !== 'all') parts.push(view.form);
  if (view.query.trim()) parts.push(`"${view.query.trim()}"`);
  if (view.sort !== 'default') parts.push(SORT_LABEL[view.sort]);
  return parts.join(' · ');
}
