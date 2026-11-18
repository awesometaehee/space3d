import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PointLight,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AO_FULL, AO_SOFT, greedyMesh } from './voxel/greedyMesh';
import type { VoxelGrid } from './voxel/VoxelGrid';
import { buildLinearPalette } from './scene/palette';
import { createVoxelMaterial } from './voxelMaterial';
import { buildOfficeRoom, FLOOR_TOP, GLASS_HEIGHT, MEETING_ROOM_ZONES, ROOM } from './scene/officeRoom';
import { ANIMAL_GRID, ANIMAL_LOOKS, ANIMAL_SCALE, SIT_BASE, buildAnimal, gridTop } from './scene/character';

export interface EngineStats {
  drawCalls: number;
  triangles: number;
  geometryBytes: number;
  renders: number;
  /** 장면(격자 → 메시) 생성에 걸린 시간 */
  buildMs: number;
}

export interface EngineOptions {
  /** 좌석 순서대로 배정할 구성원 id */
  memberIds: string[];
  /** id → 이름표 DOM. 매 렌더마다 화면 좌표로 옮긴다. */
  labels: Map<string, HTMLElement>;
  onSelect: (id: string | null) => void;
  /** 회의실 id → 이름표 DOM (있을 때만 위치를 맞춘다) */
  roomLabels?: Map<string, HTMLElement>;
  /** 강조된(고를 수 있는) 회의실을 장면에서 눌렀을 때 */
  onRoomPick?: (roomId: string) => void;
  /** 고를 수 있는 회의실 위에 포인터가 올라가거나 벗어날 때 */
  onRoomHover?: (roomId: string | null) => void;
  /** 휠·핀치 확대를 켠다. 스크롤되는 페이지 안에 넣을 때는 끄는 편이 좋다 */
  wheelZoom?: boolean;
  onAfterRender?: (stats: EngineStats) => void;
}

const MAX_PIXEL_RATIO = 1.5;
const ZOOM_MIN = 0.8;
/** 넓은 패널 옆 전체 보기에서 허용하는 가장 작은 줌 */
const OVERVIEW_ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;
const POLAR = 58;
/** 그림자 지도 한 변(픽셀). 2048이면 GPU 메모리 약 16MB */
const SHADOW_MAP_SIZE = 2048;
const deg = (d: number) => (d * Math.PI) / 180;

/**
 * 회의실 강조 상태
 * - candidate: 에이전트가 제안한 후보 (누를 수 있다)
 * - active: 지금 보고 있거나 고른 방
 * - booked: 이번 대화에서 예약한 방
 */
export type RoomHighlight = 'candidate' | 'active' | 'booked';

const HIGHLIGHT_STYLE: Record<RoomHighlight, { color: number; floor: number; volume: number }> = {
  candidate: { color: 0x4f63e6, floor: 0.22, volume: 0.06 },
  active: { color: 0x4f63e6, floor: 0.5, volume: 0.16 },
  booked: { color: 0x26a06b, floor: 0.32, volume: 0.08 },
};
const FOCUS_MS = 450;

interface RoomOverlay {
  floor: Mesh<BoxGeometry, MeshBasicMaterial>;
  volume: Mesh<BoxGeometry, MeshBasicMaterial>;
  /** 이름표 위치 */
  anchor: Vector3;
  /** 바닥 중심 (카메라 초점) */
  center: Vector3;
  size: number;
}

/**
 * 복셀 사무실 디오라마 렌더러.
 * - 연속 루프 없이, 변화가 있을 때만 한 프레임 그린다.
 * - 화면에 보이지 않거나 탭이 숨겨지면 그리지 않는다.
 * - 실시간 그림자·후처리·텍스처를 쓰지 않는다 (AO는 정점 색에 미리 반영).
 */
export class DioramaEngine {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 600);
  private readonly controls: OrbitControls;
  /** 방: 블록 단위 얼룩과 홈으로 타일·판재 느낌을 낸다 */
  private readonly material = createVoxelMaterial({ grain: 0.07, blockTone: 0.09, groove: 0.22, blockSize: 4 });
  /** 캐릭터: 작아서 홈은 빼고 칸 단위 얼룩만 약하게 */
  private readonly characterMaterial = createVoxelMaterial({ grain: 0.06, blockTone: 0, groove: 0, blockSize: 4 });
  private readonly glassMaterial = new MeshLambertMaterial({
    color: 0xd4eaf2,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  private readonly geometries: BufferGeometry[] = [];
  private readonly characters = new Map<string, { mesh: Mesh; anchor: Vector3 }>();
  private readonly pickables: Mesh[] = [];
  /** 회의실별 강조 메시: 바닥판(floor)과 공간 덩어리(volume) */
  private readonly rooms = new Map<string, RoomOverlay>();
  private roomStates = new Map<string, RoomHighlight>();
  private hoveredRoom: string | null = null;
  private focusRaf = 0;
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;
  private readonly raycaster = new Raycaster();
  private readonly projected = new Vector3();
  private readonly canvas: HTMLCanvasElement;
  private buildMs = 0;
  private geometryBytes = 0;
  private renders = 0;
  private raf = 0;
  private onScreen = true;
  private pending = false;
  private disposed = false;
  private width = 1;
  private height = 1;
  private downAt: { x: number; y: number } | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly options: EngineOptions,
  ) {
    // 컨텍스트를 dispose 때 강제로 버리므로 캔버스는 엔진이 직접 만들고 지운다
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    // 그림자는 장면이 바뀔 때만 다시 굽는다 (카메라를 돌려도 재계산하지 않는다)
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'diorama-canvas';
    host.prepend(this.canvas);

    const started = performance.now();
    this.buildScene();
    this.buildMs = performance.now() - started;

    this.camera.position.setFromSphericalCoords(300, deg(POLAR), deg(45));
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = false; // 감쇠는 연속 루프가 필요하므로 끈다
    this.controls.enablePan = false;
    this.controls.enableZoom = options.wheelZoom === true;
    this.controls.minZoom = ZOOM_MIN;
    this.controls.maxZoom = ZOOM_MAX;
    this.controls.rotateSpeed = 0.6;
    this.controls.minAzimuthAngle = deg(10);
    this.controls.maxAzimuthAngle = deg(80);
    this.controls.minPolarAngle = deg(35);
    this.controls.maxPolarAngle = deg(68);
    this.controls.saveState();
    this.controls.addEventListener('change', this.requestRender);
    // 페이지 안에 끼워 넣는 경우에는 세로 스크롤을 양보한다
    this.canvas.style.touchAction = options.wheelZoom ? 'none' : 'pan-y';

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.requestRender);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.onScreen = entry.isIntersecting;
      if (this.onScreen && this.pending) this.requestRender();
    });
    this.intersectionObserver.observe(host);

    this.resize();
  }

  private toMesh(
    grid: VoxelGrid,
    palette: Float32Array,
    aoLevels: readonly number[] | null,
    material: MeshLambertMaterial = this.material,
  ): Mesh {
    const data = greedyMesh(grid, palette, aoLevels);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(data.normals, 3, true));
    geometry.setAttribute('color', new BufferAttribute(data.colors, 3, true));
    geometry.setIndex(new BufferAttribute(data.indices, 1));
    this.geometries.push(geometry);
    this.geometryBytes +=
      data.positions.byteLength + data.normals.byteLength + data.colors.byteLength + data.indices.byteLength;
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = material !== this.glassMaterial;
    mesh.receiveShadow = material !== this.glassMaterial;
    return mesh;
  }

  private buildScene(): void {
    const palette = buildLinearPalette();
    const root = new Group();
    root.position.set(-ROOM.W / 2, -ROOM.H / 2, -ROOM.D / 2);
    this.scene.add(root);

    const room = buildOfficeRoom();
    root.add(this.toMesh(room.grid, palette, AO_FULL));
    const glass = this.toMesh(room.glass, palette, null, this.glassMaterial);
    glass.renderOrder = 1; // 불투명한 것들 뒤에 그린다
    root.add(glass);
    this.buildRoomOverlays(root);

    room.seats.forEach((seat, i) => {
      const id = this.options.memberIds[i];
      if (!id) return;
      const grid = buildAnimal(ANIMAL_LOOKS[i % ANIMAL_LOOKS.length], seat.pose);
      const mesh = this.toMesh(grid, palette, AO_SOFT, this.characterMaterial);
      // 캐릭터는 방보다 촘촘한 격자로 만들어 축소 배치한다.
      // 정점이 격자 좌표(0~255)라 중심 회전을 위해 그룹으로 감싼다.
      const baseY = seat.pose === 'stand' ? 0 : -SIT_BASE * ANIMAL_SCALE;
      mesh.scale.setScalar(ANIMAL_SCALE);
      mesh.position.set((-ANIMAL_GRID / 2) * ANIMAL_SCALE, baseY, (-ANIMAL_GRID / 2) * ANIMAL_SCALE);
      mesh.userData.id = id;
      // 자리마다 정해진 방향(책상 쪽)을 바라본다
      const pivot = new Group();
      pivot.position.set(seat.x, seat.y, seat.z);
      pivot.rotation.y = seat.facing;
      pivot.add(mesh);
      root.add(pivot);
      this.pickables.push(mesh);
      const top = seat.y + baseY + gridTop(grid) * ANIMAL_SCALE + 1;
      const anchor = new Vector3(seat.x, top, seat.z).add(root.position);
      this.characters.set(id, { mesh, anchor });
    });

    // 차가운 약한 환경광 + 따뜻하고 강한 햇빛으로 명암 대비를 만든다
    this.scene.add(new HemisphereLight(0xcfdcff, 0x6e5f52, 0.85));
    const sun = new DirectionalLight(0xffd3a1, 2.7);
    // 오른쪽 앞 위에서 비춘다. 카메라 쪽을 향한 두 면(+x, +z)이 모두 빛을 받아 얼굴이 그늘지지 않고,
    // 그림자는 화면 왼쪽으로 비껴 떨어져 물체 뒤에 다 숨지 않는다.
    sun.position.set(1, 0.9, 0.35).multiplyScalar(220);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    const reach = 0.5 * Math.hypot(ROOM.W, ROOM.D) + 10;
    sun.shadow.camera.left = -reach;
    sun.shadow.camera.right = reach;
    sun.shadow.camera.top = reach;
    sun.shadow.camera.bottom = -reach;
    sun.shadow.camera.near = 50;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.5;
    sun.shadow.radius = 2.5;
    this.scene.add(sun);
    // 햇빛이 비스듬히 닿는 왼쪽 면(+z)을 받쳐 주는 보조광. 그림자는 만들지 않는다
    const fill = new DirectionalLight(0xffe6cc, 0.95);
    fill.position.set(-0.2, 0.5, 1);
    this.scene.add(fill);
    // 라운지 스탠드의 따뜻한 불빛
    const lampLight = new PointLight(0xffc77a, 900, 60, 2);
    lampLight.position.set(15.5, 16, 7.5).add(root.position);
    this.scene.add(lampLight);
  }

  /** 회의실마다 반투명 바닥판과 공간 덩어리를 만들어 두고, 강조할 때만 보인다. */
  private buildRoomOverlays(root: Group): void {
    for (const zone of MEETING_ROOM_ZONES) {
      const w = zone.x1 - zone.x0;
      const d = zone.z1 - zone.z0;
      const cx = (zone.x0 + zone.x1) / 2;
      const cz = (zone.z0 + zone.z1) / 2;
      const make = (height: number, y: number) => {
        const geometry = new BoxGeometry(w, height, d);
        this.geometries.push(geometry);
        const material = new MeshBasicMaterial({ transparent: true, depthWrite: false });
        const mesh = new Mesh(geometry, material);
        mesh.position.set(cx, y, cz);
        mesh.visible = false;
        mesh.renderOrder = 2;
        mesh.userData.roomId = zone.id;
        root.add(mesh);
        return mesh;
      };
      const floor = make(0.4, FLOOR_TOP + 0.25);
      const volume = make(GLASS_HEIGHT, FLOOR_TOP + GLASS_HEIGHT / 2 + 0.05);
      const anchor = new Vector3(cx, FLOOR_TOP + GLASS_HEIGHT + 2, cz).add(root.position);
      const center = new Vector3(cx, FLOOR_TOP, cz).add(root.position);
      this.rooms.set(zone.id, { floor, volume, anchor, center, size: Math.max(w, d) });
    }
  }

  /** 회의실 강조 상태를 바꾼다. 목록에 없는 방은 강조를 끈다. */
  setRoomHighlights(states: Map<string, RoomHighlight>): void {
    this.roomStates = states;
    for (const [id, room] of this.rooms) {
      const state = states.get(id);
      room.floor.visible = room.volume.visible = !!state;
      if (!state) continue;
      const style = HIGHLIGHT_STYLE[state];
      room.floor.material.color.setHex(style.color);
      room.floor.material.opacity = style.floor;
      room.volume.material.color.setHex(style.color);
      room.volume.material.opacity = style.volume;
    }
    if (this.hoveredRoom && !this.isPickable(this.hoveredRoom)) this.setHoveredRoom(null);
    this.requestRender();
  }

  private isPickable(id: string): boolean {
    const state = this.roomStates.get(id);
    return state === 'candidate' || state === 'active';
  }

  /**
   * 주어진 회의실들이 화면 가운데 오도록 카메라를 부드럽게 옮긴다. 빈 목록이면 처음 위치로.
   * 연속 루프 대신 옮기는 동안만 프레임을 그린다.
   * insetRight: 화면 오른쪽을 가리는 패널 폭(px). 그만큼 왼쪽으로 비켜서 가운데를 맞춘다.
   */
  focusRooms(ids: string[], insetRight = 0): void {
    const targets = ids.map((id) => this.rooms.get(id)).filter((r): r is RoomOverlay => !!r);
    const toTarget = new Vector3();
    let toZoom = 1;
    if (targets.length) {
      const min = targets[0].center.clone();
      const max = targets[0].center.clone();
      let extent = 0;
      for (const r of targets) {
        min.min(r.center);
        max.max(r.center);
        extent = Math.max(extent, r.size);
      }
      toTarget.addVectors(min, max).multiplyScalar(0.5);
      const span = min.distanceTo(max) + extent;
      // 방(들)이 화면의 절반쯤 차지하도록 하되 너무 가까이 붙지는 않는다
      toZoom = Math.min(1.8, Math.max(1.1, (Math.hypot(ROOM.W, ROOM.D) * 0.5) / span));
    } else if (insetRight > 0) {
      // 전체 보기 + 넓은 패널: 남은 왼쪽 공간에 사무실 전체가 들어오도록 줌 아웃한다
      const visible = Math.max(0.3, (this.width - Math.min(insetRight, this.width * 0.7)) / this.width);
      toZoom = Math.max(OVERVIEW_ZOOM_MIN, visible * 0.96);
    }
    if (insetRight > 0) {
      // 화면 오른쪽 방향으로 초점을 옮기면 장면은 왼쪽으로 비켜 보인다
      const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const worldPerPx = (this.camera.right - this.camera.left) / toZoom / this.width;
      const cap = targets.length ? 0.5 : 0.7;
      toTarget.addScaledVector(right, (Math.min(insetRight, this.width * cap) / 2) * worldPerPx);
    }
    // 휠 확대 한계보다 더 줌 아웃해야 할 때는 한계를 잠시 낮춘다 (OrbitControls가 되돌리지 않게)
    this.controls.minZoom = Math.min(ZOOM_MIN, toZoom);
    const fromTarget = this.controls.target.clone();
    const fromZoom = this.camera.zoom;
    const offset = this.camera.position.clone().sub(fromTarget);
    const started = performance.now();
    cancelAnimationFrame(this.focusRaf);
    const step = () => {
      if (this.disposed) return;
      const t = Math.min(1, (performance.now() - started) / FOCUS_MS);
      const k = 1 - Math.pow(1 - t, 3);
      this.controls.target.lerpVectors(fromTarget, toTarget, k);
      this.camera.position.copy(this.controls.target).add(offset);
      this.camera.zoom = fromZoom + (toZoom - fromZoom) * k;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      this.render();
      this.focusRaf = t < 1 ? requestAnimationFrame(step) : 0;
    };
    this.focusRaf = requestAnimationFrame(step);
  }

  /** 부재인 구성원은 자리에서 캐릭터를 숨긴다. */
  setPresence(statusById: Map<string, string>): void {
    for (const [id, { mesh }] of this.characters) {
      mesh.visible = statusById.get(id) !== 'away';
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  }

  zoomBy(factor: number): void {
    this.camera.zoom = Math.min(ZOOM_MAX, Math.max(this.controls.minZoom, this.camera.zoom * factor));
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  resetView(): void {
    this.controls.reset();
    this.requestRender();
  }

  readonly requestRender = (): void => {
    if (this.disposed) return;
    if (!this.onScreen || document.hidden) {
      this.pending = true; // 다시 보일 때 한 번만 그린다
      return;
    }
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  };

  private render(): void {
    this.pending = false;
    this.renderer.render(this.scene, this.camera);
    this.renders++;
    this.positionLabels();
    this.options.onAfterRender?.({
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometryBytes: this.geometryBytes,
      renders: this.renders,
      buildMs: this.buildMs,
    });
  }

  private positionLabels(): void {
    for (const [id, { anchor }] of this.characters) {
      const el = this.options.labels.get(id);
      if (el) this.placeLabel(el, anchor);
    }
    const roomLabels = this.options.roomLabels;
    if (!roomLabels) return;
    for (const [id, { anchor }] of this.rooms) {
      const el = roomLabels.get(id);
      if (el) this.placeLabel(el, anchor);
    }
  }

  private placeLabel(el: HTMLElement, anchor: Vector3): void {
    this.projected.copy(anchor).project(this.camera);
    const x = Math.round((this.projected.x * 0.5 + 0.5) * this.width);
    const y = Math.round((-this.projected.y * 0.5 + 0.5) * this.height);
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    el.style.visibility = 'visible';
  }

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    // 납작한 방을 기본 시점에서 봤을 때의 화면상 크기에 맞춘다
    const diagonal = (ROOM.W + ROOM.D) / Math.SQRT2;
    const needW = (diagonal / 2) * 1.02;
    const needH = ((diagonal * Math.cos(deg(POLAR)) + ROOM.H * Math.sin(deg(POLAR))) / 2) * 1.05;
    const halfH = Math.max(needH, needW / aspect);
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private readonly onVisibility = (): void => {
    if (!document.hidden && this.pending) this.requestRender();
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault(); // 복구 이벤트를 받을 수 있게 한다
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.downAt = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const down = this.downAt;
    this.downAt = null;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return; // 드래그는 선택이 아니다
    this.aim(event);
    const hit = this.raycaster.intersectObjects(this.pickables, false).find((h) => h.object.visible);
    if (hit) return this.options.onSelect(hit.object.userData.id as string);
    const room = this.pickableRoomAt();
    if (room && this.options.onRoomPick) return this.options.onRoomPick(room);
    this.options.onSelect(null);
  };

  private aim(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
  }

  /** 지금 광선이 지나는 "고를 수 있는" 회의실 (aim 다음에 부른다) */
  private pickableRoomAt(): string | null {
    const volumes: Mesh[] = [];
    for (const [id, room] of this.rooms) if (this.isPickable(id)) volumes.push(room.volume);
    if (!volumes.length) return null;
    const hit = this.raycaster.intersectObjects(volumes, false)[0];
    return hit ? (hit.object.userData.roomId as string) : null;
  }

  private setHoveredRoom(id: string | null): void {
    if (id === this.hoveredRoom) return;
    this.hoveredRoom = id;
    this.canvas.style.cursor = id ? 'pointer' : '';
    this.options.onRoomHover?.(id);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.buttons !== 0) return; // 회전 중에는 건너뛴다
    if (![...this.roomStates.keys()].some((id) => this.isPickable(id))) return this.setHoveredRoom(null);
    this.aim(event);
    this.setHoveredRoom(this.pickableRoomAt());
  };

  private readonly onPointerLeave = (): void => this.setHoveredRoom(null);

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    cancelAnimationFrame(this.focusRaf);
    for (const room of this.rooms.values()) {
      room.floor.material.dispose();
      room.volume.material.dispose();
    }
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.requestRender);
    this.controls.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.material.dispose();
    this.glassMaterial.dispose();
    this.characterMaterial.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
