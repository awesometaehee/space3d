import { useState, type ComponentType } from 'react';
import { LEAVE_KINDS, leaveDays, type LeaveBalance, type LeaveKind } from '../../../data/leave';
import { CardShell, Skeleton, isSuperseded, type CardProps } from '../../cardKit';
import { ApprovalLine } from '../approval/parts';
import {
  LEAVE_TOOL,
  type AttendanceArgs,
  type LeaveRequestArgs,
  type LeaveRequestResult,
  type LeaveResultArgs,
  type LeaveStatusArgs,
} from './tools';

const balanceReady = (b: Partial<LeaveBalance> | undefined): b is LeaveBalance =>
  !!b && typeof b.total === 'number' && typeof b.used === 'number' && typeof b.planned === 'number' && typeof b.remaining === 'number';

/** 연차 막대: 쓴 것 / 예정 / 이번 신청 / 남은 것 */
function BalanceBar({ balance, adding = 0 }: { balance: LeaveBalance; adding?: number }) {
  const pct = (n: number) => `${(Math.max(0, n) / balance.total) * 100}%`;
  const after = balance.remaining - adding;
  return (
    <div className="balance">
      <div className="balance-bar" aria-hidden="true">
        <span className="is-used" style={{ width: pct(balance.used) }} />
        <span className="is-planned" style={{ width: pct(balance.planned) }} />
        {adding > 0 && <span className="is-adding" style={{ width: pct(Math.min(adding, balance.remaining)) }} />}
      </div>
      <dl className="balance-nums">
        <div>
          <dt>사용</dt>
          <dd>{balance.used}일</dd>
        </div>
        <div>
          <dt>예정</dt>
          <dd>{balance.planned}일</dd>
        </div>
        {adding > 0 && (
          <div className="is-adding">
            <dt>이번 신청</dt>
            <dd>{adding}일</dd>
          </div>
        )}
        <div className={after < 0 ? 'is-over' : ''}>
          <dt>{adding > 0 ? '신청 후 잔여' : '잔여'}</dt>
          <dd>
            {after}일 <small>/ {balance.total}일</small>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/* ── 휴가 신청 ───────────────── */

function LeaveRequestCard({ args, status, result, respond }: CardProps<LeaveRequestArgs, LeaveRequestResult>) {
  const [kind, setKind] = useState<LeaveKind | null>(null);
  const [delegate, setDelegate] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ready = status === 'awaiting';
  const dates = Array.isArray(args?.dates) ? args.dates.filter((d) => typeof d === 'string') : [];
  const labels = Array.isArray(args?.dateLabels) ? args.dateLabels.filter((d) => typeof d === 'string') : [];
  const delegates = (args?.delegates ?? []).filter((d) => d && typeof d.id === 'string' && typeof d.away === 'boolean');
  const answered = result && 'submitted' in result ? result : null;
  const chosenKind = answered?.kind ?? kind ?? args?.kind ?? '연차';
  const chosenDelegate = answered?.delegateId ?? delegate ?? args?.delegateId ?? null;
  const complete = balanceReady(args?.balance) && Array.isArray(args?.line) && delegates.length > 0 && dates.length > 0;
  const adding = leaveDays(chosenKind) * dates.length;
  const over = complete && adding > args.balance!.remaining;
  const multi = dates.length > 1;

  return (
    <CardShell title="휴가 신청" meta={labels.length ? (multi ? `${labels[0]} ~ ${labels[labels.length - 1]}` : labels[0]) : undefined} status={status}>
      {!complete ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <div className="seg" role="radiogroup" aria-label="휴가 종류">
            {LEAVE_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={chosenKind === k}
                disabled={!ready || confirming || (multi && k !== '연차')}
                onClick={() => setKind(k)}
              >
                {k}
              </button>
            ))}
          </div>
          {multi && (
            <ul className="date-chips" aria-label="신청 날짜">
              {labels.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          <BalanceBar balance={args.balance!} adding={adding} />

          <section className="leave-field">
            <h4>대결자</h4>
            <div className="person-toggles" role="radiogroup" aria-label="대결자">
              {delegates.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  className="person-toggle"
                  aria-pressed={chosenDelegate === d.id}
                  aria-checked={chosenDelegate === d.id}
                  disabled={!ready || confirming || d.away}
                  title={d.away ? '그날 부재예요' : undefined}
                  onClick={() => setDelegate(d.id)}
                >
                  {d.name}
                  <small>{d.away ? '부재' : d.title}</small>
                </button>
              ))}
            </div>
          </section>

          {((args.teamAway?.length ?? 0) > 0 || (args.myEvents?.length ?? 0) > 0) && (
            <ul className="leave-notes" aria-label="확인할 점">
              {(args.teamAway ?? []).filter((d) => Array.isArray(d?.names)).map((d) => (
                <li key={`away-${d.date}`}>
                  <span aria-hidden="true">!</span>
                  {multi ? `${d.label} ` : ''}팀 부재: {d.names.join('·')}
                </li>
              ))}
              {(args.myEvents ?? []).filter((d) => typeof d?.count === 'number').map((d) => (
                <li key={`ev-${d.date}`}>
                  <span aria-hidden="true">!</span>
                  {multi ? `${d.label} ` : ''}내 일정 {d.count}건 — 참석자에게 미리 알려 주세요
                </li>
              ))}
            </ul>
          )}

          <section className="leave-field">
            <h4>결재선</h4>
            <ApprovalLine line={args.line ?? []} />
          </section>
          <p className="field-hint">사유는 적지 않아요. 종류와 날짜만 올라가요.</p>
        </>
      )}

      {ready && complete ? (
        confirming ? (
          <footer className="confirm-bar">
            <span>
              {chosenKind} {adding}일을 상신할까요?
            </span>
            <button type="button" className="ghost" onClick={() => setConfirming(false)}>
              돌아가기
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => chosenDelegate && respond({ submitted: true, kind: chosenKind, delegateId: chosenDelegate })}
            >
              상신 확정
            </button>
          </footer>
        ) : (
          <footer>
            {over && <span className="field-error push-left">남은 연차보다 많아요.</span>}
            <button type="button" className="ghost" onClick={() => respond({ cancelled: true })}>
              취소
            </button>
            <button type="button" className="primary" disabled={over || !chosenDelegate} onClick={() => setConfirming(true)}>
              상신
            </button>
          </footer>
        )
      ) : (
        status === 'answered' && (
          <p className="card-note">
            {isSuperseded(result) ? '새 요청으로 대체되었어요.' : answered ? '상신했어요.' : '취소했어요.'}
          </p>
        )
      )}
    </CardShell>
  );
}

/* ── 상신 완료 ───────────────── */

function LeaveResultCard({ args, status }: CardProps<LeaveResultArgs, never>) {
  return (
    <CardShell title="휴가 상신 완료" status={status}>
      {!args?.number || !args.periodLabel || typeof args.remaining !== 'number' ? (
        <Skeleton rows={2} />
      ) : (
        <div className="booking-done">
          <span className="check" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>
              {args.kind} · {args.periodLabel}
            </strong>
            <span>
              {args.number} · 결재 {args.approver || '–'} · 대결자 {args.delegate}
            </span>
            <span>신청 후 남은 연차 {args.remaining}일</span>
          </div>
        </div>
      )}
    </CardShell>
  );
}

/* ── 연차 현황 ───────────────── */

function LeaveStatusCard({ args, status }: CardProps<LeaveStatusArgs, never>) {
  const mine = (args?.mine ?? []).filter((m) => m && typeof m.status === 'string');
  const team = (args?.team ?? []).filter((d) => d && Array.isArray(d.people));
  return (
    <CardShell title="연차 현황" status={status}>
      {!balanceReady(args?.balance) ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <BalanceBar balance={args.balance} />
          <section className="leave-field">
            <h4>내 휴가 예정</h4>
            {mine.length ? (
              <ul className="leave-list">
                {mine.map((m) => (
                  <li key={m.date}>
                    <span>{m.label}</span>
                    <strong>{m.kind}</strong>
                    <em className={m.status === '승인' ? 'is-ok' : ''}>{m.status}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="card-note">예정된 휴가가 없어요.</p>
            )}
          </section>
          {team.length > 0 && (
            <section className="leave-field">
              <h4>팀 부재 (앞으로 2주)</h4>
              <ul className="leave-list">
                {team.map((d) => (
                  <li key={d.date}>
                    <span>{d.label}</span>
                    <strong>
                      {d.people
                        .filter((p) => p && typeof p.name === 'string')
                        .map((p) => (p.kind === '연차' ? p.name : `${p.name}(${p.kind === '오전 반차' ? '오전' : '오후'})`))
                        .join(' · ')}
                    </strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </CardShell>
  );
}

/* ── 근무시간 ───────────────── */

const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

function AttendanceCard({ args, status }: CardProps<AttendanceArgs, never>) {
  const days = (args?.days ?? []).filter((d) => d && typeof d.minutes === 'number' && typeof d.label === 'string');
  const ready = typeof args?.totalMin === 'number' && typeof args.limitMin === 'number' && typeof args.standardMin === 'number';
  return (
    <CardShell title="이번 주 근무" meta={ready ? `${hm(args.totalMin!)} / 주 ${args.limitMin! / 60}시간` : undefined} status={status}>
      {!ready || days.length === 0 ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <div className="work-meter" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (args.totalMin! / args.limitMin!) * 100)}%` }} />
            <i style={{ left: `${(args.standardMin! / args.limitMin!) * 100}%` }} />
          </div>
          <p className="work-meter-legend">
            <span>0</span>
            <span style={{ left: `${(args.standardMin! / args.limitMin!) * 100}%` }}>40시간</span>
            <span>52시간</span>
          </p>
          <table className="work-table">
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col">출근</th>
                <th scope="col">퇴근</th>
                <th scope="col">근무</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <th scope="row">{d.label}</th>
                  {d.leave === '연차' ? (
                    <td colSpan={2} className="is-leave">
                      연차
                    </td>
                  ) : (
                    <>
                      <td>{d.in ?? '–'}</td>
                      <td>{d.out ?? (d.in ? '근무 중' : '–')}</td>
                    </>
                  )}
                  <td>{hm(d.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </CardShell>
  );
}

export const LEAVE_CARDS: Record<string, ComponentType<CardProps<any, any>>> = {
  [LEAVE_TOOL.request]: LeaveRequestCard,
  [LEAVE_TOOL.result]: LeaveResultCard,
  [LEAVE_TOOL.status]: LeaveStatusCard,
  [LEAVE_TOOL.attendance]: AttendanceCard,
};
