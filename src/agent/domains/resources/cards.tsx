import { useState, type ComponentType } from 'react';
import type { ResourceSlot } from '../../../data/resources';
import { SLOT_LABEL } from '../../../data/resources';
import { AnsweredNote, CardShell, Skeleton, isSuperseded, type CardProps } from '../../cardKit';
import {
  RESOURCE_TOOL,
  type ConfirmResourceArgs,
  type ConfirmResourceResult,
  type MyReservationsArgs,
  type PickResourceArgs,
  type PickResourceResult,
  type ResourceOption,
  type ResourceResultArgs,
} from './tools';

const SLOTS: ResourceSlot[] = ['am', 'pm', 'day'];

const optionReady = (o: Partial<ResourceOption> | undefined): o is ResourceOption =>
  !!o &&
  typeof o.id === 'string' &&
  typeof o.name === 'string' &&
  !!o.free &&
  typeof o.free.am === 'boolean' &&
  typeof o.free.pm === 'boolean' &&
  typeof o.free.day === 'boolean';

/* ── 자원·시간대 고르기 ───────────────── */

function PickResourceCard({ args, status, result, respond, onHoverRoom }: CardProps<PickResourceArgs, PickResourceResult>) {
  const items = (args?.items ?? []).filter(optionReady);
  const chosen = result && 'resourceId' in result ? result : null;
  const ready = status === 'awaiting';
  const isDesk = args?.kind === 'desk';
  return (
    <CardShell
      title={args?.kindLabel ? `${args.kindLabel} 예약` : '자원 예약'}
      meta={args?.dateLabel ? `${args.dateLabel}${args.slot ? ` · ${SLOT_LABEL[args.slot]}` : ''}` : undefined}
      status={status}
    >
      {items.length === 0 && status === 'streaming' ? (
        <Skeleton />
      ) : (
        <ul className="resource-list">
          {items.map((item) => {
            const any = item.free.am || item.free.pm;
            return (
              <li
                key={item.id}
                className={`resource-row${any ? '' : ' is-off'}${chosen?.resourceId === item.id ? ' is-chosen' : ''}`}
                // 자율 좌석은 사무실 화면의 자리와 연결된다
                onMouseEnter={() => isDesk && onHoverRoom(item.id)}
                onMouseLeave={() => isDesk && onHoverRoom(null)}
              >
                <span className="resource-name">
                  <strong>{item.name}</strong>
                  <small>{item.detail}</small>
                </span>
                <span className="resource-slots" role="group" aria-label={`${item.name} 시간대`}>
                  {SLOTS.map((slot) => {
                    const free = item.free[slot];
                    const picked = chosen?.resourceId === item.id && chosen.slot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        className={`slot${free ? '' : ' is-busy'}${picked ? ' is-chosen' : ''}${args?.slot === slot && free && !chosen ? ' is-wanted' : ''}`}
                        disabled={!ready || !free}
                        aria-label={`${item.name} ${SLOT_LABEL[slot]}${free ? '' : ', 예약됨'}`}
                        onFocus={() => isDesk && onHoverRoom(item.id)}
                        onBlur={() => isDesk && onHoverRoom(null)}
                        onClick={() => respond({ resourceId: item.id, slot })}
                      >
                        {SLOT_LABEL[slot]}
                      </button>
                    );
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {ready ? (
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

/* ── 확인 ───────────────── */

function ConfirmResourceCard({ args, status, result, respond, onHoverRoom }: CardProps<ConfirmResourceArgs, ConfirmResourceResult>) {
  const [purpose, setPurpose] = useState('');
  const ready = status === 'awaiting';
  const complete = !!args?.time && !!args.purposeLabel && Array.isArray(args.notes);
  const id = `res-${args?.resourceId}-${args?.date}`;
  const isDesk = args?.kind === 'desk';
  return (
    <CardShell title="예약 확인" status={status}>
      {!complete ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <dl
            className="confirm-list"
            onMouseEnter={() => isDesk && args.resourceId && onHoverRoom(args.resourceId)}
            onMouseLeave={() => isDesk && onHoverRoom(null)}
          >
            <dt>자원</dt>
            <dd>{args.name}</dd>
            <dt>일시</dt>
            <dd>
              {args.dateLabel} {args.slotLabel} <small className="muted">{args.time}</small>
            </dd>
            <dt>
              <label htmlFor={`${id}-purpose`}>{args.purposeLabel}</label>
            </dt>
            <dd>
              <input
                id={`${id}-purpose`}
                value={purpose}
                maxLength={60}
                placeholder="선택 · 짧게"
                disabled={!ready}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </dd>
          </dl>
          {(args.notes ?? []).length > 0 && (
            <ul className="resource-notes">
              {(args.notes ?? []).filter((n) => typeof n === 'string').map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {ready ? (
        <footer>
          <button type="button" className="ghost push-left" onClick={() => respond({ back: true })}>
            다시 고르기
          </button>
          <button type="button" className="ghost" onClick={() => respond({ confirmed: false })}>
            취소
          </button>
          <button type="button" className="primary" disabled={!complete} onClick={() => respond({ confirmed: true, purpose })}>
            예약하기
          </button>
        </footer>
      ) : (
        status === 'answered' &&
        (isSuperseded(result) ? (
          <AnsweredNote result={result} />
        ) : (
          <p className="card-note">
            {result && 'back' in result
              ? '다시 고르기로 했어요.'
              : result && 'confirmed' in result && result.confirmed
                ? '예약을 요청했어요.'
                : '취소했어요.'}
          </p>
        ))
      )}
    </CardShell>
  );
}

/* ── 완료·내 예약 ───────────────── */

function ResourceResultCard({ args, status, onHoverRoom }: CardProps<ResourceResultArgs, never>) {
  const r = args?.reservation;
  return (
    <CardShell title="예약 완료" status={status}>
      {!r?.slot || !args?.time ? (
        <Skeleton rows={2} />
      ) : (
        <div className="booking-done" onMouseEnter={() => onHoverRoom(r.resourceId)} onMouseLeave={() => onHoverRoom(null)}>
          <span className="check" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>{args.name}</strong>
            <span>
              {args.dateLabel} {args.slotLabel} {args.time}
              {r.purpose ? ` · ${r.purpose}` : ''}
            </span>
          </div>
        </div>
      )}
    </CardShell>
  );
}

function MyReservationsCard({ args, status }: CardProps<MyReservationsArgs, never>) {
  const items = (args?.items ?? []).filter((i) => i && typeof i.slotLabel === 'string' && typeof i.purpose === 'string');
  return (
    <CardShell title="내 자원 예약" meta={items.length ? `${items.length}건` : undefined} status={status}>
      {items.length === 0 ? (
        <Skeleton rows={2} />
      ) : (
        <ul className="leave-list">
          {items.map((i) => (
            <li key={i.id}>
              <span>{i.dateLabel}</span>
              <strong>{i.name}</strong>
              <em>{i.slotLabel}</em>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

export const RESOURCE_CARDS: Record<string, ComponentType<CardProps<any, any>>> = {
  [RESOURCE_TOOL.pick]: PickResourceCard,
  [RESOURCE_TOOL.confirm]: ConfirmResourceCard,
  [RESOURCE_TOOL.result]: ResourceResultCard,
  [RESOURCE_TOOL.mine]: MyReservationsCard,
};
