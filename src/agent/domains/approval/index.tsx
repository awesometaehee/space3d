import type { DomainUI } from '../../domain';
import { APPROVAL_CARDS } from './cards';
import { APPROVAL_DISPLAY_ONLY, APPROVAL_TOOLS } from './tools';
import { CLOSED_VIEW, openInbox } from './view';
import { ApprovalWorkspace } from './workspace';

/**
 * 전자결재: 화면 쪽 묶음.
 * - 결재함 조회·처리는 고정 작업 화면, 기안은 대화 카드.
 * - 공간 정보가 없어 복셀 연동(scene)은 두지 않는다.
 */
export const approvalUI: DomainUI = {
  id: 'approval',
  tools: APPROVAL_TOOLS,
  cards: APPROVAL_CARDS,
  displayOnly: APPROVAL_DISPLAY_ONLY,
  workspace: {
    title: '결재함',
    isOpen: (s) => s.approval.view.open,
    open: (s) => ({
      ...s,
      activeDomain: 'approval',
      approval: { ...s.approval, view: s.approval.view.open ? s.approval.view : openInbox() },
    }),
    close: (s) => ({ ...s, approval: { ...s.approval, view: CLOSED_VIEW } }),
    Component: ({ state, updateState, api }) => (
      <ApprovalWorkspace
        store={api.approvals}
        view={state.approval.view}
        setView={(fn) => updateState((s) => ({ ...s, approval: { ...s.approval, view: fn(s.approval.view) } }))}
        onClose={() => updateState((s) => ({ ...s, approval: { ...s.approval, view: CLOSED_VIEW } }))}
      />
    ),
  },
};
