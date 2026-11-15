import { useEffect, useState } from 'react';

/** 사유(휴가·병가 등)는 다루지 않고 '부재'로만 추상화한다. */
export type PresenceStatus = 'working' | 'meeting' | 'away';

export interface Member {
  id: string;
  name: string;
  team: string;
  title: string;
  status: PresenceStatus;
}

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  working: '근무 중',
  meeting: '회의 중',
  away: '부재',
};

// PoC용 가상 데이터. 실제 임직원 정보가 아니다.
const NAMES = ['여름', '단비', '도담', '라온', '마루', '새벽', '하랑', '가온', '누리', '다솜', '미르', '바다'];
const TITLES = ['매니저', '책임', '선임', '매니저', '수석', '선임', '매니저', '책임', '선임', '매니저', '선임', '책임'];
const INITIAL: PresenceStatus[] = [
  'working', 'working', 'meeting', 'working', 'away', 'working',
  'working', 'meeting', 'working', 'working', 'away', 'working',
];

const MOCK_MEMBERS: Member[] = NAMES.map((name, i) => ({
  id: `m${i + 1}`,
  name,
  team: '플랫폼팀',
  title: TITLES[i],
  status: INITIAL[i],
}));

const STATUSES: PresenceStatus[] = ['working', 'working', 'meeting', 'away'];

/**
 * 가상 재실 상태 구독. 몇 초마다 한 명의 상태가 바뀐다.
 * 실제 연동 시 이 함수만 그룹웨어 재실 API(폴링 또는 SSE)로 교체하면 된다.
 */
export function subscribePresence(onChange: (members: Member[]) => void, intervalMs = 5000): () => void {
  let members = MOCK_MEMBERS;
  onChange(members);
  const timer = window.setInterval(() => {
    if (document.hidden) return;
    const i = Math.floor(Math.random() * members.length);
    const next = STATUSES.filter((s) => s !== members[i].status);
    const status = next[Math.floor(Math.random() * next.length)];
    members = members.map((m, k) => (k === i ? { ...m, status } : m));
    onChange(members);
  }, intervalMs);
  return () => window.clearInterval(timer);
}

export function usePresence(): Member[] {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => subscribePresence(setMembers), []);
  return members;
}
