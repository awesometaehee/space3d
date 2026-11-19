import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { STATUS_LABEL, usePresence, type Member, type PresenceStatus } from '../data/presence';
import { MEETING_ROOMS } from '../data/meetingRooms';
import { AgentPanel } from '../agent/AgentPanel';
import { parsePartialJson, type Message, type ToolCall } from '../agent/agui';
import { DISPLAY_ONLY_TOOLS, FRONTEND_TOOLS, domainById, isSpatial, openWorkspace, sceneFor } from '../agent/catalog';
import { useApprovals } from '../agent/domains/approval/workspace';
import { pendingToolCalls, type Conversation } from '../agent/conversation';
import type { SceneHint } from '../agent/domain';
import { createMockAgent } from '../agent/mock/agent';
import { GroupwareBackend } from '../agent/mock/backend';
import type { AgentState } from '../agent/state';
import { useAgent } from '../agent/useAgent';
import type { RoomHighlight } from './DioramaEngine';
import type { RoomLabel } from './DioramaView';

// three.js 묶음은 화면이 실제로 보일 때만 내려받는다 → 첫 로딩에 영향 없음
const DioramaView = lazy(() => import('./DioramaView'));

const STATUS_ORDER: PresenceStatus[] = ['working', 'meeting', 'away'];

// 실제 연동 시 이 두 줄을 AG-UI 서버(HttpAgent 등)로 바꾼다. 백엔드는 서버 쪽으로 옮겨 간다
const backend = new GroupwareBackend();
const agent = createMockAgent({ backend });
const INITIAL_STATE = backend.initialState();
/** 복셀이 필요한 업무(회의실 등)일 때의 패널 폭 */
const PANEL_NARROW = 360;
/** 그 밖의 업무일 때: 화면의 55%, 420~820px */
const panelWideWidth = (viewport: number) => Math.min(820, Math.max(420, Math.round(viewport * 0.55)));
/** 고정 작업 화면(결재함 등) + 대화 열: 화면의 70%, 720~1180px */
const panelWorkspaceWidth = (viewport: number) => Math.min(1180, Math.max(720, Math.round(viewport * 0.7)));

/** 작업 화면을 열었을 때 대화 열에 보여 줄 예시 요청 */
const WORKSPACE_SUGGESTIONS: Record<string, string[]> = {
  approval: ['확인이 필요한 것만 보여줘', '금액 큰 순으로 정렬해줘', '이 문서 요약해줘', '반려 사유 써줘'],
};
/** 패널 양옆 여백 합 (right 16px + 장면과 띄울 16px) */
const PANEL_GAP = 32;

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

// 아래 한 줄에 보여주는 가상 요약. 실제 연동 시 그룹웨어 데이터로 바꾼다.
const HEADLINE = { label: '오늘의 공지', title: '11월 정기 보안 점검 안내' };
const SHORTCUTS = [
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportWidth = useViewportWidth();

  const { conversation, sendMessage, respondToTool, updateState, reset } = useAgent({
    agent,
    initialState: INITIAL_STATE,
    tools: FRONTEND_TOOLS,
    displayOnlyTools: DISPLAY_ONLY_TOOLS,
  });
  const scene = useMemo(() => sceneFromConversation(conversation), [conversation]);

  // 레이아웃: 복셀이 필요한 업무면 지금처럼 좁은 패널 + 방 확대,
  // 그 밖의 업무(결재 등)와 빈 패널이면 넓은 패널 + 사무실 전체를 왼쪽에 줌 아웃
  const spatial = isSpatial(conversation.state);
  const workspaceDomain = openWorkspace(conversation.state);
  const panelWidth = workspaceDomain
    ? panelWorkspaceWidth(viewportWidth)
    : spatial
      ? PANEL_NARROW
      : panelWideWidth(viewportWidth);
  const approvals = useApprovals(backend.approvals);

  /** 하단 바 바로가기: 에이전트를 거치지 않고 작업 화면을 바로 연다 */
  const openWorkspaceOf = (domainId: string) => {
    const ws = domainById(domainId)?.workspace;
    if (!ws) return;
    updateState(ws.open);
    setPanelOpen(true);
  };

  // 휴가 신청 중이면 그날 부재 예정인 팀원을 복셀에서 부재로 미리 보여 준다
  const viewMembers = useMemo(() => {
    if (!scene.away?.length) return members;
    const away = new Set(scene.away);
    return members.map((m) => (away.has(m.id) ? { ...m, status: 'away' as const } : m));
  }, [members, scene.away]);

  const roomHighlights = useMemo(() => {
    const map = new Map<string, RoomHighlight>();
    for (const id of scene.booked.keys()) map.set(id, 'booked');
    for (const id of scene.candidates) map.set(id, 'candidate');
    if (scene.active) map.set(scene.active, 'active');
    // 카드나 장면에서 가리키는 방은 한 단계 더 진하게
    if (hoveredRoom && map.has(hoveredRoom)) map.set(hoveredRoom, 'active');
    return map;
  }, [scene, hoveredRoom]);

  const roomLabels = useMemo<RoomLabel[]>(() => {
    const labels: RoomLabel[] = [];
    for (const room of MEETING_ROOMS) {
      const tone = roomHighlights.get(room.id);
      if (!tone) continue;
      const booked = scene.booked.get(room.id);
      const text =
        tone === 'booked' && booked
          ? `${room.name} · ${booked}`
          : `${room.name} · ${room.capacity}인`;
      labels.push({ roomId: room.id, text, tone });
    }
    return labels;
  }, [roomHighlights, scene]);

  /** 3D 장면이나 회의실 이름표에서 방을 누르면, 답을 기다리는 회의실 카드에 그대로 응답한다 */
  const pickRoom = (roomId: string) => {
    if (scene.pickCallId && scene.candidates.includes(roomId)) {
      respondToTool(scene.pickCallId, { roomId });
      setHoveredRoom(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setPanelOpen(true);
    sendMessage(draft);
    setDraft('');
  };

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
                members={viewMembers}
                roomHighlights={roomHighlights}
                roomLabels={roomLabels}
                focusRoomIds={panelOpen && spatial ? scene.focus : []}
                focusInsetRight={panelOpen ? panelWidth + PANEL_GAP : 0}
                onRoomPick={pickRoom}
                onRoomHover={setHoveredRoom}
                selectedId={selectedId}
                showStats={showStats}
                onSelect={setSelectedId}
                onUnavailable={() => setWebgl(false)}
              />
            </Suspense>
          )
        )}

        {panelOpen && scene.note && (
          <p className="scene-note" role="status">
            {scene.note}
          </p>
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

        {panelOpen && (
          <AgentPanel
            conversation={conversation}
            width={panelWidth}
            wide={!spatial}
            workspace={
              workspaceDomain?.workspace && (
                <workspaceDomain.workspace.Component state={conversation.state} updateState={updateState} api={backend} />
              )
            }
            suggestions={workspaceDomain ? WORKSPACE_SUGGESTIONS[workspaceDomain.id] : undefined}
            respondToTool={respondToTool}
            onHoverRoom={setHoveredRoom}
            onSuggest={(text) => sendMessage(text)}
            onReset={() => {
              // 대화만 비우고, 만든 예약·결재 처리 결과 같은 공유 상태는 이어 간다
              reset({
                ...conversation.state,
                activeDomain: null,
                meetingRoom: { ...conversation.state.meetingRoom, request: null },
                schedule: { ...conversation.state.schedule, request: null, stage: null },
              });
              setHoveredRoom(null);
              inputRef.current?.focus();
            }}
            onClose={() => {
              setPanelOpen(false);
              setHoveredRoom(null);
            }}
          />
        )}
      </main>

      <footer className="statusbar">
        <form className="agent-input" onSubmit={submit} role="search" aria-label="에이전트에게 요청">
          <span className="agent-input-icon" aria-hidden="true">
            ✦
          </span>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setPanelOpen(true)}
            placeholder="무엇을 도와드릴까요? 예) 결재할 문서 보여줘"
            aria-label="요청 입력"
          />
          <button type="submit" disabled={!draft.trim() || conversation.running} aria-label="보내기">
            ↵
          </button>
        </form>
        <span className="divider" aria-hidden="true" />
        <span className="headline">
          {HEADLINE.label} <strong>{HEADLINE.title}</strong>
        </span>
        <span className="divider" aria-hidden="true" />
        <button type="button" onClick={() => openWorkspaceOf('approval')}>
          결재 대기 <strong>{approvals.inbox.length}</strong>
        </button>
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

interface SceneLink extends SceneHint {
  /** 회의실 id → 예약 요약 (예: "11/19 15:00 예약") */
  booked: Map<string, string>;
}

/**
 * 대화 상태에서 3D 장면에 보여 줄 것을 뽑는다.
 * 답을 기다리는 가장 최근 카드가 기준이고, 그 카드의 업무 영역이 공간 정보를 정한다 (catalog.sceneFor).
 * 답을 기다리는 카드가 없으면 마지막 카드의 초점만 이어 간다 (예: 예약 완료 후 그 방).
 */
function sceneFromConversation(conversation: Conversation<AgentState>): SceneLink {
  const booked = new Map<string, string>();
  for (const b of conversation.state.meetingRoom.bookings) {
    const [, m, d] = b.date.split('-').map(Number);
    booked.set(b.roomId, `${m}/${d} ${b.start} 예약`);
  }
  const empty: SceneLink = { candidates: [], active: null, focus: [], pickCallId: null, booked };

  const pending = pendingToolCalls(conversation.messages);
  const call = pending[pending.length - 1];
  if (call) {
    const args = parsePartialJson(call.function.arguments) as Record<string, unknown> | undefined;
    const hint = sceneFor(call, args, conversation.streamingToolCalls.includes(call.id));
    return hint ? { ...hint, booked } : empty;
  }
  const lastCall = lastToolCall(conversation.messages);
  if (!lastCall) return empty;
  const hint = sceneFor(lastCall, parsePartialJson(lastCall.function.arguments) as Record<string, unknown> | undefined, false);
  return { ...empty, focus: hint?.focus ?? [] };
}

function lastToolCall(messages: Message[]): ToolCall | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant' && m.toolCalls?.length) return m.toolCalls[m.toolCalls.length - 1];
  }
  return undefined;
}
