// 테스트 도우미: 모의 에이전트를 한 번씩 실행하며 대화를 진행한다.
import type { AgUiEvent, Message, ToolCall } from './agui';
import { FRONTEND_TOOLS } from './catalog';
import { applyEvent, initialConversation, pendingToolCalls, type Conversation } from './conversation';
import { createMockAgent } from './mock/agent';
import { GroupwareBackend } from './mock/backend';
import type { AgentState } from './state';

export const NOW = new Date(2026, 10, 18, 10, 0); // 2026-11-18 (수) 10:00

export function setup() {
  const backend = new GroupwareBackend(() => NOW);
  const agent = createMockAgent({ backend, delayMs: 0, now: () => NOW });
  let conversation: Conversation<AgentState> = initialConversation(backend.initialState());
  let events: AgUiEvent[] = [];

  const run = async () => {
    events = [];
    const input = {
      threadId: 't',
      runId: `r${conversation.messages.length}`,
      messages: conversation.messages,
      tools: FRONTEND_TOOLS,
      state: conversation.state,
    };
    for await (const e of agent(input, new AbortController().signal)) {
      events.push(e);
      conversation = applyEvent(conversation, e);
    }
  };
  const push = (m: Message) => {
    conversation = { ...conversation, messages: [...conversation.messages, m] };
  };

  return {
    backend,
    get c() {
      return conversation;
    },
    get events() {
      return events;
    },
    /** 화면에서 공유 상태를 바꾼 것처럼 (예: 결재함에서 문서를 연다) */
    setState(fn: (s: AgentState) => AgentState) {
      conversation = { ...conversation, state: fn(conversation.state) };
    },
    /** 사용자 메시지를 보내고 실행한다 */
    async say(text: string) {
      push({ id: `u${conversation.messages.length}`, role: 'user', content: text });
      await run();
    },
    /** 답을 기다리는 가장 최근 카드 */
    get card(): ToolCall | undefined {
      const pending = pendingToolCalls(conversation.messages);
      return pending[pending.length - 1];
    },
    args<T>(): T {
      return JSON.parse(this.card!.function.arguments) as T;
    },
    /** 그 카드에 응답하고 다시 실행한다. 보여 주기만 하는 카드는 먼저 "표시함"으로 닫는다 */
    async answer(result: unknown, toolName?: string) {
      const pending = pendingToolCalls(conversation.messages);
      const target = toolName ? pending.find((t) => t.function.name === toolName) : pending[pending.length - 1];
      if (!target) throw new Error('답을 기다리는 카드가 없습니다');
      for (const t of pending) {
        if (t.id === target.id) continue;
        push({ id: `ack-${t.id}`, role: 'tool', toolCallId: t.id, content: '{"displayed":true}' });
      }
      push({ id: `tool-${target.id}`, role: 'tool', toolCallId: target.id, content: JSON.stringify(result) });
      await run();
    },
    /** 이번 실행에서 띄운 카드 이름들 */
    calledTools(): string[] {
      return events.flatMap((e) => (e.type === 'TOOL_CALL_START' ? [e.toolCallName] : []));
    },
    text(): string {
      return events.flatMap((e) => (e.type === 'TEXT_MESSAGE_CONTENT' ? [e.delta] : [])).join('');
    },
  };
}
