// PoC용 가상 인물 정보. 실제 임직원 정보가 아니다.
// 업무 연락처 수준(이름·팀·직급·담당 업무·내선·업무 메일·근무 위치)만 둔다.
// 메일은 예시용 도메인(example.com)을 쓴다.
// 실제 연동 시 이 모듈만 그룹웨어 조직도 API로 교체한다.

import { DIRECTORY, type Colleague } from './calendar';
import type { PresenceStatus } from './presence';

export interface Profile {
  /** 담당 업무 (사람이 읽는 말) */
  duties: string[];
  /** 찾을 때 쓰는 낱말 */
  keywords: string[];
  ext: string;
  email: string;
  location: string;
}

const PROFILES: Record<string, Profile> = {
  m1: { duties: ['사내 포털 운영', '계정·권한 신청'], keywords: ['포털', '계정', '권한', '아이디', '비밀번호', '로그인'], ext: '3101', email: 'yeoreum', location: '3층 플랫폼팀' },
  m2: { duties: ['보안 점검', '취약점 조치'], keywords: ['보안', '점검', '취약점', '해킹', '악성', '피싱'], ext: '3102', email: 'danbi', location: '3층 플랫폼팀' },
  m3: { duties: ['프론트엔드', '디자인 시스템'], keywords: ['프론트', '화면', '웹', '디자인 시스템', '컴포넌트'], ext: '3103', email: 'dodam', location: '3층 플랫폼팀' },
  m4: { duties: ['장비 지급', '자산 관리'], keywords: ['장비', '노트북', '모니터', '키보드', '마우스', '자산', 'pc'], ext: '3104', email: 'raon', location: '3층 플랫폼팀' },
  m5: { duties: ['플랫폼 아키텍처', '기술 검토'], keywords: ['아키텍처', '설계', '기술 검토', '구조'], ext: '3105', email: 'maru', location: '3층 플랫폼팀' },
  m6: { duties: ['배포·CI', '서버 모니터링'], keywords: ['배포', 'ci', '서버', '모니터링', '장애', '빌드'], ext: '3106', email: 'saebyeok', location: '3층 플랫폼팀' },
  m7: { duties: ['회의실·시설 문의', '사무 환경'], keywords: ['시설', '회의실', '고장', '에어컨', '조명', '자리', '좌석', 'tv'], ext: '3107', email: 'harang', location: '3층 플랫폼팀' },
  m8: { duties: ['데이터베이스', '백업'], keywords: ['데이터베이스', 'db', '백업', '복구', '데이터'], ext: '3108', email: 'gaon', location: '3층 플랫폼팀' },
  m9: { duties: ['API 개발', '그룹웨어 연동'], keywords: ['api', '연동', '그룹웨어', '인터페이스'], ext: '3109', email: 'nuri', location: '3층 플랫폼팀' },
  m10: { duties: ['교육·온보딩', '사내 위키'], keywords: ['교육', '온보딩', '신입', '입사', '위키', '문서'], ext: '3110', email: 'dasom', location: '3층 플랫폼팀' },
  m11: { duties: ['모바일 앱'], keywords: ['모바일', '앱', '안드로이드', 'ios', '아이폰'], ext: '3111', email: 'mir', location: '3층 플랫폼팀' },
  m12: { duties: ['네트워크', 'VPN·와이파이'], keywords: ['네트워크', 'vpn', '와이파이', 'wifi', '인터넷', '망'], ext: '3112', email: 'bada', location: '3층 플랫폼팀' },
  p1: { duties: ['서비스 기획 총괄', '로드맵'], keywords: ['기획', '로드맵', '서비스', '우선순위'], ext: '4201', email: 'hangyeol', location: '4층 기획팀' },
  p2: { duties: ['요구사항 정리', '사용자 조사'], keywords: ['요구사항', '사용자 조사', '인터뷰', '설문'], ext: '4202', email: 'somang', location: '4층 기획팀' },
  p3: { duties: ['기획 문서 관리', '회의 운영'], keywords: ['기획서', '회의록', '문서 관리'], ext: '4203', email: 'haneul', location: '4층 기획팀' },
  d1: { duties: ['UX 총괄', '디자인 리뷰'], keywords: ['ux', '디자인 리뷰', '사용성'], ext: '4301', email: 'areum', location: '4층 디자인팀' },
  d2: { duties: ['UI 디자인', '아이콘'], keywords: ['ui', '아이콘', '시안', '화면 디자인'], ext: '4302', email: 'chorong', location: '4층 디자인팀' },
  d3: { duties: ['브랜드', '홍보물'], keywords: ['브랜드', '홍보', '로고', '포스터', '배너'], ext: '4303', email: 'narae', location: '4층 디자인팀' },
  s1: { duties: ['계약 지원 문의 창구'], keywords: ['계약', '영업', '고객 문의'], ext: '2401', email: 'deunsol', location: '2층 영업지원팀' },
  s2: { duties: ['견적·제안서 양식'], keywords: ['견적', '제안서', '양식'], ext: '2402', email: 'sechan', location: '2층 영업지원팀' },
};

export const EMAIL_DOMAIN = 'example.com';

/** 복셀 사무실(3층)에 자리가 있는 팀 */
export const SEATED_TEAM = '플랫폼팀';

export interface PersonInfo extends Colleague {
  duties: string[];
  ext: string;
  email: string;
  location: string;
  /** 복셀 사무실에 자리가 있는지 */
  seat: boolean;
}

export function personInfo(c: Colleague): PersonInfo {
  const p = PROFILES[c.id];
  return {
    ...c,
    duties: p?.duties ?? [],
    ext: p?.ext ?? '',
    email: p ? `${p.email}@${EMAIL_DOMAIN}` : '',
    location: p?.location ?? c.team,
    seat: c.team === SEATED_TEAM,
  };
}

/** 담당 업무로 사람 찾기: 요청 낱말이 담당 업무·찾기 낱말에 들어 있으면 점수를 준다 */
export function searchByDuty(text: string): Array<{ person: PersonInfo; matched: string[] }> {
  const t = text.toLowerCase();
  const results: Array<{ person: PersonInfo; matched: string[]; score: number }> = [];
  for (const c of DIRECTORY) {
    const p = PROFILES[c.id];
    if (!p) continue;
    const words = p.keywords.filter((k) => t.includes(k.toLowerCase()));
    if (!words.length) continue;
    const matched = p.duties.filter((d) => words.some((w) => d.toLowerCase().includes(w.toLowerCase())));
    results.push({ person: personInfo(c), matched: matched.length ? matched : [p.duties[0]], score: words.reduce((n, w) => n + w.length, 0) });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}

/** 다른 층 사람의 가상 재실 상태 (복셀에 없는 팀) */
const OTHER_PRESENCE: Record<string, PresenceStatus> = { d2: 'meeting', s2: 'away' };
export const otherPresence = (id: string): PresenceStatus => OTHER_PRESENCE[id] ?? 'working';
