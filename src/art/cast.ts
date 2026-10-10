// 등장인물 외형과 적 그림.

import { C, RAMP, type RampName } from './palette';
import { CLEAR, Pix, bayer, hash, rng } from './pixel';
import { HAIR_STYLES, drawPortrait, type HairStyle, type Look, type Mood } from './portrait';

const BG = {
  blue: [0x1d2547, 0x2c3b6e] as [number, number],
  green: [0x17332c, 0x285445] as [number, number],
  red: [0x3a1424, 0x5e2236] as [number, number],
  gold: [0x3a2a16, 0x5c4422] as [number, number],
  violet: [0x241a45, 0x3a2d6b] as [number, number],
  gray: [0x22222f, 0x3a3a4d] as [number, number],
  teal: [0x15343a, 0x22545a] as [number, number],
};

/** characters.yaml의 id → 외형 */
export const CAST: Record<string, Look> = {
  aren: { skin: 'fair', hair: 'messy', hairColor: 'sandy', eyes: 'eyeBlue', outfit: 'uniform', tie: C.sky1, bg: BG.blue },
  liana: { skin: 'pale', hair: 'hime', hairColor: 'sage', eyes: 'eyeGreen', outfit: 'uniform', tie: C.leaf1, acc: ['elfEars'], bg: BG.green },
  mirabel: { skin: 'pale', hair: 'drills', hairColor: 'crimson', eyes: 'eyeViolet', outfit: 'uniform', tie: C.violet1, trim: C.gold1, acc: ['ribbon', 'sharp'], bg: BG.violet },
  kaiden: { skin: 'fair', hair: 'neat', hairColor: 'platinum', eyes: 'eyeGold', outfit: 'noble', acc: ['circlet', 'sharp'], bg: BG.gold },
  bruno: { skin: 'tan', hair: 'buzz', hairColor: 'brown', eyes: 'eyeBrown', outfit: 'work', acc: ['big', 'headband'], bg: BG.red },
  finn: { skin: 'fair', hair: 'messy', hairColor: 'ash', eyes: 'eyeGray', outfit: 'work', cloth: 'grayCloth', acc: ['freckles'], bg: BG.gray },
  dorothy: { skin: 'fair', hair: 'bob', hairColor: 'orange', eyes: 'eyeBrown', outfit: 'apron', acc: ['bandana', 'freckles', 'blushy'], bg: BG.gold },
  sera: { skin: 'pale', hair: 'long', hairColor: 'silver', eyes: 'eyeBlue', outfit: 'uniform', tie: C.mist2, trim: C.mist2, bg: BG.teal },
  noel: { skin: 'fair', hair: 'shaggy', hairColor: 'navy', eyes: 'eyeTeal', outfit: 'shabby', tie: C.red2, acc: ['sleepy', 'stubble'], bg: BG.gray },
  garen: { skin: 'tan', hair: 'crew', hairColor: 'gray', eyes: 'eyeGray', outfit: 'coat', acc: ['scar', 'sharp'], bg: BG.gray },
  elvera: { skin: 'pale', hair: 'wavy', hairColor: 'lilac', eyes: 'eyeViolet', outfit: 'robe', acc: ['longEars', 'earring'], bg: BG.violet },
  bistol: { skin: 'fair', hair: 'wild', hairColor: 'black', eyes: 'eyeBrown', outfit: 'labcoat', acc: ['glasses', 'bags', 'sleepy', 'stubble'], bg: BG.teal },
  luna: { skin: 'fair', hair: 'long', hairColor: 'platinum', eyes: 'eyeBlue', outfit: 'habit', acc: ['veil', 'blushy'], rest: '웃음', bg: BG.blue },
  librarian: { skin: 'fair', hair: 'bald', hairColor: 'white', eyes: 'eyeGray', outfit: 'robe', cloth: 'grayCloth', acc: ['beard', 'glasses', 'sleepy'], bg: BG.gold },
  edric: { skin: 'pale', hair: 'neat', hairColor: 'black', eyes: 'eyeRed', outfit: 'noble', cloth: 'violetCloth', acc: ['sharp', 'earring'], bg: BG.violet },
  grim: { skin: 'tan', hair: 'messy', hairColor: 'dark', eyes: 'eyeGold', outfit: 'cloak', acc: ['hood', 'stubble'], bg: BG.gray },
  kael: { skin: 'pale', hair: 'shaggy', hairColor: 'black', eyes: 'eyeRed', outfit: 'uniform', tie: C.red2, acc: ['sharp', 'elfEars'], bg: BG.red },
};

export const PLAYER_HAIR: { id: HairStyle; label: string }[] = [
  { id: 'messy', label: '부스스한 머리' },
  { id: 'neat', label: '단정한 가르마' },
  { id: 'crew', label: '짧은 머리' },
  { id: 'bob', label: '단발' },
  { id: 'ponytail', label: '묶은 머리' },
  { id: 'long', label: '긴 머리' },
];
export const PLAYER_HAIR_COLOR: { id: RampName; label: string }[] = [
  { id: 'black', label: '흑발' },
  { id: 'brown', label: '갈색' },
  { id: 'sandy', label: '밝은 갈색' },
  { id: 'platinum', label: '금발' },
  { id: 'silver', label: '은발' },
  { id: 'crimson', label: '적발' },
  { id: 'navy', label: '남색' },
];
export const PLAYER_EYES: { id: RampName; label: string }[] = [
  { id: 'eyeBrown', label: '갈색' },
  { id: 'eyeBlue', label: '파랑' },
  { id: 'eyeGreen', label: '초록' },
  { id: 'eyeGray', label: '회색' },
  { id: 'eyeGold', label: '금색' },
  { id: 'eyeViolet', label: '보라' },
];
export const PLAYER_SKIN: { id: Look['skin']; label: string }[] = [
  { id: 'fair', label: '보통' },
  { id: 'pale', label: '흰 편' },
  { id: 'tan', label: '그을린' },
];

export interface PlayerLook {
  hair: string;
  hairColor: string;
  eyes: string;
  skin: string;
}

export const DEFAULT_PLAYER: PlayerLook = { hair: 'messy', hairColor: 'black', eyes: 'eyeBrown', skin: 'fair' };

/** 출신에 따라 옷이 달라진다 */
export function playerLook(p: PlayerLook | undefined, origin: string): Look {
  const v = { ...DEFAULT_PLAYER, ...(p ?? {}) };
  const outfit: Look['outfit'] = origin === '악역도련님' || origin === '몰락귀족' ? 'uniform' : 'uniform';
  const trim = origin === '악역도련님' ? C.gold1 : origin === '몰락귀족' ? C.mist1 : C.slate2;
  return {
    skin: (PLAYER_SKIN.some((s) => s.id === v.skin) ? v.skin : 'fair') as Look['skin'],
    hair: (HAIR_STYLES.includes(v.hair as HairStyle) ? v.hair : 'messy') as HairStyle,
    hairColor: (v.hairColor in RAMP ? v.hairColor : 'black') as RampName,
    eyes: (v.eyes in RAMP ? v.eyes : 'eyeBrown') as RampName,
    outfit,
    trim,
    tie: origin === '숲고아' ? C.leaf1 : origin === '악역도련님' ? C.violet2 : C.blue1,
    bg: [0x1a2a4a, 0x2a4f7a],
  };
}

/** 이름만 있는 엑스트라: 이름으로 외형을 정한다 (항상 같은 얼굴) */
export function extraLook(name: string): Look {
  const r = rng(hash(name));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const teacher = /교관|교수|선생|학장|사감/.test(name);
  const old = /노인|할머니|할아버지|주인|아주머니|아저씨/.test(name);
  const hair = pick(['messy', 'neat', 'crew', 'bob', 'ponytail', 'long', 'buzz', 'shaggy'] as HairStyle[]);
  return {
    skin: pick(['fair', 'fair', 'pale', 'tan'] as const),
    hair: old ? pick(['bald', 'crew', 'bob'] as HairStyle[]) : hair,
    hairColor: old ? pick(['white', 'gray'] as RampName[]) : pick(['black', 'brown', 'sandy', 'ash', 'orange', 'navy', 'platinum'] as RampName[]),
    eyes: pick(['eyeBrown', 'eyeBlue', 'eyeGray', 'eyeGreen'] as RampName[]),
    outfit: teacher ? 'coat' : old ? 'work' : pick(['uniform', 'uniform', 'uniform', 'work', 'shabby'] as Look['outfit'][]),
    tie: pick([C.red1, C.blue1, C.leaf2, C.gold2]),
    acc: [
      ...(old ? (['bags'] as const) : []),
      ...(r() < 0.25 ? (['freckles'] as const) : []),
      ...(r() < 0.15 ? (['glasses'] as const) : []),
      ...(/덩치|선배/.test(name) ? (['big'] as const) : []),
    ],
    bg: [0x22222f, 0x34344a],
  };
}

export function portraitOf(look: Look, mood: Mood = '', bg = true): Pix {
  return drawPortrait(look, mood, { bg });
}

// ---------------------------------------------------------------- 적

/** 적 id → 초상화로 쓸 캐릭터와 표정 (캐릭터가 아닌 적은 따로 그린다) */
const ENEMY_AS: Record<string, [string, Mood]> = {
  kaiden_spar: ['kaiden', '진지'],
  t_kaiden: ['kaiden', '화남'],
  mirabel_duel: ['mirabel', '진지'],
  t_mirabel: ['mirabel', '화남'],
  t_bruno: ['bruno', '진지'],
  t_aren: ['aren', '진지'],
};

export function enemyAs(id: string): [string, Mood] | undefined {
  return ENEMY_AS[id];
}

export function enemyArt(id: string, name: string, clear = false): Pix {
  const as = ENEMY_AS[id];
  if (as && CAST[as[0]]) return drawPortrait({ ...CAST[as[0]], bg: [0x3a1424, 0x5e2236] }, as[1]);
  if (id === 'rats') return rats(clear);
  if (id === 'cult_shadow') return shadow(clear);
  const l = extraLook(name);
  return drawPortrait({ ...l, bg: [0x3a1424, 0x5e2236], acc: [...(l.acc ?? []), id === 't_prelim' ? 'big' : 'sharp'] }, '화남');
}

function rats(clear = false): Pix {
  const p = new Pix(32, 32);
  if (!clear) {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, bayer(x, y) < 4 + y / 5 ? 0x2a2420 : 0x1a1614);
    // 바위 틈
    p.ellipse(26, 30, 9, 4, 0x3a322c);
    p.ellipse(4, 31, 6, 3, 0x3a322c);
  }
  const RAT = [
    '....kk.........',
    '...kpk..kkkk...',
    '..kGGkkkGGggk..',
    '.kGrGGGGGgggdk.',
    'kpGGggggggggddk',
    '.kkgggggggggddk',
    '...kdgkkkkgdkk.',
    '....kk.....kk..',
  ];
  const pal = { k: C.ink, G: 0x9a90a8, g: 0x766d86, d: 0x544c63, p: C.pink1, r: C.red1 };
  const put = (x: number, y: number, flip: boolean) => {
    p.sprite(x, y, RAT, pal, flip);
    const tx = flip ? x - 1 : x + 15;
    const dir = flip ? -1 : 1;
    p.line(tx, y + 5, tx + dir * 3, y + 3, C.pink2);
    p.line(tx + dir * 3, y + 3, tx + dir * 5, y + 4, C.pink2);
  };
  put(2, 4, false);
  put(13, 13, true);
  put(4, 22, false);
  return p;
}

function shadow(clear = false): Pix {
  const p = new Pix(32, 32);
  if (!clear) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, bayer(x, y) < 4 + (31 - y) / 3 ? 0x1c0f1f : 0x2e1426);
  // 바닥의 피의 원
  for (let x = 2; x <= 29; x++) {
    const y = 29 + Math.round(Math.sin((x / 28) * Math.PI) * 1.5);
    p.set(x, y, C.red1);
    if (x % 5 === 0) p.set(x, y - 1, C.red0);
  }
  if (!clear) p.glow(16, 29, 12, C.red3, 9);
  const robe = new Pix(32, 32);
  robe.poly(
    [
      [16, 3],
      [24, 10],
      [26, 22],
      [28, 30],
      [4, 30],
      [6, 22],
      [8, 10],
    ],
    (x, y) => (x > 19 ? C.night0 : bayer(x, y) < 3 ? C.slate0 : C.night1),
  );
  // 두건 속 어둠
  robe.ellipse(16, 12, 5, 5.5, C.ink);
  robe.set(14, 12, C.red1);
  robe.set(18, 12, C.red1);
  robe.set(14, 13, C.red3);
  robe.set(18, 13, C.red3);
  // 단검
  robe.line(23, 19, 27, 15, C.mist1);
  robe.set(27, 14, C.white);
  robe.set(22, 20, C.wood2);
  robe.set(23, 20, C.red1);
  robe.outline(C.ink);
  p.blit(robe);
  for (let i = 0; i < 6; i++) {
    const rr = rng(i + 3);
    const x = 4 + Math.floor(rr() * 24);
    const y = 4 + Math.floor(rr() * 20);
    if (robe.get(x, y) === CLEAR && !clear) p.set(x, y, C.red2);
  }
  return p;
}
