import type { LeaveKind } from '../../../data/leave';
import type { DateKey } from '../../../data/meetingRooms';
import { parseDateRange } from '../../parse';

export type LeaveIntent =
  | {
      kind: 'request';
      leave: LeaveKind;
      dates: DateKey[];
      rangeLabel: string | null;
      /** "반차"만 말해서 오후로 짐작했는지 */
      halfGuessed: boolean;
      /** 건강 등 사유를 말했는지 (기록하지 않고 안내만 한다) */
      mentionedReason: boolean;
    }
  | { kind: 'status' }
  | { kind: 'attendance' };

/** 휴가·근태 요청 같은지 (0~1) */
export function matchLeave(text: string): number {
  // "휴가신청 문서만 보여줘"처럼 결재함을 말하면 전자결재 영역이 맡는다
  if (/문서|결재|휴가\s*신청\s*(만|건|목록)/.test(text)) return 0;
  if (/근무\s*시간|근태|출근|퇴근|초과\s*근무|야근|52\s*시간/.test(text)) return 1;
  if (/연차|반차|휴가|월차/.test(text)) {
    if (/쓸|쓰|낼|내고|내려|신청|올려|가려|갈게|쉴|쉬|남|잔여|며칠|몇|현황/.test(text)) return 1;
    return 0.6;
  }
  if (/쉴게|쉬고\s*싶|쉬려고|쉬어야/.test(text)) return 0.8;
  return 0;
}

/** 휴가 신청 중에 이어지는 말 ("오전 반차로", "목요일로") */
export function matchLeaveFollowUp(text: string): number {
  return /반차|연차|오전|오후|요일|내일|모레|일|주/.test(text) ? 0.5 : 0;
}

/**
 * 모의 에이전트용 규칙 기반 해석기. 실제 에이전트에서는 LLM이 이 역할을 한다.
 * 예) "금요일 연차 쓸게", "26~27일 휴가", "내일 오전 반차", "연차 몇 개 남았어?", "이번 주 근무시간"
 */
export function parseLeave(text: string, now: Date): LeaveIntent {
  const t = text.replace(/\s+/g, ' ');
  if (/근무\s*시간|근태|출근|퇴근|초과\s*근무|야근|52\s*시간/.test(t)) return { kind: 'attendance' };
  if (/(연차|휴가|월차).*(남|잔여|며칠|몇|현황)|(남은|잔여)\s*(연차|휴가)|휴가\s*현황/.test(t) && !/쓸|낼|신청/.test(t)) {
    return { kind: 'status' };
  }
  const range = parseDateRange(t, now);
  let leave: LeaveKind = '연차';
  let halfGuessed = false;
  if (/오전\s*반차|오전에?\s*쉬|오전만/.test(t)) leave = '오전 반차';
  else if (/오후\s*반차|오후에?\s*쉬|오후만/.test(t)) leave = '오후 반차';
  else if (/반차/.test(t)) {
    leave = '오후 반차';
    halfGuessed = true;
  }
  return {
    kind: 'request',
    leave,
    dates: range?.dates ?? [],
    rangeLabel: range?.label ?? null,
    halfGuessed,
    mentionedReason: /병가|아파|아픈|병원|진료|몸이|감기|수술|검진/.test(t),
  };
}
