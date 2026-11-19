import type { Resource, ResourceKind, ResourceSlot } from '../../../data/resources';
import type { DateKey } from '../../../data/meetingRooms';
import { parseDate, parseDateRange } from '../../parse';

/** 진행 중인 자원 예약 요청 (공유 상태 resources.request) */
export interface ResourceRequest {
  kind: ResourceKind;
  date: DateKey;
  /** 말한 시간대 (없으면 null: 카드에서 고른다) */
  slot: ResourceSlot | null;
  /** 장비 중 특정 품목만 */
  item: Resource['item'] | null;
}

export type ResourceIntent =
  | { kind: 'book'; request: ResourceRequest; dateGuessed: boolean }
  | { kind: 'mine' };

const VEHICLE = /법인\s*차|업무\s*차|차량|자동차|카\s*셰어|운전|차\s*(를|좀)?\s*(쓸|쓰|빌|예약|필요|있어|가능|되)/;
const EQUIPMENT = /빔\s*프로젝터|프로젝터|빔|대여\s*노트북|노트북\s*(을|좀)?\s*(대여|빌)|화상\s*회의\s*(키트|장비|카메라)|웹캠|스피커폰|장비\s*(을|좀)?\s*(대여|빌|예약)/;
const DESK = /자율\s*(좌석|석)|공용\s*(좌석|자리)|핫\s*데스크|좌석\s*(을|좀)?\s*(예약|잡)|자리\s*(를|좀)?\s*(예약|잡)/;
const ACTION = /쓸|쓰|빌|대여|예약|잡|필요|있어|가능|되나|돼|될까|남아/;

export function kindOf(text: string): ResourceKind | null {
  if (DESK.test(text)) return 'desk';
  if (EQUIPMENT.test(text)) return 'equipment';
  if (VEHICLE.test(text)) return 'vehicle';
  return null;
}

/** 자원 예약 요청 같은지 (0~1) */
export function matchResources(text: string): number {
  if (/(내|나의)\s*(자원\s*)?예약\s*(현황|내역|목록)?|자원\s*예약\s*(현황|내역|목록)/.test(text) && !/회의실/.test(text)) {
    return /자원|차|장비|좌석|자리/.test(text) || /내\s*예약/.test(text) ? 0.9 : 0;
  }
  const kind = kindOf(text);
  if (!kind) return 0;
  return ACTION.test(text) ? 1 : 0.7;
}

/**
 * 모의 에이전트용 규칙 기반 해석기. 실제 에이전트에서는 LLM이 이 역할을 한다.
 * 예) "내일 법인차 쓸 수 있어?", "금요일 오후 빔프로젝터 빌려줘", "오늘 자율석 예약해줘"
 */
export function parseResources(text: string, now: Date): ResourceIntent {
  const t = text.replace(/\s+/g, ' ');
  const kind = kindOf(t);
  if (!kind) return { kind: 'mine' };
  // 요일·"다음 주"도 읽는다. 기간을 말하면 첫날로 본다
  const range = parseDateRange(t, now);
  const { date, found } = range ? { date: range.dates[0], found: true } : parseDate(t, now);
  const slot: ResourceSlot | null = /종일|하루|온종일|전일/.test(t) ? 'day' : /오전|아침/.test(t) ? 'am' : /오후/.test(t) ? 'pm' : null;
  let item: ResourceRequest['item'] = null;
  if (kind === 'equipment') {
    item = /프로젝터|빔/.test(t) ? 'projector' : /노트북/.test(t) ? 'laptop' : /화상|카메라|웹캠|스피커폰/.test(t) ? 'videokit' : null;
  }
  return { kind: 'book', request: { kind, date, slot, item }, dateGuessed: !found };
}
