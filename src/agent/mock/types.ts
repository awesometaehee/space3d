import type { AgUiEvent, Message } from '../agui';
import type { AgentState } from '../state';
import type { GroupwareBackend } from './backend';

/** 모의 에이전트의 처리기가 쓰는 도구 상자 */
export interface HandlerContext {
  now: Date;
  state: AgentState;
  messages: Message[];
  backend: GroupwareBackend;
  /** 글을 조금씩 스트리밍한다 */
  say(text: string): AsyncGenerator<AgUiEvent>;
  /** 화면 도구(카드)를 호출한다. 인자도 조금씩 스트리밍된다 */
  callTool(name: string, args: unknown): AsyncGenerator<AgUiEvent>;
  /** 이 대화에서 그 도구를 마지막으로 호출했을 때의 인자 */
  lastArgs<T>(toolName: string): T | undefined;
}

/**
 * 업무 영역 하나의 모의 처리기. 실제 에이전트에서는 LLM과 백엔드 도구가 이 역할을 한다.
 */
export interface MockHandler {
  id: string;
  /** 이 영역이 가진 화면 도구 이름 */
  tools: ReadonlySet<string>;
  /** 사용자 메시지가 이 영역 일인지 (0~1). 이어지는 대화를 알아보도록 지금 공유 상태도 받는다 */
  match(text: string, state: AgentState): number;
  onUser(text: string, ctx: HandlerContext): AsyncGenerator<AgUiEvent>;
  onToolResult(toolName: string, result: unknown, ctx: HandlerContext): AsyncGenerator<AgUiEvent>;
}
