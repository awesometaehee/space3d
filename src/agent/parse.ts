import { dateKey, type DateKey } from '../data/meetingRooms';

/**
 * 모의 에이전트용 날짜 해석. 실제 에이전트에서는 LLM이 이 역할을 한다.
 * 오늘·내일·모레·어제, "11월 20일", "20일"을 읽는다.
 * past: 지난 날짜를 허용할지 (지출 사용일은 과거, 회의 날짜는 미래로 본다)
 */
export function parseDate(text: string, now: Date, { past = false } = {}): { date: DateKey; found: boolean } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(today);
  const md = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  const dOnly = text.match(/(?:^|[^\d월])(\d{1,2})\s*일/);
  if (/모레/.test(text)) day.setDate(day.getDate() + 2);
  else if (/내일/.test(text)) day.setDate(day.getDate() + 1);
  else if (/그저께|그제/.test(text)) day.setDate(day.getDate() - 2);
  else if (/어제/.test(text)) day.setDate(day.getDate() - 1);
  else if (/오늘/.test(text)) {
    // 그대로
  } else if (md) {
    day.setMonth(Number(md[1]) - 1, Number(md[2]));
    if (past && day > today) day.setFullYear(day.getFullYear() - 1);
    if (!past && day < today) day.setFullYear(day.getFullYear() + 1);
  } else if (dOnly) {
    day.setDate(Number(dOnly[1]));
    if (past && day > today) day.setMonth(day.getMonth() - 1);
    if (!past && day < today) day.setMonth(day.getMonth() + 1);
  } else {
    return { date: dateKey(today), found: false };
  }
  return { date: dateKey(day), found: true };
}

/**
 * 금액 해석: "23,000원", "23000원", "5만원", "2만 3천원", "64만 원", "1,200만원"
 * 못 읽으면 0
 */
export function parseAmount(text: string): number {
  const t = text.replace(/\s+/g, '');
  const korean = t.match(/(?:(\d[\d,]*)억)?(?:(\d[\d,]*)만)?(?:(\d[\d,]*)천)?(\d[\d,]*)?원/);
  if (korean && (korean[1] || korean[2] || korean[3])) {
    const n = (s?: string) => (s ? Number(s.replace(/,/g, '')) : 0);
    return n(korean[1]) * 1e8 + n(korean[2]) * 1e4 + n(korean[3]) * 1e3 + n(korean[4]);
  }
  const plain = t.match(/(\d[\d,]*)원/);
  return plain ? Number(plain[1].replace(/,/g, '')) : 0;
}
