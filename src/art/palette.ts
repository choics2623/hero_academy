// 고정 팔레트. 모든 도트는 이 색들만 쓴다 (시간대 색조를 입힌 뒤에도 다시 이 팔레트로 맞춘다).
// 램프 = [밝음, 기본, 그림자, 외곽]

export const C = {
  // 무채색 (푸른 기가 도는 회색)
  ink: 0x0e0b16,
  night0: 0x161427,
  night1: 0x221f3a,
  slate0: 0x332f52,
  slate1: 0x4a4670,
  slate2: 0x67648e,
  mist0: 0x8d8bb0,
  mist1: 0xb7b5d0,
  mist2: 0xdedcea,
  white: 0xfbf9ff,

  // 피부
  skin0: 0xfde3cf,
  skin1: 0xf3c7a8,
  skin2: 0xd9997a,
  skin3: 0xa8624f,
  tan0: 0xe8b98f,
  tan1: 0xcf9268,
  tan2: 0xa86a49,
  tan3: 0x6e4030,
  pale0: 0xfff0e6,
  pale1: 0xf7d8c8,
  pale2: 0xe0aea0,
  lip: 0xc0606a,
  blush: 0xf28a9a,

  // 따뜻한 색 (불빛, 금)
  gold0: 0xfff3b0,
  gold1: 0xffd36b,
  gold2: 0xe8a33a,
  gold3: 0xb06a1f,
  ember: 0xf0702d,
  ember2: 0xb8401f,

  // 붉은색 (피, 멸망)
  red0: 0xff8a8a,
  red1: 0xe5404f,
  red2: 0xa8213f,
  red3: 0x5e1131,

  // 분홍
  pink0: 0xffc9d9,
  pink1: 0xf08fb0,
  pink2: 0xc4587f,

  // 초록
  leaf0: 0xd4f08a,
  leaf1: 0x8fd16a,
  leaf2: 0x4c9e55,
  leaf3: 0x2b6147,
  leaf4: 0x183b33,

  // 청록 (엘프)
  teal0: 0xa8f0dc,
  teal1: 0x4fc2ad,
  teal2: 0x2b8381,
  teal3: 0x1a4c58,

  // 파랑
  sky0: 0xbfe6ff,
  sky1: 0x74b8f0,
  blue1: 0x4278d4,
  blue2: 0x2c4c9c,
  blue3: 0x1d2c66,

  // 보라 (마력)
  violet0: 0xe9c6ff,
  violet1: 0xb98af0,
  violet2: 0x8155c9,
  violet3: 0x4f3190,
  violet4: 0x2e1d5c,

  // 갈색 (나무, 흙)
  wood0: 0xe6b27a,
  wood1: 0xb87d4b,
  wood2: 0x82522f,
  wood3: 0x55331f,
  wood4: 0x352015,

  // 금발/은발 계열 머리
  blond0: 0xfff6c8,
  blond1: 0xf3d986,
  blond2: 0xcfa856,
  blond3: 0x8e6a33,
  silver0: 0xffffff,
  silver1: 0xd9dbea,
  silver2: 0xa5a8c4,
  silver3: 0x66698f,
} as const;

export type Ramp = readonly [number, number, number, number];

export const RAMP = {
  // 머리
  brown: [0xb27a4d, 0x845233, 0x5c3522, 0x2e1a14],
  sandy: [0xe2b878, 0xbb8a4e, 0x8a5f34, 0x48301c],
  black: [0x5a5878, 0x35334f, 0x211f35, 0x0e0b16],
  platinum: [C.blond0, C.blond1, C.blond2, C.blond3],
  silver: [C.silver0, C.silver1, C.silver2, C.silver3],
  crimson: [0xff8a8a, 0xd8384c, 0x9c1f3b, 0x55102b],
  orange: [0xffc178, 0xf08a3c, 0xbf5a26, 0x6e2f17],
  ash: [0xc9c6d6, 0x9693ad, 0x686585, 0x37344f],
  sage: [0xe6f0b0, 0xbcd68a, 0x86a865, 0x46613d],
  lilac: [0xf3e0ff, 0xcdb0ef, 0x9a7dc9, 0x58407f],
  white: [C.white, C.mist2, C.mist1, C.slate2],
  gray: [0xc4c4cc, 0x8f909e, 0x62637a, 0x33344a],
  navy: [0x6a76b8, 0x434d8f, 0x2c3266, 0x161a3a],
  blue: [0x9ad0ff, 0x4f8fe0, 0x2e5bb0, 0x1a2e66],
  red: [0xff9a7a, 0xe0523a, 0xa5321f, 0x5a1a12],
  dark: [0x4a3a3a, 0x2e2224, 0x1c1416, 0x0e0b16],

  // 눈
  eyeBlue: [C.sky0, C.sky1, C.blue2, C.ink],
  eyeGreen: [C.leaf0, C.leaf1, C.leaf3, C.ink],
  eyeViolet: [C.violet0, C.violet1, C.violet3, C.ink],
  eyeGold: [C.gold0, C.gold1, C.gold3, C.ink],
  eyeBrown: [0xd9a46b, 0x8a5631, 0x4f2c1a, C.ink],
  eyeGray: [C.mist2, C.mist0, C.slate1, C.ink],
  eyeRed: [C.red0, C.red1, C.red3, C.ink],
  eyeTeal: [C.teal0, C.teal1, C.teal3, C.ink],

  // 피부
  fair: [C.skin0, C.skin1, C.skin2, C.skin3],
  pale: [C.pale0, C.pale1, C.pale2, C.skin3],
  tan: [C.tan0, C.tan1, C.tan2, C.tan3],

  // 옷
  uniform: [0x4f5f9e, 0x34407a, 0x222a55, 0x121633],
  cream: [C.white, 0xeae6d6, 0xc5bfa6, 0x6e6852],
  violetCloth: [C.violet1, C.violet2, C.violet3, C.violet4],
  blackCloth: [0x4a4766, 0x2c2a42, 0x1b1a2b, C.ink],
  grayCloth: [0x9a98ad, 0x6d6b86, 0x4a4863, 0x25233a],
  brownCloth: [C.wood0, C.wood1, C.wood2, C.wood4],
  greenCloth: [C.leaf1, C.leaf2, C.leaf3, C.leaf4],
  redCloth: [C.red0, C.red1, C.red2, C.red3],
  whiteCloth: [C.white, C.mist2, C.mist1, C.slate2],
  orangeCloth: [0xffc178, 0xf08a3c, 0xbf5a26, 0x6e2f17],
} as const satisfies Record<string, Ramp>;

export type RampName = keyof typeof RAMP;

/** 팔레트 전체 (양자화용) */
export const ALL: number[] = [
  ...new Set([...Object.values(C), ...Object.values(RAMP).flatMap((r) => [...r])]),
];

const cache = new Map<number, number>();

/** 가장 가까운 팔레트 색 (인지 가중 거리) */
export function nearest(c: number): number {
  const hit = cache.get(c);
  if (hit !== undefined) return hit;
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  let best = ALL[0];
  let bd = Infinity;
  for (const p of ALL) {
    const dr = r - ((p >> 16) & 255);
    const dg = g - ((p >> 8) & 255);
    const db = b - (p & 255);
    const rm = (r + ((p >> 16) & 255)) / 2;
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  cache.set(c, best);
  return best;
}
