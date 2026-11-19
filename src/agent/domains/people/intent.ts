import { DIRECTORY, TEAMS } from '../../../data/calendar';

export type PeopleIntent =
  /** 이름으로 찾기: "단비 연락처", "마루 수석 자리 어디야" */
  | { kind: 'person'; ids: string[] }
  /** 팀·조직도: "기획팀 누구 있어?", "조직도 보여줘" */
  | { kind: 'org'; teams: string[] }
  /** 담당 업무로 찾기: "보안 점검 담당자 누구야?" */
  | { kind: 'duty'; query: string };

const LOOKUP = /연락처|내선|전화|번호|메일|이메일|자리|어디|누구|담당|부서|소속|직급|찾아|알려/;

/** 요청에 나온 사람 이름 (낱말 안에 든 것은 빼고) */
export function namesIn(t: string): string[] {
  return DIRECTORY.filter((c) =>
    new RegExp(`${c.name}(?=$|[^가-힣]|님|씨|이|은|는|의|한테|에게|${c.title})`).test(t),
  ).map((c) => c.id);
}

export function teamsIn(t: string): string[] {
  const teams = TEAMS.filter((team) => t.includes(team) || t.includes(team.replace(/팀$/, ' 팀')));
  if (/우리\s*팀/.test(t) && !teams.includes('플랫폼팀')) teams.push('플랫폼팀');
  return teams;
}

/** 사람·조직 찾기 요청 같은지 (0~1) */
export function matchPeople(text: string): number {
  if (/조직도|담당자|담당하는|누구한테|누구에게|누구에게|어디에\s*문의|문의는?\s*누구/.test(text)) return 1;
  if (namesIn(text).length && LOOKUP.test(text)) return 1;
  if (teamsIn(text).length && /누구|구성|팀원|멤버|사람|명단/.test(text)) return 0.9;
  if (/누구|어디\s*있/.test(text)) return 0.4;
  return 0;
}

/**
 * 모의 에이전트용 규칙 기반 해석기. 실제 에이전트에서는 LLM이 이 역할을 한다.
 */
export function parsePeople(text: string): PeopleIntent {
  const t = text.replace(/\s+/g, ' ');
  const ids = namesIn(t);
  if (ids.length) return { kind: 'person', ids };
  const teams = teamsIn(t);
  if (/조직도/.test(t)) return { kind: 'org', teams };
  if (teams.length && !/담당/.test(t)) return { kind: 'org', teams };
  return { kind: 'duty', query: t };
}
