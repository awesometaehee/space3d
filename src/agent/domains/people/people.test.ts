import { describe, expect, it } from 'vitest';
import { isSpatial, sceneFor } from '../../catalog';
import { setup } from '../../testing';
import { matchSchedule } from '../schedule/intent';
import { matchPeople, parsePeople } from './intent';
import { PEOPLE_TOOL, type ShowOrgArgs, type ShowPeopleArgs } from './tools';

const lastArgs = <T,>(t: ReturnType<typeof setup>) =>
  JSON.parse(t.c.messages.flatMap((m) => (m.role === 'assistant' ? (m.toolCalls ?? []) : [])).at(-1)!.function.arguments) as T;
const lastCall = (t: ReturnType<typeof setup>) =>
  t.c.messages.flatMap((m) => (m.role === 'assistant' ? (m.toolCalls ?? []) : [])).at(-1)!;

describe('사람 찾기 해석', () => {
  it('이름·팀·담당 업무를 구분한다', () => {
    expect(parsePeople('단비 연락처 알려줘')).toEqual({ kind: 'person', ids: ['m2'] });
    expect(parsePeople('기획팀 누구 있어?')).toEqual({ kind: 'org', teams: ['기획팀'] });
    expect(parsePeople('조직도 보여줘')).toEqual({ kind: 'org', teams: [] });
    expect(parsePeople('보안 점검 담당자 누구야?').kind).toBe('duty');
  });

  it('사람과 회의를 잡는 말은 일정 조율이 맡는다', () => {
    expect(matchPeople('한결님이랑 회의 잡아줘')).toBe(0);
    expect(matchSchedule('한결님이랑 회의 잡아줘')).toBeGreaterThan(0);
    expect(matchPeople('한결님 자리 어디야')).toBe(1);
  });
});

describe('사람 찾기 흐름', () => {
  it('담당 업무로 찾고, 사무실에 자리가 있으면 그 자리를 비춘다', async () => {
    const t = setup();
    await t.say('보안 점검 담당자 누구야?');
    expect(t.c.state.activeDomain).toBe('people');
    expect(t.calledTools()).toEqual([PEOPLE_TOOL.showPeople]);
    const args = lastArgs<ShowPeopleArgs>(t);
    expect(args.people[0]).toMatchObject({ id: 'm2', name: '단비', matched: ['보안 점검'], seat: true, email: 'danbi@example.com' });
    expect(t.text()).toContain('보안 점검 담당은 플랫폼팀 단비 책임이에요');
    // 복셀 중심 레이아웃 + 그 자리로 카메라
    expect(t.c.state.people.focusIds).toEqual(['m2']);
    expect(isSpatial(t.c.state)).toBe(true);
    const hint = sceneFor(lastCall(t), args as never, false);
    expect(hint).toMatchObject({ focus: ['m2'], people: ['m2'] });
  });

  it('다른 층 사람은 넓은 패널로 보여 준다', async () => {
    const t = setup();
    await t.say('로고 디자인 문의는 누구한테 해?');
    const args = lastArgs<ShowPeopleArgs>(t);
    expect(args.people[0]).toMatchObject({ name: '나래', team: '디자인팀', seat: false });
    expect(isSpatial(t.c.state)).toBe(false);
  });

  it('이름으로 찾으면 재실 상태를 함께 알려 준다', async () => {
    const t = setup();
    t.backend.setPresence([{ id: 'm5', name: '마루', team: '플랫폼팀', title: '수석', status: 'meeting' }]);
    await t.say('마루 수석 자리 어디야?');
    expect(t.text()).toContain('마루 수석은 플랫폼팀 소속이고, 지금 회의 중이에요');
    expect(lastArgs<ShowPeopleArgs>(t).people[0].status).toBe('meeting');
  });

  it('팀 구성원을 조직도 카드로 보여 준다', async () => {
    const t = setup();
    await t.say('디자인팀 누구 있어?');
    expect(t.calledTools()).toEqual([PEOPLE_TOOL.showOrg]);
    const org = lastArgs<ShowOrgArgs>(t);
    expect(org.teams.map((x) => x.team)).toEqual(['디자인팀']);
    expect(org.teams[0].members.map((m) => m.name)).toEqual(['아름', '초롱', '나래']);
    expect(t.c.state.people.focusIds).toEqual([]);
  });

  it('못 찾으면 예시를 들어 다시 묻는다', async () => {
    const t = setup();
    await t.say('우주선 담당자 누구야?');
    expect(t.calledTools()).toEqual([]);
    expect(t.text()).toContain('찾지 못했어요');
  });
});
