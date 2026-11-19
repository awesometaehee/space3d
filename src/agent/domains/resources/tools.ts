import type { Reservation, ResourceKind, ResourceSlot } from '../../../data/resources';
import type { DateKey } from '../../../data/meetingRooms';
import type { ToolDefinition } from '../../agui';

/** 자원 예약 영역의 화면 도구. 흐름: 자원·시간대 고르기 → 확인 → 완료 */

export interface ResourceOption {
  id: string;
  name: string;
  detail: string;
  free: Record<ResourceSlot, boolean>;
}

export interface PickResourceArgs {
  kind: ResourceKind;
  kindLabel: string;
  date: DateKey;
  dateLabel: string;
  /** 사용자가 말한 시간대 (없으면 null) */
  slot: ResourceSlot | null;
  items: ResourceOption[];
}
export type PickResourceResult = { resourceId: string; slot: ResourceSlot } | { cancelled: true };

export interface ConfirmResourceArgs {
  resourceId: string;
  name: string;
  kind: ResourceKind;
  date: DateKey;
  dateLabel: string;
  slot: ResourceSlot;
  slotLabel: string;
  time: string;
  /** 용도 칸 이름 (차량은 "행선지") */
  purposeLabel: string;
  /** 쓸 때 알아 둘 점 */
  notes: string[];
}
export type ConfirmResourceResult = { confirmed: true; purpose: string } | { confirmed: false } | { back: true };

export interface ResourceResultArgs {
  reservation: Reservation;
  name: string;
  dateLabel: string;
  slotLabel: string;
  time: string;
}

export interface MyReservationsArgs {
  items: Array<{ id: string; name: string; kindLabel: string; dateLabel: string; slotLabel: string; purpose: string }>;
}

export const RESOURCE_TOOL = {
  pick: 'pick_resource',
  confirm: 'confirm_resource',
  result: 'show_resource_result',
  mine: 'show_my_reservations',
} as const;

export const RESOURCE_DISPLAY_ONLY = [RESOURCE_TOOL.result, RESOURCE_TOOL.mine];

export const RESOURCE_TOOLS: ToolDefinition[] = [
  {
    name: RESOURCE_TOOL.pick,
    description: '그날 쓸 수 있는 법인차·장비·자율 좌석과 시간대(오전·오후·종일)를 보여 주고, 고른 자원과 시간대를 돌려받는다.',
    parameters: { type: 'object', required: ['kind', 'date', 'items'] },
  },
  {
    name: RESOURCE_TOOL.confirm,
    description: '예약 내용을 보여 주고 용도(선택)와 최종 확인을 받는다.',
    parameters: { type: 'object', required: ['resourceId', 'date', 'slot'] },
  },
  {
    name: RESOURCE_TOOL.result,
    description: '완료된 자원 예약을 요약 카드로 보여 준다.',
    parameters: { type: 'object', required: ['reservation'] },
  },
  {
    name: RESOURCE_TOOL.mine,
    description: '내 자원 예약 목록을 보여 준다.',
    parameters: { type: 'object', required: ['items'] },
  },
];
