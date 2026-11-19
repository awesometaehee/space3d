import { describe, expect, it } from 'vitest';
import { isSpatial, sceneFor } from '../../catalog';
import { NOW, setup } from '../../testing';
import { matchPeople } from '../people/intent';
import { matchResources, parseResources } from './intent';
import { RESOURCE_TOOL, type ConfirmResourceArgs, type PickResourceArgs } from './tools';

describe('자원 예약 해석', () => {
  it('종류·날짜·시간대·품목을 읽는다', () => {
    expect(parseResources('내일 법인차 쓸 수 있어?', NOW)).toMatchObject({
      kind: 'book',
      request: { kind: 'vehicle', date: '2026-11-19', slot: null, item: null },
      dateGuessed: false,
    });
    expect(parseResources('금요일 오후 빔프로젝터 빌려줘', NOW)).toMatchObject({
      request: { kind: 'equipment', date: '2026-11-20', slot: 'pm', item: 'projector' },
    });
    expect(parseResources('자율석 종일 예약해줘', NOW)).toMatchObject({
      request: { kind: 'desk', date: '2026-11-18', slot: 'day' },
      dateGuessed: true,
    });
  });

  it('"차"가 들어간 다른 말은 자원 예약으로 보지 않는다', () => {
    expect(matchResources('결재 차례 알려줘')).toBe(0);
    expect(matchResources('회의실 차이점')).toBe(0);
  });

  it('노트북 신청 담당자를 묻는 말은 사람 찾기가 맡는다', () => {
    expect(matchResources('노트북 신청은 누구한테 해?')).toBe(0);
    expect(matchPeople('노트북 신청은 누구한테 해?')).toBe(1);
  });
});

describe('자원 예약 흐름', () => {
  it('법인차: 고르기 → 확인 → 예약 (넓은 패널)', async () => {
    const t = setup();
    await t.say('내일 법인차 쓸 수 있어?');
    expect(t.c.state.activeDomain).toBe('resources');
    expect(isSpatial(t.c.state)).toBe(false);
    expect(t.card?.function.name).toBe(RESOURCE_TOOL.pick);
    const pick = t.args<PickResourceArgs>();
    expect(pick.items.map((i) => i.id)).toEqual(['car-1', 'car-2']);
    const item = pick.items.find((i) => i.free.am || i.free.pm)!;
    const slot = item.free.day ? 'day' : item.free.am ? 'am' : 'pm';

    await t.answer({ resourceId: item.id, slot });
    expect(t.card?.function.name).toBe(RESOURCE_TOOL.confirm);
    expect(t.args<ConfirmResourceArgs>().purposeLabel).toBe('행선지');

    await t.answer({ confirmed: true, purpose: '고객사 방문' });
    expect(t.card?.function.name).toBe(RESOURCE_TOOL.result);
    expect(t.c.state.resources.reservations[0]).toMatchObject({ resourceId: item.id, date: '2026-11-19', slot, purpose: '고객사 방문' });
    expect(t.c.state.resources.request).toBeNull();
    expect(t.backend.resources.isFree(item.id, '2026-11-19', slot)).toBe(false);
    // 종일을 잡았으면 오전·오후도 막힌다
    if (slot === 'day') expect(t.backend.resources.isFree(item.id, '2026-11-19', 'am')).toBe(false);
  });

  it('자율 좌석: 복셀 중심 + 3D에서 자리를 눌러 고를 수 있다', async () => {
    const t = setup();
    await t.say('내일 자율석 예약해줘');
    expect(isSpatial(t.c.state)).toBe(true);
    const pick = t.args<PickResourceArgs>();
    expect(pick.items.map((i) => i.id)).toEqual(['desk-1', 'desk-2', 'desk-3', 'desk-4']);
    const hint = sceneFor(t.card!, pick as never, false)!;
    const free = pick.items.filter((i) => i.free.am || i.free.pm).map((i) => i.id);
    expect(hint.candidates).toEqual(free);
    expect(hint.pickCallId).toBe(t.card!.id);
    // 3D에서 누르면 되는 가장 긴 시간대로 응답한다
    const desk = pick.items.find((i) => i.id === free[0])!;
    const answer = hint.pick!(desk.id) as { resourceId: string; slot: string };
    expect(answer.resourceId).toBe(desk.id);
    expect(desk.free[answer.slot as 'am' | 'pm' | 'day']).toBe(true);

    await t.answer(answer);
    const confirmHint = sceneFor(t.card!, t.args<ConfirmResourceArgs>() as never, false);
    expect(confirmHint).toMatchObject({ active: desk.id, focus: [desk.id] });
  });

  it('특정 장비만 보여 주고, 내 예약을 모아 본다', async () => {
    const t = setup();
    await t.say('모레 노트북 대여');
    expect(t.args<PickResourceArgs>().items.map((i) => i.id)).toEqual(['eq-lap-1', 'eq-lap-2']);
    const item = t.args<PickResourceArgs>().items.find((i) => i.free.am || i.free.pm)!;
    await t.answer({ resourceId: item.id, slot: item.free.am ? 'am' : 'pm' });
    await t.answer({ confirmed: true, purpose: '' });

    await t.say('내 예약 현황 보여줘');
    expect(t.calledTools()).toEqual([RESOURCE_TOOL.mine]);
    expect(t.text()).toContain('1건');
  });

  it('다시 고르기와 취소', async () => {
    const t = setup();
    await t.say('내일 화상회의 키트 빌려줘');
    const item = t.args<PickResourceArgs>().items[0];
    const slot = item.free.am ? 'am' : 'pm';
    await t.answer({ resourceId: item.id, slot });
    await t.answer({ back: true });
    expect(t.card?.function.name).toBe(RESOURCE_TOOL.pick);
    await t.answer({ cancelled: true });
    expect(t.c.state.resources.request).toBeNull();
    expect(t.card).toBeUndefined();
  });
});
