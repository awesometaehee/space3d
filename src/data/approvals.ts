// PoC용 가상 결재 데이터. 실제 임직원·거래처·재무 정보가 아니다.
// 실제 연동 시 이 모듈만 그룹웨어 전자결재 API로 교체한다.

export type ApprovalForm = '지출결의' | '구매요청' | '출장신청' | '휴가신청';

export interface Person {
  name: string;
  title: string;
  team: string;
}

export type LineRole = '기안' | '검토' | '결재';
export type LineStatus = 'done' | 'current' | 'waiting' | 'rejected';

export interface LineStep {
  role: LineRole;
  person: Person;
  status: LineStatus;
}

/** 에이전트가 문서를 보고 정리한 확인 메모. 판단 보조일 뿐 최종 판단은 결재자가 한다 */
export interface ReviewNote {
  level: 'ok' | 'warn';
  text: string;
}

export interface ApprovalDoc {
  id: string;
  /** 문서 번호 */
  number: string;
  form: ApprovalForm;
  title: string;
  drafter: Person;
  /** 'YYYY-MM-DD' */
  submittedOn: string;
  urgent: boolean;
  amount?: number;
  fields: Array<{ label: string; value: string }>;
  line: LineStep[];
  attachments: string[];
  notes: ReviewNote[];
}

export type Decision = 'approve' | 'reject';

export interface ProcessedApproval {
  docId: string;
  number: string;
  form: ApprovalForm;
  title: string;
  /** "이름 직급" */
  drafter: string;
  amount?: number;
  decision: Decision;
  comment: string;
  /** 'YYYY-MM-DD HH:MM' */
  decidedAt: string;
}

export type PaymentMethod = '법인카드' | '개인 비용(정산)';

export interface DraftInput {
  form: '지출결의' | '구매요청';
  title: string;
  amount: number;
  /** 'YYYY-MM-DD' */
  usedOn: string;
  payment: PaymentMethod;
  purpose: string;
}

export interface DraftedApproval {
  docId: string;
  number: string;
  form: DraftInput['form'];
  title: string;
  amount: number;
  /** 'YYYY-MM-DD HH:MM' */
  submittedAt: string;
  line: LineStep[];
}

export const ME: Person = { name: '나', title: '팀장', team: '플랫폼팀' };
const P = (name: string, title: string, team = '플랫폼팀'): Person => ({ name, title, team });

/** 내가 기안할 때의 기본 결재선 (가상) */
export const DEFAULT_DRAFT_LINE: LineStep[] = [
  { role: '기안', person: ME, status: 'done' },
  { role: '검토', person: P('여름', '책임', '경영지원팀'), status: 'current' },
  { role: '결재', person: P('하랑', '수석', '경영지원팀'), status: 'waiting' },
];

export const formatWon = (n: number) => `${n.toLocaleString('ko-KR')}원`;

function seedInbox(): ApprovalDoc[] {
  return [
    {
      id: 'ap-1',
      number: '지출-2026-0138',
      form: '지출결의',
      title: '11월 팀 워크숍 다과비',
      drafter: P('단비', '선임'),
      submittedOn: '2026-11-17',
      urgent: false,
      amount: 184_000,
      fields: [
        { label: '사용일', value: '2026-11-14' },
        { label: '결제 수단', value: '법인카드' },
        { label: '내용', value: '팀 워크숍 다과·음료 (12인)' },
      ],
      line: [
        { role: '기안', person: P('단비', '선임'), status: 'done' },
        { role: '결재', person: ME, status: 'current' },
      ],
      attachments: ['영수증.pdf'],
      notes: [
        { level: 'ok', text: '팀 운영비 한도(월 50만 원) 안이에요.' },
        { level: 'ok', text: '영수증이 첨부되어 있어요.' },
      ],
    },
    {
      id: 'ap-2',
      number: '구매-2026-0057',
      form: '구매요청',
      title: '개발용 27인치 모니터 2대',
      drafter: P('라온', '매니저'),
      submittedOn: '2026-11-16',
      urgent: true,
      amount: 640_000,
      fields: [
        { label: '품목', value: '27인치 QHD 모니터 × 2' },
        { label: '납품 희망일', value: '2026-11-28' },
        { label: '내용', value: '신규 입사자 2명 업무 환경 구성' },
      ],
      line: [
        { role: '기안', person: P('라온', '매니저'), status: 'done' },
        { role: '검토', person: ME, status: 'current' },
        { role: '결재', person: P('하랑', '수석', '경영지원팀'), status: 'waiting' },
      ],
      attachments: ['견적서.pdf'],
      notes: [
        { level: 'warn', text: '50만 원 이상 구매는 경영지원팀 결재가 필요해요. 결재선에 포함되어 있어요.' },
        { level: 'ok', text: '견적서가 첨부되어 있어요.' },
      ],
    },
    {
      id: 'ap-3',
      number: '출장-2026-0091',
      form: '출장신청',
      title: '부산 협력사 기술 미팅 출장',
      drafter: P('도담', '책임'),
      submittedOn: '2026-11-18',
      urgent: false,
      amount: 420_000,
      fields: [
        { label: '기간', value: '2026-11-24 ~ 11-25 (1박 2일)' },
        { label: '장소', value: '부산' },
        { label: '예상 비용', value: '교통 180,000원 · 숙박 120,000원 · 일비 120,000원' },
      ],
      line: [
        { role: '기안', person: P('도담', '책임'), status: 'done' },
        { role: '결재', person: ME, status: 'current' },
      ],
      attachments: [],
      notes: [
        { level: 'warn', text: '숙박비가 출장 기준(1박 10만 원)보다 2만 원 많아요.' },
        { level: 'warn', text: '일정표가 첨부되지 않았어요.' },
      ],
    },
    {
      id: 'ap-4',
      number: '휴가-2026-0412',
      form: '휴가신청',
      title: '연차 1일',
      drafter: P('미르', '선임'),
      submittedOn: '2026-11-18',
      urgent: false,
      // 휴가 사유는 다루지 않는다 (재실 표시와 같은 원칙)
      fields: [
        { label: '종류', value: '연차' },
        { label: '기간', value: '2026-11-21 (1일)' },
        { label: '대결자', value: '바다 선임' },
      ],
      line: [
        { role: '기안', person: P('미르', '선임'), status: 'done' },
        { role: '결재', person: ME, status: 'current' },
      ],
      attachments: [],
      notes: [{ level: 'ok', text: '같은 날 팀 부재자가 없어요.' }],
    },
  ];
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

export interface ApprovalSnapshot {
  /** 내가 처리할 문서 (긴급 먼저, 그다음 오래된 순) */
  inbox: ApprovalDoc[];
  /** 내가 승인·반려한 문서 (최근 순) */
  processed: ProcessedApproval[];
  /** 내가 상신한 문서 (최근 순) */
  drafted: DraftedApproval[];
}

/**
 * 가상 결재 저장소 (그룹웨어 전자결재 API 자리). 화면을 새로 고치면 초기화된다.
 * 결재함 화면과 에이전트가 같은 저장소를 쓰고, 바뀌면 구독자에게 알린다.
 * 실제 연동 시에는 API 호출 + 캐시 무효화(또는 서버 이벤트)로 바꾼다.
 */
export class ApprovalStore {
  private readonly pending: ApprovalDoc[] = seedInbox();
  private readonly done: ProcessedApproval[] = [];
  private readonly drafts: DraftedApproval[] = [];
  private readonly listeners = new Set<() => void>();
  private snap: ApprovalSnapshot;
  private seq = 142;

  constructor(private readonly now: () => Date = () => new Date()) {
    this.snap = this.build();
  }

  private build(): ApprovalSnapshot {
    return {
      inbox: [...this.pending].sort(
        (a, b) => Number(b.urgent) - Number(a.urgent) || a.submittedOn.localeCompare(b.submittedOn),
      ),
      processed: [...this.done].reverse(),
      drafted: [...this.drafts].reverse(),
    };
  }

  private changed(): void {
    this.snap = this.build();
    this.listeners.forEach((fn) => fn());
  }

  /** React useSyncExternalStore용: 바뀔 때만 새 객체를 돌려준다 */
  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  readonly snapshot = (): ApprovalSnapshot => this.snap;

  inbox(): ApprovalDoc[] {
    return this.snap.inbox;
  }

  get(id: string): ApprovalDoc | undefined {
    return this.pending.find((d) => d.id === id);
  }

  decide(id: string, decision: Decision, comment: string): ProcessedApproval {
    const doc = this.get(id);
    if (!doc) throw new Error('이미 처리했거나 없는 문서예요.');
    if (decision === 'reject' && !comment.trim()) throw new Error('반려하려면 사유가 필요해요.');
    this.pending.splice(this.pending.indexOf(doc), 1);
    const processed: ProcessedApproval = {
      docId: doc.id,
      number: doc.number,
      form: doc.form,
      title: doc.title,
      drafter: `${doc.drafter.name} ${doc.drafter.title}`,
      amount: doc.amount,
      decision,
      comment: comment.trim(),
      decidedAt: stamp(this.now()),
    };
    this.done.push(processed);
    this.changed();
    return processed;
  }

  submit(input: DraftInput): DraftedApproval {
    if (!input.title.trim()) throw new Error('제목을 적어 주세요.');
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('금액을 확인해 주세요.');
    if (!input.purpose.trim()) throw new Error('내용을 적어 주세요.');
    const prefix = input.form === '구매요청' ? '구매' : '지출';
    const drafted: DraftedApproval = {
      docId: `my-${++this.seq}`,
      number: `${prefix}-${this.now().getFullYear()}-${String(this.seq).padStart(4, '0')}`,
      form: input.form,
      title: input.title.trim(),
      amount: Math.round(input.amount),
      submittedAt: stamp(this.now()),
      line: DEFAULT_DRAFT_LINE,
    };
    this.drafts.push(drafted);
    this.changed();
    return drafted;
  }
}
