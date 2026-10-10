// 이벤트 CG: 배경 삽화 + 인물 흉상 + 효과. art.yaml에 데이터로 적는다.
//   - { id: cg_liana_wish, title: 소원 등, bg: lake, tod: night, cast: [{ who: liana, mood: 웃음, x: 0.62 }], fx: [lanterns] }

import { C, nearest } from './palette';
import { Pix, bayer, hash, mix, rng } from './pixel';
import { drawScene, SCENES } from './scene';
import { H, W, type Tod } from './scenes';

export const FX = [
  'petals', 'rain', 'snow', 'sparkles', 'fireflies', 'lanterns', 'fireworks', 'embers', 'dust', 'rays', 'vignette',
  'red_glow', 'blue_glow', 'gold_glow', 'speedlines', 'bloom', 'shock',
] as const;
export type Fx = (typeof FX)[number];

export interface CgDef {
  id: string;
  bg?: string;
  tod?: string;
  cast?: { who: string; mood?: string; x?: number; flip?: boolean }[];
  fx?: string[];
}

export const isCg = (d: { bg?: string }) => !!d.bg;

const TOD_TINT: Record<Tod, [number, number]> = {
  dawn: [0xffb6c8, 0.1],
  day: [0xffffff, 0],
  dusk: [0xff8a4a, 0.14],
  night: [0x1c2350, 0.32],
};

/** 흉상 하나를 시간대 빛에 맞춰 어둡게/물들인다 */
export function lightBust(p: Pix, tod: Tod): Pix {
  const [t, a] = TOD_TINT[tod];
  if (!a) return p;
  return p.clone().map((c) => nearest(mix(c, t, a)));
}

export function drawCG(def: CgDef, tod: Tod, bustOf: (who: string, mood: string) => Pix | null): Pix {
  const t = (def.tod as Tod) || tod;
  const p = drawScene(def.bg && SCENES[def.bg] ? def.bg : 'campus', t);
  const cast = def.cast ?? [];
  cast.forEach((c, i) => {
    const b = bustOf(c.who, c.mood ?? '');
    if (!b) return;
    const lit = lightBust(b, t);
    const x = c.x ?? (cast.length === 1 ? 0.5 : 0.25 + (0.5 * i) / Math.max(1, cast.length - 1));
    const left = Math.round(x * W - lit.w / 2);
    p.blit(lit, left, H - lit.h, c.flip);
  });
  for (const f of def.fx ?? []) fx(p, f as Fx, hash(def.id + f));
  return p;
}

export function fx(p: Pix, kind: Fx, seed: number) {
  const r = rng(seed);
  const rx = () => Math.floor(r() * W);
  const ry = (max = H) => Math.floor(r() * max);
  switch (kind) {
    case 'petals':
      for (let i = 0; i < 34; i++) {
        const x = rx();
        const y = ry();
        const c = r() < 0.5 ? C.pink0 : C.pink1;
        p.set(x, y, c);
        if (r() < 0.6) p.set(x + 1, y, r() < 0.5 ? C.pink1 : C.pink2);
        if (r() < 0.3) p.set(x, y + 1, C.pink2);
      }
      break;
    case 'rain':
      for (let i = 0; i < 90; i++) {
        const x = rx();
        const y = ry();
        const len = 3 + Math.floor(r() * 4);
        for (let k = 0; k < len; k++) if (bayer(x - k, y + k) < 12) p.set(x - Math.floor(k / 2), y + k, k === len - 1 ? C.sky0 : C.mist1);
      }
      break;
    case 'snow':
      for (let i = 0; i < 70; i++) {
        const x = rx();
        const y = ry();
        p.set(x, y, C.white);
        if (r() < 0.2) {
          p.set(x + 1, y, C.mist2);
          p.set(x, y + 1, C.mist2);
        }
      }
      break;
    case 'sparkles':
      for (let i = 0; i < 16; i++) {
        const x = rx();
        const y = ry(H - 10);
        const big = r() < 0.4;
        const c = r() < 0.5 ? C.gold0 : C.white;
        p.set(x, y, C.white);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, c);
        if (big) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) p.set(x + dx, y + dy, C.gold1);
      }
      break;
    case 'fireflies':
      for (let i = 0; i < 14; i++) {
        const x = rx();
        const y = 30 + ry(H - 30);
        p.glow(x, y, 4, C.leaf1, 7);
        p.set(x, y, C.leaf0);
      }
      break;
    case 'lanterns':
      for (let i = 0; i < 12; i++) {
        const x = rx();
        const y = 6 + ry(50);
        p.glow(x + 1, y + 1, 7, C.gold3, 6);
        p.rect(x, y, 2, 3, C.gold1);
        p.set(x, y, C.gold0);
        p.set(x + 1, y + 2, C.ember);
      }
      break;
    case 'fireworks':
      for (let i = 0; i < 3; i++) {
        const cx = 20 + r() * 120;
        const cy = 10 + r() * 22;
        const col = [C.pink1, C.gold1, C.sky1, C.leaf1, C.violet1][Math.floor(r() * 5)];
        for (let a = 0; a < 16; a++) {
          const th = (a / 16) * Math.PI * 2;
          for (let d = 4; d < 12; d += 2) p.set(cx + Math.cos(th) * d, cy + Math.sin(th) * d, d > 8 ? col : C.white);
        }
      }
      break;
    case 'embers':
      for (let i = 0; i < 30; i++) {
        const x = rx();
        const y = 30 + ry(H - 30);
        p.set(x, y, r() < 0.5 ? C.ember : C.gold1);
        if (r() < 0.3) p.set(x, y - 1, C.red1);
      }
      break;
    case 'dust':
      for (let i = 0; i < 24; i++) p.set(20 + rx() * 0.7, ry(), C.gold0);
      break;
    case 'rays':
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const band = (x + y * 1.2) % 34;
          if (band < 9 && bayer(x, y) < 3 - y / 40) p.set(x, y, C.gold0);
        }
      }
      break;
    case 'vignette':
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const d = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2));
          if (d > 0.85 && bayer(x, y) < (d - 0.85) * 40) p.set(x, y, C.ink);
        }
      }
      break;
    case 'red_glow':
      p.glow(W / 2, H, 70, C.red3, 7);
      p.glow(W / 2, H, 36, C.red2, 5);
      break;
    case 'blue_glow':
      p.glow(W / 2, H * 0.55, 50, C.violet3, 6);
      p.glow(W / 2, H * 0.55, 22, C.sky1, 5);
      break;
    case 'gold_glow':
      p.glow(W / 2, H * 0.4, 60, C.gold3, 6);
      p.glow(W / 2, H * 0.4, 26, C.gold1, 5);
      break;
    case 'speedlines':
      for (let i = 0; i < 40; i++) {
        const th = r() * Math.PI * 2;
        const r0 = 34 + r() * 14;
        const r1 = 120;
        p.line(W / 2 + Math.cos(th) * r0, H / 2 + Math.sin(th) * r0 * 0.6, W / 2 + Math.cos(th) * r1, H / 2 + Math.sin(th) * r1 * 0.6, r() < 0.5 ? C.white : C.mist1);
      }
      break;
    case 'bloom':
      for (let i = 0; i < 9; i++) {
        const x = rx();
        const y = ry();
        const rad = 3 + r() * 5;
        p.ellipse(x, y, rad, rad, (px, py) => (bayer(px, py) < 5 ? (r() < 0.5 ? C.pink0 : C.gold0) : -1));
      }
      break;
    case 'shock':
      p.glow(W / 2, H / 2, 60, C.white, 9);
      for (let i = 0; i < 24; i++) {
        const th = r() * Math.PI * 2;
        p.line(W / 2 + Math.cos(th) * 20, H / 2 + Math.sin(th) * 12, W / 2 + Math.cos(th) * 110, H / 2 + Math.sin(th) * 66, C.white);
      }
      break;
  }
}
