import type { DraftedApproval, DraftInput, LineStep } from '../../../data/approvals';
import type { ToolDefinition } from '../../agui';
import type { DraftField } from './intent';

/**
 * 전자결재 영역의 화면 도구 (대화 카드).
 * 결재함 조회·처리는 고정 작업 화면이 맡고, 에이전트는 공유 상태(approval.view)로 그 화면을 조작한다.
 * 대화 카드는 대화에서 시작하는 기안에만 쓴다.
 */

export interface ShowDraftArgs {
  draft: DraftInput;
  line: LineStep[];
  /** 요청에서 읽지 못해 사용자가 채워야 하는 칸 */
  missing: DraftField[];
}
export type ShowDraftResult = { submitted: true; draft: DraftInput } | { cancelled: true };

export interface ShowDraftResultArgs {
  drafted: DraftedApproval;
  form: DraftInput['form'];
}

export const APPROVAL_TOOL = {
  showDraft: 'show_approval_draft',
  showDraftResult: 'show_draft_result',
} as const;

export const APPROVAL_DISPLAY_ONLY = [APPROVAL_TOOL.showDraftResult];

export const APPROVAL_TOOLS: ToolDefinition[] = [
  {
    name: APPROVAL_TOOL.showDraft,
    description: '기안서 초안을 편집 가능한 폼으로 보여 주고, 사용자가 상신하면 최종 내용을 돌려받는다.',
    parameters: { type: 'object', required: ['draft', 'line'] },
  },
  {
    name: APPROVAL_TOOL.showDraftResult,
    description: '상신한 문서를 요약해 보여 준다.',
    parameters: { type: 'object', required: ['drafted'] },
  },
];
