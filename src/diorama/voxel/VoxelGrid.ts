/**
 * 팔레트 인덱스(1바이트)로 채워진 복셀 격자. 0 = 빈 칸.
 * 정점 좌표를 Uint8로 저장하기 위해 각 축 크기는 255 이하로 제한한다.
 */
export class VoxelGrid {
  readonly data: Uint8Array;

  constructor(
    readonly sx: number,
    readonly sy: number,
    readonly sz: number,
  ) {
    if (sx > 255 || sy > 255 || sz > 255 || sx < 1 || sy < 1 || sz < 1) {
      throw new RangeError(`VoxelGrid 크기는 축당 1~255여야 합니다: ${sx}x${sy}x${sz}`);
    }
    this.data = new Uint8Array(sx * sy * sz);
  }

  private inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  get(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 0;
    return this.data[x + this.sx * (z + this.sz * y)];
  }

  set(x: number, y: number, z: number, color: number): void {
    if (!this.inBounds(x, y, z)) return;
    this.data[x + this.sx * (z + this.sz * y)] = color;
  }

  /** [x0,x1) × [y0,y1) × [z0,z1) 범위를 채운다. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void {
    for (let y = y0; y < y1; y++)
      for (let z = z0; z < z1; z++)
        for (let x = x0; x < x1; x++) this.set(x, y, z, color);
  }

  /** 복셀 중심이 타원체 안에 들어오는 칸을 채운다. filter가 false를 반환하면 건너뛴다. */
  ellipsoid(
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    color: number,
    filter?: (x: number, y: number, z: number) => boolean,
  ): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx;
          const dy = (y + 0.5 - cy) / ry;
          const dz = (z + 0.5 - cz) / rz;
          if (dx * dx + dy * dy + dz * dz > 1) continue;
          if (filter && !filter(x, y, z)) continue;
          this.set(x, y, z, color);
        }
  }
}
