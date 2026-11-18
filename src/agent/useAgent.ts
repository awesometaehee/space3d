import { useCallback, useEffect, useRef, useState } from 'react';
import type { Agent, Message, ToolDefinition } from './agui';
import { applyEvent, initialConversation, pendingToolCalls, type Conversation } from './conversation';

interface Options<S> {
  agent: Agent<S>;
  initialState: S;
  tools: ToolDefinition[];
  /** 보여 주기만 하는 도구. 실행이 끝나면 자동으로 "표시함" 응답을 붙인다 (새 실행은 하지 않는다) */
  displayOnlyTools: ReadonlySet<string>;
}

let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++counter}`;

/**
 * AG-UI 에이전트와의 대화를 관리한다.
 * - sendMessage: 사용자 메시지를 붙이고 실행(run)을 시작한다.
 * - respondToTool: 화면 카드에서 고른 값을 도구 결과로 붙이고 다시 실행한다 (human-in-the-loop).
 */
export function useAgent<S>({ agent, initialState, tools, displayOnlyTools }: Options<S>) {
  const [conversation, setConversation] = useState<Conversation<S>>(() => initialConversation(initialState));
  const ref = useRef(conversation);
  const abortRef = useRef<AbortController | null>(null);
  const threadId = useRef(newId('thread')).current;

  const update = useCallback((fn: (c: Conversation<S>) => Conversation<S>) => {
    ref.current = fn(ref.current);
    setConversation(ref.current);
  }, []);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { messages, state } = ref.current;
    try {
      for await (const event of agent({ threadId, runId: newId('run'), messages, tools, state }, controller.signal)) {
        if (controller.signal.aborted) return;
        update((c) => applyEvent(c, event));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('에이전트 실행 실패', error);
      update((c) => ({ ...c, running: false, streamingToolCalls: [], streamingMessages: [], error: '에이전트와 연결하지 못했어요.' }));
      return;
    }
    if (abortRef.current === controller) abortRef.current = null;
    // 표시용 도구는 사용자 입력을 기다리지 않는다
    const shown = pendingToolCalls(ref.current.messages).filter((t) => displayOnlyTools.has(t.function.name));
    if (shown.length) {
      update((c) => ({
        ...c,
        messages: [
          ...c.messages,
          ...shown.map((t): Message => ({ id: newId('tool'), role: 'tool', toolCallId: t.id, content: '{"displayed":true}' })),
        ],
      }));
    }
  }, [agent, threadId, tools, displayOnlyTools, update]);

  const sendMessage = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content) return;
      // 새 요청이 오면 답을 기다리던 카드는 더 이상 쓰지 않는다
      update((c) => ({
        ...c,
        messages: [
          ...c.messages,
          ...pendingToolCalls(c.messages).map(
            (t): Message => ({ id: newId('tool'), role: 'tool', toolCallId: t.id, content: '{"superseded":true}' }),
          ),
          { id: newId('user'), role: 'user', content },
        ],
      }));
      void run();
    },
    [run, update],
  );

  const respondToTool = useCallback(
    (toolCallId: string, result: unknown) => {
      if (!pendingToolCalls(ref.current.messages).some((t) => t.id === toolCallId)) return;
      update((c) => ({
        ...c,
        messages: [...c.messages, { id: newId('tool'), role: 'tool', toolCallId, content: JSON.stringify(result) }],
      }));
      void run();
    },
    [run, update],
  );

  /**
   * 화면에서 공유 상태를 바꾼다 (AG-UI의 공유 상태는 양방향이다).
   * 바뀐 값은 다음 실행의 RunAgentInput.state로 에이전트에 전달된다.
   */
  const updateState = useCallback(
    (fn: (s: S) => S) => update((c) => ({ ...c, state: fn(c.state) })),
    [update],
  );

  /** 대화를 비운다. 공유 상태는 넘겨준 값으로 다시 시작한다 (예: 만든 예약은 유지) */
  const reset = useCallback(
    (state: S = initialState) => {
      abortRef.current?.abort();
      abortRef.current = null;
      update(() => initialConversation(state));
    },
    [initialState, update],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  return { conversation, sendMessage, respondToTool, updateState, reset };
}
