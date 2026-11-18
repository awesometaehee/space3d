import { applyPatch, type AgUiEvent, type Message, type ToolCall } from './agui';

/** AG-UI 이벤트를 차례로 적용해 만든 대화 상태 */
export interface Conversation<S> {
  messages: Message[];
  state: S;
  /** 인자가 아직 스트리밍 중인 도구 호출 id */
  streamingToolCalls: string[];
  /** 글자가 아직 들어오는 중인 텍스트 메시지 id */
  streamingMessages: string[];
  running: boolean;
  error: string | null;
}

export function initialConversation<S>(state: S): Conversation<S> {
  return { messages: [], state, streamingToolCalls: [], streamingMessages: [], running: false, error: null };
}

type Assistant = Extract<Message, { role: 'assistant' }>;

function updateAssistant<S>(c: Conversation<S>, id: string, fn: (m: Assistant) => Assistant): Conversation<S> {
  return {
    ...c,
    messages: c.messages.map((m) => (m.id === id && m.role === 'assistant' ? fn(m) : m)),
  };
}

function findCallOwner(messages: Message[], toolCallId: string): Assistant | undefined {
  return messages.find(
    (m): m is Assistant => m.role === 'assistant' && !!m.toolCalls?.some((c) => c.id === toolCallId),
  );
}

/** 이벤트 하나를 적용한다 (순수 함수). */
export function applyEvent<S>(c: Conversation<S>, e: AgUiEvent): Conversation<S> {
  switch (e.type) {
    case 'RUN_STARTED':
      return { ...c, running: true, error: null };
    case 'RUN_FINISHED':
      return { ...c, running: false, streamingToolCalls: [], streamingMessages: [] };
    case 'RUN_ERROR':
      return { ...c, running: false, streamingToolCalls: [], streamingMessages: [], error: e.message };
    case 'TEXT_MESSAGE_START':
      return {
        ...c,
        messages: [...c.messages, { id: e.messageId, role: 'assistant', content: '' }],
        streamingMessages: [...c.streamingMessages, e.messageId],
      };
    case 'TEXT_MESSAGE_CONTENT':
      return updateAssistant(c, e.messageId, (m) => ({ ...m, content: (m.content ?? '') + e.delta }));
    case 'TEXT_MESSAGE_END':
      return { ...c, streamingMessages: c.streamingMessages.filter((id) => id !== e.messageId) };
    case 'TOOL_CALL_START': {
      const call: ToolCall = { id: e.toolCallId, type: 'function', function: { name: e.toolCallName, arguments: '' } };
      const next = { ...c, streamingToolCalls: [...c.streamingToolCalls, e.toolCallId] };
      if (e.parentMessageId && c.messages.some((m) => m.id === e.parentMessageId && m.role === 'assistant')) {
        return updateAssistant(next, e.parentMessageId, (m) => ({ ...m, toolCalls: [...(m.toolCalls ?? []), call] }));
      }
      return { ...next, messages: [...c.messages, { id: `${e.toolCallId}:msg`, role: 'assistant', toolCalls: [call] }] };
    }
    case 'TOOL_CALL_ARGS': {
      const owner = findCallOwner(c.messages, e.toolCallId);
      if (!owner) return c;
      return updateAssistant(c, owner.id, (m) => ({
        ...m,
        toolCalls: m.toolCalls?.map((t) =>
          t.id === e.toolCallId ? { ...t, function: { ...t.function, arguments: t.function.arguments + e.delta } } : t,
        ),
      }));
    }
    case 'TOOL_CALL_END':
      return { ...c, streamingToolCalls: c.streamingToolCalls.filter((id) => id !== e.toolCallId) };
    case 'STATE_SNAPSHOT':
      return { ...c, state: e.snapshot as S };
    case 'STATE_DELTA':
      return { ...c, state: applyPatch(c.state, e.delta) };
  }
}

/** 응답(tool 메시지)이 아직 없는 도구 호출 */
export function pendingToolCalls(messages: Message[]): ToolCall[] {
  const answered = new Set(messages.flatMap((m) => (m.role === 'tool' ? [m.toolCallId] : [])));
  return messages.flatMap((m) => (m.role === 'assistant' ? (m.toolCalls ?? []) : [])).filter((t) => !answered.has(t.id));
}
