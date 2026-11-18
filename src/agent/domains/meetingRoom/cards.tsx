import { useState, type ComponentType } from 'react';
import { AnsweredNote, CardShell, Skeleton, isSuperseded, type CardProps } from '../../cardKit';
import { PERIOD_LABEL, formatDuration } from './intent';
import {
  ROOM_TOOL,
  type ConfirmBookingArgs,
  type ConfirmBookingResult,
  type RoomOption,
  type ShowBookingResultArgs,
  type ShowRoomOptionsArgs,
  type ShowRoomOptionsResult,
  type ShowTimeSlotsArgs,
  type ShowTimeSlotsResult,
} from './tools';

const roomReady = (r: Partial<RoomOption>): r is RoomOption =>
  typeof r.id === 'string' && typeof r.name === 'string' && typeof r.freeSlots === 'number' && typeof r.fits === 'boolean';

function RoomOptionsCard({ args, status, result, respond, onHoverRoom }: CardProps<ShowRoomOptionsArgs, ShowRoomOptionsResult>) {
  const rooms = (args?.rooms ?? []).filter(roomReady);
  const chosen = result && 'roomId' in result ? result.roomId : null;
  const meta =
    args?.dateLabel && args.period && args.people && args.durationMin
      ? `${args.dateLabel} ${PERIOD_LABEL[args.period]} · ${args.people}명 · ${formatDuration(args.durationMin)}`
      : undefined;
  return (
    <CardShell title="회의실 선택" meta={meta} status={status}>
      {rooms.length === 0 && status === 'streaming' ? (
        <Skeleton />
      ) : (
        <ul className="room-options">
          {rooms.map((room) => {
            const usable = room.fits && room.freeSlots > 0;
            const reason = !room.fits ? `인원 초과` : room.freeSlots === 0 ? '빈 시간 없음' : `빈 시간 ${room.freeSlots}개`;
            return (
              <li key={room.id}>
                <button
                  type="button"
                  className={`room-option${chosen === room.id ? ' is-chosen' : ''}`}
                  disabled={status !== 'awaiting' || !usable}
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
                  <span className={`room-free${usable ? '' : ' is-off'}`}>{reason}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {status === 'awaiting' ? (
        <footer>
          <button type="button" className="ghost" onClick={() => respond({ cancelled: true })}>
            취소
          </button>
        </footer>
      ) : (
        <AnsweredNote result={result} />
      )}
    </CardShell>
  );
}

function TimeSlotsCard({ args, status, result, respond, onHoverRoom }: CardProps<ShowTimeSlotsArgs, ShowTimeSlotsResult>) {
  const slots = (args?.slots ?? []).filter((s) => s && typeof s.end === 'string' && typeof s.available === 'boolean');
  const chosen = result && 'start' in result ? result.start : null;
  const free = slots.filter((s) => s.available).length;
  return (
    <CardShell
      title={args?.roomName ? `${args.roomName} 시간 선택` : '시간 선택'}
      meta={args?.dateLabel && args.durationMin ? `${args.dateLabel} · ${formatDuration(args.durationMin)}` : undefined}
      status={status}
    >
      <div
        className="slot-grid"
        onMouseEnter={() => args?.roomId && onHoverRoom(args.roomId)}
        onMouseLeave={() => onHoverRoom(null)}
      >
        {slots.length === 0 && status === 'streaming' ? (
          <Skeleton rows={2} />
        ) : (
          slots.map((s) => (
            <button
              key={s.start}
              type="button"
              className={`slot${s.available ? '' : ' is-busy'}${chosen === s.start ? ' is-chosen' : ''}`}
              disabled={status !== 'awaiting' || !s.available}
              aria-label={`${s.start}부터 ${s.end}까지${s.available ? '' : ', 예약됨'}`}
              onClick={() => respond({ start: s.start, end: s.end })}
            >
              {s.start}
            </button>
          ))
        )}
      </div>
      {status === 'awaiting' && free === 0 && <p className="card-note">이 시간대에는 빈 시간이 없어요.</p>}
      {status === 'awaiting' ? (
        <footer>
          <button type="button" className="ghost" onClick={() => respond({ back: true })}>
            다른 회의실
          </button>
          <button type="button" className="ghost" onClick={() => respond({ cancelled: true })}>
            취소
          </button>
        </footer>
      ) : (
        <AnsweredNote result={result}>{result && 'back' in result ? '다른 회의실을 보기로 했어요.' : null}</AnsweredNote>
      )}
    </CardShell>
  );
}

function ConfirmCard({ args, status, result, respond, onHoverRoom }: CardProps<ConfirmBookingArgs, ConfirmBookingResult>) {
  const [title, setTitle] = useState<string | null>(null);
  const value = title ?? args?.title ?? '';
  const ready = status === 'awaiting';
  return (
    <CardShell title="예약 확인" status={status}>
      {!args?.end ? (
        <Skeleton rows={3} />
      ) : (
        <dl
          className="confirm-list"
          onMouseEnter={() => args.roomId && onHoverRoom(args.roomId)}
          onMouseLeave={() => onHoverRoom(null)}
        >
          <dt>회의실</dt>
          <dd>{args.roomName}</dd>
          <dt>일시</dt>
          <dd>
            {args.dateLabel} {args.start}–{args.end}
          </dd>
          <dt>인원</dt>
          <dd>{args.people}명</dd>
          <dt>
            <label htmlFor={`title-${args.roomId}-${args.start}`}>제목</label>
          </dt>
          <dd>
            <input
              id={`title-${args.roomId}-${args.start}`}
              value={value}
              maxLength={40}
              disabled={!ready}
              onChange={(e) => setTitle(e.target.value)}
            />
          </dd>
        </dl>
      )}
      {ready ? (
        <footer>
          <button type="button" className="ghost" onClick={() => respond({ confirmed: false })}>
            취소
          </button>
          <button type="button" className="primary" onClick={() => respond({ confirmed: true, title: value })}>
            예약하기
          </button>
        </footer>
      ) : (
        status === 'answered' &&
        (isSuperseded(result) ? (
          <AnsweredNote result={result} />
        ) : (
          <p className="card-note">{result && 'confirmed' in result && result.confirmed ? '예약을 요청했어요.' : '취소했어요.'}</p>
        ))
      )}
    </CardShell>
  );
}

function BookingResultCard({ args, status, onHoverRoom }: CardProps<ShowBookingResultArgs, never>) {
  const b = args?.booking;
  return (
    <CardShell title="예약 완료" status={status}>
      {!b?.end ? (
        <Skeleton rows={2} />
      ) : (
        <div className="booking-done" onMouseEnter={() => onHoverRoom(b.roomId)} onMouseLeave={() => onHoverRoom(null)}>
          <span className="check" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>{b.title}</strong>
            <span>
              {args?.roomName} · {args?.dateLabel} {b.start}–{b.end}
            </span>
          </div>
        </div>
      )}
    </CardShell>
  );
}

/** 도구 이름 → 화면 컴포넌트 */
export const ROOM_CARDS: Record<string, ComponentType<CardProps<any, any>>> = {
  [ROOM_TOOL.showRoomOptions]: RoomOptionsCard,
  [ROOM_TOOL.showTimeSlots]: TimeSlotsCard,
  [ROOM_TOOL.confirmBooking]: ConfirmCard,
  [ROOM_TOOL.showBookingResult]: BookingResultCard,
};
