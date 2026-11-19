import type { DomainUI, SceneHint } from '../../domain';
import { LEAVE_CARDS } from './cards';
import { LEAVE_DISPLAY_ONLY, LEAVE_TOOL, LEAVE_TOOLS, type LeaveRequestArgs } from './tools';

/**
 * 휴가·근태: 화면 쪽 묶음.
 * 신청서는 넓은 패널에서 쓰고, 복셀은 줌 아웃한 채로 "그날의 사무실"을 미리 보여 준다:
 * 신청한 첫날 부재 예정인 팀원을 부재로 표시한다 (사유 없이).
 */
export const leaveUI: DomainUI = {
  id: 'leave',
  tools: LEAVE_TOOLS,
  cards: LEAVE_CARDS,
  displayOnly: LEAVE_DISPLAY_ONLY,
  spatial: () => false,
  scene(call, args): SceneHint | null {
    if (call.function.name !== LEAVE_TOOL.request) return null;
    const a = args as Partial<LeaveRequestArgs> | undefined;
    const first = a?.teamAway?.[0];
    const label = a?.dateLabels?.[0];
    if (!label) return null;
    const away = (a?.teamAway ?? []).filter((d) => d?.date === a?.dates?.[0]).flatMap((d) => d.ids ?? []);
    return {
      candidates: [],
      active: null,
      focus: [],
      pickCallId: null,
      away,
      note: `${label} 사무실 미리보기${first && away.length ? ` · 부재 ${away.length}명` : ''}`,
    };
  },
};
