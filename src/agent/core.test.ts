import { describe, expect, it } from 'vitest';
import { applyPatch, parsePartialJson } from './agui';
import { applyEvent, initialConversation } from './conversation';
import { parseAmount, parseDate } from './parse';
import { NOW, setup } from './testing';

describe('applyPatch', () => {
  it('배열 끝에 추가하고 값을 바꾸고 지운다', () => {
    const doc = { list: [1], a: { b: 1 }, c: 3 };
    const out = applyPatch(doc, [
      { op: 'add', path: '/list/-', value: 2 },
      { op: 'replace', path: '/a/b', value: 9 },
      { op: 'remove', path: '/c' },
    ]);
    expect(out).toEqual({ list: [1, 2], a: { b: 9 } });
    expect(doc).toEqual({ list: [1], a: { b: 1 }, c: 3 }); // 원본은 그대로
  });

  it('없는 경로를 바꾸려 하면 오류', () => {
    expect(() => applyPatch({ a: 1 }, [{ op: 'replace', path: '/x/y', value: 1 }])).toThrow();
  });
});

describe('parsePartialJson', () => {
  it('스트리밍 도중의 JSON도 앞부분까지 읽는다', () => {
    expect(parsePartialJson('{"date":"2026-11-19","rooms":[{"id":"room-a","na')).toEqual({
      date: '2026-11-19',
      rooms: [{ id: 'room-a' }], // 끝나지 않은 키는 버린다
    });
    expect(parsePartialJson('{"a":1,"b":tr')).toEqual({ a: 1 });
    expect(parsePartialJson('')).toBeUndefined();
  });
});

describe('대화 상태', () => {
  it('텍스트 메시지가 끝날 때까지 스트리밍 중으로 표시한다', () => {
    let c = initialConversation({});
    c = applyEvent(c, { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' });
    c = applyEvent(c, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: '안녕' });
    expect(c.streamingMessages).toEqual(['m1']);
    c = applyEvent(c, { type: 'TEXT_MESSAGE_END', messageId: 'm1' });
    expect(c.streamingMessages).toEqual([]);
    expect(c.messages[0]).toMatchObject({ role: 'assistant', content: '안녕' });
  });
});

describe('parseDate / parseAmount', () => {
  it('날짜: 미래 기준과 과거 기준', () => {
    expect(parseDate('내일', NOW).date).toBe('2026-11-19');
    expect(parseDate('어제', NOW).date).toBe('2026-11-17');
    expect(parseDate('3일', NOW).date).toBe('2026-12-03');
    expect(parseDate('25일', NOW, { past: true }).date).toBe('2026-10-25');
    expect(parseDate('아무 말', NOW)).toEqual({ date: '2026-11-18', found: false });
  });

  it('금액: 숫자와 한글 단위', () => {
    expect(parseAmount('택시비 23,000원')).toBe(23000);
    expect(parseAmount('5만원')).toBe(50000);
    expect(parseAmount('2만 3천원')).toBe(23000);
    expect(parseAmount('2만 3,500원')).toBe(23500);
    expect(parseAmount('1,200만 원')).toBe(12_000_000);
    expect(parseAmount('금액 없음')).toBe(0);
  });
});

describe('라우터', () => {
  it('어느 업무도 아니면 도움말만 답한다', async () => {
    const t = setup();
    await t.say('안녕하세요');
    expect(t.calledTools()).toEqual([]);
    expect(t.text()).toContain('회의실 예약과 전자결재');
  });

  it('요청 내용에 따라 업무 영역을 고르고, 화면에 처리 중인 영역을 먼저 알린다', async () => {
    const t = setup();
    await t.say('결재할 거 보여줘');
    expect(t.calledTools()).toEqual([]); // 결재함은 카드가 아니라 고정 작업 화면으로 연다
    expect(t.c.state.approval.view.open).toBe(true);
    expect(t.c.state.activeDomain).toBe('approval');
    // 레이아웃이 답보다 먼저 바뀌도록 영역 알림이 첫 이벤트다
    expect(t.events[1]).toEqual({ type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/activeDomain', value: 'approval' }] });

    await t.say('내일 오후 4명 회의실 잡아줘');
    expect(t.calledTools()).toEqual(['show_room_options']);
    expect(t.c.state.activeDomain).toBe('meetingRoom');

    await t.say('안녕하세요');
    expect(t.c.state.activeDomain).toBeNull();
  });
});
