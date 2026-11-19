import type { ComponentType } from 'react';
import { STATUS_LABEL, type PresenceStatus } from '../../../data/presence';
import { CardShell, Skeleton, type CardProps } from '../../cardKit';
import { PEOPLE_TOOL, type PersonCard, type ShowOrgArgs, type ShowPeopleArgs } from './tools';

const STATUSES: PresenceStatus[] = ['working', 'meeting', 'away'];
const statusOk = (s: unknown): s is PresenceStatus => STATUSES.includes(s as PresenceStatus);

const personReady = (p: Partial<PersonCard> | undefined): p is PersonCard =>
  !!p &&
  typeof p.id === 'string' &&
  typeof p.name === 'string' &&
  typeof p.title === 'string' &&
  typeof p.team === 'string' &&
  Array.isArray(p.duties) &&
  Array.isArray(p.matched) &&
  typeof p.email === 'string' &&
  typeof p.seat === 'boolean' &&
  statusOk(p.status);

function Status({ status }: { status: PresenceStatus }) {
  return (
    <span className={`person-status is-${status}`}>
      <span className="dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function PeopleCard({ args, status }: CardProps<ShowPeopleArgs, never>) {
  const people = (args?.people ?? []).filter(personReady);
  return (
    <CardShell title="사람 찾기" meta={args?.query && args.query !== '이름' ? `${args.query} 담당` : undefined} status={status}>
      {people.length === 0 ? (
        <Skeleton rows={2} />
      ) : (
        <ul className="people-list">
          {people.map((p) => (
            <li key={p.id} className="person-card">
              <span className="avatar" aria-hidden="true">
                {p.name.slice(0, 1)}
              </span>
              <div className="person-main">
                <div className="person-head">
                  <strong>{p.name}</strong>
                  <small>{p.title}</small>
                  <Status status={p.status} />
                </div>
                <span className="person-team">
                  {p.team} · {p.location}
                  {p.seat && <em> · 사무실에 표시</em>}
                </span>
                <ul className="duty-chips" aria-label="담당 업무">
                  {p.duties.map((d) => (
                    <li key={d} className={p.matched.includes(d) ? 'is-match' : ''}>
                      {d}
                    </li>
                  ))}
                </ul>
                <dl className="person-contact">
                  <dt>내선</dt>
                  <dd>{p.ext}</dd>
                  <dt>메일</dt>
                  <dd>{p.email}</dd>
                </dl>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function OrgCard({ args, status }: CardProps<ShowOrgArgs, never>) {
  const teams = (args?.teams ?? []).filter((t) => t && typeof t.team === 'string' && Array.isArray(t.members));
  return (
    <CardShell title="조직도" meta={teams.length > 1 ? `${teams.length}개 팀` : teams[0]?.location} status={status}>
      {teams.length === 0 ? (
        <Skeleton rows={3} />
      ) : (
        <div className="org-grid">
          {teams.map((t) => {
            const members = t.members.filter((m) => m && typeof m.name === 'string' && typeof m.duty === 'string' && statusOk(m.status));
            return (
              <section key={t.team} className="org-team">
                <header>
                  <strong>{t.team}</strong>
                  <span>
                    {t.location} · {members.length}명
                  </span>
                </header>
                <ul>
                  {members.map((m) => (
                    <li key={m.id} className={`is-${m.status}`}>
                      <span className="dot" aria-label={STATUS_LABEL[m.status]} />
                      <strong>{m.name}</strong>
                      <small>{m.title}</small>
                      <em>{m.duty}</em>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </CardShell>
  );
}

export const PEOPLE_CARDS: Record<string, ComponentType<CardProps<any, any>>> = {
  [PEOPLE_TOOL.showPeople]: PeopleCard,
  [PEOPLE_TOOL.showOrg]: OrgCard,
};
