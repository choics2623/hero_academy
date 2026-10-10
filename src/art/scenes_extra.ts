// 삽화 3부: 장소 2 (호숫가, 대장간, 시계탑 …). 부품은 scenes.ts, 2부의 도우미는 scenes_more.ts에 있다.
// 구도 규칙: 아래 가운데에는 흉상(64×64)과 대화창이 올라가므로 조용하게 두고, 장소를 알리는 것은 위쪽 60%와 양옆에 둔다.
import { C, RAMP, nearest, type Ramp } from './palette';
import { Pix, bayer, mix, rng } from './pixel';
import { H, SKY, W, ambient, bricks, candle, castle, clouds, figure, moon, noise1, pine, ridge, roundTree, sky, stars, sun, type SceneFn, type Tod } from './scenes';

// ---------------------------------------------------------------- 부품 (2부에서 가져온 것)

const STONE: Ramp = [C.mist1, C.mist0, C.slate2, C.slate1];
const DARK_STONE: Ramp = [C.slate2, C.slate1, C.slate0, C.night1];
const OLD_WOOD: Ramp = [C.wood1, C.wood2, C.wood3, C.wood4];
const PLASTER: Ramp = [C.white, C.mist2, C.mist1, C.mist0];
const BRICK: Ramp = [RAMP.orange[2], C.ember2, C.wood3, C.wood4];
const HAIRS = [C.wood2, C.blond1, C.ink, C.red2, C.wood3, C.mist1, C.blond2, C.ember2];

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
  p.ellipse(x, y - r, r, r, (_px, py) => (py > y - r - 0.5 ? liquid : C.mist2));
  p.set(x - Math.ceil(r / 2), y - r - 1, C.white);
}

/** 병 (가는 원통) */
function bottle(p: Pix, x: number, y: number, liquid: number, h = 6) {
  p.rect(x, y - h, 3, h, liquid);
  p.vline(x, y - h + 1, y - 1, nearest(mix(liquid, C.white, 0.4)));
  p.rect(x + 1, y - h - 2, 1, 2, C.mist1);
  p.set(x + 1, y - h - 3, C.wood2);
}

/** 피어오르는 김 (ambient 뒤에): 구불구불한 띠가 위로 갈수록 옅어진다 */
function steam(p: Pix, seed: number, x: number, y0: number, y1: number, spread = 6, col: number = C.white) {
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
        if (bayer(cx + i, y) < (1 - t) * 26) p.set(cx + i, y, nearest(mix(p.get(cx + i, y), col, a + 0.15)));
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

/** 거꾸로 매단 약초 다발 */
function herbs(p: Pix, x: number, y: number, ramp: Ramp) {
  p.sprite(x - 2, y, ['..w..', '..w..', '.lgl.', '.gGg.', 'lgGgl', 'g.G.g', '..g..'], { w: C.wood3, l: ramp[0], g: ramp[1], G: ramp[2] });
}

// ---------------------------------------------------------------- 부품 (3부)

/** 시간대별 먼 산 / 가까운 산 색 */
function farTones(tod: Tod): [number, number] {
  if (tod === 'night') return [C.night1, C.night0];
  if (tod === 'dusk') return [C.violet3, C.violet4];
  if (tod === 'dawn') return [C.violet2, C.violet3];
  return [C.mist0, C.slate2];
}

/** 하늘 위의 작은 새들 */
function birds(p: Pix, seed: number, n: number, x0: number, x1: number, y0: number, y1: number, c: number = C.slate0) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.round(x0 + r() * (x1 - x0));
    const y = Math.round(y0 + r() * (y1 - y0));
    p.set(x - 1, y - 1, c);
    p.set(x, y, c);
    p.set(x + 1, y - 1, c);
    if (r() < 0.5) {
      p.set(x - 2, y - 1, c);
      p.set(x + 2, y - 1, c);
    }
  }
}

/** 반딧불 (ambient 뒤) */
function fireflies(p: Pix, seed: number, n: number, x0: number, x1: number, y0: number, y1: number, ramp: Ramp = [C.leaf0, C.leaf1, C.leaf2, C.leaf3]) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0);
    const y = y0 + r() * (y1 - y0);
    light(p, x, y, 4, ramp[1], 0.45);
    p.set(x, y, ramp[0]);
  }
}

/** 빗줄기. keep(x, y)가 참인 곳에만 */
function rainfall(p: Pix, seed: number, n: number, keep: (x: number, y: number) => boolean, hi: number = C.mist1, lo: number = C.mist0) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * (W + 10));
    const y = Math.floor(r() * H);
    const len = 5 + Math.floor(r() * 5);
    for (let k = 0; k < len; k++) {
      const px = x - Math.floor(k / 3);
      const py = y + k;
      if (!keep(px, py)) continue;
      p.set(px, py, k >= len - 2 ? hi : nearest(mix(p.get(px, py), lo, 0.55)));
    }
  }
}

/** 톱니바퀴. rot = 돌아간 각도 */
function gear(p: Pix, cx: number, cy: number, r: number, teeth: number, ramp: Ramp, rot = 0, spokes = 5) {
  const q = new Pix(p.w, p.h);
  const tooth = Math.max(2, r * 0.16);
  for (let y = Math.floor(cy - r - tooth - 1); y <= Math.ceil(cy + r + tooth + 1); y++) {
    for (let x = Math.floor(cx - r - tooth - 1); x <= Math.ceil(cx + r + tooth + 1); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx) - rot;
      const k = ((((a / (Math.PI * 2)) * teeth) % 1) + 1) % 1;
      const tip = k < 0.45 ? r + tooth : r;
      if (d > tip) continue;
      const rim = r * 0.78;
      const hub = r * 0.24;
      if (d < rim - 1 && d > hub) {
        const sa = ((((a / (Math.PI * 2)) * spokes) % 1) + 1) % 1;
        const half = (Math.max(1.2, r * 0.09) / Math.max(1, d)) * (spokes / (Math.PI * 2));
        if (sa > half && sa < 1 - half) continue;
      }
      const lit = dx + dy;
      let c = lit < -r * 0.5 ? ramp[0] : lit > r * 0.5 ? ramp[2] : ramp[1];
      if (d > rim - 1 && d < rim) c = ramp[2];
      if (d < hub * 0.45) c = ramp[3];
      q.set(x, y, c);
    }
  }
  q.outline(ramp[3]);
  p.blit(q);
}

/** 서 있는 술통 (위가 좁은 원통) */
function barrel(p: Pix, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++) {
    const t = j / (h - 1);
    const hw = (w / 2) * (0.84 + 0.16 * Math.sin(Math.PI * t));
    const cx = x + w / 2;
    for (let i = Math.round(cx - hw); i < Math.round(cx + hw); i++) {
      const u = (i - (cx - hw)) / (2 * hw);
      let c: number = u < 0.25 ? C.wood1 : u > 0.75 ? C.wood3 : C.wood2;
      if (Math.round((u * w) / 3) % 2 === 0 && u > 0.1 && u < 0.9 && (i - x) % 3 === 0) c = C.wood3;
      if (Math.abs(t - 0.18) < 0.05 || Math.abs(t - 0.82) < 0.05) c = u < 0.3 ? C.slate2 : C.slate1;
      p.set(i, y + j, c);
    }
  }
  p.ellipse(x + w / 2, y + 0.5, w * 0.42, 1.5, C.wood3);
  p.hline(Math.round(x + w * 0.2), Math.round(x + w * 0.8), y, C.wood2);
}

/** 눕힌 술통의 둥근 마구리 */
function barrelEnd(p: Pix, cx: number, cy: number, r: number, tap = true) {
  p.ellipse(cx, cy, r, r, (x, y) => {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    if (d > 0.86) return d > 0.93 ? C.slate0 : C.slate1;
    const ring = Math.floor(d * 5) % 2;
    return (x + y) - (cx + cy) < -r * 0.6 ? C.wood1 : ring ? C.wood2 : nearest(mix(C.wood2, C.wood3, 0.5));
  });
  for (let k = -2; k <= 2; k++) p.vline(Math.round(cx + (k * r) / 3), Math.round(cy - r * 0.7), Math.round(cy + r * 0.7), C.wood3);
  if (tap) {
    p.rect(Math.round(cx) - 1, Math.round(cy + r * 0.45), 3, 2, C.gold3);
    p.set(Math.round(cx), Math.round(cy + r * 0.45) + 2, C.gold2);
  }
}

/** 자루 (끈으로 묶인 위쪽) */
function sack(p: Pix, x: number, base: number, w: number, h: number, c: number = RAMP.cream[2]) {
  const lo = nearest(mix(c, C.wood3, 0.45));
  const hi = nearest(mix(c, C.white, 0.35));
  p.ellipse(x + w / 2, base - h * 0.42, w / 2, h * 0.42, (px, py) => (px - (x + w / 2) + (py - (base - h * 0.42)) * 0.6 > w * 0.18 ? lo : px < x + w * 0.35 && py < base - h * 0.5 ? hi : c));
  p.poly([[x + w * 0.3, base - h * 0.78], [x + w * 0.7, base - h * 0.78], [x + w * 0.62, base - h], [x + w * 0.38, base - h]], c);
  p.hline(Math.round(x + w * 0.36), Math.round(x + w * 0.64), Math.round(base - h * 0.8), C.wood3);
  p.hline(Math.round(x + 1), Math.round(x + w - 2), base - 1, lo);
}

/** 모서리 거미줄. dx, dy = 펼쳐지는 방향 (±1) */
function cobweb(p: Pix, x: number, y: number, s: number, dx: number, dy: number, c: number = C.mist1) {
  const n = 5;
  const pts: [number, number][][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / (n - 1)) * (Math.PI / 2);
    const ex = x + Math.cos(a) * s * dx;
    const ey = y + Math.sin(a) * s * dy;
    p.line(x, y, ex, ey, c);
    pts.push([1, 2, 3].map((m) => [x + Math.cos(a) * s * dx * (m / 3.4), y + Math.sin(a) * s * dy * (m / 3.4)] as [number, number]));
  }
  for (let m = 0; m < 3; m++) {
    for (let k = 0; k + 1 < n; k++) {
      const [ax, ay] = pts[k][m];
      const [bx, by] = pts[k + 1][m];
      const mx = (ax + bx) / 2 - dx * 0.8;
      const my = (ay + by) / 2 - dy * 0.8;
      p.line(ax, ay, mx, my, c);
      p.line(mx, my, bx, by, c);
    }
  }
}

/** 걸린 냄비 (손잡이 고리 위) */
function hangingPot(p: Pix, x: number, y: number, w: number, h: number, ramp: Ramp) {
  p.line(x + 1, y + 2, x + w / 2, y - 2, C.slate1);
  p.line(x + w - 2, y + 2, x + w / 2, y - 2, C.slate1);
  p.set(x + w / 2, y - 3, C.slate0);
  p.rect(x, y + 2, w, h, ramp[1]);
  p.vline(x, y + 2, y + h + 1, ramp[0]);
  p.vline(x + w - 1, y + 2, y + h + 1, ramp[2]);
  p.hline(x, x + w - 1, y + 2, ramp[0]);
  p.hline(x + 1, x + w - 2, y + h + 2, ramp[2]);
  p.set(x + 1, y + 4, C.white);
}

/** 떠 있는 펼친 책 */
function openBook(p: Pix, x: number, y: number, cover: number, tilt = 0) {
  p.poly([[x - 6, y + 1 + tilt], [x, y + 3], [x + 6, y + 1 - tilt], [x + 6, y + 3 - tilt], [x, y + 5], [x - 6, y + 3 + tilt]], cover);
  p.poly([[x - 5, y - 1 + tilt], [x, y + 1], [x, y + 3], [x - 5, y + 1 + tilt]], C.white);
  p.poly([[x + 5, y - 1 - tilt], [x, y + 1], [x, y + 3], [x + 5, y + 1 - tilt]], C.mist2);
  p.set(x - 3, y + 1 + tilt, C.violet2);
  p.set(x + 3, y + 1 - tilt, C.violet2);
}

/** 오른쪽을 보는 말 (약 16×12) */
function horse(p: Pix, x: number, y: number, body: number, flip = false) {
  const dark = nearest(mix(body, C.ink, 0.35));
  const hi = nearest(mix(body, C.white, 0.2));
  p.sprite(x, y, [
    '...........mm...',
    '..........mbbb..',
    '..........bbbbbe',
    '.........mbb..be',
    '..hhhhhhhbb.....',
    '.hbbbbbbbbb.....',
    'tbbbbbbbbbd.....',
    'tbbbbbbbbdd.....',
    't.bd.....bd.....',
    '..b.d....b.d....',
    '..b.d....b.d....',
    '..k.k....k.k....',
  ], { b: body, h: hi, d: dark, m: C.ink, t: C.ink, e: C.ink, k: C.ink }, flip);
}

/** 수레바퀴 */
function wheel(p: Pix, cx: number, cy: number, r: number, c: number = C.wood3) {
  ring(p, cx, cy, r, r, c);
  ring(p, cx, cy, r - 0.7, r - 0.7, c);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI;
    p.line(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r, nearest(mix(c, C.white, 0.15)));
  }
  p.set(cx, cy, C.slate0);
}

/** 창을 든 경비병 (figure 크기) */
function guard(p: Pix, x: number, y: number, tabard: number, flip = false) {
  figure(p, x, y, C.slate2, tabard, { flip, pants: C.slate0 });
  p.hline(x + 1, x + 5, y, C.mist1);
  p.set(x + 3, y - 1, C.mist1);
  p.hline(x + 1, x + 5, y + 1, C.slate2);
  p.set(x + 3, y + 5, C.gold1);
  const sx = flip ? x - 1 : x + 7;
  p.vline(sx, y - 6, y + 13, C.wood2);
  p.set(sx, y - 8, C.mist2);
  p.set(sx, y - 7, C.mist1);
}

// ---------------------------------------------------------------- 바깥

/** 왼쪽 가장자리의 버드나무 (늘어진 가지) */
function willow(p: Pix, seed: number) {
  const r = rng(seed);
  const clumps: [number, number, number, number][] = [[8, 2, 18, 8], [30, 4, 16, 7], [48, 9, 11, 5], [-2, 12, 10, 6], [20, 13, 14, 5], [40, 0, 12, 5]];
  const strand = (dark: boolean) => {
    const [cx, cy, rx, ry] = clumps[Math.floor(r() * clumps.length)];
    const sx = cx + (r() - 0.5) * 1.8 * rx;
    const sy = cy + ry * (0.3 + r() * 0.5);
    const len = 12 + r() * (sx > 4 && sx < 44 ? 44 : 26);
    const ph = r() * 6;
    for (let k = 0; k < len; k++) {
      const x = sx + Math.sin(k * 0.13 + ph) * 1.1 + k * 0.04;
      const y = sy + k;
      const tip = k > len - 3;
      p.set(x, y, dark ? (k % 3 === 0 ? C.leaf3 : C.leaf4) : tip ? C.leaf0 : k % 3 === 0 ? C.leaf1 : C.leaf2);
      if (k % 4 === 1 && !tip) p.set(x + (k % 8 < 4 ? 1 : -1), y, dark ? C.leaf3 : C.leaf1);
    }
  };
  for (let i = 0; i < 34; i++) strand(true);
  // 줄기
  for (let y = 10; y < 88; y++) {
    const t = (y - 10) / 78;
    const cx = 18 + Math.sin(t * 2.4) * 3 - t * 3;
    const hw = 2.5 + t * t * 7;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const u = (x - (cx - hw)) / (2 * hw);
      p.set(x, y, u < 0.28 ? C.wood2 : u > 0.72 ? C.wood4 : (x * 3 + y) % 7 === 0 ? C.wood4 : C.wood3);
    }
  }
  p.line(20, 28, 40, 8, C.wood3);
  p.line(20, 29, 40, 9, C.wood4);
  p.line(17, 22, 4, 8, C.wood3);
  for (const [cx, cy, rx, ry] of clumps) {
    p.ellipse(cx, cy, rx, ry, (x, y) => {
      const k = (x - cx) / rx + (y - cy) / ry;
      if (k < -0.7) return bayer(x, y) < 10 ? C.leaf1 : C.leaf2;
      if (k > 0.5) return bayer(x, y) < 8 ? C.leaf4 : C.leaf3;
      return bayer(x, y) < 4 ? C.leaf3 : C.leaf2;
    });
  }
  for (let i = 0; i < 44; i++) strand(false);
}

const lake: SceneFn = (p, tod) => {
  const night = tod === 'night';
  const HZ = 45;
  const [far, mid] = farTones(tod);
  sky(p, tod, HZ);
  if (night) {
    stars(p, 81, 70, 40);
    moon(p, 64, 13, 5);
  } else if (tod === 'dusk') sun(p, 64, 38, 8, tod);
  else if (tod === 'dawn') sun(p, 96, 40, 6, tod);
  clouds(p, 23, tod, 26, 3);
  if (!night) birds(p, 4, 4, 80, 120, 10, 22);
  // 먼 산과 맞은편 숲
  ridge(p, 5, 36, 9, far, 30, HZ);
  ridge(p, 6, 42, 4, mid, 12, HZ);
  castle(p, 126, 42, 0.48, [C.mist2, C.mist1, C.mist0, C.slate1], [C.blue1, C.blue1, C.blue2, C.blue3], night, 3);
  const tr = rng(12);
  for (let x = -2; x < W + 2; x += 3 + Math.floor(tr() * 3)) {
    if (x > 104 && x < 148) continue;
    const h = 3 + tr() * 4;
    p.ellipse(x, HZ - h / 2, 2.4, h / 2 + 0.5, (px) => (px < x ? C.leaf3 : C.leaf4));
  }
  p.hline(0, W - 1, HZ - 1, C.leaf4);
  // 물: 하늘과 숲이 거꾸로 비친다
  const tint = night ? C.night0 : tod === 'dusk' ? C.violet3 : tod === 'dawn' ? C.violet2 : C.blue2;
  for (let y = HZ; y < 80; y++) {
    const d = y - HZ;
    const sy = HZ - 2 - Math.floor(d * 1.1);
    const wob = Math.round(Math.sin(y * 1.7) * (0.4 + d * 0.05));
    for (let x = 0; x < W; x++) {
      const src = p.get(Math.min(W - 1, Math.max(0, x + wob)), Math.max(0, sy));
      p.set(x, y, nearest(mix(src, tint, 0.28 + (d / 35) * 0.25)));
    }
  }
  const wr = rng(31);
  for (let i = 0; i < 60; i++) {
    const y = HZ + 2 + Math.floor(wr() * 30);
    const x = Math.floor(wr() * W);
    const len = 2 + Math.floor(wr() * (3 + (y - HZ) * 0.3));
    for (let k = 0; k < len; k++) p.set(x + k, y, nearest(mix(p.get(x + k, y), C.white, 0.22)));
  }
  // 작은 배
  p.poly([[78, 55], [94, 55], [91, 58], [81, 58]], C.wood2);
  p.hline(78, 94, 55, C.wood1);
  backHead(p, 86, 49, C.wood3, C.mist2, 0.9);
  p.line(80, 53, 74, 59, C.wood3);
  for (let x = 76; x < 96; x++) if (bayer(x, 59) < 8) p.set(x, 59, nearest(mix(p.get(x, 59), C.white, 0.3)));
  // 연잎
  for (const [x, y, s] of [[44, 70, 3], [52, 73, 2.4], [60, 69, 2], [100, 72, 2.6], [36, 66, 2]] as [number, number, number][]) {
    p.ellipse(x, y, s, s * 0.45, (px) => (px < x ? C.leaf1 : C.leaf2));
    p.set(x + 1, y, C.leaf3);
  }
  p.set(52, 72, C.pink0);
  p.set(53, 72, C.pink1);
  // 가까운 물가 (풀밭)
  const bank = (x: number) => Math.round(77 + Math.sin(x / 19) * 1.6 - Math.max(0, 46 - x) * 0.32);
  for (let x = 0; x < W; x++) {
    const top = bank(x);
    for (let y = top; y < H; y++) p.set(x, y, y === top ? C.leaf1 : y < top + 2 ? C.leaf2 : bayer(x, y) < 3 ? C.leaf3 : C.leaf2);
    p.set(x, top - 1, nearest(mix(p.get(x, top - 1), C.leaf3, 0.5)));
  }
  const gr = rng(8);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(gr() * W);
    const y = bank(x) + 2 + Math.floor(gr() * 14);
    p.vline(x, y - 2, y, gr() < 0.5 ? C.leaf1 : C.leaf3);
  }
  for (const [x, c] of [[66, C.white], [70, C.gold1], [96, C.white], [138, C.pink1], [24, C.gold1]] as [number, number][]) p.set(x, bank(x) + 5, c);
  // 갈대
  for (let i = 0; i < 18; i++) {
    const x = 140 + Math.floor(gr() * 22);
    const top = 58 + Math.floor(gr() * 10);
    p.vline(x, top, 82, gr() < 0.5 ? C.leaf2 : C.leaf3);
    if (gr() < 0.5) p.rect(x, top - 3, 1, 3, C.wood3);
  }
  willow(p, 19);
  // 벤치와 앉은 사람 (오른쪽)
  backHead(p, 129, 60, C.blond1, RAMP.uniform[1], 1.3);
  p.rect(116, 66, 30, 2, C.wood1);
  p.rect(116, 69, 30, 2, C.wood1);
  p.hline(116, 145, 68, C.wood3);
  p.hline(116, 145, 71, C.wood3);
  p.rect(115, 72, 32, 2, C.wood2);
  for (const x of [116, 144]) {
    p.vline(x, 65, 81, C.slate0);
    p.vline(x + 1, 74, 81, C.slate0);
  }
  // 가로등
  p.vline(108, 56, 82, C.slate0);
  p.rect(107, 82, 3, 2, C.slate0);
  p.rect(106, 52, 5, 1, C.slate0);
  p.rect(107, 53, 3, 3, night || tod === 'dusk' ? C.gold1 : C.mist2);
  p.poly([[105, 52], [111, 52], [108, 49]], C.slate0);
  ambient(p, tod, 0.9);
  if (night || tod === 'dusk') {
    warm(p, 108.5, 54, night ? 30 : 18, night ? 0.5 : 0.3);
    p.rect(107, 53, 3, 3, C.gold0);
  }
  // 물에 비친 달/해의 반짝임
  if (tod !== 'day') {
    const gx = tod === 'dawn' ? 96 : 64;
    const gc = night ? C.mist2 : C.gold1;
    for (let y = HZ + 2; y < 74; y += 2) {
      const w = Math.floor(((y - HZ) / 30) * 3) + ((y * 7) % 3);
      const ox = Math.round(Math.sin(y) * 2);
      for (let x = gx + ox - w; x <= gx + ox + w; x++) if (bayer(x, y) < 7 && p.get(x, y) !== C.wood2) p.set(x, y, gc);
    }
  }
  if (night) {
    fireflies(p, 7, 10, 0, 60, 30, 80);
    fireflies(p, 9, 5, 130, 160, 56, 80);
  }
};

const back_hill: SceneFn = (p, tod) => {
  const night = tod === 'night';
  const [far] = farTones(tod);
  sky(p, tod, 62);
  if (night) {
    stars(p, 52, 80, 50);
    moon(p, 120, 14, 5);
  } else if (tod === 'dusk') sun(p, 118, 52, 9, tod);
  else if (tod === 'dawn') sun(p, 100, 50, 7, tod);
  clouds(p, 41, tod, 34, 4);
  if (!night) birds(p, 7, 5, 90, 150, 12, 30);
  // 언덕 너머 먼 산
  ridge(p, 9, 54, 6, far, 26, 62);
  // 언덕 꼭대기 풀밭 (오른쪽으로 낮아진다)
  const crest = noise1(3, 30);
  const top = (x: number) => Math.round(50 + x * 0.05 + crest(x) * 3);
  for (let x = 0; x < W; x++) {
    const t = top(x);
    for (let y = t; y < H; y++) {
      const band = Math.floor(160 / (y - 44)) % 2;
      const g = (y - t) / (H - t);
      let c: number = y === t ? C.leaf0 : y < t + 2 ? C.leaf1 : bayer(x, y) < 2 + g * 6 ? C.leaf3 : C.leaf2;
      if (band && bayer(x, y) < 4) c = C.leaf1;
      p.set(x, y, c);
    }
  }
  // 숲 가장자리 (왼쪽)
  const back: Ramp = [C.leaf2, C.leaf3, C.leaf4, C.ink];
  for (const [x, h] of [[4, 44], [14, 52], [26, 46], [38, 40], [48, 32], [58, 24]] as [number, number][]) pine(p, x, 58, h, back);
  for (const [x, h] of [[0, 56], [10, 48], [22, 58], [34, 44], [46, 36], [56, 26], [64, 18]] as [number, number][]) pine(p, x, 62, h, RAMP.greenCloth);
  roundTree(p, 70, 58, 6, RAMP.greenCloth);
  p.rect(0, 58, 72, 6, C.leaf3);
  for (let x = 0; x < 74; x++) if (bayer(x, 63) < 8) p.set(x, 63, C.leaf2);
  // 과녁 (먼 것부터)
  const target = (cx: number, cy: number, r: number) => {
    p.line(cx - r * 0.6, cy + r * 2.1, cx, cy - r * 0.6, C.wood3);
    p.line(cx + r * 0.6, cy + r * 2.1, cx, cy - r * 0.6, C.wood3);
    p.line(cx, cy, cx + r * 0.4, cy + r * 2.0, C.wood4);
    const rings = [C.blond2, C.white, C.night1, C.blue1, C.red1, C.gold1];
    rings.forEach((c, i) => p.ellipse(cx, cy, r * (1 - i * 0.16), r * (1 - i * 0.16), c));
    p.ellipse(cx, cy, r, r, (x, y, d) => (d > 0.78 && x + y > cx + cy ? C.blond3 : -1));
    p.set(cx, cy - 1, C.gold0);
  };
  target(108, 47, 4.5);
  target(132, 46, 7);
  target(152, 50, 9);
  for (const [x, y, dx] of [[131, 44, -1], [134, 48, -1], [149, 49, -1], [154, 52, -1], [108, 46, -1]] as [number, number, number][]) {
    p.line(x, y, x + dx * 5, y + 2, C.wood1);
    p.set(x + dx * 5, y + 2, C.white);
    p.set(x + dx * 6, y + 2, C.red1);
  }
  // 활 쏘는 학생
  figure(p, 52, 48, C.wood3, C.red2, { pants: C.wood3 });
  p.line(60, 46, 62, 50, C.wood1);
  p.line(62, 50, 60, 57, C.wood1);
  p.vline(60, 47, 56, C.mist1);
  p.hline(57, 65, 51, C.wood0);
  p.set(66, 51, C.white);
  // 쓰러진 통나무 (왼쪽 앞)
  p.poly([[0, 70], [52, 68], [56, 72], [52, 80], [0, 82]], (x, y) => {
    const tt = (y - 68) / 14;
    if (tt < 0.18) return C.wood1;
    if (tt > 0.8) return C.wood4;
    return (x * 3 + Math.floor(y / 2)) % 11 === 0 ? C.wood4 : bayer(x, y) < 3 ? C.wood3 : C.wood2;
  });
  p.ellipse(53, 74, 4, 6, (x, y) => {
    const d = Math.hypot(x + 0.5 - 53, (y + 0.5 - 74) * 0.66);
    return d > 3.2 ? C.wood3 : Math.floor(d) % 2 ? C.wood0 : C.wood1;
  });
  for (let x = 0; x < 44; x++) {
    const y = Math.round(69.5 - x * 0.03);
    if (bayer(x, y) < 10) p.set(x, y, C.leaf2);
    if ((x * 7) % 5 < 2) p.set(x, y - 1, C.leaf1);
  }
  // 화살통과 활
  p.poly([[40, 58], [45, 57], [47, 69], [42, 70]], C.wood3);
  p.hline(40, 45, 58, C.wood1);
  for (const [x, c] of [[41, C.white], [43, C.red1], [44, C.white]] as [number, number][]) p.vline(x, 54, 57, c);
  for (let k = 0; k < 18; k++) {
    const t = k / 17;
    p.set(14 + t * 22, 68 - Math.sin(t * Math.PI) * 5, C.wood1);
  }
  p.line(14, 68, 36, 68, C.mist1);
  // 풀포기와 들꽃
  const fr = rng(17);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(fr() * W);
    const y = 66 + Math.floor(fr() * 24);
    p.vline(x, y - 2, y, fr() < 0.5 ? C.leaf2 : C.leaf3);
    if (fr() < 0.25) p.set(x, y - 3, fr() < 0.5 ? C.white : C.gold1);
  }
  ambient(p, tod, 0.9);
  if (night || tod === 'dusk') {
    p.vline(62, 46, 66, C.wood3);
    p.hline(62, 66, 46, C.wood3);
    p.vline(66, 47, 48, C.slate0);
    warm(p, 66.5, 52, night ? 30 : 18, night ? 0.5 : 0.3);
    lanternBody(p, 64, 49);
  }
  if (night) fireflies(p, 21, 12, 0, 80, 30, 70);
};

/** 초가집 정면 */
function cottage(p: Pix, x: number, base: number, w: number, h: number, night: boolean, seed: number) {
  const r = rng(seed);
  p.rect(x, base - h, w, h, C.mist2);
  for (let y = base - h; y < base; y++) for (let i = x; i < x + w; i++) if (bayer(i, y) < 2) p.set(i, y, RAMP.cream[1]);
  p.vline(x, base - h, base - 1, C.wood3);
  p.vline(x + w - 1, base - h, base - 1, C.wood3);
  p.hline(x, x + w - 1, base - h, C.wood3);
  p.hline(x, x + w - 1, base - 1, C.wood4);
  p.line(x + 1, base - 2, x + 5, base - h + 1, C.wood3);
  // 문과 창
  const dx = x + Math.round(w * 0.62);
  p.rect(dx, base - 9, 5, 9, C.wood2);
  p.vline(dx + 2, base - 9, base - 1, C.wood3);
  p.set(dx + 4, base - 5, C.gold2);
  const wx = x + Math.round(w * 0.2);
  p.rect(wx, base - h + 4, 5, 4, night && r() < 0.8 ? C.gold1 : C.slate0);
  p.vline(wx + 2, base - h + 4, base - h + 7, C.wood3);
  p.rect(wx - 2, base - h + 4, 2, 4, C.leaf3);
  p.rect(wx + 5, base - h + 4, 2, 4, C.leaf3);
  p.rect(wx - 1, base - h + 8, 7, 2, C.wood2);
  p.set(wx, base - h + 7, C.red1);
  p.set(wx + 4, base - h + 7, C.pink1);
  // 초가지붕
  const rh = Math.round(w * 0.42);
  const top = base - h - rh;
  p.poly([[x - 4, base - h + 2], [x + w * 0.2, top + 2], [x + w / 2, top], [x + w * 0.8, top + 2], [x + w + 4, base - h + 2]], (px, py) => {
    const row = (py - top) % 3;
    const right = px > x + w / 2 + (py - top) * 0.3;
    if (row === 0 && bayer(px, py) < 8) return right ? C.blond3 : C.blond2;
    return right ? C.blond2 : py < top + 4 ? C.blond0 : C.blond1;
  });
  for (let i = x - 4; i < x + w + 4; i++) if ((i * 5) % 3 !== 0) p.set(i, base - h + 2, C.blond3);
  p.rect(x + w - 8, top - 3, 4, 7, C.slate1);
  p.hline(x + w - 9, x + w - 4, top - 3, C.slate2);
}

/** 풍차 (날개는 X자) */
function windmill(p: Pix, x: number, base: number, s: number, rot: number) {
  const h = Math.round(30 * s);
  const top = base - h;
  p.poly([[x - 8 * s, base], [x + 8 * s, base], [x + 5 * s, top], [x - 5 * s, top]], (px, py) => (px > x + 2 * s ? C.mist1 : bayer(px, py) < 2 ? C.mist1 : C.mist2));
  p.rect(x - 2 * s, base - 8 * s, 4 * s, 8 * s, C.wood2);
  p.rect(x - 1.5 * s, top + 8 * s, 3 * s, 3 * s, C.slate0);
  for (const y of [top + 14 * s, top + 22 * s]) p.hline(Math.round(x - 7 * s), Math.round(x + 7 * s), Math.round(y), C.mist1);
  p.poly([[x - 7 * s, top + 1], [x + 7 * s, top + 1], [x + 3 * s, top - 6 * s], [x - 3 * s, top - 6 * s]], (px) => (px > x + s ? C.wood3 : C.wood2));
  p.hline(Math.round(x - 7 * s), Math.round(x + 7 * s), top + 1, C.wood4);
  const hx = x;
  const hy = top - 2 * s;
  const L = 26 * s;
  for (let k = 0; k < 4; k++) {
    const a = rot + (k * Math.PI) / 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const vx = -uy;
    const vy = ux;
    for (let t = L * 0.22; t < L; t += 0.5) {
      for (let q = 0; q < 5 * s; q += 0.5) {
        const px = hx + ux * t + vx * q;
        const py = hy + uy * t + vy * q;
        const edge = q > 5 * s - 1 || t > L - 1 || t < L * 0.22 + 1;
        const lattice = Math.round(t) % 4 === 0 || (q > 2 * s && q < 2 * s + 0.6);
        p.set(px, py, edge ? C.wood3 : lattice ? C.wood2 : C.mist2);
      }
    }
    p.line(hx, hy, hx + ux * L, hy + uy * L, C.wood4);
  }
  p.ellipse(hx, hy, 1.6 * s, 1.6 * s, C.wood4);
}

const village: SceneFn = (p, tod) => {
  const night = tod === 'night';
  const [far, mid] = farTones(tod);
  sky(p, tod, 56);
  if (night) {
    stars(p, 61, 80, 44);
    moon(p, 40, 12, 5);
  } else if (tod === 'dusk') sun(p, 92, 44, 8, tod);
  else if (tod === 'dawn') sun(p, 70, 44, 6, tod);
  clouds(p, 5, tod, 28, 3);
  if (!night) birds(p, 13, 4, 60, 110, 8, 24);
  ridge(p, 2, 44, 8, far, 26, 60);
  ridge(p, 3, 50, 6, mid === C.slate2 ? C.leaf3 : mid, 18, 60);
  // 풍차 언덕 (오른쪽)
  p.ellipse(140, 66, 40, 18, (x, y) => (y < 50 ? C.leaf1 : bayer(x, y) < 3 ? C.leaf2 : C.leaf1));
  windmill(p, 138, 52, 1, night ? 0.3 : 0.55);
  // 밀밭
  const wn = vnoise(4);
  for (let y = 54; y < 76; y++) {
    for (let x = 0; x < W; x++) {
      const t = (y - 54) / 22;
      const n = wn(x * 0.15, y * 0.4);
      const row = (x + Math.floor(y * 0.4)) % Math.max(2, Math.round(3 + t * 3)) === 0;
      let c: number = n > 0.6 ? C.blond1 : n > 0.3 ? C.blond2 : C.gold2;
      if (row) c = C.blond3;
      if (bayer(x, y) < 2 + t * 2) c = C.blond0;
      if (y < 56) c = C.blond2;
      p.set(x, y, c);
    }
  }
  // 초가집과 나무 (왼쪽)
  roundTree(p, 66, 50, 9, RAMP.greenCloth);
  cottage(p, 6, 60, 26, 13, night, 1);
  cottage(p, 38, 56, 20, 10, night, 2);
  // 울타리
  for (let x = 2; x < 64; x += 4) {
    p.vline(x, 59, 64, C.wood2);
    p.set(x, 58, C.wood1);
  }
  p.hline(0, 64, 61, C.wood3);
  // 건초더미
  for (const [x, y] of [[98, 60], [116, 66]] as [number, number][]) {
    p.ellipse(x, y, 6, 5, (px, py) => (py < y - 2 ? C.blond0 : px > x + 2 ? C.blond3 : C.blond1));
    p.hline(x - 5, x + 5, y + 4, C.blond3);
  }
  // 흙길 (아래 가운데에서 마을로)
  for (let y = 56; y < H; y++) {
    const t = (y - 56) / (H - 56);
    const cx = 52 + t * t * 36 + Math.sin(t * 3) * 4;
    const hw = 3 + t * 22;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const e = Math.abs(x - cx) / hw;
      let c: number = e > 0.85 ? C.wood1 : bayer(x, y) < 3 ? C.wood1 : C.wood0;
      if (Math.abs(e - 0.45) < 0.06 && t > 0.3) c = C.wood1;
      p.set(x, y, c);
    }
  }
  // 앞쪽 풀과 밀 이삭 (양옆)
  for (let y = 76; y < H; y++) for (let x = 0; x < W; x++) if (p.get(x, y) !== C.wood0 && p.get(x, y) !== C.wood1) p.set(x, y, bayer(x, y) < 4 ? C.leaf2 : C.leaf1);
  const er = rng(23);
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? er() * 36 : 124 + er() * 36;
    const y = 66 + er() * 22;
    p.line(side, y + 8, side + 1, y, C.blond3);
    p.rect(side, y - 3, 2, 3, i % 3 ? C.blond1 : C.blond2);
  }
  // 사람들
  figure(p, 108, 52, C.wood3, C.mist2, { pants: C.wood3 });
  p.hline(106, 108, 51, C.blond2);
  p.hline(105, 109, 52, C.blond1);
  p.line(115, 50, 117, 62, C.wood2);
  p.line(115, 50, 120, 52, C.mist1);
  figure(p, 34, 58, C.blond1, C.red2, { flip: true });
  for (const [x, y] of [[24, 70], [28, 72], [20, 73]] as [number, number][]) {
    p.rect(x, y, 3, 2, C.white);
    p.set(x + 3, y - 1, C.white);
    p.set(x + 3, y - 2, C.red1);
    p.set(x + 4, y - 1, C.gold2);
  }
  ambient(p, tod, 0.9);
  if (night || tod === 'dusk') {
    for (const [x, y] of [[11, 51], [43, 50]] as [number, number][]) light(p, x + 2, y + 2, 10, C.gold2, night ? 0.5 : 0.25);
  }
  // 굴뚝 연기
  steam(p, 3, 26, 30, 4, 4, night ? C.slate1 : C.mist2);
};

const forest: SceneFn = (p, tod) => {
  const night = tod === 'night';
  const fogC = night ? C.slate0 : tod === 'dusk' ? C.red2 : tod === 'dawn' ? C.pink1 : C.leaf1;
  // 잎 사이로 보이는 하늘
  sky(p, tod, 60);
  if (night) stars(p, 7, 30, 30, 50, 120);
  // 깊은 곳: 안개 낀 나무 기둥들 (먼 층부터)
  p.gradV(0, 18, W, 52, [nearest(mix(C.leaf2, fogC, 0.4)), nearest(mix(C.leaf1, fogC, 0.5))]);
  const layers: [number, number, number][] = [
    [0.7, 5, 41],
    [0.5, 8, 42],
    [0.3, 12, 43],
  ];
  for (const [fog, wMax, seed] of layers) {
    const r = rng(seed);
    for (let x = -4; x < W; x += 10 + Math.floor(r() * 18)) {
      const w = 2 + Math.floor(r() * wMax);
      const c = nearest(mix(C.leaf4, fogC, fog));
      const hi = nearest(mix(C.leaf3, fogC, fog));
      p.rect(x, 0, w, 72, c);
      p.vline(x, 0, 71, hi);
    }
  }
  // 바닥
  const mossN = vnoise(5);
  for (let y = 58; y < H; y++) {
    const t = (y - 58) / 32;
    for (let x = 0; x < W; x++) {
      const n = mossN(x * 0.1, y * 0.3);
      let c: number = n > 0.62 ? C.leaf2 : n > 0.35 ? C.leaf3 : C.leaf4;
      if (t < 0.15) c = nearest(mix(c, fogC, 0.4));
      p.set(x, y, c);
    }
  }
  // 오솔길
  for (let y = 60; y < H; y++) {
    const t = (y - 60) / 30;
    const cx = 82 - t * 6 + Math.sin(t * 4) * 3;
    const hw = 2 + t * 16;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const e = Math.abs(x - cx) / hw;
      if (e > 0.9 && bayer(x, y) < 8) continue;
      p.set(x, y, bayer(x, y) < 4 ? C.wood2 : C.wood3);
    }
  }
  // 잎 지붕
  const can = vnoise(8);
  for (let y = 0; y < 26; y++) {
    for (let x = 0; x < W; x++) {
      const n = can(x * 0.09, y * 0.16) - y / 40;
      if (n > 0.18) p.set(x, y, n > 0.5 ? C.leaf4 : n > 0.32 ? C.leaf3 : bayer(x, y) < 6 ? C.leaf2 : C.leaf3);
    }
  }
  // 빛줄기
  const beamC = night ? C.mist0 : tod === 'dusk' ? C.gold1 : tod === 'dawn' ? C.pink0 : C.gold0;
  const ba = night ? 0.16 : 0.26;
  for (const [x0, w0] of [[54, 8], [86, 12], [112, 6]] as [number, number][]) {
    p.poly([[x0, 0], [x0 + w0, 0], [x0 + w0 - 30, 90], [x0 - 40, 90]], (x, y) => nearest(mix(p.get(x, y), beamC, ba * (1 - y / 140) + ((bayer(x, y) - 7.5) / 16) * 0.1)));
  }
  // 큰 나무 (양옆)
  const trunk = (x0: number, w: number, flip: boolean, seed: number) => {
    const bark = vnoise(seed);
    for (let y = 0; y < H; y++) {
      const flare = y > 60 ? Math.pow((y - 60) / 30, 2) * 18 : 0;
      const l = x0 - (flip ? 0 : flare);
      const rr = x0 + w + (flip ? flare : 0);
      for (let x = Math.floor(l); x < rr; x++) {
        const u = (x - l) / (rr - l);
        const n = bark(x * 0.5, y * 0.08);
        let c: number = (flip ? u > 0.75 : u < 0.25) ? C.wood2 : (flip ? u < 0.2 : u > 0.8) ? C.wood4 : C.wood3;
        if (n > 0.7) c = C.wood4;
        if (Math.abs(Math.sin(x * 0.9 + n * 3)) < 0.12) c = C.wood4;
        const moss = bark(x * 0.25 + 20, y * 0.12) > 0.66 - (y > 56 ? (y - 56) / 80 : 0) && (flip ? u > 0.5 : u < 0.5);
        if (moss) c = bayer(x, y) < 8 ? C.leaf2 : C.leaf1;
        p.set(x, y, c);
      }
    }
  };
  trunk(0, 24, false, 11);
  trunk(136, 26, true, 12);
  // 뿌리
  for (const [x0, y0, x1, y1] of [[22, 70, 44, 88], [16, 76, 30, 90], [138, 72, 116, 88], [146, 78, 128, 90]] as [number, number, number, number][]) {
    for (let k = -2; k <= 2; k++) p.line(x0, y0 + k, x1, y1 + k * 0.5, k === -2 ? C.leaf2 : k < 1 ? C.wood3 : C.wood4);
  }
  // 덩굴
  const vr = rng(9);
  for (const [x, len] of [[30, 40], [40, 22], [104, 30], [124, 46], [62, 16], [96, 12]] as [number, number][]) {
    let xx = x;
    for (let y = 8; y < 8 + len; y++) {
      p.set(xx, y, C.leaf3);
      if (y % 3 === 0) p.set(xx + (vr() < 0.5 ? -1 : 1), y, vr() < 0.5 ? C.leaf1 : C.leaf2);
      if (vr() < 0.2) xx += vr() < 0.5 ? -1 : 1;
    }
  }
  // 고사리와 버섯 (양옆 앞)
  for (const [bx, by, s, dir] of [[8, 92, 1, 1], [40, 94, 0.7, 1], [152, 92, 1, -1], [122, 94, 0.7, -1]] as [number, number, number, number][]) {
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.45 + dir * 0.2;
      const len = 16 * s;
      for (let t = 0; t < len; t++) {
        const x = bx + Math.cos(a) * t + Math.sin(t * 0.25) * dir;
        const y = by + Math.sin(a) * t + (t * t) / (len * 3);
        p.set(x, y, C.leaf2);
        if (t % 2 === 0) {
          p.set(x - 1, y + 1, C.leaf1);
          p.set(x + 1, y + 1, C.leaf3);
        }
      }
    }
  }
  const mush = (x: number, y: number) => {
    p.vline(x, y - 2, y, C.mist2);
    p.ellipse(x, y - 3, 2.4, 1.4, (px, py) => (py < y - 3 ? C.red1 : C.red2));
    p.set(x - 1, y - 4, C.white);
  };
  mush(30, 82);
  mush(34, 84);
  mush(126, 80);
  // 사슴 (안개 속)
  const deerC = nearest(mix(C.wood2, fogC, 0.35));
  p.sprite(100, 46, [
    'a.a.......',
    '.aa.......',
    '.dd.......',
    '.ddd......',
    '..dddddddd',
    '..dddddddd',
    '..d.d..d.d',
    '..d.d..d.d',
  ], { a: nearest(mix(C.wood3, fogC, 0.35)), d: deerC });
  ambient(p, tod, night ? 1.05 : 0.9);
  if (night) {
    for (const [x, y] of [[30, 82], [34, 84], [126, 80]] as [number, number][]) light(p, x, y - 3, 7, C.teal1, 0.5);
    fireflies(p, 5, 16, 20, 140, 26, 80, [C.teal0, C.teal1, C.teal2, C.teal3]);
  } else {
    const dr = rng(4);
    for (let i = 0; i < 16; i++) p.set(50 + dr() * 70, 10 + dr() * 60, beamC);
  }
};

/** 옆에서 본 마차 (오른쪽을 본다) */
function coach(p: Pix, x: number, y: number, body: number, lit: boolean) {
  const dark = nearest(mix(body, C.ink, 0.35));
  horse(p, x + 26, y + 4, C.wood2);
  horse(p, x + 30, y + 5, C.wood1);
  p.line(x + 20, y + 11, x + 31, y + 10, C.wood4);
  p.rect(x, y + 2, 20, 11, body);
  p.rect(x - 1, y, 22, 2, dark);
  p.hline(x, x + 19, y + 2, nearest(mix(body, C.white, 0.25)));
  p.rect(x + 3, y + 4, 6, 4, lit ? C.gold1 : C.sky0);
  p.rect(x + 11, y + 4, 6, 4, lit ? C.gold1 : C.sky0);
  p.hline(x, x + 19, y + 9, C.gold2);
  p.rect(x + 3, y - 3, 14, 3, C.wood3);
  p.rect(x + 4, y - 4, 4, 1, C.red2);
  p.rect(x + 10, y - 4, 5, 1, C.blue2);
  p.rect(x + 20, y + 5, 4, 2, C.wood3);
  backHead(p, x + 21, y - 1, C.wood3, C.slate1, 0.8);
  wheel(p, x + 4, y + 14, 4);
  wheel(p, x + 16, y + 14, 4);
}

const carriage_road: SceneFn = (p, tod) => {
  const night = tod === 'night';
  const [far, mid] = farTones(tod);
  sky(p, tod, 58);
  if (night) {
    stars(p, 91, 80, 44);
    moon(p, 30, 14, 5);
  } else if (tod === 'dusk') sun(p, 118, 40, 9, tod);
  else if (tod === 'dawn') sun(p, 40, 42, 7, tod);
  clouds(p, 33, tod, 30, 4);
  ridge(p, 4, 44, 8, far, 30, 58);
  // 먼 성벽 도시
  const cityW = night ? C.slate0 : nearest(mix(C.mist1, far, 0.25));
  const cityD = night ? C.night1 : nearest(mix(C.mist0, far, 0.3));
  const roof = night ? C.night0 : nearest(mix(C.blue2, far, 0.3));
  const rr = rng(6);
  const winLit: [number, number][] = [];
  for (let x = 92; x < 150; x += 4 + Math.floor(rr() * 3)) {
    const h = 5 + Math.floor(rr() * 8);
    p.rect(x, 40 - h, 5, h + 2, rr() < 0.5 ? cityW : cityD);
    p.poly([[x - 1, 40 - h], [x + 2.5, 40 - h - 3], [x + 6, 40 - h]], rr() < 0.5 ? roof : nearest(mix(C.red2, far, 0.4)));
    if (rr() < 0.6) winLit.push([x + 2, 42 - h]);
  }
  // 대성당 첨탑
  p.rect(116, 18, 6, 22, cityW);
  p.poly([[115, 18], [119, 6], [123, 18]], roof);
  p.vline(119, 3, 6, cityD);
  // 성벽과 탑
  p.rect(86, 40, 70, 10, cityW);
  for (let x = 86; x < 156; x += 3) p.rect(x, 38, 2, 2, cityW);
  p.hline(86, 155, 49, cityD);
  for (const tx of [86, 104, 134, 152]) {
    p.rect(tx - 3, 33, 7, 17, cityD);
    p.poly([[tx - 4, 33], [tx + 0.5, 27], [tx + 5, 33]], roof);
  }
  p.rect(116, 42, 6, 8, C.slate0);
  p.ellipse(119, 42, 3, 2, C.slate0);
  // 들판 (밭 무늬)
  const bands = [C.leaf1, C.blond1, C.leaf2, RAMP.sage[1], C.blond2, C.leaf1, RAMP.sage[0], C.leaf2];
  for (let y = 50; y < H; y++) {
    const z = 300 / (y - 40);
    for (let x = 0; x < W; x++) {
      const X = ((x - 80) * z) / 60 + 200;
      const i = Math.floor(X / 9);
      const j = Math.floor(z / 4 + (i % 3) * 0.33);
      let c: number = bands[(((i * 7 + j * 5) % bands.length) + bands.length) % bands.length];
      if (bayer(x, y) < 3 && (y + i) % 2 === 0) c = nearest(mix(c, C.white, 0.2));
      const hedgeU = ((X / 9) % 1) * ((9 * 60) / z) < 1;
      const hedgeV = (((z / 4 + (i % 3) * 0.33) % 1) * 4 * 300) / (z * z) < 1;
      if (hedgeU || hedgeV) c = C.leaf3;
      if (y < 53) c = nearest(mix(c, mid === C.slate2 ? C.leaf3 : mid, 0.3));
      p.set(x, y, c);
    }
  }
  // 길: 아래 가운데에서 S자로 휘어 성문으로
  const pathC = (y: number) => {
    const t = (y - 50) / 40;
    return [119 - 70 * Math.sin(t * Math.PI * 0.75), 1.2 + Math.pow(t, 1.4) * 28] as [number, number];
  };
  for (let y = 50; y < H; y++) {
    const [cx, hw] = pathC(y);
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const e = Math.abs(x - cx) / hw;
      let c: number = e > 0.86 ? C.wood1 : bayer(x, y) < 3 ? C.wood1 : C.wood0;
      if (Math.abs(e - 0.45) < 0.07 && y > 60) c = C.wood1;
      p.set(x, y, c);
    }
  }
  // 포플러 가로수
  for (const [x, y, h] of [[140, 52, 10], [130, 54, 13], [24, 64, 24], [8, 70, 30], [152, 66, 24], [108, 56, 12]] as [number, number, number][]) {
    p.vline(x, y, y + 2, C.wood3);
    p.ellipse(x, y - h / 2, h * 0.2, h / 2, (px, py) => (px < x ? C.leaf2 : bayer(px, py) < 6 ? C.leaf4 : C.leaf3));
  }
  roundTree(p, 80, 53, 4, RAMP.greenCloth);
  roundTree(p, 42, 54, 5, RAMP.greenCloth);
  // 마차 (길 위, 성 쪽으로 간다)
  coach(p, 40, 50, C.red2, night);
  // 이정표 (오른쪽 앞)
  p.rect(136, 62, 3, 22, C.wood2);
  p.vline(136, 62, 83, C.wood1);
  p.poly([[128, 64], [148, 64], [151, 67], [148, 70], [128, 70]], C.wood1);
  p.hline(128, 148, 64, C.wood0);
  p.hline(131, 144, 67, C.wood3);
  p.poly([[146, 72], [130, 72], [127, 75], [130, 78], [146, 78]], C.wood2);
  p.hline(132, 143, 75, C.wood4);
  // 풀포기
  const gr = rng(3);
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(gr() * W);
    const y = 68 + Math.floor(gr() * 22);
    if (p.get(x, y) === C.wood0 || p.get(x, y) === C.wood1) continue;
    p.vline(x, y - 2, y, gr() < 0.5 ? C.leaf2 : C.leaf3);
  }
  if (!night) birds(p, 3, 5, 40, 100, 8, 26);
  ambient(p, tod, 0.9);
  if (night || tod === 'dusk') {
    for (const [x, y] of winLit) p.set(x, y, (x + y) % 2 ? C.gold1 : C.gold2);
    light(p, 119, 46, 8, C.gold2, night ? 0.5 : 0.3);
    p.vline(62, 48, 51, C.slate0);
    warm(p, 62, 53, night ? 26 : 16, night ? 0.5 : 0.3);
    lanternBody(p, 60, 51);
  }
};

const city_gate: SceneFn = (p, tod) => {
  const night = tod === 'night';
  sky(p, tod, 70);
  if (night) {
    stars(p, 17, 60, 40);
    moon(p, 132, 12, 5);
  } else if (tod === 'dusk') sun(p, 20, 30, 8, tod);
  clouds(p, 57, tod, 22, 3);
  // 성벽 너머의 지붕들
  const rr = rng(8);
  for (let x = -2; x < W; x += 6 + Math.floor(rr() * 6)) {
    const h = 6 + Math.floor(rr() * 12);
    const w = 6 + Math.floor(rr() * 6);
    const wallC = [C.mist1, C.wood0, C.mist0, C.tan0][Math.floor(rr() * 4)];
    p.rect(x, 30 - h, w, h + 4, wallC);
    p.poly([[x - 1, 30 - h], [x + w / 2, 30 - h - 5], [x + w + 1, 30 - h]], rr() < 0.5 ? C.red2 : C.blue2);
    if (rr() < 0.7) p.rect(x + 2, 33 - h, 2, 2, night && rr() < 0.7 ? C.gold1 : C.slate0);
  }
  p.rect(132, 4, 7, 26, C.mist1);
  p.poly([[131, 4], [135.5, -6], [140, 4]], C.blue2);
  // 성벽 (양옆)
  bricks(p, 0, 30, W, 38, STONE, 10, 5);
  for (let x = 0; x < W; x += 6) p.rect(x, 26, 4, 4, C.mist0);
  p.hline(0, W - 1, 30, C.mist2);
  p.hline(0, W - 1, 66, C.slate1);
  // 문루와 탑
  const tower = (x: number, w: number) => {
    bricks(p, x, 17, w, 51, STONE, 8, 4);
    p.vline(x, 17, 67, C.mist2);
    p.vline(x + w - 1, 17, 67, C.slate1);
    p.rect(x - 2, 15, w + 4, 3, C.mist0);
    p.hline(x - 2, x + w + 1, 15, C.mist2);
    p.poly([[x - 3, 15], [x + w / 2, -1], [x + w + 3, 15]], (px, py) => (px < x + w / 2 - 2 ? ((px + py) % 4 === 0 ? C.blue2 : C.blue1) : (px + py) % 4 === 0 ? C.blue3 : C.blue2));
    p.hline(x - 3, x + w + 2, 15, C.blue3);
    p.rect(x + w / 2 - 1, 26, 3, 6, C.ink);
    p.set(x + w / 2, 25, C.ink);
    p.rect(x + w / 2 - 1, 44, 3, 6, C.ink);
    p.set(x + w / 2, 43, C.ink);
  };
  bricks(p, 52, 22, 56, 46, STONE, 8, 4);
  for (let x = 52; x < 108; x += 5) p.rect(x, 18, 3, 4, C.mist1);
  p.hline(52, 107, 22, C.mist2);
  for (let y = 56; y < 68; y++) for (let x = 0; x < W; x++) if (bayer(x, y) < (y - 56) * 0.5) p.paint(x, y, C.slate2);
  tower(34, 18);
  tower(108, 18);
  // 아치 문 (열린 문 안쪽의 거리)
  const ax = 80;
  const aTop = 34;
  const inGate = (x: number, y: number) => Math.abs(x + 0.5 - ax) < 15 && (y >= aTop + 6 || Math.hypot(x + 0.5 - ax, (y + 0.5 - (aTop + 6)) * 1.5) < 15);
  p.ellipse(ax, aTop + 6, 18, 12, C.mist0);
  p.rect(ax - 18, aTop + 6, 36, 28, C.mist0);
  within(p, (x, y) => inGate(x, y) && y < 68, () => {
    p.gradV(ax - 15, aTop - 4, 30, 40, night ? [C.night1, C.slate0] : [C.mist1, C.mist2]);
    house(p, 64, 66, 12, 18, C.tan0, C.red2, night, 3);
    house(p, 84, 66, 14, 22, C.mist1, C.blue2, night, 4);
    p.rect(64, 62, 32, 6, C.slate2);
    for (const [x, y, h, c] of [[70, 56, C.wood2, C.leaf3], [86, 55, C.blond1, C.pink2]] as [number, number, number, number][]) figure(p, x, y, h, c);
  });
  for (let x = ax - 15; x <= ax + 15; x++) {
    if (bayer(x, aTop + 1) < 16) {
      for (let y = aTop - 10; y < aTop + 3; y++) if (inGate(x, y) && (x % 3 === 0 || y === aTop + 2)) p.set(x, y, C.ink);
    }
    if (inGate(x, aTop + 3) && x % 3 === 0) p.set(x, aTop + 3, C.slate0);
  }
  for (let k = 0; k <= 60; k++) {
    const a = Math.PI + (k / 60) * Math.PI;
    p.set(ax + Math.cos(a) * 16, aTop + 6 + Math.sin(a) * 10.6, C.slate1);
  }
  // 깃발
  for (const bx of [56, 98]) {
    p.rect(bx, 24, 6, 18, C.red2);
    p.poly([[bx, 42], [bx + 6, 42], [bx + 3, 45]], C.red2);
    p.vline(bx, 24, 41, C.red1);
    p.vline(bx + 5, 24, 41, C.red3);
    p.hline(bx - 1, bx + 6, 23, C.wood3);
    p.rect(bx + 2, 29, 2, 5, C.gold1);
    p.hline(bx + 1, bx + 4, 30, C.gold1);
  }
  // 길
  for (let y = 66; y < H; y++) {
    const t = (y - 66) / 24;
    const hw = 16 + t * 40;
    for (let x = 0; x < W; x++) {
      const inRoad = Math.abs(x + 0.5 - ax) < hw;
      if (inRoad) {
        const z = 400 / (y - 50);
        const row = Math.floor(z * 1.2);
        const u = ((x - ax) * z) / 100 + (row % 2) * 0.5;
        p.set(x, y, (z * 1.2) % 1 < 0.14 || Math.abs(u % 1) < 0.1 ? C.slate2 : (row + Math.floor(u)) % 3 === 0 ? C.mist0 : C.mist1);
      } else p.set(x, y, bayer(x, y) < 4 ? C.leaf3 : C.leaf2);
    }
  }
  // 경비병 (양옆)
  guard(p, 26, 54, C.red2);
  guard(p, 128, 54, C.red2, true);
  // 들어가는 수레 (왼쪽)
  p.rect(2, 64, 22, 6, C.wood2);
  p.hline(2, 23, 64, C.wood1);
  for (const [x, c] of [[4, C.blond1], [9, RAMP.cream[2]], [14, C.leaf2], [18, C.red1]] as [number, number][]) p.ellipse(x + 2, 62, 2.6, 2.2, c);
  wheel(p, 8, 72, 4);
  wheel(p, 20, 72, 4);
  horse(p, 24, 61, C.wood3);
  p.line(22, 67, 28, 67, C.wood4);
  figure(p, 44, 62, C.ink, C.leaf3, { pants: C.wood3 });
  // 나오는 사람들 (오른쪽)
  figure(p, 142, 64, C.blond2, C.blue2, { flip: true });
  backFigure(p, 114, 64, C.wood2, C.violet3);
  p.rect(150, 66, 5, 6, C.wood1);
  p.frame(150, 66, 5, 6, C.wood3);
  figure(p, 150, 60, C.mist1, C.wood2, { flip: true, pants: C.wood3 });
  ambient(p, tod, night ? 1.12 : 0.9);
  if (night || tod === 'dusk') {
    for (const tx of [32, 126]) {
      p.rect(tx, 42, 2, 5, C.wood3);
      light(p, tx + 1, 38, night ? 24 : 16, C.ember, night ? 0.45 : 0.25);
      warm(p, tx + 1, 38, night ? 16 : 10, night ? 0.5 : 0.3);
      p.ellipse(tx + 1, 39, 1.6, 2.4, (_x, y) => (y < 39 ? C.gold0 : C.gold1));
    }
    light(p, ax, 56, 18, C.gold2, night ? 0.4 : 0.2, 0.8);
  }
};

// ---------------------------------------------------------------- 실내 1

const forge: SceneFn = (p, tod) => {
  const night = tod === 'night';
  bricks(p, 0, 0, W, 66, DARK_STONE, 10, 5);
  p.map((c, x, y) => (y < 66 && bayer(x, y) < (1 - y / 66) * 9 ? nearest(mix(c, C.ink, 0.45)) : c));
  // 대들보
  p.rect(0, 0, W, 5, C.wood3);
  p.hline(0, W - 1, 4, C.wood2);
  p.hline(0, W - 1, 5, C.wood4);
  // 작은 창 (오른쪽 위)
  win(p, 134, 12, 16, 14, tod, 2, 2, OLD_WOOD, () => {
    ridge(p, 3, 24, 3, tod === 'night' ? C.night1 : C.leaf3, 8, 26);
  });
  // 바닥 (흙과 쇠똥)
  const grit = vnoise(14);
  for (let y = 66; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = grit(x * 0.15, y * 0.4);
      p.set(x, y, n < 0.3 && bayer(x, y) < 6 ? C.wood4 : bayer(x, y) < 1 + (y - 66) / 8 ? C.wood4 : C.wood3);
    }
  }
  p.hline(0, W - 1, 66, C.night1);
  // 화덕: 굴뚝 갓과 돌 받침
  within(p, (x, y) => y < 30 && x >= 2 + (30 - y) * 0.55 && x < 62 - (30 - y) * 0.55, () => bricks(p, 0, 0, 64, 30, BRICK, 8, 4));
  p.map((c, x, y) => (y < 30 && x < 64 && bayer(x, y) < (30 - y) * 0.45 ? nearest(mix(c, C.ink, 0.5)) : c));
  p.rect(0, 28, 64, 4, C.slate0);
  p.hline(0, 63, 28, C.slate1);
  p.rect(6, 32, 52, 13, C.ink);
  bricks(p, 2, 46, 60, 20, STONE, 8, 4);
  p.rect(0, 44, 64, 3, C.slate1);
  p.hline(0, 63, 44, C.mist0);
  p.rect(22, 52, 20, 10, C.night0);
  p.ellipse(32, 52, 10, 4, C.night0);
  // 풀무
  p.rect(56, 50, 8, 2, C.slate1);
  p.poly([[64, 49], [82, 45], [84, 51], [82, 57], [64, 53]], C.wood3);
  for (let k = 0; k < 4; k++) p.line(68 + k * 4, 49 - k, 68 + k * 4, 54 + k * 0.7, C.wood4);
  p.line(64, 49, 84, 44, C.wood1);
  p.line(64, 49, 84, 43, C.wood2);
  p.line(64, 53, 84, 58, C.wood2);
  p.line(84, 43, 90, 41, C.wood1);
  p.rect(89, 39, 3, 3, C.wood0);
  // 도구 걸이 (위 가운데)
  p.rect(67, 8, 64, 27, C.wood3);
  p.frame(67, 8, 64, 27, C.wood4);
  for (let y = 10; y < 34; y += 6) p.hline(68, 129, y, C.wood4);
  p.rect(70, 12, 58, 2, C.wood2);
  p.hline(70, 127, 12, C.wood1);
  for (const x of [72, 126]) p.rect(x, 10, 2, 6, C.wood3);
  const tools: [number, string][] = [[76, 'hammer'], [84, 'tongs'], [92, 'hammer2'], [100, 'shoe'], [106, 'tongs'], [114, 'file'], [120, 'hammer']];
  for (const [x, kind] of tools) {
    p.set(x, 14, C.slate0);
    if (kind === 'hammer' || kind === 'hammer2') {
      const hy = kind === 'hammer' ? 27 : 24;
      p.vline(x, 15, hy + 2, C.wood0);
      p.rect(x - 2, hy, 5, 3, C.slate2);
      p.hline(x - 2, x + 2, hy, C.mist1);
    } else if (kind === 'tongs') {
      p.line(x - 1, 15, x + 2, 31, C.mist0);
      p.line(x + 1, 15, x - 2, 31, C.slate2);
    } else if (kind === 'file') {
      p.vline(x, 15, 18, C.wood0);
      p.rect(x - 1, 19, 2, 10, C.mist0);
      p.vline(x, 19, 28, C.slate2);
    } else {
      p.ellipse(x, 19, 3, 3.5, C.mist0);
      p.ellipse(x, 19.5, 1.6, 2.4, C.wood3);
      p.rect(x - 2, 21, 4, 2, C.wood3);
    }
  }
  // 걸린 검과 방패 (창 아래)
  p.line(132, 34, 152, 50, C.mist1);
  p.line(152, 34, 132, 50, C.mist1);
  p.line(133, 34, 153, 50, C.slate2);
  p.ellipse(142, 44, 6, 7, (x) => (x < 141 ? C.red1 : C.red2));
  p.ellipse(142, 44, 6, 7, (_x, _y, d) => (d > 0.75 ? C.gold2 : -1));
  p.vline(142, 38, 50, C.gold1);
  // 모루와 그루터기 (오른쪽)
  // 대장장이 (모루 뒤)
  figure(p, 116, 41, C.ink, C.wood2, { pants: C.wood3, skin: C.tan1 });
  p.rect(117, 45, 5, 9, C.wood3);
  p.line(122, 46, 126, 39, C.tan1);
  p.vline(126, 32, 39, C.wood0);
  p.rect(124, 30, 5, 3, C.slate2);
  p.hline(124, 128, 30, C.mist1);
  p.rect(108, 66, 24, 14, C.wood2);
  p.vline(108, 66, 79, C.wood1);
  p.vline(131, 66, 79, C.wood3);
  p.ellipse(120, 66, 12, 2, C.wood1);
  p.hline(106, 133, 80, C.wood4);
  const anvil = new Pix(W, H);
  anvil.poly([[93, 55], [104, 53], [136, 53], [136, 58], [104, 58]], C.slate1);
  anvil.rect(112, 58, 16, 5, C.slate0);
  anvil.poly([[106, 63], [134, 63], [136, 67], [104, 67]], C.slate1);
  anvil.hline(96, 136, 53, C.mist1);
  anvil.hline(104, 136, 54, C.mist0);
  anvil.hline(106, 134, 63, C.slate2);
  anvil.outline(C.ink);
  p.blit(anvil);
  // 담금질 통과 석탄 더미
  barrel(p, 140, 64, 16, 20);
  p.ellipse(148, 65, 6, 1.4, C.blue2);
  p.ellipse(10, 90, 20, 10, (x, y) => (bayer(x, y) < 5 ? C.slate0 : C.night1));
  p.ellipse(14, 84, 10, 5, (x, y) => (bayer(x, y) < 4 ? C.slate1 : C.night0));
  ambient(p, tod, night ? 1 : 0.9);
  // 불
  light(p, 32, 40, 80, C.ember, night ? 0.5 : 0.35, 0.75);
  light(p, 32, 40, 34, C.gold1, 0.45);
  fire(p, 32, 44, 42, 11, 3);
  for (let x = 10; x < 54; x++) p.set(x, 43, bayer(x, 43) < 8 ? C.ember2 : C.gold2);
  light(p, 32, 57, 10, C.ember, 0.6);
  // 달군 쇠
  light(p, 115, 52, 14, C.ember, 0.55);
  p.hline(108, 120, 52, C.gold0);
  p.hline(108, 120, 51, C.ember);
  // 불티
  const sr = rng(5);
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI / 2 + (sr() - 0.5) * 2.4;
    const d = 3 + sr() * 18;
    p.set(114 + Math.cos(a) * d, 50 + Math.sin(a) * d * 0.8, sr() < 0.4 ? C.gold0 : sr() < 0.5 ? C.gold1 : C.ember);
  }
  for (let i = 0; i < 18; i++) p.set(14 + sr() * 36, 8 + sr() * 26, sr() < 0.5 ? C.ember : C.gold1);
};

const dorm_hall: SceneFn = (p, tod) => {
  const vx = 80;
  const vy = 29;
  const F = 66;
  const HW = 2.2;
  const E = 1.55;
  const CH = 1.75;
  const ZB = 8.5;
  const P = proj(vx, vy, F);
  const doorAt = (z: number) => {
    for (let k = 0; k < 4; k++) {
      const z0 = 1.6 + k * 1.75;
      if (z >= z0 && z < z0 + 0.95) return (z - z0) / 0.95;
    }
    return -1;
  };
  const night = tod === 'night';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - vx;
      const dy = y + 0.5 - vy;
      const zw = (F * HW) / Math.max(1e-6, Math.abs(dx));
      const zf = dy > 0 ? (F * E) / dy : Infinity;
      const zc = dy < 0 ? (F * CH) / -dy : Infinity;
      const z = Math.min(zw, zf, zc);
      if (z > ZB) continue;
      let c: number;
      if (z === zw) {
        const Y = (-dy * z) / F;
        const side = dx < 0 ? 0 : 1;
        const f = doorAt(z + side * 0.5);
        if (f >= 0 && Y < 0.55) {
          if (f < 0.08 || f > 0.92 || Y > 0.47) c = C.wood4;
          else {
            c = side ? C.wood2 : C.wood1;
            if (Math.abs(Y - 0.05) < 0.03 || Math.abs(f - 0.5) < 0.03) c = C.wood3;
            if (Math.abs(Y + 0.1) < 0.06 && Math.abs(f - 0.8) < 0.06) c = C.gold2;
          }
        } else if (Y < -0.75) c = Y < -1.5 ? C.wood4 : Math.floor(z * 3) % 2 ? C.wood2 : C.wood3;
        else if (Y < -0.68) c = C.wood1;
        else if (Y > 1.62) c = C.wood3;
        else c = Math.floor(z * 5) % 2 ? RAMP.cream[1] : C.mist2;
        if (!side) c = nearest(mix(c, C.white, 0.08));
      } else if (z === zf) {
        const X = (dx * z) / F;
        if (Math.abs(X) < 0.75) {
          c = Math.abs(X) > 0.62 ? C.gold2 : Math.abs(X) > 0.56 ? C.red3 : bayer(x, y) < 2 ? C.red1 : C.red2;
        } else {
          const plank = Math.floor((X + 3) / 0.32);
          c = (X + 3) % 0.32 < 0.03 * z ? C.wood3 : plank % 2 ? C.wood1 : nearest(mix(C.wood1, C.wood2, 0.35));
        }
      } else {
        c = z % 1.4 < 0.18 ? C.wood3 : C.mist1;
      }
      const fog = Math.min(0.55, Math.max(0, (z - 1.2) / ZB) * 0.6);
      p.set(x, y, nearest(mix(c, night ? C.night0 : C.slate1, fog)));
    }
  }
  // 끝벽과 창
  const [bx0, by0] = P(-HW, CH, ZB);
  const [bx1, by1] = P(HW, -E, ZB);
  p.rect(Math.round(bx0), Math.round(by0), Math.round(bx1 - bx0) + 1, Math.round(by1 - by0) + 1, nearest(mix(RAMP.cream[1], C.slate1, 0.35)));
  const [wx0, wy0] = P(-0.95, 1.3, ZB);
  const [wx1, wy1] = P(0.95, -0.55, ZB);
  win(p, Math.round(wx0), Math.round(wy0), Math.round(wx1 - wx0), Math.round(wy1 - wy0), tod, 2, 3, OLD_WOOD, () => {
    if (night) moon(p, Math.round(wx1) - 4, Math.round(wy0) + 3, 2);
    roundTree(p, Math.round(wx0) + 4, Math.round(wy1) + 2, 4, RAMP.greenCloth);
  });
  // 벽의 액자 (왼쪽)
  for (const z of [2.9, 4.65]) {
    const a = P(-HW, 1.1, z);
    const b = P(-HW, 0.65, z + 0.5);
    p.rect(Math.round(a[0]), Math.round(a[1]), Math.max(2, Math.round(b[0] - a[0])), Math.round(b[1] - a[1]) + 2, C.gold3);
    p.rect(Math.round(a[0]) + 1, Math.round(a[1]) + 1, Math.max(1, Math.round(b[0] - a[0]) - 2), Math.round(b[1] - a[1]), z < 3 ? C.leaf2 : C.blue1);
  }
  // 걸어가는 학생 (멀리)
  const [fx, fy] = P(-0.9, -E, 6.2);
  backFigure(p, Math.round(fx), Math.round(fy) - 14, C.wood3, RAMP.uniform[1], RAMP.uniform[2]);
  // 문틈으로 내다보는 학생 (오른쪽)
  const [ox, oy] = P(HW, 0.4, 2.15 - 0.5);
  figure(p, Math.round(ox) - 12, Math.round(oy) + 2, C.red2, C.mist2, { flip: true, pants: C.slate1 });
  ambient(p, tod);
  // 벽등
  for (const z of [1.25, 3.0, 4.75, 6.5]) {
    for (const side of [-1, 1]) {
      const [lx, ly] = P(side * HW * 0.99, 0.7, z - (side > 0 ? 0.5 : 0));
      if (lx < 0 || lx >= W) continue;
      const s = 3 / z;
      warm(p, lx, ly, 8 * s + 8, night ? 0.55 : tod === 'dusk' ? 0.4 : 0.2);
      p.set(lx, ly + 1, C.gold3);
      p.ellipse(lx, ly - 0.5, Math.max(0.8, s * 0.9), Math.max(1, s * 1.4), C.gold1);
      p.set(lx, ly - 1, C.gold0);
    }
  }
  if (!night) {
    const [sx0, sy0] = P(-0.95, -E, ZB);
    const [sx1] = P(0.95, -E, ZB);
    sunbeam(p, [[sx0, sy0], [sx1, sy0], [sx1 + 14, 70], [sx0 - 14, 70]], tod, 0.2);
  }
};

/** 빨랫줄에 걸린 옷 */
function laundryItem(p: Pix, x: number, y: number, kind: number, c: number) {
  const dark = nearest(mix(c, C.ink, 0.22));
  const hi = nearest(mix(c, C.white, 0.3));
  if (kind === 0) {
    // 홑이불
    for (let i = 0; i < 18; i++) {
      const len = 20 + Math.round(Math.sin(i * 0.7) * 1.5);
      p.vline(x + i, y, y + len, i % 4 === 0 ? dark : i % 4 === 1 ? hi : c);
    }
  } else if (kind === 1) {
    // 셔츠
    p.rect(x, y, 10, 3, c);
    p.rect(x + 2, y + 3, 6, 9, c);
    p.rect(x - 1, y + 1, 2, 5, dark);
    p.rect(x + 9, y + 1, 2, 5, dark);
    p.vline(x + 7, y + 3, y + 11, dark);
    p.set(x + 5, y, C.white);
  } else if (kind === 2) {
    // 수건
    p.rect(x, y, 7, 11, c);
    p.hline(x, x + 6, y + 8, hi);
    p.hline(x, x + 6, y + 9, dark);
    p.vline(x + 6, y, y + 10, dark);
  } else if (kind === 3) {
    // 바지
    p.rect(x, y, 8, 3, c);
    p.rect(x, y + 3, 3, 9, c);
    p.rect(x + 5, y + 3, 3, 9, dark);
  } else {
    // 양말
    p.rect(x, y, 2, 5, c);
    p.rect(x, y + 5, 4, 2, c);
    p.set(x, y, hi);
  }
  p.set(x + 1, y - 1, C.wood1);
}

const laundry: SceneFn = (p, tod) => {
  const night = tod === 'night';
  // 벽: 위는 회벽, 아래는 젖은 돌
  p.rect(0, 0, W, 48, C.mist2);
  const damp = vnoise(3);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < W; x++) {
      const n = damp(x * 0.12, y * 0.2) * 0.5 + (y - 22) / 40;
      if (n > 0.78 && bayer(x, y) < 8) p.set(x, y, C.mist0);
      else if (n > 0.55 && bayer(x, y) < 4) p.set(x, y, C.mist1);
    }
  }
  bricks(p, 0, 48, W, 14, STONE, 10, 4);
  p.hline(0, W - 1, 48, C.slate2);
  // 작은 창 (왼쪽 위)
  win(p, 12, 10, 22, 18, tod, 2, 2, PLASTER, () => {
    ridge(p, 5, 26, 3, night ? C.night1 : C.leaf2, 8, 28);
    if (night) moon(p, 28, 14, 2);
  });
  // 선반: 비누와 개킨 수건 (오른쪽 위)
  p.rect(126, 30, 32, 2, C.wood1);
  p.hline(126, 157, 32, C.wood3);
  for (const [x, c] of [[128, C.white], [134, C.sky0], [140, C.pink0]] as [number, number][]) {
    p.rect(x, 24, 6, 6, c);
    p.hline(x, x + 5, 26, nearest(mix(c, C.ink, 0.15)));
    p.hline(x, x + 5, 28, nearest(mix(c, C.ink, 0.15)));
  }
  p.rect(148, 27, 4, 3, C.blond1);
  p.rect(153, 28, 3, 2, C.leaf0);
  // 바닥: 돌 타일과 물웅덩이
  tileFloor(p, 62, 80, 30, 70, 1.3, 0.7, (i, j) => ((i * 3 + j) % 4 === 0 ? C.mist0 : C.mist1), C.slate2);
  p.hline(0, W - 1, 62, C.slate1);
  for (const [x, y, rx] of [[70, 80, 14], [98, 72, 8], [40, 86, 10]] as [number, number, number][]) {
    p.ellipse(x, y, rx, rx * 0.22, (px, py) => (bayer(px, py) < 6 ? C.sky0 : C.mist2));
  }
  p.ellipse(84, 76, 4, 1.2, C.slate1);
  p.ellipse(84, 76, 2.4, 0.6, C.night1);
  // 구리 솥 (오른쪽)
  bricks(p, 116, 50, 38, 24, BRICK, 6, 3);
  p.rect(128, 62, 14, 10, C.ink);
  p.ellipse(135, 62, 7, 3, C.ink);
  p.ellipse(135, 50, 21, 5, C.wood3);
  p.ellipse(135, 49, 19, 4, (x) => (x < 128 ? RAMP.orange[0] : x < 142 ? RAMP.orange[1] : RAMP.orange[2]));
  p.ellipse(135, 48.5, 16, 2.6, C.mist1);
  p.ellipse(135, 48.5, 14, 2, C.white);
  p.rect(114, 72, 42, 2, C.slate1);
  // 빨래통과 빨래판 (왼쪽)
  figure(p, 24, 50, C.wood2, C.sky1, { pants: C.wood3 });
  p.rect(25, 53, 5, 6, C.white);
  for (let y = 62; y < 80; y++) {
    const t = (y - 62) / 18;
    const hw = 18 - t * 3;
    for (let x = Math.round(28 - hw); x <= Math.round(28 + hw); x++) {
      const u = (x - (28 - hw)) / (2 * hw);
      p.set(x, y, Math.abs(t - 0.3) < 0.07 || Math.abs(t - 0.8) < 0.07 ? C.slate1 : u < 0.25 ? C.wood1 : u > 0.75 ? C.wood3 : C.wood2);
    }
  }
  p.ellipse(28, 62, 18, 3, C.wood3);
  p.ellipse(28, 62, 16, 2, C.mist2);
  for (const [x, y, r] of [[18, 60, 2], [22, 59, 1.4], [34, 60, 1.6], [38, 61, 1.2], [28, 59, 1.2]] as [number, number, number][]) {
    p.ellipse(x, y, r, r, C.white);
    p.set(x - 0.5, y - 0.5, C.sky0);
  }
  p.poly([[40, 52], [46, 51], [48, 66], [42, 67]], C.wood1);
  for (let y = 54; y < 65; y += 2) p.line(41 + (y - 52) * 0.1, y, 46 + (y - 52) * 0.15, y - 0.4, C.wood3);
  // 빨래 바구니
  p.ellipse(104, 82, 12, 4, C.wood2);
  p.rect(92, 74, 24, 8, C.blond2);
  for (let x = 92; x < 116; x += 2) p.vline(x, 74, 81, C.blond3);
  p.hline(92, 115, 74, C.blond1);
  p.ellipse(100, 73, 5, 2, C.white);
  p.ellipse(108, 72, 5, 2.4, C.pink0);
  // 빨랫줄
  const lines: [number, number, number, number, number][] = [
    [-2, 5, 162, 9, 7],
    [-2, 17, 162, 14, 9],
  ];
  const colors = [C.white, C.sky0, RAMP.uniform[1], C.pink0, C.mist2, C.leaf0, C.white, C.gold0];
  lines.forEach(([x0, y0, x1, y1, d], li) => {
    for (let i = 0; i <= 160; i++) {
      const [x, y] = sag(x0, y0, x1, y1, d, i / 160);
      p.set(x, y, C.slate1);
    }
    const r = rng(40 + li);
    let t = 0.04 + li * 0.05;
    let k = li * 3;
    while (t < 0.94) {
      const [x, y] = sag(x0, y0, x1, y1, d, t);
      const kind = [0, 1, 2, 4, 3, 1, 2, 0][k % 8];
      if (!(li === 0 && x > 10 && x < 38 && kind === 0)) laundryItem(p, Math.round(x), Math.round(y) + 1, kind, colors[(k * 5 + li) % colors.length]);
      t += (kind === 0 ? 22 : kind === 4 ? 6 : 13) / 164 + r() * 0.02;
      k++;
    }
  });
  sunbeam(p, [[12, 30], [34, 30], [78, 90], [42, 90]], tod, 0.22);
  ambient(p, tod);
  // 솥 밑의 불과 김
  light(p, 135, 68, 20, C.ember, 0.45, 0.7);
  fire(p, 135, 71, 10, 6, 2);
  steam(p, 4, 135, 46, 6, 16);
  steam(p, 5, 28, 60, 48, 6);
  if (night || tod === 'dusk') {
    p.hline(112, 116, 30, C.slate0);
    warm(p, 116, 36, night ? 46 : 30, night ? 0.5 : 0.3);
    lanternBody(p, 114, 32);
  }
};

const cellar: SceneFn = (p, tod) => {
  const night = tod === 'night';
  const WALL: Ramp = [C.slate1, C.slate0, C.night1, C.ink];
  bricks(p, 0, 0, W, 70, WALL, 10, 5);
  // 둥근 천장 (모서리는 어둡게)
  const archY = (x: number) => 34 - Math.sqrt(Math.max(0, 1 - ((x - 92) / 74) ** 2)) * 32;
  for (let x = 0; x < W; x++) {
    const a = archY(x);
    for (let y = 0; y < a; y++) p.set(x, y, bayer(x, y) < 6 ? C.night1 : C.night0);
    for (let k = 0; k < 3; k++) p.set(x, Math.round(a) + k, k === 0 ? C.slate2 : k === 1 ? C.slate1 : C.night1);
    if (x % 6 === 0) p.vline(x, Math.round(a), Math.round(a) + 2, C.night1);
  }
  // 바닥 (판석)
  const slab = vnoise(21);
  for (let y = 70; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / 14 + (Math.floor(y / 6) % 2) * 0.5;
      const edge = u % 1 < 0.06 || y % 6 === 0;
      const n = slab(Math.floor(u), Math.floor(y / 6));
      p.set(x, y, edge ? C.night1 : n > 0.6 ? C.slate1 : C.slate0);
    }
  }
  p.hline(0, W - 1, 70, C.night1);
  // 잼 선반 (뒷벽)
  const jars = rng(7);
  for (const y of [28, 42]) {
    p.rect(54, y, 46, 2, C.wood2);
    p.hline(54, 99, y, C.wood1);
    p.hline(54, 99, y + 2, C.wood4);
    for (let x = 56; x < 97; x += 5 + Math.floor(jars() * 2)) {
      const liq = [C.red2, C.gold2, C.leaf2, C.violet2, C.ember2, C.pink2][Math.floor(jars() * 6)];
      const h = 5 + Math.floor(jars() * 3);
      p.rect(x, y - h, 4, h, liq);
      p.vline(x, y - h, y - 1, nearest(mix(liq, C.white, 0.35)));
      p.rect(x, y - h - 1, 4, 1, C.wood0);
    }
  }
  for (const x of [56, 97]) p.rect(x, 18, 2, 30, C.wood3);
  // 매달린 양파와 햄
  for (const [x, len] of [[46, 12], [108, 9]] as [number, number][]) {
    p.vline(x, archY(x), archY(x) + 3, C.wood3);
    for (let k = 0; k < len; k += 2) p.ellipse(x + (k % 4 ? 1 : -1), archY(x) + 4 + k, 1.6, 1.4, k % 4 ? C.blond2 : C.gold3);
  }
  p.vline(78, archY(78), archY(78) + 2, C.wood3);
  p.ellipse(78, archY(78) + 7, 3, 5, (x) => (x < 77 ? C.red1 : C.red2));
  p.set(78, archY(78) + 11, C.white);
  // 술통 선반 (오른쪽)
  p.rect(102, 64, 58, 3, C.wood3);
  p.rect(102, 44, 58, 2, C.wood3);
  for (const [cx, cy, r] of [[112, 55, 9], [131, 55, 9], [150, 55, 9], [121, 36, 8], [140, 36, 8]] as [number, number, number][]) barrelEnd(p, cx, cy, r, cy > 50);
  barrel(p, 104, 66, 14, 18);
  barrel(p, 142, 68, 14, 18);
  // 계단 (왼쪽 위의 문에서 내려온다)
  p.rect(2, 4, 22, 26, C.ink);
  const doorC = night ? C.slate1 : tod === 'dusk' ? C.gold1 : tod === 'dawn' ? C.pink0 : C.gold0;
  for (let i = 0; i < 9; i++) {
    const y = 30 + i * 5;
    const w = 24 + i * 4;
    p.rect(0, y, w, 5, C.slate1);
    p.hline(0, w - 1, y, C.mist0);
    p.vline(w - 1, y, y + 4, C.slate0);
  }
  p.line(24, 22, 60, 66, C.wood2);
  p.line(24, 23, 60, 67, C.wood3);
  for (const k of [0, 1, 2, 3]) p.vline(28 + k * 9, 27 + k * 11, 33 + k * 11, C.wood3);
  // 자루
  sack(p, 38, 82, 16, 14);
  sack(p, 52, 84, 14, 12, RAMP.cream[1]);
  sack(p, 44, 72, 12, 10, C.blond2);
  // 쥐
  p.sprite(68, 81, ['.kk...', 'kkkkk.', 'kkkkkk', '.k..k.'], { k: C.slate2 });
  p.set(68, 82, C.pink1);
  p.line(74, 83, 78, 84, C.pink2);
  // 거미줄
  cobweb(p, 159, 0, 14, -1, 1, C.mist0);
  cobweb(p, 26, 4, 7, 1, 1, C.mist0);
  sunbeam(p, [[4, 30], [22, 30], [96, 90], [56, 90]], tod, night ? 0.35 : 0.3);
  ambient(p, tod);
  light(p, 13, 18, 22, doorC, night ? 0.25 : 0.45);
  p.rect(4, 6, 18, 24, doorC);
  p.rect(4, 6, 18, 3, nearest(mix(doorC, C.white, 0.4)));
  p.vline(13, 6, 29, nearest(mix(doorC, C.wood3, 0.3)));
  if (night || tod === 'dusk') {
    const ly = Math.round(archY(92)) + 4;
    p.vline(92, Math.round(archY(92)), ly - 2, C.slate1);
    warm(p, 94, ly + 3, night ? 50 : 34, night ? 0.5 : 0.35);
    lanternBody(p, 92, ly);
  }
  const dr = rng(3);
  for (let i = 0; i < 10; i++) p.set(20 + dr() * 50, 34 + dr() * 50, nearest(mix(doorC, C.white, 0.3)));
};

const BRASS: Ramp = [C.gold1, C.gold2, C.gold3, C.wood4];
const IRON: Ramp = [C.mist0, C.slate2, C.slate1, C.night1];

const clock_tower: SceneFn = (p, tod) => {
  const night = tod === 'night';
  bricks(p, 0, 0, W, 74, [C.mist0, C.slate2, C.slate1, C.slate0], 10, 5);
  // 지붕 들보
  p.poly([[0, 0], [40, 0], [0, 26]], C.wood3);
  p.line(0, 26, 40, 0, C.wood2);
  p.poly([[120, 0], [160, 0], [160, 26]], C.wood3);
  p.line(160, 26, 120, 0, C.wood2);
  p.rect(0, 0, W, 3, C.wood3);
  p.hline(0, W - 1, 3, C.wood4);
  // 비둘기
  for (const x of [10, 16, 146]) {
    p.sprite(x, x > 100 ? 10 : 8, ['.ww.', 'wwww', '.mm.'], { w: C.mist1, m: C.slate2 });
    p.set(x + (x > 100 ? 0 : 3), x > 100 ? 10 : 8, C.slate1);
  }
  // 시계 문자판 (뒷면) 너머의 도시
  const cx = 80;
  const cy = 31;
  const R = 26;
  p.ellipse(cx, cy, R + 4, R + 4, C.slate0);
  p.ellipse(cx, cy, R + 2.5, R + 2.5, C.wood3);
  within(p, (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < R, () => {
    sky(p, tod, R * 2, cx - R, cy - R, R * 2);
    if (night) {
      stars(p, 9, 20, cy, cx - R, cx + R);
      moon(p, cx + 12, cy - 14, 3);
    }
    clouds(p, 5, tod, 30, 2);
    const r = rng(9);
    for (let x = cx - R; x < cx + R; x += 5 + Math.floor(r() * 4)) {
      const h = 6 + Math.floor(r() * 10);
      const w = 5 + Math.floor(r() * 4);
      p.rect(x, cy + 22 - h, w, h + 10, [C.mist1, C.tan0, C.mist0, C.wood0][Math.floor(r() * 4)]);
      p.poly([[x - 1, cy + 22 - h], [x + w / 2, cy + 22 - h - 4], [x + w + 1, cy + 22 - h]], r() < 0.5 ? C.red2 : C.blue2);
      if (r() < 0.7) p.rect(x + 2, cy + 25 - h, 1, 2, night ? C.gold1 : C.slate1);
    }
    p.rect(cx - 14, cy + 2, 4, 14, C.mist1);
    p.poly([[cx - 15, cy + 2], [cx - 12, cy - 6], [cx - 9, cy + 2]], C.blue2);
    // 젖빛 유리
    p.map((c, x, y) => (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < R ? nearest(mix(c, night ? C.slate1 : C.white, night ? 0.12 : 0.22)) : c));
  });
  ring(p, cx, cy, R, R, C.slate0);
  ring(p, cx, cy, R - 0.6, R - 0.6, C.slate1);
  ring(p, cx, cy, R * 0.62, R * 0.62, C.slate0);
  for (let k = 0; k < 12; k++) {
    const a = -Math.PI / 2 - (k * Math.PI * 2) / 12;
    p.line(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, cx + Math.cos(a) * R, cy + Math.sin(a) * R, C.slate1);
    // 거꾸로 비친 숫자 표시
    const [mx, my] = onEllipse(cx, cy, R - 4, R - 4, a + Math.PI / 12);
    p.rect(Math.round(mx) - (k % 3 === 0 ? 1 : 0), Math.round(my) - 1, k % 3 === 0 ? 3 : 1, 3, C.ink);
  }
  // 시곗바늘 (뒤에서 본 모습)
  p.line(cx, cy, cx - 9, cy - 13, C.ink);
  p.line(cx + 1, cy, cx - 8, cy - 13, C.ink);
  p.line(cx, cy, cx + 15, cy + 4, C.ink);
  p.ellipse(cx, cy, 3.4, 3.4, BRASS[1]);
  p.ellipse(cx - 0.6, cy - 0.6, 1.6, 1.6, BRASS[0]);
  // 축과 톱니바퀴
  p.rect(cx - 1, cy + 3, 3, 40, IRON[2]);
  p.vline(cx - 1, cy + 3, cy + 42, IRON[1]);
  gear(p, 24, 52, 21, 18, BRASS, 0.1, 6);
  gear(p, 50, 30, 9, 10, IRON, 0.25, 4);
  gear(p, 54, 72, 10, 11, BRASS, 0.2, 4);
  gear(p, 138, 46, 18, 16, BRASS, 0.05, 5);
  gear(p, 112, 22, 8, 9, IRON, 0.3, 4);
  gear(p, 114, 70, 9, 10, IRON, 0.15, 4);
  p.rect(30, 51, 50, 3, IRON[2]);
  p.hline(30, 79, 51, IRON[1]);
  p.rect(82, 46, 56, 3, IRON[2]);
  p.hline(82, 137, 46, IRON[1]);
  // 추 (오른쪽 끝)
  p.vline(155, 3, 60, C.slate0);
  p.ellipse(155, 64, 4, 5, (x, y) => (x < 155 && y < 63 ? BRASS[0] : BRASS[2]));
  // 나무 바닥
  for (let y = 74; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (x - 80) / (0.4 + (y - 74) / 16);
      const plank = Math.floor(k / 12);
      p.set(x, y, Math.abs(k % 12) < 0.8 ? C.wood4 : plank % 2 ? C.wood2 : C.wood3);
    }
  }
  p.hline(0, W - 1, 74, C.wood4);
  p.rect(0, 74, W, 2, C.slate0);
  if (!night) sunbeam(p, [[cx - 20, cy + 16], [cx + 20, cy + 16], [cx + 34, 90], [cx - 34, 90]], tod, 0.18);
  ambient(p, tod);
  if (night || tod === 'dusk') {
    p.hline(8, 14, 34, C.slate0);
    p.vline(14, 35, 36, C.slate0);
    warm(p, 14, 40, night ? 34 : 22, night ? 0.5 : 0.3);
    lanternBody(p, 12, 37);
  }
  if (night) light(p, cx, cy + 18, 22, C.gold2, 0.2);
};

const mage_tower: SceneFn = (p, tod) => {
  const night = tod === 'night';
  // 둥근 벽 (줄눈이 휘어 있다)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < W; x++) {
      const u = Math.asin(Math.max(-1, Math.min(1, (x + 0.5 - 80) / 96)));
      const yy = y + (1 - Math.cos(u)) * 26 * ((y - 34) / 34);
      const row = Math.floor(yy / 5);
      const bx = u * 60 + (row % 2) * 5;
      const edge = ((yy % 5) + 5) % 5 < 1 || ((bx % 10) + 10) % 10 < 1;
      const shade = Math.abs(u) / 1.2;
      let c: number = edge ? C.slate0 : bayer(x, y) < 2 ? C.slate2 : C.slate1;
      if (bayer(x, y) < shade * 14) c = nearest(mix(c, C.violet4, 0.5));
      p.set(x, y, c);
    }
  }
  // 둥근 천장의 별자리 그림
  for (let x = 0; x < W; x++) {
    const top = Math.round(12 + Math.pow((x - 80) / 80, 2) * 10);
    for (let y = 0; y < top; y++) p.set(x, y, bayer(x, y) < 3 ? C.violet4 : C.blue3);
    p.set(x, top, C.gold3);
    p.set(x, top + 1, C.slate0);
  }
  const cons: [number, number][][] = [
    [[20, 4], [28, 8], [36, 5], [42, 10]],
    [[64, 3], [70, 7], [78, 4], [74, 10], [64, 3]],
    [[96, 8], [104, 3], [112, 6], [120, 2]],
    [[132, 7], [140, 11], [148, 6]],
  ];
  for (const c of cons) {
    for (let i = 0; i + 1 < c.length; i++) p.line(c[i][0], c[i][1], c[i + 1][0], c[i + 1][1], C.gold3);
    for (const [x, y] of c) sparkle(p, x, y, C.gold0, C.gold2);
  }
  // 별자리 지도 (왼쪽 벽)
  const mx = 26;
  const my = 36;
  p.ellipse(mx, my, 19, 19, C.wood3);
  p.ellipse(mx, my, 17.5, 17.5, C.gold2);
  p.ellipse(mx, my, 16, 16, C.blue3);
  ring(p, mx, my, 12, 12, C.blue2);
  ring(p, mx, my, 15, 15, C.gold3);
  for (let k = 0; k < 24; k++) {
    const [x, y] = onEllipse(mx, my, 15, 15, (k / 24) * Math.PI * 2);
    p.set(x, y, k % 2 ? C.gold1 : C.gold3);
  }
  ring(p, mx + 3, my - 2, 9, 5, C.violet2);
  const st: [number, number][] = [[mx - 8, my - 6], [mx - 3, my - 9], [mx + 2, my - 4], [mx + 7, my - 8], [mx + 4, my + 3], [mx - 5, my + 4], [mx - 1, my + 9], [mx + 9, my + 7]];
  for (let i = 0; i + 1 < st.length; i++) if (i !== 3) p.line(st[i][0], st[i][1], st[i + 1][0], st[i + 1][1], C.sky1);
  for (const [x, y] of st) p.set(x, y, C.white);
  p.set(mx, my, C.gold0);
  // 높은 아치 창 (오른쪽)
  const wx = 116;
  const wy = 18;
  const ww = 28;
  const wh = 36;
  p.rect(wx - 3, wy, ww + 6, wh + 3, C.slate0);
  p.ellipse(wx + ww / 2, wy, ww / 2 + 3, 12, C.slate0);
  within(p, (x, y) => x >= wx && x < wx + ww && y < wy + wh && (y >= wy || Math.hypot((x + 0.5 - wx - ww / 2) / (ww / 2), (y + 0.5 - wy) / 10) < 1), () => {
    sky(p, tod, wh + 12, wx, wy - 12, ww);
    if (night || tod === 'dusk') stars(p, 17, 14, wy + 20, wx, wx + ww);
    if (night) moon(p, wx + 19, wy + 2, 4);
    ridge(p, 4, wy + wh - 4, 3, night ? C.night1 : C.leaf3, 8, wy + wh);
  });
  p.vline(wx + ww / 2, wy - 10, wy + wh - 1, C.slate0);
  p.hline(wx, wx + ww - 1, wy + 14, C.slate0);
  p.rect(wx - 4, wy + wh, ww + 8, 3, C.slate2);
  p.hline(wx - 4, wx + ww + 3, wy + wh, C.mist0);
  // 망원경
  for (const [x0, x1] of [[104, 98], [104, 110], [104, 104]] as [number, number][]) p.line(x0, 58, x1, 76, C.wood2);
  p.rect(102, 56, 5, 3, BRASS[2]);
  for (let t = 0; t < 30; t++) {
    const x = 100 + t * 1.15;
    const y = 62 - t * 1.05;
    const r = 2 + t * 0.06;
    p.ellipse(x, y, r, r, t % 9 < 1 ? BRASS[0] : t > 26 ? BRASS[2] : BRASS[1]);
  }
  p.ellipse(134.5, 30.5, 2.4, 2.4, C.sky0);
  // 휘어진 서가 (뒷벽 가운데)
  const sr = rng(11);
  const spines = [C.red1, C.red2, C.blue1, C.blue2, C.leaf2, C.gold2, C.violet2, C.teal2, C.wood1];
  for (let x = 46; x < 104; x++) {
    const bow = Math.pow((x - 75) / 30, 2) * 5;
    const top = Math.round(24 + bow);
    const bot = Math.round(60 - bow * 0.3);
    p.vline(x, top - 2, bot, C.wood3);
    p.set(x, top - 2, C.wood1);
    for (let k = 0; k < 3; k++) {
      const sy = top + 2 + k * 11;
      p.set(x, sy + 9, C.wood1);
      p.set(x, sy + 10, C.wood4);
      if (x > 47 && x < 102 && sr() < 0.82) {
        const c = spines[Math.floor((x * 7 + k * 13) / 2) % spines.length];
        const h = 6 + ((x * 3 + k) % 3);
        p.vline(x, sy + 9 - h, sy + 8, (x + k) % 2 ? c : nearest(mix(c, C.white, 0.2)));
      }
    }
  }
  // 바닥과 둥근 깔개
  for (let y = 62; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (x - 80) / (0.4 + (y - 62) / 22);
      p.set(x, y, Math.abs(k % 13) < 0.8 ? C.wood4 : Math.floor(k / 13) % 2 ? C.wood2 : C.wood3);
    }
  }
  p.rect(0, 60, W, 3, C.slate0);
  p.ellipse(80, 80, 62, 9, C.violet4);
  p.ellipse(80, 80, 59, 7.6, C.violet3);
  ring(p, 80, 80, 54, 6.4, C.gold3);
  // 책상과 수정구 (왼쪽 아래)
  p.rect(2, 64, 40, 3, C.wood1);
  p.hline(2, 41, 64, C.wood0);
  p.rect(4, 67, 3, 16, C.wood3);
  p.rect(36, 67, 3, 16, C.wood3);
  p.rect(10, 61, 7, 3, C.gold3);
  p.ellipse(13.5, 57, 4, 4, (x, y) => (x < 13 && y < 56 ? C.teal0 : C.teal1));
  p.rect(24, 60, 9, 4, C.red2);
  p.rect(25, 58, 7, 2, C.blue2);
  ambient(p, tod, night ? 0.9 : 0.8);
  // 떠다니는 책과 빛
  const books: [number, number, number, number][] = [[58, 30, C.red2, 1], [96, 22, C.blue2, -1], [74, 18, C.violet3, 0], [44, 20, C.leaf3, 1], [106, 36, C.gold3, -1]];
  for (const [x, y] of books) light(p, x, y + 2, 12, C.violet1, 0.35);
  for (const [x, y, c, t] of books) openBook(p, x, y, c, t);
  const fr = rng(31);
  for (let i = 0; i < 14; i++) {
    const x = 40 + fr() * 76;
    const y = 14 + fr() * 30;
    p.set(x, y, fr() < 0.5 ? C.violet0 : C.gold0);
  }
  light(p, 13.5, 57, 10, C.teal1, 0.5);
  sparkle(p, 12, 55, C.white, C.teal0);
  if (night || tod === 'dusk') warm(p, 36, 58, 20, 0.45);
  candle(p, 36, 59);
};

// ---------------------------------------------------------------- 실내 2 / 거리

const alchemy_lab: SceneFn = (p, tod) => {
  const night = tod === 'night';
  const WALL: Ramp = [C.wood2, C.wood3, C.wood4, C.ink];
  bricks(p, 0, 0, W, 66, WALL, 9, 4);
  p.map((c, x, y) => (y < 66 && bayer(x, y) < Math.abs(x - 80) / 14 ? nearest(mix(c, C.ink, 0.35)) : c));
  // 반지하 창 (위 가운데): 땅바닥 높이의 바깥
  win(p, 70, 13, 20, 9, tod, 1, 1, [C.slate1, C.slate0, C.night1, C.ink], () => {
    p.rect(70, 19, 20, 3, night ? C.leaf4 : C.leaf2);
    for (let x = 70; x < 90; x += 2) p.vline(x, 17 + (x % 3), 19, night ? C.leaf3 : C.leaf1);
  });
  for (let x = 72; x < 90; x += 4) p.vline(x, 13, 21, C.night1);
  // 낮은 천장과 들보, 기둥
  p.rect(0, 0, W, 6, C.wood4);
  for (let x = 0; x < W; x += 12) p.rect(x, 0, 5, 6, C.wood3);
  p.rect(0, 6, W, 6, C.wood2);
  p.hline(0, W - 1, 6, C.wood1);
  p.hline(0, W - 1, 11, C.wood4);
  for (const x of [50, 106]) {
    p.rect(x, 12, 5, 54, C.wood2);
    p.vline(x, 12, 65, C.wood1);
    p.vline(x + 4, 12, 65, C.wood4);
    p.line(x - 6, 12, x, 18, C.wood3);
    p.line(x + 10, 12, x + 4, 18, C.wood3);
  }
  // 플라스크 선반 (왼쪽 위)
  const liquids = [C.red1, C.leaf1, C.teal1, C.violet1, C.gold1, C.pink1, C.sky1, C.ember];
  const lr = rng(13);
  for (const y of [26, 40]) {
    p.rect(3, y, 44, 2, C.wood1);
    p.hline(3, 46, y + 2, C.wood4);
    for (let x = 5; x < 44; x += 5) {
      const liq = liquids[Math.floor(lr() * liquids.length)];
      if (lr() < 0.45) flask(p, x + 1, y, liq, 2);
      else bottle(p, x, y, liq, 4 + Math.floor(lr() * 3));
    }
  }
  // 표본 선반 (오른쪽 위)
  for (const y of [24, 36]) {
    p.rect(113, y, 44, 2, C.wood1);
    p.hline(113, 156, y + 2, C.wood4);
  }
  for (const [x, c] of [[116, C.leaf1], [124, C.gold1], [132, C.teal1], [140, C.pink1], [148, C.leaf0]] as [number, number][]) {
    p.rect(x, 17, 6, 7, nearest(mix(c, C.mist2, 0.4)));
    p.rect(x, 16, 6, 1, C.wood3);
    p.set(x + 2, 20, C.white);
    p.set(x + 3, 20, C.ink);
  }
  p.ellipse(126, 33, 3, 3, C.mist1);
  p.set(125, 33, C.ink);
  p.set(127, 33, C.ink);
  p.hline(125, 127, 35, C.ink);
  bottle(p, 134, 36, C.violet1, 5);
  bottle(p, 140, 36, C.red1, 4);
  p.rect(146, 31, 8, 5, C.wood3);
  p.rect(147, 30, 6, 1, C.red2);
  // 바닥 (얼룩진 돌)
  tileFloor(p, 66, 80, 26, 70, 1.4, 0.8, (i, j) => ((i * 5 + j * 3) % 4 === 0 ? C.slate1 : C.slate0), C.night1);
  p.hline(0, W - 1, 66, C.night1);
  p.ellipse(70, 82, 9, 1.8, C.leaf3);
  p.ellipse(70, 82, 6, 1, C.leaf2);
  // 솥과 삼발이 (왼쪽 아래)
  for (const [x0, x1] of [[16, 10], [40, 46], [28, 28]] as [number, number][]) p.line(x0, 64, x1, 82, C.slate0);
  p.ellipse(28, 64, 15, 10, (x, y) => (x < 22 && y < 64 ? C.slate1 : y > 69 ? C.night1 : C.slate0));
  p.ellipse(28, 56, 15, 3, C.slate1);
  p.ellipse(28, 56, 13, 2.2, C.leaf2);
  p.ellipse(28, 55.6, 10, 1.4, C.leaf1);
  // 증류기 (오른쪽 작업대)
  p.rect(110, 58, 50, 3, C.wood1);
  p.hline(110, 159, 58, C.wood0);
  p.rect(110, 61, 50, 2, C.wood3);
  for (const x of [113, 154]) p.rect(x, 63, 3, 20, C.wood3);
  p.rect(116, 50, 10, 8, C.slate1);
  p.rect(117, 49, 8, 1, C.slate2);
  flask(p, 121, 49, C.violet1, 5);
  p.line(122, 37, 136, 31, C.mist1);
  p.line(122, 38, 136, 32, C.mist2);
  for (let k = 0; k < 6; k++) p.ellipse(141, 33 + k * 3.6, 5, 1.6, (x) => (x < 140 ? RAMP.orange[0] : RAMP.orange[2]));
  p.vline(141, 31, 54, RAMP.orange[2]);
  p.line(146, 52, 150, 54, C.mist1);
  flask(p, 151, 58, C.violet0, 3);
  flask(p, 132, 58, C.gold1, 2);
  bottle(p, 136, 58, C.leaf1, 5);
  // 보안경 쓴 학생
  figure(p, 98, 45, C.wood2, RAMP.cream[1], { pants: C.slate1 });
  p.set(100, 47, C.sky0);
  p.set(102, 47, C.sky0);
  p.set(101, 47, C.gold3);
  p.line(105, 51, 110, 49, C.skin1);
  ambient(p, tod, night ? 1 : 0.9);
  // 불과 빛
  light(p, 28, 74, 30, C.ember, 0.4, 0.7);
  fire(p, 28, 81, 16, 7, 4);
  light(p, 28, 52, 30, C.leaf1, 0.4, 0.8);
  for (const [x, y] of [[22, 55], [31, 55], [35, 56]] as [number, number][]) {
    p.ellipse(x, y, 1.6, 1.4, C.leaf0);
    p.set(x, y - 1, C.white);
  }
  light(p, 121, 54, 9, C.sky1, 0.6);
  p.ellipse(121, 55, 1.4, 2, C.sky0);
  light(p, 121, 44, 12, C.violet1, 0.4);
  for (const [x, y, c] of [[16, 22, C.leaf1], [36, 38, C.teal1], [10, 38, C.pink1], [141, 45, C.gold1]] as [number, number, number][]) light(p, x, y, 6, c, 0.4);
  // 유황 김
  const puff = (x: number, y: number, rx: number, ry: number, c: number, k: number) => {
    for (let py = Math.floor(y - ry); py <= y + ry; py++) {
      for (let px = Math.floor(x - rx); px <= x + rx; px++) {
        const d = Math.hypot((px + 0.5 - x) / rx, (py + 0.5 - y) / ry);
        if (d < 1 && bayer(px, py) < (1 - d) * k) p.set(px, py, nearest(mix(p.get(px, py), c, 0.55)));
      }
    }
  };
  for (const [x, y, rx, ry] of [[30, 46, 12, 6], [22, 36, 14, 6], [36, 26, 16, 6], [56, 18, 22, 5], [94, 15, 26, 4], [150, 22, 10, 6]] as [number, number, number, number][]) {
    puff(x, y, rx, ry, C.blond0, 22);
    puff(x - rx * 0.2, y - ry * 0.3, rx * 0.6, ry * 0.6, C.leaf0, 14);
  }
  if (!night) sunbeam(p, [[70, 22], [90, 22], [118, 66], [86, 66]], tod, 0.2);
};

/** 성긴 벚꽃 덩어리 (안개 섞기) */
function blossom(p: Pix, cx: number, cy: number, r: number, seed: number, fogC: number, fog: number) {
  const rr = rng(seed);
  const tint = (c: number) => (fog > 0.02 ? nearest(mix(c, fogC, fog)) : c);
  const n = Math.max(5, Math.round(r * 0.45));
  const puffs: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rr() * Math.PI * 2;
    const d = Math.sqrt(rr()) * r * 0.7;
    puffs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.65, r * (0.3 + rr() * 0.22)]);
  }
  for (const [x, y, s] of puffs) p.ellipse(x + s * 0.15, y + s * 0.22, s, s * 0.78, (px, py) => tint(bayer(px, py) < 9 ? C.pink2 : C.pink1));
  for (const [x, y, s] of puffs) {
    p.ellipse(x, y, s * 0.86, s * 0.66, (px, py) => {
      const t = (py - (y - s * 0.66)) / (s * 1.32);
      if (t < 0.3 && px < x + s * 0.3) return tint(bayer(px, py) < 10 ? C.pink0 : C.pink1);
      return tint(t > 0.75 && bayer(px, py) < 6 ? C.pink2 : bayer(px, py) < 2 ? C.pink0 : C.pink1);
    });
  }
  for (let i = 0; i < r * 0.6; i++) p.set(cx + (rr() - 0.5) * r * 1.6, cy + (rr() - 0.5) * r, tint(C.white));
}

const garden_path: SceneFn = (p, tod) => {
  const vx = 80;
  const vy = 40;
  const F = 70;
  const E = 1.5;
  const P = proj(vx, vy, F);
  const night = tod === 'night';
  const fogC = night ? C.night1 : SKY[tod][SKY[tod].length - 1];
  sky(p, tod);
  if (night) stars(p, 4, 40, 40);
  // 땅: 꽃잎 깔린 길과 풀밭
  const pet = vnoise(12);
  for (let y = vy; y < H; y++) {
    const z = (F * E) / (y + 0.5 - vy);
    for (let x = 0; x < W; x++) {
      const X = ((x + 0.5 - vx) * z) / F;
      let c: number;
      const n = pet(X * 3, z * 1.4);
      if (Math.abs(X) < 0.95) {
        c = bayer(x, y) < 3 ? C.mist2 : C.blond0;
        if (n > 0.5 && bayer(x, y) < (n - 0.5) * 30) c = C.pink0;
        if (n > 0.7 && bayer(x, y) < 3) c = C.pink1;
      } else if (Math.abs(X) < 1.08) c = C.mist1;
      else {
        c = bayer(x, y) < 4 ? C.leaf2 : C.leaf1;
        if (n > 0.6 && bayer(x, y) < 8) c = C.pink1;
      }
      const fog = Math.min(0.7, Math.max(0, (z - 2) / 16));
      p.set(x, y, nearest(mix(c, fogC, fog)));
    }
  }
  // 멀리 보이는 정자
  const [gx, gy] = P(0, -E, 22);
  p.rect(Math.round(gx) - 5, Math.round(gy) - 6, 10, 6, nearest(mix(C.white, fogC, 0.4)));
  p.poly([[gx - 7, gy - 6], [gx, gy - 10], [gx + 7, gy - 6]], nearest(mix(C.red2, fogC, 0.4)));
  p.rect(Math.round(gx) - 2, Math.round(gy) - 4, 4, 4, nearest(mix(C.wood3, fogC, 0.4)));
  // 벚나무 (먼 것부터)
  const zs = [16, 12.5, 9.8, 7.7, 6.1, 4.8, 3.8, 3.0, 2.4];
  zs.forEach((z, i) => {
    const fog = Math.min(0.6, Math.max(0, (z - 2.4) / 18));
    for (const side of [-1, 1]) {
      const [tx, ty] = P(side * 1.75, -E, z);
      const [, tt] = P(side * 1.75, 0.9, z);
      const tw = Math.max(1, (F * 0.3) / z);
      const trunkC = nearest(mix(C.wood3, fogC, fog));
      const trunkD = nearest(mix(C.wood4, fogC, fog));
      const trunkL = nearest(mix(C.wood2, fogC, fog));
      p.poly([[tx - tw * 0.75, ty], [tx + tw * 0.75, ty], [tx + tw * 0.4, tt], [tx - tw * 0.4, tt]], (x) => ((x - tx) * -side > tw * 0.2 ? trunkL : (x - tx) * side > tw * 0.1 ? trunkD : trunkC));
      for (const [bx, by] of [[-side * 0.7, 1.9], [side * 0.25, 2.1], [-side * 0.1, 2.4]] as [number, number][]) {
        const [ex, ey] = P(side * 1.75 + bx, by, z);
        for (let k = 0; k < Math.max(1, Math.round(tw * 0.35)); k++) p.line(tx + k - tw * 0.2, tt, ex + k * 0.5, ey, k ? trunkD : trunkC);
      }
      const [cx, cy] = P(side * 1.45, 2.05, z);
      blossom(p, cx, cy, (F * 1.3) / z, 30 + i * 2 + (side > 0 ? 1 : 0), fogC, fog);
    }
  });
  for (const side of [-1, 1]) {
    const [cx, cy] = P(side * 1.9, 1.7, 2.0);
    blossom(p, cx, cy, (F * 1.2) / 2.0, 90 + side, fogC, 0);
  }
  // 벤치 (왼쪽)
  const bench = (side: number, z0: number, z1: number) => {
    const X = side * 1.35;
    const seat = [P(X, -E + 0.42, z0), P(X + side * 0.3, -E + 0.42, z0), P(X + side * 0.3, -E + 0.42, z1), P(X, -E + 0.42, z1)];
    const back = [P(X + side * 0.3, -E + 0.42, z0), P(X + side * 0.3, -E + 0.9, z0), P(X + side * 0.3, -E + 0.9, z1), P(X + side * 0.3, -E + 0.42, z1)];
    p.poly(back, C.wood2);
    p.poly(seat, C.wood1);
    for (const z of [z0 + 0.1, z1 - 0.1]) {
      const a = P(X, -E + 0.42, z);
      const b = P(X, -E, z);
      p.line(a[0], a[1], b[0], b[1], C.wood4);
    }
    const a = P(X + side * 0.3, -E + 0.9, z0);
    const b = P(X + side * 0.3, -E + 0.9, z1);
    p.line(a[0], a[1], b[0], b[1], C.wood0);
  };
  bench(-1, 3.4, 4.3);
  bench(1, 5.4, 6.2);
  // 벤치에 앉은 학생
  const [sx, sy] = P(1.5, -E + 0.42, 5.8);
  figure(p, Math.round(sx) - 3, Math.round(sy) - 9, C.blond1, RAMP.uniform[1], { sit: true, flip: true });
  // 걸어가는 두 사람
  for (const [X, z, hair] of [[-0.25, 9, C.wood3], [0.2, 9.4, C.ink]] as [number, number, number][]) {
    const [fx, fy] = P(X, -E, z);
    backFigure(p, Math.round(fx) - 3, Math.round(fy) - 14, hair, RAMP.uniform[1], RAMP.uniform[2]);
  }
  // 가로등 기둥
  const lamps: [number, number][] = [];
  for (const [side, z] of [[-1, 6.6], [1, 4.2], [-1, 2.6]] as [number, number][]) {
    const [lx, ly] = P(side * 1.15, -E, z);
    const [, lt] = P(side * 1.15, 0.9, z);
    p.vline(Math.round(lx), Math.round(lt), Math.round(ly), C.slate0);
    const s = Math.max(1, Math.round(4 / z));
    p.rect(Math.round(lx) - s, Math.round(lt) - s * 2, s * 2 + 1, s * 2, night || tod === 'dusk' ? C.gold1 : C.mist2);
    p.hline(Math.round(lx) - s - 1, Math.round(lx) + s + 1, Math.round(lt) - s * 2 - 1, C.slate0);
    lamps.push([lx, lt - s]);
  }
  ambient(p, tod, 0.85);
  if (night || tod === 'dusk') {
    for (const [lx, ly] of lamps) {
      warm(p, lx, ly, night ? 22 : 14, night ? 0.5 : 0.3);
      p.set(lx, ly, C.gold0);
    }
  }
  // 흩날리는 꽃잎
  const fr = rng(55);
  for (let i = 0; i < 46; i++) {
    const x = fr() * W;
    const y = fr() * H;
    const c = night ? (fr() < 0.5 ? C.pink2 : C.mist1) : fr() < 0.5 ? C.pink0 : C.pink1;
    p.set(x, y, c);
    if (fr() < 0.4) p.set(x + 1, y + 1, night ? C.pink2 : C.pink1);
  }
};

const rain_courtyard: SceneFn = (p, tod) => {
  const night = tod === 'night';
  const skyC: Record<Tod, number[]> = {
    dawn: [C.slate1, C.slate2, C.mist0],
    day: [C.mist0, C.mist1, C.mist1],
    dusk: [C.slate0, C.slate1, C.violet2],
    night: [C.night0, C.night1, C.slate0],
  };
  // 회색 하늘과 맞은편 건물
  p.gradV(0, 0, W, 40, skyC[tod]);
  const wallC = night ? C.slate1 : C.mist1;
  p.rect(0, 16, W, 42, wallC);
  for (let y = 16; y < 58; y++) for (let x = 0; x < W; x++) if (bayer(x, y) < 2) p.set(x, y, C.mist0);
  p.rect(0, 12, W, 5, C.slate1);
  for (let x = 0; x < W; x += 3) p.vline(x, 12, 15, C.slate0);
  p.hline(0, W - 1, 17, C.slate0);
  // 탑 (오른쪽 뒤)
  p.rect(122, 0, 18, 17, wallC);
  p.poly([[120, 0], [131, -10], [142, 0]], C.slate1);
  p.rect(129, 4, 4, 7, C.slate0);
  const lit = rng(3);
  for (let x = 8; x < W; x += 16) {
    p.rect(x, 24, 8, 12, C.slate0);
    p.ellipse(x + 4, 24, 4, 3, C.slate0);
    const on = (night || tod === 'dusk') && lit() < 0.55;
    p.rect(x + 1, 24, 6, 11, on ? C.gold1 : night ? C.night1 : C.slate1);
    p.ellipse(x + 4, 24, 3, 2, on ? C.gold1 : night ? C.night1 : C.slate1);
    p.vline(x + 4, 22, 35, C.slate0);
    p.hline(x, x + 7, 37, C.mist2);
    if (x === 72) {
      p.rect(x, 40, 8, 18, C.wood3);
      p.ellipse(x + 4, 40, 4, 3, C.wood3);
      p.vline(x + 4, 38, 57, C.wood4);
    }
  }
  p.rect(0, 54, W, 4, C.slate1);
  // 젖은 안뜰
  const wet = vnoise(17);
  for (let y = 58; y < 74; y++) {
    for (let x = 0; x < W; x++) {
      const n = wet(x * 0.1, y * 0.4);
      let c: number = (x + (y % 2) * 4) % 8 === 0 || y % 4 === 0 ? C.slate1 : C.slate2;
      if (n > 0.6) c = night ? C.night1 : nearest(mix(skyC[tod][1], C.slate1, 0.3));
      if (n > 0.6 && bayer(x, y) < 4) c = nearest(mix(wallC, C.slate1, 0.3));
      p.set(x, y, c);
    }
  }
  // 우물과 나무
  p.rect(28, 50, 22, 12, C.slate2);
  bricks(p, 28, 50, 22, 12, STONE, 6, 3);
  p.ellipse(39, 50, 11, 2.4, C.mist1);
  p.ellipse(39, 50, 9, 1.4, C.night1);
  p.vline(30, 34, 50, C.wood3);
  p.vline(48, 34, 50, C.wood3);
  p.poly([[26, 36], [39, 28], [52, 36]], C.wood2);
  p.hline(26, 52, 36, C.wood4);
  p.vline(39, 36, 44, C.slate0);
  p.rect(37, 44, 4, 3, C.wood2);
  p.rect(140, 36, 4, 24, C.wood3);
  p.ellipse(142, 30, 14, 12, (x, y) => (x + y < 164 ? C.leaf2 : bayer(x, y) < 5 ? C.leaf4 : C.leaf3));
  // 우산 쓴 학생
  figure(p, 118, 46, C.wood2, RAMP.uniform[1], { pants: RAMP.uniform[2] });
  p.vline(121, 40, 47, C.wood3);
  p.poly([[113, 42], [121, 36], [129, 42]], C.red1);
  p.hline(113, 129, 42, C.red2);
  // 회랑 (앞): 기둥과 아치
  const cols = [0, 53, 107, 160];
  const inArch = (x: number, y: number) => {
    for (let k = 0; k < 3; k++) {
      const a = cols[k] + 6;
      const b = cols[k + 1] - 6;
      const mid = (a + b) / 2;
      const hw = (b - a) / 2;
      if (x >= a && x < b && y < 74 && (y >= 26 || Math.hypot((x + 0.5 - mid) / hw, (y + 0.5 - 26) / 20) < 1)) return true;
    }
    return false;
  };
  const arcadeC = (x: number, y: number) => (bayer(x, y) < 3 ? C.slate1 : C.slate2);
  for (let y = 0; y < 74; y++) for (let x = 0; x < W; x++) if (!inArch(x, y)) p.set(x, y, arcadeC(x, y));
  for (let y = 0; y < 6; y++) for (let x = 0; x < W; x++) p.set(x, y, y === 5 ? C.slate0 : bayer(x, y) < 6 ? C.slate0 : C.slate1);
  for (let k = 0; k < 3; k++) {
    const a = cols[k] + 6;
    const b = cols[k + 1] - 6;
    const mid = (a + b) / 2;
    const hw = (b - a) / 2;
    for (let i = 0; i <= 80; i++) {
      const t = Math.PI + (i / 80) * Math.PI;
      p.set(mid + Math.cos(t) * (hw + 0.5), 26 + Math.sin(t) * 20.5, C.mist0);
      p.set(mid + Math.cos(t) * (hw + 1.5), 26 + Math.sin(t) * 21.5, C.mist1);
    }
  }
  for (const c of cols) {
    p.rect(c - 6, 0, 12, 74, C.mist1);
    p.vline(c - 6, 0, 73, C.mist2);
    p.vline(c + 5, 0, 73, C.slate2);
    p.rect(c - 7, 22, 14, 3, C.mist2);
    p.rect(c - 7, 68, 14, 6, C.mist0);
    p.hline(c - 7, c + 6, 68, C.mist1);
  }
  // 회랑 바닥
  for (let y = 74; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const z = 300 / (y - 50);
      const row = Math.floor(z);
      const u = ((x - 80) * z) / 70 + (row % 2) * 0.5;
      p.set(x, y, z % 1 < 0.1 || Math.abs(u % 1) < 0.06 ? C.slate1 : (row + Math.floor(u)) % 3 === 0 ? C.mist0 : C.mist1);
    }
  }
  for (let x = 0; x < W; x++) for (let y = 74; y < 78; y++) if (bayer(x, y) < 10 - (y - 74) * 2) p.set(x, y, C.slate2);
  ambient(p, tod, 0.9);
  // 비
  rainfall(p, 8, 150, (x, y) => inArch(x, y), night ? C.slate2 : C.mist1, night ? C.slate1 : C.mist0);
  const sp = rng(5);
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(sp() * W);
    const y = 59 + Math.floor(sp() * 13);
    if (!inArch(x, y)) continue;
    p.set(x - 1, y - 1, night ? C.slate2 : C.mist1);
    p.set(x + 1, y - 1, night ? C.slate2 : C.mist1);
    p.hline(x - 2, x + 2, y, nearest(mix(p.get(x, y), night ? C.slate2 : C.mist2, 0.5)));
  }
  for (let k = 0; k < 3; k++) {
    const mid = (cols[k] + cols[k + 1]) / 2;
    for (const dx of [-12, 4, 14]) for (let y = 10; y < 70; y += 9) if (inArch(mid + dx, y + (k * 3) % 7)) p.set(mid + dx, y + (k * 3) % 7, night ? C.slate2 : C.sky0);
  }
  if (night || tod === 'dusk') {
    for (const lx of [26, 134]) {
      p.vline(lx + 2, 5, 9, C.slate0);
      warm(p, lx + 2, 13, night ? 36 : 22, night ? 0.5 : 0.3);
      lanternBody(p, lx, 10);
    }
  }
};

const tavern: SceneFn = (p, tod) => {
  const night = tod === 'night';
  // 뒷벽: 세로 판자
  for (let y = 0; y < 66; y++) for (let x = 0; x < W; x++) p.set(x, y, x % 7 === 0 ? C.wood4 : (Math.floor(x / 7) + Math.floor(y / 23)) % 3 === 0 ? C.wood2 : C.wood3);
  p.rect(0, 0, W, 5, C.wood4);
  p.hline(0, W - 1, 4, C.wood2);
  // 작은 창
  win(p, 46, 10, 14, 16, tod, 2, 2, OLD_WOOD, () => {
    if (night) moon(p, 55, 13, 2);
  });
  // 벽난로 (왼쪽)
  bricks(p, 2, 16, 40, 50, STONE, 8, 4);
  p.rect(0, 14, 44, 4, C.wood2);
  p.hline(0, 43, 14, C.wood1);
  p.rect(8, 40, 28, 26, C.ink);
  p.ellipse(22, 40, 14, 6, C.ink);
  p.rect(6, 64, 32, 2, C.slate1);
  // 벽난로 위 방패 간판
  p.poly([[14, 2], [30, 2], [30, 9], [22, 13], [14, 9]], C.wood1);
  p.poly([[15, 3], [29, 3], [29, 8], [22, 12], [15, 8]], C.red2);
  p.ellipse(22, 7, 3, 3, C.gold1);
  p.rect(21, 4, 2, 2, C.gold1);
  // 술병 선반 (가운데 위)
  const br = rng(21);
  for (const y of [18, 30]) {
    p.rect(64, y, 44, 2, C.wood1);
    p.hline(64, 107, y + 2, C.wood4);
    for (let x = 66; x < 105; x += 4) {
      if (br() < 0.15) continue;
      bottle(p, x, y, [C.leaf3, C.red2, C.gold3, C.wood2, C.teal3, C.violet3][Math.floor(br() * 6)], 5 + Math.floor(br() * 3));
    }
  }
  for (const x of [66, 74, 82]) {
    p.rect(x, 39, 5, 5, C.mist1);
    p.vline(x + 5, 40, 42, C.mist1);
    p.hline(x, x + 4, 39, C.white);
  }
  // 술통 (오른쪽 위)
  p.rect(110, 46, 50, 3, C.wood4);
  p.rect(110, 27, 50, 2, C.wood4);
  for (const [cx, cy, r] of [[120, 38, 8], [138, 38, 8], [156, 38, 8], [129, 19, 7], [147, 19, 7]] as [number, number, number][]) barrelEnd(p, cx, cy, r, cy > 30);
  // 등불 들보
  p.rect(0, 5, W, 2, C.wood3);
  // 바닥
  for (let y = 66; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (x - 80) / (0.4 + (y - 66) / 18);
      p.set(x, y, Math.abs(k % 14) < 0.8 ? C.wood4 : Math.floor(k / 14) % 2 ? C.wood2 : nearest(mix(C.wood2, C.wood1, 0.4)));
    }
  }
  p.hline(0, W - 1, 66, C.wood4);
  // 주인 (카운터 뒤)
  figure(p, 92, 38, C.wood3, C.mist2, { flip: true });
  p.rect(93, 43, 5, 6, C.wood1);
  p.rect(88, 43, 3, 4, C.mist1);
  // 카운터
  p.rect(48, 50, 112, 3, C.wood1);
  p.hline(48, 159, 50, C.wood0);
  p.rect(50, 53, 110, 13, C.wood2);
  for (let x = 54; x < 160; x += 16) {
    p.frame(x, 55, 12, 9, C.wood3);
    p.hline(x + 1, x + 10, 56, C.wood1);
  }
  p.hline(50, 159, 65, C.wood4);
  for (const x of [58, 104, 118]) {
    p.rect(x, 45, 4, 5, C.gold2);
    p.hline(x, x + 3, 45, C.white);
    p.vline(x + 4, 46, 48, C.gold3);
  }
  // 카운터 손님 (뒷모습)
  for (const [x, hair, cloth] of [[126, C.red2, C.leaf3], [144, C.ink, C.blue2]] as [number, number, number][]) {
    backHead(p, x, 40, hair, cloth, 1.5);
    p.rect(x - 4, 66, 8, 2, C.wood1);
    p.vline(x - 3, 68, 76, C.wood3);
    p.vline(x + 2, 68, 76, C.wood3);
  }
  p.rect(126 + 5, 46, 3, 4, C.gold2);
  // 앞 탁자 (양옆)
  for (const [tx, w, seats] of [[0, 40, [4, 28]], [126, 34, [128, 148]]] as [number, number, number[]][]) {
    seats.forEach((sx, i) => figure(p, sx, 62, HAIRS[(sx * 3) % HAIRS.length], [C.red2, C.blue2, C.leaf3, C.gold3][(sx + i) % 4], { sit: true, flip: i === 1 }));
    p.rect(tx, 72, w, 3, C.wood1);
    p.hline(tx, tx + w - 1, 72, C.wood0);
    p.rect(tx, 75, w, 2, C.wood3);
    p.rect(tx + w / 2 - 2, 77, 4, 13, C.wood3);
    for (let k = 0; k < 3; k++) {
      const mx = tx + 6 + k * 10;
      p.rect(mx, 68, 4, 4, C.gold2);
      p.hline(mx, mx + 3, 68, C.white);
    }
  }
  p.line(10, 66, 13, 60, C.skin1);
  p.rect(12, 57, 4, 4, C.gold2);
  p.hline(12, 15, 57, C.white);
  p.line(152, 66, 150, 60, C.skin1);
  p.rect(148, 57, 4, 4, C.gold2);
  p.hline(148, 151, 57, C.white);
  ambient(p, tod, 0.7);
  // 벽난로 불, 등불
  light(p, 22, 58, 46, C.ember, 0.45, 0.8);
  fire(p, 22, 64, 22, 12, 7);
  for (const x of [32, 80, 128]) {
    p.vline(x + 2, 7, 10, C.slate0);
    warm(p, x + 2, 14, night ? 40 : 30, night ? 0.6 : 0.4);
    lanternBody(p, x, 11);
  }
};

/** 수녀 (검은 수도복, 흰 두건) */
function nun(p: Pix, x: number, y: number, flip = false) {
  figure(p, x, y, C.ink, C.night1, { flip, pants: C.night1 });
  p.hline(x + 1, x + 5, y + 1, C.white);
  p.set(x + 1, y + 2, C.white);
  p.set(x + 5, y + 2, C.white);
  p.hline(x + 2, x + 4, y + 4, C.white);
  for (let dy = 9; dy <= 12; dy++) p.hline(x + 1, x + 5, y + dy, C.night1);
  p.hline(x + 1, x + 5, y + 13, C.ink);
}

const church_kitchen: SceneFn = (p, tod) => {
  const night = tod === 'night';
  sky(p, tod, 52);
  if (night) {
    stars(p, 33, 40, 34, 0, 70);
    moon(p, 22, 10, 4);
  } else if (tod === 'dusk') sun(p, 30, 40, 7, tod);
  clouds(p, 9, tod, 22, 2);
  // 뒤쪽 마을 집들
  p.rect(0, 40, 64, 22, C.slate2);
  house(p, -4, 50, 20, 22, C.tan0, C.red2, night, 1);
  house(p, 17, 50, 18, 28, C.mist1, C.blue2, night, 2);
  house(p, 36, 50, 22, 18, C.wood0, C.slate1, night, 3);
  // 교회 (오른쪽)
  bricks(p, 62, 0, 98, 62, STONE, 10, 5);
  p.rect(60, 0, 6, 62, C.mist0);
  p.vline(60, 0, 61, C.mist1);
  p.vline(65, 0, 61, C.slate2);
  // 큰 스테인드글라스 창
  const gx = 96;
  const gw = 26;
  p.rect(gx - 2, 8, gw + 4, 24, C.slate1);
  p.ellipse(gx + gw / 2, 8, gw / 2 + 2, 8, C.slate1);
  within(p, (x, y) => x > gx && x < gx + gw - 1 && y < 30 && (y >= 8 || Math.hypot((x + 0.5 - gx - gw / 2) / (gw / 2), (y + 0.5 - 8) / 7) < 1), () => {
    for (let y = 0; y < 32; y++) {
      for (let x = gx; x < gx + gw; x++) {
        const cell = (Math.floor((x - gx) / 4) * 3 + Math.floor(y / 4) * 5) % 6;
        p.set(x, y, (x - gx) % 4 === 0 || y % 4 === 0 ? C.slate0 : [C.blue1, C.red1, C.gold1, C.blue2, C.leaf2, C.violet2][cell]);
      }
    }
  });
  p.vline(gx + gw / 2 - 0.5, 1, 29, C.slate1);
  p.vline(gx + gw / 2 + 0.5, 1, 29, C.slate1);
  // 십자가
  p.rect(146, 2, 2, 12, C.gold2);
  p.rect(143, 5, 8, 2, C.gold2);
  // 차양
  p.rect(70, 36, 2, 20, C.wood3);
  p.rect(126, 36, 2, 20, C.wood3);
  awning(p, 66, 32, 66, 6, C.white, RAMP.cream[1], 6);
  // 바닥 돌
  for (let y = 62; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const z = 360 / (y - 46);
      const row = Math.floor(z * 1.4);
      const u = ((x - 80) * z) / 90 + (row % 2) * 0.5;
      p.set(x, y, (z * 1.4) % 1 < 0.12 || Math.abs(u % 1) < 0.08 ? C.slate1 : (row + Math.floor(u)) % 3 === 0 ? C.mist0 : C.slate2);
    }
  }
  p.hline(0, W - 1, 62, C.slate1);
  // 빵 탁자
  nun(p, 100, 39);
  p.rect(98, 45, 3, 2, C.skin1);
  p.ellipse(96, 45, 2.5, 1.6, C.wood1);
  p.rect(74, 52, 52, 3, C.wood1);
  p.hline(74, 125, 52, C.wood0);
  p.rect(76, 55, 3, 9, C.wood3);
  p.rect(121, 55, 3, 9, C.wood3);
  for (const bx of [80, 108]) {
    p.ellipse(bx + 6, 50, 7, 3, C.blond2);
    for (let k = 0; k < 4; k++) p.ellipse(bx + 2 + k * 3, 48.5 - (k % 2), 2.2, 1.6, k % 2 ? C.wood0 : C.wood1);
    p.hline(bx, bx + 12, 52, C.blond3);
  }
  // 큰 솥과 수녀 (오른쪽)
  nun(p, 140, 40, true);
  p.line(140, 46, 136, 50, C.wood1);
  p.line(136, 50, 134, 56, C.wood2);
  for (const [x0, x1] of [[134, 130], [154, 158]] as [number, number][]) p.line(x0, 60, x1, 76, C.slate0);
  p.ellipse(144, 62, 14, 9, (x, y) => (x < 138 && y < 62 ? C.slate1 : y > 67 ? C.night1 : C.slate0));
  p.ellipse(144, 55, 14, 2.6, C.slate1);
  p.ellipse(144, 55, 12, 1.8, C.blond1);
  // 줄 선 사람들
  const queue: [number, number, number, number][] = [
    [6, 56, C.wood3, C.wood2],
    [16, 55, C.mist1, C.slate1],
    [27, 54, C.ink, RAMP.brownCloth[2]],
    [37, 55, C.blond2, C.leaf3],
    [46, 54, C.wood2, C.mist0],
    [56, 53, C.wood3, C.wood1],
    [65, 53, C.red2, C.slate2],
  ];
  queue.forEach(([x, y, hair, cloth], i) => {
    figure(p, x, y, hair, cloth, { pants: i % 2 ? C.wood3 : C.slate1 });
    if (i % 3 === 1) p.set(x + 2, y + 6, nearest(mix(cloth, C.white, 0.3)));
  });
  p.rect(36, 60, 4, 3, C.wood1);
  ambient(p, tod, 0.9);
  // 불과 김
  light(p, 144, 72, 22, C.ember, 0.45, 0.7);
  fire(p, 144, 76, 16, 6, 8);
  steam(p, 11, 144, 52, 22, 12);
  if (night || tod === 'dusk') {
    within(p, (x, y) => x > gx && x < gx + gw - 1 && y < 30 && y > 0, () => light(p, gx + gw / 2, 18, 20, C.gold1, night ? 0.4 : 0.2));
    for (const lx of [80, 116]) {
      warm(p, lx + 2, 42, night ? 30 : 20, night ? 0.5 : 0.3);
      lanternBody(p, lx, 39);
    }
  }
};

// ---------------------------------------------------------------- 실내 3

/** 샹들리에 (몸체만). 빛은 ambient 뒤에 */
function chandelier(p: Pix, x: number, y: number, r: number) {
  p.vline(x, 0, y - 3, C.gold3);
  p.line(x, y - 4, x - r, y, C.gold3);
  p.line(x, y - 4, x + r, y, C.gold3);
  ring(p, x, y, r, r * 0.25, C.gold2);
  ring(p, x, y + 0.6, r, r * 0.25, C.gold3);
  p.ellipse(x, y + 3, 2, 2, C.gold2);
  p.set(x, y + 5, C.gold1);
  for (let k = 0; k < 8; k++) {
    const [cx, cy] = onEllipse(x, y, r, r * 0.25, (k / 8) * Math.PI * 2);
    p.vline(cx, cy - 2, cy - 1, C.white);
    p.set(cx, cy - 3, C.gold0);
  }
  for (let k = 0; k < 5; k++) p.set(x - r + 1 + k * ((2 * r - 2) / 4), y + 2 + (k % 2), C.sky0);
}

function chandelierLight(p: Pix, x: number, y: number, r: number, amt: number) {
  light(p, x, y - 2, r * 4, C.gold2, amt);
  light(p, x, y - 2, r * 1.6, C.gold1, amt * 0.8);
}

const manor: SceneFn = (p, tod) => {
  const night = tod === 'night';
  const MARBLE: Ramp = [C.white, C.mist2, C.mist1, C.mist0];
  // 뒷벽: 대리석 패널
  for (let y = 0; y < 58; y++) {
    for (let x = 0; x < W; x++) {
      let c: number = bayer(x, y) < 2 ? MARBLE[2] : MARBLE[1];
      if ((x * 7 + y * 3) % 41 === 0) c = MARBLE[3];
      p.set(x, y, c);
    }
  }
  p.rect(0, 46, W, 12, C.wood2);
  for (let x = 0; x < W; x += 12) p.frame(x + 1, 48, 10, 8, C.wood3);
  p.hline(0, W - 1, 46, C.gold2);
  // 높은 창과 붉은 휘장 (양옆)
  for (const wx of [8, 136]) {
    win(p, wx, 10, 16, 32, tod, 2, 3, [C.white, C.mist1, C.mist0, C.slate2], () => {
      if (night) moon(p, wx + 10, 16, 2);
      roundTree(p, wx + 6, 42, 5, RAMP.greenCloth);
    });
    p.ellipse(wx + 8, 10, 10, 6, C.mist0);
    p.ellipse(wx + 8, 10, 8, 4.4, C.sky1);
    drape(p, wx - 6, 4, 7, 44, RAMP.red);
    drape(p, wx + 15, 4, 7, 44, RAMP.red);
    p.rect(wx - 7, 2, 30, 3, C.gold2);
    p.hline(wx - 7, wx + 22, 2, C.gold1);
  }
  // 기둥
  for (const cx of [38, 122]) {
    p.rect(cx - 4, 0, 8, 58, MARBLE[1]);
    p.vline(cx - 4, 0, 57, MARBLE[0]);
    p.vline(cx + 3, 0, 57, MARBLE[3]);
    for (let k = -2; k <= 2; k += 2) p.vline(cx + k, 6, 52, MARBLE[2]);
    p.rect(cx - 6, 2, 12, 4, C.gold2);
    p.hline(cx - 6, cx + 5, 2, C.gold1);
    p.rect(cx - 6, 52, 12, 6, MARBLE[2]);
    p.hline(cx - 6, cx + 5, 52, MARBLE[0]);
  }
  // 초상화 (계단 위)
  p.rect(60, 3, 40, 26, C.gold3);
  p.rect(61, 4, 38, 24, C.gold2);
  p.frame(62, 5, 36, 22, C.gold1);
  clipped(p, 63, 6, 34, 20, () => {
    p.gradV(63, 6, 34, 20, [C.leaf4, C.night1]);
    p.ellipse(80, 28, 13, 8, (x) => (x < 78 ? C.red1 : C.red2));
    p.rect(77, 18, 6, 4, C.red3);
    p.hline(76, 84, 21, C.white);
    p.ellipse(80, 14, 4.4, 5, (x, y) => (x > 81 || y > 16 ? C.skin2 : C.skin1));
    p.ellipse(80, 10.5, 5, 3, C.silver1);
    p.rect(75, 10, 2, 6, C.silver1);
    p.rect(83, 10, 2, 6, C.silver2);
    p.set(78, 14, C.ink);
    p.set(82, 14, C.ink);
    p.hline(79, 81, 17, C.skin3);
    p.rect(70, 22, 3, 2, C.gold1);
    p.rect(88, 23, 2, 3, C.gold1);
  });
  p.frame(60, 3, 40, 26, C.gold3);
  // 바닥: 체크무늬 대리석
  tileFloor(p, 58, 80, 28, 72, 1.6, 0.9, (i, j) => ((i + j) % 2 ? C.mist2 : C.mist0), C.mist1);
  p.hline(0, W - 1, 58, C.slate2);
  // 계단과 붉은 카펫
  for (let i = 9; i >= 0; i--) {
    const y = 60 - i * 3;
    const x0 = 46 + i * 1.2;
    const x1 = 114 - i * 1.2;
    p.rect(Math.round(x0), y, Math.round(x1 - x0), 3, MARBLE[1]);
    p.hline(Math.round(x0), Math.round(x1) - 1, y, MARBLE[0]);
    p.hline(Math.round(x0), Math.round(x1) - 1, y + 2, MARBLE[2]);
    p.rect(Math.round(68 + i * 0.6), y, Math.round(24 - i * 1.2), 3, C.red2);
    p.hline(Math.round(68 + i * 0.6), Math.round(91 - i * 0.6), y, C.red1);
    p.set(Math.round(68 + i * 0.6), y + 1, C.gold2);
    p.set(Math.round(91 - i * 0.6), y + 1, C.gold2);
  }
  p.rect(56, 28, 48, 3, MARBLE[1]);
  p.hline(56, 103, 28, MARBLE[0]);
  // 난간
  for (const side of [-1, 1]) {
    const bx = (t: number) => 80 + side * (35 - t * 12);
    const by = (t: number) => 62 - t * 32;
    for (let t = 0; t <= 1; t += 0.08) p.vline(Math.round(bx(t)), Math.round(by(t)) - 5, Math.round(by(t)), MARBLE[0]);
    for (let k = 0; k < 2; k++) p.line(bx(0), by(0) - 6 + k, bx(1), by(1) - 6 + k, k ? C.wood3 : C.wood2);
    const nx = Math.round(bx(0));
    p.rect(nx - 2, 52, 5, 12, MARBLE[1]);
    p.vline(nx - 2, 52, 63, MARBLE[0]);
    p.rect(nx - 3, 50, 7, 2, C.gold2);
    p.ellipse(nx + 0.5, 47, 2.4, 3, C.gold1);
  }
  p.poly([[66, 90], [94, 90], [89, 62], [71, 62]], (x, y) => (bayer(x, y) < 3 ? C.red3 : C.red2));
  p.line(66, 90, 71, 62, C.gold2);
  p.line(94, 90, 89, 62, C.gold2);
  // 화분
  for (const x of [20, 140]) {
    p.poly([[x - 5, 74], [x + 5, 74], [x + 3, 84], [x - 3, 84]], (px) => (px < x ? C.mist2 : C.mist1));
    p.hline(x - 5, x + 4, 74, C.gold2);
    p.ellipse(x, 66, 8, 9, (px, py) => {
      const k = px - x + (py - 66);
      return k < -5 ? C.leaf1 : k > 4 ? (bayer(px, py) < 8 ? C.leaf3 : C.leaf2) : bayer(px, py) < 2 ? C.leaf1 : C.leaf2;
    });
  }
  // 집사
  figure(p, 128, 46, C.mist1, C.ink, { flip: true, pants: C.ink });
  p.set(129, 50, C.white);
  p.set(130, 50, C.white);
  ambient(p, tod, 0.8);
  chandelier(p, 22, 12, 8);
  chandelier(p, 138, 12, 8);
  for (const x of [22, 138]) chandelierLight(p, x, 12, 8, night ? 0.5 : tod === 'dusk' ? 0.35 : 0.2);
  if (!night) {
    sunbeam(p, [[8, 44], [24, 44], [48, 90], [20, 90]], tod, 0.16);
    sunbeam(p, [[136, 44], [152, 44], [142, 90], [112, 90]], tod, 0.16);
  }
};

const waiting_room: SceneFn = (p, tod) => {
  const night = tod === 'night';
  bricks(p, 0, 0, W, 64, [C.mist0, C.slate2, C.slate1, C.slate0], 12, 6);
  p.map((c, x, y) => (y < 64 && bayer(x, y) < 5 ? nearest(mix(c, C.wood3, 0.2)) : c));
  // 들보
  p.rect(0, 0, W, 6, C.wood3);
  p.hline(0, W - 1, 5, C.wood4);
  for (let x = 6; x < W; x += 30) p.rect(x, 0, 4, 8, C.wood2);
  // 경기장으로 이어지는 통로 (오른쪽)
  const ax = 128;
  const ah = 22;
  const aSpring = 28;
  const inArch = (x: number, y: number) => Math.abs(x + 0.5 - ax) < ah && y < 64 && (y >= aSpring || Math.hypot(x + 0.5 - ax, (y + 0.5 - aSpring) * 1.2) < ah);
  const outC = night ? C.gold1 : tod === 'dusk' ? C.gold1 : tod === 'dawn' ? C.pink0 : C.gold0;
  // 통로 안쪽: 멀어질수록 작아지는 아치들
  const VY = 46;
  const inside = (x: number, y: number, k: number) => {
    const dx = x + 0.5 - ax;
    const yy = y + 0.5;
    if (Math.abs(dx) >= ah * k || yy >= VY + 18 * k) return false;
    if (yy >= VY - 18 * k) return true;
    return Math.hypot(dx, (yy - (VY - 18 * k)) * 1.2) < ah * k;
  };
  const S_END = 0.36;
  for (let y = 0; y < 64; y++) {
    for (let x = ax - ah; x < ax + ah; x++) {
      if (!inArch(x, y)) continue;
      let lo = 0.01;
      let hi = 1;
      for (let it = 0; it < 14; it++) {
        const mid = (lo + hi) / 2;
        if (inside(x, y, mid)) hi = mid;
        else lo = mid;
      }
      const k = hi;
      if (k < S_END) continue;
      const t = (1 - k) / (1 - S_END);
      const dx = Math.abs(x + 0.5 - ax);
      const isFloor = y + 0.5 > VY && (y + 0.5 - VY) / 18 >= dx / ah;
      let c: number;
      if (isFloor) c = t > 0.7 ? C.blond2 : t > 0.4 ? C.blond3 : C.wood3;
      else c = t > 0.8 ? C.slate2 : t > 0.55 ? C.slate1 : t > 0.25 ? C.slate0 : C.night1;
      if (Math.floor(3 / k) % 2 === 0 && !isFloor) c = nearest(mix(c, C.ink, 0.25));
      p.set(x, y, c);
    }
  }
  // 저 너머의 경기장
  const oL = Math.round(ax - ah * S_END);
  const oR = Math.round(ax + ah * S_END);
  const oT = Math.round(VY - 18 * S_END - (ah * S_END) / 1.2);
  const oB = Math.round(VY + 18 * S_END);
  within(p, (x, y) => inArch(x, y) && inside(x, y, S_END), () => {
    sky(p, tod, 10, oL, oT, oR - oL);
    if (night) stars(p, 5, 6, oT + 6, oL, oR);
    const cr = rng(4);
    for (let x = oL; x < oR; x++) {
      for (let y = oT + 7; y < oT + 12; y++) p.set(x, y, (y + x) % 2 ? [C.red2, C.blue2, C.gold2, C.leaf2, C.pink2][Math.floor(cr() * 5)] : C.slate2);
      p.set(x, oT + 12, C.slate1);
    }
    p.rect(oL, oT + 13, oR - oL, oB - oT - 13, C.blond1);
    p.hline(oL, oR, oT + 13, C.blond0);
  });
  for (let k = 0; k <= 70; k++) {
    const a = Math.PI + (k / 70) * Math.PI;
    for (let r = 0; r < 3; r++) p.set(ax + Math.cos(a) * (ah + r), aSpring + (Math.sin(a) * (ah + r)) / 1.2, r === 0 ? C.mist0 : r === 1 ? C.mist1 : C.slate1);
  }
  p.rect(ax - ah - 3, aSpring, 3, 36, C.mist1);
  p.rect(ax + ah, aSpring, 3, 36, C.mist0);
  // 올라간 내리닫이 쇠창살
  for (let x = ax - ah + 2; x < ax + ah - 1; x += 4) {
    const top = aSpring - Math.sqrt(Math.max(0, ah * ah - (x + 0.5 - ax) ** 2)) / 1.2;
    p.vline(x, Math.round(top) + 1, Math.round(top) + 5, C.ink);
    p.set(x, Math.round(top) + 6, C.slate1);
  }
  // 깃발 (통로 위)
  for (const [bx, c] of [[110, C.red2], [122, C.blue2], [134, C.gold3], [146, C.leaf3]] as [number, number][]) {
    p.poly([[bx, 6], [bx + 8, 6], [bx + 4, 14]], c);
    p.hline(bx, bx + 7, 6, nearest(mix(c, C.white, 0.3)));
  }
  // 무기대 (왼쪽 벽)
  p.rect(6, 14, 66, 3, C.wood2);
  p.hline(6, 71, 14, C.wood1);
  p.rect(6, 38, 66, 3, C.wood2);
  p.hline(6, 71, 38, C.wood1);
  for (let k = 0; k < 7; k++) {
    const x = 10 + k * 7;
    if (k === 3) {
      p.ellipse(x + 2, 27, 7, 8, (px, py) => (px < x + 1 ? C.blue1 : C.blue2));
      p.ellipse(x + 2, 27, 7, 8, (_px, _py, d) => (d > 0.78 ? C.gold2 : -1));
      p.ellipse(x + 2, 27, 1.8, 1.8, C.gold1);
      continue;
    }
    if (k % 2 === 0) {
      p.vline(x, 10, 40, C.mist1);
      p.vline(x + 1, 10, 40, C.slate2);
      p.hline(x - 2, x + 3, 33, C.gold2);
      p.rect(x, 34, 2, 5, C.wood2);
    } else {
      p.vline(x, 4, 44, C.wood1);
      p.poly([[x - 1, 8], [x + 1.5, 2], [x + 3, 8]], C.mist1);
    }
  }
  // 횃불
  for (const tx of [84, 100]) {
    p.rect(tx, 26, 2, 6, C.wood2);
    p.rect(tx - 1, 25, 4, 2, C.slate1);
  }
  // 바닥 (판석과 모래)
  for (let y = 64; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const z = 380 / (y - 44);
      const row = Math.floor(z);
      const u = ((x - 80) * z) / 80 + (row % 2) * 0.5;
      p.set(x, y, z % 1 < 0.08 || Math.abs(u % 1) < 0.05 ? C.slate2 : (row * 2 + Math.floor(u)) % 5 === 0 ? nearest(mix(C.mist0, C.slate2, 0.5)) : C.mist0);
    }
  }
  p.hline(0, W - 1, 64, C.slate0);
  // 긴 의자와 앉은 선수
  p.rect(4, 54, 92, 3, C.wood1);
  p.hline(4, 95, 54, C.wood0);
  p.rect(4, 57, 92, 2, C.wood3);
  for (const x of [8, 48, 90]) p.rect(x, 59, 3, 8, C.wood3);
  figure(p, 24, 44, C.wood3, C.red2, { sit: true, pants: C.wood3 });
  p.rect(23, 50, 2, 2, C.white);
  p.rect(30, 50, 2, 2, C.white);
  figure(p, 60, 44, C.blond2, C.slate1, { sit: true, flip: true, pants: C.slate0 });
  p.rect(66, 48, 6, 6, C.mist1);
  p.vline(72, 40, 53, C.wood1);
  // 물통과 수건
  p.rect(76, 62, 10, 8, C.wood2);
  p.hline(76, 85, 62, C.slate1);
  p.hline(76, 85, 67, C.slate1);
  p.ellipse(81, 62, 4, 1, C.sky1);
  p.rect(84, 52, 6, 3, C.white);
  p.vline(89, 55, 58, C.white);
  ambient(p, tod, 0.9);
  // 통로의 빛이 바닥으로 번진다
  p.poly([[ax - ah, 64], [ax + ah, 64], [ax + 36, 90], [ax - 64, 90]], (x, y) => nearest(mix(p.get(x, y), outC, 0.3 - ((y - 64) / 26) * 0.18 + ((bayer(x, y) - 7.5) / 16) * 0.1)));
  light(p, ax, 44, 34, outC, 0.35);
  // 횃불
  for (const tx of [84, 100]) {
    light(p, tx + 1, 22, 26, C.ember, night ? 0.4 : 0.25);
    warm(p, tx + 1, 22, 14, 0.4);
    p.ellipse(tx + 1, 22, 1.8, 3, (_x, y) => (y < 21 ? C.gold0 : C.gold1));
    p.set(tx + 1, 18, C.ember);
  }
};

const sword_club: SceneFn = (p, tod) => {
  const night = tod === 'night';
  // 위 회벽, 아래 나무 판벽
  p.rect(0, 0, W, 36, C.mist2);
  for (let y = 0; y < 36; y++) for (let x = 0; x < W; x++) if (bayer(x, y) < 2) p.set(x, y, RAMP.cream[1]);
  for (let y = 36; y < 58; y++) for (let x = 0; x < W; x++) p.set(x, y, x % 6 === 0 ? C.wood3 : bayer(x, y) < 3 ? C.wood1 : C.wood2);
  p.rect(0, 34, W, 3, C.wood3);
  p.hline(0, W - 1, 34, C.wood1);
  for (let x = 0; x < W; x += 40) p.rect(x, 0, 4, 58, C.wood3);
  // 높은 창 (위)
  for (const wx of [8, 46, 102, 140]) {
    win(p, wx, 4, 14, 12, tod, 2, 1, OLD_WOOD, () => {
      if (night && wx === 102) moon(p, wx + 8, 8, 2);
    });
  }
  // 동아리 깃발 (가운데 위)
  p.rect(60, 2, 40, 2, C.wood3);
  p.set(59, 2, C.gold1);
  p.set(100, 2, C.gold1);
  p.rect(62, 4, 36, 26, C.blue3);
  p.poly([[62, 30], [98, 30], [80, 36]], C.blue3);
  p.rect(64, 6, 32, 22, C.blue2);
  p.vline(62, 4, 29, C.blue2);
  for (const [x0, y0, x1, y1] of [[68, 26, 92, 8], [92, 26, 68, 8]] as [number, number, number, number][]) {
    p.line(x0, y0, x1, y1, C.white);
    p.line(x0 + 1, y0, x1 + 1, y1, C.mist1);
  }
  for (const [x, y] of [[71, 22], [89, 22]]) {
    p.line(x - 2, y - 2, x + 2, y + 2, C.gold1);
    p.line(x + 2, y - 2, x - 2, y + 2, C.gold1);
  }
  p.ellipse(80, 17, 4, 4, C.gold1);
  p.ellipse(80, 17, 2.4, 2.4, C.red2);
  for (const x of [66, 94]) {
    p.vline(x, 30, 38, C.gold2);
    p.set(x, 39, C.gold1);
  }
  // 목검 걸이 (오른쪽 벽)
  p.rect(104, 22, 52, 3, C.wood3);
  p.hline(104, 155, 22, C.wood1);
  p.rect(104, 50, 52, 3, C.wood3);
  p.hline(104, 155, 50, C.wood1);
  for (let k = 0; k < 9; k++) {
    const x = 108 + k * 5.5;
    p.vline(x, 16, 49, C.wood0);
    p.vline(x + 1, 16, 49, C.wood1);
    p.hline(x - 1, x + 2, 40, C.ink);
    p.rect(x, 41, 2, 8, C.wood3);
  }
  // 이름패 (왼쪽 벽)
  p.rect(8, 22, 46, 2, C.wood3);
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < 8; k++) {
      const x = 10 + k * 5.5;
      const y = 25 + row * 12;
      p.rect(x, y, 4, 10, C.wood0);
      p.vline(x + 3, y, y + 9, C.wood1);
      for (let j = y + 2; j < y + 8; j += 2) p.set(x + 1 + ((k + j) % 2), j, C.ink);
    }
  }
  // 바닥: 반짝이는 나무 마루
  for (let y = 58; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (x - 80) / (0.3 + (y - 58) / 20);
      const plank = Math.floor(k / 12);
      let c: number = Math.abs(k % 12) < 0.7 ? C.wood3 : plank % 2 ? C.wood1 : nearest(mix(C.wood1, C.wood2, 0.4));
      // 창 반사
      for (const wx of [15, 53, 109, 147]) {
        const rx = 80 + (wx - 80) * (1 + (y - 58) / 30);
        if (Math.abs(x - rx) < 2 + (y - 58) / 10 && y < 76 && bayer(x, y) < 8 - (y - 58) / 3) c = C.wood0;
      }
      p.set(x, y, c);
    }
  }
  p.hline(0, W - 1, 58, C.wood4);
  // 대련하는 두 학생 (왼쪽)
  figure(p, 14, 46, C.ink, C.white, { pants: C.blue3 });
  figure(p, 36, 46, C.blond1, C.white, { flip: true, pants: C.blue3 });
  p.line(21, 51, 30, 42, C.wood0);
  p.line(36, 51, 28, 42, C.wood1);
  p.set(29, 42, C.white);
  // 앉아서 지켜보는 학생 (오른쪽)
  figure(p, 132, 54, C.red2, C.white, { sit: true, flip: true, pants: C.blue3 });
  ambient(p, tod, 0.9);
  if (!night) {
    for (const wx of [8, 46, 102, 140]) sunbeam(p, [[wx, 18], [wx + 14, 18], [wx + 30 - (wx - 80) * 0.2, 70], [wx + 8 - (wx - 80) * 0.2, 70]], tod, 0.15);
  } else {
    for (const x of [24, 136]) {
      p.vline(x + 2, 0, 20, C.slate0);
      warm(p, x + 2, 24, 30, 0.5);
      lanternBody(p, x, 21);
    }
  }
};

const exam_hall: SceneFn = (p, tod) => {
  const vx = 80;
  const vy = 22;
  const F = 66;
  const E = 1.7;
  const HW = 4.2;
  const ZB = 9;
  const P = proj(vx, vy, F);
  const night = tod === 'night';
  p.fill(C.mist1);
  // 옆벽 (원근)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - vx;
      const z = (F * HW) / Math.max(1e-6, Math.abs(dx));
      if (z > ZB) continue;
      const Y = (-(y + 0.5 - vy) * z) / F;
      let c: number = Y < -1.0 ? (Math.floor(z * 2) % 2 ? C.wood2 : C.wood3) : Y < -0.92 ? C.wood1 : dx < 0 ? C.mist2 : C.mist1;
      if (Y > 2.4) c = C.wood3;
      p.set(x, y, c);
    }
  }
  // 옆벽의 창
  for (const side of [-1, 1]) {
    for (const z0 of [3.2, 5.6]) {
      const z1 = z0 + 1.3;
      const quad: [number, number][] = [P(side * HW, -0.6, z0), P(side * HW, -0.6, z1), P(side * HW, 2.0, z1), P(side * HW, 2.0, z0)];
      p.poly(quad, C.wood3);
      within(p, (x, y) => {
        const z = (F * HW) / Math.abs(x + 0.5 - vx);
        const Y = (-(y + 0.5 - vy) * z) / F;
        return z > z0 + 0.12 && z < z1 - 0.12 && Y > -0.48 && Y < 1.88;
      }, () => {
        sky(p, tod, 60, side < 0 ? 0 : 80, 0, 80);
        if (night) stars(p, 4 + z0, 14, 50, side < 0 ? 0 : 80, side < 0 ? 80 : 160);
      });
      const m0 = P(side * HW, 2.0, (z0 + z1) / 2);
      const m1 = P(side * HW, -0.6, (z0 + z1) / 2);
      p.line(m0[0], m0[1], m1[0], m1[1], C.wood3);
      const h0 = P(side * HW, 0.7, z0);
      const h1 = P(side * HW, 0.7, z1);
      p.line(h0[0], h0[1], h1[0], h1[1], C.wood3);
    }
  }
  // 앞벽과 칠판
  const [bx0] = P(-HW, 2.6, ZB);
  const [bx1, by1] = P(HW, -E, ZB);
  p.rect(Math.round(bx0), 0, Math.round(bx1 - bx0), Math.round(by1), C.mist1);
  p.rect(Math.round(bx0), Math.round(by1) - 6, Math.round(bx1 - bx0), 6, C.wood2);
  p.rect(50, 3, 60, 18, C.wood2);
  p.rect(51, 4, 58, 16, C.leaf4);
  p.dither(51, 4, 58, 16, C.teal3, 2);
  const cr = rng(8);
  for (let y = 7; y < 18; y += 3) {
    let x = 54;
    while (x < 104) {
      const w = 2 + Math.floor(cr() * 6);
      p.hline(x, Math.min(105, x + w - 1), y, cr() < 0.15 ? C.gold0 : C.mist1);
      x += w + 2;
    }
  }
  p.rect(50, 20, 60, 1, C.wood3);
  // 벽시계
  p.ellipse(41, 9, 4, 4, C.wood2);
  p.ellipse(41, 9, 3, 3, C.white);
  p.vline(41, 7, 9, C.ink);
  p.hline(41, 42, 9, C.ink);
  // 바닥
  for (let y = Math.round(by1); y < H; y++) {
    const z = (F * E) / (y + 0.5 - vy);
    for (let x = 0; x < W; x++) {
      const X = ((x + 0.5 - vx) * z) / F;
      const u = (X + 10) / 0.45;
      const seam = (u % 1) * ((F * 0.45) / z) < 1;
      p.set(x, y, seam ? C.wood3 : Math.floor(u) % 2 ? C.wood1 : nearest(mix(C.wood1, C.wood2, 0.5)));
    }
  }
  // 교탁과 감독관
  figure(p, 77, 18, C.mist1, C.violet3, { pants: C.violet4 });
  p.rect(70, 26, 20, 3, C.wood1);
  p.hline(70, 89, 26, C.wood0);
  p.rect(72, 29, 16, 8, C.wood2);
  p.frame(72, 29, 16, 8, C.wood3);
  // 큰 모래시계 (오른쪽)
  const hx = 120;
  p.rect(hx - 6, 6, 13, 2, C.gold2);
  p.rect(hx - 6, 32, 13, 2, C.gold2);
  p.hline(hx - 6, hx + 6, 6, C.gold1);
  p.vline(hx - 6, 8, 31, C.wood2);
  p.vline(hx + 6, 8, 31, C.wood2);
  for (let y = 8; y < 32; y++) {
    const t = Math.abs(y - 20) / 12;
    const hw = 0.6 + t * 4.2;
    for (let x = Math.round(hx - hw); x <= Math.round(hx + hw); x++) {
      let c: number = x === Math.round(hx - hw) ? C.white : C.sky0;
      if (y > 26 || (y < 20 && y > 14 && Math.abs(x - hx) < hw - 0.5)) c = C.gold1;
      p.set(x, y, c);
    }
  }
  p.vline(hx, 20, 26, C.gold1);
  p.rect(hx - 3, 34, 7, 8, C.wood3);
  p.rect(hx - 5, 42, 11, 2, C.wood2);
  // 책상과 수험생 (먼 줄부터)
  const hr = rng(19);
  for (const z of [7.6, 6.2, 5.0, 4.0, 3.2, 2.55]) {
    for (const X of [-3.1, -1.75, 1.75, 3.1]) {
      const dz = 0.42;
      const top: [number, number][] = [P(X - 0.5, -E + 0.75, z + dz + 0.3), P(X + 0.5, -E + 0.75, z + dz + 0.3), P(X + 0.5, -E + 0.75, z + dz), P(X - 0.5, -E + 0.75, z + dz)];
      const front: [number, number][] = [P(X - 0.5, -E + 0.75, z + dz), P(X + 0.5, -E + 0.75, z + dz), P(X + 0.5, -E + 0.1, z + dz), P(X - 0.5, -E + 0.1, z + dz)];
      p.poly(front, C.wood2);
      p.poly(top, C.wood1);
      const [px, py] = P(X - 0.1, -E + 0.75, z + dz + 0.15);
      const s = 1.2 / z;
      p.rect(Math.round(px), Math.round(py) - 1, Math.max(2, Math.round(10 * s)), Math.max(1, Math.round(3 * s)), C.white);
      const [hx2, hy] = P(X + (hr() - 0.5) * 0.2, -E + 1.25, z);
      backHead(p, hx2, hy - 1, HAIRS[Math.floor(hr() * HAIRS.length)], RAMP.uniform[1], 3.4 / z);
    }
  }
  // 앞쪽 책상 가장자리 (내 자리)
  p.rect(0, 82, W, 8, C.wood1);
  p.hline(0, W - 1, 82, C.wood0);
  p.hline(0, W - 1, 83, C.wood0);
  for (let x = 0; x < W; x += 2) if (bayer(x, 86) < 4) p.set(x, 86, C.wood2);
  p.poly([[18, 90], [26, 83], [52, 84], [48, 90]], C.white);
  for (let k = 0; k < 3; k++) p.line(27 + k, 85 + k * 2, 47 + k, 86 + k * 2, C.mist0);
  p.rect(128, 80, 6, 4, C.ink);
  p.hline(128, 133, 80, C.slate1);
  p.line(132, 80, 138, 72, C.white);
  p.line(133, 79, 139, 71, C.mist1);
  ambient(p, tod, 0.85);
  if (night || tod === 'dusk') {
    for (const lx of [36, 124]) {
      p.vline(lx + 2, 0, 3, C.slate0);
      warm(p, lx + 2, 8, night ? 40 : 26, night ? 0.5 : 0.3);
      lanternBody(p, lx, 4);
    }
  }
  light(p, hx, 28, 6, C.gold1, 0.3);
};

const kitchen: SceneFn = (p, tod) => {
  const night = tod === 'night';
  // 벽: 흰 타일 위, 벽돌 아래
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < W; x++) {
      let c: number = C.mist2;
      if (y > 30 && y < 46) c = x % 5 === 0 || y % 4 === 0 ? C.mist0 : (Math.floor(x / 5) + Math.floor(y / 4)) % 2 ? C.white : C.mist2;
      else if (bayer(x, y) < 2) c = RAMP.cream[1];
      p.set(x, y, c);
    }
  }
  // 창 (오른쪽 위)
  win(p, 130, 6, 22, 20, tod, 2, 2, OLD_WOOD, () => {
    roundTree(p, 136, 28, 5, RAMP.greenCloth);
    if (night) moon(p, 146, 10, 2);
  });
  // 큰 화덕 (왼쪽)
  p.poly([[0, 0], [56, 0], [52, 14], [4, 14]], C.mist0);
  bricks(p, 2, 14, 52, 50, BRICK, 8, 4);
  p.rect(0, 12, 56, 3, C.wood2);
  p.hline(0, 55, 12, C.wood1);
  p.rect(10, 32, 36, 30, C.ink);
  p.ellipse(28, 32, 18, 9, C.ink);
  p.rect(8, 60, 40, 4, C.slate1);
  p.vline(28, 24, 36, C.slate1);
  p.ellipse(28, 44, 9, 7, (x, y) => (x < 24 && y < 44 ? C.slate1 : C.slate0));
  p.ellipse(28, 38, 9, 2, C.slate1);
  p.ellipse(28, 38, 7, 1.2, C.wood2);
  // 걸린 냄비 걸이 (위 가운데)
  p.rect(60, 4, 66, 2, C.slate0);
  for (const x of [62, 124]) p.vline(x, 0, 4, C.slate0);
  const COPPER: Ramp = [RAMP.orange[0], RAMP.orange[1], RAMP.orange[2], RAMP.orange[3]];
  const pots: [number, number, number, number][] = [[64, 8, 9, 6], [78, 8, 7, 5], [90, 8, 11, 7], [106, 8, 8, 5], [118, 8, 6, 4]];
  for (const [x, y, w, h] of pots) hangingPot(p, x, y, w, h, COPPER);
  for (const x of [75, 87, 103, 115]) {
    p.vline(x, 6, 16, C.slate1);
    p.ellipse(x, 18, 1.6, 1.4, C.slate2);
  }
  p.ellipse(126, 20, 3, 3, C.slate1);
  p.vline(126, 6, 17, C.slate1);
  // 약초와 마늘 (선반)
  p.rect(58, 28, 64, 2, C.wood2);
  p.hline(58, 121, 30, C.wood4);
  herbs(p, 66, 30, RAMP.greenCloth);
  herbs(p, 74, 30, RAMP.sage);
  for (let k = 0; k < 4; k++) p.ellipse(84 + k * 2, 32 + k * 2, 1.6, 1.4, C.mist2);
  for (const [x, c] of [[96, C.gold3], [104, C.leaf3], [112, C.red2]] as [number, number][]) {
    p.rect(x, 21, 5, 7, c);
    p.rect(x + 1, 20, 3, 1, C.wood1);
    p.hline(x, x + 4, 23, C.white);
  }
  // 조리대
  p.rect(56, 46, 104, 3, C.wood1);
  p.hline(56, 159, 46, C.wood0);
  p.rect(58, 49, 102, 15, C.wood2);
  for (let x = 60; x < 160; x += 20) {
    p.frame(x, 51, 18, 11, C.wood3);
    p.rect(x + 7, 55, 4, 1, C.gold2);
  }
  // 채소: 양배추, 당근, 양파 바구니, 도마
  p.ellipse(64, 42, 5, 4, (x, y) => (x < 63 && y < 42 ? C.leaf0 : C.leaf1));
  p.ellipse(64, 42, 2, 2, C.leaf0);
  p.vline(64, 39, 45, C.leaf2);
  for (let k = 0; k < 4; k++) {
    p.line(72 + k * 2, 45, 76 + k * 2, 40, C.ember);
    p.set(77 + k * 2, 39, C.leaf1);
  }
  p.rect(84, 42, 16, 4, C.wood0);
  p.hline(84, 99, 42, C.wood0);
  p.hline(84, 99, 45, C.wood2);
  p.line(88, 43, 96, 43, C.mist1);
  p.rect(85, 43, 3, 1, C.wood3);
  p.ellipse(110, 43, 7, 3, C.blond2);
  for (let k = 0; k < 4; k++) p.ellipse(106 + k * 3, 41 - (k % 2), 1.8, 1.6, k % 2 ? C.blond1 : RAMP.cream[1]);
  // 도로시의 실험 냄비 (오른쪽 끝)
  p.rect(132, 36, 22, 10, C.slate0);
  p.rect(134, 39, 6, 4, C.ink);
  p.hline(132, 153, 36, C.slate1);
  p.ellipse(143, 31, 10, 6, (x, y) => (x < 139 && y < 31 ? C.slate1 : C.slate0));
  p.ellipse(143, 26, 10, 2.4, C.slate1);
  p.ellipse(143, 26, 8.4, 1.6, C.violet1);
  p.rect(150, 30, 6, 7, C.white);
  p.line(151, 32, 154, 32, C.red1);
  p.line(151, 34, 153, 34, C.slate1);
  // 바닥 타일
  tileFloor(p, 64, 80, 30, 70, 1.4, 0.75, (i, j) => ((i + j) % 2 ? C.wood1 : nearest(mix(C.wood1, C.wood2, 0.5))), C.wood3);
  p.hline(0, W - 1, 64, C.wood3);
  // 요리사
  figure(p, 48, 48, C.wood2, C.white, { pants: C.slate1 });
  p.rect(48, 47, 7, 2, C.white);
  p.rect(49, 45, 5, 2, C.white);
  ambient(p, tod, 0.85);
  // 화덕 불
  light(p, 28, 54, 44, C.ember, night ? 0.45 : 0.3, 0.8);
  fire(p, 28, 60, 30, 9, 5);
  steam(p, 2, 28, 36, 16, 6);
  // 실험 냄비: 보랏빛
  light(p, 143, 24, 22, C.violet1, 0.45);
  for (const [x, y] of [[138, 25], [144, 24], [148, 26], [141, 26]] as [number, number][]) {
    p.ellipse(x, y, 1.4, 1.2, C.leaf1);
    p.set(x, y - 1, C.leaf0);
  }
  const sr = rng(13);
  for (let k = 0; k < 3; k++) {
    const ph = sr() * 6;
    for (let y = 22; y > 4; y--) {
      const t = (22 - y) / 18;
      const x = 141 + k * 3 + Math.sin(y * 0.45 + ph) * (2 + t * 3);
      if (bayer(Math.round(x), y) < (1 - t) * 20) p.set(x, y, k % 2 ? C.pink1 : C.violet0);
    }
  }
  sparkle(p, 136, 14, C.white, C.violet1);
  sparkle(p, 151, 10, C.white, C.pink1);
  if (night || tod === 'dusk') {
    p.vline(94, 6, 9, C.slate0);
    warm(p, 94, 12, night ? 40 : 26, night ? 0.45 : 0.3);
  }
};

// ---------------------------------------------------------------- 등록

export const EXTRA_SCENES: Record<string, SceneFn> = {
  lake,
  back_hill,
  village,
  forest,
  carriage_road,
  city_gate,
  forge,
  dorm_hall,
  laundry,
  cellar,
  clock_tower,
  mage_tower,
  alchemy_lab,
  garden_path,
  rain_courtyard,
  tavern,
  church_kitchen,
  manor,
  waiting_room,
  sword_club,
  exam_hall,
  kitchen,
};
