import { VoxelGrid } from '../voxel/VoxelGrid';
import { C } from './palette';

/**
 * 2등신 동물 직원 캐릭터 (자체 디자인).
 * 방보다 2배 촘촘한 격자로 만들고 0.5배로 줄여 배치한다. 서 있을 때 키는 책상의 약 1.7배.
 * 작게 보여도 읽히도록 형태는 단순하게: 큰 머리, 점 눈, 작은 주둥이, 단색 옷.
 * 정면은 +z 방향.
 */
export const ANIMAL_GRID = 20;
export const ANIMAL_HEIGHT = 32;
export const ANIMAL_SCALE = 0.5;
/** 앉은 자세에서 다리 아랫면까지의 높이(촘촘한 격자 기준) */
export const SIT_BASE = 2;

const G = ANIMAL_GRID;
const CX = G / 2;
const CZ = G / 2;
const HEAD_Y = 18;

type Ear = 'round' | 'small' | 'big' | 'pointed' | 'long' | 'none';
type Tail = 'flat' | 'bushy' | 'ringed' | 'short' | 'long' | 'curl' | 'none';
type Feature = 'teeth' | 'stripes' | 'patches' | 'mask' | 'bigNose' | 'frog' | 'capybara';

interface Species {
  fur: number;
  /** 주둥이·꼬리 끝 등 밝은 부분 */
  alt: number;
  ear: Ear;
  earColor?: number;
  earInner: number;
  tail: Tail;
  tailColor?: number;
  nose: number;
  feature?: Feature;
}

const SPECIES = {
  beaver: { fur: C.BEAVER, alt: C.TAN, ear: 'small', earInner: C.STRIPE, tail: 'flat', tailColor: C.STRIPE, nose: C.STRIPE, feature: 'teeth' },
  fox: { fur: C.FOX, alt: C.CREAM, ear: 'pointed', earInner: C.STRIPE, tail: 'bushy', nose: C.EYE },
  cat: { fur: C.CAT, alt: C.CREAM, ear: 'pointed', earInner: C.PINK, tail: 'long', nose: C.PINK },
  rabbit: { fur: C.FUR_WHITE, alt: C.FUR_WHITE, ear: 'long', earInner: C.PINK, tail: 'short', nose: C.PINK },
  bear: { fur: C.BEAR, alt: C.TAN, ear: 'round', earInner: C.TAN, tail: 'short', nose: C.EYE },
  panda: { fur: C.FUR_WHITE, alt: C.FUR_WHITE, ear: 'round', earColor: C.EYE, earInner: C.EYE, tail: 'short', nose: C.EYE, feature: 'patches' },
  shiba: { fur: C.SHIBA, alt: C.CREAM, ear: 'pointed', earInner: C.CREAM, tail: 'curl', nose: C.EYE },
  raccoon: { fur: C.RACCOON, alt: C.CREAM, ear: 'round', earInner: C.MASK, tail: 'ringed', nose: C.EYE, feature: 'mask' },
  koala: { fur: C.KOALA, alt: C.FUR_WHITE, ear: 'big', earInner: C.FUR_WHITE, tail: 'none', nose: C.EYE, feature: 'bigNose' },
  tiger: { fur: C.TIGER, alt: C.CREAM, ear: 'round', earInner: C.CREAM, tail: 'long', nose: C.PINK, feature: 'stripes' },
  frog: { fur: C.FROG, alt: C.FROG, ear: 'none', earInner: C.FROG, tail: 'none', nose: C.FROG_DARK, feature: 'frog' },
  capybara: { fur: C.CAPY, alt: C.CAPY, ear: 'small', earInner: C.CAPY_DARK, tail: 'none', nose: C.STRIPE, feature: 'capybara' },
} satisfies Record<string, Species>;

export type SpeciesName = keyof typeof SPECIES;

export interface Outfit {
  kind: 'suit' | 'hoodie' | 'shirt' | 'sweater' | 'vest';
  /** 겉옷 색 */
  top: number;
  /** 넥타이·줄무늬·사원증 줄 등 포인트 색 */
  accent: number;
  pants?: number;
}

export interface AnimalLook {
  species: SpeciesName;
  outfit: Outfit;
  hat?: { kind: 'cap' | 'beanie' | 'headphones'; color: number; accent?: number };
  /** 안경테 색 */
  glasses?: number;
}

export type Pose = 'desk' | 'sit' | 'stand';

export function buildAnimal(look: AnimalLook, pose: Pose): VoxelGrid {
  const g = new VoxelGrid(G, ANIMAL_HEIGHT, G);
  const sp: Species = SPECIES[look.species];
  const outfit = look.outfit;

  /** 좌우 대칭으로 상자를 두 개 놓는다 (왼쪽 기준 좌표). */
  const pair = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number) => {
    g.box(x0, y0, z0, x1, y1, z1, color);
    g.box(G - x1, y0, z0, G - x0, y1, z1, color);
  };
  /** (x, y) 열에서 가장 앞에 있는 복셀을 칠한다. mirror면 좌우 대칭으로 함께 칠한다. */
  const front = (x: number, y: number, color: number, mirror = false) => {
    for (const px of mirror ? [x, G - 1 - x] : [x]) {
      for (let z = G - 1; z >= 0; z--) {
        if (g.get(px, y, z)) {
          g.set(px, y, z, color);
          break;
        }
      }
    }
  };
  const recolor = (x0: number, y0: number, x1: number, y1: number, from: number, to: number) => {
    for (let y = y0; y < y1; y++)
      for (let z = 0; z < G; z++)
        for (let x = x0; x < x1; x++) if (g.get(x, y, z) === from) g.set(x, y, z, to);
  };

  // ── 꼬리 (몸통보다 먼저 그려 겹치는 부분은 몸통이 덮는다) ──
  const tailColor = sp.tailColor ?? sp.fur;
  switch (sp.tail) {
    case 'flat':
      g.ellipsoid(CX, 3.5, 4, 2.6, 1, 3.2, tailColor);
      break;
    case 'bushy':
    case 'ringed':
      g.ellipsoid(CX, 7, 4, 2.2, 4, 2.2, tailColor);
      if (sp.tail === 'bushy') recolor(0, 9, G, 12, tailColor, sp.alt);
      else for (const y of [4, 5, 8, 9]) recolor(0, y, G, y + 1, tailColor, C.MASK);
      break;
    case 'short':
      g.ellipsoid(CX, 5, 5.8, 1.5, 1.5, 1.5, sp.alt);
      break;
    case 'long':
      g.box(9, 3, 3, 11, 5, 7, tailColor);
      g.box(9, 5, 2, 11, 10, 4, tailColor);
      break;
    case 'curl':
      g.ellipsoid(CX, 8, 5.6, 2, 2, 1.8, sp.alt);
      break;
    case 'none':
      break;
  }

  // ── 다리와 운동화 ──
  const pants = outfit.pants ?? C.PANTS;
  if (pose === 'stand') {
    pair(6, 2, 8, 9, 4, 11, pants);
    pair(6, 0, 8, 9, 2, 13, C.WHITE);
  } else {
    pair(6, SIT_BASE, 10, 9, 4, 16, pants);
    pair(6, SIT_BASE, 16, 9, 5, 18, C.WHITE);
  }

  // ── 몸통과 팔 ──
  g.ellipsoid(CX, 8, CZ, 4.6, 4.6, 3.6, outfit.top, (_x, y) => y >= 4);
  for (const side of [-1, 1]) {
    if (pose === 'desk') {
      // 책상 위로 뻗은 팔
      g.ellipsoid(CX + side * 4.8, 9, CZ + 2.6, 1.5, 1.5, 3.4, outfit.top);
      g.ellipsoid(CX + side * 4.6, 8.8, CZ + 6.2, 1.4, 1.3, 1.4, sp.fur);
    } else {
      g.ellipsoid(CX + side * 5.2, 8.5, CZ + 0.3, 1.5, 3, 1.6, outfit.top);
      g.ellipsoid(CX + side * 5.4, 5.4, CZ + 0.6, 1.3, 1.3, 1.3, sp.fur);
    }
  }

  // ── 옷 디테일 (앞면에 칠한다) ──
  switch (outfit.kind) {
    case 'suit':
      for (const y of [10, 11]) for (let x = 8; x <= 11; x++) front(x, y, C.WHITE);
      for (let y = 7; y <= 11; y++) front(9, y, outfit.accent, true);
      front(10, 5, C.EYE);
      break;
    case 'hoodie':
      g.ellipsoid(CX, 12.5, 7.5, 4.2, 2, 2, outfit.top);
      for (const y of [9, 10]) front(8, y, C.WHITE, true);
      for (const y of [5, 6]) for (let x = 8; x <= 11; x++) front(x, y, outfit.accent);
      break;
    case 'shirt':
      for (let x = 8; x <= 11; x++) front(x, 11, C.WHITE);
      front(8, 10, outfit.accent, true); // 사원증 줄
      front(8, 9, outfit.accent, true);
      front(9, 8, outfit.accent, true);
      for (const y of [6, 7]) front(9, y, C.WHITE, true);
      break;
    case 'sweater':
      for (const y of [6, 9]) recolor(0, y, G, y + 1, outfit.top, outfit.accent);
      break;
    case 'vest':
      for (let y = 5; y <= 11; y++) for (let x = 8; x <= 11; x++) front(x, y, C.WHITE);
      for (const y of [6, 8, 10]) front(10, y, outfit.accent);
      break;
  }

  // ── 머리: 큰 머리통 + 아래로 퍼진 볼 ──
  g.ellipsoid(CX, HEAD_Y, CZ, 7.2, 6, 6.4, sp.fur);
  g.ellipsoid(CX, 16, CZ + 1, 7.5, 3.8, 5.8, sp.fur);

  // 귀
  const earColor = sp.earColor ?? sp.fur;
  switch (sp.ear) {
    case 'round':
    case 'small':
    case 'big': {
      const r = sp.ear === 'big' ? 3.3 : sp.ear === 'small' ? 1.7 : 2.3;
      const off = sp.ear === 'big' ? 6.6 : 5.2;
      const y = sp.ear === 'big' ? 22.4 : 23.6;
      for (const side of [-1, 1]) {
        g.ellipsoid(CX + side * off, y, CZ - 0.5, r, r, 1.4, earColor);
        if (r > 2) g.ellipsoid(CX + side * off, y, CZ + 0.6, r - 1.2, r - 1.2, 0.8, sp.earInner);
      }
      break;
    }
    case 'pointed': {
      const rows = [[3, 8], [3, 8], [4, 7], [4, 7], [5, 6]];
      rows.forEach(([x0, x1], i) => {
        pair(x0, 22 + i, 8, x1, 23 + i, 11, earColor);
        if (i >= 1 && i <= 2) pair(x0 + 1, 22 + i, 10, x1 - 1, 23 + i, 11, sp.earInner);
      });
      break;
    }
    case 'long':
      pair(4, 22, 8, 7, 29, 11, earColor);
      pair(5, 29, 8, 6, 30, 11, earColor);
      pair(5, 23, 10, 6, 28, 11, sp.earInner);
      break;
    case 'none':
      break;
  }

  // 얼굴 무늬는 눈보다 먼저
  if (sp.feature === 'stripes') {
    recolor(9, 22, 11, 25, sp.fur, C.STRIPE);
    for (const [x0, x1] of [[6, 7], [13, 14]]) recolor(x0, 23, x1, 25, sp.fur, C.STRIPE);
    for (const [x0, x1] of [[2, 4], [16, 18]]) recolor(x0, 18, x1, 19, sp.fur, C.STRIPE);
  }
  if (sp.feature === 'mask') {
    for (let y = 14; y <= 18; y++) for (let x = 3; x <= 6; x++) front(x, y, C.MASK, true);
  }
  if (sp.feature === 'patches') {
    for (let y = 14; y <= 18; y++) for (let x = 3; x <= 6; x++) front(x, y, C.EYE, true);
  }

  if (sp.feature === 'frog') {
    // 머리 위로 솟은 눈, 넓은 입
    for (const side of [-1, 1]) g.ellipsoid(CX + side * 3.8, 23.2, CZ + 1.5, 2.6, 2.4, 2.4, sp.fur);
    for (const y of [22, 23]) for (const x of [5, 6]) front(x, y, C.EYE, true);
    front(5, 23, C.WHITE);
    front(13, 23, C.WHITE);
    for (let x = 6; x <= 9; x++) front(x, 15, C.FROG_DARK, true);
    front(5, 16, C.FROG_DARK, true);
  } else {
    // 주둥이, 코, 입. 눈과 코를 얼굴 아래쪽에 모아 이마를 넓게 남긴다
    if (sp.feature === 'capybara') {
      g.ellipsoid(CX, 14.6, CZ + 5.2, 3.4, 2.6, 2.2, sp.fur);
      g.box(9, 15, 17, 11, 17, 18, sp.nose);
    } else {
      g.ellipsoid(CX, 14.6, CZ + 5.4, 2.7, 1.9, 1.7, sp.alt);
      if (sp.feature === 'bigNose') g.box(9, 14, 17, 11, 17, 18, sp.nose);
      else g.box(9, 15, 17, 11, 16, 18, sp.nose);
      front(9, 13, sp.feature === 'teeth' ? C.WHITE : C.STRIPE, true);
    }

    if (look.glasses) {
      // 안경: 어두운 테 안에 밝은 렌즈, 그 안에 작은 눈동자
      for (let x = 3; x <= 6; x++) {
        front(x, 14, look.glasses, true);
        front(x, 18, look.glasses, true);
      }
      for (let y = 15; y <= 17; y++) {
        front(3, y, look.glasses, true);
        front(6, y, look.glasses, true);
        for (const x of [4, 5]) front(x, y, C.CREAM, true);
      }
      for (const x of [7, 8, 9]) front(x, 16, look.glasses, true);
      for (const y of [15, 16]) front(5, y, C.EYE, true);
    } else {
      // 점 눈 (2×3) + 하이라이트
      const eyeTop = sp.feature === 'capybara' ? 16 : 17;
      for (let y = 15; y <= eyeTop; y++) for (const x of [4, 5]) front(x, y, C.EYE, true);
      front(4, eyeTop, C.WHITE);
      front(14, eyeTop, C.WHITE);
    }
  }
  if (!look.glasses) front(4, 14, C.BLUSH, true);

  // ── 모자·헤드폰 ──
  const hat = look.hat;
  if (hat) {
    const accent = hat.accent ?? C.EYE;
    switch (hat.kind) {
      case 'cap':
        g.ellipsoid(CX, HEAD_Y, CZ, 7.8, 6.7, 7, hat.color, (_x, y) => y >= 22);
        g.box(6, 22, 16, 14, 23, 20, hat.color);
        break;
      case 'beanie':
        g.ellipsoid(CX, HEAD_Y, CZ, 7.8, 6.7, 7, hat.color, (_x, y) => y >= 21);
        recolor(0, 21, G, 22, hat.color, accent);
        g.ellipsoid(CX, 25.5, CZ, 1.6, 1.6, 1.6, C.WHITE);
        break;
      case 'headphones':
        g.ellipsoid(CX, HEAD_Y, CZ, 8, 6.9, 1.1, hat.color, (_x, y) => y >= 19);
        pair(1, 15, 8, 3, 20, 13, hat.color);
        pair(0, 16, 9, 1, 19, 12, accent);
        break;
    }
  }

  return g;
}

/** 가장 높은 복셀의 윗면 높이 (이름표 위치 계산용) */
export function gridTop(g: VoxelGrid): number {
  for (let y = g.sy - 1; y >= 0; y--)
    for (let z = 0; z < g.sz; z++) for (let x = 0; x < g.sx; x++) if (g.get(x, y, z)) return y + 1;
  return 0;
}

export const ANIMAL_LOOKS: AnimalLook[] = [
  { species: 'beaver', outfit: { kind: 'hoodie', top: C.NAVY, accent: C.GRAY }, hat: { kind: 'cap', color: C.YELLOW } },
  { species: 'fox', outfit: { kind: 'sweater', top: C.GREEN, accent: C.CREAM } },
  { species: 'cat', outfit: { kind: 'shirt', top: C.SKY, accent: C.RED }, glasses: C.CHARCOAL },
  { species: 'rabbit', outfit: { kind: 'hoodie', top: C.PURPLE, accent: C.NAVY } },
  { species: 'bear', outfit: { kind: 'vest', top: C.NAVY, accent: C.YELLOW } },
  { species: 'panda', outfit: { kind: 'hoodie', top: C.RED, accent: C.STRIPE }, hat: { kind: 'headphones', color: C.CHARCOAL, accent: C.TEAL } },
  { species: 'shiba', outfit: { kind: 'suit', top: C.NAVY, accent: C.RED } },
  { species: 'raccoon', outfit: { kind: 'sweater', top: C.TEAL, accent: C.CREAM }, hat: { kind: 'beanie', color: C.YELLOW, accent: C.CREAM } },
  { species: 'koala', outfit: { kind: 'shirt', top: C.WHITE, accent: C.TEAL, pants: C.BEIGE } },
  { species: 'tiger', outfit: { kind: 'suit', top: C.GRAY, accent: C.YELLOW } },
  { species: 'frog', outfit: { kind: 'sweater', top: C.MUSTARD, accent: C.CREAM, pants: C.BROWN } },
  { species: 'capybara', outfit: { kind: 'hoodie', top: C.GREEN, accent: C.LEAF_DARK }, glasses: C.CHARCOAL },
];
