import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { STATUS_LABEL, usePresence, type Member, type PresenceStatus } from '../data/presence';

// three.js 묶음은 화면이 실제로 보일 때만 내려받는다 → 첫 로딩에 영향 없음
const DioramaView = lazy(() => import('./DioramaView'));

const STATUS_ORDER: PresenceStatus[] = ['working', 'meeting', 'away'];

// 아래 한 줄에 보여주는 가상 요약. 실제 연동 시 그룹웨어 데이터로 바꾼다.
const HEADLINE = { label: '오늘의 공지', title: '11월 정기 보안 점검 안내' };
const SHORTCUTS = [
  { label: '결재 대기', count: 2 },
  { label: '오늘 일정', count: 3 },
  { label: '새 메일', count: 6 },
  { label: '게시판' },
];

function PresenceList({ members }: { members: Member[] }) {
  return (
    <ul className="presence-list">
      {members.map((m) => (
        <li key={m.id} className={`is-${m.status}`}>
          <span className="dot" aria-hidden="true" />
          <strong>{m.name}</strong> {m.title}
          <em>{STATUS_LABEL[m.status]}</em>
        </li>
      ))}
    </ul>
  );
}

export function DioramaWidget() {
  const stageRef = useRef<HTMLDivElement>(null);
  const members = usePresence();
  const [nearViewport, setNearViewport] = useState(false);
  const [webgl, setWebgl] = useState(() => typeof WebGL2RenderingContext !== 'undefined');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const selected = members.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="space">
      <main className="diorama-stage" ref={stageRef} aria-label="우리 팀 공간">
        {!webgl ? (
          <PresenceList members={members} />
        ) : (
          nearViewport && (
            <Suspense fallback={<div className="diorama-skeleton">공간을 불러오는 중…</div>}>
              <DioramaView
                members={members}
                selectedId={selectedId}
                showStats={showStats}
                onSelect={setSelectedId}
                onUnavailable={() => setWebgl(false)}
              />
            </Suspense>
          )
        )}

        {selected && (
          <aside className={`member-card is-${selected.status}`}>
            <button type="button" className="close" aria-label="닫기" onClick={() => setSelectedId(null)}>
              ×
            </button>
            <strong>
              {selected.name} <small>{selected.title}</small>
            </strong>
            <span>{selected.team}</span>
            <span className="status">
              <span className="dot" aria-hidden="true" />
              {STATUS_LABEL[selected.status]}
            </span>
          </aside>
        )}
      </main>

      <footer className="statusbar">
        <span className="headline">
          {HEADLINE.label} <strong>{HEADLINE.title}</strong>
        </span>
        <span className="divider" aria-hidden="true" />
        {SHORTCUTS.map((item) => (
          <a key={item.label} href="#" onClick={(e) => e.preventDefault()}>
            {item.label}
            {item.count !== undefined && <strong> {item.count}</strong>}
          </a>
        ))}
        <span className="divider" aria-hidden="true" />
        {STATUS_ORDER.map((status) => (
          <span key={status} className={`legend is-${status}`}>
            <span className="dot" aria-hidden="true" />
            {STATUS_LABEL[status]}
            <strong> {members.filter((m) => m.status === status).length}</strong>
          </span>
        ))}
        <button type="button" aria-pressed={showStats} onClick={() => setShowStats((v) => !v)}>
          성능 <strong>{showStats ? 'ON' : 'OFF'}</strong>
        </button>
      </footer>
    </div>
  );
}
