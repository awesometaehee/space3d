import type { DomainUI, SceneHint } from '../../domain';
import { PEOPLE_CARDS } from './cards';
import { PEOPLE_DISPLAY_ONLY, PEOPLE_TOOL, PEOPLE_TOOLS, type ShowOrgArgs, type ShowPeopleArgs } from './tools';

/**
 * 사람·조직 찾기: 화면 쪽 묶음.
 * 찾은 사람이 복셀 사무실에 자리가 있으면 좁은 패널 + 그 자리로 카메라 이동,
 * 다른 층 사람이나 조직도는 넓은 패널.
 */
export const peopleUI: DomainUI = {
  id: 'people',
  tools: PEOPLE_TOOLS,
  cards: PEOPLE_CARDS,
  displayOnly: PEOPLE_DISPLAY_ONLY,
  spatial: (state) => state.people.focusIds.length > 0,
  scene(call, args): SceneHint | null {
    const hint: SceneHint = { candidates: [], active: null, focus: [], pickCallId: null };
    if (call.function.name === PEOPLE_TOOL.showPeople) {
      const people = ((args as Partial<ShowPeopleArgs> | undefined)?.people ?? []).filter(
        (p) => p && typeof p.id === 'string' && p.seat === true,
      );
      hint.people = people.map((p) => p.id);
      hint.focus = hint.people;
      return hint;
    }
    if (call.function.name === PEOPLE_TOOL.showOrg) {
      // 조직도에 나온 사람 중 사무실에 있는 사람의 이름표만 강조한다 (카메라는 그대로)
      const teams = (args as Partial<ShowOrgArgs> | undefined)?.teams ?? [];
      hint.people = teams.flatMap((t) => (Array.isArray(t?.members) ? t.members : [])).flatMap((m) => (m?.id ? [m.id] : []));
      return hint;
    }
    return null;
  },
};
