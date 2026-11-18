import { Component, type ErrorInfo, type ReactNode } from 'react';

/** 모든 업무 카드가 함께 쓰는 틀 */

export type CardStatus = 'streaming' | 'awaiting' | 'answered';

export interface CardProps<A, R> {
  /** 스트리밍 중에는 일부만 채워져 있을 수 있다 */
  args: Partial<A> | undefined;
  status: CardStatus;
  /** 사용자가 고른 값. 새 요청으로 대체됐으면 { superseded: true } */
  result: R | { superseded: true } | undefined;
  respond: (result: R) => void;
  /** 3D 장면과 연동: 카드의 회의실에 마우스를 올리면 장면에서 강조한다 */
  onHoverRoom: (roomId: string | null) => void;
}

export const isSuperseded = (r: unknown): r is { superseded: true } =>
  !!r && typeof r === 'object' && 'superseded' in r;

export function CardShell({
  title,
  meta,
  badge,
  children,
  status,
}: {
  title: string;
  meta?: string;
  badge?: ReactNode;
  children: ReactNode;
  status: CardStatus;
}) {
  return (
    <section className={`agent-card is-${status}`} aria-busy={status === 'streaming'}>
      <header>
        <strong>
          {badge}
          {title}
        </strong>
        {meta && <span>{meta}</span>}
      </header>
      {children}
    </section>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card-skeleton" aria-label="불러오는 중">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

export function AnsweredNote({ result, children }: { result: unknown; children?: ReactNode }) {
  if (isSuperseded(result)) return <p className="card-note">새 요청으로 대체되었어요.</p>;
  if (result && typeof result === 'object' && 'cancelled' in result) return <p className="card-note">취소했어요.</p>;
  return children ? <p className="card-note">{children}</p> : null;
}

/**
 * 카드 하나가 그리다 실패해도 패널 전체가 멈추지 않게 한다.
 * 에이전트가 보낸 인자가 예상과 다를 때(실제 LLM 연결 시 특히) 대비한다.
 */
export class CardBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`카드를 그리지 못했어요: ${this.props.name}`, error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return <p className="card-note agent-error">이 화면({this.props.name})을 그리지 못했어요. 다시 요청해 주세요.</p>;
    }
    return this.props.children;
  }
}
