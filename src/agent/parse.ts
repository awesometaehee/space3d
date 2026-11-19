import { businessDays, isWeekend } from '../data/calendar';
import { dateKey, formatDate, type DateKey } from '../data/meetingRooms';

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

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function startOfWeek(d: Date): Date {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (day.getDay() + 6) % 7; // 월요일 기준
  day.setDate(day.getDate() - offset);
  return day;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 날짜 범위: 다음 주 / 이번 주 / 요일 / 특정 날짜 (주말은 뺀다) */
export function parseDateRange(t: string, now: Date): { dates: DateKey[]; label: string } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = t.match(/([월화수목금])\s*요일/);
  const nextWeek = /다음\s*주|담주|차주/.test(t);
  const thisWeek = /이번\s*주|금주/.test(t);

  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1]);
    let d: Date;
    if (nextWeek) d = addDays(startOfWeek(today), 7 + ((target + 6) % 7));
    else {
      d = new Date(today);
      while (d.getDay() !== target || d <= today) d = addDays(d, 1);
    }
    const key = dateKey(d);
    return { dates: [key], label: formatDate(key) };
  }
  if (nextWeek) {
    const monday = addDays(startOfWeek(today), 7);
    return { dates: businessDays(monday, 5), label: '다음 주' };
  }
  if (thisWeek) {
    const friday = addDays(startOfWeek(today), 4);
    const dates: DateKey[] = [];
    for (let d = new Date(today); d <= friday; d = addDays(d, 1)) if (!isWeekend(dateKey(d))) dates.push(dateKey(d));
    if (dates.length) return { dates, label: '이번 주' };
  }
  // 기간: "26일부터 27일까지", "26~27일", "11월 26일~28일"
  const span = t.match(/(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일?\s*(?:부터|~|-|에서)\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/);
  if (span) {
    const from = parseDate(`${span[1] ? `${span[1]}월 ` : ''}${span[2]}일`, now).date;
    const to = parseDate(`${span[3] ?? span[1] ?? ''}${span[3] || span[1] ? '월 ' : ''}${span[4]}일`, now).date;
    const dates: DateKey[] = [];
    const [y, m, d] = from.split('-').map(Number);
    for (let x = new Date(y, m - 1, d); dateKey(x) <= to && dates.length < 15; x = addDays(x, 1)) {
      if (!isWeekend(dateKey(x))) dates.push(dateKey(x));
    }
    if (dates.length) return { dates, label: dates.length === 1 ? formatDate(dates[0]) : `${formatDate(dates[0])} ~ ${formatDate(dates[dates.length - 1])}` };
  }
  const single = parseDate(t, now);
  if (single.found) {
    if (isWeekend(single.date)) return null;
    return { dates: [single.date], label: formatDate(single.date) };
  }
  return null;
}


/** 받침이 있으면 a, 없으면 b ("책임은" / "매니저는", "좌석이" / "법인차가") */
export function josa(word: string, a: string, b: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? a : b;
}
