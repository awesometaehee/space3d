import type { ComponentType } from 'react';
import type { ToolCall, ToolDefinition } from './agui';
import type { CardProps } from './cardKit';
import type { GroupwareBackend } from './mock/backend';
import type { AgentState } from './state';

/** 고정 작업 화면이 받는 것 */
export interface WorkspaceProps {
  state: AgentState;
  /** 공유 상태를 화면에서 바꾼다. 다음 실행 때 에이전트가 이 값을 받는다 */
  updateState: (fn: (s: AgentState) => AgentState) => void;
  /** 그룹웨어 API 자리 (지금은 가상 백엔드) */
  api: GroupwareBackend;
}

/** 카드 하나가 복셀 화면에 보여 줄 공간 정보 */
export interface SceneHint {
  /** 고를 수 있는 후보 회의실 (강조 + 3D에서 클릭 가능) */
  candidates: string[];
  /** 지금 보고 있는 회의실 */
  active: string | null;
  /** 카메라를 맞출 회의실 */
  focus: string[];
  /** 3D에서 후보 방을 누르면 응답할 도구 호출 id */
  pickCallId: string | null;
}

/**
 * 화면 쪽 업무 영역 묶음. 새 업무를 붙일 때는 이 모양으로 만들어 catalog.ts에 추가한다.
 */
export interface DomainUI {
  id: string;
  /** 에이전트에 알려 줄 프론트엔드 도구 정의 */
  tools: ToolDefinition[];
  /** 도구 이름 → 카드 */
  // 카드마다 인자·결과 타입이 달라 카탈로그에서는 any로 모은다
  cards: Record<string, ComponentType<CardProps<any, any>>>;
  /** 보여 주기만 하는 도구 (응답을 기다리지 않는다) */
  displayOnly: readonly string[];
  /**
   * (선택) 고정 작업 화면. 조회·처리처럼 매번 에이전트를 거칠 필요가 없는 화면은 미리 만들어 두고,
   * 에이전트는 공유 상태로 이 화면을 조작한다. 열려 있으면 패널이 작업 화면 + 대화 열로 나뉜다.
   */
  workspace?: {
    title: string;
    isOpen: (state: AgentState) => boolean;
    /** 화면을 연 상태로 만든다 (하단 바 바로가기 등, 에이전트를 거치지 않고) */
    open: (state: AgentState) => AgentState;
    close: (state: AgentState) => AgentState;
    Component: ComponentType<WorkspaceProps>;
  };
  /** (선택) 이 영역의 카드가 복셀에 보여 줄 공간 정보 */
  scene?: (call: ToolCall, args: Record<string, unknown> | undefined, streaming: boolean) => SceneHint | null;
}
