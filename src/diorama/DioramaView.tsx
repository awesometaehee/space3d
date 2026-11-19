import { useEffect, useRef } from 'react';
import { DioramaEngine, type EngineStats, type RoomHighlight } from './DioramaEngine';
import { STATUS_LABEL, type Member } from '../data/presence';

/** 회의실 위에 띄우는 이름표 */
export interface RoomLabel {
  roomId: string;
  text: string;
  tone: RoomHighlight;
}

interface Props {
  members: Member[];
  /** 회의실 id → 강조 상태 */
  roomHighlights: Map<string, RoomHighlight>;
  roomLabels: RoomLabel[];
  /** 카메라를 맞출 회의실. 빈 목록이면 처음 시점으로 돌아간다 */
  focusRoomIds: string[];
  /** 화면 오른쪽을 가리는 패널 폭(px). 초점을 그만큼 왼쪽으로 비킨다 */
  focusInsetRight?: number;
  onRoomPick: (roomId: string) => void;
  onRoomHover: (roomId: string | null) => void;
  selectedId: string | null;
  /** 에이전트가 찾은 사람: 이름표를 강조한다 */
  highlightIds?: string[];
  showStats: boolean;
  onSelect: (id: string | null) => void;
  /** WebGL 초기화에 실패했을 때 호출 → 위젯이 목록 화면으로 대체한다 */
  onUnavailable: () => void;
}

const formatStats = (s: EngineStats) =>
  `그리기 호출 ${s.drawCalls} · 삼각형 ${(s.triangles / 1000).toFixed(1)}k · ` +
  `지오메트리 ${(s.geometryBytes / 1024).toFixed(0)}KB · 장면 생성 ${s.buildMs.toFixed(0)}ms · 누적 렌더 ${s.renders}회`;

/** three.js를 포함하는 무거운 부분. 위젯이 화면에 보일 때 지연 로드된다. */
export default function DioramaView({
  members,
  roomHighlights,
  roomLabels,
  focusRoomIds,
  focusInsetRight = 0,
  onRoomPick,
  onRoomHover,
  selectedId,
  highlightIds,
  showStats,
  onSelect,
  onUnavailable,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DioramaEngine | null>(null);
  const labels = useRef(new Map<string, HTMLElement>()).current;
  const roomLabelEls = useRef(new Map<string, HTMLElement>()).current;
  const latest = useRef({ roomHighlights, focusRoomIds, focusInsetRight });
  latest.current = { roomHighlights, focusRoomIds, focusInsetRight };
  const lastStats = useRef<EngineStats | null>(null);
  const callbacks = useRef({ onSelect, onUnavailable, onRoomPick, onRoomHover });
  callbacks.current = { onSelect, onUnavailable, onRoomPick, onRoomHover };

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
        roomLabels: roomLabelEls,
        onSelect: (id) => callbacks.current.onSelect(id),
        onRoomPick: (id) => callbacks.current.onRoomPick(id),
        onRoomHover: (id) => callbacks.current.onRoomHover(id),
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
    // 엔진이 새로 만들어졌을 때도 지금의 회의실 강조·초점을 이어받는다
    engine.setRoomHighlights(latest.current.roomHighlights);
    if (latest.current.focusRoomIds.length || latest.current.focusInsetRight) {
      engine.focusRooms(latest.current.focusRoomIds, latest.current.focusInsetRight);
    }
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, [memberKey, labels, roomLabelEls]);

  const highlightKey = [...roomHighlights].map(([id, s]) => `${id}:${s}`).join(',');
  useEffect(() => {
    engineRef.current?.setRoomHighlights(latest.current.roomHighlights);
  }, [highlightKey]);

  // 초점 방이나 패널 폭이 바뀌면 카메라를 다시 맞춘다
  const focusKey = `${focusRoomIds.join(',')}|${focusInsetRight}`;
  const lastFocus = useRef('|0');
  useEffect(() => {
    if (focusKey === lastFocus.current) return;
    lastFocus.current = focusKey;
    const { focusRoomIds: ids, focusInsetRight: inset } = latest.current;
    engineRef.current?.focusRooms(ids, inset);
  }, [focusKey]);

  // 새로 생긴 회의실 이름표를 제자리로 옮긴다
  const roomLabelKey = roomLabels.map((l) => `${l.roomId}:${l.tone}:${l.text}`).join('|');
  useEffect(() => {
    engineRef.current?.requestRender();
  }, [roomLabelKey]);

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
            className={`vlabel is-${m.status}${m.id === selectedId ? ' is-selected' : ''}${highlightIds?.includes(m.id) ? ' is-found' : ''}`}
            aria-label={`${m.name} ${m.title}, ${STATUS_LABEL[m.status]}`}
            onClick={() => onSelect(m.id === selectedId ? null : m.id)}
          >
            <span className="dot" aria-hidden="true" />
            {m.name}
          </button>
        ))}
        {roomLabels.map((l) => (
          <button
            key={l.roomId}
            type="button"
            ref={(el) => {
              if (el) roomLabelEls.set(l.roomId, el);
              else roomLabelEls.delete(l.roomId);
            }}
            className={`room-label is-${l.tone}`}
            disabled={l.tone === 'booked'}
            onClick={() => onRoomPick(l.roomId)}
            onMouseEnter={() => onRoomHover(l.roomId)}
            onMouseLeave={() => onRoomHover(null)}
          >
            {l.text}
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
