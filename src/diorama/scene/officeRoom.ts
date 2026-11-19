import { VoxelGrid } from '../voxel/VoxelGrid';
import { C } from './palette';

export const ROOM = { W: 200, H: 28, D: 150 } as const;
const F = 2;
/** 바닥 윗면 높이 (엔진에서 강조 메시 위치에 쓴다) */
export const FLOOR_TOP = F;
const WALL_H = 20;
const GLASS_H = 15;
export const GLASS_HEIGHT = GLASS_H;

export interface Seat {
  /** 캐릭터 발밑(앉은 자리면 좌판 윗면) 중심의 격자 좌표 */
  x: number;
  y: number;
  z: number;
  /** desk: 책상 앞에 앉아 팔을 올린 자세, sit: 그냥 앉은 자세, stand: 선 자세 */
  pose: 'desk' | 'sit' | 'stand';
  /** 바라보는 방향 (y축 회전, 라디안). 0이면 +z(화면 왼쪽 아래)를 본다 */
  facing: number;
}

type Dir = 's' | 'e' | 'n' | 'w';
const FACING: Record<Dir, number> = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };
/** 서 있는 캐릭터는 열린 모서리(기본 카메라) 쪽을 본다 */
const TO_CAMERA = Math.PI / 4;

export interface OfficeRoom {
  grid: VoxelGrid;
  /** 반투명으로 따로 그리는 유리 칸막이 */
  glass: VoxelGrid;
  seats: Seat[];
}

/** 회의실 바닥 영역(격자 좌표, x1·z1은 포함하지 않음). 하이라이트·클릭·라벨 위치에 쓴다. */
export interface RoomZone {
  id: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export const MEETING_ROOM_ZONES: readonly RoomZone[] = [
  { id: 'room-a', x0: 136, z0: 3, x1: 177, z1: 60 },
  { id: 'room-b', x0: 178, z0: 3, x1: 200, z1: 60 },
  { id: 'room-c', x0: 148, z0: 85, x1: 169, z1: 106 },
];

/**
 * 자율 좌석: 업무 공간에서 주인이 없는 책상 4곳 (buildOfficeRoom의 빈 workstation과 맞춘다).
 * 회의실처럼 강조·클릭·이름표에 쓴다. 높이는 책상 높이 정도로 낮게.
 */
export const HOT_DESK_ZONES: readonly (RoomZone & { height: number })[] = [
  { id: 'desk-1', x0: 80, z0: 64, x1: 97, z1: 82, height: 12 }, // (88,68) 남향, 노트북
  { id: 'desk-2', x0: 64, z0: 81, x1: 81, z1: 99, height: 12 }, // (72,94) 북향, 모니터
  { id: 'desk-3', x0: 124, z0: 80, x1: 144, z1: 97, height: 12 }, // (138,88) 서향, 듀얼 모니터
  { id: 'desk-4', x0: 138, z0: 122, x1: 155, z1: 141, height: 12 }, // (146,136) 북향, 노트북
];

/** 항상 같은 배치가 나오도록 고정 시드 난수를 쓴다. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 구역이 나뉜 사무실 한 층을 코드로 쌓는다: 라운지, 탕비실, 회의실, 서버실, 업무 공간, 안내 데스크.
 * 뒤(z=0)와 왼쪽(x=0)에만 벽이 있고 카메라 쪽 두 면은 열려 있다.
 * PoC용 절차적 생성이며, 추후 MagicaVoxel(.vox) 에셋을 같은 VoxelGrid로 읽어 대체할 수 있다.
 */
export function buildOfficeRoom(): OfficeRoom {
  const { W, H, D } = ROOM;
  const g = new VoxelGrid(W, H, D);
  const glass = new VoxelGrid(W, H, D);
  const rand = seeded(7);

  // ── 바닥과 벽 ──
  g.box(0, 0, 0, W, 1, D, C.SLAB);
  g.box(0, 1, 0, W, F, D, C.FLOOR);
  const floor = (x0: number, z0: number, x1: number, z1: number, color: number) => g.box(x0, 1, z0, x1, F, z1, color);
  g.box(0, 0, 0, W, F + WALL_H, 2, C.WALL);
  g.box(0, 0, 0, 2, F + WALL_H, D, C.WALL);
  g.box(0, F + WALL_H, 0, W, F + WALL_H + 1, 2, C.WALL_TRIM);
  g.box(0, F + WALL_H, 0, 2, F + WALL_H + 1, D, C.WALL_TRIM);

  // ── 공용 소품 ──
  const plant = (x: number, z: number, big = true) => {
    if (big) {
      g.box(x - 2, F, z - 2, x + 2, F + 4, z + 2, C.POT);
      g.ellipsoid(x, F + 10, z, 4.2, 5.5, 4.2, C.LEAF);
      g.ellipsoid(x - 1.5, F + 12, z + 1, 2, 2.5, 2, C.LEAF_DARK);
      g.ellipsoid(x + 2, F + 8, z - 1.5, 2, 2, 2, C.LEAF_LIGHT);
      g.ellipsoid(x + 1, F + 14, z + 1.5, 1.6, 2, 1.6, C.LEAF_LIGHT);
    } else {
      g.box(x - 1, F, z - 1, x + 1, F + 2, z + 1, C.POT);
      g.ellipsoid(x, F + 4.5, z, 2.2, 2.6, 2.2, C.LEAF);
      g.ellipsoid(x + 0.8, F + 5.5, z + 0.8, 1.2, 1.4, 1.2, C.LEAF_LIGHT);
    }
  };
  /** 책상·선반 위에 올리는 한 칸짜리 화분 */
  const sprout = (x: number, y: number, z: number) => {
    g.set(x, y, z, C.POT);
    g.set(x, y + 1, z, C.LEAF);
  };
  const lamp = (x: number, z: number) => {
    g.box(x - 1, F, z - 1, x + 2, F + 1, z + 2, C.METAL);
    g.box(x, F + 1, z, x + 1, F + 13, z + 1, C.METAL);
    g.box(x - 2, F + 13, z - 2, x + 3, F + 17, z + 3, C.LAMP);
  };
  /** 유리 칸막이: 유리는 별도 격자에, 기둥과 윗 레일은 본 격자에 넣는다. */
  const glassWall = (x0: number, z0: number, x1: number, z1: number, height = GLASS_H) => {
    const alongX = z0 === z1;
    const len = alongX ? x1 - x0 : z1 - z0;
    for (let t = 0; t < len; t++) {
      const x = alongX ? x0 + t : x0;
      const z = alongX ? z0 : z0 + t;
      const post = t === 0 || t === len - 1 || t % 22 === 0;
      if (post) g.box(x, F, z, x + 1, F + height, z + 1, C.METAL);
      else glass.box(x, F, z, x + 1, F + height - 1, z + 1, C.GLASS);
      g.set(x, F + height - 1, z, C.METAL);
    }
  };
  /** 식탁·회의용 의자. dir은 등받이가 있는 쪽. */
  const sideChair = (cx: number, cz: number, dir: 'n' | 's' | 'w' | 'e') => {
    for (const [dx, dz] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) g.box(cx + dx, F, cz + dz, cx + dx + 1, F + 3, cz + dz + 1, C.WOOD_DARK);
    g.box(cx - 2, F + 3, cz - 2, cx + 2, F + 4, cz + 2, C.SAGE);
    if (dir === 'n') g.box(cx - 2, F + 4, cz - 2, cx + 2, F + 9, cz - 1, C.SAGE_DARK);
    if (dir === 's') g.box(cx - 2, F + 4, cz + 1, cx + 2, F + 9, cz + 2, C.SAGE_DARK);
    if (dir === 'w') g.box(cx - 2, F + 4, cz - 2, cx - 1, F + 9, cz + 2, C.SAGE_DARK);
    if (dir === 'e') g.box(cx + 1, F + 4, cz - 2, cx + 2, F + 9, cz + 2, C.SAGE_DARK);
  };

  // ── 라운지 (왼쪽 뒤) ──
  floor(2, 2, 132, 54, C.FLOOR_WOOD);
  floor(14, 15, 60, 42, C.RUG);
  floor(16, 17, 58, 40, C.RUG_LINE);
  floor(17, 18, 57, 39, C.RUG);
  // 소파
  g.box(20, F, 3, 50, F + 9, 6, C.SOFA);
  g.box(20, F, 6, 50, F + 4, 13, C.SOFA);
  g.box(20, F, 3, 23, F + 7, 13, C.SOFA);
  g.box(47, F, 3, 50, F + 7, 13, C.SOFA);
  g.box(24, F + 4, 6, 28, F + 8, 8, C.MUSTARD);
  g.box(42, F + 4, 6, 46, F + 8, 8, C.SAGE);
  // 타원 탁자
  g.ellipsoid(36, F + 3.5, 26, 9, 0.5, 4.5, C.WOOD);
  for (const [x, z] of [[30, 24], [41, 24], [30, 27], [41, 27]]) g.box(x, F, z, x + 1, F + 3, z + 1, C.WOOD_DARK);
  g.box(33, F + 4, 25, 36, F + 5, 27, C.WHITE);
  sprout(39, F + 4, 26);
  lamp(15, 7);
  // 액자
  for (const [x, a, b] of [[26, C.SAGE, C.MUSTARD], [38, C.MUSTARD, C.TEAL]] as const) {
    g.box(x, F + 11, 2, x + 8, F + 18, 3, C.WOOD_DARK);
    g.box(x + 1, F + 12, 2, x + 7, F + 17, 3, C.CREAM);
    g.box(x + 2, F + 12, 2, x + 5, F + 15, 3, a);
    g.box(x + 4, F + 14, 2, x + 7, F + 17, 3, b);
  }
  // 책장 (왼쪽 벽)
  g.box(2, F, 14, 7, F + 16, 50, C.WOOD);
  const bookColors = [C.RED, C.BLUE, C.YELLOW, C.TEAL, C.CREAM, C.SAGE, C.PURPLE];
  for (const shelfY of [F + 1, F + 6, F + 11]) {
    g.box(3, shelfY, 15, 7, shelfY + 4, 49, 0);
    g.box(3, shelfY, 15, 4, shelfY + 4, 49, C.WOOD_DARK);
    for (let z = 15; z < 49; z++) {
      if ((z - 15) % 12 === 11) g.box(4, shelfY, z, 7, shelfY + 4, z + 1, C.WOOD);
      else if (rand() > 0.25) {
        g.box(4, shelfY, z, 6, shelfY + 2 + Math.floor(rand() * 2), z + 1, bookColors[Math.floor(rand() * bookColors.length)]);
      }
    }
  }
  // 1인 소파
  for (const z0 of [22, 36]) {
    g.box(11, F, z0, 20, F + 4, z0 + 9, C.SAGE);
    g.box(11, F, z0, 13, F + 9, z0 + 9, C.SAGE_DARK);
    g.box(11, F, z0, 20, F + 6, z0 + 2, C.SAGE_DARK);
    g.box(11, F, z0 + 7, 20, F + 6, z0 + 9, C.SAGE_DARK);
  }
  plant(11, 8);
  plant(62, 7);
  plant(10, 50, false);
  glassWall(2, 55, 50, 55, 9);
  glassWall(68, 2, 68, 38);

  // ── 탕비실 (가운데 뒤) ──
  g.box(72, F, 3, 81, F + 18, 12, C.STEEL);
  g.box(72, F + 10, 11, 81, F + 11, 12, C.STEEL_DARK);
  g.box(79, F + 5, 11, 80, F + 9, 12, C.STEEL_DARK);
  g.box(79, F + 12, 11, 80, F + 16, 12, C.STEEL_DARK);
  g.box(82, F, 3, 126, F + 7, 10, C.SAGE);
  for (let x = 92; x < 126; x += 11) g.box(x, F, 9, x + 1, F + 7, 10, C.SAGE_DARK);
  g.box(82, F + 7, 3, 127, F + 8, 11, C.WOOD);
  g.box(100, F + 7, 5, 108, F + 8, 9, C.STEEL_DARK); // 개수대
  g.box(103, F + 8, 4, 104, F + 11, 5, C.METAL);
  g.box(103, F + 10, 5, 104, F + 11, 7, C.METAL);
  g.box(85, F + 8, 4, 90, F + 13, 8, C.BLACK); // 커피 머신
  g.set(89, F + 11, 7, C.RED);
  g.box(86, F + 8, 7, 89, F + 9, 8, C.STEEL);
  g.box(92, F + 8, 5, 94, F + 10, 7, C.WHITE);
  g.box(88, F + 14, 2, 126, F + 15, 5, C.WOOD); // 벽 선반
  for (let x = 92; x < 112; x += 4) g.set(x, F + 15, 3, C.WHITE);
  sprout(116, F + 15, 3);
  sprout(121, F + 15, 3);
  for (const [cx, cz] of [[90, 32], [114, 40]]) {
    g.ellipsoid(cx, F + 6.5, cz, 6.5, 0.5, 6.5, C.WOOD);
    g.box(cx - 1, F, cz - 1, cx + 1, F + 6, cz + 1, C.METAL);
    sprout(cx, F + 7, cz);
    sideChair(cx, cz - 9, 'n');
    sideChair(cx, cz + 9, 's');
    sideChair(cx - 9, cz, 'w');
    sideChair(cx + 9, cz, 'e');
  }
  plant(129, 8);

  // ── 회의실 A·B (오른쪽 뒤) ── 영역은 MEETING_ROOM_ZONES와 맞춘다
  glassWall(135, 2, 135, 40);
  glassWall(135, 52, 135, 60);
  glassWall(135, 60, 199, 60);
  glassWall(177, 2, 177, 40); // A·B 사이 칸막이 (z 40~52는 출입구)
  glassWall(177, 52, 177, 60);
  // A: 6인 회의실
  floor(140, 12, 173, 50, C.RUG);
  g.box(141, F + 8, 2, 171, F + 19, 3, C.METAL); // 화이트보드
  g.box(142, F + 9, 2, 170, F + 18, 3, C.WHITE);
  g.box(146, F + 13, 2, 156, F + 14, 3, C.BLUE);
  g.box(146, F + 11, 2, 162, F + 12, 3, C.RED);
  g.box(145, F + 6, 24, 169, F + 7, 38, C.WOOD);
  for (const [x, z] of [[147, 26], [166, 26], [147, 35], [166, 35]]) g.box(x, F, z, x + 1, F + 6, z + 1, C.METAL);
  for (const cx of [148, 157, 166]) {
    sideChair(cx, 20, 'n');
    sideChair(cx, 42, 's');
  }
  sprout(156, F + 7, 31);
  plant(140, 7);
  // B: 4인 회의실 (화면 공유용 TV)
  floor(180, 12, 197, 50, C.RUG);
  g.box(181, F + 9, 2, 196, F + 18, 3, C.BLACK);
  g.box(182, F + 10, 2, 195, F + 17, 3, C.SCREEN);
  g.box(184, F + 6, 22, 193, F + 7, 40, C.WOOD);
  for (const [x, z] of [[185, 24], [191, 24], [185, 37], [191, 37]]) g.box(x, F, z, x + 1, F + 6, z + 1, C.METAL);
  sideChair(181, 26, 'w');
  sideChair(181, 36, 'w');
  sideChair(196, 26, 'e');
  sideChair(196, 36, 'e');
  plant(194, 54);

  // ── 회의실 C: 4인 포커스룸 (오른쪽 가운데, 서버실 옆) ──
  floor(148, 85, 169, 106, C.RUG);
  glassWall(147, 84, 169, 84);
  glassWall(147, 84, 147, 91);
  glassWall(147, 99, 147, 107); // z 91~99는 출입구
  glassWall(147, 106, 170, 106);
  g.ellipsoid(158, F + 6.5, 95, 4.5, 0.5, 4.5, C.WOOD);
  g.box(157, F, 94, 159, F + 6, 96, C.METAL);
  sprout(158, F + 7, 95);
  sideChair(158, 88, 'n');
  sideChair(158, 102, 's');
  sideChair(151, 95, 'w');
  sideChair(165, 95, 'e');

  // ── 서버실 (오른쪽 앞) ──
  floor(170, 86, 199, 126, C.FLOOR_DARK);
  glassWall(169, 85, 199, 85);
  glassWall(169, 85, 169, 104);
  glassWall(169, 114, 169, 127);
  glassWall(169, 126, 199, 126);
  const leds = [C.LED_GREEN, C.LED_GREEN, C.LED_BLUE, C.LED_AMBER];
  for (let i = 0; i < 3; i++) {
    const x0 = 173 + i * 8;
    g.box(x0, F, 87, x0 + 7, F + 18, 94, C.RACK);
    for (let y = F + 2; y < F + 17; y += 2)
      for (let k = 0; k < 2; k++) g.set(x0 + 1 + Math.floor(rand() * 5), y, 93, leds[Math.floor(rand() * leds.length)]);
  }
  plant(194, 132);

  // ── 업무 공간 (가운데) ──
  // 자리는 "앉는 사람" 기준 좌표로 짓는다: 원점에 앉아 +z를 보고, 책상은 그 앞(z 5~13)에 있다.
  // place()가 이 좌표를 방향에 맞춰 돌려 놓으므로, 의자·책상·캐릭터의 방향이 항상 일치한다.
  type LocalBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) => void;
  const place = (ox: number, oz: number, dir: Dir): LocalBox => (x0, y0, z0, x1, y1, z1, c) => {
    if (dir === 's') g.box(ox + x0, y0, oz + z0, ox + x1, y1, oz + z1, c);
    if (dir === 'n') g.box(ox - x1, y0, oz - z1, ox - x0, y1, oz - z0, c);
    if (dir === 'e') g.box(ox + z0, y0, oz - x1, ox + z1, y1, oz - x0, c);
    if (dir === 'w') g.box(ox - z1, y0, oz + x0, ox - z0, y1, oz + x1, c);
  };
  const swivelChair = (b: LocalBox) => {
    b(-3, F, -1, 3, F + 1, 1, C.METAL);
    b(-1, F, -3, 1, F + 1, 3, C.METAL);
    b(-1, F + 1, -1, 1, F + 3, 1, C.METAL);
    b(-3, F + 3, -3, 3, F + 4, 3, C.CHAIR);
    b(-3, F + 4, -4, 3, F + 9, -3, C.CHAIR); // 등받이는 책상 반대쪽
  };
  type DeskKind = 'monitor' | 'dual' | 'laptop';
  const workstation = (ox: number, oz: number, dir: Dir, kind: DeskKind, top: number = C.WOOD): Seat => {
    const b = place(ox, oz, dir);
    b(-8, F + 6, 5, 8, F + 7, 13, top);
    b(-8, F, 5, -7, F + 6, 13, C.WHITE);
    b(7, F, 5, 8, F + 6, 13, C.WHITE);
    const screen = (x0: number, x1: number) => {
      b((x0 + x1) / 2 - 1, F + 7, 10, (x0 + x1) / 2 + 1, F + 8, 12, C.BLACK);
      b(x0, F + 8, 10, x1, F + 13, 12, C.BLACK);
      b(x0 + 1, F + 9, 10, x1 - 1, F + 12, 11, C.SCREEN); // 화면은 앉은 사람 쪽
    };
    if (kind === 'monitor') {
      screen(-4, 4);
      b(-3, F + 7, 6, 3, F + 8, 8, C.KEY);
      b(-7, F + 7, 12, 7, F + 9, 13, C.PANEL);
    } else if (kind === 'dual') {
      screen(-7, -1);
      screen(1, 7);
      b(-3, F + 7, 6, 3, F + 8, 8, C.KEY);
    } else {
      // 노트북: 낮아서 마주 앉은 얼굴을 가리지 않는다
      b(-3, F + 7, 7, 3, F + 8, 10, C.STEEL);
      b(-3, F + 8, 10, 3, F + 11, 11, C.STEEL_DARK);
      b(-2, F + 8, 10, 2, F + 10, 11, C.SCREEN);
      b(5, F + 7, 7, 6, F + 9, 8, C.RED); // 머그
    }
    b(6, F + 7, 11, 7, F + 8, 12, C.POT);
    b(6, F + 8, 11, 7, F + 9, 12, C.LEAF);
    swivelChair(b);
    return { x: ox, y: F + 4, z: oz, pose: 'desk', facing: FACING[dir] };
  };
  /** 서서 일하는 높은 책상 */
  const standingDesk = (ox: number, oz: number, dir: Dir): Seat => {
    const b = place(ox, oz, dir);
    b(-8, F + 10, 5, 8, F + 11, 12, C.WHITE);
    b(-7, F, 8, -6, F + 10, 9, C.METAL);
    b(6, F, 8, 7, F + 10, 9, C.METAL);
    b(-7, F, 6, -6, F + 1, 11, C.METAL);
    b(6, F, 6, 7, F + 1, 11, C.METAL);
    b(-1, F + 11, 9, 1, F + 12, 11, C.BLACK);
    b(-4, F + 12, 9, 4, F + 17, 11, C.BLACK);
    b(-3, F + 13, 9, 3, F + 16, 10, C.SCREEN);
    b(-3, F + 11, 6, 3, F + 12, 8, C.KEY);
    return { x: ox, y: F, z: oz, pose: 'stand', facing: FACING[dir] };
  };

  // 마주 보는 4인 벤치: 북쪽 줄은 노트북(얼굴이 보인다), 남쪽 줄은 모니터
  const benchN1 = workstation(72, 68, 's', 'laptop');
  workstation(88, 68, 's', 'laptop');
  workstation(72, 94, 'n', 'monitor');
  const benchS2 = workstation(88, 94, 'n', 'dual');
  // 옆으로 마주 보는 4인 벤치
  const sideW1 = workstation(112, 72, 'e', 'laptop', C.WHITE);
  const sideW2 = workstation(112, 88, 'e', 'laptop', C.WHITE);
  const sideE1 = workstation(138, 72, 'w', 'monitor', C.WHITE);
  workstation(138, 88, 'w', 'dual', C.WHITE);
  // 서서 일하는 자리
  const standing = standingDesk(64, 124, 'e');
  // 원형 협업 테이블
  g.ellipsoid(100, F + 6.5, 128, 8, 0.5, 8, C.WOOD);
  g.box(99, F, 127, 101, F + 6, 129, C.METAL);
  g.box(97, F, 125, 103, F + 1, 131, C.METAL);
  g.box(98, F + 7, 126, 102, F + 8, 129, C.STEEL); // 노트북
  sprout(103, F + 7, 131);
  sideChair(89, 128, 'w');
  sideChair(111, 128, 'e');
  sideChair(100, 117, 'n');
  sideChair(100, 139, 's');
  const roundW: Seat = { x: 89, y: F + 4, z: 128, pose: 'desk', facing: FACING.e };
  // 벽 없이 나란한 2인 자리
  const pairL = workstation(128, 136, 'n', 'monitor');
  workstation(146, 136, 'n', 'laptop');
  floor(84, 112, 116, 144, C.RUG);

  // ── 안내 데스크와 출입문 (왼쪽 앞) ──
  g.box(14, F, 124, 46, F + 8, 131, C.WOOD);
  g.box(15, F, 130, 45, F + 7, 131, C.WHITE);
  g.box(14, F + 8, 123, 46, F + 9, 131, C.WOOD_DARK);
  sprout(18, F + 9, 127);
  g.box(0, F, 92, 3, F + 17, 110, C.WOOD);
  g.box(0, F, 94, 3, F + 15, 108, C.WARM_LIGHT);
  floor(3, 94, 14, 108, C.FLOOR_WOOD);
  plant(8, 88);
  plant(8, 114);
  plant(52, 128);
  plant(56, 60, false);
  plant(160, 140);

  // 좌석 배정 순서: 업무 공간 8곳(나머지는 빈자리), 탕비실, 라운지 소파, 회의실, 서버실
  const seats: Seat[] = [
    benchN1,
    benchS2,
    sideW1,
    sideW2,
    sideE1,
    standing,
    roundW,
    pairL,
    { x: 88, y: F, z: 17, pose: 'stand', facing: TO_CAMERA },
    { x: 35, y: F + 4, z: 10, pose: 'sit', facing: FACING.s },
    { x: 157, y: F + 4, z: 20, pose: 'desk', facing: FACING.s },
    { x: 184, y: F, z: 106, pose: 'stand', facing: TO_CAMERA },
  ];

  return { grid: g, glass, seats };
}
