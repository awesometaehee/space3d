import { describe, expect, it } from 'vitest';
import { VoxelGrid } from './VoxelGrid';
import { greedyMesh } from './greedyMesh';

const palette = new Float32Array([0, 0, 0, 1, 1, 1, 1, 0, 0]);

describe('greedyMesh', () => {
  it('복셀 1개는 사각형 6개가 된다', () => {
    const g = new VoxelGrid(3, 3, 3);
    g.set(1, 1, 1, 1);
    const m = greedyMesh(g, palette);
    expect(m.quadCount).toBe(6);
    expect(m.indices.length).toBe(36);
    expect(m.positions.length).toBe(6 * 4 * 3);
  });

  it('같은 색으로 이어진 복셀은 면이 합쳐진다', () => {
    const g = new VoxelGrid(8, 4, 8);
    g.box(1, 1, 1, 7, 3, 7, 1); // 6x2x6 = 72칸
    expect(greedyMesh(g, palette).quadCount).toBe(6);
  });

  it('색이 다르면 합치지 않고, 맞닿은 안쪽 면은 만들지 않는다', () => {
    const g = new VoxelGrid(4, 3, 3);
    g.set(1, 1, 1, 1);
    g.set(2, 1, 1, 2);
    expect(greedyMesh(g, palette).quadCount).toBe(10);
  });

  it('모든 삼각형이 면의 법선 방향을 바라본다 (와인딩 검증)', () => {
    const g = new VoxelGrid(5, 5, 5);
    g.box(1, 1, 1, 4, 2, 4, 1);
    g.set(2, 2, 2, 2); // AO가 생기는 계단 모양
    const m = greedyMesh(g, palette);
    const p = (i: number) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [p(m.indices[t]), p(m.indices[t + 1]), p(m.indices[t + 2])];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      const ni = m.indices[t] * 3;
      const dot = cross[0] * m.normals[ni] + cross[1] * m.normals[ni + 1] + cross[2] * m.normals[ni + 2];
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('구석에 닿은 면은 AO로 어두워진다', () => {
    const g = new VoxelGrid(4, 4, 4);
    g.box(0, 0, 0, 4, 1, 4, 1); // 바닥
    g.box(0, 1, 0, 1, 4, 4, 1); // 벽
    const m = greedyMesh(g, palette);
    expect(Math.min(...m.colors)).toBeLessThan(255);
    expect(Math.max(...m.colors)).toBe(255);
  });
});
