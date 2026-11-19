// PoC용 가상 공용 자원(법인차·대여 장비·자율 좌석). 실제 자산 정보가 아니다.
// 차량 번호·운전면허 같은 정보는 다루지 않는다. 예약에는 자원, 날짜, 시간대, 용도(선택)만 남긴다.
// 실제 연동 시 이 모듈만 그룹웨어 자원 예약 API로 교체한다.

import { isWeekend } from './calendar';
import { dateKey, type DateKey } from './meetingRooms';

export type ResourceKind = 'vehicle' | 'equipment' | 'desk';
export type ResourceSlot = 'am' | 'pm' | 'day';

export const KIND_LABEL: Record<ResourceKind, string> = { vehicle: '법인차', equipment: '대여 장비', desk: '자율 좌석' };
export const SLOT_LABEL: Record<ResourceSlot, string> = { am: '오전', pm: '오후', day: '종일' };
export const SLOT_TIME: Record<ResourceSlot, string> = { am: '09:00–13:00', pm: '13:00–18:00', day: '09:00–18:00' };

export interface Resource {
  id: string;
  kind: ResourceKind;
  name: string;
  /** 한 줄 설명 */
  detail: string;
  /** 장비를 고를 때 쓰는 이름 (프로젝터·노트북·화상회의) */
  item?: 'projector' | 'laptop' | 'videokit';
}

export const RESOURCES: Resource[] = [
  { id: 'car-1', kind: 'vehicle', name: '업무차 1호', detail: '경차 · 4인 · 휘발유' },
  { id: 'car-2', kind: 'vehicle', name: '업무차 2호', detail: 'SUV · 7인 · 전기' },
  { id: 'eq-proj', kind: 'equipment', name: '이동형 빔프로젝터', detail: 'HDMI·USB-C 연결, 스크린 포함', item: 'projector' },
  { id: 'eq-lap-1', kind: 'equipment', name: '대여 노트북 A', detail: '14인치 · 발표·교육용', item: 'laptop' },
  { id: 'eq-lap-2', kind: 'equipment', name: '대여 노트북 B', detail: '14인치 · 발표·교육용', item: 'laptop' },
  { id: 'eq-video', kind: 'equipment', name: '화상회의 키트', detail: '카메라 · 스피커폰', item: 'videokit' },
  // 자율 좌석 id는 3D 장면의 HOT_DESK_ZONES와 같다
  { id: 'desk-1', kind: 'desk', name: '자율석 1', detail: '노트북 자리 · 협업 벤치' },
  { id: 'desk-2', kind: 'desk', name: '자율석 2', detail: '모니터 1대 · 협업 벤치' },
  { id: 'desk-3', kind: 'desk', name: '자율석 3', detail: '듀얼 모니터 · 창가 벤치' },
  { id: 'desk-4', kind: 'desk', name: '자율석 4', detail: '노트북 자리 · 2인 자리' },
];

export const resourceById = (id: string) => RESOURCES.find((r) => r.id === id);

export interface Reservation {
  id: string;
  resourceId: string;
  date: DateKey;
  slot: ResourceSlot;
  /** 용도·행선지 (선택, 짧게) */
  purpose: string;
}

const covers = (a: ResourceSlot, b: ResourceSlot) => a === 'day' || b === 'day' || a === b;

/** 자원·날짜마다 항상 같은 결과가 나오는 가상 기존 예약 (오전·오후 중 하나 또는 없음) */
function seededTaken(resourceId: string, date: DateKey): ResourceSlot[] {
  let s = 3;
  for (const ch of resourceId + date) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  s = (s * 1664525 + 1013904223) >>> 0;
  const r = s / 4294967296;
  if (r < 0.4) return [];
  if (r < 0.65) return ['am'];
  if (r < 0.9) return ['pm'];
  return ['day'];
}

/** 가상 자원 예약 저장소. 화면을 새로 고치면 초기화된다 */
export class ResourceStore {
  private readonly made: Reservation[] = [];
  private seq = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  private taken(resourceId: string, date: DateKey): ResourceSlot[] {
    return [...seededTaken(resourceId, date), ...this.made.filter((r) => r.resourceId === resourceId && r.date === date).map((r) => r.slot)];
  }

  isFree(resourceId: string, date: DateKey, slot: ResourceSlot): boolean {
    if (isWeekend(date)) return false;
    // 오늘 오전이 이미 지났으면 오전·종일은 못 쓴다
    if (date === dateKey(this.now()) && slot !== 'pm' && this.now().getHours() >= 13) return false;
    return this.taken(resourceId, date).every((t) => !covers(t, slot));
  }

  /** 시간대별 가능 여부 */
  availability(resourceId: string, date: DateKey): Record<ResourceSlot, boolean> {
    return { am: this.isFree(resourceId, date, 'am'), pm: this.isFree(resourceId, date, 'pm'), day: this.isFree(resourceId, date, 'day') };
  }

  book(input: Omit<Reservation, 'id'>): Reservation {
    if (!resourceById(input.resourceId)) throw new Error('알 수 없는 자원이에요.');
    if (input.date < dateKey(this.now())) throw new Error('지난 날짜는 예약할 수 없어요.');
    if (!this.isFree(input.resourceId, input.date, input.slot)) throw new Error('이미 예약된 시간대예요.');
    const reservation = { ...input, purpose: input.purpose.trim().slice(0, 60), id: `rs-${++this.seq}` };
    this.made.push(reservation);
    return reservation;
  }

  /** 이번 대화에서 내가 한 예약 (오늘 이후, 날짜 순) */
  mine(): Reservation[] {
    const today = dateKey(this.now());
    return this.made.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  }
}
