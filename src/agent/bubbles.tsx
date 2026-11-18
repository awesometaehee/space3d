import { useLayoutEffect, useRef } from 'react';
import { after, clamp, register, settled, snap, spring, step, type Spring, type SpringPreset } from '../motion/spring';

/**
 * 스트리밍 답변 말풍선. DesignBookmark Motion Studies "Streaming reply"를 옮겨 왔다.
 * 작은 "생각 중" 알약으로 열린 뒤, 답이 단어 단위로 도착할 때마다 말풍선의 너비·높이가
 * 스프링으로 늘어나고, 단어는 저마다의 스프링으로 떠오르며 또렷해진다.
 * 스프링 값(강성·감쇠)은 원본 stream.js와 같다.
 */
const SPRINGS = {
  /** 말풍선이 들어올 때 (원본 meS·aiS) */
  enter: [300, 22],
  /** 말풍선 너비·높이 (원본 W·Hh) */
  size: [260, 26],
  /** "생각 중" 투명도 (원본 T) */
  think: [300, 30],
  /** 단어 하나 (원본 words[].s) */
  word: [340, 26],
} as const satisfies Record<string, SpringPreset>;
/** 단어 사이 간격(초), 원본과 같다 */
const WORD_STAGGER = 0.07;
/** 말풍선이 열린 뒤 "생각 중"을 최소한 보여 주는 시간(초) */
const MIN_THINK = 0.6;
/** 질문 말풍선 다음에 답 말풍선이 따라 들어오는 지연(초) */
const ENTER_DELAY = 0.12;
/** 말풍선 안쪽 여백. .bubble 패딩과 맞춘다 */
const PAD_X = 13;
const PAD_Y = 9;
/** 넓은 패널에서도 한 줄이 너무 길어지지 않게 (.bubble max-width와 같다) */
const MAX_BUBBLE = 560;

interface Word {
  el: HTMLSpanElement;
  s: Spring;
  on: boolean;
}

interface StreamingBubbleProps {
  text: string;
  /** 아직 글자가 더 들어오는 중인지 */
  streaming: boolean;
  /** false면 애니메이션 없이 바로 그린다 (패널을 다시 열 때의 지난 대화) */
  animate: boolean;
}

export function StreamingBubble({ text, streaming, animate }: StreamingBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const thinkRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const engine = useRef<ReturnType<typeof createEngine> | null>(null);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    const think = thinkRef.current;
    const textEl = textRef.current;
    if (!bubble || !think || !textEl) return;
    const e = createEngine(bubble, think, textEl, animate);
    engine.current = e;
    return () => {
      engine.current = null;
      e.dispose();
    };
  }, [animate]);

  useLayoutEffect(() => {
    engine.current?.sync(text, streaming);
  }, [text, streaming]);

  return (
    <div ref={bubbleRef} className="bubble is-assistant stream-bubble" data-state={animate ? 'live' : 'static'}>
      <span ref={thinkRef} className="stream-think" aria-hidden="true">
        생각 중
      </span>
      {/* 단어 span은 엔진이 직접 붙인다. 화면 읽기 프로그램은 다 받은 뒤 아래 문장을 한 번 읽는다 */}
      <div ref={textRef} className="stream-text" aria-hidden="true" />
      {!streaming && <span className="sr-only">{text}</span>}
    </div>
  );
}

function createEngine(bubble: HTMLDivElement, think: HTMLSpanElement, textEl: HTMLDivElement, animate: boolean) {
  const words: Word[] = [];
  const queue: Word[] = [];
  let done = false;
  let released = false;
  let pumping = false;
  let thinkingSince = 0;
  let elapsed = 0;
  const timers: Array<{ cancel: () => void }> = [];

  // 말풍선이 차지할 수 있는 최대 너비 = min(대화 영역의 88%, MAX_BUBBLE) (.bubble max-width와 같다).
  // 패널 폭이 바뀌는 중일 수 있어서, 첫 단어를 내보내기 직전에 잰다
  const log = bubble.parentElement;
  let full = 0;
  const measure = () => {
    if (full) return;
    const avail = log ? Math.floor((log.clientWidth - paddingX(log)) * 0.88) : 280;
    full = Math.min(avail, MAX_BUBBLE);
    textEl.style.width = `${full - PAD_X * 2}px`;
  };

  const appendWord = (token: string, first: boolean): Word => {
    if (!first) textEl.append(' ');
    const el = document.createElement('span');
    el.className = 'wd';
    el.textContent = token;
    textEl.appendChild(el);
    return { el, s: spring(0, SPRINGS.word), on: false };
  };

  if (!animate) {
    // 지난 대화: 처음부터 다 펼친 상태
    bubble.dataset.state = 'static';
    return {
      sync(text: string) {
        textEl.textContent = text;
      },
      dispose() {},
    };
  }

  const enterS = spring(0, SPRINGS.enter);
  const thinkS = spring(1, SPRINGS.think);
  const W = spring(think.offsetWidth + PAD_X * 2, SPRINGS.size);
  const H = spring(think.offsetHeight + PAD_Y * 2, SPRINGS.size);
  timers.push(after(ENTER_DELAY, () => (enterS.t = 1)));

  const reveal = (w: Word) => {
    measure();
    w.on = true;
    w.s.t = 1;
    thinkS.t = 0;
    W.t = Math.max(W.t, Math.min(full, PAD_X + w.el.offsetLeft + w.el.offsetWidth + PAD_X));
    H.t = PAD_Y + w.el.offsetTop + w.el.offsetHeight + PAD_Y;
  };

  // 단어를 WORD_STAGGER 간격으로 하나씩 내보낸다. 처음에는 "생각 중"을 잠깐 보여 준다
  const pump = () => {
    const next = queue.shift();
    if (!next) {
      pumping = false;
      return;
    }
    reveal(next);
    timers.push(after(WORD_STAGGER, pump));
  };
  const startPump = () => {
    if (pumping || !queue.length) return;
    pumping = true;
    const wait = Math.max(0, thinkingSince + MIN_THINK + ENTER_DELAY - elapsed);
    timers.push(after(wait, pump));
  };

  const springs = () => [enterS, thinkS, W, H, ...words.map((w) => w.s)];

  /** 다 보여 주고 멈추면 고정 크기를 풀어 일반 레이아웃으로 돌린다 (창 크기가 바뀌어도 맞게) */
  const release = () => {
    released = true;
    bubble.dataset.state = 'static';
    bubble.style.width = bubble.style.height = bubble.style.transform = bubble.style.opacity = '';
    textEl.style.width = '';
    for (const w of words) w.el.style.cssText = '';
  };

  const unregister = register({
    frame(dt) {
      if (released) return;
      elapsed += dt;
      for (const s of springs()) step(s, dt);
    },
    render() {
      if (released) return;
      bubble.style.opacity = clamp(enterS.x, 0, 1).toFixed(3);
      bubble.style.transform = `translateY(${((1 - enterS.x) * 14).toFixed(2)}px)`;
      bubble.style.width = `${W.x.toFixed(2)}px`;
      bubble.style.height = `${H.x.toFixed(2)}px`;
      think.style.opacity = clamp(thinkS.x, 0, 1).toFixed(3);
      for (const w of words) {
        if (!w.on) continue;
        const v = clamp(w.s.x, 0, 1.2);
        w.el.style.opacity = clamp(v, 0, 1).toFixed(3);
        w.el.style.transform = `translateY(${((1 - w.s.x) * 6).toFixed(2)}px)`;
        w.el.style.filter = v < 0.98 ? `blur(${((1 - clamp(v, 0, 1)) * 4).toFixed(2)}px)` : 'none';
      }
      if (done && !queue.length && !pumping && springs().every((s) => settled(s, 0.01))) release();
    },
    active: () => !released,
  });

  return {
    /** 지금까지 받은 글을 반영한다. 스트리밍 중에는 아직 끝나지 않았을 수 있는 마지막 단어를 기다린다 */
    sync(text: string, streaming: boolean) {
      if (released) {
        textEl.textContent = text;
        return;
      }
      const tokens = text.split(/\s+/).filter(Boolean);
      const ready = streaming && !/\s$/.test(text) ? tokens.slice(0, -1) : tokens;
      for (let i = words.length; i < ready.length; i++) {
        const w = appendWord(ready[i], i === 0);
        w.el.style.opacity = '0';
        words.push(w);
        queue.push(w);
      }
      done = !streaming;
      startPump();
      // 답 없이 끝났으면 "생각 중"을 접는다
      if (done && words.length === 0) {
        snap(thinkS, thinkS.x);
        thinkS.t = 0;
      }
    },
    dispose() {
      timers.forEach((t) => t.cancel());
      unregister();
    },
  };
}

function paddingX(el: HTMLElement): number {
  const style = getComputedStyle(el);
  return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
}

/** 질문 말풍선: 원본처럼 살짝 작게 아래에서 떠오른다 */
export function UserBubble({ text, animate }: { text: string; animate: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !animate) return;
    const s = spring(0, SPRINGS.enter);
    let still = false;
    const paint = () => {
      el.style.opacity = clamp(s.x, 0, 1).toFixed(3);
      el.style.transform = `translateY(${((1 - s.x) * 14).toFixed(2)}px) scale(${(0.92 + 0.08 * s.x).toFixed(4)})`;
    };
    paint();
    s.t = 1;
    const unregister = register({
      frame: (dt) => step(s, dt),
      render() {
        if (still) return;
        paint();
        if (settled(s, 0.002)) {
          still = true;
          el.style.opacity = el.style.transform = '';
        }
      },
      active: () => !still,
    });
    return unregister;
  }, [animate]);

  return (
    <p ref={ref} className="bubble is-user">
      {text}
    </p>
  );
}
