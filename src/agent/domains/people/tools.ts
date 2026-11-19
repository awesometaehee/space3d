import type { PersonInfo } from '../../../data/people';
import type { PresenceStatus } from '../../../data/presence';
import type { ToolDefinition } from '../../agui';

/** 사람·조직 찾기 영역의 화면 도구 (모두 보여 주기만 한다) */

export interface PersonCard extends PersonInfo {
  status: PresenceStatus;
  /** 요청과 맞은 담당 업무 (강조용) */
  matched: string[];
}

export interface ShowPeopleArgs {
  /** 무엇으로 찾았는지 ("보안 점검 담당", "이름") */
  query: string;
  people: PersonCard[];
}

export interface ShowOrgArgs {
  teams: Array<{
    team: string;
    location: string;
    members: Array<{ id: string; name: string; title: string; status: PresenceStatus; duty: string }>;
  }>;
}

export const PEOPLE_TOOL = {
  showPeople: 'show_people',
  showOrg: 'show_org',
} as const;

export const PEOPLE_DISPLAY_ONLY = [PEOPLE_TOOL.showPeople, PEOPLE_TOOL.showOrg];

export const PEOPLE_TOOLS: ToolDefinition[] = [
  {
    name: PEOPLE_TOOL.showPeople,
    description: '사람 카드(팀·직급·담당 업무·내선·업무 메일·근무 위치·재실)를 보여 준다. 복셀에 자리가 있으면 그 자리를 비춘다.',
    parameters: { type: 'object', required: ['people'] },
  },
  {
    name: PEOPLE_TOOL.showOrg,
    description: '팀별 구성원(이름·직급·대표 담당 업무·재실)을 보여 준다.',
    parameters: { type: 'object', required: ['teams'] },
  },
];
