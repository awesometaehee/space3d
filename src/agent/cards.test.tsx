import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parsePartialJson, type ToolCall } from './agui';
import { CARD_RENDERERS } from './catalog';
import type { CardStatus } from './cardKit';
import { setup } from './testing';

/** 실제 흐름을 돌려 각 카드가 받는 인자를 모은다 */
async function collectCalls(): Promise<ToolCall[]> {
  const calls: ToolCall[] = [];
  const grab = (t: ReturnType<typeof setup>) => {
    for (const m of t.c.messages) if (m.role === 'assistant') calls.push(...(m.toolCalls ?? []));
  };

  const room = setup();
  await room.say('내일 오후 4명 회의실 잡아줘');
  await room.answer({ roomId: 'room-a' });
  const slot = JSON.parse(room.card!.function.arguments).slots.find((s: { available: boolean }) => s.available);
  await room.answer({ start: slot.start, end: slot.end });
  await room.answer({ confirmed: true, title: '회의' });
  grab(room);

  const sc = setup();
  await sc.say('일정 조율해줘');
  await sc.answer({ attendeeIds: ['p1', 'p2'] });
  const time = JSON.parse(sc.card!.function.arguments).candidates[0];
  await sc.answer({ date: time.date, start: time.start, end: time.end });
  const free = JSON.parse(sc.card!.function.arguments).rooms.find((r: { fits: boolean; free: boolean }) => r.fits && r.free);
  await sc.answer({ roomId: free?.id ?? null });
  await sc.answer({ confirmed: true, title: '협의', note: '' });
  grab(sc);

  const lv = setup();
  await lv.say('금요일 연차 쓸게');
  await lv.answer({ submitted: true, kind: '연차', delegateId: 'm2' });
  await lv.say('남은 연차 알려줘');
  await lv.say('이번 주 근무시간');
  grab(lv);

  const pp = setup();
  await pp.say('보안 점검 담당자 누구야?');
  await pp.say('조직도 보여줘');
  grab(pp);

  const ap = setup();
  await ap.say('어제 택시비 23,000원 지출결의 올려줘');
  const { draft } = JSON.parse(ap.card!.function.arguments);
  await ap.answer({ submitted: true, draft });
  grab(ap);
  return calls;
}

describe('카드 렌더링', () => {
  it('모든 카드가 스트리밍 도중의 어떤 인자로도 깨지지 않는다', async () => {
    const calls = await collectCalls();
    const names = new Set(calls.map((c) => c.function.name));
    // 카탈로그의 모든 카드를 한 번 이상 확인했는지
    expect([...names].sort()).toEqual(Object.keys(CARD_RENDERERS).sort());

    for (const call of calls) {
      const Card = CARD_RENDERERS[call.function.name];
      const json = call.function.arguments;
      // 인자를 몇 글자씩 잘라 가며 스트리밍 중인 모든 단계를 흉내 낸다
      for (let i = 0; i <= json.length; i += 7) {
        const partial = parsePartialJson(json.slice(0, i));
        const statuses: CardStatus[] = i >= json.length ? ['awaiting', 'answered'] : ['streaming'];
        for (const status of statuses) {
          expect(() =>
            renderToString(
              <Card args={partial as never} status={status} result={undefined} respond={() => {}} onHoverRoom={() => {}} />,
            ),
          ).not.toThrow();
        }
      }
    }
  });
});
