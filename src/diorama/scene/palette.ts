import { Color } from 'three';

/** 텍스처 없이 정점 색상만 쓰므로, 장면의 모든 색은 이 팔레트에서 나온다. */
const COLORS = {
  // 건물
  SLAB: 0xa9a39b,
  FLOOR: 0xd6d0c7,
  FLOOR_WOOD: 0xdcb98a,
  FLOOR_DARK: 0x8f9299,
  RUG: 0xe6dccb,
  RUG_LINE: 0xd3c5ae,
  WALL: 0xe2d9cc,
  WALL_TRIM: 0xf1ebe1,
  METAL: 0x3d4046,
  GLASS: 0xcfe6ee,
  WARM_LIGHT: 0xf8e2b0,
  // 가구
  WOOD: 0xd9a86a,
  WOOD_DARK: 0xb98850,
  WHITE: 0xf7f5f0,
  PANEL: 0xe4e4e2,
  BLACK: 0x1c1d21,
  SCREEN: 0x5b8fc9,
  KEY: 0x55585f,
  CHAIR: 0xb9bcc0,
  SAGE: 0x6f8667,
  SAGE_DARK: 0x566b50,
  SOFA: 0xece5d6,
  MUSTARD: 0xd9a441,
  STEEL: 0xb9bdc3,
  STEEL_DARK: 0x8b9097,
  RACK: 0x24272e,
  LED_GREEN: 0x57e08a,
  LED_BLUE: 0x5aa8ff,
  LED_AMBER: 0xffb648,
  POT: 0xf2efe8,
  LEAF: 0x4f9a4a,
  LEAF_DARK: 0x357a3a,
  LEAF_LIGHT: 0x79b85f,
  LAMP: 0xfbeab8,
  RED: 0xd9534a,
  BLUE: 0x4f7fd0,
  YELLOW: 0xf0b93a,
  TEAL: 0x2fa39a,
  // 캐릭터
  EYE: 0x1a1a1f,
  BLUSH: 0xf6a5a0,
  PINK: 0xf2a7b0,
  CREAM: 0xfbf2e0,
  FUR_WHITE: 0xf6f3ec,
  BEAVER: 0xc8713a,
  FOX: 0xee7b30,
  CAT: 0x9da3b0,
  BEAR: 0xa0603c,
  TAN: 0xe6bd8f,
  SHIBA: 0xe5a655,
  RACCOON: 0x8e8b94,
  MASK: 0x5a5560,
  KOALA: 0xaeb2ba,
  TIGER: 0xf2a033,
  STRIPE: 0x3d2c24,
  PIG: 0xf6b6bb,
  PIG_DARK: 0xea939e,
  FROG: 0x86c35a,
  FROG_DARK: 0x5e9a3f,
  CAPY: 0xb5824f,
  CAPY_DARK: 0x8a5f38,
  NAVY: 0x2f3a66,
  PURPLE: 0x8f6fd6,
  GRAY: 0x5d6470,
  CHARCOAL: 0x33363d,
  SKY: 0xa9c8ee,
  GREEN: 0x5fa86a,
  PANTS: 0x3f4658,
  BEIGE: 0xcdb48c,
  BROWN: 0x6b4a36,
} as const;

type ColorName = keyof typeof COLORS;
const NAMES = Object.keys(COLORS) as ColorName[];

/** 색 이름 → 팔레트 인덱스. 0은 빈 칸이라 1부터 시작한다. */
export const C = Object.fromEntries(NAMES.map((name, i) => [name, i + 1])) as Record<ColorName, number>;

/** 메셔가 쓰는 선형 RGB 팔레트 */
export function buildLinearPalette(): Float32Array {
  const out = new Float32Array((NAMES.length + 1) * 3);
  const color = new Color();
  NAMES.forEach((name, i) => {
    color.setHex(COLORS[name]); // sRGB → 선형 작업 색공간
    out.set([color.r, color.g, color.b], (i + 1) * 3);
  });
  return out;
}
