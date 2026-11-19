// PoC용 가상 휴가·근태 데이터. 실제 임직원 정보가 아니다.
// - 휴가 사유(병가 등 건강 정보)는 받지도 저장하지도 않는다. 종류(연차·반차)와 날짜만 다룬다.
// - 다른 사람의 휴가는 "부재"로만 보여 준다 (재실 표시와 같은 원칙).
// - 근태는 내 기록만 다룬다.
// 실제 연동 시 이 모듈만 그룹웨어 근태 API로 교체한다.

import { ME_ID, isWeekend } from './calendar';
import { dateKey, toHHMM, type DateKey } from './meetingRooms';

export type LeaveKind = '연차' | '오전 반차' | '오후 반차';
export const LEAVE_KINDS: LeaveKind[] = ['연차', '오전 반차', '오후 반차'];
export const leaveDays = (kind: LeaveKind) => (kind === '연차' ? 1 : 0.5);

export interface LeaveRecord {
  id: string;
  /** 'me' 또는 조직도 id */
  personId: string;
  date: DateKey;
  kind: LeaveKind;
  status: '승인' | '결재 중';
  /** 대결자 id (내 휴가만) */
  delegateId?: string;
}

export interface LeaveBalance {
  /** 올해 받은 연차 */
  total: number;
  /** 이미 쓴 연차 */
  used: number;
  /** 앞으로 쓸 예정 (승인·결재 중) */
  planned: number;
  remaining: number;
}

export interface WorkDay {
  date: DateKey;
  /** 'HH:MM' (없으면 아직 기록 없음) */
  in: string | null;
  out: string | null;
  /** 휴가로 쉰 날 */
  leave: LeaveKind | null;
  /** 근무 분 (점심 1시간 제외) */
  minutes: number;
}

/** 팀원의 가상 휴가 (부재로만 보여 준다) */
const SEED_TEAM: Array<[string, DateKey, LeaveKind]> = [
  ['m5', '2026-11-20', '연차'],
  ['m3', '2026-11-20', '오전 반차'],
  ['m2', '2026-11-24', '오후 반차'],
  ['m10', '2026-11-23', '연차'],
  ['m8', '2026-11-27', '연차'],
  ['m12', '2026-11-27', '오전 반차'],
  ['m6', '2026-12-01', '연차'],
];

const TOTAL = 15;
const USED = 8.5;

export class LeaveStore {
  private readonly records: LeaveRecord[];
  private seq = 0;

  constructor(private readonly now: () => Date = () => new Date()) {
    this.records = SEED_TEAM.map(([personId, date, kind], i) => ({ id: `seed-lv-${i}`, personId, date, kind, status: '승인' }));
  }

  private today(): DateKey {
    return dateKey(this.now());
  }

  balance(): LeaveBalance {
    const planned = this.records
      .filter((r) => r.personId === ME_ID && r.date >= this.today())
      .reduce((n, r) => n + leaveDays(r.kind), 0);
    return { total: TOTAL, used: USED, planned, remaining: TOTAL - USED - planned };
  }

  /** 내 휴가 (앞으로) */
  mine(): LeaveRecord[] {
    return this.records.filter((r) => r.personId === ME_ID && r.date >= this.today()).sort((a, b) => a.date.localeCompare(b.date));
  }

  /** 그날 부재인 사람 (나 제외) */
  awayOn(date: DateKey): LeaveRecord[] {
    return this.records.filter((r) => r.date === date && r.personId !== ME_ID);
  }

  /** 기간 안의 팀원 부재 (나 제외, 날짜 순) */
  teamAway(from: DateKey, to: DateKey): LeaveRecord[] {
    return this.records
      .filter((r) => r.personId !== ME_ID && r.date >= from && r.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** 신청 전에 확인: 문제가 있으면 이유를 돌려준다 */
  check(kind: LeaveKind, dates: DateKey[]): string | null {
    if (!dates.length) return '날짜를 골라 주세요.';
    if (kind !== '연차' && dates.length > 1) return '반차는 하루만 신청할 수 있어요.';
    if (dates.some((d) => isWeekend(d))) return '주말은 신청할 수 없어요.';
    if (dates.some((d) => d < this.today())) return '지난 날짜는 신청할 수 없어요.';
    const taken = dates.filter((d) => this.records.some((r) => r.personId === ME_ID && r.date === d));
    if (taken.length) return `이미 휴가를 낸 날이 있어요: ${taken.join(', ')}`;
    const need = leaveDays(kind) * dates.length;
    if (need > this.balance().remaining) return `남은 연차(${this.balance().remaining}일)보다 많아요.`;
    return null;
  }

  request(kind: LeaveKind, dates: DateKey[], delegateId: string): LeaveRecord[] {
    const problem = this.check(kind, dates);
    if (problem) throw new Error(problem);
    const made = dates.map((date) => ({
      id: `lv-${++this.seq}`,
      personId: ME_ID,
      date,
      kind,
      status: '결재 중' as const,
      delegateId,
    }));
    this.records.push(...made);
    return made;
  }

  /** 이번 주(월~오늘) 내 출퇴근 기록. 오늘은 아직 퇴근 전 */
  week(): WorkDay[] {
    const now = this.now();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const days: WorkDay[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = dateKey(d);
      if (key > this.today()) break;
      const leave = this.records.find((r) => r.personId === ME_ID && r.date === key)?.kind ?? null;
      if (leave === '연차') {
        days.push({ date: key, in: null, out: null, leave, minutes: 8 * 60 });
        continue;
      }
      // 날짜마다 같은 값이 나오는 가상 출퇴근 시각
      const seed = d.getDate() * 7 + i * 13;
      const inMin = 8 * 60 + 30 + (seed % 5) * 10;
      const outMin = 17 * 60 + 50 + (seed % 7) * 15;
      const isToday = key === this.today();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const end = isToday ? nowMin : outMin;
      const worked = Math.max(0, end - inMin - (end > 13 * 60 ? 60 : 0));
      days.push({
        date: key,
        in: toHHMM(inMin),
        out: isToday ? null : toHHMM(outMin),
        leave,
        minutes: worked + (leave ? 4 * 60 : 0),
      });
    }
    return days;
  }
}
