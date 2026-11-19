import { describe, expect, it } from 'vitest';
import { isSpatial, sceneFor } from '../../catalog';
import { NOW, setup } from '../../testing';
import { matchApproval } from '../approval/intent';
import { matchLeave, parseLeave } from './intent';
import { LEAVE_TOOL, type AttendanceArgs, type LeaveRequestArgs, type LeaveStatusArgs } from './tools';

describe('휴가 요청 해석', () => {
  it('종류·날짜를 읽는다', () => {
    expect(parseLeave('금요일 연차 쓸게', NOW)).toMatchObject({ kind: 'request', leave: '연차', dates: ['2026-11-20'] });
    expect(parseLeave('내일 오전 반차', NOW)).toMatchObject({ leave: '오전 반차', dates: ['2026-11-19'] });
    expect(parseLeave('모레 반차 낼게', NOW)).toMatchObject({ leave: '오후 반차', halfGuessed: true });
    // 기간: 주말은 빠진다
    expect(parseLeave('11월 26일부터 30일까지 휴가', NOW)).toMatchObject({
      dates: ['2026-11-26', '2026-11-27', '2026-11-30'],
    });
    expect(parseLeave('26~27일 휴가', NOW)).toMatchObject({ dates: ['2026-11-26', '2026-11-27'] });
  });

  it('현황·근태 질문을 알아본다', () => {
    expect(parseLeave('연차 몇 개 남았어?', NOW).kind).toBe('status');
    expect(parseLeave('이번 주 근무시간', NOW).kind).toBe('attendance');
  });

  it('건강 관련 사유는 알아만 보고 기록하지 않는다', () => {
    const p = parseLeave('내일 병원 가야 해서 연차 쓸게', NOW);
    expect(p).toMatchObject({ kind: 'request', mentionedReason: true });
    expect(JSON.stringify(p)).not.toContain('병원');
  });

  it('휴가 신청은 휴가 영역이, 휴가신청 문서 조회는 전자결재가 맡는다', () => {
    expect(matchLeave('금요일 휴가 신청할게')).toBe(1);
    expect(matchApproval('금요일 휴가 신청할게')).toBe(0);
    expect(matchLeave('휴가신청 문서만 보여줘')).toBe(0);
    expect(matchLeave('휴가신청만')).toBe(0);
  });
});

describe('휴가 신청 흐름', () => {
  it('신청서 → 상신 → 결재함 "내가 올린 문서"까지 이어진다', async () => {
    const t = setup();
    await t.say('금요일 연차 쓸게');
    expect(t.c.state.activeDomain).toBe('leave');
    expect(isSpatial(t.c.state)).toBe(false);
    expect(t.card?.function.name).toBe(LEAVE_TOOL.request);
    const args = t.args<LeaveRequestArgs>();
    expect(args.dates).toEqual(['2026-11-20']);
    expect(args.balance.remaining).toBe(6.5);
    // 그날 부재인 마루 수석은 대결자로 고를 수 없고, 기본 대결자는 부재가 아닌 사람
    expect(args.delegates.find((d) => d.name === '마루')?.away).toBe(true);
    expect(args.delegateId).toBe('m2');
    expect(args.teamAway[0].names).toEqual(['마루', '도담']);
    expect(t.text()).toContain('마루·도담님도 부재');

    // 복셀: 그날 부재 팀원 미리보기
    const hint = sceneFor(t.card!, args as never, false);
    expect(hint?.away).toEqual(['m5', 'm3']);
    expect(hint?.note).toContain('11월 20일');

    await t.answer({ submitted: true, kind: '연차', delegateId: 'm2' });
    expect(t.card?.function.name).toBe(LEAVE_TOOL.result);
    expect(t.c.state.leave.submitted).toHaveLength(1);
    expect(t.backend.leave.balance().remaining).toBe(5.5);
    const drafted = t.backend.approvals.snapshot().drafted[0];
    expect(drafted).toMatchObject({ form: '휴가신청', title: '연차 1일', summary: '1일' });
    expect(drafted.amount).toBeUndefined();
  });

  it('여러 날이면 연차로만 신청하고, 같은 날 두 번은 막는다', async () => {
    const t = setup();
    await t.say('26~27일 반차');
    expect(t.args<LeaveRequestArgs>().kind).toBe('연차');
    expect(t.text()).toContain('연차로 바꿨어요');
    await t.answer({ submitted: true, kind: '연차', delegateId: 'm2' });
    await t.say('27일 오전 반차');
    await t.answer({ submitted: true, kind: '오전 반차', delegateId: 'm2' });
    expect(t.text()).toContain('이미 휴가를 낸 날');
  });

  it('날짜가 없으면 카드 없이 물어본다', async () => {
    const t = setup();
    await t.say('연차 쓰고 싶어');
    expect(t.calledTools()).toEqual([]);
    expect(t.text()).toContain('날짜를 알려 주세요');
  });

  it('연차 현황과 근무시간을 보여 준다', async () => {
    const t = setup();
    await t.say('남은 연차 알려줘');
    expect(t.calledTools()).toEqual([LEAVE_TOOL.status]);
    const lastArgs = <T,>() =>
      JSON.parse(t.c.messages.flatMap((m) => (m.role === 'assistant' ? (m.toolCalls ?? []) : [])).at(-1)!.function.arguments) as T;
    const status = lastArgs<LeaveStatusArgs>();
    expect(status.balance).toEqual({ total: 15, used: 8.5, planned: 0, remaining: 6.5 });
    // 팀 부재는 이름과 종류만 (사유 없음)
    expect(status.team[0]).toMatchObject({ date: '2026-11-20', people: [{ name: '마루', kind: '연차' }, { name: '도담', kind: '오전 반차' }] });

    await t.say('이번 주 근무시간 보여줘');
    expect(t.calledTools()).toEqual([LEAVE_TOOL.attendance]);
    const att = lastArgs<AttendanceArgs>();
    expect(att.days.map((d) => d.date)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    expect(att.days[2].out).toBeNull(); // 오늘은 퇴근 전
    expect(att.totalMin).toBe(att.days.reduce((n, d) => n + d.minutes, 0));
  });
});
