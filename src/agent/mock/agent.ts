import type { Agent, AgUiEvent, Message, RunAgentInput } from '../agui';
import { approvalHandler } from '../domains/approval/handler';
import { meetingRoomHandler } from '../domains/meetingRoom/handler';
import type { AgentState } from '../state';
import { GroupwareBackend } from './backend';
import type { HandlerContext, MockHandler } from './types';

/** 업무 영역 처리기 목록. 새 업무는 여기에 추가한다 */
const HANDLERS: MockHandler[] = [approvalHandler, meetingRoomHandler];

/** 이 점수보다 낮으면 어느 영역 일도 아니라고 본다 */
const MIN_MATCH = 0.3;

const HELP =
  '지금은 회의실 예약과 전자결재를 도와드릴 수 있어요. 예: "내일 오후 4명 회의실 잡아줘", "결재할 거 보여줘", "어제 택시비 23,000원 지출결의 올려줘"';

export interface MockAgentOptions {
  backend: GroupwareBackend;
  /** 스트리밍 지연(ms). 테스트에서는 0 */
  delayMs?: number;
  now?: () => Date;
}

/**
 * LLM 없이 규칙으로 움직이는 모의 에이전트 (라우터).
 * 실제 에이전트와 똑같이 AG-UI 이벤트를 스트리밍하므로, 서버형 에이전트로 바꿔도 화면 코드는 그대로다.
 */
export function createMockAgent({ backend, delayMs = 18, now = () => new Date() }: MockAgentOptions): Agent<AgentState> {
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

  return async function* run(input: RunAgentInput<AgentState>, signal: AbortSignal): AsyncGenerator<AgUiEvent> {
    const sleep = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(signal.reason);
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => (clearTimeout(timer), reject(signal.reason)), { once: true });
      });

    const ctx: HandlerContext = {
      now: now(),
      state: input.state,
      messages: input.messages,
      backend,
      async *say(text) {
        const messageId = id('msg');
        yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' };
        for (let i = 0; i < text.length; i += 3) {
          if (delayMs) await sleep(delayMs);
          yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: text.slice(i, i + 3) };
        }
        yield { type: 'TEXT_MESSAGE_END', messageId };
      },
      async *callTool(name, args) {
        const toolCallId = id('call');
        yield { type: 'TOOL_CALL_START', toolCallId, toolCallName: name };
        const json = JSON.stringify(args);
        for (let i = 0; i < json.length; i += 40) {
          if (delayMs) await sleep(delayMs);
          yield { type: 'TOOL_CALL_ARGS', toolCallId, delta: json.slice(i, i + 40) };
        }
        yield { type: 'TOOL_CALL_END', toolCallId };
      },
      lastArgs: <T,>(name: string) => findLastArgs<T>(input.messages, name),
    };

    /** 처리할 업무 영역을 화면에 먼저 알린다 (바뀔 때만). 화면은 이것으로 레이아웃을 바꾼다 */
    async function* setActive(domain: string | null): AsyncGenerator<AgUiEvent> {
      if (input.state.activeDomain === domain) return;
      yield { type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/activeDomain', value: domain }] };
    }

    async function* respond(): AsyncGenerator<AgUiEvent> {
      const last = input.messages.at(-1);
      if (!last || last.role === 'assistant') return;

      if (last.role === 'user') {
        const ranked = HANDLERS.map((h) => ({ h, score: h.match(last.content, input.state) })).sort((a, b) => b.score - a.score);
        const best = ranked[0];
        if (!best || best.score < MIN_MATCH) {
          yield* setActive(null);
          return yield* ctx.say(HELP);
        }
        yield* setActive(best.h.id);
        return yield* best.h.onUser(last.content, ctx);
      }

      // 도구 결과: 그 도구를 가진 영역이 맡는다
      const toolName = findToolName(input.messages, last.toolCallId);
      const result = JSON.parse(last.content) as unknown;
      // 표시용 카드의 "보여 줌"·"대체됨" 응답에는 답하지 않는다
      if (result && typeof result === 'object' && ('displayed' in result || 'superseded' in result)) return;
      const owner = HANDLERS.find((h) => toolName && h.tools.has(toolName));
      if (!owner || !toolName) return yield* ctx.say('어떤 화면에 대한 응답인지 찾지 못했어요. 다시 말씀해 주세요.');
      yield* setActive(owner.id);
      yield* owner.onToolResult(toolName, result, ctx);
    }

    yield { type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId };
    try {
      yield* respond();
    } catch (error) {
      if (signal.aborted) throw error;
      yield { type: 'RUN_ERROR', message: (error as Error).message };
      return;
    }
    yield { type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId };
  };
}

function findToolName(messages: Message[], toolCallId: string): string | undefined {
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    const call = m.toolCalls?.find((c) => c.id === toolCallId);
    if (call) return call.function.name;
  }
  return undefined;
}

function findLastArgs<T>(messages: Message[], name: string): T | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    const calls = m.toolCalls ?? [];
    for (let k = calls.length - 1; k >= 0; k--) {
      if (calls[k].function.name === name) return JSON.parse(calls[k].function.arguments) as T;
    }
  }
  return undefined;
}
