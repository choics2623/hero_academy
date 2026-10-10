// 도트 그림용 작은 래스터 라이브러리.
// DOM에 의존하지 않는다: 그림은 정수 색(0xRRGGBB) 배열로 그려지고, 화면에 올리는 일은 web/art.ts가 한다.
// 투명은 -1.

export const CLEAR = -1;

/** 4×4 바이어 행렬 (0~15). 디더링 문턱값 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => BAYER[((y & 3) << 2) | (x & 3)];

/** 결정적인 난수 (같은 씨앗이면 같은 그림) */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export type Palette = Record<string, number>;

export class Pix {
  readonly data: Int32Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Int32Array(w * h).fill(CLEAR);
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number {
    return this.inside(x, y) ? this.data[y * this.w + x] : CLEAR;
  }

  set(x: number, y: number, c: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.inside(x, y)) this.data[y * this.w + x] = c;
  }

  /** 이미 칠해진 곳에만 칠한다 */
  paint(x: number, y: number, c: number) {
    if (this.get(x, y) !== CLEAR) this.set(x, y, c);
  }

  fill(c: number) {
    this.data.fill(c);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** 테두리만 */
  frame(x: number, y: number, w: number, h: number, c: number) {
    this.hline(x, x + w - 1, y, c);
    this.hline(x, x + w - 1, y + h - 1, c);
    this.vline(x, y, y + h - 1, c);
    this.vline(x + w - 1, y, y + h - 1, c);
  }

  hline(x0: number, x1: number, y: number, c: number) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
  }

  vline(x: number, y0: number, y1: number, c: number) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** 채운 타원. 중심은 픽셀 좌표 (소수 가능) */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number | ((x: number, y: number, d: number) => number)) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d <= 1) {
          const col = typeof c === 'function' ? c(x, y, d) : c;
          if (col !== CLEAR) this.set(x, y, col);
        }
      }
    }
  }

  /** 채운 다각형 (짝-홀 규칙) */
  poly(pts: [number, number][], c: number | ((x: number, y: number) => number)) {
    const ys = pts.map((p) => p[1]);
    const y0 = Math.floor(Math.min(...ys));
    const y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) {
          this.set(x, y, typeof c === 'function' ? c(x, y) : c);
        }
      }
    }
  }

  /** 바이어 디더: level(0~16)만큼 c를 흩뿌린다. 0 = 없음, 16 = 꽉 참 */
  dither(x: number, y: number, w: number, h: number, c: number, level: number, onlyOpaque = false) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const px = x + i;
        const py = y + j;
        if (bayer(px, py) < level && (!onlyOpaque || this.get(px, py) !== CLEAR)) this.set(px, py, c);
      }
    }
  }

  /** 세로 그라데이션. stops는 위→아래 색 목록, 사이는 디더로 섞는다 */
  gradV(x: number, y: number, w: number, h: number, stops: number[]) {
    const n = stops.length - 1;
    for (let j = 0; j < h; j++) {
      const t = (j / Math.max(1, h - 1)) * n;
      const k = Math.min(n - 1, Math.floor(t));
      const f = t - k;
      for (let i = 0; i < w; i++) {
        const px = x + i;
        const py = y + j;
        this.set(px, py, bayer(px, py) < f * 16 ? stops[k + 1] : stops[k]);
      }
    }
  }

  /** 둥근 빛 번짐 (가운데일수록 촘촘한 디더) */
  glow(cx: number, cy: number, r: number, c: number, strength = 12, onlyOpaque = false) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d > 1) continue;
        if (onlyOpaque && this.get(x, y) === CLEAR) continue;
        if (bayer(x, y) < (1 - d) * strength) this.set(x, y, c);
      }
    }
  }

  /** 문자열 격자 스프라이트. '.'과 ' '는 투명 */
  sprite(x: number, y: number, rows: string[], pal: Palette, flip = false) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c === undefined) continue;
        this.set(flip ? x + row.length - 1 - i : x + i, y + j, c);
      }
    });
  }

  /** 불투명한 픽셀 둘레(상하좌우)에 테두리를 두른다 */
  outline(c: number, diagonal = false) {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== CLEAR) continue;
        const n =
          this.get(x - 1, y) !== CLEAR ||
          this.get(x + 1, y) !== CLEAR ||
          this.get(x, y - 1) !== CLEAR ||
          this.get(x, y + 1) !== CLEAR ||
          (diagonal &&
            (this.get(x - 1, y - 1) !== CLEAR ||
              this.get(x + 1, y - 1) !== CLEAR ||
              this.get(x - 1, y + 1) !== CLEAR ||
              this.get(x + 1, y + 1) !== CLEAR));
        if (n) add.push(y * this.w + x);
      }
    }
    for (const i of add) this.data[i] = c;
    return this;
  }

  /** 다른 그림을 겹쳐 그린다 (투명은 건너뜀) */
  blit(src: Pix, x = 0, y = 0, flip = false) {
    for (let j = 0; j < src.h; j++) {
      for (let i = 0; i < src.w; i++) {
        const c = src.data[j * src.w + i];
        if (c !== CLEAR) this.set(flip ? x + src.w - 1 - i : x + i, y + j, c);
      }
    }
    return this;
  }

  map(fn: (c: number, x: number, y: number) => number) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (this.data[i] !== CLEAR) this.data[i] = fn(this.data[i], x, y);
      }
    }
    return this;
  }

  clone(): Pix {
    const p = new Pix(this.w, this.h);
    p.data.set(this.data);
    return p;
  }

  /** 픽셀 단위 마스크 검사 */
  opaque(x: number, y: number) {
    return this.get(x, y) !== CLEAR;
  }
}
