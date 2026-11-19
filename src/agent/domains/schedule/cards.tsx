import { useState, type ComponentType } from 'react';
import { CELL_MIN, DAY_OPEN, type Colleague } from '../../../data/calendar';
import { toHHMM, toMinutes } from '../../../data/meetingRooms';
import { AnsweredNote, CardShell, Skeleton, isSuperseded, type CardProps } from '../../cardKit';
import { formatDuration } from '../meetingRoom/intent';
import {
  SCHEDULE_TOOL,
  type ConfirmInviteArgs,
  type ConfirmInviteResult,
  type PickAttendeesArgs,
  type PickAttendeesResult,
  type PickMeetingRoomArgs,
  type PickMeetingRoomResult,
  type ShowCommonTimesArgs,
  type ShowCommonTimesResult,
  type ShowInviteResultArgs,
  type TimeCandidate,
} from './tools';

const personReady = (c: Partial<Colleague> | undefined): c is Colleague =>
  !!c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.team === 'string' && typeof c.title === 'string';

function PersonChips({ people, missing = [] }: { people: Colleague[]; missing?: string[] }) {
  return (
    <ul className="person-chips" aria-label="참석자">
      <li className="is-me">나</li>
      {people.map((c) => (
        <li key={c.id} className={missing.includes(c.name) ? 'is-missing' : ''} title={`${c.team} ${c.title}`}>
          {c.name}
          <small>{c.title}</small>
        </li>
      ))}
    </ul>
  );
}

/* ── 참석자 고르기 ───────────────── */

function AttendeesCard({ args, status, result, respond }: CardProps<PickAttendeesArgs, PickAttendeesResult>) {
  const people = (args?.people ?? []).filter(personReady);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const selected = picked ?? new Set((args?.selected ?? []).filter((id) => typeof id === 'string'));
  const answered = result && 'attendeeIds' in result ? new Set(result.attendeeIds) : null;
  const shown = answered ?? selected;
  const ready = status === 'awaiting';
  const teams = [...new Set(people.map((c) => c.team))];

  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setPicked(next);
  };

  return (
    <CardShell title="참석자 선택" meta={shown.size ? `${shown.size}명 선택` : undefined} status={status}>
      {people.length === 0 && status === 'streaming' ? (
        <Skeleton rows={3} />
      ) : (
        <div className="team-groups">
          {teams.map((team) => {
            const members = people.filter((c) => c.team === team);
            const all = members.every((c) => shown.has(c.id));
            return (
              <section key={team} className="team-group">
                <header>
                  <strong>{team}</strong>
                  <button type="button" className="link" disabled={!ready} onClick={() => toggle(members.map((c) => c.id), !all)}>
                    {all ? '모두 빼기' : '팀 전체'}
                  </button>
                </header>
                <div className="person-toggles">
                  {members.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="person-toggle"
                      aria-pressed={shown.has(c.id)}
                      disabled={!ready}
                      onClick={() => toggle([c.id], !selected.has(c.id))}
                    >
                      {c.name}
                      <small>{c.title}</small>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {ready ? (
        <footer>
          <button type="button" className="ghost" onClick={() => respond({ cancelled: true })}>
            취소
          </button>
          <button
            type="button"
            className="primary"
            disabled={selected.size === 0}
            onClick={() => respond({ attendeeIds: [...selected] })}
          >
            {selected.size ? `${selected.size}명으로 시간 찾기` : '참석자를 골라 주세요'}
          </button>
        </footer>
      ) : (
        <AnsweredNote result={result} />
      )}
    </CardShell>
  );
}

/* ── 공통 빈 시간 ───────────────── */

const candidateReady = (c: Partial<TimeCandidate> | undefined): c is TimeCandidate =>
  !!c && typeof c.end === 'string' && typeof c.dateLabel === 'string' && Array.isArray(c.missing);

/** 시간 눈금: 9시부터 한 시간마다 */
const HOURS = Array.from({ length: 9 }, (_, i) => 9 + i);

function Heatmap({
  days,
  total,
  durationMin,
  chosen,
  disabled,
  onPick,
}: {
  days: ShowCommonTimesArgs['days'];
  total: number;
  durationMin: number;
  chosen: { date: string; start: string } | null;
  disabled: boolean;
  onPick: (date: string, start: string, end: string) => void;
}) {
  const span = Math.max(1, durationMin / CELL_MIN);
  const [hover, setHover] = useState<{ date: string; i: number } | null>(null);
  // 그 칸부터 회의 길이만큼 모두 가능한지
  const fits = (free: number[], i: number) => i + span <= free.length && free.slice(i, i + span).every((n) => n === total);
  const inWindow = (date: string, i: number, at: { date: string; i: number } | null) =>
    !!at && at.date === date && i >= at.i && i < at.i + span;
  const chosenAt = chosen ? { date: chosen.date, i: (toMinutes(chosen.start) - DAY_OPEN) / CELL_MIN } : null;

  return (
    <div className="heatmap" role="grid" aria-label="날짜·시간별 참석 가능 인원" onMouseLeave={() => setHover(null)}>
      <div className="heat-row" aria-hidden="true">
        <span />
        <div className="heat-cells heat-hours">
          {HOURS.map((h) => (
            <span key={h}>{h}시</span>
          ))}
        </div>
      </div>
      {days.map((d) => (
        <div key={d.date} className="heat-row" role="row">
          <span className="heat-day" role="rowheader">
            {d.label.replace(/^\d+월 /, '')}
          </span>
          <div className="heat-cells">
            {d.free.map((n, i) => {
              const start = toHHMM(DAY_OPEN + i * CELL_MIN);
              const ok = n >= 0 && fits(d.free, i);
              const label = n < 0 ? `${start} 선택 불가` : `${start} ${n}/${total}명 가능`;
              const cls = [
                'heat-cell',
                n < 0 ? 'is-off' : '',
                ok && inWindow(d.date, i, hover) ? 'is-hover' : '',
                inWindow(d.date, i, chosenAt) ? 'is-chosen' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const level = n < 0 ? 0 : total ? n / total : 0;
              return (
                <button
                  key={i}
                  type="button"
                  role="gridcell"
                  className={cls}
                  style={{ ['--lv' as string]: level }}
                  title={label}
                  aria-label={label}
                  disabled={disabled || !ok}
                  onMouseEnter={() => setHover(ok ? { date: d.date, i } : null)}
                  onClick={() => onPick(d.date, start, toHHMM(DAY_OPEN + (i + span) * CELL_MIN))}
                />
              );
            })}
          </div>
        </div>
      ))}
      <p className="heat-legend">
        <span className="swatch" style={{ ['--lv' as string]: 1 }} /> 모두 가능
        <span className="swatch" style={{ ['--lv' as string]: 0.5 }} /> 일부 가능
        <span className="swatch is-off" /> 점심·지난 시간
        <em>진한 칸을 누르면 그 시각에 시작해요</em>
      </p>
    </div>
  );
}

function CommonTimesCard({ args, status, result, respond }: CardProps<ShowCommonTimesArgs, ShowCommonTimesResult>) {
  const attendees = (args?.attendees ?? []).filter(personReady);
  const candidates = (args?.candidates ?? []).filter(candidateReady);
  const days = (args?.days ?? []).filter((d) => d && typeof d.label === 'string' && Array.isArray(d.free));
  const chosen = result && 'start' in result ? result : null;
  const ready = status === 'awaiting';
  const total = typeof args?.total === 'number' ? args.total : attendees.length + 1;
  const meta =
    args?.rangeLabel && args.durationMin ? `${args.rangeLabel} · ${formatDuration(args.durationMin)} · ${total}명` : undefined;

  return (
    <CardShell title={args?.title ? `${args.title} 시간 찾기` : '공통 빈 시간'} meta={meta} status={status}>
      {attendees.length > 0 && <PersonChips people={attendees} />}
      {candidates.length === 0 && status === 'streaming' ? (
        <Skeleton rows={3} />
      ) : (
        <>
          {candidates.length > 0 && (
            <ul className="time-cands" aria-label="추천 시간">
              {candidates.map((c) => {
                const isChosen = chosen?.date === c.date && chosen.start === c.start;
                return (
                  <li key={`${c.date}-${c.start}`}>
                    <button
                      type="button"
                      className={`time-cand${isChosen ? ' is-chosen' : ''}`}
                      disabled={!ready}
                      onClick={() => respond({ date: c.date, start: c.start, end: c.end })}
                    >
                      <span className="when">
                        {c.dateLabel}
                        <strong>
                          {c.start}–{c.end}
                        </strong>
                      </span>
                      <span className={`who${c.missing.length ? ' is-partial' : ''}`}>
                        {c.missing.length ? `${c.missing.join('·')} 불참` : '모두 가능'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {days.length > 0 && args?.durationMin && (
            <Heatmap
              days={days}
              total={total}
              durationMin={args.durationMin}
              chosen={chosen}
              disabled={!ready}
              onPick={(date, start, end) => respond({ date, start, end })}
            />
          )}
        </>
      )}
      {ready ? (
        <footer>
          <button type="button" className="ghost" onClick={() => respond({ editAttendees: true })}>
            참석자 바꾸기
          </button>
          <button type="button" className="ghost" onClick={() => respond({ cancelled: true })}>
            취소
          </button>
        </footer>
      ) : (
        <AnsweredNote result={result}>
          {result && 'editAttendees' in result ? '참석자를 바꾸기로 했어요.' : null}
        </AnsweredNote>
      )}
    </CardShell>
  );
}

/* ── 회의실 ───────────────── */

function MeetingRoomCard({ args, status, result, respond, onHoverRoom }: CardProps<PickMeetingRoomArgs, PickMeetingRoomResult>) {
  const rooms = (args?.rooms ?? []).filter(
    (r) => r && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.free === 'boolean' && typeof r.fits === 'boolean',
  );
  const chosen = result && 'roomId' in result ? result.roomId : undefined;
  const ready = status === 'awaiting';
  const meta = args?.dateLabel && args.end ? `${args.dateLabel} ${args.start}–${args.end} · ${args.people}명` : undefined;
  return (
    <CardShell title="회의실 선택" meta={meta} status={status}>
      {rooms.length === 0 && status === 'streaming' ? (
        <Skeleton />
      ) : (
        <ul className="room-options">
          {rooms.map((room) => {
            const usable = room.fits && room.free;
            return (
              <li key={room.id}>
                <button
                  type="button"
                  className={`room-option${chosen === room.id ? ' is-chosen' : ''}`}
                  disabled={!ready || !usable}
                  onClick={() => respond({ roomId: room.id })}
                  onMouseEnter={() => onHoverRoom(room.id)}
                  onMouseLeave={() => onHoverRoom(null)}
                  onFocus={() => onHoverRoom(room.id)}
                  onBlur={() => onHoverRoom(null)}
                >
                  <span className="room-name">
                    {room.name}
                    <small>최대 {room.capacity}인</small>
                  </span>
                  <span className="room-equip">{room.equipment?.join(' · ')}</span>
                  <span className={`room-free${usable ? '' : ' is-off'}`}>
                    {!room.fits ? '인원 초과' : room.free ? '비어 있음' : '예약됨'}
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              className={`room-option${chosen === null ? ' is-chosen' : ''}`}
              disabled={!ready}
              onClick={() => respond({ roomId: null })}
            >
              <span className="room-name">회의실 없이 진행</span>
              <span className="room-equip">온라인 회의나 자리에서 진행해요</span>
            </button>
          </li>
        </ul>
      )}
      {ready ? (
        <footer>
          <button type="button" className="ghost" onClick={() => respond({ back: true })}>
            다른 시간
          </button>
          <button type="button" className="ghost" onClick={() => respond({ cancelled: true })}>
            취소
          </button>
        </footer>
      ) : (
        <AnsweredNote result={result}>{result && 'back' in result ? '다른 시간을 보기로 했어요.' : null}</AnsweredNote>
      )}
    </CardShell>
  );
}

/* ── 초대 확인 ───────────────── */

function ConfirmInviteCard({ args, status, result, respond, onHoverRoom }: CardProps<ConfirmInviteArgs, ConfirmInviteResult>) {
  const [title, setTitle] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const value = title ?? args?.title ?? '';
  const ready = status === 'awaiting';
  const attendees = (args?.attendees ?? []).filter(personReady);
  const missing = Array.isArray(args?.missing) ? args.missing.filter((m) => typeof m === 'string') : [];
  const complete = !!args?.end && Array.isArray(args.attendees) && args.roomId !== undefined;
  const id = `invite-${args?.date}-${args?.start}`;
  return (
    <CardShell title="초대 확인" status={status}>
      {!complete ? (
        <Skeleton rows={3} />
      ) : (
        <dl
          className="confirm-list"
          onMouseEnter={() => args.roomId && onHoverRoom(args.roomId)}
          onMouseLeave={() => onHoverRoom(null)}
        >
          <dt>
            <label htmlFor={`${id}-title`}>제목</label>
          </dt>
          <dd>
            <input id={`${id}-title`} value={value} maxLength={40} disabled={!ready} onChange={(e) => setTitle(e.target.value)} />
          </dd>
          <dt>일시</dt>
          <dd>
            {args.dateLabel} {args.start}–{args.end}
          </dd>
          <dt>장소</dt>
          <dd>{args.roomName ?? '회의실 없음'}</dd>
          <dt>참석자</dt>
          <dd>
            <PersonChips people={attendees} missing={missing} />
          </dd>
          <dt>
            <label htmlFor={`${id}-note`}>메모</label>
          </dt>
          <dd>
            <textarea
              id={`${id}-note`}
              rows={2}
              maxLength={200}
              placeholder="초대에 함께 보낼 말 (선택)"
              value={note}
              disabled={!ready}
              onChange={(e) => setNote(e.target.value)}
            />
          </dd>
        </dl>
      )}
      {complete && missing.length > 0 && (
        <p className="card-note is-warn">{missing.join('·')}님은 이 시간에 다른 일정이 있어요.</p>
      )}
      {ready ? (
        <footer className="confirm-bar">
          <span>참석자 {attendees.length}명에게 일정 초대를 보내요.</span>
          <button type="button" className="ghost" onClick={() => respond({ confirmed: false })}>
            취소
          </button>
          <button
            type="button"
            className="primary"
            disabled={!complete || !value.trim()}
            onClick={() => respond({ confirmed: true, title: value, note })}
          >
            초대 보내기
          </button>
        </footer>
      ) : (
        status === 'answered' &&
        (isSuperseded(result) ? (
          <AnsweredNote result={result} />
        ) : (
          <p className="card-note">{result && 'confirmed' in result && result.confirmed ? '초대를 보냈어요.' : '취소했어요.'}</p>
        ))
      )}
    </CardShell>
  );
}

/* ── 완료 ───────────────── */

function InviteResultCard({ args, status, onHoverRoom }: CardProps<ShowInviteResultArgs, never>) {
  const e = args?.event;
  const attendees = (args?.attendees ?? []).filter(personReady);
  return (
    <CardShell title="일정 등록 완료" status={status}>
      {!e?.end || !args?.dateLabel ? (
        <Skeleton rows={2} />
      ) : (
        <>
          <div
            className="booking-done"
            onMouseEnter={() => e.roomId && onHoverRoom(e.roomId)}
            onMouseLeave={() => onHoverRoom(null)}
          >
            <span className="check" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>{e.title}</strong>
              <span>
                {args.dateLabel} {e.start}–{e.end} · {args.roomName ?? '회의실 없음'}
              </span>
            </div>
          </div>
          {attendees.length > 0 && (
            <ul className="invite-status">
              {attendees.map((c) => (
                <li key={c.id}>
                  {c.name} <small>{c.title}</small>
                  <em>응답 대기</em>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </CardShell>
  );
}

export const SCHEDULE_CARDS: Record<string, ComponentType<CardProps<any, any>>> = {
  [SCHEDULE_TOOL.pickAttendees]: AttendeesCard,
  [SCHEDULE_TOOL.showCommonTimes]: CommonTimesCard,
  [SCHEDULE_TOOL.pickMeetingRoom]: MeetingRoomCard,
  [SCHEDULE_TOOL.confirmInvite]: ConfirmInviteCard,
  [SCHEDULE_TOOL.showInviteResult]: InviteResultCard,
};
