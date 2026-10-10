// 삽화 2부: 장소와 사건. 부품은 scenes.ts에 있고, 여기서만 쓰는 부품은 아래에 둔다.
import { C, RAMP, nearest, type Ramp } from './palette';
import { Pix, bayer, mix, rng } from './pixel';
import {
  H,
  SKY,
  W,
  ambient,
  bricks,
  candle,
  castle,
  clouds,
  figure,
  floor,
  moon,
  ridge,
  roundTree,
  shelf,
  sky,
  stars,
  sun,
  table,
  wall,
  type SceneFn,
  type Tod,
} from './scenes';

// ---------------------------------------------------------------- 부품

const STONE: Ramp = [C.mist1, C.mist0, C.slate2, C.slate1];
const DARK_STONE: Ramp = [C.slate2, C.slate1, C.slate0, C.night1];
const OLD_WOOD: Ramp = [C.wood1, C.wood2, C.wood3, C.wood4];
const PLASTER: Ramp = [C.white, C.mist2, C.mist1, C.mist0];
const SPINES = [C.red1, C.red2, C.blue1, C.blue2, C.leaf2, C.leaf3, C.gold2, C.violet2, C.wood1, C.teal2];

/** fn이 그린 것 중 keep(x, y, 그리기 전 색)인 곳만 남긴다 */
function within(p: Pix, keep: (x: number, y: number, before: number) => boolean, fn: () => void) {
  const save = p.clone();
  fn();
  for (let j = 0; j < p.h; j++) {
    for (let i = 0; i < p.w; i++) {
      const k = j * p.w + i;
      if (!keep(i, j, save.data[k])) p.data[k] = save.data[k];
    }
  }
}

/** fn이 그린 것 중 (x, y, w, h) 안쪽만 남긴다 */
function clipped(p: Pix, x: number, y: number, w: number, h: number, fn: () => void) {
  within(p, (i, j) => i >= x && j >= y && i < x + w && j < y + h, fn);
}

/** 2차원 값 잡음 (0~1) */
function vnoise(seed: number) {
  const h = (i: number, j: number) => {
    let t = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041);
    t = Math.imul(t ^ (t >>> 13), 1274126177);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = h(i, j);
    const b = h(i + 1, j);
    const c = h(i, j + 1);
    const d = h(i + 1, j + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** 이미 그린 색을 빛 쪽으로 섞는다 (부드러운 빛 웅덩이). ambient 뒤에 쓴다 */
function light(p: Pix, cx: number, cy: number, r: number, col: number, amt = 0.5, sy = 1) {
  for (let y = Math.floor(cy - r * sy); y <= Math.ceil(cy + r * sy); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!p.inside(x, y)) continue;
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) / sy) / r;
      if (d >= 1) continue;
      const k = amt * (1 - d) * (1 - d) + ((bayer(x, y) - 7.5) / 16) * 0.08;
      if (k <= 0.03) continue;
      p.set(x, y, nearest(mix(p.get(x, y), col, Math.min(1, k))));
    }
  }
}

/** 시간대 창: 하늘 + 바깥 풍경(view) + 창살 */
function win(p: Pix, x: number, y: number, w: number, h: number, tod: Tod, cols = 2, rows = 2, frame: Ramp = RAMP.brownCloth, view?: () => void) {
  p.rect(x - 2, y - 2, w + 4, h + 4, frame[2]);
  p.hline(x - 2, x + w + 1, y - 2, frame[1]);
  clipped(p, x, y, w, h, () => {
    sky(p, tod, h, x, y, w);
    if (tod === 'night') {
      const r = rng(x * 13 + y * 7);
      for (let i = 0; i < (w * h) / 40; i++) p.set(x + Math.floor(r() * w), y + Math.floor(r() * h * 0.7), r() < 0.4 ? C.white : C.mist0);
    }
    view?.();
  });
  for (let i = 1; i < cols; i++) p.vline(x + Math.round((i * w) / cols) - 1, y, y + h - 1, frame[1]);
  for (let j = 1; j < rows; j++) p.hline(x, x + w - 1, y + Math.round((j * h) / rows) - 1, frame[1]);
  p.hline(x - 3, x + w + 2, y + h + 2, frame[0]);
  p.hline(x - 3, x + w + 2, y + h + 3, frame[2]);
}

/** 창으로 드는 빛줄기 (밤에는 옅은 달빛) */
function sunbeam(p: Pix, pts: [number, number][], tod: Tod, amt = 0.3) {
  const c = tod === 'night' ? C.mist0 : tod === 'dusk' ? C.gold1 : tod === 'dawn' ? C.pink0 : C.gold0;
  const a = tod === 'night' ? amt * 0.45 : amt;
  p.poly(pts, (x, y) => nearest(mix(p.get(x, y), c, a + ((bayer(x, y) - 7.5) / 16) * 0.12)));
}

/** 거꾸로 매단 약초 다발 */
function herbs(p: Pix, x: number, y: number, ramp: Ramp) {
  p.sprite(x - 2, y, ['..w..', '..w..', '.lgl.', '.gGg.', 'lgGgl', 'g.G.g', '..g..'], { w: C.wood3, l: ramp[0], g: ramp[1], G: ramp[2] });
}

/** 작은 랜턴 (몸체만). 빛은 따로 */
function lanternBody(p: Pix, x: number, y: number) {
  p.set(x + 2, y - 1, C.slate1);
  p.rect(x, y, 5, 1, C.slate0);
  p.rect(x + 1, y + 1, 3, 4, C.gold1);
  p.set(x + 2, y + 2, C.gold0);
  p.set(x + 2, y + 3, C.white);
  p.vline(x, y + 1, y + 4, C.slate0);
  p.vline(x + 4, y + 1, y + 4, C.slate0);
  p.rect(x, y + 5, 5, 1, C.slate0);
}

/** 등불 빛 (ambient 뒤) */
function warm(p: Pix, x: number, y: number, r: number, amt = 0.55) {
  light(p, x, y, r, C.gold2, amt);
  light(p, x, y, r * 0.4, C.gold1, amt * 0.7);
}

/** 쌓인 책 더미 (아래에서 위로) */
function bookPile(p: Pix, x: number, base: number, n: number, seed: number) {
  const r = rng(seed);
  let y = base;
  for (let i = 0; i < n; i++) {
    const w = 11 + Math.floor(r() * 6);
    const h = 2 + (r() < 0.4 ? 1 : 0);
    const ox = x + Math.floor(r() * 4) - 2;
    const c = SPINES[Math.floor(r() * SPINES.length)];
    y -= h;
    p.rect(ox, y, w, h, c);
    p.hline(ox, ox + w - 1, y, nearest(mix(c, C.white, 0.3)));
    if (r() < 0.5) p.vline(ox + w - 1, y + 1, y + h - 1, C.mist2);
    else p.vline(ox, y + 1, y + h - 1, C.mist2);
  }
}

/** 작은 Z 글자 */
function zz(p: Pix, x: number, y: number, big: boolean, c: number) {
  if (big) {
    p.hline(x, x + 3, y, c);
    p.set(x + 2, y + 1, c);
    p.set(x + 1, y + 2, c);
    p.hline(x, x + 3, y + 3, c);
  } else {
    p.hline(x, x + 2, y, c);
    p.set(x + 1, y + 1, c);
    p.hline(x, x + 2, y + 2, c);
  }
}

/** 수정 결정 무리 */
function crystals(p: Pix, x: number, y: number, ramp: Ramp, seed: number, n = 4) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const dx = Math.floor((i - n / 2) * 2 + r() * 2);
    const h = 3 + Math.floor(r() * 4);
    const lean = r() < 0.5 ? -1 : 1;
    for (let j = 0; j < h; j++) {
      const xx = x + dx + (j > h / 2 ? lean : 0);
      p.set(xx, y - j, j === h - 1 ? ramp[0] : ramp[1]);
      p.set(xx + 1, y - j, ramp[2]);
    }
  }
}

function sparkle(p: Pix, x: number, y: number, c: number = C.white, arm: number = C.mist1) {
  p.set(x, y, c);
  p.set(x - 1, y, arm);
  p.set(x + 1, y, arm);
  p.set(x, y - 1, arm);
  p.set(x, y + 1, arm);
}

/** 원근 투영: 세계 (X 오른쪽, Y 위, Z 앞으로) → 화면 */
function proj(vx: number, vy: number, F: number) {
  return (X: number, Y: number, Z: number): [number, number] => [vx + (F * X) / Z, vy - (F * Y) / Z];
}

/** 원근 타일 바닥 (y0부터 아래). 눈높이 e, 타일 크기 size */
function tileFloor(p: Pix, y0: number, vx: number, vy: number, F: number, e: number, size: number, col: (i: number, j: number, x: number, y: number) => number, grout: number) {
  for (let y = y0; y < H; y++) {
    const z = (F * e) / (y + 0.5 - vy);
    const pxV = (F * e * size) / (z * z);
    for (let x = 0; x < W; x++) {
      const X = ((x + 0.5 - vx) * z) / F;
      const u = X / size;
      const v = z / size;
      const i = Math.floor(u);
      const j = Math.floor(v);
      const pxU = (F * size) / z;
      const gu = (u - i) * pxU < 1 && pxU > 3;
      const gv = (v - j) * pxV < 1 && pxV > 2.5;
      p.set(x, y, gu || gv ? grout : col(i, j, x, y));
    }
  }
}

/** 타원 고리 (외곽선) */
function ring(p: Pix, cx: number, cy: number, rx: number, ry: number, c: number | ((a: number) => number), step = 1) {
  const n = Math.ceil((rx + ry) * 4);
  for (let k = 0; k < n; k += step) {
    const a = (k / n) * Math.PI * 2;
    p.set(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, typeof c === 'function' ? c(a) : c);
  }
}

/** 타원 위의 점 */
const onEllipse = (cx: number, cy: number, rx: number, ry: number, a: number): [number, number] => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];

/** 뒷모습 사람 (머리와 어깨). s = 크기 */
function backHead(p: Pix, x: number, y: number, hair: number, cloth: number, s = 1) {
  const dark = nearest(mix(cloth, C.ink, 0.3));
  p.ellipse(x, y + 5.4 * s, 4.8 * s, 2.8 * s, (px, py) => (py < y + 3.4 * s ? nearest(mix(cloth, C.white, 0.15)) : px > x + 2 * s ? dark : cloth));
  p.rect(Math.round(x - s), Math.round(y + 2.4 * s), Math.max(1, Math.round(2 * s)), Math.max(1, Math.round(1.4 * s)), C.skin2);
  const hl = nearest(mix(hair, C.white, 0.25));
  const sh = nearest(mix(hair, C.ink, 0.3));
  p.ellipse(x, y + 0.9 * s, 2.5 * s, 2.5 * s, (px, py) => (py < y - 0.2 * s && px < x + 0.5 ? hl : px > x + 1.2 * s || py > y + 2.4 * s ? sh : hair));
  p.set(x - 2.6 * s - 0.5, y + 1.2 * s, C.skin2);
  p.set(x + 2.6 * s, y + 1.2 * s, C.skin2);
}

/** 뒷모습으로 선 사람 (figure와 같은 크기) */
function backFigure(p: Pix, x: number, y: number, hair: number, cloth: number, pants: number = C.slate0) {
  p.rect(x + 2, y, 3, 1, hair);
  p.rect(x + 1, y + 1, 5, 3, hair);
  p.set(x + 1, y + 3, C.skin2);
  p.set(x + 5, y + 3, C.skin2);
  for (let dy = 4; dy <= 8; dy++) for (let dx = 1; dx <= 5; dx++) p.set(x + dx, y + dy, dx === 5 ? nearest(mix(cloth, C.ink, 0.35)) : cloth);
  p.set(x, y + 5, cloth);
  p.set(x + 6, y + 5, nearest(mix(cloth, C.ink, 0.35)));
  p.set(x, y + 6, C.skin2);
  p.set(x + 6, y + 6, C.skin2);
  for (let dy = 9; dy <= 12; dy++) {
    p.set(x + 2, y + dy, pants);
    p.set(x + 4, y + dy, pants);
  }
  p.set(x + 2, y + 13, C.ink);
  p.set(x + 4, y + 13, C.ink);
}

/** 플라스크 (몸통 둥근 병) */
function flask(p: Pix, x: number, y: number, liquid: number, r = 3) {
  p.rect(x - 1, y - r * 2 - 2, 2, 3, C.mist1);
  p.ellipse(x, y - r, r, r, (px, py) => (py > y - r - 0.5 ? liquid : C.mist2));
  p.set(x - Math.ceil(r / 2), y - r - 1, C.white);
}

/** 병 (가는 원통) */
function bottle(p: Pix, x: number, y: number, liquid: number, h = 6) {
  p.rect(x, y - h, 3, h, liquid);
  p.vline(x, y - h + 1, y - 1, nearest(mix(liquid, C.white, 0.4)));
  p.rect(x + 1, y - h - 2, 1, 2, C.mist1);
  p.set(x + 1, y - h - 3, C.wood2);
}

/** 화분과 잎 */
function pottedPlant(p: Pix, x: number, y: number, s: number, leaf: Ramp, seed: number, flower?: number) {
  const r = rng(seed);
  const pw = Math.max(3, Math.round(6 * s));
  const ph = Math.max(2, Math.round(5 * s));
  p.poly([[x - pw / 2, y - ph], [x + pw / 2, y - ph], [x + pw / 2 - s, y], [x - pw / 2 + s, y]], (px) => (px > x + pw / 4 ? C.ember2 : RAMP.orange[2]));
  p.hline(Math.round(x - pw / 2), Math.round(x + pw / 2) - 1, Math.round(y - ph), RAMP.orange[1]);
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.2;
    const len = (5 + r() * 6) * s;
    const ex = x + Math.cos(a) * len;
    const ey = y - ph + Math.sin(a) * len;
    p.ellipse((x + ex) / 2, (y - ph + ey) / 2, Math.max(1, 2 * s), Math.max(1, len / 2), (px) => (px < x ? leaf[1] : leaf[2]));
    p.set(ex, ey, leaf[0]);
    if (flower !== undefined && r() < 0.6) {
      p.set(ex, ey - 1, flower);
      p.set(ex + 1, ey - 1, flower);
    }
  }
}

// ---------------------------------------------------------------- 장소

const home_room: SceneFn = (p, tod) => {
  wall(p, 0, 64, OLD_WOOD, 12);
  // 박공 지붕 밑면과 서까래
  const edge = (x: number) => Math.round(6 + Math.abs(x + 0.5 - 80) * 0.42);
  for (let x = 0; x < W; x++) {
    const e = edge(x);
    for (let y = 0; y < e; y++) {
      const s = e - y;
      p.set(x, y, s % 6 === 0 ? C.wood4 : bayer(x, y) < 2 ? C.wood4 : C.wood3);
    }
    p.set(x, e - 3, C.wood4);
    p.set(x, e - 2, C.wood1);
    p.set(x, e - 1, C.wood2);
    p.set(x, e, C.wood4);
  }
  // 앞쪽으로 뻗는 도리
  for (const x0 of [26, 50, 110, 134]) {
    const e = edge(x0);
    const dx = x0 - 80;
    const dy = e - 52;
    for (let k = 0; k < 3; k++) p.line(x0 + k, e - 2, x0 + k + dx * 1.2, e - 2 + dy * 1.2, k === 0 ? C.wood1 : C.wood2);
  }
  // 작은 창
  win(p, 70, 22, 20, 16, tod, 2, 2, OLD_WOOD, () => {
    if (tod === 'night') moon(p, 84, 26, 3);
    ridge(p, 2, 37, 3, tod === 'night' ? C.night1 : RAMP.greenCloth[2], 10, 38);
  });
  floor(p, 64, OLD_WOOD);
  // 깔개
  p.ellipse(80, 80, 25, 6, C.red3);
  p.ellipse(80, 80, 22, 4.8, (x, y) => (bayer(x, y) < 2 ? C.red3 : C.red2));
  p.ellipse(80, 80, 10, 2, C.gold3);
  // 낡은 침대
  p.rect(4, 47, 4, 33, C.wood2);
  p.rect(3, 46, 6, 2, C.wood1);
  p.rect(55, 55, 4, 25, C.wood2);
  p.rect(54, 54, 6, 2, C.wood1);
  p.rect(8, 62, 47, 6, C.mist2);
  p.hline(8, 54, 62, C.white);
  const patches = [C.red2, C.wood1, C.leaf3, C.blue2, C.blond2, C.teal3];
  for (let y = 60; y < 72; y++) {
    for (let x = 20; x < 55; x++) {
      const c = patches[(Math.floor((x - 20) / 6) + Math.floor((y - 60) / 4) * 2) % patches.length];
      p.set(x, y, y === 60 ? nearest(mix(c, C.white, 0.25)) : (x - 20) % 6 === 0 || (y - 60) % 4 === 0 ? nearest(mix(c, C.ink, 0.25)) : c);
    }
  }
  p.hline(20, 54, 71, C.wood4);
  p.rect(9, 57, 10, 5, C.white);
  p.hline(9, 18, 61, C.mist1);
  p.rect(8, 72, 47, 3, C.wood2);
  p.hline(8, 54, 72, C.wood1);
  p.rect(9, 75, 2, 5, C.wood3);
  p.rect(51, 75, 2, 5, C.wood3);
  // 책상
  table(p, 104, 62, 44, OLD_WOOD);
  for (const [y, c] of [[59, C.blue2], [57, C.red2], [55, C.leaf3]] as [number, number][]) {
    p.rect(108, y, 10, 2, c);
    p.vline(117, y, y + 1, C.mist2);
  }
  p.rect(121, 59, 13, 3, C.white);
  p.vline(127, 59, 61, C.mist1);
  p.hline(122, 126, 60, C.mist0);
  p.rect(136, 59, 3, 3, C.ink);
  p.line(138, 58, 141, 52, C.white);
  // 의자
  p.rect(117, 72, 13, 2, C.wood1);
  p.vline(118, 74, 84, C.wood3);
  p.vline(128, 74, 84, C.wood3);
  p.rect(126, 58, 2, 14, C.wood2);
  // 선반과 쪽지
  p.rect(108, 38, 30, 2, C.wood1);
  p.hline(108, 137, 40, C.wood4);
  p.rect(111, 33, 4, 5, C.teal2);
  p.set(112, 34, C.teal0);
  p.rect(117, 34, 4, 4, C.gold3);
  p.rect(123, 32, 3, 6, C.leaf3);
  p.rect(129, 34, 6, 4, C.wood0);
  p.rect(140, 42, 10, 13, C.mist2);
  for (let y = 45; y < 54; y += 2) p.hline(142, 147, y, C.mist0);
  p.set(145, 42, C.red1);
  // 대들보와 말린 약초
  p.rect(0, 10, W, 4, C.wood2);
  p.hline(0, W - 1, 10, C.wood1);
  p.hline(0, W - 1, 14, C.wood4);
  herbs(p, 22, 14, RAMP.greenCloth);
  herbs(p, 31, 14, RAMP.lilac);
  herbs(p, 40, 14, RAMP.sage);
  herbs(p, 124, 14, RAMP.greenCloth);
  sunbeam(p, [[70, 40], [90, 40], [98, 88], [56, 88]], tod);
  ambient(p, tod);
  if (tod === 'night' || tod === 'dusk') {
    warm(p, 142.5, 55, 40, tod === 'night' ? 0.55 : 0.35);
  }
  candle(p, 142, 58);
};

const mine: SceneFn = (p, tod) => {
  const vx = 94;
  const vy = 40;
  const SX = 84;
  const SY = 46;
  const END = 6.5;
  const rock = vnoise(31);
  const grit = vnoise(32);
  const fogOf = (z: number) => Math.min(1, Math.max(0, (z - 1) / 5.2));
  const shade = (c: number, z: number) => nearest(mix(c, C.ink, fogOf(z) * 0.85));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - vx) / SX;
      const dy = (y + 0.5 - vy) / SY;
      let z: number;
      let isFloor = false;
      if (dy < 0) z = 1 / Math.pow(Math.pow(Math.abs(dx), 2.4) + Math.pow(Math.abs(dy) / 0.9, 2.4), 1 / 2.4);
      else {
        const zw = 1 / Math.max(1e-6, Math.abs(dx));
        const zf = 1 / Math.max(1e-6, dy);
        isFloor = zf < zw;
        z = Math.min(zw, zf);
      }
      if (z > END) {
        p.set(x, y, -2);
        continue;
      }
      let c: number;
      if (isFloor) {
        const X = dx * z;
        const g = grit(X * 9, z * 5);
        c = g > 0.72 ? C.wood2 : g > 0.32 ? C.wood3 : C.wood4;
      } else {
        const a = Math.atan2(dy, dx);
        const n = rock(a * 7, z * 2.2) * 0.7 + grit(a * 22, z * 7) * 0.3;
        c = n > 0.68 ? C.wood2 : n > 0.5 ? C.tan3 : n > 0.3 ? C.wood3 : n > 0.16 ? C.wood4 : C.night1;
      }
      p.set(x, y, shade(c, z));
    }
  }
  // 바깥으로 이어지는 입구 (시간대)
  const ox = vx - SX / END;
  const oy = vy - (SY * 0.9) / END;
  const ow = (2 * SX) / END;
  const oh = SY / END + (SY * 0.9) / END;
  within(p, (_x, _y, before) => before === -2, () => {
    sky(p, tod, Math.ceil(oh), Math.floor(ox), Math.floor(oy), Math.ceil(ow) + 1);
    ridge(p, 5, vy + 3, 3, tod === 'night' ? C.night1 : C.leaf3, 6, vy + 10);
    if (tod === 'night') stars(p, 3, 10, vy, Math.floor(ox), Math.ceil(ox + ow));
  });
  for (let i = 0; i < p.data.length; i++) if (p.data[i] === -2) p.data[i] = C.ink;
  if (tod !== 'night') light(p, vx, vy, 30, SKY[tod][SKY[tod].length - 1], 0.35, 0.7);
  // 레일과 침목
  const at = (X: number, Y: number, z: number): [number, number] => [vx + (SX * X) / z, vy + (SY * Y) / z];
  for (const z of [1.08, 1.32, 1.62, 2, 2.5, 3.1, 3.9, 4.9]) {
    const [x0, y0] = at(-0.46, 1, z);
    const [x1] = at(0.46, 1, z);
    p.rect(Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.max(1, Math.round(2.4 / z)), shade(C.wood2, z));
  }
  for (const X of [-0.32, 0.32]) {
    const [a0, b0] = at(X, 1, 0.98);
    const [a1, b1] = at(X, 1, END);
    p.line(a0, b0, a1, b1, C.slate2);
    p.line(a0 + Math.sign(X), b0, a1, b1, C.slate1);
  }
  // 버팀목 (멀리서부터)
  for (const z of [4.4, 3.0, 2.0, 1.25]) {
    const s = 1 / z;
    const post = Math.max(1, Math.round(10 * s));
    const [lx, top] = at(-0.88, -0.74, z);
    const [rx] = at(0.88, -0.74, z);
    const [, bot] = at(0, 1, z);
    const cap = Math.max(2, Math.round(9 * s));
    const lit = (c: number) => shade(c, z * 0.9);
    for (const px of [lx - post, rx]) {
      p.rect(Math.round(px), Math.round(top), post, Math.round(bot - top), lit(C.wood2));
      p.vline(Math.round(px), Math.round(top), Math.round(bot) - 1, lit(C.wood1));
      p.vline(Math.round(px) + post - 1, Math.round(top), Math.round(bot) - 1, lit(C.wood3));
    }
    p.rect(Math.round(lx - post - 2 * s), Math.round(top - cap), Math.round(rx - lx + 2 * post + 4 * s), cap, lit(C.wood2));
    p.hline(Math.round(lx - post - 2 * s), Math.round(rx + post + 2 * s), Math.round(top - cap), lit(C.wood1));
    p.hline(Math.round(lx - post - 2 * s), Math.round(rx + post + 2 * s), Math.round(top) - 1, lit(C.wood4));
    // 버팀대
    const br = 14 * s;
    p.line(lx, top + br, lx + br, top, lit(C.wood3));
    p.line(rx, top + br, rx - br, top, lit(C.wood3));
  }
  // 광차
  {
    const z = 2.5;
    const [cx, cy] = at(0, 1, z);
    const hw = (SX * 0.42) / z;
    const h = (SY * 0.5) / z;
    p.poly([[cx - hw - 2, cy - h - 2], [cx + hw + 2, cy - h - 2], [cx + hw - 1, cy - 2], [cx - hw + 1, cy - 2]], shade(C.wood2, z));
    p.hline(Math.round(cx - hw - 2), Math.round(cx + hw + 1), Math.round(cy - h - 2), shade(C.wood1, z));
    p.hline(Math.round(cx - hw), Math.round(cx + hw), Math.round(cy - h / 2 - 1), shade(C.slate1, z));
    for (const ex of [-hw * 0.55, hw * 0.55]) p.ellipse(cx + ex, cy - 2, 2.2, 2.2, C.ink);
    for (let i = 0; i < 6; i++) p.ellipse(cx - hw + 3 + i * ((2 * hw - 4) / 5), cy - h - 3, 2, 1.6, shade(i % 2 ? C.slate1 : C.slate0, z));
  }
  // 곡괭이와 돌
  p.line(22, 84, 31, 62, C.wood1);
  p.line(23, 84, 32, 62, C.wood2);
  p.line(26, 60, 36, 63, C.mist0);
  p.line(26, 61, 35, 64, C.slate2);
  for (const [x, y, r] of [[48, 84, 3], [54, 86, 2], [140, 82, 4], [130, 86, 2.5], [70, 70, 1.6]] as [number, number, number][]) {
    p.ellipse(x, y, r * 1.3, r * 0.8, (px, py) => (py < y - r * 0.2 ? C.slate1 : C.slate0));
  }
  ambient(p, tod, 0.8);
  // 랜턴 (첫 버팀목 대들보에 걸림)
  const [lx0, ly0] = at(-0.6, -0.74, 1.25);
  const lx = Math.round(lx0 + 6);
  const ly = Math.round(ly0) + 7;
  warm(p, lx + 2, ly + 3, 54, 0.6);
  p.vline(lx + 2, Math.round(ly0) - 1, ly - 2, C.slate0);
  lanternBody(p, lx, ly);
  // 반짝이는 광석
  const ores: [number, number, Ramp, number][] = [
    [140, 52, [C.teal0, C.teal1, C.teal2, C.teal3], 4],
    [148, 28, [C.violet0, C.violet1, C.violet2, C.violet3], 3],
    [12, 58, [C.violet0, C.violet1, C.violet2, C.violet3], 3],
    [118, 33, [C.teal0, C.teal1, C.teal2, C.teal3], 2],
    [64, 20, [C.gold0, C.gold1, C.gold2, C.gold3], 2],
  ];
  ores.forEach(([x, y, ramp, n], i) => {
    light(p, x, y - 2, 6 + n * 2, ramp[2], 0.5);
    crystals(p, x, y, ramp, 40 + i, n);
  });
  sparkle(p, 141, 46);
  sparkle(p, 13, 53, C.white, C.violet1);
  sparkle(p, 65, 17, C.white, C.gold1);
  const r = rng(12);
  for (let i = 0; i < 10; i++) p.set(100 + Math.floor(r() * 56), 14 + Math.floor(r() * 50), C.gold1);
};

const bookshop: SceneFn = (p, tod) => {
  p.fill(C.wood4);
  // 거리 쪽 창 (건너편 건물)
  win(p, 7, 10, 30, 32, tod, 3, 4, RAMP.brownCloth, () => {
    const night = tod === 'night';
    const r = rng(5);
    for (const [x, w, h] of [[5, 12, 18], [17, 9, 24], [26, 14, 15]] as [number, number, number][]) {
      p.rect(x, 42 - h, w, h, night ? C.night0 : C.mist1);
      p.poly([[x - 1, 42 - h], [x + w / 2, 42 - h - 5], [x + w, 42 - h]], night ? C.ink : C.red2);
      for (let wy = 42 - h + 3; wy < 40; wy += 5) for (let wx = x + 2; wx < x + w - 2; wx += 4) p.rect(wx, wy, 2, 2, night ? (r() < 0.5 ? C.gold1 : C.night0) : C.slate1);
    }
  });
  shelf(p, 4, 49, 36, 17, 44);
  shelf(p, 43, 0, 38, 66, 41);
  shelf(p, 81, 0, 38, 66, 42);
  shelf(p, 119, 0, 41, 66, 43);
  // 서가 위로 넘치는 책
  for (const [x, n, s] of [[46, 2, 1], [90, 3, 2], [128, 2, 3]] as [number, number, number][]) bookPile(p, x, 2, n, s);
  // 사다리
  for (let y = 4; y < 66; y += 6) p.line(92 + y / 8.25, y, 99 + y / 8.25, y, C.wood1);
  for (const x0 of [92, 99]) {
    p.line(x0, 0, x0 + 8, 66, C.wood0);
    p.line(x0 + 1, 0, x0 + 9, 66, C.wood2);
  }
  floor(p, 66, OLD_WOOD);
  // 바닥에 쌓인 책
  bookPile(p, 4, 89, 9, 11);
  bookPile(p, 22, 86, 6, 12);
  bookPile(p, 40, 90, 12, 13);
  bookPile(p, 62, 80, 4, 14);
  // 계산대
  p.rect(96, 56, 64, 3, C.wood1);
  p.hline(96, 159, 56, C.wood0);
  p.rect(98, 59, 62, 31, C.wood2);
  for (let x = 102; x < 160; x += 18) {
    p.frame(x, 63, 14, 22, C.wood3);
    p.hline(x + 1, x + 12, 64, C.wood1);
  }
  // 졸고 있는 주인 (턱을 괴고)
  p.sprite(119, 40, [
    '...ssss.....',
    '..sssssS....',
    '.hssssssh...',
    '.hk-sk-sh...',
    '.hsssSssh...',
    '..wwwwww....',
    '.wwwwwwww...',
    'vvwwwwwwvv..',
    'vvvwwwwvvvV.',
    'vvvvwwvvvvVV',
    'vvvvvvvvvvVV',
    'aaaaaaaaaaaa',
    'AAAAAAAAAAAA',
  ], { s: C.skin1, S: C.skin2, h: C.mist2, k: C.gold2, '-': C.wood3, w: C.white, v: C.leaf3, V: C.leaf4, a: C.mist2, A: C.mist1 });
  p.rect(110, 52, 10, 3, C.white);
  p.vline(114, 52, 54, C.mist1);
  // 계산대 위의 고양이
  p.sprite(134, 50, ['a.a.......', 'aaa..aaaa.', 'akaaaaaaab', 'aaaaaaaaab', '.cccccccc.'], { a: RAMP.orange[1], b: RAMP.orange[0], c: RAMP.orange[2], k: RAMP.orange[3] });
  p.vline(117, 52, 54, C.mist1);
  p.rect(148, 51, 10, 3, C.blue2);
  p.rect(149, 48, 9, 3, C.red2);
  p.rect(148, 45, 10, 3, C.leaf3);
  for (const y of [52, 49, 46]) p.vline(157, y, y + 1, C.mist2);
  sunbeam(p, [[7, 44], [37, 44], [80, 90], [28, 90]], tod);
  ambient(p, tod);
  // 기름 등잔
  if (tod !== 'day') warm(p, 104.5, 50, tod === 'night' ? 56 : 30, tod === 'night' ? 0.6 : 0.35);
  p.rect(102, 54, 6, 2, C.gold3);
  p.rect(103, 53, 4, 1, C.gold2);
  p.ellipse(105, 50, 2, 3, (_x, y) => (y < 49 ? C.gold0 : C.gold1));
  p.set(105, 49, C.white);
  zz(p, 130, 36, false, C.mist2);
  zz(p, 134, 30, true, C.white);
  const r = rng(77);
  if (tod !== 'night') for (let i = 0; i < 10; i++) p.set(20 + Math.floor(r() * 40), 46 + Math.floor(r() * 36), C.gold0);
};

const back_alley: SceneFn = (p, tod) => {
  const vx = 78;
  const vy = 50;
  const F = 80;
  const E = 1;
  const SEG = 3.1;
  const ZEND = 12.4;
  const Z2 = 15;
  const night = tod === 'night';
  const tops = [
    [4.4, 3.4, 5.1, 3.8, 4.6],
    [3.7, 4.9, 3.3, 4.5, 3.9],
  ];
  const plaster = [
    [C.mist0, C.tan0, C.mist1, C.wood0, C.mist0],
    [C.wood0, C.mist1, C.tan0, C.mist0, C.wood0],
  ];
  const fogC = night ? C.night0 : nearest(mix(SKY[tod][SKY[tod].length - 1], C.slate1, 0.5));
  const lit = rng(4);
  const litWin = Array.from({ length: 40 }, () => lit() < 0.45);
  const wet = vnoise(8);
  const stone = vnoise(9);
  const puddle = new Uint8Array(W * H);
  sky(p, tod, 40);
  if (night) stars(p, 5, 30, 34, 50, 110);
  clouds(p, 3, tod, 20, 2);

  const stain = vnoise(10);
  const facade = (side: number, z: number, Y: number, idx: number): number => {
    const local = z - idx * SEG;
    const f = local / SEG;
    const top = tops[side][idx];
    if (Y > top - 0.18) return C.wood4;
    if (Y < -0.62) {
      const row = Math.floor((Y + 1) / 0.19);
      const brick = Math.floor(z / 0.45 + (row % 2) * 0.5);
      return (Y + 1) % 0.19 < 0.035 ? C.slate0 : brick % 3 === 0 ? C.slate1 : C.slate2;
    }
    if (Y > -0.62 && Y < -0.55) return C.slate0;
    // 기둥과 들보 (반목조)
    if (f < 0.04 || f > 0.97 || Math.abs(f - 0.5) < 0.018) return C.wood3;
    const beamA = Y > 1.25 && Y < 1.42;
    const beamB = Y > 2.75 && Y < 2.92 && top > 3.1;
    if (beamA || beamB) return C.wood3;
    // 문
    const door = (side === 0 && idx === 1) || (side === 1 && idx === 0) || (side === 1 && idx === 2);
    if (door && f > 0.62 && f < 0.88 && Y < 0.75) {
      if (f < 0.65 || f > 0.85 || Y > 0.68) return C.wood4;
      return Math.floor(f * 60) % 2 ? C.wood2 : C.wood3;
    }
    // 1층 덧창 달린 창
    const wa = idx === 0 ? 0.4 : 0.12;
    if (!door && idx < 3 && f > wa && f < wa + 0.24 && Y > -0.15 && Y < 0.75) {
      if (f < wa + 0.025 || f > wa + 0.215 || Y < -0.1 || Y > 0.7) return C.wood3;
      if (Math.abs(f - wa - 0.12) < 0.008 || Math.abs(Y - 0.3) < 0.03) return C.wood3;
      return night && litWin[side * 7 + idx] ? C.gold2 : C.night1;
    }
    // 위층 창
    for (const [y0, y1] of [[1.75, 2.45], [3.2, 3.85]]) {
      if (Y > y0 && Y < y1 && y1 < top - 0.2) {
        for (const [a, b] of [[0.14, 0.34], [0.64, 0.84]]) {
          if (f > a && f < b) {
            const on = night && litWin[side * 20 + idx * 4 + (y0 > 2 ? 2 : 0) + (a > 0.5 ? 1 : 0)];
            if (f < a + 0.025 || f > b - 0.025 || Y < y0 + 0.06 || Y > y1 - 0.06) return C.wood3;
            return on ? (Y > (y0 + y1) / 2 ? C.gold1 : C.gold2) : Y > (y0 + y1) / 2 ? C.slate0 : C.night1;
          }
        }
      }
    }
    const c = plaster[side][idx];
    const n = stain(z * 4, Y * 4);
    if (n > 0.76 && z > 2.2) {
      const row = Math.floor(Y / 0.19);
      return (Y % 0.19) < 0.04 || Math.floor(z / 0.45 + (row % 2) * 0.5) % 4 === 0 ? C.wood3 : C.ember2;
    }
    return n < 0.3 && z > 3 ? nearest(mix(c, C.slate1, 0.25)) : Y < -0.3 + n * 0.3 ? nearest(mix(c, C.slate0, 0.2)) : c;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ddx = (x + 0.5 - vx) / F;
      const ddy = (y + 0.5 - vy) / F;
      const zw = 1 / Math.max(1e-6, Math.abs(ddx));
      const zf = ddy > 0 ? E / ddy : Infinity;
      const side = ddx < 0 ? 0 : 1;
      let c = -1;
      let z = 0;
      if (zf < Math.min(zw, Z2)) {
        z = zf;
        const X = ddx * z;
        const u = X * 3.4 + (Math.floor(z * 2.4) % 2) * 0.5;
        const v = z * 2.4;
        const fu = u - Math.floor(u);
        const fv = v - Math.floor(v);
        const pxU = F / z / 3.4;
        const pxV = (F * E) / (z * z) / 2.4;
        const s = stone(Math.floor(u) * 1.7, Math.floor(v) * 1.3);
        c = s > 0.62 ? C.mist0 : s > 0.35 ? C.slate2 : C.slate1;
        if ((fu * pxU < 1 && pxU > 2.5) || (fv * pxV < 1 && pxV > 2)) c = C.slate0;
        if (Math.abs(X) < 0.07) c = C.night1;
        if ((wet(X * 2.2, z * 0.8) > 0.64 && z > 2.6) || Math.abs(X) < 0.1) {
          puddle[y * W + x] = 1;
          c = night ? C.night1 : nearest(mix(C.slate0, SKY[tod][1], 0.35));
        }
      } else if (zw < ZEND) {
        z = zw;
        const Y = -ddy * z;
        const idx = Math.min(4, Math.floor(z / SEG));
        if (Y <= tops[side][idx]) c = facade(side, z, Y, idx);
        else {
          // 뒤쪽의 더 높은 집 옆면
          for (let k = idx + 1; k < 5 && c < 0; k++) {
            const zk = k * SEG;
            const Yk = -ddy * zk;
            if (Yk <= tops[side][k] && Yk > tops[side][k - 1]) c = Yk > tops[side][k] - 0.18 ? C.wood4 : nearest(mix(plaster[side][k], C.slate1, 0.45));
            z = zk;
          }
        }
      } else {
        z = Z2;
        const X = ddx * z;
        const Y = -ddy * z;
        if (Y < 2.6 + (Math.abs(X) > 2.5 ? 0.8 : 0)) {
          c = C.mist1;
          if (Math.abs(X - 0.3) < 0.55 && Y < 0.6) c = night ? C.gold2 : C.wood3;
          if (Math.abs(X + 2.2) < 0.4 && Y > 1 && Y < 1.8) c = night ? C.gold1 : C.slate1;
          if (Y > 2.4) c = C.wood4;
        }
      }
      if (c < 0) continue;
      const fog = Math.min(0.75, Math.max(0, (z - 1.5) / 13));
      p.set(x, y, nearest(mix(mix(c, C.slate0, 0.22), fogC, fog)));
    }
  }
  // 빨랫줄
  const P = proj(vx, vy, F);
  const [l0x, l0y] = P(-1, 2.3, 6.4);
  const [l1x, l1y] = P(1, 2.5, 6.4);
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    p.set(l0x + (l1x - l0x) * t, l0y + (l1y - l0y) * t + Math.sin(t * Math.PI) * 3, C.slate0);
  }
  for (const [t, c, w, h] of [[0.2, C.white, 3, 4], [0.38, C.red2, 4, 3], [0.6, C.sky1, 3, 5], [0.78, C.mist2, 2, 3]] as [number, number, number, number][]) {
    const x = Math.round(l0x + (l1x - l0x) * t);
    const y = Math.round(l0y + (l1y - l0y) * t + Math.sin(t * Math.PI) * 3) + 1;
    p.rect(x, y, w, h, c);
    p.hline(x, x + w - 1, y + h - 1, nearest(mix(c, C.ink, 0.3)));
  }
  // 간판
  const [sx, sy] = P(-1, 1.05, 4.0);
  p.hline(Math.round(sx), Math.round(sx) + 6, Math.round(sy), C.slate0);
  p.rect(Math.round(sx) + 1, Math.round(sy) + 2, 7, 6, C.wood2);
  p.frame(Math.round(sx) + 1, Math.round(sy) + 2, 7, 6, C.wood3);
  p.rect(Math.round(sx) + 3, Math.round(sy) + 4, 3, 2, C.gold2);
  p.vline(Math.round(sx) + 2, Math.round(sy), Math.round(sy) + 2, C.slate0);
  p.vline(Math.round(sx) + 6, Math.round(sy), Math.round(sy) + 2, C.slate0);
  // 상자와 통
  p.rect(26, 66, 18, 14, C.wood2);
  p.frame(26, 66, 18, 14, C.wood3);
  p.line(27, 67, 42, 78, C.wood3);
  p.hline(26, 43, 66, C.wood1);
  p.rect(30, 56, 12, 10, C.wood1);
  p.frame(30, 56, 12, 10, C.wood3);
  p.hline(30, 41, 56, C.wood0);
  p.ellipse(52, 71, 6, 8, (x) => (x < 50 ? C.wood1 : x > 54 ? C.wood3 : C.wood2));
  p.hline(46, 57, 66, C.slate1);
  p.hline(46, 57, 75, C.slate1);
  p.ellipse(52, 63.5, 5, 1.5, C.wood3);
  // 상자 위 고양이 (실루엣)
  p.sprite(32, 50, ['k...k...', 'kk.kk...', 'kkkkk..k', '.kkkkk.k', '.kkkkkkk', '.kkkkkk.'], { k: C.ink });
  p.set(33, 52, C.gold1);
  // 골목 끝의 그림자
  figure(p, 75, 45, C.ink, C.violet4, { pants: C.ink });
  p.rect(75, 44, 7, 2, C.violet4);
  ambient(p, tod);
  // 벽 등불과 젖은 바닥의 반사
  const [lx, ly] = P(1, 0.62, 3.3);
  const lampX = Math.round(lx) - 6;
  const lampY = Math.round(ly);
  const strength = night ? 0.62 : tod === 'dusk' ? 0.42 : 0.18;
  warm(p, lampX + 2, lampY + 3, night ? 50 : 34, strength);
  const gr = rng(41);
  for (let y = 56; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!puddle[y * W + x]) continue;
      // 물웅덩이 가장자리 반짝임
      if (!puddle[(y - 1) * W + x] && bayer(x, y) < 8) p.set(x, y, night ? C.slate1 : C.mist2);
    }
    if (tod === 'day' || y % 2) continue;
    const spread = 1 + (y - 56) * 0.18;
    const cx = lampX + 2 + (gr() - 0.5) * spread;
    const len = 1 + Math.floor(gr() * 3);
    for (let x = Math.round(cx - len); x <= Math.round(cx + len); x++) if (puddle[y * W + x]) p.set(x, y, gr() < 0.5 ? C.gold1 : C.gold2);
  }
  p.hline(lampX + 2, Math.round(lx), lampY - 2, C.slate0);
  p.vline(Math.round(lx), lampY - 3, lampY, C.slate0);
  lanternBody(p, lampX, lampY);
};

const magic_lab: SceneFn = (p, tod) => {
  bricks(p, 0, 0, W, 60, [C.mist0, C.slate2, C.slate1, C.slate0], 10, 5);
  // 둥근 창
  const wx = 80;
  const wy = 22;
  const wr = 15;
  p.ellipse(wx, wy, wr + 3, wr + 3, C.slate1);
  p.ellipse(wx, wy, wr + 2, wr + 2, C.mist1);
  within(p, (x, y) => Math.hypot(x + 0.5 - wx, y + 0.5 - wy) < wr, () => {
    sky(p, tod, wr * 2, wx - wr, wy - wr, wr * 2);
    if (tod === 'night') {
      stars(p, 21, 18, wy + wr, wx - wr, wx + wr);
      moon(p, wx + 6, wy - 6, 3);
    }
  });
  ring(p, wx, wy, wr, wr, C.slate0);
  ring(p, wx, wy, wr * 0.45, wr * 0.45, C.slate0);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    p.line(wx + Math.cos(a) * wr * 0.45, wy + Math.sin(a) * wr * 0.45, wx + Math.cos(a) * wr, wy + Math.sin(a) * wr, C.slate1);
  }
  // 바닥
  tileFloor(p, 60, 80, 40, 80, 1.2, 0.7, (i, j) => ((i + j) % 2 ? C.slate1 : C.slate0), C.night1);
  p.hline(0, W - 1, 60, C.slate0);
  // 선반의 약병
  for (const y of [22, 36, 50]) {
    p.rect(116, y, 42, 2, C.wood1);
    p.hline(116, 157, y + 2, C.wood3);
  }
  p.rect(116, 10, 2, 42, C.wood2);
  p.rect(156, 10, 2, 42, C.wood2);
  const liquids = [C.red1, C.leaf1, C.teal1, C.violet1, C.gold1, C.pink1, C.sky1];
  const rr = rng(17);
  for (const y of [22, 36, 50]) {
    for (let x = 120; x < 152; x += 6) {
      const liq = liquids[Math.floor(rr() * liquids.length)];
      if (rr() < 0.5) flask(p, x + 1, y, liq, 2);
      else bottle(p, x, y, liq, 4 + Math.floor(rr() * 3));
    }
  }
  // 작업대
  table(p, 4, 58, 48);
  p.rect(10, 50, 9, 8, C.wood3);
  p.rect(10, 50, 9, 2, C.violet3);
  p.rect(11, 52, 7, 5, C.mist2);
  flask(p, 26, 58, C.leaf1, 4);
  p.line(27, 48, 36, 44, C.mist1);
  p.line(36, 44, 40, 50, C.mist1);
  flask(p, 41, 58, C.teal1, 3);
  p.rect(44, 54, 5, 4, C.slate1);
  p.line(46, 54, 49, 50, C.wood1);
  // 혼천의
  p.vline(22, 30, 40, C.gold3);
  ring(p, 22, 28, 5, 5, C.gold2);
  ring(p, 22, 28, 5, 2, C.gold1);
  p.set(22, 28, C.sky1);
  p.rect(19, 40, 7, 2, C.gold3);
  // 독서대와 마도서
  p.rect(134, 66, 3, 18, C.wood2);
  p.vline(134, 66, 83, C.wood1);
  p.rect(129, 83, 13, 3, C.wood3);
  p.hline(129, 141, 83, C.wood2);
  p.poly([[124, 62], [147, 62], [145, 67], [126, 67]], C.wood3);
  p.hline(124, 146, 62, C.wood1);
  p.rect(126, 58, 9, 5, C.white);
  p.rect(136, 58, 9, 5, C.mist2);
  p.vline(135, 57, 62, C.wood4);
  p.hline(126, 134, 57, C.mist1);
  p.hline(136, 144, 57, C.mist1);
  for (const y of [59, 61]) {
    p.hline(127, 133, y, C.violet2);
    p.hline(137, 143, y, C.violet2);
  }
  ambient(p, tod, tod === 'night' ? 0.9 : 1);
  // 마법진
  const cx = 74;
  const cy = 74;
  const rx = 34;
  const ry = 9;
  light(p, cx, cy, 64, C.violet2, 0.55, 0.36);
  light(p, cx, cy, 40, C.violet1, 0.4, 0.3);
  for (let y = 30; y < cy; y++) {
    const t = (y - 30) / (cy - 30);
    const hw = rx * (0.5 + 0.5 * t);
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      if (bayer(x, y) < t * 3 && (x + y) % 3 === 0) p.set(x, y, nearest(mix(p.get(x, y), C.violet1, 0.5)));
    }
  }
  ring(p, cx, cy, rx + 0.6, ry + 0.3, C.violet2);
  ring(p, cx, cy, rx, ry, C.violet1);
  ring(p, cx, cy, rx - 3, ry - 0.8, C.violet0);
  ring(p, cx, cy, rx * 0.55, ry * 0.55, C.teal0);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const [x0, y0] = onEllipse(cx, cy, rx - 1.6, ry - 0.4, a);
    if (k % 2 === 0) p.set(x0, y0, C.white);
    else p.set(x0, y0, C.violet1);
  }
  for (const off of [0, Math.PI / 3]) {
    const pts = [0, 1, 2].map((i) => onEllipse(cx, cy, rx - 3, ry - 0.8, off - Math.PI / 2 + (i * Math.PI * 2) / 3));
    for (let i = 0; i < 3; i++) p.line(pts[i][0], pts[i][1], pts[(i + 1) % 3][0], pts[(i + 1) % 3][1], C.violet1);
  }
  p.ellipse(cx, cy, 3, 1.2, C.white);
  // 떠오르는 빛
  const fr = rng(23);
  for (let i = 0; i < 16; i++) {
    const x = cx - 26 + fr() * 52;
    const y = cy - 6 - fr() * 34;
    p.set(x, y, fr() < 0.5 ? C.violet0 : C.violet1);
  }
  for (const [x, y, c] of [[52, 46, C.teal0], [96, 40, C.violet0], [64, 34, C.white], [104, 58, C.teal0], [42, 60, C.violet0]] as [number, number, number][]) {
    light(p, x, y, 7, C.violet1, 0.5);
    sparkle(p, x, y, c, C.violet1);
  }
  // 주문을 외는 학생
  figure(p, 98, 56, C.blond1, C.violet3, { flip: true, pants: C.violet4 });
  p.set(98, 59, C.violet3);
  p.set(97, 58, C.skin1);
  light(p, 97, 57, 5, C.violet0, 0.6);
  // 촛불과 빛나는 약
  for (const [x, y] of [[8, 47], [48, 51]] as [number, number][]) {
    if (tod !== 'day') warm(p, x + 1, y - 1, 18, 0.45);
    candle(p, x, y);
  }
  light(p, 26, 54, 8, C.leaf1, 0.4);
  light(p, 41, 55, 7, C.teal1, 0.4);
};

const chapel: SceneFn = (p, tod) => {
  const vx = 80;
  const vy = 30;
  const F = 70;
  const E = 2.1;
  const RW = 3;
  const ZB = 7;
  const P = proj(vx, vy, F);
  const [bx0, by] = P(-RW, -E, ZB);
  const [bx1] = P(RW, -E, ZB);
  // 옆벽 (돌 줄눈과 기둥)
  p.fill(C.mist0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x >= bx0 && x < bx1) continue;
      const z = (F * RW) / Math.abs(x + 0.5 - vx);
      const Y = (-(y + 0.5 - vy) * z) / F;
      const row = Math.floor((Y + E) / 0.55);
      const blk = Math.floor(z / 0.5 + (row % 2) * 0.5);
      const pxRow = (F * 0.55) / z;
      let c: number = blk % 3 === 0 ? C.mist1 : C.mist0;
      if (((Y + E) % 0.55) * (F / z) < 1 && pxRow > 3) c = C.slate2;
      p.set(x, y, c);
    }
  }
  // 옆벽 스테인드글라스
  const glass = [C.blue1, C.red1, C.gold1, C.blue2, C.leaf2, C.violet2];
  for (const side of [-1, 1]) {
    for (const z0 of [3.2, 5.0]) {
      const z1 = z0 + 0.9;
      const a = P(side * RW, -0.4, z0);
      const b = P(side * RW, -0.4, z1);
      const c = P(side * RW, 3.0, z1);
      const d = P(side * RW, 3.0, z0);
      const e = P(side * RW, 3.6, (z0 + z1) / 2);
      p.poly([a, b, c, e, d], C.slate1);
      const inner = (t: number) => z0 + 0.12 + t * (z1 - z0 - 0.24);
      p.poly([P(side * RW, -0.25, inner(0)), P(side * RW, -0.25, inner(1)), P(side * RW, 2.9, inner(1)), P(side * RW, 3.35, inner(0.5)), P(side * RW, 2.9, inner(0))], (x, y) => {
        const z = (F * RW) / Math.abs(x + 0.5 - vx);
        const Y = (-(y + 0.5 - vy) * z) / F;
        const i = Math.floor(((z - z0) / (z1 - z0)) * 3);
        const j = Math.floor(Y / 0.6);
        return tod === 'night' ? (bayer(x, y) < 4 ? C.slate2 : C.slate1) : glass[(i * 3 + j * 2 + (side > 0 ? 1 : 0)) % glass.length];
      });
    }
    // 기둥
    for (const z of [2.9, 4.4, 6.2]) {
      const [x0, y0] = P(side * RW, -E, z);
      const w = Math.max(2, Math.round(28 / z));
      const xl = side < 0 ? Math.round(x0) : Math.round(x0) - w;
      p.rect(xl, 0, w, Math.round(y0), C.mist1);
      p.vline(side < 0 ? xl + w - 1 : xl, 0, Math.round(y0) - 1, C.white);
      p.vline(side < 0 ? xl : xl + w - 1, 0, Math.round(y0) - 1, C.slate2);
      p.rect(xl - 1, Math.round(y0) - 3, w + 2, 3, C.mist0);
    }
  }
  // 뒷벽과 큰 창
  p.rect(bx0, 0, bx1 - bx0, by, C.mist1);
  p.vline(bx0, 0, by, C.slate2);
  p.vline(bx1 - 1, 0, by, C.slate2);
  const gx = 68;
  const gw = 24;
  const gy = 4;
  const gh = 32;
  p.rect(gx - 2, gy + 6, gw + 4, gh - 4, C.slate1);
  p.ellipse(gx + gw / 2, gy + 10, gw / 2 + 2, 12, C.slate1);
  within(p, (x, y) => x > gx && x < gx + gw - 1 && y < gy + gh && (y >= gy + 10 || Math.hypot((x + 0.5 - gx - gw / 2) / (gw / 2), (y + 0.5 - gy - 10) / 10) < 1), () => {
    for (let y = 0; y < 50; y++) {
      for (let x = gx; x < gx + gw; x++) {
        const d = Math.hypot(x + 0.5 - (gx + gw / 2), (y + 0.5 - (gy + 12)) * 0.9);
        const rings = [C.gold0, C.gold1, C.red1, C.blue1, C.blue2, C.violet2, C.blue1];
        let c: number = rings[Math.min(rings.length - 1, Math.floor(d / 2.6))];
        const ang = Math.atan2(y - (gy + 12), x - (gx + gw / 2));
        if (Math.abs(((ang * 8) / Math.PI) % 2) < 0.18 && d > 3) c = C.slate0;
        if (Math.abs(d % 2.6) < 0.45 && d > 2) c = C.slate0;
        if (y > gy + 24) c = (Math.floor(x / 4) + Math.floor(y / 4)) % 3 === 0 ? C.red2 : (Math.floor(x / 4) + Math.floor(y / 4)) % 3 === 1 ? C.blue2 : C.leaf2;
        if (y > gy + 24 && (x % 4 === 0 || y % 4 === 0)) c = C.slate0;
        p.set(x, y, tod === 'night' ? nearest(mix(c, C.night1, 0.6)) : tod === 'dusk' ? nearest(mix(c, C.ember, 0.2)) : c);
      }
    }
  });
  p.vline(gx + gw / 2 - 0.5, gy + 1, gy + gh - 1, C.slate1);
  // 바닥과 통로
  tileFloor(p, Math.round(by), vx, vy, F, E, 0.75, (i, j) => ((i + j) % 2 ? C.mist1 : C.mist0), C.slate2);
  p.poly([P(-0.45, -E, ZB), P(0.45, -E, ZB), P(0.45, -E, 1.6), P(-0.45, -E, 1.6)], (x) => (x % 7 === 0 ? C.red3 : C.red2));
  for (const s of [-1, 1]) {
    const a = P(s * 0.45, -E, ZB);
    const b = P(s * 0.45, -E, 1.6);
    p.line(a[0], a[1], b[0], b[1], C.gold2);
  }
  // 제단
  p.rect(bx0 + 4, by - 3, bx1 - bx0 - 8, 3, C.mist2);
  p.hline(bx0 + 4, bx1 - 5, by - 3, C.white);
  p.rect(bx0 + 8, by - 6, bx1 - bx0 - 16, 3, C.mist2);
  p.hline(bx0 + 8, bx1 - 9, by - 6, C.white);
  p.rect(70, by - 15, 20, 9, C.white);
  p.rect(70, by - 15, 20, 2, C.gold2);
  p.rect(78, by - 13, 4, 7, C.red2);
  p.vline(80, by - 24, by - 16, C.gold1);
  p.hline(77, 83, by - 21, C.gold1);
  p.vline(79, by - 24, by - 16, C.gold2);
  // 긴 의자 (먼 줄부터) 와 앉은 사람들
  const pr = rng(6);
  const hairs = [C.wood2, C.blond1, C.ink, C.wood3, C.mist1, C.red2];
  for (const z of [6.0, 5.2, 4.4, 3.6, 2.8]) {
    for (const side of [-1, 1]) {
      const xIn = side * 0.55;
      const xOut = side * 2.75;
      const [ax, ay] = P(Math.min(xIn, xOut), -E + 0.95, z);
      const [bxx, byy] = P(Math.max(xIn, xOut), -E, z);
      // 앉은 사람 (머리와 어깨만 보인다)
      for (let k = 0; k < 3; k++) {
        if (pr() < 0.45) continue;
        const X = side * (0.85 + k * 0.7 + pr() * 0.2);
        const [hx, hy] = P(X, -E + 1.32, z + 0.3);
        backHead(p, hx, hy, hairs[Math.floor(pr() * hairs.length)], pr() < 0.5 ? C.blue2 : pr() < 0.5 ? C.wood3 : C.slate1, 3.2 / z);
      }
      const x0 = Math.round(ax);
      const x1 = Math.round(bxx);
      const y0 = Math.round(ay);
      const y1 = Math.round(byy);
      p.rect(x0, y0, x1 - x0, y1 - y0, C.wood2);
      p.hline(x0, x1 - 1, y0, C.wood0);
      p.hline(x0, x1 - 1, y0 + 1, C.wood1);
      p.hline(x0, x1 - 1, y1 - 1, C.wood4);
      const pw = Math.max(4, Math.round(24 / z));
      for (let x = x0 + pw; x < x1 - 2; x += pw) p.vline(x, y0 + 3, y1 - 3, C.wood3);
      const t = Math.max(2, Math.round(7 / z));
      const ex = side < 0 ? x1 - t : x0;
      p.rect(ex, y0 - 1, t, y1 - y0 + 1, C.wood3);
      p.hline(ex, ex + t - 1, y0 - 2, C.wood2);
      p.vline(side < 0 ? ex : ex + t - 1, y0 - 1, y1 - 1, C.wood4);
    }
  }
  // 빛줄기 (큰 창에서 통로로)
  if (tod !== 'night') sunbeam(p, [[gx + 2, gy + gh], [gx + gw - 2, gy + gh], [104, 90], [56, 90]], tod, 0.18);
  ambient(p, tod);
  // 촛대
  for (const x of [64, 96]) {
    p.rect(x, by - 12, 1, 12, C.gold3);
    p.rect(x - 1, by - 1, 3, 1, C.gold3);
    if (tod !== 'day') warm(p, x + 0.5, by - 15, tod === 'night' ? 28 : 18, tod === 'night' ? 0.5 : 0.3);
    candle(p, x, by - 16);
  }
};

/** 피어오르는 김 (ambient 뒤에): 구불구불한 띠가 위로 갈수록 옅어진다 */
function steam(p: Pix, seed: number, x: number, y0: number, y1: number, spread = 6) {
  const r = rng(seed);
  for (let k = 0; k < 4; k++) {
    const ph = r() * 6;
    const ox = (k - 1.5) * spread * 0.45;
    const top = y1 + r() * (y0 - y1) * 0.3;
    for (let y = y0; y > top; y--) {
      const t = (y0 - y) / (y0 - top);
      const cx = Math.round(x + ox * (0.5 + t * 1.2) + Math.sin(y * 0.18 + ph) * (1.5 + t * 4));
      const w = t < 0.3 ? 1 : 2;
      for (let i = 0; i < w; i++) {
        const a = (1 - t) * 0.75;
        if (bayer(cx + i, y) < (1 - t) * 26) p.set(cx + i, y, nearest(mix(p.get(cx + i, y), C.white, a + 0.15)));
      }
    }
  }
}

/** 장작불 (ambient 뒤에) */
function fire(p: Pix, x: number, y: number, w: number, h: number, seed: number) {
  const r = rng(seed);
  p.rect(x - w / 2, y - 1, w, 2, C.wood3);
  p.line(x - w / 2, y, x + w / 2 - 2, y - 2, C.wood2);
  for (let i = 0; i < w; i++) {
    const fx = x - w / 2 + i;
    const fh = h * (0.45 + 0.55 * Math.sin((i / (w - 1)) * Math.PI)) * (0.7 + r() * 0.3);
    for (let j = 0; j < fh; j++) {
      const t = j / fh;
      p.set(fx, y - 2 - j, t > 0.75 ? C.ember2 : t > 0.45 ? C.ember : t > 0.2 ? C.gold1 : C.gold0);
    }
  }
}

/** 줄무늬 차양 (앞이 넓은 사다리꼴, 아래는 물결) */
function awning(p: Pix, x: number, y: number, w: number, h: number, c1: number, c2: number, stripe = 5) {
  const top = 3;
  for (let j = 0; j < h; j++) {
    const t = j / (h - 1);
    const x0 = x + top * (1 - t);
    const x1 = x + w - top * (1 - t);
    for (let i = Math.round(x0); i < Math.round(x1); i++) {
      const u = ((i - x0) / (x1 - x0)) * w;
      const c = Math.floor(u / stripe) % 2 ? c2 : c1;
      p.set(i, y + j, j === 0 ? nearest(mix(c, C.white, 0.3)) : j === h - 1 ? nearest(mix(c, C.ink, 0.2)) : c);
    }
  }
  for (let i = 0; i < w; i += stripe) {
    const c = Math.floor(i / stripe) % 2 ? c2 : c1;
    p.hline(x + i, x + i + stripe - 1, y + h, nearest(mix(c, C.ink, 0.2)));
    p.hline(x + i + 1, x + i + stripe - 2, y + h + 1, nearest(mix(c, C.ink, 0.2)));
  }
}

/** 처진 줄 위의 점 */
function sag(x0: number, y0: number, x1: number, y1: number, depth: number, t: number): [number, number] {
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * depth];
}

/** 삼각 깃발 줄 */
function bunting(p: Pix, x0: number, y0: number, x1: number, y1: number, depth: number, colors: number[], gap = 7) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) * 1.5));
  for (let i = 0; i <= n; i++) {
    const [x, y] = sag(x0, y0, x1, y1, depth, i / n);
    p.set(x, y, C.slate0);
  }
  const m = Math.floor((x1 - x0) / gap);
  for (let k = 1; k < m; k++) {
    const [x, y] = sag(x0, y0, x1, y1, depth, k / m);
    const c = colors[k % colors.length];
    p.poly([[x - 2, y], [x + 2.5, y], [x + 0.25, y + 5]], c);
    p.hline(Math.round(x - 2), Math.round(x + 1), Math.round(y) + 1, nearest(mix(c, C.white, 0.25)));
  }
}

/** 박공지붕 집 정면 */
function house(p: Pix, x: number, base: number, w: number, h: number, wallC: number, roofC: number, night: boolean, seed: number) {
  const r = rng(seed);
  p.rect(x, base - h, w, h, wallC);
  p.vline(x + w - 1, base - h, base - 1, nearest(mix(wallC, C.ink, 0.2)));
  const rh = Math.round(w * 0.45);
  p.poly([[x - 1, base - h], [x + w / 2, base - h - rh], [x + w + 1, base - h]], (px) => (px < x + w / 2 ? roofC : nearest(mix(roofC, C.ink, 0.25))));
  p.hline(x, x + w - 1, base - h, nearest(mix(wallC, C.ink, 0.35)));
  for (let wy = base - h + 3; wy < base - 6; wy += 7) {
    for (let wx = x + 3; wx < x + w - 4; wx += 6) {
      const on = night && r() < 0.6;
      p.rect(wx, wy, 3, 4, on ? C.gold1 : C.slate0);
      p.hline(wx, wx + 2, wy + 4, nearest(mix(wallC, C.white, 0.3)));
    }
  }
  p.rect(x + w / 2 - 2, base - 6, 4, 6, C.wood3);
}

const canteen: SceneFn = (p, tod) => {
  wall(p, 0, 44, RAMP.cream, 40);
  wall(p, 44, 60, RAMP.brownCloth, 8);
  // 창
  for (const x of [114, 138]) win(p, x, 8, 16, 26, tod, 2, 3, RAMP.brownCloth);
  // 큰 화덕
  p.poly([[60, 0], [100, 0], [104, 14], [56, 14]], C.mist0);
  bricks(p, 54, 14, 52, 46, STONE, 8, 4);
  p.rect(52, 13, 56, 3, C.wood2);
  p.hline(52, 107, 13, C.wood1);
  p.rect(62, 30, 36, 30, C.night0);
  p.ellipse(80, 30, 18, 8, C.night0);
  p.hline(62, 97, 59, C.ink);
  // 걸린 큰 솥
  p.vline(80, 22, 31, C.slate1);
  p.ellipse(80, 43, 14, 10, (x, y) => (x < 74 && y < 44 ? C.slate1 : y > 48 ? C.night1 : C.slate0));
  p.ellipse(80, 34, 14, 3, C.slate1);
  p.ellipse(80, 34, 12, 2, C.gold3);
  p.hline(72, 86, 34, C.gold2);
  // 배식대와 요리사
  p.rect(4, 18, 44, 2, C.wood2);
  for (let x = 7; x < 46; x += 6) {
    p.ellipse(x + 1, 15, 2.5, 2.5, C.white);
    p.set(x + 1, 15, C.mist1);
  }
  for (const [x, c] of [[8, C.slate1], [16, C.gold3], [24, C.slate1], [36, C.gold3]] as [number, number][]) {
    p.vline(x, 22, 26, C.slate0);
    p.ellipse(x, 28, 2.5, 2, c);
  }
  figure(p, 22, 32, C.wood2, C.white, { pants: C.mist1 });
  p.rect(23, 28, 5, 4, C.white);
  p.hline(22, 28, 31, C.mist1);
  p.line(29, 38, 33, 36, C.mist0);
  p.rect(2, 44, 50, 3, C.wood1);
  p.hline(2, 51, 44, C.wood0);
  p.rect(4, 47, 46, 13, C.wood2);
  p.frame(6, 49, 20, 9, C.wood3);
  p.frame(28, 49, 20, 9, C.wood3);
  for (let i = 0; i < 4; i++) p.ellipse(8 + i * 1, 42 - i * 1.6, 4, 1.2, i % 2 ? C.mist1 : C.white);
  p.ellipse(40, 42, 7, 3, C.wood1);
  for (const x of [36, 40, 44]) p.ellipse(x, 40.5, 2.2, 1.4, C.wood0);
  // 바닥
  tileFloor(p, 60, 80, 34, 80, 1.3, 0.8, (i, j) => ((i + j) % 2 ? C.wood1 : C.wood2), C.wood3);
  p.hline(0, W - 1, 60, C.wood4);
  // 긴 식탁과 학생들
  const hairs = [C.wood2, C.blond1, C.ink, C.red2, C.wood3, C.mist1, C.blond2, C.wood2];
  const seats = [10, 24, 38, 52, 94, 108, 122, 140];
  seats.forEach((x, i) => figure(p, x, 57, hairs[i], i % 3 === 2 ? C.mist2 : C.blue2, { sit: true, flip: i >= 4 }));
  p.rect(4, 67, 152, 3, C.wood1);
  p.hline(4, 155, 67, C.wood0);
  p.rect(4, 70, 152, 2, C.wood3);
  for (const x of [8, 78, 150]) p.rect(x, 72, 3, 12, C.wood3);
  p.hline(4, 155, 84, C.wood4);
  seats.forEach((x) => {
    p.ellipse(x + 3.5, 66.5, 3, 1.2, C.white);
    p.hline(x + 2, x + 5, 66, C.ember2);
  });
  for (const x of [32, 68, 116, 132]) p.ellipse(x, 66, 3, 1.4, C.wood0);
  ambient(p, tod);
  // 불과 김
  light(p, 80, 54, 50, C.ember, tod === 'night' ? 0.5 : 0.3, 0.7);
  light(p, 80, 56, 22, C.gold1, 0.4, 0.6);
  fire(p, 80, 59, 22, 7, 3);
  p.ellipse(80, 43, 14, 10, (x, y) => (y > 50 ? C.wood3 : -1));
  p.ellipse(80, 43, 14, 10, (x, y, d) => (d > 0.82 && y > 44 ? C.ember2 : -1));
  steam(p, 5, 80, 32, 0, 14);
  for (const x of [24, 108, 132]) {
    if (tod === 'night' || tod === 'dusk') {
      p.vline(x + 2, 0, 3, C.slate0);
      warm(p, x + 2, 7, 26, 0.45);
      lanternBody(p, x, 4);
    }
  }
};

const market: SceneFn = (p, tod) => {
  const night = tod === 'night';
  sky(p, tod, 56);
  if (night) {
    stars(p, 31, 40, 30);
    moon(p, 30, 12, 4);
  } else if (tod === 'dusk') sun(p, 26, 34, 7, tod);
  clouds(p, 19, tod, 20, 3);
  // 시계탑과 집들
  p.rect(98, 6, 12, 50, C.mist1);
  p.vline(109, 6, 55, C.mist0);
  p.poly([[96, 6], [104, -8], [112, 6]], C.blue2);
  p.ellipse(104, 14, 3.5, 3.5, C.white);

  ring(p, 104, 14, 3.5, 3.5, C.slate1);
  p.vline(104, 12, 14, C.ink);
  p.hline(104, 106, 14, C.ink);
  const walls = [C.mist1, C.wood0, C.mist2, C.tan0, C.mist0, C.pink0, C.wood0, C.mist1];
  const roofs = [C.red2, C.blue2, C.slate1, C.red2, C.wood3, C.blue2, C.red2, C.slate1];
  let x = -6;
  let i = 0;
  while (x < W) {
    const w = 18 + ((i * 7) % 3) * 4;
    const h = 22 + ((i * 5) % 4) * 5;
    if (x + w < 96 || x > 112) house(p, x, 56, w, h, walls[i % walls.length], roofs[i % roofs.length], night, 50 + i);
    x += w + 1;
    i++;
  }
  // 바닥 돌
  tileFloor(p, 56, 80, 30, 80, 1.4, 0.55, (a, b) => ((a * 3 + b * 5) % 4 === 0 ? C.mist0 : (a + b) % 2 ? C.slate2 : C.mist0), C.slate1);
  p.hline(0, W - 1, 56, C.slate1);
  bunting(p, -2, 8, 98, 14, 8, [C.red1, C.gold1, C.blue1, C.leaf1, C.pink1]);
  bunting(p, 110, 12, 162, 6, 6, [C.gold1, C.red1, C.leaf1, C.blue1]);
  // 노점 셋
  const stalls: [number, number, number, number, number][] = [
    [4, 44, C.red1, C.white, 0],
    [60, 40, C.blue1, C.white, 1],
    [112, 44, C.leaf2, RAMP.cream[1], 2],
  ];
  for (const [sx, sw, c1, c2, kind] of stalls) {
    const top = 34;
    p.rect(sx + 2, top + 6, 2, 30, C.wood3);
    p.rect(sx + sw - 4, top + 6, 2, 30, C.wood3);
    p.rect(sx + 3, top + 8, sw - 6, 14, C.wood4);
    awning(p, sx, top, sw, 8, c1, c2);
    figure(p, sx + sw / 2 - 3, top + 12, kind === 1 ? C.blond2 : kind === 2 ? C.mist1 : C.wood2, kind === 0 ? C.leaf3 : kind === 1 ? C.red2 : C.violet2);
    p.rect(sx + 2, top + 22, sw - 4, 3, C.wood1);
    p.hline(sx + 2, sx + sw - 3, top + 22, C.wood0);
    p.rect(sx + 3, top + 25, sw - 6, 11, C.wood2);
    p.frame(sx + 3, top + 25, sw - 6, 11, C.wood3);
    const r = rng(60 + kind);
    for (let gx = sx + 5; gx < sx + sw - 6; gx += 2 + Math.floor(r() * 2)) {
      if (kind === 0) {
        const c = r() < 0.5 ? C.red1 : r() < 0.5 ? C.ember : C.leaf1;
        p.ellipse(gx + 1, top + 20.5, 1.5, 1.5, c);
        p.set(gx, top + 19, nearest(mix(c, C.white, 0.5)));
      } else if (kind === 1) {
        if (r() < 0.5) p.ellipse(gx + 1, top + 19.5, 2, 2.5, r() < 0.5 ? C.wood1 : C.teal2);
        else p.rect(gx, top + 18, 3, 4, r() < 0.5 ? C.violet2 : C.gold2);
        gx += 1;
      } else bottle(p, gx, top + 22, [C.red1, C.teal1, C.violet1, C.gold1, C.leaf1][Math.floor(r() * 5)], 3 + Math.floor(r() * 3));
    }
  }
  // 사람들
  const crowd: [number, number, number, number, boolean][] = [
    [30, 66, C.wood3, C.blue2, false],
    [48, 70, C.blond1, C.pink2, true],
    [96, 64, C.ink, C.leaf3, false],
    [104, 72, C.red2, C.gold3, true],
    [138, 68, C.mist1, C.wood2, false],
    [72, 74, C.wood2, C.violet3, false],
  ];
  crowd.forEach(([cx, cy, hair, cloth, back]) => (back ? backFigure(p, cx, cy, hair, cloth) : figure(p, cx, cy, hair, cloth, { flip: cx > 80 })));
  // 앞쪽 바구니
  p.ellipse(14, 84, 12, 5, C.wood2);
  p.ellipse(14, 81, 11, 3, C.wood3);
  for (let k = 0; k < 7; k++) p.ellipse(6 + k * 2.6, 80 - (k % 2), 2, 2, k % 3 ? C.red1 : C.leaf1);
  p.hline(3, 25, 84, C.wood1);
  ambient(p, tod);
  if (tod !== 'day') {
    for (const [lx, ly] of [[26, 43], [80, 43], [134, 43]] as [number, number][]) {
      warm(p, lx + 2, ly + 3, night ? 30 : 20, night ? 0.55 : 0.3);
      lanternBody(p, lx, ly);
    }
  }
};

const greenhouse: SceneFn = (p, tod) => {
  const vx = 80;
  const vy = 46;
  const F = 70;
  const E = 1.5;
  const P = proj(vx, vy, F);
  const night = tod === 'night';
  sky(p, tod);
  if (night) {
    stars(p, 44, 60, 40);
    moon(p, 120, 12, 4);
  }
  clouds(p, 8, tod, 30, 3);
  // 바깥 나무와 산울타리
  ridge(p, 3, 48, 8, night ? C.leaf4 : C.leaf3, 14);
  for (const tx of [12, 40, 120, 150]) roundTree(p, tx, 44, 8, RAMP.greenCloth);
  // 유리 반사 (사선)
  p.map((c, x, y) => ((x + y * 2) % 23 < 2 && y < 60 ? nearest(mix(c, C.white, 0.25)) : c));
  // 바닥: 가운데 벽돌길, 양옆 흙
  for (let y = 47; y < H; y++) {
    const z = (F * E) / (y + 0.5 - vy);
    for (let x = 0; x < W; x++) {
      const X = ((x + 0.5 - vx) * z) / F;
      if (Math.abs(X) > 2.5) continue;
      let c: number;
      if (Math.abs(X) < 0.6) {
        const row = Math.floor(z * 3);
        const col = Math.floor(X * 3 + (row % 2) * 0.5);
        c = (z * 3) % 1 < 0.15 && (F * E) / (z * z) / 3 > 2 ? C.wood3 : (row + col) % 3 === 0 ? C.ember2 : RAMP.orange[2];
      } else c = bayer(x, y) < 3 ? C.wood3 : C.wood4;
      p.set(x, y, c);
    }
  }
  // 골조
  const sec: [number, number][] = [[-2.5, -E], [-2.5, 0.9], [-1.25, 1.75], [0, 2.6], [1.25, 1.75], [2.5, 0.9], [2.5, -E]];
  const frameC = C.mist2;
  for (const [X, Y] of sec) {
    const a = P(X, Y, 1.6);
    const b = P(X, Y, 9);
    p.line(a[0], a[1], b[0], b[1], frameC);
  }
  for (const Y of [-0.3]) {
    for (const X of [-2.5, 2.5]) {
      const a = P(X, Y, 1.6);
      const b = P(X, Y, 9);
      p.line(a[0], a[1], b[0], b[1], C.mist1);
    }
  }
  for (const z of [9, 6.6, 5.0, 3.8, 2.9, 2.2]) {
    const pts = sec.map(([X, Y]) => P(X, Y, z));
    const t = z < 3 ? 2 : 1;
    for (let k = 0; k + 1 < pts.length; k++) {
      for (let d = 0; d < t; d++) p.line(pts[k][0] + d, pts[k][1], pts[k + 1][0] + d, pts[k + 1][1], d ? C.mist0 : frameC);
    }
  }
  // 끝벽의 문
  const [d0x, d0y] = P(-0.45, 0.2, 9);
  const [d1x, d1y] = P(0.45, -E, 9);
  p.rect(d0x, d0y, d1x - d0x, d1y - d0y, C.wood2);
  p.frame(d0x, d0y, d1x - d0x, d1y - d0y, frameC);
  p.vline((d0x + d1x) / 2, d0y, d1y, frameC);
  // 화분 선반
  for (const side of [-1, 1]) {
    const xi = side * 0.9;
    const xo = side * 2.4;
    p.poly([P(xi, -0.75, 1.7), P(xo, -0.75, 1.7), P(xo, -0.75, 8.6), P(xi, -0.75, 8.6)], C.wood1);
    p.poly([P(xi, -0.75, 1.7), P(xi, -0.95, 1.7), P(xi, -0.95, 8.6), P(xi, -0.75, 8.6)], C.wood2);
    for (const z of [8, 6, 4.5, 3.3, 2.4]) {
      const [lx, ly] = P(xi + side * 0.1, -0.95, z);
      const [, fy] = P(xi, -E, z);
      p.rect(Math.round(lx) - (side < 0 ? 1 : 0), Math.round(ly), Math.max(1, Math.round(4 / z)), Math.round(fy - ly), C.wood3);
    }
  }
  const leafs: Ramp[] = [RAMP.greenCloth, RAMP.sage, [C.teal0, C.teal1, C.teal2, C.teal3], RAMP.greenCloth];
  const flowers = [C.pink1, C.gold1, C.red1, C.white, C.violet1];
  let seed = 70;
  for (const z of [8.2, 7.2, 6.3, 5.5, 4.8, 4.1, 3.5, 2.9, 2.4, 2.0]) {
    for (const side of [-1, 1]) {
      for (const X of [side * 1.3, side * 2.0]) {
        if ((seed++ * 7) % 5 === 0 && z > 2.6) continue;
        const [px, py] = P(X, -0.75, z);
        pottedPlant(p, px, py, 2.6 / z, leafs[seed % leafs.length], seed, seed % 3 ? flowers[seed % flowers.length] : undefined);
      }
    }
  }
  // 앞쪽 큰 잎
  for (const [bx, by, s] of [[6, 92, 1], [154, 94, 1.1]] as [number, number, number][]) {
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.42;
      const len = 22 * s;
      const ex = bx + Math.cos(a) * len;
      const ey = by + Math.sin(a) * len;
      p.poly([[bx, by], [(bx + ex) / 2 - Math.sin(a) * 5, (by + ey) / 2 + Math.cos(a) * 5], [ex, ey], [(bx + ex) / 2 + Math.sin(a) * 3, (by + ey) / 2 - Math.cos(a) * 3]], (x2, y2) => ((x2 + y2) % 7 === 0 ? C.leaf3 : k % 2 ? C.leaf2 : C.leaf3));
      p.line(bx, by, ex, ey, C.leaf1);
    }
  }
  // 늘어진 덩굴
  const vr = rng(9);
  for (const [z, X] of [[2.9, -1.6], [2.9, 1.2], [3.8, -0.6], [3.8, 1.9], [5.0, 0.9], [2.2, -0.4]] as [number, number][]) {
    let [x2, y2] = P(X, X < -1.25 || X > 1.25 ? 0.9 + (2.5 - Math.abs(X)) * 0.68 : 1.75 + (1.25 - Math.abs(X)) * 0.68, z);
    const len = 10 + vr() * 18;
    for (let k = 0; k < len; k++) {
      p.set(x2, y2, C.leaf3);
      if (k % 3 === 0) p.set(x2 + (vr() < 0.5 ? -1 : 1), y2, k % 2 ? C.leaf1 : C.leaf2);
      y2 += 1;
      x2 += vr() < 0.2 ? (vr() < 0.5 ? -1 : 1) : 0;
    }
  }
  // 물뿌리개를 든 학생
  figure(p, 84, 58, C.wood2, RAMP.greenCloth[1], { pants: C.wood3 });
  p.rect(91, 64, 4, 3, C.slate2);
  p.line(95, 64, 98, 62, C.slate2);
  p.set(99, 62, C.sky0);
  p.set(100, 63, C.sky0);
  ambient(p, tod);
  if (night || tod === 'dusk') {
    const [lx, ly] = P(0, 2.4, 3.8);
    p.vline(lx + 2, ly - 4, ly - 1, C.slate0);
    warm(p, lx + 2, ly + 3, 44, night ? 0.5 : 0.3);
    lanternBody(p, Math.round(lx), Math.round(ly));
  }
  if (night) {
    const fr = rng(14);
    for (let k = 0; k < 9; k++) {
      const x2 = 20 + fr() * 120;
      const y2 = 46 + fr() * 30;
      light(p, x2, y2, 4, C.teal1, 0.5);
      p.set(x2, y2, C.teal0);
    }
  }
};

/** 주름진 천 커튼 */
function drape(p: Pix, x: number, y0: number, w: number, y1: number, ramp: Ramp, fold = 4) {
  for (let y = y0; y < y1; y++) {
    for (let i = 0; i < w; i++) {
      const k = i % fold;
      p.set(x + i, y, k === 0 ? ramp[2] : k === 1 ? ramp[0] : ramp[1]);
    }
  }
  for (let i = 0; i < w; i++) if (i % fold === 2) p.set(x + i, y1, ramp[1]);
}

const clubroom: SceneFn = (p, tod) => {
  wall(p, 0, 50, RAMP.sage, 6);
  wall(p, 50, 64, RAMP.brownCloth, 12);
  floor(p, 64, RAMP.brownCloth);
  p.ellipse(84, 80, 40, 7, RAMP.navy[2]);
  p.ellipse(84, 80, 37, 5.8, RAMP.navy[1]);
  p.ellipse(84, 80, 31, 4.4, (x, y, d) => (d > 0.82 ? C.gold3 : -1));
  p.poly([[66, 82], [74, 80], [76, 84], [68, 86]], C.white);
  p.poly([[96, 76], [103, 77], [101, 81], [94, 80]], C.mist2);
  // 창과 커튼
  win(p, 106, 8, 38, 30, tod, 2, 2, RAMP.brownCloth, () => {
    ridge(p, 4, 36, 4, tod === 'night' ? C.night1 : C.leaf3, 10, 38);
    castle(p, 132, 36, 0.3, [C.mist1, C.mist0, C.slate2, C.slate1], [C.blue2, C.blue2, C.blue3, C.ink], tod === 'night', 5);
    if (tod === 'night') moon(p, 114, 14, 3);
  });
  p.rect(100, 4, 52, 2, C.wood3);
  drape(p, 100, 6, 7, 44, [C.gold1, C.gold2, C.gold3, C.wood3]);
  drape(p, 145, 6, 7, 44, [C.gold1, C.gold2, C.gold3, C.wood3]);
  // 게시판
  p.rect(6, 8, 52, 32, C.wood2);
  p.rect(8, 10, 48, 28, C.wood0);
  p.dither(8, 10, 48, 28, C.blond2, 3);
  const notes: [number, number, number, number, number][] = [
    [10, 12, 10, 8, C.white], [22, 11, 9, 11, C.gold0], [34, 13, 10, 7, C.pink0], [46, 11, 8, 9, C.sky0],
    [12, 24, 12, 11, C.blond0], [28, 26, 9, 8, C.white], [40, 24, 13, 10, C.leaf0],
  ];
  notes.forEach(([x, y, w, h, c], i) => {
    p.rect(x, y, w, h, c);
    p.hline(x, x + w - 1, y + h - 1, nearest(mix(c, C.ink, 0.15)));
    for (let ly = y + 2; ly < y + h - 2; ly += 2) p.hline(x + 1, x + w - 2 - ((ly + i) % 3), ly, C.mist0);
    p.set(x + Math.floor(w / 2), y, i % 2 ? C.red1 : C.blue1);
  });
  p.line(15, 12, 27, 11, C.red1);
  p.line(27, 11, 34, 26, C.red1);
  p.line(34, 26, 46, 24, C.red1);
  p.ellipse(18, 30, 3, 2, C.red1);
  p.ellipse(18, 30, 2, 1, C.blond0);
  // 동아리 깃발
  p.poly([[66, 10], [92, 12], [66, 22]], C.red2);
  p.hline(66, 90, 10, C.red1);
  p.vline(65, 8, 24, C.wood3);
  p.set(73, 15, C.gold1);
  p.set(72, 16, C.gold1);
  p.set(74, 16, C.gold1);
  p.set(73, 17, C.gold1);
  // 소파와 책 읽는 학생
  p.rect(2, 58, 40, 12, C.red2);
  p.hline(2, 41, 58, C.red1);
  p.rect(0, 64, 6, 16, C.red3);
  p.rect(38, 64, 6, 16, C.red3);
  p.hline(0, 5, 64, C.red2);
  p.hline(38, 43, 64, C.red2);
  figure(p, 20, 58, C.ink, C.blue2, { sit: true });
  p.rect(26, 63, 4, 3, C.leaf3);
  p.rect(6, 70, 32, 6, C.red1);
  p.hline(6, 37, 70, C.red0);
  p.rect(2, 76, 42, 4, C.red3);
  p.rect(9, 66, 8, 5, C.gold2);
  p.rect(4, 80, 2, 3, C.wood4);
  p.rect(38, 80, 2, 3, C.wood4);
  // 어수선한 책상
  figure(p, 70, 48, C.blond1, C.blue2, { sit: true, flip: true });
  table(p, 48, 60, 56);
  const r = rng(33);
  for (let i = 0; i < 6; i++) {
    const x = 52 + Math.floor(r() * 44);
    p.rect(x, 58 + Math.floor(r() * 2), 6 + Math.floor(r() * 4), 2, i % 3 === 0 ? C.mist2 : C.white);
  }
  bookPile(p, 54, 60, 4, 21);
  p.rect(84, 55, 3, 5, C.white);
  p.set(87, 56, C.white);
  p.set(87, 57, C.white);
  p.rect(85, 55, 1, 1, C.wood3);
  p.ellipse(96, 55, 3, 3, C.sky0);
  p.set(95, 54, C.white);
  p.rect(94, 58, 5, 2, C.gold3);
  p.line(64, 59, 80, 58, C.white);
  // 상자와 류트
  p.rect(118, 70, 22, 14, C.wood2);
  p.frame(118, 70, 22, 14, C.wood3);
  p.hline(118, 139, 70, C.wood1);
  for (const [x, c] of [[121, C.blond0], [125, C.white], [130, C.blond0]] as [number, number][]) {
    p.rect(x, 64, 3, 6, c);
    p.set(x + 1, 64, C.red1);
  }
  p.ellipse(150, 76, 6, 7, (x, y) => (x < 148 && y < 74 ? C.wood0 : C.wood1));
  p.ellipse(150, 76, 1.6, 1.6, C.wood4);
  p.line(150, 69, 156, 48, C.wood3);
  p.line(151, 69, 157, 48, C.wood2);
  p.rect(155, 45, 3, 4, C.wood3);
  ambient(p, tod);
  // 책상 등
  p.rect(98, 54, 2, 6, C.gold3);
  p.poly([[94, 54], [104, 54], [101, 49], [97, 49]], C.leaf2);
  if (tod === 'night' || tod === 'dusk') warm(p, 99, 57, tod === 'night' ? 40 : 26, tod === 'night' ? 0.55 : 0.3);
  p.hline(96, 102, 55, C.gold0);
  light(p, 96, 55, 4, C.sky0, 0.4);
};

const classroom: SceneFn = (p, tod) => {
  // 앞벽과 옆벽
  wall(p, 0, 52, RAMP.cream, 28);
  wall(p, 36, 52, RAMP.brownCloth, 7);
  p.poly([[0, 0], [22, 0], [22, 52], [0, 66]], C.mist2);
  p.poly([[138, 0], [160, 0], [160, 66], [138, 52]], C.mist1);
  p.line(22, 52, 0, 66, C.wood3);
  p.line(138, 52, 160, 66, C.wood3);
  p.vline(22, 0, 52, C.mist0);
  p.vline(138, 0, 52, C.mist0);
  // 옆벽의 높은 창 (원근)
  for (const [f0, f1] of [[0.12, 0.42], [0.58, 0.88]]) {
    const xa = 138 + 22 * f0;
    const xb = 138 + 22 * f1;
    p.poly([[xa - 1, 4 - 6 * f0], [xb + 1, 4 - 6 * f1], [xb + 1, 42 + 10 * f1], [xa - 1, 42 + 10 * f0]], C.wood2);
    within(p, (x, y) => x >= xa && x < xb && y >= 6 - 6 * (f0 + ((x - xa) / (xb - xa)) * (f1 - f0)) && y < 40 + 10 * (f0 + ((x - xa) / (xb - xa)) * (f1 - f0)), () => {
      sky(p, tod, 50, 138, 0, 22);
      if (tod === 'night') stars(p, 61, 8, 40, 138, 160);
    });
    p.line((xa + xb) / 2, 6 - 6 * ((f0 + f1) / 2), (xa + xb) / 2, 40 + 10 * ((f0 + f1) / 2), C.wood2);
  }
  // 칠판
  p.rect(30, 6, 100, 30, C.wood2);
  p.hline(30, 129, 6, C.wood1);
  p.rect(32, 8, 96, 26, C.leaf4);
  p.dither(32, 8, 96, 26, C.teal3, 2);
  ring(p, 50, 20, 9, 9, C.mist2);
  ring(p, 50, 20, 6, 6, C.mist1);
  for (let k = 0; k < 3; k++) {
    const a0 = -Math.PI / 2 + (k * Math.PI * 2) / 3;
    const a1 = -Math.PI / 2 + ((k + 1) * Math.PI * 2) / 3;
    p.line(50 + Math.cos(a0) * 6, 20 + Math.sin(a0) * 6, 50 + Math.cos(a1) * 6, 20 + Math.sin(a1) * 6, C.mist2);
  }
  const cr = rng(3);
  for (let y = 12; y < 32; y += 4) {
    let x = 66;
    while (x < 122) {
      const w = 2 + Math.floor(cr() * 6);
      if (x + w > 124) break;
      p.hline(x, x + w - 1, y, cr() < 0.2 ? C.gold0 : C.mist1);
      x += w + 2;
    }
  }
  p.line(100, 30, 112, 22, C.pink0);
  p.line(112, 22, 109, 22, C.pink0);
  p.line(112, 22, 112, 25, C.pink0);
  p.rect(30, 36, 100, 2, C.wood3);
  p.hline(40, 44, 35, C.white);
  p.hline(110, 112, 35, C.gold0);
  // 교단과 교수
  p.rect(18, 50, 124, 6, C.wood1);
  p.hline(18, 141, 50, C.wood0);
  p.hline(18, 141, 55, C.wood3);
  figure(p, 94, 37, C.mist1, C.violet3, { flip: true, pants: C.violet4 });
  p.line(94, 42, 90, 37, C.violet3);
  p.set(89, 36, C.skin1);
  p.poly([[70, 40], [90, 40], [88, 52], [72, 52]], C.wood2);
  p.rect(68, 38, 24, 3, C.wood1);
  p.hline(68, 91, 38, C.wood0);
  p.vline(80, 42, 51, C.wood3);
  p.set(79, 45, C.gold1);
  p.set(81, 45, C.gold1);
  // 계단식 좌석 (앞줄부터)
  const hairs = [C.wood2, C.blond1, C.ink, C.red2, C.wood3, C.mist1, C.blond2, C.ember2, C.wood2, C.ink];
  const rows: [number, number, number, number][] = [
    [58, 3, 0.85, 22],
    [66, 4, 1.05, 14],
    [76, 5, 1.3, 6],
    [88, 6, 1.6, -2],
  ];
  const sr = rng(91);
  rows.forEach(([y, th, s, x0], ri) => {
    const aisle = 4 + ri * 3;
    // 단 (뒤 줄의 바닥)
    p.rect(0, y - Math.round(9 * s), W, Math.round(9 * s), ri === 0 ? C.wood1 : C.wood2);
    p.hline(0, W - 1, y - Math.round(9 * s), C.wood3);
    for (let x = x0 + 4; x < W - x0; x += Math.round(12 * s)) {
      if (Math.abs(x - 80) < aisle + 4 * s) continue;
      if (sr() < 0.18) continue;
      backHead(p, x, y - 8 * s, hairs[Math.floor(sr() * hairs.length)], sr() < 0.7 ? RAMP.uniform[1] : RAMP.uniform[0], s);
    }
    p.rect(0, y, W, th, C.wood1);
    p.hline(0, W - 1, y, C.wood0);
    p.hline(0, W - 1, y + th - 1, C.wood3);
    p.rect(80 - aisle, y - Math.round(9 * s), aisle * 2, Math.round(9 * s) + th, C.wood3);
    for (let k = 0; k < 3; k++) p.hline(80 - aisle, 80 + aisle - 1, y - Math.round(9 * s) + Math.round(k * 3 * s), C.wood2);
    // 펼친 책
    for (let x = x0 + 8; x < W - x0; x += Math.round(25 * s)) if (Math.abs(x - 80) > aisle + 6) p.rect(x, y, Math.round(5 * s), 1, C.white);
  });
  ambient(p, tod);
  if (tod === 'night' || tod === 'dusk') {
    for (const x of [40, 120]) {
      p.vline(x + 2, 0, 3, C.slate0);
      warm(p, x + 2, 7, 34, tod === 'night' ? 0.5 : 0.3);
      lanternBody(p, x, 4);
    }
  }
};

const infirmary: SceneFn = (p, tod) => {
  wall(p, 0, 48, PLASTER, 24);
  wall(p, 48, 62, [C.white, C.teal0, C.teal1, C.teal2], 8);
  tileFloor(p, 62, 80, 36, 80, 1.2, 0.7, (i, j) => ((i + j) % 2 ? C.mist1 : C.mist2), C.mist0);
  p.hline(0, W - 1, 62, C.mist0);
  // 창
  win(p, 52, 10, 30, 30, tod, 2, 2, PLASTER, () => {
    ridge(p, 7, 36, 4, tod === 'night' ? C.night1 : C.leaf2, 10, 40);
    roundTree(p, 72, 38, 6, RAMP.greenCloth);
    if (tod === 'night') moon(p, 60, 15, 3);
  });
  // 창 아래 탁자와 꽃
  p.rect(54, 50, 26, 2, C.wood1);
  p.rect(56, 52, 2, 10, C.wood2);
  p.rect(76, 52, 2, 10, C.wood2);
  p.ellipse(62, 48, 4, 1.6, C.mist1);
  p.ellipse(62, 47.5, 3, 1, C.sky1);
  p.rect(71, 45, 3, 5, C.sky0);
  for (const [dx, dy, c] of [[-1, -2, C.pink1], [1, -3, C.gold1], [3, -2, C.pink1], [0, -5, C.white], [2, -5, C.pink0]] as [number, number, number][]) {
    p.set(72 + dx, 45 + dy, c);
    p.set(72 + Math.sign(dx) * 0, 44, C.leaf2);
  }
  // 약장
  p.rect(112, 10, 38, 52, C.wood2);
  p.rect(114, 12, 34, 30, C.sky0);
  p.dither(114, 12, 34, 30, C.mist2, 6);
  for (const y of [21, 31, 41]) p.hline(114, 147, y, C.wood1);
  const lr = rng(5);
  for (const y of [21, 31, 41]) {
    for (let x = 116; x < 146; x += 4) {
      const liq = [C.red1, C.leaf1, C.teal1, C.gold2, C.violet1, C.wood1][Math.floor(lr() * 6)];
      if (lr() < 0.2) continue;
      if (lr() < 0.5) bottle(p, x, y, liq, 4 + Math.floor(lr() * 3));
      else {
        p.rect(x, y - 4, 3, 4, C.white);
        p.hline(x, x + 2, y - 4, liq);
      }
    }
  }
  p.vline(130, 12, 41, C.wood2);
  p.frame(114, 12, 34, 30, C.wood3);
  p.rect(114, 44, 34, 16, C.wood1);
  p.hline(114, 147, 51, C.wood3);
  p.rect(120, 47, 4, 1, C.gold2);
  p.rect(138, 47, 4, 1, C.gold2);
  p.rect(120, 55, 4, 1, C.gold2);
  p.rect(138, 55, 4, 1, C.gold2);
  p.rect(128, 4, 6, 6, C.white);
  p.rect(130, 5, 2, 4, C.leaf2);
  p.rect(129, 6, 4, 2, C.leaf2);
  // 커튼 레일과 닫힌 커튼 (그 뒤의 그림자)
  p.hline(0, 46, 4, C.mist0);
  p.hline(0, 46, 5, C.slate2);
  drape(p, 0, 6, 46, 82, [C.white, C.mist2, C.mist1, C.mist0], 5);
  p.ellipse(22, 46, 5, 6, (x, y) => (bayer(x, y) < 10 ? C.mist0 : -1));
  p.ellipse(22, 38, 3, 3.4, (x, y) => (bayer(x, y) < 10 ? C.mist0 : -1));
  p.rect(14, 52, 18, 3, C.mist1);
  // 앞쪽 침대와 누운 학생
  p.rect(70, 54, 4, 30, C.mist1);
  p.rect(69, 52, 6, 3, C.white);
  p.rect(146, 60, 4, 24, C.mist1);
  p.rect(145, 58, 6, 3, C.white);
  p.rect(72, 66, 76, 6, C.white);
  p.hline(72, 147, 66, C.white);
  p.rect(74, 60, 16, 7, C.white);
  p.hline(74, 89, 66, C.mist1);
  p.ellipse(82, 61, 4.5, 3.6, C.wood2);
  p.ellipse(83, 62.5, 3, 2.4, C.skin1);
  p.set(82, 62, C.wood3);
  p.set(84, 62, C.wood3);
  p.rect(86, 63, 62, 6, C.sky1);
  p.ellipse(112, 63, 18, 3, C.sky1);
  p.hline(86, 147, 63, C.sky0);
  p.hline(96, 128, 60, C.sky0);
  p.rect(86, 69, 62, 4, C.blue1);
  p.rect(72, 72, 76, 3, C.mist0);
  p.rect(72, 75, 2, 9, C.mist0);
  p.rect(144, 75, 2, 9, C.mist0);
  // 침대 옆 의자
  p.rect(50, 70, 14, 2, C.wood1);
  p.rect(51, 72, 2, 12, C.wood2);
  p.rect(61, 72, 2, 12, C.wood2);
  p.rect(54, 67, 3, 3, C.sky0);
  p.ellipse(60, 68.5, 1.8, 1.6, C.red1);
  p.set(60, 66, C.leaf2);
  sunbeam(p, [[52, 42], [82, 42], [110, 90], [62, 90]], tod, 0.2);
  ambient(p, tod);
  if (tod === 'night' || tod === 'dusk') {
    warm(p, 57, 64, tod === 'night' ? 38 : 24, tod === 'night' ? 0.55 : 0.3);
    candle(p, 57, 66);
  }
};

const rooftop: SceneFn = (p, tod) => {
  const night = tod === 'night';
  sky(p, tod);
  if (night) {
    stars(p, 52, 70, 46);
    moon(p, 122, 14, 5);
  } else if (tod === 'dusk') sun(p, 76, 42, 9, tod);
  else if (tod === 'dawn') sun(p, 44, 40, 7, tod);
  clouds(p, 11, tod, 34, 4);
  // 먼 산과 도시
  const far = night ? C.night1 : tod === 'dusk' ? C.violet3 : tod === 'dawn' ? C.violet2 : C.mist0;
  const mid = night ? C.night0 : tod === 'dusk' ? C.violet4 : tod === 'dawn' ? C.violet3 : C.slate2;
  ridge(p, 2, 50, 10, far, 30);
  const cr = rng(17);
  const lights: [number, number][] = [];
  const near = night ? C.ink : nearest(mix(mid, C.ink, 0.2));
  for (const [base, col, hMax] of [[60, mid, 10], [66, near, 8]] as [number, number, number][]) {
    for (let x = -4; x < W; ) {
      const w = 5 + Math.floor(cr() * 8);
      const h = 3 + Math.floor(cr() * hMax);
      const spire = cr() < 0.15;
      p.rect(x, base - h, w, h + 8, col);
      if (spire) p.poly([[x, base - h], [x + w / 2, base - h - 9], [x + w, base - h]], col);
      else p.poly([[x - 1, base - h], [x + w / 2, base - h - 3], [x + w + 1, base - h]], col);
      for (let k = 0; k < 3; k++) if (cr() < 0.6) lights.push([x + 1 + Math.floor(cr() * (w - 2)), base - h + 2 + Math.floor(cr() * (h + 4))]);
      x += w + Math.floor(cr() * 2);
    }
  }
  // 바닥
  tileFloor(p, 76, 80, 44, 80, 1.3, 0.8, (i, j) => ((i * 7 + j * 3) % 5 === 0 ? C.mist0 : C.mist1), C.slate2);
  p.hline(0, W - 1, 76, C.slate1);
  // 난간
  p.rect(0, 62, W, 4, C.mist2);
  p.hline(0, W - 1, 62, C.white);
  p.hline(0, W - 1, 65, C.mist0);
  p.rect(0, 73, W, 3, C.mist1);
  p.hline(0, W - 1, 73, C.mist2);
  for (let x = 2; x < W; x += 7) {
    p.rect(x + 1, 66, 3, 7, C.mist1);
    p.set(x, 68, C.mist1);
    p.set(x + 4, 68, C.mist0);
    p.set(x, 69, C.mist1);
    p.set(x + 4, 69, C.mist0);
    p.vline(x + 3, 66, 72, C.mist0);
  }
  // 계단실
  p.rect(0, 28, 34, 48, C.mist1);
  p.vline(33, 28, 75, C.mist0);
  p.poly([[-2, 28], [36, 28], [30, 20], [-2, 20]], C.blue2);
  p.hline(-2, 35, 28, C.blue3);
  p.rect(10, 48, 14, 28, C.wood2);
  p.frame(10, 48, 14, 28, C.wood3);
  p.vline(17, 49, 74, C.wood3);
  p.set(21, 62, C.gold1);
  p.rect(26, 66, 6, 10, C.wood3);
  p.hline(26, 31, 69, C.slate1);
  // 난간에 기댄 두 사람
  backFigure(p, 98, 52, C.blond1, C.blue2);
  backFigure(p, 108, 52, C.wood3, C.blue2);
  p.set(97, 53, C.blond1);
  p.set(96, 54, C.blond1);
  if (!night) {
    for (const [x, y] of [[58, 18], [66, 22], [140, 28]] as [number, number][]) {
      p.set(x - 1, y - 1, C.slate0);
      p.set(x, y, C.slate0);
      p.set(x + 1, y - 1, C.slate0);
    }
  }
  ambient(p, tod, 0.7);
  if (night || tod === 'dusk') {
    for (const [x, y] of lights) if (y < 61 && (night || (x * y) % 3 === 0) && !(x >= 96 && x <= 116 && y >= 52)) p.set(x, y, (x + y) % 2 ? C.gold1 : C.gold2);
    warm(p, 17, 44, night ? 30 : 20, night ? 0.5 : 0.3);
    lanternBody(p, 15, 41);
  }
};

// ---------------------------------------------------------------- 사건

/** 실루엣에 테두리 빛을 두른다 */
function rimmed(p: Pix, rim: number, draw: (q: Pix) => void) {
  const q = new Pix(p.w, p.h);
  draw(q);
  p.blit(q.clone().outline(rim));
}

/** 위를 향한 검 문양 (방패, 깃발용) */
function swordMark(p: Pix, x: number, top: number, h: number, blade: number = C.white, gold: number = C.gold1) {
  const g = top + Math.round(h * 0.62);
  p.vline(x, top, g - 1, blade);
  const gw = Math.max(1, Math.round(h * 0.2));
  p.hline(x - gw, x + gw, g, gold);
  p.vline(x, g + 1, top + h - 2, C.wood3);
  p.set(x, top + h - 1, gold);
}

/** 부서진 건물 실루엣 줄 */
function ruins(p: Pix, seed: number, base: number, hMin: number, hMax: number, col: number, edge: number, windows?: number) {
  const r = rng(seed);
  for (let x = -3; x < W; ) {
    const w = 6 + Math.floor(r() * 12);
    const h = hMin + Math.floor(r() * (hMax - hMin));
    // 무너진 윗선: 계단처럼 깎인다
    let top = base - h;
    for (let i = 0; i < w; i++) {
      if (r() < 0.3) top += Math.floor(r() * 5) - 2;
      top = Math.max(base - h - 3, Math.min(base - 2, top));
      p.vline(x + i, top, H - 1, col);
      p.set(x + i, top, edge);
    }
    if (windows !== undefined) {
      for (let wy = base - h + 4; wy < base - 2; wy += 5) {
        for (let wx = x + 2; wx < x + w - 2; wx += 4) {
          if (r() < 0.35) p.rect(wx, wy, 2, 2, r() < 0.5 ? windows : C.ember2);
        }
      }
    }
    x += w + (r() < 0.3 ? 2 + Math.floor(r() * 4) : 0);
  }
}

/** 벚나무 (분홍 구름 같은 꽃잎 덩어리) */
function sakura(p: Pix, x: number, y: number, rx: number, ry: number, seed: number) {
  const r = rng(seed);
  // 줄기와 가지
  p.poly([[x - 3, H], [x + 3, H], [x + 2, y + ry * 0.4], [x - 1, y + ry * 0.4]], (px) => (px < x ? C.wood3 : C.wood4));
  for (let k = 0; k < 4; k++) {
    const a = -Math.PI / 2 + (k - 1.5) * 0.7;
    p.line(x, y + ry * 0.5, x + Math.cos(a) * rx * 0.7, y + ry * 0.5 + Math.sin(a) * ry * 0.8, C.wood3);
  }
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    const cx = x + Math.cos(a) * rx * d * 0.85;
    const cy = y + Math.sin(a) * ry * d * 0.8;
    const s = 4 + r() * 5;
    p.ellipse(cx, cy, s, s * 0.8, (px, py) => {
      const t = (py - (y - ry)) / (2 * ry);
      if (py < cy - s * 0.3 && px < cx + s * 0.2) return C.pink0;
      if (t > 0.65) return bayer(px, py) < 6 ? C.pink2 : C.pink1;
      return bayer(px, py) < 3 ? C.pink0 : C.pink1;
    });
  }
  for (let i = 0; i < 18; i++) p.set(x + (r() - 0.5) * rx * 1.6, y + (r() - 0.5) * ry * 1.4, C.white);
}

/** 불꽃놀이 한 송이 */
function firework(p: Pix, x: number, y: number, rad: number, ramp: Ramp, seed: number) {
  const r = rng(seed);
  p.glow(x, y, rad * 1.1, ramp[3], 4);
  const n = 22;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.1;
    const len = rad * (0.75 + r() * 0.25);
    for (let d = rad * 0.25; d < len; d += 1.4) {
      const t = d / len;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d + t * t * 2.5;
      p.set(px, py, t < 0.45 ? ramp[0] : t < 0.8 ? ramp[1] : ramp[2]);
    }
    p.set(x + Math.cos(a) * len, y + Math.sin(a) * len + 2.5, C.white);
  }
  p.set(x, y, C.white);
}

/** 둥근 종이 등불 */
function paperLantern(p: Pix, x: number, y: number, body: number) {
  p.set(x, y - 3, C.slate0);
  p.hline(x - 1, x + 1, y - 2, C.ink);
  p.ellipse(x + 0.5, y + 1, 2.6, 2.6, (px, py) => (py < y ? nearest(mix(body, C.gold0, 0.45)) : body));
  p.hline(x - 1, x + 1, y + 4, C.ink);
}

const doom_vision: SceneFn = (p) => {
  p.gradV(0, 0, W, 72, [C.ink, C.red3, C.red2, C.ember2, C.ember]);
  // 검은 태양
  const sx = 80;
  const sy = 26;
  const sr = 12;
  light(p, sx, sy, sr * 3.4, C.ember, 0.75);
  light(p, sx, sy, sr * 2, C.gold1, 0.6);
  const r = rng(66);
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2 + r() * 0.08;
    const len = sr + 4 + r() * (k % 3 === 0 ? 20 : 9);
    for (let d = sr + 1; d < len; d++) {
      const t = (d - sr) / (len - sr);
      p.set(sx + Math.cos(a) * d, sy + Math.sin(a) * d, t < 0.3 ? C.gold0 : t < 0.65 ? C.gold1 : C.ember);
    }
  }
  p.ellipse(sx, sy, sr + 1.6, sr + 1.6, C.gold0);
  p.ellipse(sx, sy, sr + 0.6, sr + 0.6, C.red1);
  p.ellipse(sx, sy, sr, sr, (x, y) => (Math.hypot(x + 0.5 - sx, y + 0.5 - sy) > sr - 1.2 ? C.red3 : C.ink));
  // 재 구름
  for (const [cx, cy, w] of [[20, 42, 34], [146, 36, 26], [66, 50, 28], [118, 52, 40]] as [number, number, number][]) {
    p.ellipse(cx, cy, w, 3.4, C.red3);
    p.ellipse(cx + 3, cy + 0.6, w * 0.75, 2, C.ink);
    p.hline(Math.round(cx - w * 0.6), Math.round(cx + w * 0.3), Math.round(cy - 3), C.red2);
  }
  // 떨어지는 유성
  for (const [x0, y0, x1, y1] of [[18, 2, 34, 30], [124, 0, 142, 26], [150, 8, 156, 20]] as [number, number, number, number][]) {
    p.line(x0, y0, x1, y1, C.ember2);
    p.line((x0 + x1) / 2, (y0 + y1) / 2, x1, y1, C.ember);
    p.ellipse(x1, y1, 1.6, 1.6, C.gold0);
    p.glow(x1, y1, 5, C.gold1, 8);
  }
  // 무너진 도시 (먼 줄, 가까운 줄)
  ruins(p, 4, 60, 6, 18, C.red3, C.red2);
  // 꺾인 첨탑
  p.rect(30, 30, 8, 32, C.red3);
  p.poly([[30, 30], [38, 30], [44, 16], [40, 14]], C.red3);
  p.rect(118, 24, 10, 38, C.red3);
  p.poly([[117, 24], [129, 24], [123, 8]], C.red3);
  p.poly([[123, 8], [129, 24], [126, 24]], C.ink);
  within(p, (x) => x < 26 || x > 60, () => ruins(p, 9, 72, 6, 16, C.ink, C.red3, C.ember));
  // 아카데미 탑의 잔해 (가까운 줄)
  p.rect(96, 42, 14, 34, C.ink);
  p.poly([[96, 42], [110, 42], [112, 36], [104, 40], [100, 33], [98, 38]], C.ink);
  p.vline(96, 42, 75, C.red3);
  for (const [wx, wy] of [[100, 48], [105, 54], [100, 62]] as [number, number][]) p.rect(wx, wy, 2, 3, C.ember);
  // 연기 기둥
  for (const [fx, fy] of [[20, 62], [70, 64], [104, 36], [140, 60]] as [number, number][]) {
    for (let y = fy; y > fy - 34; y--) {
      const t = (fy - y) / 34;
      const cx = fx + t * t * 16 + Math.sin(y * 0.3) * 1.5;
      const w = 2 + t * 6;
      for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
        const e = Math.abs(x - cx) / w;
        const dens = (1 - t * 0.75) * (1 - e * e);
        if (dens > 0.5 || bayer(x, y) < dens * 24) p.set(x, y, t < 0.4 ? C.night0 : C.red3);
      }
    }
    fire(p, fx, fy + 2, 7, 6, fx);
    p.glow(fx, fy - 2, 10, C.ember2, 7);
  }
  // 갈라진 땅
  p.gradV(0, 74, W, 16, [C.night0, C.ink]);
  const cr = rng(5);
  for (let k = 0; k < 7; k++) {
    let x = cr() * W;
    let y = 75 + cr() * 4;
    for (let s = 0; s < 14; s++) {
      const nx = x + (cr() - 0.5) * 10;
      const ny = y + 1 + cr() * 2;
      p.line(x, y, nx, ny, s < 6 ? C.ember : C.red1);
      x = nx;
      y = ny;
    }
  }
  // 잔해 위에 선 사람 (뒷모습, 망토)
  p.poly([[22, 90], [34, 76], [50, 75], [62, 90]], C.ink);
  p.line(34, 76, 50, 75, C.red2);
  rimmed(p, C.red1, (q) => {
    q.sprite(34, 59, [
      '....hhh.......',
      '...hhhhh......',
      '...hhhhh......',
      '....hhh.......',
      '...bbbbbcc....',
      '..bbbbbbbccc..',
      '..bbbbbbbcccc.',
      '..bbbbbbbccccc',
      '..b.bbbb.ccccc',
      '..b.bbbb..cccc',
      '....bbbb...ccc',
      '....bbbb....cc',
      '....b..b......',
      '....b..b......',
      '....b..b......',
      '...bb..bb.....',
    ], { h: C.ink, b: C.ink, c: C.night0 });
  });
  // 날리는 불씨와 재
  const er = rng(9);
  for (let i = 0; i < 40; i++) {
    const x = er() * W;
    const y = er() * 86;
    p.set(x, y, er() < 0.5 ? C.ember : er() < 0.5 ? C.gold1 : C.mist0);
  }
};

const academy_gate: SceneFn = (p) => {
  sky(p, 'day', 56);
  clouds(p, 12, 'day', 26, 3);
  ridge(p, 4, 46, 6, RAMP.greenCloth[2], 24);
  castle(p, 80, 44, 0.75, [C.mist2, C.mist1, C.mist0, C.slate1], [C.blue1, C.blue1, C.blue2, C.blue3], false, 7);
  // 안쪽 길과 잔디
  p.gradV(0, 44, W, 46, [C.leaf1, C.leaf2]);
  p.poly([[76, 44], [84, 44], [102, 62], [58, 62]], (x, y) => (bayer(x, y) < 3 ? C.mist1 : C.mist2));
  for (const x of [70, 90]) roundTree(p, x, 50, 4, RAMP.greenCloth);
  // 담장
  bricks(p, 0, 36, 56, 24, STONE, 8, 4);
  bricks(p, 104, 36, 56, 24, STONE, 8, 4);
  for (let x = 0; x < 56; x += 6) p.rect(x, 33, 4, 3, C.mist0);
  for (let x = 106; x < W; x += 6) p.rect(x, 33, 4, 3, C.mist0);
  p.hline(0, 55, 36, C.mist2);
  p.hline(104, W - 1, 36, C.mist2);
  // 앞쪽 길
  p.gradV(0, 60, W, 30, [C.leaf2, C.leaf3]);
  p.poly([[58, 62], [102, 62], [150, 90], [10, 90]], (x, y) => {
    const z = 600 / (y - 40);
    const row = Math.floor(z * 1.2);
    const u = ((x - 80) * z) / 120 + (row % 2) * 0.5;
    return (z * 1.2) % 1 < 0.12 || Math.abs(u % 1) < 0.08 ? C.mist0 : (row + Math.floor(u)) % 3 === 0 ? C.mist1 : C.mist2;
  });
  // 기둥
  for (const px of [48, 102]) {
    p.rect(px, 16, 10, 48, C.mist1);
    p.vline(px, 16, 63, C.white);
    p.vline(px + 9, 16, 63, C.mist0);
    p.rect(px - 2, 12, 14, 4, C.mist2);
    p.hline(px - 2, px + 11, 12, C.white);
    p.rect(px - 1, 60, 12, 4, C.mist0);
    p.rect(px + 2, 26, 6, 8, C.blue2);
    p.poly([[px + 2, 34], [px + 8, 34], [px + 5, 37]], C.blue2);
    swordMark(p, px + 5, 27, 9, C.white, C.gold1);
    // 기둥 위 등
    p.rect(px + 3, 6, 4, 6, C.slate0);
    p.rect(px + 4, 7, 2, 4, C.gold1);
    p.poly([[px + 2, 6], [px + 8, 6], [px + 5, 2]], C.slate0);
  }
  // 철제 아치와 문장
  for (let x = 58; x <= 102; x++) {
    const t = (x - 80) / 22;
    const y = Math.round(20 - (1 - t * t) * 9);
    p.set(x, y, C.ink);
    p.set(x, y + 1, C.slate0);
    p.set(x, y + 5, C.slate0);
    if (x % 4 === 0) p.vline(x, y + 1, y + 5, C.slate0);
  }
  for (const cx of [66, 94]) ring(p, cx, 17, 2, 2, C.slate0);
  p.poly([[74, 4], [86, 4], [86, 11], [80, 16], [74, 11]], C.blue2);
  p.poly([[75, 5], [85, 5], [85, 10], [80, 14], [75, 10]], C.blue1);
  swordMark(p, 80, 5, 9, C.white, C.gold1);
  p.hline(74, 86, 4, C.gold2);
  // 열린 철문 (안쪽으로)
  for (const [x0, x1, dir] of [[58, 68, 1], [102, 92, -1]] as [number, number, number][]) {
    for (let x = x0; dir > 0 ? x <= x1 : x >= x1; x += dir) {
      const t = Math.abs(x - x0) / Math.abs(x1 - x0);
      const top = Math.round(26 + t * 5);
      const bot = Math.round(62 - t * 3);
      if ((x - x0) % 2 === 0) {
        p.vline(x, top, bot, C.ink);
        p.set(x, top - 1, C.gold1);
      }
      p.set(x, top + 2, C.slate0);
      p.set(x, Math.round((top + bot) / 2), C.slate0);
      p.set(x, bot - 2, C.slate0);
    }
  }
  // 벚나무
  sakura(p, 16, 16, 30, 20, 3);
  sakura(p, 146, 14, 28, 20, 4);
  // 신입생들
  const fresh: [number, number, number, boolean][] = [
    [71, 56, C.wood2, true],
    [86, 58, C.blond1, true],
    [62, 64, C.ink, true],
    [94, 66, C.red2, true],
    [76, 70, C.wood3, true],
    [112, 70, C.blond2, false],
  ];
  fresh.forEach(([x, y, hair, back]) => {
    if (back) backFigure(p, x, y, hair, RAMP.uniform[1], RAMP.uniform[2]);
    else figure(p, x, y, hair, RAMP.uniform[1], { flip: true, pants: RAMP.uniform[2] });
    p.rect(x + 5, y + 6, 2, 3, C.wood2);
  });
  // 흩날리는 꽃잎
  const r = rng(77);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(r() * H);
    const c = r() < 0.5 ? C.pink0 : C.pink1;
    p.set(x, y, c);
    if (r() < 0.4) p.set(x + 1, y + 1, C.pink2);
  }
};

const great_hall: SceneFn = (p) => {
  const vx = 80;
  const vy = 36;
  const F = 70;
  const E = 1.8;
  const HW = 4;
  const ZB = 9;
  const P = proj(vx, vy, F);
  p.fill(C.slate1);
  // 옆벽
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const z = (F * HW) / Math.abs(x + 0.5 - vx);
      if (z > ZB) continue;
      const Y = (-(y + 0.5 - vy) * z) / F;
      p.set(x, y, (Y + 10) % 1.2 < 0.06 && (F * 1.2) / z > 3 ? C.slate0 : Math.floor(z * 2) % 2 ? C.slate2 : C.slate1);
    }
  }
  // 뒷벽과 큰 창
  const [bx0, by] = P(-HW, -E, ZB);
  const [bx1] = P(HW, -E, ZB);
  p.rect(bx0, 0, bx1 - bx0, by, C.mist0);
  p.rect(64, 0, 32, 40, C.slate1);
  within(p, (x, y) => x > 65 && x < 95 && y < 38 && (y > 12 || Math.hypot((x + 0.5 - 80) / 14.5, (y + 0.5 - 12) / 12) < 1), () => {
    for (let y = 0; y < 40; y++) {
      for (let x = 64; x < 96; x++) {
        const cell = (Math.floor(x / 4) * 3 + Math.floor(y / 5) * 5) % 7;
        p.set(x, y, x % 4 === 0 || y % 5 === 0 ? C.slate0 : [C.blue1, C.blue2, C.sky1, C.blue2, C.violet2, C.blue1, C.teal2][cell]);
      }
    }
  });
  p.vline(80, 0, 38, C.slate1);
  p.vline(72, 4, 38, C.slate1);
  p.vline(88, 4, 38, C.slate1);
  p.hline(66, 94, 24, C.slate1);
  ring(p, 80, 12, 6, 6, C.slate1);
  // 바닥과 붉은 융단
  tileFloor(p, Math.round(by), vx, vy, F, E, 1, (i, j) => ((i + j) % 2 ? C.mist1 : C.mist2), C.mist0);
  p.poly([P(-0.8, -E, ZB), P(0.8, -E, ZB), P(0.8, -E, 1.5), P(-0.8, -E, 1.5)], (x, y) => ((x + y) % 11 === 0 ? C.red1 : C.red2));
  for (const s of [-1, 1]) {
    const a = P(s * 0.8, -E, ZB);
    const b = P(s * 0.8, -E, 1.5);
    p.line(a[0], a[1], b[0], b[1], C.gold2);
  }
  // 기둥과 깃발 (먼 것부터)
  const banners = [C.red2, C.blue2];
  for (const z of [8.2, 6.6, 5.1, 3.8, 2.7]) {
    for (const side of [-1, 1]) {
      const [cx, fy] = P(side * HW * 0.92, -E, z);
      const w = Math.max(3, Math.round(70 / z / 2.4));
      const x0 = Math.round(cx - w / 2);
      p.rect(x0, 0, w, Math.round(fy), C.mist1);
      p.vline(side < 0 ? x0 + w - 1 : x0, 0, Math.round(fy) - 1, C.mist2);
      p.vline(side < 0 ? x0 : x0 + w - 1, 0, Math.round(fy) - 1, C.slate2);
      p.rect(x0 - 1, Math.round(fy) - 2, w + 2, 2, C.mist0);
      // 깃발: 기둥 안쪽
      const [bx, btop] = P(side * HW * 0.7, 3.2, z);
      const [, bbot] = P(side * HW * 0.7, -0.2, z);
      const bw = Math.max(3, Math.round(70 / z / 2));
      const bxl = Math.round(bx - bw / 2);
      const col = banners[(Math.round(z * 10) + (side > 0 ? 1 : 0)) % 2];
      p.rect(bxl, Math.max(0, Math.round(btop)), bw, Math.round(bbot - Math.max(0, btop)), col);
      p.poly([[bxl, bbot], [bxl + bw, bbot], [bxl + bw / 2, bbot + bw / 2]], col);
      p.vline(bxl, Math.max(0, Math.round(btop)), Math.round(bbot), nearest(mix(col, C.white, 0.25)));
      const ey = Math.round((Math.max(0, btop) + bbot) / 2);
      const mh = Math.max(5, Math.round(bw * 1.4));
      swordMark(p, bxl + Math.floor(bw / 2), ey - Math.round(mh / 2), mh, C.gold0, C.gold1);
    }
  }
  // 단상과 받침돌
  for (let k = 0; k < 3; k++) {
    const y = by - 3 - k * 3;
    p.rect(bx0 + 4 + k * 5, y, bx1 - bx0 - 8 - k * 10, 3, k % 2 ? C.mist1 : C.mist2);
    p.hline(bx0 + 4 + k * 5, bx1 - 5 - k * 5, y, C.white);
  }
  p.rect(70, by - 13, 20, 4, C.slate1);
  p.hline(70, 89, by - 13, C.slate2);
  p.poly([[72, by - 13], [88, by - 13], [86, by - 19], [74, by - 19]], C.slate2);
  p.hline(74, 85, by - 19, C.mist0);
  p.line(76, by - 17, 79, by - 14, C.slate1);
  // 교사들
  figure(p, 58, by - 22, C.mist1, C.violet3, { pants: C.violet4 });
  figure(p, 96, by - 22, C.ink, C.blue3, { flip: true, pants: C.blue3 });
  // 샹들리에 사슬
  p.vline(80, 0, 6, C.gold3);
  p.line(80, 2, 66, 9, C.gold3);
  p.line(80, 2, 94, 9, C.gold3);
  // 앞줄 학생들 (뒷모습)
  const hairs = [C.wood2, C.blond1, C.ink, C.red2, C.wood3, C.mist1, C.blond2, C.ember2];
  const hr = rng(12);
  for (const [y, s, step] of [[74, 1.2, 13], [84, 1.5, 15]] as [number, number, number][]) {
    for (let x = 6 + (s > 1.3 ? 6 : 0); x < W; x += step) {
      if (Math.abs(x - 80) < 14 * s) continue;
      backHead(p, x + (hr() - 0.5) * 3, y, hairs[Math.floor(hr() * hairs.length)], RAMP.uniform[1], s);
    }
  }
  // 성검의 빛
  const sx = 80;
  const swy = by - 19;
  light(p, sx, swy - 10, 46, C.gold1, 0.45);
  light(p, sx, swy - 10, 20, C.gold0, 0.6);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const len = k % 2 ? 14 : 24;
    for (let d = 6; d < len; d++) if (bayer(Math.round(sx + Math.cos(a) * d), Math.round(swy - 10 + Math.sin(a) * d)) < (1 - d / len) * 16) p.set(sx + Math.cos(a) * d, swy - 10 + Math.sin(a) * d, C.gold0);
  }
  p.rect(sx - 2, swy - 21, 5, 20, C.slate0);
  p.rect(sx - 1, swy - 20, 3, 18, C.white);
  p.vline(sx + 1, swy - 20, swy - 3, C.silver1);
  p.set(sx, swy - 21, C.white);
  p.hline(sx - 5, sx + 5, swy - 21, C.gold1);
  p.hline(sx - 4, sx + 4, swy - 22, C.gold0);
  p.rect(sx - 1, swy - 26, 3, 4, C.blue2);
  p.ellipse(sx + 0.5, swy - 27, 1.6, 1.6, C.gold1);
  p.set(sx, swy - 27, C.sky0);
  // 샹들리에 촛불
  ring(p, 80, 10, 15, 2.6, C.gold2);
  ring(p, 80, 10.6, 15, 2.6, C.gold3);
  for (let k = 0; k < 10; k++) {
    const [cx, cy] = onEllipse(80, 10, 15, 2.6, (k / 10) * Math.PI * 2);
    if (cy < 10 && k % 2) continue;
    p.glow(cx, cy - 3, 4, C.gold2, 8);
    p.vline(cx, cy - 2, cy - 1, C.white);
    p.set(cx, cy - 3, C.gold0);
  }
};

const exam_field: SceneFn = (p) => {
  sky(p, 'day', 44);
  clouds(p, 21, 'day', 18, 3);
  ridge(p, 6, 30, 5, RAMP.greenCloth[2], 26);
  castle(p, 136, 28, 0.42, [C.mist2, C.mist1, C.mist0, C.slate1], [C.blue1, C.blue1, C.blue2, C.blue3], false, 2);
  // 관람석 (반원 계단)
  const cr = rng(31);
  const crowd = [C.red2, C.blue2, C.gold2, C.leaf2, C.violet2, C.wood2, C.pink2];
  for (let k = 0; k < 7; k++) {
    const rx = 108 - k * 5;
    const ry = 50 - k * 3.6;
    p.ellipse(80, 74, rx, ry, (x, y) => (y > 62 ? -1 : k % 2 ? C.mist0 : C.mist1));
    for (let i = 0; i < 26; i++) {
      const a = Math.PI + 0.25 + cr() * (Math.PI - 0.5);
      const [x, y] = onEllipse(80, 74, rx - 2.5, ry - 2.5, a);
      if (y > 56 || cr() < 0.35) continue;
      p.set(x, y - 1, cr() < 0.5 ? C.wood3 : C.ink);
      p.set(x, y, crowd[Math.floor(cr() * crowd.length)]);
    }
  }
  p.ellipse(80, 74, 73, 15.5, C.slate2);
  // 심사석 천막
  p.rect(66, 24, 2, 12, C.wood3);
  p.rect(92, 24, 2, 12, C.wood3);
  awning(p, 62, 18, 36, 6, C.blue1, C.white, 4);
  p.poly([[78, 9], [86, 11], [78, 13]], C.red1);
  p.vline(78, 9, 18, C.wood3);
  for (const x of [72, 80, 86]) {
    p.rect(x, 28, 4, 3, x === 80 ? C.violet3 : C.blue3);
    p.rect(x, 26, 4, 2, C.skin1);
    p.hline(x, x + 3, 25, x === 80 ? C.mist1 : C.ink);
  }
  // 원형 시험장
  p.ellipse(80, 72, 72, 15, (x, y) => (bayer(x, y) < 2 ? C.blond2 : C.blond1));
  ring(p, 80, 72, 70, 14.4, C.white);
  ring(p, 80, 72, 30, 6, C.white);
  for (let k = 0; k < 12; k++) {
    const [x, y] = onEllipse(80, 72, 50, 10.3, (k / 12) * Math.PI * 2);
    p.hline(x - 1, x + 1, y, C.mist2);
  }
  p.gradV(0, 86, W, 4, [C.leaf2, C.leaf3]);
  p.ellipse(80, 72, 72, 15, (x, y, d) => (y > 85 && d < 1 ? C.blond2 : -1));
  // 표적
  for (const [tx, ty, s] of [[46, 58, 1], [80, 56, 1], [114, 58, 1]] as [number, number, number][]) {
    p.line(tx - 3, ty + 8, tx - 1, ty + 2, C.wood2);
    p.line(tx + 3, ty + 8, tx + 1, ty + 2, C.wood2);
    p.ellipse(tx, ty, 6 * s, 6 * s, C.white);
    p.ellipse(tx, ty, 4.8 * s, 4.8 * s, C.red1);
    p.ellipse(tx, ty, 3.4 * s, 3.4 * s, C.white);
    p.ellipse(tx, ty, 2 * s, 2 * s, C.red1);
    p.ellipse(tx, ty, 0.9, 0.9, C.gold1);
    p.ellipse(tx, ty, 6 * s, 6 * s, (x, y, d) => (d > 0.8 && x > tx ? C.mist1 : -1));
  }
  // 그을린 표적과 꽂힌 화살
  p.set(44, 57, C.ink);
  p.set(45, 59, C.slate0);
  p.line(113, 57, 118, 53, C.wood1);
  p.set(119, 52, C.white);
  // 줄 선 수험생과 심사관
  const hairs = [C.wood2, C.blond1, C.ink, C.red2, C.wood3];
  hairs.forEach((h, i) => figure(p, 8 + i * 9, 70 + (i % 2), h, RAMP.uniform[1], { pants: RAMP.uniform[2] }));
  figure(p, 136, 70, C.mist1, C.violet3, { flip: true, pants: C.violet4 });
  p.rect(133, 75, 4, 5, C.blond0);
  p.hline(133, 136, 76, C.mist0);
  // 마법을 쏘는 학생
  backFigure(p, 76, 72, C.wood2, RAMP.uniform[1], RAMP.uniform[2]);
  p.line(82, 77, 84, 74, RAMP.uniform[1]);
  p.set(84, 73, C.skin1);
  for (let k = 0; k < 18; k++) {
    const t = k / 18;
    const x = 85 - t * 4;
    const y = 72 - t * 13;
    p.glow(x, y, 2 + t * 2.4, C.violet1, 9);
  }
  p.ellipse(81, 58, 3, 3, C.violet0);
  p.glow(81, 58, 7, C.violet1, 9);
  p.ellipse(81, 58, 1.6, 1.6, C.white);
  sparkle(p, 86, 66, C.white, C.violet0);
};

const blood_circle: SceneFn = (p) => {
  p.fill(C.ink);
  // 둥근 방의 벽과 아치
  bricks(p, 0, 0, W, 54, DARK_STONE, 10, 5);
  p.map((c, x, y) => (y < 54 ? nearest(mix(c, C.ink, 0.35 + Math.abs(x - 80) / 220)) : c));
  for (const ax of [30, 130]) {
    p.rect(ax - 12, 18, 24, 36, C.ink);
    p.ellipse(ax, 18, 12, 10, C.ink);
    p.ellipse(ax, 18, 12, 10, (x, y, d) => (d > 0.82 && y < 18 ? C.slate0 : -1));
  }
  // 가운데 벽의 문양
  ring(p, 80, 22, 9, 9, C.red3);
  ring(p, 80, 22, 7, 7, C.red3);
  {
    const tri = [0, 1, 2].map((i) => onEllipse(80, 22, 7, 7, Math.PI / 2 + (i * Math.PI * 2) / 3));
    for (let i = 0; i < 3; i++) p.line(tri[i][0], tri[i][1], tri[(i + 1) % 3][0], tri[(i + 1) % 3][1], C.red3);
  }
  for (const cx of [8, 54, 106, 152]) {
    p.rect(cx - 5, 0, 10, 56, C.slate0);
    p.vline(cx - 5, 0, 55, C.slate1);
    p.vline(cx + 4, 0, 55, C.night1);
    p.rect(cx - 7, 52, 14, 4, C.slate1);
    p.rect(cx - 6, 0, 12, 3, C.slate1);
  }
  // 사슬
  for (const [x, len] of [[44, 20], [116, 14]] as [number, number][]) {
    for (let y = 0; y < len; y++) p.set(x + (y % 4 < 2 ? 0 : 1), y, y % 2 ? C.slate1 : C.slate0);
  }
  // 바닥
  tileFloor(p, 56, 80, 30, 70, 1.4, 0.9, (i, j) => ((i + j) % 2 ? C.night1 : C.slate0), C.ink);
  p.hline(0, W - 1, 56, C.ink);
  // 해골과 뼈
  p.sprite(14, 66, ['.www.', 'wwwww', 'wkwkw', '.www.', '.w.w.'], { w: C.mist0, k: C.ink });
  p.line(20, 71, 27, 69, C.mist0);
  p.line(138, 74, 146, 77, C.mist0);
  // 마법진
  const cx = 80;
  const cy = 72;
  const rx = 48;
  const ry = 11;
  light(p, cx, cy, 90, C.red2, 0.45, 0.45);
  light(p, cx, 40, 90, C.red3, 0.35, 0.7);
  light(p, cx, cy, 56, C.red1, 0.35, 0.3);
  ring(p, cx, cy, rx + 0.6, ry + 0.3, C.red2);
  ring(p, cx, cy, rx, ry, C.red1);
  ring(p, cx, cy, rx - 4, ry - 1, C.red0);
  ring(p, cx, cy, rx * 0.4, ry * 0.4, C.red1);
  for (let k = 0; k < 30; k++) {
    const [x, y] = onEllipse(cx, cy, rx - 2, ry - 0.5, (k / 30) * Math.PI * 2);
    p.set(x, y, k % 3 ? C.red2 : C.pink0);
  }
  const star = [0, 1, 2, 3, 4].map((i) => onEllipse(cx, cy, rx - 4, ry - 1, -Math.PI / 2 + (i * Math.PI * 2) / 5));
  for (let i = 0; i < 5; i++) {
    const a = star[i];
    const b = star[(i + 2) % 5];
    p.line(a[0], a[1], b[0], b[1], C.red1);
  }
  // 로브 입은 그림자
  const fx = 80;
  const fy = 68;
  rimmed(p, C.red2, (p) => {
  p.poly([[fx - 3, fy - 28], [fx + 3, fy - 28], [fx + 5, fy - 22], [fx + 10, fy - 14], [fx + 9, fy], [fx - 9, fy], [fx - 10, fy - 14], [fx - 5, fy - 22]], C.night0);
  p.poly([[fx, fy - 33], [fx + 4, fy - 26], [fx + 4, fy - 21], [fx - 4, fy - 21], [fx - 4, fy - 26]], C.ink);
  p.poly([[fx - 5, fy - 21], [fx - 16, fy - 26], [fx - 17, fy - 23], [fx - 6, fy - 16]], C.night0);
  p.poly([[fx + 5, fy - 21], [fx + 16, fy - 26], [fx + 17, fy - 23], [fx + 6, fy - 16]], C.night0);
  });
  p.ellipse(fx, fy - 23, 2.4, 2.2, C.ink);
  p.set(fx - 1, fy - 23, C.red0);
  p.set(fx + 1, fy - 23, C.red0);
  for (let y = fy - 26; y < fy; y++) {
    const t = (y - (fy - 28)) / 28;
    const ex = Math.round(fx - 5 - t * 5);
    if (p.get(ex, y) === C.night0) p.set(ex, y, C.red3);
    if (p.get(ex + 1, y) === C.night0 && y > fy - 10) p.set(ex + 1, y, C.red2);
    const ex2 = Math.round(fx + 5 + t * 4);
    if (p.get(ex2, y) === C.night0) p.set(ex2, y, C.red3);
  }
  p.hline(fx - 9, fx + 9, fy - 1, C.red2);
  p.vline(fx, fy - 18, fy - 2, C.ink);
  // 손 위의 붉은 기운
  for (const hx of [fx - 17, fx + 17]) {
    light(p, hx, fy - 26, 9, C.red1, 0.7);
    sparkle(p, hx, fy - 26, C.pink0, C.red1);
  }
  // 촛불 (붉은 불꽃)
  for (let k = 0; k < 6; k++) {
    const [x, y] = onEllipse(cx, cy, rx + 6, ry + 3, (k / 6) * Math.PI * 2);
    p.rect(x, y - 3, 2, 4, C.mist1);
    p.set(x, y - 4, C.red1);
    p.set(x, y - 5, C.pink0);
    light(p, x + 0.5, y - 5, 7, C.red1, 0.45);
  }
  // 피어오르는 붉은 안개
  const mr = rng(13);
  for (let i = 0; i < 14; i++) {
    const x = cx - rx + mr() * rx * 2;
    const y = cy - 2 - mr() * 26;
    p.set(x, y, mr() < 0.5 ? C.red2 : C.red1);
  }
};

const festival: SceneFn = (p) => {
  sky(p, 'night', 64);
  stars(p, 71, 40, 40);
  // 불꽃
  firework(p, 36, 20, 15, [C.gold0, C.gold1, C.ember, C.gold3], 1);
  firework(p, 118, 18, 13, [C.pink0, C.pink1, C.pink2, C.violet3], 2);
  firework(p, 76, 9, 7, [C.teal0, C.teal1, C.teal2, C.teal3], 3);
  firework(p, 148, 32, 6, [C.violet0, C.violet1, C.violet2, C.violet4], 4);
  for (let y = 60; y > 38; y--) if (y % 2) p.set(62 + (60 - y) * 0.15, y, y > 50 ? C.gold3 : C.gold1);
  // 언덕 위 아카데미
  ridge(p, 7, 50, 6, C.night1, 30);
  castle(p, 80, 50, 0.6, [C.slate1, C.slate0, C.night1, C.ink], [C.night1, C.night1, C.night0, C.ink], true, 6);
  p.rect(0, 50, W, 40, C.night1);
  // 노점
  for (const [sx, sw, c1, c2] of [[2, 44, C.red2, C.mist1], [114, 44, C.ember2, C.mist1]] as [number, number, number, number][]) {
    p.rect(sx + 2, 50, 2, 24, C.wood3);
    p.rect(sx + sw - 4, 50, 2, 24, C.wood3);
    p.rect(sx + 3, 52, sw - 6, 12, C.wood4);
    awning(p, sx, 44, sw, 7, c1, c2);
    p.rect(sx + 2, 62, sw - 4, 3, C.wood1);
    p.rect(sx + 3, 65, sw - 6, 9, C.wood2);
  }
  // 사탕 사과와 가면
  for (let x = 8; x < 42; x += 4) {
    p.vline(x, 58, 61, C.wood1);
    p.ellipse(x + 0.5, 57, 1.6, 1.6, C.red1);
  }
  for (let x = 120; x < 154; x += 7) {
    p.ellipse(x + 2, 57, 2.6, 3, x % 2 ? C.white : C.gold0);
    p.set(x + 1, 56, C.ink);
    p.set(x + 3, 56, C.ink);
    p.set(x + 2, 58, C.red1);
  }
  // 광장
  tileFloor(p, 74, 80, 46, 70, 1.4, 0.8, (i, j) => ((i + j) % 2 ? C.slate0 : C.slate1), C.night1);
  p.gradV(0, 64, W, 10, [C.night1, C.slate0]);
  // 사람들 (불꽃을 올려다본다)
  const hairs = [C.wood2, C.blond1, C.ink, C.red2, C.wood3, C.mist1, C.blond2, C.ember2, C.wood2, C.ink];
  const cloth = [C.red2, C.blue2, C.violet2, C.pink2, C.teal2, C.leaf3, C.gold3];
  const people: [number, number][] = [[50, 60], [60, 62], [70, 61], [96, 62], [104, 60], [88, 64], [30, 70], [40, 72], [118, 72], [130, 70], [76, 74], [142, 74], [12, 74]];
  people.forEach(([x, y], i) => backFigure(p, x, y, hairs[i % hairs.length], cloth[(i * 3) % cloth.length]));
  ambient(p, 'night', 0.35);
  // 등불 줄
  const strands: [number, number, number, number, number][] = [
    [4, 44, 156, 44, 13],
    [-2, 6, 162, 2, 7],
  ];
  const lanterns: [number, number, number][] = [];
  strands.forEach(([x0, y0, x1, y1, d], si) => {
    for (let i = 0; i <= 200; i++) {
      const [x, y] = sag(x0, y0, x1, y1, d, i / 200);
      p.set(x, y, C.ink);
    }
    const n = si === 0 ? 12 : 10;
    for (let k = 1; k < n; k++) {
      const [x, y] = sag(x0, y0, x1, y1, d, k / n);
      lanterns.push([x, y + 3, (k + si) % 3 === 0 ? C.gold1 : C.red1]);
    }
  });
  for (const [x, y] of lanterns) light(p, x, y + 1, 12, C.gold2, 0.35);
  for (const [x, y, c] of lanterns) paperLantern(p, Math.round(x), Math.round(y), c);
  // 노점 불빛
  for (const [lx, ly] of [[22, 52], [136, 52]] as [number, number][]) {
    warm(p, lx + 2, ly + 3, 36, 0.55);
    lanternBody(p, lx, ly);
  }
  // 아이가 든 작은 등
  for (const [x, y] of [[44, 79], [125, 79]] as [number, number][]) {
    light(p, x, y, 8, C.gold1, 0.5);
    paperLantern(p, x, y, C.red1);
  }
};

// ---------------------------------------------------------------- 등록

export const MORE_SCENES: Record<string, SceneFn> = {
  home_room,
  mine,
  bookshop,
  back_alley,
  magic_lab,
  chapel,
  canteen,
  market,
  greenhouse,
  clubroom,
  classroom,
  infirmary,
  rooftop,
  doom_vision,
  academy_gate,
  great_hall,
  exam_field,
  blood_circle,
  festival,
};
