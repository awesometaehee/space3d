import { resourceById, type ResourceSlot } from '../../../data/resources';
import type { DomainUI, SceneHint } from '../../domain';
import { RESOURCE_CARDS } from './cards';
import {
  RESOURCE_DISPLAY_ONLY,
  RESOURCE_TOOL,
  RESOURCE_TOOLS,
  type ConfirmResourceArgs,
  type PickResourceArgs,
  type ResourceResultArgs,
} from './tools';

const isDesk = (id: unknown): id is string => typeof id === 'string' && resourceById(id)?.kind === 'desk';

/**
 * 자원 예약: 화면 쪽 묶음.
 * 자율 좌석을 고를 때만 복셀 중심(좁은 패널)이고, 쓸 수 있는 자리를 강조해 3D에서 바로 고를 수 있다.
 * 법인차·장비는 공간 정보가 없어 넓은 패널.
 */
export const resourcesUI: DomainUI = {
  id: 'resources',
  tools: RESOURCE_TOOLS,
  cards: RESOURCE_CARDS,
  displayOnly: RESOURCE_DISPLAY_ONLY,
  spatial: (state) => state.resources.request?.kind === 'desk',
  scene(call, args, streaming): SceneHint | null {
    const hint: SceneHint = { candidates: [], active: null, focus: [], pickCallId: null };
    if (call.function.name === RESOURCE_TOOL.pick) {
      const a = args as Partial<PickResourceArgs> | undefined;
      if (a?.kind !== 'desk') return null;
      const want = a.slot ?? null;
      const desks = (a.items ?? []).filter(
        (i) => i && isDesk(i.id) && i.free && (want ? i.free[want] === true : i.free.am === true || i.free.pm === true),
      );
      hint.candidates = desks.map((d) => d.id);
      hint.focus = hint.candidates;
      if (!streaming) {
        hint.pickCallId = call.id;
        // 3D에서 자리를 누르면: 말한 시간대, 없으면 되는 가장 긴 시간대로 고른다
        hint.pick = (id) => {
          const free = desks.find((d) => d.id === id)?.free;
          const slot: ResourceSlot = want ?? (free?.day ? 'day' : free?.am ? 'am' : 'pm');
          return { resourceId: id, slot };
        };
      }
      return hint;
    }
    if (call.function.name === RESOURCE_TOOL.confirm) {
      const id = (args as Partial<ConfirmResourceArgs> | undefined)?.resourceId;
      if (!isDesk(id)) return null;
      hint.active = id;
      hint.focus = [id];
      return hint;
    }
    if (call.function.name === RESOURCE_TOOL.result) {
      const id = (args as Partial<ResourceResultArgs> | undefined)?.reservation?.resourceId;
      if (isDesk(id)) hint.focus = [id];
      return hint;
    }
    return null;
  },
};
