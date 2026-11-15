import { MeshLambertMaterial } from 'three';

export interface VoxelSurface {
  /** 복셀 한 칸마다의 밝기 편차 (0~1) */
  grain: number;
  /** 블록(여러 칸 묶음)마다의 밝기 편차 */
  blockTone: number;
  /** 블록 경계에 새기는 홈의 진하기. 0이면 홈 없음 */
  groove: number;
  /** 블록 한 변의 칸 수 */
  blockSize: number;
}

/**
 * 정점 색상 위에 복셀 질감을 셰이더로 얹는 재질.
 * 칸마다 색을 다르게 칠하면 면 합치기가 깨져 삼각형이 급증하므로,
 * 지오메트리는 그대로 두고 프래그먼트 셰이더에서 격자 좌표를 해시해 얼룩과 홈을 만든다.
 * 텍스처 이미지와 추가 메모리가 필요 없다.
 */
export function createVoxelMaterial(surface: VoxelSurface): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrain = { value: surface.grain };
    shader.uniforms.uBlockTone = { value: surface.blockTone };
    shader.uniforms.uGroove = { value: surface.groove };
    shader.uniforms.uBlockSize = { value: surface.blockSize };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrid;\nvarying vec3 vGridNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrid = position;\nvGridNormal = normal;');

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec3 vGrid;
varying vec3 vGridNormal;
uniform float uGrain;
uniform float uBlockTone;
uniform float uGroove;
uniform float uBlockSize;
float voxelHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.27, 0.43));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
{
  // 면은 격자 경계 위에 있으므로 법선 반대쪽으로 반 칸 밀어 소속 칸을 정한다
  vec3 inside = vGrid - vGridNormal * 0.5;
  float grain = voxelHash(floor(inside)) - 0.5;
  vec3 block = inside / uBlockSize;
  float tone = voxelHash(floor(block) + 31.7) - 0.5;
  diffuseColor.rgb *= 1.0 + grain * uGrain + tone * uBlockTone;

  // 블록 경계까지의 거리(칸 단위). 법선 방향 축은 제외한다
  vec3 edge = (0.5 - abs(fract(block) - 0.5)) * uBlockSize + abs(vGridNormal) * 100.0;
  float dist = min(edge.x, min(edge.y, edge.z));
  // 화면에서 칸이 작아지면 홈이 자글거리므로 서서히 지운다
  float texel = max(fwidth(vGrid.x), max(fwidth(vGrid.y), fwidth(vGrid.z)));
  float line = 1.0 - smoothstep(0.05, 0.05 + max(texel, 0.02) * 1.5, dist);
  diffuseColor.rgb *= 1.0 - line * uGroove * clamp(1.0 - texel * 2.2, 0.0, 1.0);
}`,
      );
  };
  // 값만 다른 재질끼리는 같은 셰이더 프로그램을 공유한다
  material.customProgramCacheKey = () => 'voxel-surface';
  return material;
}
