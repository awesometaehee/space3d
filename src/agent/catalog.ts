import type { ToolCall } from './agui';
import type { AgentState } from './state';
import type { DomainUI, SceneHint } from './domain';
import { approvalUI } from './domains/approval';
import { meetingRoomUI } from './domains/meetingRoom';

/**
 * 화면이 아는 업무 영역 전체. 새 업무는 여기에 한 줄 추가한다.
 * 에이전트는 이 목록 밖의 카드를 띄울 수 없다.
 */
export const DOMAINS: DomainUI[] = [meetingRoomUI, approvalUI];

/** 실행할 때 에이전트에 함께 보내는 프론트엔드 도구 정의 */
export const FRONTEND_TOOLS = DOMAINS.flatMap((d) => d.tools);

/** 도구 이름 → 카드 */
export const CARD_RENDERERS = Object.assign({}, ...DOMAINS.map((d) => d.cards)) as DomainUI['cards'];

/** 응답 없이 보여 주기만 하는 도구 */
export const DISPLAY_ONLY_TOOLS: ReadonlySet<string> = new Set(DOMAINS.flatMap((d) => d.displayOnly));

/** 카드 하나에서 복셀에 보여 줄 공간 정보를 뽑는다. 공간 정보가 없는 업무면 null */
export function sceneFor(call: ToolCall, args: Record<string, unknown> | undefined, streaming: boolean): SceneHint | null {
  const domain = DOMAINS.find((d) => d.tools.some((t) => t.name === call.function.name));
  return domain?.scene?.(call, args, streaming) ?? null;
}

/** 복셀 화면이 필요한 업무 영역인지 (공간 정보를 내보내는 영역) */
export function isSpatialDomain(id: string | null): boolean {
  return !!id && !!DOMAINS.find((d) => d.id === id)?.scene;
}

/** 지금 열려 있는 고정 작업 화면 (하나만 연다) */
export function openWorkspace(state: AgentState): DomainUI | undefined {
  return DOMAINS.find((d) => d.workspace?.isOpen(state));
}

export function domainById(id: string): DomainUI | undefined {
  return DOMAINS.find((d) => d.id === id);
}
