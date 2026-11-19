import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { parsePartialJson } from './agui';
import { StreamingBubble, UserBubble } from './bubbles';
import { CARD_RENDERERS } from './catalog';
import { CardBoundary, type CardStatus } from './cardKit';
import type { Conversation } from './conversation';

interface Props<S> {
  conversation: Conversation<S>;
  /** 패널 폭(px). 업무에 따라 바뀌며 CSS 변수로 넘겨 부드럽게 전환한다 */
  width: number;
  /** 복셀이 필요 없는 업무: 넓은 패널 */
  wide: boolean;
  /** 열려 있는 고정 작업 화면 (결재함 등). 있으면 왼쪽에 작업 화면, 오른쪽에 대화 열 */
  workspace?: ReactNode;
  /** 빈 대화일 때 보여 줄 예시 요청 */
  suggestions?: string[];
  respondToTool: (toolCallId: string, result: unknown) => void;
  onHoverRoom: (roomId: string | null) => void;
  onSuggest: (text: string) => void;
  onReset: () => void;
  onClose: () => void;
}

const SUGGESTIONS = [
  '결재할 문서 보여줘',
  '다음 주 기획팀이랑 1시간 회의 잡아줘',
  '금요일 연차 쓸게',
  '보안 점검 담당자 누구야?',
  '내일 오후 4명 회의실 잡아줘',
  '내일 법인차 쓸 수 있어?',
  '어제 택시비 23,000원 지출결의 올려줘',
];

/** 에이전트 대화와, 에이전트가 띄운 UI 카드가 순서대로 쌓이는 오른쪽 패널 */
export function AgentPanel<S>({
  conversation,
  width,
  wide,
  workspace,
  suggestions = SUGGESTIONS,
  respondToTool,
  onHoverRoom,
  onSuggest,
  onReset,
  onClose,
}: Props<S>) {
  const { messages, streamingToolCalls, streamingMessages, running, error } = conversation;
  const listRef = useRef<HTMLDivElement>(null);
  // 패널을 열 때 이미 있던 메시지는 다시 움직이지 않는다
  const seenAtOpen = useRef(new Set(messages.map((m) => m.id))).current;

  const results = new Map<string, unknown>();
  for (const m of messages) {
    if (m.role === 'tool') results.set(m.toolCallId, safeParse(m.content));
  }

  // 새 내용이 오면 맨 아래로. 답 말풍선은 스프링으로 커지므로 크기 변화도 따라간다
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const toBottom = () => (el.scrollTop = el.scrollHeight);
    toBottom();
    const observer = new ResizeObserver(toBottom);
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  }, [messages, running]);

  const items: ReactNode[] = [];
  // 답 말풍선의 key는 "바로 앞 메시지" 기준이다. 그래서 "생각 중" 자리표시가
  // 실제 답이 도착했을 때 다시 만들어지지 않고 그대로 이어서 자란다.
  messages.forEach((m, i) => {
    const after = `bubble-after-${messages[i - 1]?.id ?? 'start'}`;
    if (m.role === 'user') {
      items.push(<UserBubble key={m.id} text={m.content} animate={!seenAtOpen.has(m.id)} />);
      return;
    }
    if (m.role === 'tool') return;
    const streaming = streamingMessages.includes(m.id);
    if (m.content || streaming) {
      items.push(
        <StreamingBubble key={after} text={m.content ?? ''} streaming={streaming} animate={!seenAtOpen.has(m.id)} />,
      );
    }
    for (const call of m.toolCalls ?? []) {
      const Card = CARD_RENDERERS[call.function.name];
      if (!Card) {
        items.push(
          <p key={call.id} className="card-note">
            알 수 없는 화면 요청({call.function.name})이라 표시하지 않았어요.
          </p>,
        );
        continue;
      }
      const status: CardStatus = streamingToolCalls.includes(call.id)
        ? 'streaming'
        : results.has(call.id)
          ? 'answered'
          : 'awaiting';
      items.push(
        <CardBoundary key={call.id} name={call.function.name}>
          <Card
            args={parsePartialJson(call.function.arguments) as Record<string, unknown> | undefined}
            status={status}
            result={results.get(call.id)}
            respond={(r: unknown) => respondToTool(call.id, r)}
            onHoverRoom={onHoverRoom}
          />
        </CardBoundary>,
      );
    }
  });

  // 질문을 보냈고 답이 아직 시작되지 않았으면 "생각 중" 말풍선을 먼저 띄운다
  const last = messages[messages.length - 1];
  if (running && last && (last.role === 'user' || last.role === 'tool')) {
    items.push(<StreamingBubble key={`bubble-after-${last.id}`} text="" streaming animate />);
  }

  return (
    <aside
      className={`agent-panel${wide ? ' is-wide' : ''}${workspace ? ' has-ws' : ''}`}
      style={{ '--panel-w': `${width}px` } as CSSProperties}
      aria-label="업무 에이전트"
    >
      {workspace && <div className="panel-ws">{workspace}</div>}
      <div className="panel-chat">
      <header className="agent-head">
        <strong>에이전트</strong>
        <span className="agent-badge" title="LLM 없이 규칙으로 움직이는 시연용 에이전트">
          모의
        </span>
        <span className="agent-head-tools">
          {messages.length > 0 && (
            <button type="button" onClick={onReset}>
              새 대화
            </button>
          )}
          <button type="button" className="close" aria-label="패널 닫기" onClick={onClose}>
            ×
          </button>
        </span>
      </header>

      <div className="agent-log" ref={listRef} aria-live="polite">
        {messages.length === 0 && (
          <div className="agent-empty">
            <p>
              {workspace
                ? '왼쪽 화면을 보면서 필요한 일을 말해 주세요. 조건을 걸거나, 문서를 요약하거나, 의견 초안을 써 드려요.'
                : '결재 처리, 지출결의 작성, 회의실 예약을 도와드려요. 아래 입력창에 하고 싶은 일을 적으면 필요한 화면을 띄워 드려요.'}
            </p>
            <ul>
              {suggestions.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => onSuggest(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {items}
        {error && <p className="agent-error">{error}</p>}
      </div>
      </div>
    </aside>
  );
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
