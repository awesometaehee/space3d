import type { ApprovalDoc, ApprovalForm, DraftInput } from '../../../data/approvals';
import { parseAmount, parseDate } from '../../parse';
import { FORMS, type ApprovalView } from './view';

/** 전자결재 요청 같은지 (0~1). 라우터가 업무 영역을 고를 때 쓴다 */
export function matchApproval(text: string): number {
  if (/결재|승인|반려|기안|상신|지출\s*결의|결의서|품의|구매\s*요청|출장\s*신청|경비\s*(청구|처리)|영수증/.test(text)) return 1;
  if (/처리한\s*(문서|거)|내가\s*올린/.test(text)) return 0.8;
  if (parseAmount(text) > 0 && /비|값|구매|샀|사\s*줘|썼|결제/.test(text)) return 0.7;
  return 0;
}

/** 결재함과 이어지는 대화인지 (문서를 열어 둔 상태에서 "요약해줘", "긴급한 것만" 등) */
export function matchApprovalFollowUp(text: string): number {
  return /요약|어때|검토|사유|의견|긴급|급한|확인|문제|금액|정렬|최근|오래된|처리한|올린|문서|전체|필터|것만|거만|지출|구매|출장|휴가/.test(text)
    ? 0.5
    : 0;
}

export type DraftField = 'title' | 'amount' | 'purpose';

export type ApprovalIntent =
  /** 결재함을 열고 보기 조건을 바꾼다 (탭·필터·정렬·문서 선택) */
  | { kind: 'view'; patch: Partial<ApprovalView>; reset: boolean }
  /** "다 승인해줘" 같은 일괄 처리 요청 */
  | { kind: 'bulk' }
  /** 문서 요약 (docId가 없으면 지금 열어 둔 문서) */
  | { kind: 'summary'; docId: string | null }
  /** 승인·반려 의견 초안 */
  | { kind: 'comment'; docId: string | null; decision: 'approve' | 'reject' }
  /** "이거 승인해줘": 에이전트는 확정하지 않고 문서만 열어 둔다 */
  | { kind: 'decide'; docId: string | null; decision: 'approve' | 'reject' }
  | { kind: 'draft'; draft: DraftInput; missing: DraftField[] };

const ITEMS: Array<[RegExp, string]> = [
  [/택시/, '택시비'],
  [/주차/, '주차비'],
  [/교통|기차|ktx|버스/i, '교통비'],
  [/점심|저녁|식대|식사/, '식대'],
  [/회식/, '회식비'],
  [/다과|간식|커피/, '다과비'],
  [/도서|책/, '도서 구입'],
  [/모니터/, '모니터'],
  [/키보드/, '키보드'],
  [/마우스/, '마우스'],
  [/노트북/, '노트북'],
];

/** 문서 제목의 낱말(2글자 이상, 숫자로 시작하지 않는)이 요청에 있으면 그 문서 */
function findDoc(t: string, inbox: ApprovalDoc[]): ApprovalDoc | undefined {
  return inbox.find((d) =>
    d.title
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !/^\d/.test(w))
      .some((w) => t.includes(w)),
  );
}

function parseDraft(t: string, now: Date): ApprovalIntent {
  const amount = parseAmount(t);
  const form: DraftInput['form'] = /구매|사\s*줘|주문/.test(t) ? '구매요청' : '지출결의';
  const purpose = ITEMS.find(([re]) => re.test(t))?.[1] ?? '';
  const draft: DraftInput = {
    form,
    title: purpose ? `${purpose} ${form === '구매요청' ? '구매' : '지출'}` : '',
    amount,
    usedOn: parseDate(t, now, { past: true }).date,
    payment: /개인|내\s*돈|사비|정산/.test(t) ? '개인 비용(정산)' : '법인카드',
    purpose,
  };
  const missing: DraftField[] = [];
  if (!draft.title) missing.push('title');
  if (!draft.amount) missing.push('amount');
  if (!draft.purpose) missing.push('purpose');
  return { kind: 'draft', draft, missing };
}

/**
 * 모의 에이전트용 규칙 기반 해석기. 실제 에이전트에서는 LLM이 이 역할을 한다.
 * 예) "결재할 거 보여줘", "긴급한 것만", "금액 큰 순으로", "단비가 올린 거", "모니터 결재 열어줘",
 *     "이 문서 요약해줘", "반려 사유 써줘", "처리한 문서", "어제 택시비 23,000원 지출결의 올려줘"
 */
export function parseApprovalIntent(text: string, now: Date, inbox: ApprovalDoc[]): ApprovalIntent {
  const t = text.replace(/\s+/g, ' ');
  const doc = findDoc(t, inbox);
  const docId = doc?.id ?? null;

  if (/(다|모두|전부|일괄|한꺼번에|한\s*번에)\s*(승인|결재|처리)/.test(t)) return { kind: 'bulk' };
  if (/사유|의견/.test(t)) return { kind: 'comment', docId, decision: /승인/.test(t) ? 'approve' : 'reject' };
  if (/처리한|처리\s*내역|승인한|반려한/.test(t)) return { kind: 'view', patch: { tab: 'processed' }, reset: true };
  if (/내가\s*(올린|상신한|기안한)|상신한\s*(거|문서)|올린\s*(거|문서)/.test(t)) {
    return { kind: 'view', patch: { tab: 'drafted' }, reset: true };
  }

  const amount = parseAmount(t);
  if (/올려|상신|기안|써\s*줘|작성|만들어|청구|신청해|올릴래/.test(t) || (amount > 0 && !/결재할|대기/.test(t))) {
    return parseDraft(t, now);
  }

  if (/요약|어때|검토|살펴|봐\s*줘|설명/.test(t)) return { kind: 'summary', docId };
  if (/(승인|반려)\s*(해|할게|하자|처리)/.test(t)) return { kind: 'decide', docId, decision: /반려/.test(t) ? 'reject' : 'approve' };

  if (doc) return { kind: 'view', patch: { tab: 'inbox', selectedId: doc.id }, reset: false };

  // 보기 조건
  if (/전체|필터\s*(풀|해제|없)|다\s*보여/.test(t)) return { kind: 'view', patch: {}, reset: true };
  const patch: Partial<ApprovalView> = {};
  if (/긴급|급한/.test(t)) patch.only = 'urgent';
  else if (/확인\s*(이\s*)?(필요|할\s*(게|것|거))|문제|주의|이상한/.test(t)) patch.only = 'review';
  const form = FORMS.find((f) => t.replace(/\s/g, '').includes(f)) as ApprovalForm | undefined;
  if (form) patch.form = form;
  if (/금액\s*(큰|높은|많은)|비싼/.test(t)) patch.sort = 'amount';
  else if (/최근|최신|새로/.test(t)) patch.sort = 'recent';
  else if (/오래된/.test(t)) patch.sort = 'default';
  const drafter = inbox.map((d) => d.drafter.name).find((n) => t.includes(n));
  if (drafter) patch.query = drafter;
  if (Object.keys(patch).length) return { kind: 'view', patch: { tab: 'inbox', ...patch }, reset: false };

  return { kind: 'view', patch: {}, reset: true };
}

export const DRAFT_FIELD_LABEL: Record<DraftField, string> = { title: '제목', amount: '금액', purpose: '내용' };
