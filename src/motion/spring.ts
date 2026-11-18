/**
 * 작은 스프링 엔진. DesignBookmark Motion Studies의 shared/motion.js를 옮겨 왔다.
 * - 적분 방식과 값이 원본과 같다: 프레임마다 dt를 1/30초로 자르고 4번 나눠 계산한다.
 * - 움직임 줄이기 설정이면 감쇠를 임계값(2√k)으로 바꿔 튕기지 않게 한다.
 * - 원본은 rAF를 계속 돌리지만, 여기서는 움직이는 것이 있을 때만 돈다 (디오라마와 같은 원칙).
 */

export interface Spring {
  /** 현재 값 */
  x: number;
  /** 속도 */
  v: number;
  /** 목표 값 */
  t: number;
  /** 강성(stiffness) */
  k: number;
  /** 감쇠(damping) */
  c: number;
}

/** [stiffness, damping] */
export type SpringPreset = readonly [number, number];

const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function spring(x: number, [k, c]: SpringPreset): Spring {
  return { x, v: 0, t: x, k, c: reduceMotion() ? 2 * Math.sqrt(k) : c };
}

/** 값을 바로 옮긴다 (애니메이션 없이) */
export function snap(s: Spring, value: number): void {
  s.x = s.t = value;
  s.v = 0;
}

export function step(s: Spring, dt: number): void {
  const a = -s.k * (s.x - s.t) - s.c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

/** 목표에 충분히 가까워져 멈춘 것으로 봐도 되는지 */
export function settled(s: Spring, eps = 0.001): boolean {
  return Math.abs(s.x - s.t) < eps && Math.abs(s.v) < eps * 10;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface Animated {
  frame(dt: number): void;
  render(): void;
  /** false를 돌려주면 이번 프레임 뒤로는 그리지 않는다 (다시 wake로 깨운다) */
  active(): boolean;
}

const SUBSTEPS = 4;
const comps = new Set<Animated>();
const timers: Array<{ t: number; fn: () => void }> = [];
let raf = 0;
let last = 0;

function loop(now: number) {
  // 시뮬레이션 시간 기준 타이머: 탭이 멈췄다 돌아와도 한꺼번에 몰리지 않는다
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  for (let i = timers.length - 1; i >= 0; i--) {
    if ((timers[i].t -= dt) <= 0) timers.splice(i, 1)[0].fn();
  }
  for (let k = 0; k < SUBSTEPS; k++) comps.forEach((c) => c.frame(dt / SUBSTEPS));
  comps.forEach((c) => c.render());
  const busy = timers.length > 0 || [...comps].some((c) => c.active());
  raf = busy ? requestAnimationFrame(loop) : 0;
}

/** 루프가 멈춰 있으면 다시 돌린다 */
export function wake(): void {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(loop);
}

export function register(c: Animated): () => void {
  comps.add(c);
  wake();
  return () => comps.delete(c);
}

/** sec초 뒤에 실행한다 (스프링과 같은 시간 축) */
export function after(sec: number, fn: () => void): { cancel: () => void } {
  const timer = { t: sec, fn };
  timers.push(timer);
  wake();
  return {
    cancel: () => {
      const i = timers.indexOf(timer);
      if (i > -1) timers.splice(i, 1);
    },
  };
}
