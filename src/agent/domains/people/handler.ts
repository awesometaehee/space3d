import { DIRECTORY, TEAMS, colleagueById } from '../../../data/calendar';
import { personInfo, searchByDuty } from '../../../data/people';
import type { AgUiEvent } from '../../agui';
import { josa } from '../../parse';
import type { HandlerContext, MockHandler } from '../../mock/types';
import { matchPeople, parsePeople } from './intent';
import { PEOPLE_TOOL, type PersonCard, type ShowOrgArgs, type ShowPeopleArgs } from './tools';

const STATUS_WORD = { working: '근무 중', meeting: '회의 중', away: '부재' } as const;

const isWord = (word: string) => `${word}${josa(word, '이에요', '예요')}`;

function card(ctx: HandlerContext, id: string, matched: string[] = []): PersonCard | null {
  const c = colleagueById(id);
  if (!c) return null;
  return { ...personInfo(c), status: ctx.backend.statusOf(id), matched };
}

/** 복셀에서 비출 사람 (자리가 있는 사람만). 화면은 이것으로 복셀 중심 레이아웃을 고른다 */
function setFocus(ids: string[]): AgUiEvent {
  return { type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/people/focusIds', value: ids }] };
}

async function* showPeople(ctx: HandlerContext, args: ShowPeopleArgs, lead: string): AsyncGenerator<AgUiEvent> {
  const seated = args.people.filter((p) => p.seat);
  yield setFocus(seated.map((p) => p.id));
  const where = seated.length
    ? seated.length === args.people.length
      ? ' 사무실에서 자리를 비춰 드릴게요.'
      : ` ${seated.map((p) => p.name).join('·')}님 자리는 사무실에서 비춰 드릴게요.`
    : '';
  yield* ctx.say(`${lead}${where}`);
  yield* ctx.callTool(PEOPLE_TOOL.showPeople, args);
}

function orgArgs(ctx: HandlerContext, teams: string[]): ShowOrgArgs {
  return {
    teams: teams.map((team) => {
      const members = DIRECTORY.filter((c) => c.team === team).map((c) => {
        const info = personInfo(c);
        return { id: c.id, name: c.name, title: c.title, status: ctx.backend.statusOf(c.id), duty: info.duties[0] ?? '' };
      });
      return { team, location: personInfo(DIRECTORY.find((c) => c.team === team)!).location, members };
    }),
  };
}

/** 사람·조직 찾기 모의 처리기 */
export const peopleHandler: MockHandler = {
  id: 'people',
  tools: new Set(Object.values(PEOPLE_TOOL)),
  match: (text) => matchPeople(text),

  async *onUser(text, ctx) {
    const intent = parsePeople(text);

    if (intent.kind === 'person') {
      const people = intent.ids.map((id) => card(ctx, id)).filter((p): p is PersonCard => !!p);
      const lead =
        people.length === 1
          ? `${people[0].name} ${people[0].title}${josa(people[0].title, '은', '는')} ${people[0].team} 소속이고, 지금 ${isWord(STATUS_WORD[people[0].status])}.`
          : `${people.map((p) => p.name).join('·')}님 정보예요.`;
      return yield* showPeople(ctx, { query: '이름', people }, lead);
    }

    if (intent.kind === 'org') {
      yield setFocus([]);
      const teams = intent.teams.length ? intent.teams : TEAMS;
      const args = orgArgs(ctx, teams);
      const count = args.teams.reduce((n, t) => n + t.members.length, 0);
      yield* ctx.say(
        intent.teams.length
          ? `${teams.join('·')} 구성원 ${count}명이에요.`
          : `조직도예요. ${teams.length}개 팀, ${count}명이에요. 팀 이름을 말씀하시면 그 팀만 보여 드릴게요.`,
      );
      yield* ctx.callTool(PEOPLE_TOOL.showOrg, args);
      return;
    }

    const found = searchByDuty(intent.query);
    if (!found.length) {
      yield setFocus([]);
      yield* ctx.say('맞는 담당자를 찾지 못했어요. 업무를 조금 더 구체적으로 말씀해 주세요. 예: "VPN 담당자 누구야?", "노트북 신청은 누구한테 해?"');
      return;
    }
    const people = found.map((f) => card(ctx, f.person.id, f.matched)).filter((p): p is PersonCard => !!p);
    const top = people[0];
    const lead =
      `${top.matched[0] ?? top.duties[0]} 담당은 ${top.team} ${top.name} ${isWord(top.title)} (내선 ${top.ext}).` +
      (people.length > 1 ? ` 관련 업무를 하는 분도 함께 보여 드릴게요.` : '');
    yield* showPeople(ctx, { query: `${top.matched[0] ?? '담당 업무'}`, people }, lead);
  },

  async *onToolResult() {
    // 보여 주기만 하는 카드라 응답할 일이 없다
  },
};
