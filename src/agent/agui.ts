/**
 * AG-UI(Agent–User Interaction Protocol) 이벤트·메시지 형식 중 이 PoC가 쓰는 부분.
 * 이름과 필드는 AG-UI 규격을 따르므로, 실제 에이전트 서버로 바꿀 때는
 * 이 파일을 공식 SDK(@ag-ui/core, @ag-ui/client)의 타입으로 교체하면 된다.
 */

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type Message =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content?: string; toolCalls?: ToolCall[] }
  | { id: string; role: 'tool'; content: string; toolCallId: string };

/** 프론트엔드가 구현하는 도구. 에이전트는 이름·설명·인자 스키마만 안다. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RunAgentInput<S = unknown> {
  threadId: string;
  runId: string;
  messages: Message[];
  tools: ToolDefinition[];
  state: S;
}

export type JsonPatchOp =
  | { op: 'add' | 'replace'; path: string; value: unknown }
  | { op: 'remove'; path: string };

export type AgUiEvent =
  | { type: 'RUN_STARTED'; threadId: string; runId: string }
  | { type: 'RUN_FINISHED'; threadId: string; runId: string }
  | { type: 'RUN_ERROR'; message: string }
  | { type: 'TEXT_MESSAGE_START'; messageId: string; role: 'assistant' }
  | { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'TEXT_MESSAGE_END'; messageId: string }
  | { type: 'TOOL_CALL_START'; toolCallId: string; toolCallName: string; parentMessageId?: string }
  | { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta: string }
  | { type: 'TOOL_CALL_END'; toolCallId: string }
  | { type: 'STATE_SNAPSHOT'; snapshot: unknown }
  | { type: 'STATE_DELTA'; delta: JsonPatchOp[] };

/** 이벤트 스트림을 내보내는 에이전트. 실제 연동 시 SSE(HttpAgent)로 바꾼다. */
export type Agent<S> = (input: RunAgentInput<S>, signal: AbortSignal) => AsyncIterable<AgUiEvent>;

/** STATE_DELTA에 쓰는 최소 JSON Patch(RFC 6902: add·replace·remove). 원본을 바꾸지 않는다. */
export function applyPatch<T>(doc: T, ops: JsonPatchOp[]): T {
  let root: unknown = structuredClone(doc);
  for (const op of ops) {
    const keys = op.path
      .split('/')
      .slice(1)
      .map((k) => k.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (keys.length === 0) {
      if (op.op === 'remove') throw new Error('문서 루트는 지울 수 없습니다.');
      root = structuredClone(op.value);
      continue;
    }
    let parent = root as Record<string, unknown> | unknown[];
    for (const key of keys.slice(0, -1)) {
      const child = (parent as Record<string, unknown>)[key];
      if (child === null || typeof child !== 'object') throw new Error(`경로가 없습니다: ${op.path}`);
      parent = child as Record<string, unknown> | unknown[];
    }
    const last = keys[keys.length - 1];
    if (Array.isArray(parent)) {
      const index = last === '-' ? parent.length : Number(last);
      if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`잘못된 배열 위치: ${op.path}`);
      if (op.op === 'add') parent.splice(index, 0, structuredClone(op.value));
      else if (index >= parent.length) throw new Error(`잘못된 배열 위치: ${op.path}`);
      else if (op.op === 'replace') parent[index] = structuredClone(op.value);
      else parent.splice(index, 1);
    } else {
      if (op.op !== 'add' && !(last in parent)) throw new Error(`경로가 없습니다: ${op.path}`);
      if (op.op === 'remove') delete parent[last];
      else parent[last] = structuredClone(op.value);
    }
  }
  return root as T;
}

/**
 * 스트리밍 중인 불완전한 JSON 인자를 최대한 해석한다. 카드를 점진적으로 그릴 때 쓴다.
 * 열린 문자열·괄호를 닫아 보고, 안 되면 마지막 쉼표 앞까지 잘라 다시 시도한다.
 */
export function parsePartialJson(text: string): unknown {
  let rest = text;
  for (let attempt = 0; attempt < 8 && rest.trim(); attempt++) {
    const value = tryClose(rest);
    if (value !== undefined) return value;
    const cut = rest.lastIndexOf(',');
    if (cut < 0) break;
    rest = rest.slice(0, cut);
  }
  return undefined;
}

function tryClose(text: string): unknown {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let fixed = text;
  if (inString) fixed += '"';
  fixed = fixed.replace(/[,:]\s*$/, '') + stack.reverse().join('');
  try {
    return JSON.parse(fixed);
  } catch {
    return undefined;
  }
}
