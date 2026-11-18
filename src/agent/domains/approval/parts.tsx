import type { LineStep, ReviewNote } from '../../../data/approvals';

/** 결재 화면과 대화 카드가 함께 쓰는 작은 조각들 */

export const FormChip = ({ form }: { form?: string }) => (form ? <span className="form-chip">{form}</span> : null);

const STATUS_MARK: Record<LineStep['status'], string> = { done: '✓', current: '●', waiting: '', rejected: '✕' };
const STATUS_LABEL: Record<LineStep['status'], string> = {
  done: '완료',
  current: '차례',
  waiting: '대기',
  rejected: '반려',
};

export function ApprovalLine({ line }: { line: Array<Partial<LineStep>> }) {
  // 스트리밍 중에는 마지막 단계가 덜 채워져 있을 수 있다
  const steps = line.filter((s): s is LineStep => !!s?.person?.name && !!s.status && !!s.role);
  return (
    <ol className="approval-line" aria-label="결재선">
      {steps.map((s, i) => (
        <li key={i} className={`is-${s.status}`}>
          <span className="role">{s.role}</span>
          <span className="who">
            {s.person.name} <small>{s.person.title}</small>
          </span>
          <span className="mark" aria-label={STATUS_LABEL[s.status]}>
            {STATUS_MARK[s.status]}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function ReviewNotes({ notes }: { notes: ReviewNote[] }) {
  return (
    <section className="review-notes" aria-label="에이전트 확인 메모">
      <h4>에이전트 확인 메모</h4>
      <ul>
        {notes.map((n, i) => (
          <li key={i} className={`is-${n.level}`}>
            <span aria-hidden="true">{n.level === 'ok' ? '✓' : '!'}</span>
            {n.text}
          </li>
        ))}
      </ul>
      <p>참고용이에요. 최종 판단은 결재자가 해요.</p>
    </section>
  );
}
