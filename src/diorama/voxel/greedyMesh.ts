import type { VoxelGrid } from './VoxelGrid';

export interface MeshData {
  /** 격자 좌표(0~255) 그대로의 정점 위치 */
  positions: Uint8Array;
  /** ±127로 정규화된 법선 */
  normals: Int8Array;
  /** AO가 미리 곱해진 선형 RGB (0~255 정규화) */
  colors: Uint8Array;
  indices: Uint16Array | Uint32Array;
  quadCount: number;
}

/** 모서리 가림 정도(0=가장 어두움 ~ 3=가림 없음)에 곱하는 밝기 */
export const AO_FULL: readonly number[] = [0.42, 0.62, 0.82, 1];
/** 작은 캐릭터용: 음영이 지저분해 보이지 않도록 약하게 */
export const AO_SOFT: readonly number[] = [0.8, 0.88, 0.95, 1];

const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/**
 * 보이는 면만 추출해 같은 색·같은 AO의 인접 면을 큰 사각형으로 합친다.
 * three.js에 의존하지 않으므로 Web Worker나 빌드 스크립트에서도 그대로 쓸 수 있다.
 *
 * @param palette 인덱스당 선형 RGB 3개 (palette[i*3..i*3+2]), 인덱스 0은 미사용
 * @param aoLevels 가림 단계별 밝기. null이면 AO를 계산하지 않는다 (유리 등)
 */
export function greedyMesh(
  grid: VoxelGrid,
  palette: Float32Array,
  aoLevels: readonly number[] | null = AO_FULL,
): MeshData {
  const dims = [grid.sx, grid.sy, grid.sz];
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const du = dims[u];
    const dv = dims[v];
    const mask = new Int32Array(du * dv);

    const at = (pd: number, pu: number, pv: number): number => {
      c[d] = pd;
      c[u] = pu;
      c[v] = pv;
      return grid.get(c[0], c[1], c[2]);
    };

    for (const s of [-1, 1]) {
      for (let slice = 0; slice < dims[d]; slice++) {
        // 1) 이 단면에서 보이는 면의 (색 | AO) 키를 기록
        let any = false;
        let n = 0;
        const layer = slice + s;
        for (let j = 0; j < dv; j++) {
          for (let i = 0; i < du; i++, n++) {
            const a = at(slice, i, j);
            if (!a || at(layer, i, j)) {
              mask[n] = 0;
              continue;
            }
            let ao = 0xff;
            for (let k = 0; aoLevels && k < 4; k++) {
              if (k === 0) ao = 0;
              const [cu, cv] = CORNERS[k];
              const s1 = at(layer, i + cu, j) ? 1 : 0;
              const s2 = at(layer, i, j + cv) ? 1 : 0;
              const cr = at(layer, i + cu, j + cv) ? 1 : 0;
              const level = s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
              ao |= level << (k * 2);
            }
            mask[n] = a | (ao << 8);
            any = true;
          }
        }
        if (!any) continue;

        // 2) 같은 키끼리 사각형으로 병합
        for (let j = 0; j < dv; j++) {
          for (let i = 0; i < du; ) {
            const key = mask[j * du + i];
            if (!key) {
              i++;
              continue;
            }
            const ao = key >> 8;
            const a0 = ao & 3;
            const a1 = (ao >> 2) & 3;
            const a2 = (ao >> 4) & 3;
            const a3 = (ao >> 6) & 3;
            // AO가 모서리마다 다르면 그라데이션이 늘어나 버리므로 병합하지 않는다
            const uniform = a0 === a1 && a1 === a2 && a2 === a3;

            let w = 1;
            let h = 1;
            if (uniform) {
              while (i + w < du && mask[j * du + i + w] === key) w++;
              outer: while (j + h < dv) {
                for (let k = 0; k < w; k++) {
                  if (mask[(j + h) * du + i + k] !== key) break outer;
                }
                h++;
              }
            }
            for (let hh = 0; hh < h; hh++)
              for (let ww = 0; ww < w; ww++) mask[(j + hh) * du + i + ww] = 0;

            // 3) 사각형 방출
            const base = positions.length / 3;
            const color = key & 0xff;
            const r = palette[color * 3];
            const g = palette[color * 3 + 1];
            const b = palette[color * 3 + 2];
            const aos = [a0, a1, a2, a3];
            const pd = slice + (s > 0 ? 1 : 0);
            const corners: ReadonlyArray<readonly [number, number]> = [
              [i, j],
              [i + w, j],
              [i + w, j + h],
              [i, j + h],
            ];
            for (let k = 0; k < 4; k++) {
              c[d] = pd;
              c[u] = corners[k][0];
              c[v] = corners[k][1];
              positions.push(c[0], c[1], c[2]);
              c[d] = s * 127;
              c[u] = 0;
              c[v] = 0;
              normals.push(c[0], c[1], c[2]);
              const f = (aoLevels ? aoLevels[aos[k]] : 1) * 255;
              colors.push(Math.round(r * f), Math.round(g * f), Math.round(b * f));
            }
            // 더 밝은 대각선 쪽으로 나눠 AO 보간이 한쪽으로 쏠리지 않게 한다
            const tris = a0 + a2 > a1 + a3 ? [0, 1, 2, 0, 2, 3] : [0, 1, 3, 1, 2, 3];
            for (let t = 0; t < 6; t += 3) {
              if (s > 0) indices.push(base + tris[t], base + tris[t + 1], base + tris[t + 2]);
              else indices.push(base + tris[t], base + tris[t + 2], base + tris[t + 1]);
            }
            i += w;
          }
        }
      }
    }
  }

  const vertexCount = positions.length / 3;
  return {
    positions: Uint8Array.from(positions),
    normals: Int8Array.from(normals),
    colors: Uint8Array.from(colors),
    indices: vertexCount > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices),
    quadCount: vertexCount / 4,
  };
}
