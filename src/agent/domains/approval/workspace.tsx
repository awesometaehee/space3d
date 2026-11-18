import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { formatWon, type ApprovalDoc, type ApprovalStore, type Decision } from '../../../data/approvals';
import { ApprovalLine, FormChip, ReviewNotes } from './parts';
import {
  FORMS,
  ONLY_LABEL,
  SORT_LABEL,
  describeFilter,
  filterInbox,
  openInbox,
  warnCount,
  type ApprovalOnly,
  type ApprovalSort,
  type ApprovalTab,
  type ApprovalView,
} from './view';

/**
 * 결재함 작업 화면 (고정 화면).
 * - 목록·필터·상세·승인·반려는 에이전트를 거치지 않고 저장소(그룹웨어 API 자리)를 바로 쓴다.
 * - 보기 상태(view)는 AG-UI 공유 상태에 있어서, 에이전트가 필터를 걸거나 문서를 열거나
 *   의견 초안을 넣으면 이 화면이 그대로 따라 움직인다.
 */
export interface ApprovalWorkspaceProps {
  store: ApprovalStore;
  view: ApprovalView;
  setView: (fn: (v: ApprovalView) => ApprovalView) => void;
  onClose: () => void;
}

export function useApprovals(store: ApprovalStore) {
  return useSyncExternalStore(store.subscribe, store.snapshot);
}

const shortDate = (ymd: string) => {
  const [, m, d] = ymd.split('-').map(Number);
  return `${m}/${d}`;
};

export function ApprovalWorkspace({ store, view, setView, onClose }: ApprovalWorkspaceProps) {
  const snap = useApprovals(store);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const selected = view.selectedId ? snap.inbox.find((d) => d.id === view.selectedId) : undefined;

  // 처리 결과 알림은 잠시 보여 주고 사라진다
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const tabs: Array<[ApprovalTab, string, number]> = [
    ['inbox', '결재할 문서', snap.inbox.length],
    ['processed', '처리한 문서', snap.processed.length],
    ['drafted', '내가 올린 문서', snap.drafted.length],
  ];

  const decide = (doc: ApprovalDoc, decision: Decision, comment: string) => {
    const done = store.decide(doc.id, decision, comment);
    setView((v) => ({ ...v, selectedId: null, commentDraft: null }));
    setNotice({
      text: `"${done.title}" 문서를 ${decision === 'approve' ? '승인' : '반려'}했어요. 남은 문서 ${store.inbox().length}건`,
      tone: decision === 'approve' ? 'ok' : 'warn',
    });
  };

  return (
    <section className="ws" aria-label="결재함">
      <header className="ws-head">
        <h2>결재함</h2>
        <nav className="ws-tabs" role="tablist" aria-label="결재함 보기">
          {tabs.map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view.tab === id}
              className={view.tab === id ? 'is-on' : ''}
              onClick={() => setView((v) => ({ ...v, tab: id, selectedId: null }))}
            >
              {label}
              <span className="count">{count}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="ws-close" aria-label="결재함 닫기" onClick={onClose}>
          ×
        </button>
      </header>

      {notice && (
        <p className={`ws-notice is-${notice.tone}`} role="status">
          {notice.text}
        </p>
      )}

      <div className="ws-body">
        {view.tab === 'inbox' &&
          (selected ? (
            <DocumentDetail
              key={selected.id}
              doc={selected}
              draft={view.commentDraft?.docId === selected.id ? view.commentDraft.text : null}
              onBack={() => setView((v) => ({ ...v, selectedId: null, commentDraft: null }))}
              onDecide={decide}
            />
          ) : (
            <InboxList docs={snap.inbox} view={view} setView={setView} />
          ))}
        {view.tab === 'processed' && <ProcessedList store={store} />}
        {view.tab === 'drafted' && <DraftedList store={store} />}
      </div>
    </section>
  );
}

function InboxList({ docs, view, setView }: { docs: ApprovalDoc[]; view: ApprovalView; setView: ApprovalWorkspaceProps['setView'] }) {
  const rows = filterInbox(docs, view);
  const filtered = !!describeFilter(view);
  const searchId = useId();
  return (
    <>
      <div className="ws-toolbar">
        <label htmlFor={searchId} className="sr-only">
          검색
        </label>
        <input
          id={searchId}
          className="ws-search"
          type="search"
          placeholder="제목, 기안자, 문서 번호"
          value={view.query}
          onChange={(e) => setView((v) => ({ ...v, query: e.target.value }))}
        />
        <div className="ws-seg" role="group" aria-label="보기">
          {(Object.keys(ONLY_LABEL) as ApprovalOnly[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={view.only === k}
              className={view.only === k ? 'is-on' : ''}
              onClick={() => setView((v) => ({ ...v, only: k }))}
            >
              {ONLY_LABEL[k]}
            </button>
          ))}
        </div>
        <select
          aria-label="양식"
          value={view.form}
          onChange={(e) => setView((v) => ({ ...v, form: e.target.value as ApprovalView['form'] }))}
        >
          <option value="all">모든 양식</option>
          {FORMS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <select
          aria-label="정렬"
          value={view.sort}
          onChange={(e) => setView((v) => ({ ...v, sort: e.target.value as ApprovalSort }))}
        >
          {(Object.keys(SORT_LABEL) as ApprovalSort[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="ws-summary">
        <span>
          {rows.length}건{filtered && <> · {describeFilter(view)}</>}
        </span>
        {filtered && (
          <button type="button" onClick={() => setView(() => openInbox())}>
            조건 지우기
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="ws-empty">{docs.length ? '조건에 맞는 문서가 없어요.' : '처리할 결재가 없어요.'}</p>
      ) : (
        <ul className="ws-list">
          {rows.map((d) => {
            const w = warnCount(d);
            return (
              <li key={d.id}>
                <button type="button" className="ws-row" onClick={() => setView((v) => ({ ...v, selectedId: d.id }))}>
                  <span className="ws-row-title">
                    <FormChip form={d.form} />
                    {d.urgent && <span className="urgent-chip">긴급</span>}
                    <strong>{d.title}</strong>
                  </span>
                  <span className="ws-row-meta">
                    {d.drafter.name} {d.drafter.title} · {shortDate(d.submittedOn)} · {d.number}
                  </span>
                  <span className="ws-row-side">
                    <span className="ws-amount">{d.amount ? formatWon(d.amount) : '–'}</span>
                    {w > 0 ? <span className="warn-chip">확인 {w}</span> : <span className="ok-chip">이상 없음</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function DocumentDetail({
  doc,
  draft,
  onBack,
  onDecide,
}: {
  doc: ApprovalDoc;
  /** 에이전트가 넣어 준 의견 초안 */
  draft: string | null;
  onBack: () => void;
  onDecide: (doc: ApprovalDoc, decision: Decision, comment: string) => void;
}) {
  const [comment, setComment] = useState(draft ?? '');
  const [fromAgent, setFromAgent] = useState(!!draft);
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [error, setError] = useState('');
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const commentId = useId();

  // 문서를 연 채로 에이전트가 새 초안을 넣으면 의견 칸에 반영한다
  useEffect(() => {
    if (draft === null) return;
    setComment(draft);
    setFromAgent(true);
    setConfirming(null);
  }, [draft]);

  const ask = (decision: Decision) => {
    if (decision === 'reject' && !comment.trim()) {
      setError('반려 사유를 적어 주세요.');
      commentRef.current?.focus();
      return;
    }
    setError('');
    setConfirming(decision);
  };

  const confirm = () => {
    if (!confirming) return;
    try {
      onDecide(doc, confirming, comment);
    } catch (e) {
      setError((e as Error).message);
      setConfirming(null);
    }
  };

  return (
    <article className="ws-detail">
      <div className="ws-detail-head">
        <button type="button" className="ws-back" onClick={onBack}>
          ← 목록
        </button>
        <span className="ws-detail-number">{doc.number}</span>
      </div>
      <h3>
        <FormChip form={doc.form} />
        {doc.urgent && <span className="urgent-chip">긴급</span>}
        {doc.title}
      </h3>
      <p className="ws-detail-meta">
        {doc.drafter.name} {doc.drafter.title} · {doc.drafter.team} · {doc.submittedOn}
      </p>

      <div className="doc-body">
        <div className="doc-main">
          {doc.amount !== undefined && <p className="doc-amount">{formatWon(doc.amount)}</p>}
          <dl className="doc-fields">
            {doc.fields.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
            <div>
              <dt>첨부</dt>
              <dd>{doc.attachments.length ? doc.attachments.join(', ') : '없음'}</dd>
            </div>
          </dl>
          <ApprovalLine line={doc.line} />
        </div>
        <div className="doc-side">
          <ReviewNotes notes={doc.notes} />
          <div className="doc-comment">
            <label htmlFor={commentId}>
              의견 {fromAgent && <span className="agent-chip">에이전트 초안</span>}
            </label>
            <textarea
              id={commentId}
              ref={commentRef}
              rows={3}
              maxLength={300}
              value={comment}
              placeholder="승인은 선택, 반려는 사유를 꼭 적어 주세요"
              aria-invalid={!!error}
              onChange={(e) => {
                setComment(e.target.value);
                setFromAgent(false);
                if (error) setError('');
              }}
            />
            {error && <p className="field-error">{error}</p>}
          </div>
        </div>
      </div>

      {confirming ? (
        <footer className="ws-actions confirm-bar">
          <span>{confirming === 'approve' ? '승인하면' : '반려하면'} 되돌릴 수 없어요.</span>
          <button type="button" className="ghost" onClick={() => setConfirming(null)}>
            돌아가기
          </button>
          <button type="button" className={confirming === 'approve' ? 'primary' : 'danger'} autoFocus onClick={confirm}>
            {confirming === 'approve' ? '승인 확정' : '반려 확정'}
          </button>
        </footer>
      ) : (
        <footer className="ws-actions">
          <button type="button" className="ghost" onClick={() => ask('reject')}>
            반려
          </button>
          <button type="button" className="primary" onClick={() => ask('approve')}>
            승인
          </button>
        </footer>
      )}
    </article>
  );
}

function ProcessedList({ store }: { store: ApprovalStore }) {
  const { processed } = useApprovals(store);
  if (!processed.length) return <p className="ws-empty">아직 처리한 문서가 없어요.</p>;
  return (
    <ul className="ws-list">
      {processed.map((p) => (
        <li key={p.docId} className="ws-row is-static">
          <span className="ws-row-title">
            <FormChip form={p.form} />
            <strong>{p.title}</strong>
          </span>
          <span className="ws-row-meta">
            {p.drafter} · {p.number} · {p.decidedAt}
            {p.comment && <> · 의견: {p.comment}</>}
          </span>
          <span className="ws-row-side">
            <span className="ws-amount">{p.amount ? formatWon(p.amount) : '–'}</span>
            <span className={p.decision === 'approve' ? 'ok-chip' : 'warn-chip'}>{p.decision === 'approve' ? '승인' : '반려'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function DraftedList({ store }: { store: ApprovalStore }) {
  const { drafted } = useApprovals(store);
  if (!drafted.length) {
    return <p className="ws-empty">아직 올린 문서가 없어요. 대화창에 "택시비 23,000원 지출결의 올려줘"처럼 말해 보세요.</p>;
  }
  return (
    <ul className="ws-list">
      {drafted.map((d) => {
        const now = d.line.find((s) => s.status === 'current');
        return (
          <li key={d.docId} className="ws-row is-static">
            <span className="ws-row-title">
              <FormChip form={d.form} />
              <strong>{d.title}</strong>
            </span>
            <span className="ws-row-meta">
              {d.number} · {d.submittedAt}
              {now && (
                <>
                  {' '}
                  · {now.role} 차례: {now.person.name} {now.person.title}
                </>
              )}
            </span>
            <span className="ws-row-side">
              <span className="ws-amount">{formatWon(d.amount)}</span>
              <span className="info-chip">진행 중</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
