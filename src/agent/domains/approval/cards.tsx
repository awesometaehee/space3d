import { useId, useState, type ComponentType } from 'react';
import { formatWon, type DraftInput, type PaymentMethod } from '../../../data/approvals';
import { AnsweredNote, CardShell, Skeleton, isSuperseded, type CardProps } from '../../cardKit';
import { DRAFT_FIELD_LABEL, type DraftField } from './intent';
import { ApprovalLine } from './parts';
import { APPROVAL_TOOL, type ShowDraftArgs, type ShowDraftResult, type ShowDraftResultArgs } from './tools';

/**
 * 전자결재 대화 카드: 기안 초안과 상신 결과.
 * 결재함 조회·처리는 작업 화면(workspace/)이 맡는다.
 */

const PAYMENTS: PaymentMethod[] = ['법인카드', '개인 비용(정산)'];

function DraftCard({ args, status, result, respond }: CardProps<ShowDraftArgs, ShowDraftResult>) {
  const base = args?.draft as Partial<DraftInput> | undefined;
  const [edits, setEdits] = useState<Partial<DraftInput>>({});
  const [confirming, setConfirming] = useState(false);
  const uid = useId();
  const ready = status === 'awaiting';
  // 초안의 모든 칸과 결재선이 도착해야 폼을 그린다 (인자는 스트리밍으로 조금씩 온다)
  const complete =
    !!base &&
    typeof base.title === 'string' &&
    typeof base.amount === 'number' &&
    typeof base.usedOn === 'string' &&
    typeof base.payment === 'string' &&
    typeof base.purpose === 'string' &&
    Array.isArray(args?.line);

  if (!complete) {
    return (
      <CardShell title="기안서 초안" status={status}>
        <Skeleton rows={4} />
      </CardShell>
    );
  }

  // 사용자가 고친 칸이 있으면 그 값을, 아니면 에이전트 초안을 쓴다
  const draft = { ...(base as DraftInput), ...edits };
  const set = <K extends keyof DraftInput>(key: K, value: DraftInput[K]) => {
    setEdits((e) => ({ ...e, [key]: value }));
    setConfirming(false);
  };
  const empty: DraftField[] = [];
  if (!draft.title.trim()) empty.push('title');
  if (!(draft.amount > 0)) empty.push('amount');
  if (!draft.purpose.trim()) empty.push('purpose');
  const highlight = (f: DraftField) => (ready && empty.includes(f) ? ' is-missing' : '');
  const submitted = result && !isSuperseded(result) && 'submitted' in result;

  return (
    <CardShell title={`${draft.form === '구매요청' ? '구매요청서' : '지출결의서'} 초안`} status={status}>
      <div className="draft-form">
        <label htmlFor={`${uid}-form`}>양식</label>
        <select
          id={`${uid}-form`}
          value={draft.form}
          disabled={!ready}
          onChange={(e) => set('form', e.target.value as DraftInput['form'])}
        >
          <option value="지출결의">지출결의</option>
          <option value="구매요청">구매요청</option>
        </select>

        <label htmlFor={`${uid}-title`}>제목</label>
        <input
          id={`${uid}-title`}
          className={highlight('title')}
          value={draft.title}
          maxLength={40}
          disabled={!ready}
          placeholder="예) 11월 고객 미팅 택시비"
          onChange={(e) => set('title', e.target.value)}
        />

        <label htmlFor={`${uid}-amount`}>금액</label>
        <div className={`amount-input${highlight('amount')}`}>
          <input
            id={`${uid}-amount`}
            inputMode="numeric"
            value={draft.amount ? draft.amount.toLocaleString('ko-KR') : ''}
            disabled={!ready}
            placeholder="0"
            onChange={(e) => set('amount', Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
          />
          <span>원</span>
        </div>

        <label htmlFor={`${uid}-date`}>{draft.form === '구매요청' ? '요청일' : '사용일'}</label>
        <input
          id={`${uid}-date`}
          type="date"
          value={draft.usedOn}
          disabled={!ready}
          onChange={(e) => set('usedOn', e.target.value)}
        />

        <label htmlFor={`${uid}-pay`}>결제</label>
        <div>
          <select
            id={`${uid}-pay`}
            value={draft.payment}
            disabled={!ready}
            onChange={(e) => set('payment', e.target.value as PaymentMethod)}
          >
            {PAYMENTS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <p className="field-hint">카드번호·계좌번호는 적지 않아요.</p>
        </div>

        <label htmlFor={`${uid}-purpose`}>내용</label>
        <textarea
          id={`${uid}-purpose`}
          className={highlight('purpose')}
          rows={2}
          maxLength={200}
          value={draft.purpose}
          disabled={!ready}
          placeholder="무엇에 썼는지 적어 주세요"
          onChange={(e) => set('purpose', e.target.value)}
        />
      </div>
      <ApprovalLine line={args?.line ?? []} />

      {ready ? (
        confirming ? (
          <footer className="confirm-bar">
            <span>상신하면 검토자에게 알림이 가요.</span>
            <button type="button" className="ghost" onClick={() => setConfirming(false)}>
              돌아가기
            </button>
            <button type="button" className="primary" autoFocus onClick={() => respond({ submitted: true, draft })}>
              상신 확정
            </button>
          </footer>
        ) : (
          <footer>
            {empty.length > 0 && (
              <span className="field-error push-left">{empty.map((f) => DRAFT_FIELD_LABEL[f]).join('·')}을 채워 주세요</span>
            )}
            <button type="button" className="ghost" onClick={() => respond({ cancelled: true })}>
              취소
            </button>
            <button type="button" className="primary" disabled={empty.length > 0} onClick={() => setConfirming(true)}>
              상신
            </button>
          </footer>
        )
      ) : (
        status === 'answered' && <AnsweredNote result={result}>{submitted ? '상신을 요청했어요.' : null}</AnsweredNote>
      )}
    </CardShell>
  );
}

function DraftResultCard({ args, status }: CardProps<ShowDraftResultArgs, never>) {
  const d = args?.drafted;
  if (!d?.line) {
    return (
      <CardShell title="상신 완료" status={status}>
        <Skeleton rows={2} />
      </CardShell>
    );
  }
  return (
    <CardShell title="상신 완료" status={status}>
      <div className="done-row is-ok">
        <span className="check" aria-hidden="true">
          ✓
        </span>
        <div>
          <strong>{d.title}</strong>
          <span>
            {d.number} · {formatWon(d.amount)}
          </span>
        </div>
      </div>
      <ApprovalLine line={d.line} />
    </CardShell>
  );
}

/** 도구 이름 → 화면 컴포넌트 */
export const APPROVAL_CARDS: Record<string, ComponentType<CardProps<any, any>>> = {
  [APPROVAL_TOOL.showDraft]: DraftCard,
  [APPROVAL_TOOL.showDraftResult]: DraftResultCard,
};
