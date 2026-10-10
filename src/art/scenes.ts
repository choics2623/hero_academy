// 160×90 도트 삽화. 장면마다 함수 하나: 공통 부품(하늘, 능선, 성, 나무, 방, 창, 책장, 촛불…)을 조립한다.
// 시간대(tod)에 따라 하늘이 바뀌고, ambient()가 전체 색조를 입힌 뒤 불빛을 마지막에 그린다.

import { C, RAMP, nearest, type Ramp } from './palette';
import { Pix, bayer, mix, rng } from './pixel';

export const W = 160;
export const H = 90;
export type Tod = 'dawn' | 'day' | 'dusk' | 'night';

/** 슬롯 이름 → 시간대 */
export function todOf(slot: string): Tod {
  return slot === '밤' ? 'night' : slot === '방과후' ? 'dusk' : slot === '오전' ? 'dawn' : 'day';
}

// ---------------------------------------------------------------- 하늘과 바깥

export const SKY: Record<Tod, number[]> = {
  dawn: [C.violet3, C.pink2, C.pink1, C.gold0],
  day: [C.blue1, C.sky1, C.sky0],
  dusk: [C.violet4, C.red2, C.ember, C.gold1],
  night: [C.night0, C.night1, C.slate0],
};

export function sky(p: Pix, tod: Tod, h = H, x = 0, y = 0, w = W) {
  p.gradV(x, y, w, h, SKY[tod]);
}

export function stars(p: Pix, seed: number, n: number, yMax: number, x0 = 0, x1 = W) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(x0 + r() * (x1 - x0));
    const y = Math.floor(r() * yMax);
    const big = r() < 0.08;
    p.set(x, y, r() < 0.3 ? C.white : r() < 0.5 ? C.mist1 : C.mist0);
    if (big) {
      p.set(x - 1, y, C.mist0);
      p.set(x + 1, y, C.mist0);
      p.set(x, y - 1, C.mist0);
      p.set(x, y + 1, C.mist0);
    }
  }
}

export function moon(p: Pix, x: number, y: number, r = 6) {
  p.glow(x, y, r * 2.4, C.slate1, 7);
  p.ellipse(x, y, r, r, (px, py) => (px + py > x + y + r * 0.6 ? C.mist1 : C.gold0));
  p.set(x - 2, y + 1, C.blond1);
  p.set(x + 1, y - 2, C.blond1);
  p.set(x + 2, y + 2, C.mist0);
}

export function sun(p: Pix, x: number, y: number, r: number, tod: Tod) {
  const c = tod === 'day' ? C.gold0 : C.gold1;
  p.glow(x, y, r * 2.6, tod === 'day' ? C.sky0 : C.gold1, 8);
  p.ellipse(x, y, r, r, c);
}

export function clouds(p: Pix, seed: number, tod: Tod, yMax: number, n = 5) {
  const r = rng(seed);
  const hi = tod === 'night' ? C.slate1 : tod === 'dusk' ? C.pink1 : tod === 'dawn' ? C.pink0 : C.white;
  const lo = tod === 'night' ? C.slate0 : tod === 'dusk' ? C.red1 : tod === 'dawn' ? C.pink1 : C.mist2;
  for (let i = 0; i < n; i++) {
    const cx = r() * W;
    const cy = 6 + r() * (yMax - 10);
    const w = 10 + r() * 18;
    for (let k = 0; k < 4; k++) {
      const ex = cx + (k - 1.5) * w * 0.35;
      const ey = cy - (k === 1 || k === 2 ? 2 : 0);
      p.ellipse(ex, ey, w * 0.32, 3 + (k === 1 || k === 2 ? 1.5 : 0), (_x, y) => (y > cy ? lo : hi));
    }
  }
}

/** 부드러운 1차원 잡음 (0~1) */
export function noise1(seed: number, scale: number): (x: number) => number {
  const r = rng(seed);
  const pts = Array.from({ length: 64 }, () => r());
  return (x: number) => {
    const t = x / scale;
    const i = Math.floor(t);
    const f = t - i;
    const a = pts[((i % 64) + 64) % 64];
    const b = pts[(((i + 1) % 64) + 64) % 64];
    const s = f * f * (3 - 2 * f);
    return a * (1 - s) + b * s;
  };
}

/** 능선: baseY 위로 amp만큼 출렁이는 언덕/산을 bottom까지 채운다 */
export function ridge(p: Pix, seed: number, baseY: number, amp: number, fill: number | ((x: number, y: number, top: number) => number), scale = 18, bottom = H) {
  const n1 = noise1(seed, scale);
  const n2 = noise1(seed + 7, scale / 3);
  for (let x = 0; x < W; x++) {
    const top = Math.round(baseY - (n1(x) * 0.75 + n2(x) * 0.25) * amp);
    for (let y = top; y < bottom; y++) p.set(x, y, typeof fill === 'function' ? fill(x, y, top) : fill);
  }
}

export function pine(p: Pix, x: number, y: number, h: number, ramp: Ramp = RAMP.greenCloth) {
  for (let j = 0; j < h; j++) {
    const half = Math.floor((j / h) * (h * 0.32)) + (j % 3 === 2 ? 1 : 0);
    for (let i = -half; i <= half; i++) p.set(x + i, y - h + j, i > 0 ? ramp[2] : j % 3 === 0 && i < 0 ? ramp[0] : ramp[1]);
  }
  p.vline(x, y, y + 2, C.wood3);
}

export function roundTree(p: Pix, x: number, y: number, r: number, ramp: Ramp = RAMP.greenCloth) {
  p.rect(x - 1, y - r * 0.4, 2, r * 1.4, C.wood2);
  p.ellipse(x, y - r, r, r * 0.85, (px, py) => (px + py < x + y - r * 1.6 ? ramp[0] : px + py > x + y - r * 0.6 ? ramp[2] : bayer(px, py) < 3 ? ramp[0] : ramp[1]));
}

/** 아카데미 성: 가운데 본관과 첨탑들. lit = 창문 불빛 */
export function castle(p: Pix, cx: number, baseY: number, s: number, wall: Ramp, roof: Ramp, lit: boolean, seed = 1) {
  const r = rng(seed);
  const towers = [
    { dx: -26, w: 7, h: 26, roof: 10 },
    { dx: -14, w: 9, h: 34, roof: 13 },
    { dx: 0, w: 12, h: 44, roof: 16 },
    { dx: 15, w: 9, h: 30, roof: 12 },
    { dx: 27, w: 7, h: 22, roof: 9 },
  ];
  // 성벽
  const wallH = Math.round(14 * s);
  p.rect(cx - 32 * s, baseY - wallH, 64 * s, wallH, wall[2]);
  for (let x = Math.round(cx - 32 * s); x < cx + 32 * s; x += 3) p.rect(x, baseY - wallH - 2, 2, 2, wall[2]);
  for (const t of towers) {
    const w = Math.round(t.w * s);
    const h = Math.round(t.h * s);
    const x0 = Math.round(cx + t.dx * s - w / 2);
    for (let y = baseY - h; y < baseY; y++) for (let x = x0; x < x0 + w; x++) p.set(x, y, x < x0 + w / 3 ? wall[0] : x >= x0 + w - 2 ? wall[2] : wall[1]);
    const rh = Math.round(t.roof * s);
    p.poly(
      [
        [x0 - 1, baseY - h],
        [x0 + w / 2, baseY - h - rh],
        [x0 + w + 1, baseY - h],
      ],
      (x) => (x < x0 + w / 2 ? roof[1] : roof[2]),
    );
    p.set(Math.round(x0 + w / 2 - 0.5), baseY - h - rh - 1, C.gold1);
    // 창
    for (let y = baseY - h + 4; y < baseY - 4; y += Math.max(4, Math.round(6 * s))) {
      for (let x = x0 + 2; x < x0 + w - 2; x += 3) {
        const on = lit && r() < 0.55;
        p.rect(x, y, 1, 2, on ? (r() < 0.5 ? C.gold1 : C.gold2) : wall[3]);
      }
    }
  }
  // 정문
  const gw = Math.round(8 * s);
  p.rect(cx - gw / 2, baseY - Math.round(9 * s), gw, Math.round(9 * s), wall[3]);
  p.ellipse(cx, baseY - Math.round(9 * s), gw / 2, gw / 2.5, wall[3]);
  if (lit) p.rect(cx - gw / 2 + 1, baseY - Math.round(6 * s), gw - 2, Math.round(6 * s), C.gold2);
}

/** 작은 사람 (약 7×14). hair/cloth는 색 */
export function figure(p: Pix, x: number, y: number, hair: number, cloth: number, opts: { flip?: boolean; skin?: number; sit?: boolean; pants?: number } = {}) {
  const sk = opts.skin ?? C.skin1;
  const pants = opts.pants ?? C.slate0;
  const f = (dx: number) => (opts.flip ? x + 6 - dx : x + dx);
  // 머리
  for (const [dx, dy, c] of [
    [2, 0, hair], [3, 0, hair], [4, 0, hair], [1, 1, hair], [2, 1, hair], [3, 1, hair], [4, 1, hair], [5, 1, hair],
    [1, 2, hair], [2, 2, sk], [3, 2, sk], [4, 2, sk], [5, 2, hair], [2, 3, sk], [3, 3, sk], [4, 3, sk],
  ] as [number, number, number][]) p.set(f(dx), y + dy, c);
  // 몸
  for (let dy = 4; dy <= 8; dy++) for (let dx = 1; dx <= 5; dx++) p.set(f(dx), y + dy, dx === 5 ? mix(cloth, C.ink, 0.35) : cloth);
  p.set(f(0), y + 5, cloth);
  p.set(f(6), y + 5, mix(cloth, C.ink, 0.35));
  p.set(f(0), y + 6, sk);
  p.set(f(6), y + 6, sk);
  if (opts.sit) {
    p.rect(Math.min(f(1), f(5)), y + 9, 5, 2, pants);
    return;
  }
  for (let dy = 9; dy <= 12; dy++) {
    p.set(f(2), y + dy, pants);
    p.set(f(4), y + dy, pants);
  }
  p.set(f(2), y + 13, C.ink);
  p.set(f(4), y + 13, C.ink);
}

// ---------------------------------------------------------------- 실내

/** 벽: 패널 무늬 */
export function wall(p: Pix, y0: number, y1: number, ramp: Ramp, panel = 20) {
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      let c = ramp[1];
      if (x % panel === 0) c = ramp[2];
      else if (x % panel === 1) c = ramp[0];
      if (y === y1 - 3 || y === y1 - 2) c = ramp[2];
      if (y === y1 - 1) c = ramp[3];
      p.set(x, y, c);
    }
  }
}

export function bricks(p: Pix, x0: number, y0: number, w: number, h: number, ramp: Ramp, bw = 8, bh = 4) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const row = Math.floor((y - y0) / bh);
      const off = row % 2 ? bw / 2 : 0;
      const edge = (y - y0) % bh === 0 || (x - x0 + off) % bw === 0;
      p.set(x, y, edge ? ramp[2] : bayer(x, y) < 2 ? ramp[0] : ramp[1]);
    }
  }
}

/** 원근 있는 나무 바닥 */
export function floor(p: Pix, y0: number, ramp: Ramp, vx = W / 2) {
  for (let y = y0; y < H; y++) {
    const t = (y - y0) / (H - y0);
    for (let x = 0; x < W; x++) {
      const k = (x - vx) / (0.25 + t);
      const plank = Math.floor(k / 14);
      let c = plank % 2 ? ramp[1] : mix(ramp[1], ramp[0], 0.25);
      if (Math.abs(k % 14) < 0.9 / (0.25 + t)) c = ramp[2];
      p.set(x, y, nearest(c));
    }
  }
  p.hline(0, W - 1, y0, ramp[3]);
}

export function window_(p: Pix, x: number, y: number, w: number, h: number, tod: Tod, frame: Ramp = RAMP.brownCloth, arch = false) {
  p.rect(x - 2, y - 2, w + 4, h + 4, frame[2]);
  sky(p, tod, h, x, y, w);
  if (tod === 'night') {
    for (let i = 0, r = rng(x * 7 + y); i < (w * h) / 30; i++) p.set(x + Math.floor(r() * w), y + Math.floor(r() * h), r() < 0.4 ? C.white : C.mist0);
  }
  if (arch) {
    for (let j = 0; j < w / 2; j++) {
      const d = Math.sqrt(Math.max(0, (w / 2) ** 2 - (w / 2 - j) ** 2));
      const cut = Math.round(w / 2 - d);
      for (let i = 0; i < cut; i++) {
        p.set(x + i, y + j - w / 2 + cut, frame[2]);
      }
    }
  }
  p.vline(x + Math.floor(w / 2), y, y + h - 1, frame[1]);
  p.hline(x, x + w - 1, y + Math.floor(h / 2), frame[1]);
  p.hline(x - 2, x + w + 1, y + h + 1, frame[0]);
}

export function shelf(p: Pix, x: number, y: number, w: number, h: number, seed: number, wood: Ramp = RAMP.brownCloth) {
  const r = rng(seed);
  p.rect(x, y, w, h, wood[3]);
  p.vline(x, y, y + h - 1, wood[1]);
  p.vline(x + w - 1, y, y + h - 1, wood[2]);
  const spines = [C.red1, C.red2, C.blue1, C.blue2, C.leaf2, C.leaf3, C.gold2, C.violet2, C.wood1, C.mist1, C.teal2];
  for (let sy = y + 2; sy + 8 <= y + h; sy += 10) {
    p.hline(x, x + w - 1, sy + 8, wood[1]);
    p.hline(x, x + w - 1, sy + 9, wood[2]);
    let sx = x + 2;
    while (sx < x + w - 3) {
      const bw = r() < 0.7 ? 2 : 3;
      const bh = 5 + Math.floor(r() * 3);
      if (r() < 0.1) {
        sx += 2;
        continue;
      }
      const c = spines[Math.floor(r() * spines.length)];
      p.rect(sx, sy + 8 - bh, bw, bh, c);
      p.set(sx, sy + 8 - bh + 1, mix(c, C.white, 0.4));
      sx += bw;
    }
  }
}

export function candle(p: Pix, x: number, y: number) {
  p.rect(x, y, 2, 4, C.white);
  p.set(x + 1, y + 3, C.mist1);
  p.set(x, y - 1, C.gold1);
  p.set(x, y - 2, C.gold0);
  p.set(x + 1, y - 1, C.ember);
}

export function candleGlow(p: Pix, x: number, y: number, r = 14) {
  p.glow(x + 0.5, y - 1, r, C.gold3, 6);
  p.glow(x + 0.5, y - 1, r * 0.55, C.gold2, 7);
  candle(p, x, y);
}

export function torch(p: Pix, x: number, y: number, lit = true) {
  p.rect(x, y, 2, 6, C.wood2);
  p.rect(x - 1, y - 1, 4, 2, C.slate1);
  if (lit) {
    p.glow(x + 1, y - 3, 16, C.ember2, 6);
    p.glow(x + 1, y - 3, 8, C.gold3, 8);
    p.ellipse(x + 1, y - 3, 2, 3, (_px, py) => (py < y - 4 ? C.gold0 : C.gold1));
    p.set(x + 1, y - 6, C.ember);
  }
}

export function table(p: Pix, x: number, y: number, w: number, wood: Ramp = RAMP.brownCloth) {
  p.rect(x, y, w, 3, wood[1]);
  p.hline(x, x + w - 1, y, wood[0]);
  p.hline(x, x + w - 1, y + 3, wood[2]);
  p.rect(x + 2, y + 4, 2, 9, wood[2]);
  p.rect(x + w - 4, y + 4, 2, 9, wood[2]);
}

// ---------------------------------------------------------------- 색조

/** 시간대 색조. 불빛은 이 뒤에 그린다 */
export function ambient(p: Pix, tod: Tod, strength = 1) {
  if (tod === 'day') return;
  const target = tod === 'night' ? 0x141a3a : tod === 'dusk' ? 0xff8a4a : 0xffb6c8;
  const amt = (tod === 'night' ? 0.55 : tod === 'dusk' ? 0.2 : 0.14) * strength;
  p.map((c) => {
    let m = mix(c, target, amt);
    if (tod === 'dusk') m = mix(m, 0x2a1830, 0.12 * strength);
    return nearest(m);
  });
}

// ---------------------------------------------------------------- 장면

export type SceneFn = (p: Pix, tod: Tod) => void;

const title: SceneFn = (p) => {
  sky(p, 'night');
  stars(p, 11, 90, 60);
  // 하늘의 균열
  const crack: [number, number][] = [[18, 6], [36, 14], [52, 10], [70, 22], [86, 16], [104, 26], [122, 18], [142, 24]];
  for (let i = 0; i + 1 < crack.length; i++) {
    const [ax, ay] = crack[i];
    const [bx, by] = crack[i + 1];
    p.glow((ax + bx) / 2, (ay + by) / 2, 14, C.red3, 7);
  }
  for (let i = 0; i + 1 < crack.length; i++) {
    const [ax, ay] = crack[i];
    const [bx, by] = crack[i + 1];
    p.line(ax, ay, bx, by, C.red1);
    p.line(ax, ay + 1, bx, by + 1, C.red2);
    if (i % 2) p.line(bx, by, bx + 4, by - 6, C.red1);
  }
  for (const [x, y] of crack) p.set(x, y, C.pink0);
  moon(p, 132, 44, 5);
  ridge(p, 3, 66, 14, C.slate0, 22);
  ridge(p, 5, 72, 10, C.night1, 14);
  // 언덕 위 아카데미
  ridge(p, 9, 84, 8, (x, y, top) => (y === top ? C.slate1 : C.night0), 30);
  castle(p, 80, 72, 1, [C.slate1, C.slate0, C.night1, C.ink], [C.violet3, C.violet3, C.violet4, C.ink], true, 4);
  // 날리는 불씨
  const r = rng(21);
  for (let i = 0; i < 14; i++) p.set(Math.floor(r() * W), 40 + Math.floor(r() * 45), r() < 0.5 ? C.red1 : C.ember);
};

const campus: SceneFn = (p, tod) => {
  sky(p, tod, 58);
  if (tod === 'night') stars(p, 2, 50, 40);
  clouds(p, 4, tod, 30, 4);
  if (tod === 'night') moon(p, 130, 14, 5);
  ridge(p, 8, 52, 8, RAMP.greenCloth[3], 30);
  castle(p, 80, 56, 0.9, [C.mist2, C.mist1, C.mist0, C.slate1], [C.blue1, C.blue1, C.blue2, C.blue3], tod === 'night', 7);
  // 잔디와 길
  p.gradV(0, 56, W, 34, [C.leaf2, C.leaf3]);
  p.poly([[70, 56], [90, 56], [118, 90], [42, 90]], (x, y) => (bayer(x, y) < 3 ? C.wood0 : C.blond2));
  // 분수
  p.ellipse(80, 72, 16, 5, C.mist1);
  p.ellipse(80, 71, 14, 3.6, C.sky1);
  p.ellipse(80, 70.5, 10, 2.4, C.sky0);
  p.rect(78, 60, 4, 10, C.mist1);
  p.rect(76, 59, 8, 2, C.mist2);
  for (const dx of [-5, -3, 3, 5]) p.line(80, 58, 80 + dx * 1.6, 66, C.sky0);
  // 나무
  for (const x of [10, 26, 134, 150]) roundTree(p, x, 66, 9);
  for (const x of [40, 120]) roundTree(p, x, 60, 6);
  figure(p, 52, 72, C.wood2, C.blue2);
  figure(p, 101, 68, C.gold2, C.blue2, { flip: true });
  figure(p, 110, 74, C.red2, C.blue2, { flip: true });
  ambient(p, tod);
  if (tod === 'night') {
    for (const x of [62, 98]) {
      p.vline(x, 60, 70, C.slate1);
      p.glow(x, 59, 10, C.gold3, 6);
      p.set(x, 59, C.gold0);
    }
  }
};

const training_ground: SceneFn = (p, tod) => {
  sky(p, tod, 52);
  if (tod === 'night') {
    stars(p, 6, 50, 36);
    moon(p, 28, 14, 5);
  } else if (tod === 'dusk') sun(p, 128, 40, 9, tod);
  clouds(p, 9, tod, 26, 3);
  castle(p, 130, 44, 0.55, [C.mist1, C.mist0, C.slate2, C.slate1], [C.blue2, C.blue2, C.blue3, C.ink], tod === 'night', 3);
  // 담장
  for (let x = 0; x < W; x += 6) {
    p.rect(x, 36, 4, 14, C.wood2);
    p.set(x, 36, C.wood1);
    p.set(x + 1, 35, C.wood1);
  }
  p.hline(0, W - 1, 40, C.wood3);
  p.hline(0, W - 1, 46, C.wood3);
  // 흙바닥
  p.gradV(0, 50, W, 40, [C.wood1, C.wood2]);
  const r = rng(13);
  for (let i = 0; i < 90; i++) p.set(Math.floor(r() * W), 52 + Math.floor(r() * 38), r() < 0.5 ? C.wood0 : C.wood3);
  // 허수아비
  for (const [x, s] of [[30, 1], [62, 0.85], [92, 0.75]] as [number, number][]) {
    const h = Math.round(34 * s);
    const base = 76 - (1 - s) * 18;
    p.rect(x, base - h, 3, h, C.wood2);
    p.rect(x - 9 * s, base - h + 10 * s, 21 * s, 3, C.wood2);
    p.ellipse(x + 1.5, base - h + 3, 6 * s, 6 * s, (px, py) => (px > x + 2 ? C.blond2 : C.blond1));
    p.ellipse(x + 1.5, base - h + 16 * s, 7 * s, 8 * s, (px, py) => (px > x + 3 ? C.blond2 : bayer(px, py) < 3 ? C.blond2 : C.blond1));
    p.line(x - 3, base - h + 12 * s, x + 6, base - h + 20 * s, C.wood2);
  }
  // 무기 걸이
  p.rect(116, 52, 30, 3, C.wood2);
  p.rect(118, 52, 2, 24, C.wood3);
  p.rect(142, 52, 2, 24, C.wood3);
  for (let i = 0; i < 5; i++) {
    const x = 122 + i * 5;
    p.vline(x, 44, 70, i % 2 ? C.mist1 : C.wood1);
    p.set(x, 43, i % 2 ? C.white : C.wood0);
    p.hline(x - 1, x + 1, 64, C.gold2);
  }
  figure(p, 72, 66, C.blond1, C.mist2, {});
  ambient(p, tod);
  if (tod === 'night') for (const x of [8, 150]) torch(p, x, 40);
};

const library: SceneFn = (p, tod) => {
  p.fill(RAMP.brownCloth[3]);
  // 높은 서가
  for (let i = 0; i < 6; i++) {
    const x = i * 28 - 4;
    if (i === 2 || i === 3) continue;
    shelf(p, x, 4, 26, 66, 30 + i);
  }
  // 가운데 아치 창
  p.rect(54, 0, 52, 70, RAMP.brownCloth[3]);
  window_(p, 64, 8, 32, 40, tod === 'dusk' ? 'dusk' : tod === 'night' ? 'night' : 'day', RAMP.grayCloth, true);
  if (tod === 'night') moon(p, 88, 18, 3);
  // 사다리
  p.line(118, 6, 126, 70, C.wood1);
  p.line(124, 6, 132, 70, C.wood1);
  for (let y = 10; y < 70; y += 6) p.line(119 + (y - 6) / 8, y, 125 + (y - 6) / 8, y, C.wood2);
  floor(p, 70, RAMP.brownCloth);
  // 책상과 펼친 책
  table(p, 52, 72, 56);
  p.rect(66, 69, 14, 3, C.white);
  p.vline(73, 69, 71, C.mist1);
  p.rect(86, 68, 8, 4, C.red2);
  p.rect(87, 66, 6, 2, C.blue2);
  // 빛줄기 (낮)
  if (tod !== 'night') {
    for (let y = 48; y < 90; y++) {
      for (let x = 60; x < 104; x++) {
        const t = (y - 48) / 42;
        if (x > 64 - t * 10 && x < 96 + t * 6 && bayer(x, y) < 3) p.paint(x, y, C.gold0);
      }
    }
  }
  ambient(p, tod, tod === 'night' ? 1.1 : 0.8);
  if (tod === 'night' || tod === 'dusk') candleGlow(p, 100, 66, 22);
  else candle(p, 100, 66);
  // 먼지
  const r = rng(77);
  for (let i = 0; i < 12; i++) p.set(60 + Math.floor(r() * 40), 20 + Math.floor(r() * 50), C.gold0);
};

const dorm_room: SceneFn = (p, tod) => {
  wall(p, 0, 66, RAMP.brownCloth, 16);
  floor(p, 66, [C.wood1, C.wood2, C.wood3, C.wood4]);
  window_(p, 66, 10, 28, 30, tod);
  if (tod === 'night') moon(p, 86, 18, 4);
  // 커튼
  p.rect(60, 6, 6, 40, C.red2);
  p.rect(94, 6, 6, 40, C.red2);
  p.vline(62, 6, 45, C.red1);
  p.vline(96, 6, 45, C.red1);
  // 2층 침대
  p.rect(6, 22, 4, 62, C.wood2);
  p.rect(50, 22, 4, 62, C.wood2);
  for (const y of [40, 72]) {
    p.rect(8, y, 44, 4, C.wood1);
    p.rect(10, y - 5, 40, 5, C.blue1);
    p.hline(10, 49, y - 5, C.sky1);
    p.rect(10, y - 7, 10, 4, C.white);
  }
  p.line(52, 22, 52, 84, C.wood3);
  for (let y = 46; y < 72; y += 6) p.hline(46, 52, y, C.wood2);
  // 책상과 램프
  table(p, 108, 60, 40);
  p.rect(112, 55, 10, 5, C.mist2);
  p.rect(132, 52, 3, 8, C.gold3);
  p.poly([[128, 52], [139, 52], [136, 46], [131, 46]], C.leaf2);
  // 트렁크
  p.rect(110, 78, 22, 10, C.wood2);
  p.hline(110, 131, 81, C.gold2);
  p.rect(119, 80, 4, 3, C.gold1);
  ambient(p, tod);
  if (tod === 'night') {
    p.glow(133, 54, 24, C.gold3, 6);
    p.glow(133, 54, 10, C.gold2, 8);
    p.set(133, 53, C.gold0);
  }
};

const labyrinth: SceneFn = (p) => {
  p.fill(C.ink);
  const vx = 80;
  const vy = 44;
  // 벽 (원근)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - vx) / 80;
      const dy = (y - vy) / 46;
      const depth = Math.max(Math.abs(dx), Math.abs(dy));
      if (depth < 0.14) continue;
      const isWall = Math.abs(dx) > Math.abs(dy) * 1.1;
      const isFloor = !isWall && dy > 0;
      const z = 1 / depth;
      const u = isWall ? y / (Math.abs(dx) * 2) : x / (Math.abs(dy) * 4);
      const v = z * 6;
      let c: number;
      if (isWall) {
        const brick = (Math.floor(u / 6) + Math.floor(v)) % 2;
        const edge = Math.abs((u % 6) - 3) > 2.6 || Math.abs((v % 1) - 0.5) > 0.45;
        c = edge ? C.slate0 : brick ? C.slate1 : C.slate2;
      } else if (isFloor) {
        c = Math.abs((v % 1) - 0.5) > 0.44 ? C.night1 : (Math.floor(u / 8) + Math.floor(v)) % 2 ? C.slate0 : C.slate1;
      } else c = Math.abs((v % 1) - 0.5) > 0.44 ? C.ink : C.night1;
      // 깊을수록 어둡게
      if (bayer(x, y) < (1 - depth) * 20) c = C.ink;
      p.set(x, y, c);
    }
  }
  // 갈림길 (안쪽 벽의 두 입구)
  p.rect(66, 36, 8, 14, C.ink);
  p.rect(86, 36, 8, 14, C.ink);
  p.rect(74, 34, 12, 18, C.slate0);
  torch(p, 22, 34);
  torch(p, 136, 34);
  torch(p, 58, 40);
  torch(p, 100, 40);
  // 바닥의 문양 (복선)
  p.ellipse(80, 76, 10, 3, (x, y) => (bayer(x, y) < 4 ? C.red3 : C.slate1));
};

const arena: SceneFn = (p, tod) => {
  sky(p, tod, 34);
  clouds(p, 15, tod, 22, 3);
  if (tod === 'night') stars(p, 3, 30, 30);
  // 관중석 (원근 아치)
  const r = rng(5);
  for (let y = 18; y < 58; y++) {
    const t = (y - 18) / 40;
    for (let x = 0; x < W; x++) {
      const row = Math.floor((y - 18) / 4);
      const band = (y - 18) % 4;
      let c: number = band === 3 ? C.slate1 : band === 2 ? C.slate2 : C.mist0;
      // 관중: 머리(위)와 옷(아래) 두 줄, 사람 사이 간격
      const slot = (x + row * 2) % 3;
      if (band < 2 && slot !== 2 && r() < 0.85 - t * 0.2) {
        const seat = Math.floor((x + row * 2) / 3) * 7 + row * 13;
        const crowd = [C.red2, C.blue2, C.gold2, C.leaf2, C.pink2, C.violet2, C.wood2];
        const hair = [C.wood3, C.ink, C.blond2, C.wood2, C.slate0];
        c = band === 0 ? hair[seat % hair.length] : crowd[seat % crowd.length];
      }
      p.set(x, y, c);
    }
  }
  // 기둥과 깃발
  for (let x = 4; x < W; x += 26) {
    p.rect(x, 14, 4, 46, C.mist1);
    p.vline(x + 3, 14, 59, C.mist0);
    p.rect(x - 1, 12, 6, 2, C.mist2);
    p.vline(x + 2, 4, 12, C.wood2);
    p.poly([[x + 3, 4], [x + 12, 6], [x + 3, 9]], (x / 26) % 2 < 1 ? C.red1 : C.blue1);
  }
  p.rect(0, 58, W, 3, C.slate1);
  // 모래 경기장
  p.gradV(0, 61, W, 29, [C.blond1, C.blond2]);
  p.ellipse(80, 76, 60, 11, (x, y) => (bayer(x, y) < 2 ? C.blond2 : C.blond1));
  p.ellipse(80, 76, 60, 11, (x, y, d) => (d > 0.93 ? C.wood1 : -1));
  // 두 사람
  figure(p, 66, 64, C.wood2, C.blue2);
  figure(p, 88, 64, C.blond1, C.mist2, { flip: true });
  p.line(73, 68, 79, 64, C.mist1);
  p.line(87, 68, 82, 63, C.mist1);
  p.set(80, 63, C.white);
  ambient(p, tod, 0.8);
};

const starry_hill: SceneFn = (p) => {
  sky(p, 'night', 70);
  // 은하수 띠
  for (let y = 0; y < 70; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.abs(y - (60 - x * 0.35)) / 14;
      if (d < 1 && bayer(x, y) < (1 - d) * 7) p.set(x, y, d < 0.4 ? C.violet3 : C.slate0);
    }
  }
  stars(p, 99, 160, 70);
  stars(p, 98, 40, 50, 30, 130);
  // 유성
  p.line(40, 10, 54, 16, C.white);
  p.line(36, 8, 40, 10, C.mist0);
  // 멀리 아카데미 불빛
  ridge(p, 4, 66, 6, C.night1, 30);
  castle(p, 128, 66, 0.35, [C.slate1, C.slate0, C.night1, C.ink], [C.night1, C.night1, C.night0, C.ink], true, 9);
  // 언덕
  ridge(p, 12, 84, 20, (x, y, top) => (y === top ? C.leaf3 : bayer(x, y) < 2 ? C.leaf3 : C.leaf4), 60);
  // 앉아 있는 두 사람
  figure(p, 42, 66, C.wood2, C.blue2, { sit: true });
  figure(p, 51, 67, C.blond1, C.leaf2, { sit: true, flip: true });
  // 풀
  const r = rng(8);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(r() * W);
    const y = 78 + Math.floor(r() * 12);
    p.vline(x, y - 2, y, C.leaf2);
  }
  // 반딧불
  for (let i = 0; i < 8; i++) {
    const x = 10 + Math.floor(r() * 140);
    const y = 60 + Math.floor(r() * 26);
    p.glow(x, y, 3, C.leaf1, 8);
    p.set(x, y, C.leaf0);
  }
};

export const CORE_SCENES: Record<string, SceneFn> = {
  title,
  campus,
  training_ground,
  library,
  dorm_room,
  labyrinth,
  arena,
  starry_hill,
};

