import { useEffect, useRef } from 'react';
import { DioramaEngine, type EngineStats } from './DioramaEngine';
import { STATUS_LABEL, type Member } from '../data/presence';

interface Props {
  members: Member[];
  selectedId: string | null;
  showStats: boolean;
  onSelect: (id: string | null) => void;
  /** WebGL 초기화에 실패했을 때 호출 → 위젯이 목록 화면으로 대체한다 */
  onUnavailable: () => void;
}

const formatStats = (s: EngineStats) =>
  `그리기 호출 ${s.drawCalls} · 삼각형 ${(s.triangles / 1000).toFixed(1)}k · ` +
  `지오메트리 ${(s.geometryBytes / 1024).toFixed(0)}KB · 장면 생성 ${s.buildMs.toFixed(0)}ms · 누적 렌더 ${s.renders}회`;

/** three.js를 포함하는 무거운 부분. 위젯이 화면에 보일 때 지연 로드된다. */
export default function DioramaView({ members, selectedId, showStats, onSelect, onUnavailable }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DioramaEngine | null>(null);
  const labels = useRef(new Map<string, HTMLElement>()).current;
  const lastStats = useRef<EngineStats | null>(null);
  const callbacks = useRef({ onSelect, onUnavailable });
  callbacks.current = { onSelect, onUnavailable };

  // 좌석 배정은 구성원 목록(순서)이 바뀔 때만 다시 한다. 상태 변화로는 엔진을 재생성하지 않는다.
  const memberKey = members.map((m) => m.id).join(',');

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !memberKey) return;
    let engine: DioramaEngine;
    try {
      engine = new DioramaEngine(host, {
        memberIds: memberKey.split(','),
        labels,
        onSelect: (id) => callbacks.current.onSelect(id),
        wheelZoom: true, // 화면 전체를 쓰므로 휠 확대를 켠다
        onAfterRender: (stats) => {
          lastStats.current = stats;
          if (statsRef.current) statsRef.current.textContent = formatStats(stats);
        },
      });
    } catch (error) {
      console.warn('디오라마 3D 초기화 실패, 목록 화면으로 대체합니다.', error);
      callbacks.current.onUnavailable();
      return;
    }
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, [memberKey, labels]);

  useEffect(() => {
    engineRef.current?.setPresence(new Map(members.map((m) => [m.id, m.status])));
  }, [members]);

  useEffect(() => {
    if (showStats && statsRef.current && lastStats.current) {
      statsRef.current.textContent = formatStats(lastStats.current);
    }
  }, [showStats]);

  return (
    <div className="diorama-view" ref={hostRef}>
      <div className="diorama-labels">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            ref={(el) => {
              if (el) labels.set(m.id, el);
              else labels.delete(m.id);
            }}
            className={`vlabel is-${m.status}${m.id === selectedId ? ' is-selected' : ''}`}
            aria-label={`${m.name} ${m.title}, ${STATUS_LABEL[m.status]}`}
            onClick={() => onSelect(m.id === selectedId ? null : m.id)}
          >
            <span className="dot" aria-hidden="true" />
            {m.name}
          </button>
        ))}
      </div>
      <div className="diorama-tools">
        <button type="button" aria-label="확대" onClick={() => engineRef.current?.zoomBy(1.25)}>
          +
        </button>
        <button type="button" aria-label="축소" onClick={() => engineRef.current?.zoomBy(0.8)}>
          −
        </button>
        <button type="button" aria-label="시점 초기화" onClick={() => engineRef.current?.resetView()}>
          ⟲
        </button>
      </div>
      {showStats && <div className="diorama-stats" ref={statsRef} />}
    </div>
  );
}
