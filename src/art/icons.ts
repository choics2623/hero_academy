// 16×16 아이콘. 도형으로 칠한 뒤 마지막에 검은 외곽선을 두른다.

import { C } from './palette';
import { CLEAR, Pix } from './pixel';

type Draw = (p: Pix) => void;

const sword: Draw = (p) => {
  p.line(13, 2, 6, 9, C.white);
  p.line(13, 3, 7, 9, C.mist1);
  p.line(12, 2, 6, 8, C.mist2);
  p.line(3, 8, 8, 13, C.gold1);
  p.line(4, 8, 8, 12, C.gold2);
  p.line(5, 11, 2, 14, C.wood2);
  p.line(4, 11, 2, 13, C.wood1);
  p.set(1, 14, C.gold1);
};

const swords: Draw = (p) => {
  p.line(13, 1, 4, 10, C.mist2);
  p.line(13, 2, 5, 10, C.mist1);
  p.line(2, 1, 11, 10, C.white);
  p.line(2, 2, 10, 10, C.mist1);
  p.line(2, 9, 6, 13, C.gold1);
  p.line(9, 13, 13, 9, C.gold2);
  p.line(4, 12, 2, 14, C.wood1);
  p.line(11, 12, 13, 14, C.wood2);
};

const book: Draw = (p) => {
  p.rect(3, 2, 10, 12, C.blue1);
  p.rect(3, 2, 2, 12, C.blue2);
  p.rect(12, 3, 2, 11, C.white);
  p.vline(13, 3, 13, C.mist1);
  p.rect(7, 6, 3, 3, C.gold1);
  p.set(8, 5, C.gold1);
  p.set(8, 9, C.gold2);
  p.set(10, 7, C.gold2);
  p.set(6, 7, C.gold1);
  p.hline(5, 11, 2, C.sky1);
};

const books: Draw = (p) => {
  p.rect(2, 11, 12, 3, C.red1);
  p.hline(2, 13, 13, C.red2);
  p.rect(3, 8, 10, 3, C.leaf2);
  p.hline(3, 12, 10, C.leaf3);
  p.rect(4, 5, 9, 3, C.blue1);
  p.hline(4, 12, 7, C.blue2);
  p.rect(5, 2, 7, 3, C.gold2);
  p.hline(5, 11, 4, C.gold3);
  for (const y of [3, 6, 9, 12]) p.set(y === 12 ? 12 : y === 9 ? 11 : 10, y, C.white);
};

const wand: Draw = (p) => {
  p.line(2, 14, 9, 7, C.wood1);
  p.line(3, 14, 10, 7, C.wood2);
  p.rect(10, 2, 3, 3, C.gold1);
  p.vline(11, 0, 6, C.gold1);
  p.hline(8, 14, 3, C.gold1);
  p.set(11, 3, C.white);
  p.set(4, 4, C.violet1);
  p.set(14, 9, C.violet1);
  p.set(6, 1, C.sky1);
};

const chapel: Draw = (p) => {
  p.vline(8, 0, 4, C.gold1);
  p.hline(7, 9, 1, C.gold1);
  p.poly([[1, 8], [8, 3], [15, 8]], (x) => (x < 8 ? C.blue1 : C.blue2));
  p.rect(3, 8, 10, 7, C.mist2);
  p.rect(10, 8, 3, 7, C.mist1);
  p.rect(7, 11, 3, 4, C.wood2);
  p.set(8, 10, C.wood2);
  p.set(8, 9, C.gold1);
  p.set(5, 10, C.sky1);
  p.set(11, 10, C.sky1);
};

const bowl: Draw = (p) => {
  p.ellipse(8, 9, 6.5, 4.5, (x, y) => (y < 9 ? CLEAR : x > 10 ? C.wood2 : C.wood1));
  p.hline(2, 13, 9, C.wood0);
  p.hline(3, 12, 8, C.white);
  p.set(5, 8, C.leaf1);
  p.set(9, 8, C.ember);
  for (const x of [5, 8, 11]) {
    p.set(x, 5, C.mist1);
    p.set(x + 1, 4, C.mist1);
    p.set(x, 3, C.mist1);
  }
};

const coin: Draw = (p) => {
  p.ellipse(8, 8, 6.5, 6.5, (x, y) => (x + y < 13 ? C.gold1 : x + y > 18 ? C.gold3 : C.gold2));
  p.ellipse(8, 8, 4, 4, C.gold2);
  p.ellipse(8, 8, 3, 3, C.gold1);
  p.vline(8, 5, 11, C.gold3);
  p.set(4, 5, C.white);
  p.set(5, 4, C.white);
};

const tree: Draw = (p) => {
  p.rect(7, 10, 2, 5, C.wood2);
  p.set(7, 11, C.wood1);
  p.ellipse(8, 6.5, 6.5, 5.5, (x, y) => (x + y < 11 ? C.leaf1 : x + y > 17 ? C.leaf3 : C.leaf2));
  p.set(5, 4, C.leaf0);
  p.set(6, 3, C.leaf0);
};

const bag: Draw = (p) => {
  p.ellipse(8, 10, 6, 5, (x, y) => (x > 10 ? C.wood2 : x < 6 && y < 10 ? C.wood0 : C.wood1));
  p.poly([[5, 2], [11, 2], [9, 6], [7, 6]], C.wood1);
  p.hline(6, 10, 5, C.red1);
  p.hline(6, 10, 6, C.red2);
  p.ellipse(8, 10.5, 2, 2, C.gold1);
};

const plant: Draw = (p) => {
  p.poly([[3, 10], [13, 10], [11, 15], [5, 15]], (x) => (x > 9 ? C.ember2 : C.ember));
  p.hline(3, 12, 10, C.gold3);
  p.vline(8, 5, 9, C.leaf2);
  p.ellipse(5, 7, 2.5, 1.5, C.leaf1);
  p.ellipse(11, 6, 2.5, 1.5, C.leaf2);
  p.ellipse(8, 3, 2, 2, C.pink1);
  p.set(8, 3, C.gold1);
};

const quill: Draw = (p) => {
  p.rect(1, 11, 5, 4, C.slate0);
  p.hline(1, 5, 11, C.slate1);
  p.rect(2, 10, 3, 1, C.slate0);
  p.poly([[13, 1], [15, 2], [8, 11], [6, 10]], (x, y) => (x + y > 15 ? C.mist1 : C.white));
  p.line(14, 2, 7, 10, C.mist0);
  p.line(7, 10, 4, 12, C.ink);
};

const moon: Draw = (p) => {
  p.ellipse(8, 8, 6.5, 6.5, (x, y) => ((x - 11) ** 2 + (y - 5.5) ** 2 < 30 ? CLEAR : x + y > 16 ? C.gold2 : C.gold1));
  p.set(12, 11, C.white);
  p.set(13, 3, C.white);
  p.set(2, 2, C.sky0);
};

const bed: Draw = (p) => {
  p.rect(1, 7, 2, 8, C.wood2);
  p.rect(1, 11, 14, 2, C.wood1);
  p.vline(14, 10, 14, C.wood2);
  p.rect(3, 8, 4, 3, C.white);
  p.rect(7, 8, 7, 3, C.blue1);
  p.hline(7, 13, 8, C.sky1);
  p.set(12, 3, C.mist1);
  p.hline(10, 12, 3, C.mist1);
  p.line(12, 3, 10, 5, C.mist1);
  p.hline(10, 12, 5, C.mist1);
};

const pickaxe: Draw = (p) => {
  p.line(3, 14, 11, 6, C.wood1);
  p.line(4, 14, 12, 6, C.wood2);
  for (let i = 0; i < 9; i++) {
    const x = 5 + i;
    const y = Math.round(2 + Math.abs(i - 4) * 0.6 + (i < 4 ? 0 : 0));
    p.set(x, y, C.mist1);
    p.set(x, y + 1, C.slate2);
  }
  p.set(4, 4, C.mist2);
  p.set(14, 5, C.slate2);
};

const eye: Draw = (p) => {
  p.poly([[1, 8], [5, 4], [11, 4], [15, 8], [11, 12], [5, 12]], C.white);
  p.ellipse(8, 8, 3.2, 3.2, (x, y) => (x + y < 15 ? C.violet1 : C.violet2));
  p.ellipse(8, 8, 1.3, 1.3, C.ink);
  p.set(7, 7, C.white);
  p.hline(5, 11, 4, C.slate0);
};

const dawn: Draw = (p) => {
  p.ellipse(8, 12, 5.5, 5.5, (x, y) => (y > 11 ? CLEAR : C.gold1));
  p.hline(1, 14, 12, C.ember);
  p.hline(3, 12, 14, C.ember2);
  for (const [x0, y0, x1, y1] of [[8, 1, 8, 3], [2, 5, 3, 6], [14, 5, 13, 6], [1, 9, 2, 9], [15, 9, 14, 9]]) p.line(x0, y0, x1, y1, C.gold2);
};

const house: Draw = (p) => {
  p.poly([[1, 8], [8, 1], [15, 8]], (x) => (x < 8 ? C.red1 : C.red2));
  p.rect(3, 8, 10, 7, C.wood0);
  p.rect(10, 8, 3, 7, C.wood1);
  p.rect(7, 10, 2, 5, C.wood3);
  p.rect(4, 10, 2, 2, C.sky0);
};

const dumbbell: Draw = (p) => {
  p.rect(4, 7, 8, 2, C.mist1);
  p.rect(1, 4, 3, 8, C.slate1);
  p.rect(12, 4, 3, 8, C.slate1);
  p.vline(1, 4, 11, C.slate2);
  p.vline(12, 4, 11, C.slate2);
};

const wing: Draw = (p) => {
  p.ellipse(9, 5, 5.5, 2.2, C.white);
  p.ellipse(8, 8, 5.5, 2.2, C.mist2);
  p.ellipse(7, 11, 5, 2, C.mist1);
  p.line(14, 3, 3, 13, C.sky1);
};

const heart: Draw = (p) => {
  const f = (x: number, y: number) => (x + y < 11 ? C.red0 : x + y > 17 ? C.red2 : C.red1);
  p.ellipse(5, 6, 3.6, 3.6, f);
  p.ellipse(11, 6, 3.6, 3.6, f);
  p.poly([[1.6, 7], [14.4, 7], [8, 14]], f);
  p.set(4, 4, C.white);
};

const crystal: Draw = (p) => {
  p.poly([[8, 1], [13, 6], [8, 15], [3, 6]], (x, y) => (y < 6 ? (x < 8 ? C.violet0 : C.violet1) : x < 8 ? C.violet1 : C.violet2));
  p.line(3, 6, 13, 6, C.violet3);
  p.line(8, 1, 8, 15, C.violet2);
  p.set(6, 4, C.white);
};

const orb: Draw = (p) => {
  p.ellipse(8, 8, 3.5, 3.5, (x, y) => (x + y < 15 ? C.sky0 : C.sky1));
  for (let a = 0; a < 40; a++) {
    const t = (a / 40) * Math.PI * 2;
    const x = 8 + Math.cos(t) * 6.6;
    const y = 8 + Math.sin(t) * 2.8;
    if (!(y < 8 && Math.abs(x - 8) < 3.5)) p.set(x, y, C.teal1);
  }
  p.set(7, 6, C.white);
};

const flame: Draw = (p) => {
  p.poly([[8, 1], [12, 6], [13, 10], [11, 14], [5, 14], [3, 10], [5, 6], [6, 8]], (x) => (x > 9 ? C.ember2 : C.ember));
  p.poly([[8, 6], [10, 10], [9, 13], [7, 13], [6, 10]], C.gold1);
  p.set(8, 11, C.gold0);
};

const star: Draw = (p) => {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 2.8 : 7;
    const t = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([8 + Math.cos(t) * r, 8.5 + Math.sin(t) * r]);
  }
  p.poly(pts, (x, y) => (x + y < 15 ? C.gold1 : C.gold2));
  p.set(7, 6, C.white);
};

const hammer: Draw = (p) => {
  p.line(3, 14, 9, 8, C.wood1);
  p.line(4, 14, 10, 8, C.wood2);
  p.poly([[6, 5], [10, 1], [15, 6], [11, 10]], (x, y) => (x + y < 12 ? C.mist2 : C.slate1));
  p.line(10, 1, 15, 6, C.mist1);
};

const shield: Draw = (p) => {
  p.poly([[2, 2], [14, 2], [14, 8], [8, 15], [2, 8]], C.gold2);
  p.poly([[3, 3], [13, 3], [13, 8], [8, 14], [3, 8]], (x) => (x < 8 ? C.blue1 : C.blue2));
  p.vline(8, 4, 12, C.gold1);
  p.hline(5, 11, 7, C.gold1);
};

const charge: Draw = (p) => {
  for (const oy of [2, 7]) {
    p.line(2, oy + 6, 8, oy, C.gold1);
    p.line(8, oy, 14, oy + 6, C.gold1);
    p.line(3, oy + 6, 8, oy + 1, C.ember);
    p.line(8, oy + 1, 13, oy + 6, C.ember);
  }
};

const burst: Draw = (p) => {
  for (let i = 0; i < 8; i++) {
    const t = (i * Math.PI) / 4;
    const r = i % 2 ? 5 : 7;
    p.line(8, 8, 8 + Math.cos(t) * r, 8 + Math.sin(t) * r, i % 2 ? C.violet1 : C.violet0);
  }
  p.ellipse(8, 8, 2.5, 2.5, C.white);
};

const dice: Draw = (p) => {
  p.poly([[8, 1], [14, 4.5], [14, 11.5], [8, 15], [2, 11.5], [2, 4.5]], (x, y) => (y < 6 ? C.white : x > 9 ? C.mist0 : C.mist1));
  p.poly([[8, 4], [12, 11], [4, 11]], C.white);
  p.line(8, 1, 8, 4, C.slate2);
  p.line(2, 4, 8, 4, C.slate2);
  p.line(14, 4, 8, 4, C.slate2);
  p.line(4, 11, 2, 12, C.slate2);
  p.line(12, 11, 14, 12, C.slate2);
  p.line(4, 11, 8, 15, C.slate2);
  p.line(12, 11, 8, 15, C.slate2);
  p.line(8, 4, 4, 11, C.slate2);
  p.line(8, 4, 12, 11, C.slate2);
  p.line(4, 11, 12, 11, C.slate2);
};

const sunIcon: Draw = (p) => {
  for (let i = 0; i < 8; i++) {
    const t = (i * Math.PI) / 4;
    p.line(8 + Math.cos(t) * 5, 8 + Math.sin(t) * 5, 8 + Math.cos(t) * 7, 8 + Math.sin(t) * 7, C.gold2);
  }
  p.ellipse(8, 8, 4, 4, (x, y) => (x + y < 15 ? C.gold0 : C.gold1));
};

const hourglass: Draw = (p) => {
  p.hline(3, 12, 1, C.wood1);
  p.hline(3, 12, 14, C.wood1);
  p.poly([[4, 2], [12, 2], [8, 8]], C.sky0);
  p.poly([[4, 14], [12, 14], [8, 8]], C.sky0);
  p.poly([[6, 4], [10, 4], [8, 7]], C.gold1);
  p.poly([[5, 13], [11, 13], [8, 10]], C.gold2);
  p.vline(8, 7, 11, C.gold1);
};

const skull: Draw = (p) => {
  p.ellipse(8, 7, 6, 5.5, (x, y) => (x + y > 17 ? C.mist1 : C.white));
  p.rect(5, 11, 6, 3, C.mist2);
  p.ellipse(5.5, 7.5, 1.6, 1.8, C.ink);
  p.ellipse(10.5, 7.5, 1.6, 1.8, C.ink);
  p.set(8, 10, C.ink);
  p.set(6, 13, C.slate2);
  p.set(8, 13, C.slate2);
  p.set(10, 13, C.slate2);
};

const zzz: Draw = (p) => {
  const z = (x: number, y: number, s: number, c: number) => {
    p.hline(x, x + s, y, c);
    p.line(x + s, y, x, y + s, c);
    p.hline(x, x + s, y + s, c);
  };
  z(1, 9, 5, C.sky1);
  z(8, 4, 4, C.sky0);
  z(12, 0, 2, C.white);
};

const cloud: Draw = (p) => {
  const f = (_x: number, y: number) => (y > 9 ? C.slate1 : C.slate2);
  p.ellipse(5, 9, 4, 3.5, f);
  p.ellipse(10, 7.5, 4.5, 4.5, f);
  p.ellipse(12.5, 10, 3, 2.5, f);
  p.rect(4, 9, 10, 4, C.slate1);
  p.line(9, 12, 7, 14, C.gold1);
  p.line(7, 14, 9, 14, C.gold1);
  p.line(9, 14, 7, 16, C.gold1);
};

const target: Draw = (p) => {
  p.ellipse(8, 8, 6.8, 6.8, C.red1);
  p.ellipse(8, 8, 5, 5, C.white);
  p.ellipse(8, 8, 3.2, 3.2, C.red1);
  p.ellipse(8, 8, 1.4, 1.4, C.white);
};

const signpost: Draw = (p) => {
  p.rect(7, 3, 2, 12, C.wood2);
  p.poly([[2, 3], [11, 3], [13, 5], [11, 7], [2, 7]], C.wood0);
  p.poly([[14, 8], [5, 8], [3, 10], [5, 12], [14, 12]], C.wood1);
  p.hline(4, 9, 5, C.wood2);
  p.hline(7, 12, 10, C.wood3);
};

const potion: Draw = (p) => {
  p.rect(6, 1, 4, 2, C.wood1);
  p.rect(6, 3, 4, 3, C.mist2);
  p.ellipse(8, 10, 5.5, 5, (x, y) => (y < 8 ? C.mist2 : x > 10 ? C.red2 : C.red1));
  p.set(5, 9, C.white);
  p.set(5, 10, C.red0);
};

const rune: Draw = (p) => {
  p.rect(4, 1, 8, 14, C.gold0);
  p.rect(10, 1, 2, 14, C.blond1);
  p.vline(8, 3, 12, C.red1);
  p.line(5, 5, 11, 9, C.red1);
  p.line(11, 5, 5, 9, C.red1);
  p.hline(6, 10, 12, C.red2);
};

const scroll: Draw = (p) => {
  p.rect(3, 3, 10, 10, C.gold0);
  p.rect(11, 3, 2, 10, C.blond1);
  p.rect(2, 1, 12, 2, C.wood1);
  p.rect(2, 13, 12, 2, C.wood1);
  for (const y of [5, 7, 9, 11]) p.hline(5, y === 11 ? 8 : 10, y, C.slate1);
};

const people: Draw = (p) => {
  p.ellipse(5, 5, 2.5, 2.5, C.skin1);
  p.ellipse(5, 12, 4, 3.5, (_x, y) => (y > 12 ? CLEAR : C.blue1));
  p.rect(1, 11, 9, 2, C.blue1);
  p.ellipse(11, 4.5, 2.5, 2.5, C.skin1);
  p.ellipse(11, 11.5, 4, 3.5, (_x, y) => (y > 12 ? CLEAR : C.red1));
  p.rect(7, 11, 9, 2, C.red1);
};

const lock: Draw = (p) => {
  for (let a = 0; a <= 20; a++) {
    const t = Math.PI + (a / 20) * Math.PI;
    p.set(8 + Math.cos(t) * 3.5, 6 + Math.sin(t) * 4, C.mist1);
  }
  p.vline(4, 6, 7, C.mist1);
  p.vline(12, 6, 7, C.mist1);
  p.rect(3, 7, 10, 7, C.gold2);
  p.rect(3, 7, 10, 2, C.gold1);
  p.rect(7, 10, 2, 2, C.wood3);
};


// ---- 판정 종류
const talk: Draw = (p) => {
  p.ellipse(8, 7, 6.5, 5, C.mist2);
  p.ellipse(8, 7, 6.5, 5, (x, y) => (y > 9 || x > 12 ? C.mist1 : C.white));
  p.line(5, 11, 3, 14, C.mist1);
  p.line(6, 11, 4, 14, C.white);
  for (const x of [5, 8, 11]) p.set(x, 7, C.slate1);
};

const mask: Draw = (p) => {
  p.ellipse(8, 8, 7, 4.5, (x, y) => (y > 9 ? C.violet3 : C.violet2));
  p.rect(3, 6, 4, 3, C.ink);
  p.rect(9, 6, 4, 3, C.ink);
  p.set(4, 7, C.violet0);
  p.set(10, 7, C.violet0);
  p.hline(7, 9, 9, C.violet1);
  p.line(1, 7, 0, 11, C.red1);
  p.line(15, 7, 15, 11, C.red1);
};

const fist: Draw = (p) => {
  p.rect(3, 5, 10, 8, C.skin1);
  p.rect(3, 11, 10, 2, C.skin2);
  for (const x of [5, 8, 11]) p.vline(x, 5, 8, C.skin2);
  p.rect(1, 7, 3, 4, C.skin2);
  p.rect(4, 13, 8, 3, C.red1);
  p.hline(4, 11, 15, C.red2);
};

const paw: Draw = (p) => {
  p.ellipse(8, 11, 4, 3.5, C.wood1);
  p.ellipse(8, 11.5, 2.5, 2, C.pink1);
  for (const [x, y] of [[3, 6], [6, 3], [10, 3], [13, 6]] as const) {
    p.ellipse(x, y, 1.8, 2, C.wood1);
    p.set(x, y, C.pink1);
  }
};

// ---- 장비와 물건
const hat: Draw = (p) => {
  p.ellipse(8, 12, 7.5, 2.2, C.wood2);
  p.rect(4, 5, 8, 7, C.wood1);
  p.rect(4, 5, 8, 1, C.wood0);
  p.rect(4, 9, 8, 2, C.red1);
  p.vline(11, 5, 11, C.wood2);
};

const shirt: Draw = (p) => {
  p.rect(4, 4, 8, 11, C.mist2);
  p.rect(1, 4, 3, 6, C.mist2);
  p.rect(12, 4, 3, 6, C.mist2);
  p.rect(6, 3, 4, 2, C.mist1);
  p.vline(8, 5, 14, C.mist1);
  for (const y of [7, 10, 13]) p.set(8, y, C.slate1);
  p.vline(11, 5, 14, C.mist1);
};

const pants: Draw = (p) => {
  p.rect(3, 2, 10, 3, C.wood3);
  p.rect(3, 5, 4, 10, C.blue2);
  p.rect(9, 5, 4, 10, C.blue2);
  p.rect(7, 5, 2, 3, C.blue2);
  p.vline(6, 5, 14, C.blue3);
  p.vline(12, 5, 14, C.blue3);
  p.set(8, 3, C.gold1);
};

const robe: Draw = (p) => {
  p.rect(5, 2, 6, 3, C.violet2);
  p.line(5, 5, 2, 15, C.violet2);
  p.line(10, 5, 13, 15, C.violet3);
  for (let y = 5; y <= 15; y++) p.hline(Math.round(5 - (y - 5) * 0.3), Math.round(10 + (y - 5) * 0.3), y, y > 12 ? C.violet3 : C.violet2);
  p.vline(8, 4, 15, C.gold1);
  p.hline(3, 12, 15, C.gold2);
};

const ring: Draw = (p) => {
  for (let a = 0; a < 32; a++) {
    const t = (a / 32) * Math.PI * 2;
    p.set(8 + Math.cos(t) * 4.5, 10 + Math.sin(t) * 4, a < 16 ? C.gold2 : C.gold1);
  }
  p.ellipse(8, 5, 2.5, 2.5, C.sky1);
  p.set(7, 4, C.white);
};

const amulet: Draw = (p) => {
  p.line(3, 1, 7, 8, C.gold2);
  p.line(13, 1, 9, 8, C.gold2);
  p.ellipse(8, 11, 3.5, 4, C.gold1);
  p.ellipse(8, 11, 2, 2.5, C.teal1);
  p.set(7, 10, C.teal0);
};

const staff: Draw = (p) => {
  p.line(3, 15, 11, 4, C.wood2);
  p.line(4, 15, 12, 4, C.wood1);
  p.ellipse(12, 3, 2.6, 2.6, C.violet1);
  p.set(11, 2, C.violet0);
  p.set(14, 6, C.gold1);
  p.set(9, 1, C.gold1);
};

const boots: Draw = (p) => {
  p.rect(3, 3, 5, 9, C.wood2);
  p.rect(3, 11, 9, 4, C.wood2);
  p.rect(3, 3, 5, 2, C.wood1);
  p.hline(3, 12, 15, C.wood4);
  p.rect(9, 5, 4, 7, C.wood1);
  p.rect(9, 11, 6, 4, C.wood1);
  p.hline(9, 15, 15, C.wood3);
};

const herb: Draw = (p) => {
  p.line(8, 15, 8, 6, C.leaf3);
  p.ellipse(5, 8, 3, 1.6, C.leaf1);
  p.ellipse(11, 6, 3, 1.6, C.leaf2);
  p.ellipse(6, 4, 2.4, 1.4, C.leaf1);
  p.ellipse(10, 11, 2.6, 1.4, C.leaf2);
  p.set(8, 3, C.red1);
  p.set(9, 2, C.red0);
};

const letter: Draw = (p) => {
  p.rect(1, 4, 14, 9, C.gold0);
  p.line(1, 4, 8, 9, C.blond2);
  p.line(14, 4, 8, 9, C.blond2);
  p.rect(7, 8, 2, 2, C.red1);
};

const charm: Draw = (p) => {
  p.vline(8, 0, 3, C.red1);
  p.rect(5, 3, 6, 11, C.red1);
  p.rect(6, 4, 4, 9, C.gold0);
  p.vline(8, 5, 11, C.red2);
  p.hline(6, 9, 8, C.red2);
  p.hline(6, 9, 14, C.red2);
};

const misc: Draw = (p) => {
  p.rect(2, 6, 12, 8, C.wood1);
  p.rect(2, 4, 12, 3, C.wood0);
  p.vline(8, 4, 13, C.wood2);
  p.rect(7, 8, 2, 2, C.gold1);
};

/** 기억의 파편 */
const shard: Draw = (p) => {
  p.line(8, 1, 3, 8, C.sky1);
  p.line(8, 1, 13, 8, C.violet1);
  p.line(3, 8, 8, 15, C.violet2);
  p.line(13, 8, 8, 15, C.violet3);
  for (let y = 2; y <= 14; y++) {
    const w = y <= 8 ? (y - 1) * 0.72 : (15 - y) * 0.72;
    p.hline(Math.round(8 - w), Math.round(8 + w), y, y < 6 ? C.sky0 : y < 10 ? C.violet0 : C.violet1);
  }
  p.vline(8, 2, 13, C.white);
  p.set(6, 5, C.white);
};

export const ICONS: Record<string, Draw> = {
  sword, swords, book, books, wand, chapel, bowl, coin, tree, bag, plant, quill, moon, bed, pickaxe, eye, dawn, house,
  sun: sunIcon, dumbbell, wing, heart, crystal, orb, flame, star, hammer, shield, charge, burst, dice, hourglass, skull, zzz, cloud,
  target, signpost, potion, rune, scroll, people, lock,
  talk, mask, fist, paw, hat, shirt, pants, robe, ring, amulet, staff, boots, herb, letter, charm, misc, shard,
};

export type IconId = keyof typeof ICONS;

export function drawIcon(id: string, outline = true): Pix {
  const p = new Pix(16, 16);
  (ICONS[id] ?? ICONS.star)(p);
  if (outline) p.outline(C.ink);
  return p;
}

/** 활동 id → 아이콘 */
export const ACTIVITY_ICON: Record<string, string> = {
  폐광: 'pickaxe', 고서점: 'books', 뒷골목: 'eye', 새벽연무장: 'dawn', 집안정리: 'house', 기초훈련: 'dumbbell',
  훈련장: 'sword', 도서관: 'book', 마법실습: 'wand', 성당: 'chapel', 식당: 'bowl', 산책: 'tree', 아르바이트: 'coin',
  도시외출: 'bag', 온실: 'plant', 검술부: 'swords', 신문부: 'quill', 밤의연무장: 'moon', 휴식: 'bed',
};

/** 능력치 → 아이콘 */
export const STAT_ICON: Record<string, string> = {
  근력: 'dumbbell', 민첩: 'wing', 체질: 'heart', 마력량: 'crystal', 마력제어: 'orb', 지성: 'book', 의지: 'flame', 매력: 'star',
};

/** 적의 의도 → 아이콘 */
export const INTENT_ICON: Record<string, string> = { 공격: 'sword', 강타: 'hammer', 방어: 'shield', 차지: 'charge', 마법: 'burst', '?': 'eye' };
