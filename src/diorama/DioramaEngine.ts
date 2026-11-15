import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
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
import { buildOfficeRoom, ROOM } from './scene/officeRoom';
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
  /** 휠·핀치 확대를 켠다. 스크롤되는 페이지 안에 넣을 때는 끄는 편이 좋다 */
  wheelZoom?: boolean;
  onAfterRender?: (stats: EngineStats) => void;
}

const MAX_PIXEL_RATIO = 1.5;
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 4;
const POLAR = 58;
/** 그림자 지도 한 변(픽셀). 2048이면 GPU 메모리 약 16MB */
const SHADOW_MAP_SIZE = 2048;
const deg = (d: number) => (d * Math.PI) / 180;

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

  /** 부재인 구성원은 자리에서 캐릭터를 숨긴다. */
  setPresence(statusById: Map<string, string>): void {
    for (const [id, { mesh }] of this.characters) {
      mesh.visible = statusById.get(id) !== 'away';
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  }

  zoomBy(factor: number): void {
    this.camera.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.camera.zoom * factor));
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
      if (!el) continue;
      this.projected.copy(anchor).project(this.camera);
      const x = Math.round((this.projected.x * 0.5 + 0.5) * this.width);
      const y = Math.round((-this.projected.y * 0.5 + 0.5) * this.height);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      el.style.visibility = 'visible';
    }
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
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false).find((h) => h.object.visible);
    this.options.onSelect(hit ? (hit.object.userData.id as string) : null);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
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
