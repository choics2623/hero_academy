// 32×32 도트 초상화를 부품(머리 모양, 옷, 장신구, 표정)으로 조립한다.
// 사람마다 손으로 다 그리는 대신, 같은 얼굴 틀 위에 머리카락 윤곽선(profile)과 색 램프를 바꿔 끼운다.
// 빛은 왼쪽 위에서 온다: 오른쪽 가장자리가 그림자, 왼쪽 위에 머리카락 윤기.

import { C, RAMP, type Ramp, type RampName } from './palette';
import { CLEAR, Pix, bayer } from './pixel';

export const SIZE = 32;

export type Mood = '' | '웃음' | '화남' | '슬픔' | '놀람' | '당황' | '진지';
export type HairStyle =
  | 'messy' | 'neat' | 'long' | 'hime' | 'drills' | 'buzz' | 'bob' | 'shaggy' | 'crew' | 'bald' | 'ponytail' | 'wavy' | 'wild';
export type Outfit = 'uniform' | 'noble' | 'robe' | 'labcoat' | 'habit' | 'apron' | 'work' | 'coat' | 'cloak' | 'shabby';
export type Acc =
  | 'elfEars' | 'longEars' | 'circlet' | 'glasses' | 'headband' | 'bandana' | 'scar' | 'stubble' | 'beard' | 'freckles'
  | 'bags' | 'veil' | 'hood' | 'ribbon' | 'earring' | 'mole' | 'sleepy' | 'sharp' | 'big' | 'blushy';

export interface Look {
  skin: 'fair' | 'pale' | 'tan';
  hair: HairStyle;
  hairColor: RampName;
  eyes: RampName;
  outfit: Outfit;
  cloth?: RampName;
  /** 옷깃 장식 색 */
  trim?: number;
  /** 넥타이 색 */
  tie?: number;
  acc?: Acc[];
  /** 아무 표정도 지정하지 않았을 때의 표정 */
  rest?: Mood;
  /** 초상화 배경 (어두운 쪽 → 밝은 쪽) */
  bg?: [number, number];
}

// ---------------------------------------------------------------- 머리 모양

interface HairDef {
  /** 정수리 부피 */
  vol: number;
  /** x=9..22 열마다 앞머리 끝 y (14개) */
  bangs: number[];
  /** 옆머리가 내려오는 y (x<10, x>21) */
  side: number;
  /** 등 뒤로 늘어지는 머리 끝 y (0 = 없음) */
  back: number;
  /** 정수리 위로 삐친 머리 [x, 높이] */
  spikes?: [number, number][];
  curls?: boolean;
  tail?: boolean;
  wavy?: boolean;
  none?: boolean;
}

const HAIR: Record<HairStyle, HairDef> = {
  messy: { vol: 1, bangs: [12, 11, 9, 10, 9, 7, 9, 10, 8, 9, 7, 9, 11, 12], side: 13, back: 0, spikes: [[11, 1], [15, 2], [19, 1], [22, 1]] },
  neat: { vol: 0.5, bangs: [12, 10, 7, 6, 7, 8, 8, 9, 9, 9, 10, 10, 11, 12], side: 12, back: 0 },
  long: { vol: 1, bangs: [11, 10, 9, 8, 7, 6, 5, 5, 6, 7, 8, 9, 10, 11], side: 30, back: 29 },
  hime: { vol: 1, bangs: [12, 10, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 10, 12], side: 30, back: 30 },
  drills: { vol: 1.5, bangs: [11, 10, 9, 8, 9, 8, 7, 7, 8, 9, 8, 9, 10, 11], side: 13, back: 22, curls: true },
  buzz: { vol: -0.6, bangs: [9, 8, 7, 7, 6, 6, 6, 6, 6, 6, 7, 7, 8, 9], side: 10, back: 0 },
  bob: { vol: 1.5, bangs: [13, 10, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 10, 13], side: 19, back: 19 },
  shaggy: { vol: 1.5, bangs: [13, 12, 10, 11, 9, 10, 11, 12, 10, 9, 10, 9, 12, 13], side: 19, back: 21 },
  crew: { vol: 0, bangs: [10, 8, 7, 7, 7, 6, 6, 6, 6, 7, 7, 7, 8, 10], side: 11, back: 0 },
  bald: { vol: 0, bangs: [], side: 0, back: 0, none: true },
  ponytail: { vol: 0.5, bangs: [12, 10, 8, 7, 7, 8, 8, 9, 8, 8, 9, 9, 11, 12], side: 13, back: 0, tail: true },
  wavy: { vol: 1.5, bangs: [11, 10, 9, 8, 7, 7, 6, 6, 7, 7, 8, 9, 10, 11], side: 30, back: 30, wavy: true },
  wild: { vol: 2, bangs: [12, 11, 10, 11, 9, 8, 10, 11, 9, 10, 8, 10, 12, 13], side: 15, back: 0, spikes: [[10, 2], [13, 3], [17, 2], [20, 3], [23, 1]] },
};

export const HAIR_STYLES = Object.keys(HAIR) as HairStyle[];

// ---------------------------------------------------------------- 얼굴 틀

/** 얼굴 피부 영역: [y, x0, x1] */
const FACE: [number, number, number][] = [
  [5, 12, 19],
  [6, 11, 20],
  [7, 10, 21],
  [8, 10, 21],
  [9, 9, 22],
  [10, 9, 22],
  [11, 9, 22],
  [12, 9, 22],
  [13, 9, 22],
  [14, 9, 22],
  [15, 9, 22],
  [16, 9, 22],
  [17, 10, 21],
  [18, 10, 21],
  [19, 11, 20],
  [20, 12, 19],
  [21, 13, 18],
];
const faceRow = new Map(FACE.map(([y, a, b]) => [y, [a, b] as const]));
export const inFace = (x: number, y: number) => {
  const r = faceRow.get(y);
  return !!r && x >= r[0] && x <= r[1];
};

export function skinRamp(l: Look): Ramp {
  return RAMP[l.skin];
}

// ---------------------------------------------------------------- 그리기

export function drawPortrait(l: Look, mood: Mood = '', opts: { bg?: boolean } = {}): Pix {
  const out = new Pix(SIZE, SIZE);
  const acc = new Set(l.acc ?? []);
  const m: Mood = mood || l.rest || '';

  const sk = skinRamp(l);

  if (opts.bg !== false && l.bg) background(out, l.bg);

  const hood = acc.has('hood');
  const veil = acc.has('veil');
  const covered = hood || veil;

  // 1) 뒷머리 / 두건 뒤
  if (!covered) {
    const back = backHair(l);
    if (back) out.blit(back);
  } else out.blit(headwearBack(l));

  // 2) 몸
  out.blit(body(l));

  // 3) 머리(얼굴)
  out.blit(head(l));

  // 4) 이목구비
  face(out, l, m, acc, !mood && !!l.rest);

  // 5) 앞머리
  if (!covered) {
    const front = frontHair(l);
    if (front) {
      // 앞머리 바로 아래 이마에 그림자
      for (let x = 9; x <= 22; x++) {
        for (let y = 5; y < 13; y++) {
          if (front.opaque(x, y) && !front.opaque(x, y + 1) && inFace(x, y + 1) && out.get(x, y + 1) === sk[1]) {
            out.set(x, y + 1, bayer(x, y) < 10 ? sk[2] : sk[1]);
          }
        }
      }
      out.blit(front);
    }
  } else out.blit(headwearFront(l, out));

  // 6) 앞머리 위 장신구
  if (acc.has('circlet')) {
    for (let x = 9; x <= 22; x++) if (out.get(x, 7) !== CLEAR) out.set(x, 7, x % 2 ? C.gold1 : C.gold2);
    out.set(15, 7, C.red1);
    out.set(16, 7, C.red1);
    out.set(15, 6, C.gold0);
    out.set(16, 8, C.gold3);
  }
  if (acc.has('headband')) {
    for (let x = 8; x <= 23; x++) {
      out.set(x, 7, C.red1);
      out.set(x, 8, C.red2);
    }
    out.set(24, 8, C.red1);
    out.set(25, 9, C.red1);
    out.set(25, 10, C.red2);
    out.set(24, 9, C.red2);
  }
  if (acc.has('bandana')) bandana(out);
  if (acc.has('ribbon')) {
    const rb = [
      '.kk.kk.',
      'kppkppk',
      'kpPkPpk',
      '.kkPkk.',
      '..k.k..',
    ];
    out.sprite(19, 1, rb, { k: C.pink2, p: C.pink1, P: C.pink0 });
  }
  if (acc.has('elfEars') || acc.has('longEars')) out.blit(elfEars(l, acc.has('longEars')));
  if (m === '당황') {
    out.set(23, 10, C.sky0);
    out.set(23, 11, C.sky1);
    out.set(22, 11, C.sky0);
  }
  return out;
}

const mixHalf = (a: number, b: number) => {
  const ch = (s: number) => Math.round((((a >> s) & 255) * 2 + ((b >> s) & 255)) / 3);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

function background(p: Pix, [dark, light]: [number, number]) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - 12, y - 10) / 26;
      p.set(x, y, bayer(x, y) < (1 - d) * 18 ? mixHalf(light, dark) : dark);
    }
  }
}

// ---- 몸

function body(l: Look): Pix {
  const { neck, torso, cloth } = bodyParts(l);
  const sk = skinRamp(l);
  const p = new Pix(SIZE, SIZE);
  p.blit(neck);
  torso.outline(cloth[3]);
  p.blit(torso);
  p.outline(C.ink);
  // 목 테두리는 피부 외곽선
  const big = l.acc?.includes('big');
  const nx0 = big ? 12 : 13;
  const nx1 = big ? 19 : 18;
  for (let y = 20; y <= 23; y++) {
    if (p.get(nx0 - 1, y) === C.ink) p.set(nx0 - 1, y, sk[3]);
    if (p.get(nx1 + 1, y) === C.ink) p.set(nx1 + 1, y, sk[3]);
  }
  return p;
}

/** 목과 상체 (외곽선 없음) */
export function bodyParts(l: Look): { neck: Pix; torso: Pix; cloth: Ramp } {
  const p = new Pix(SIZE, SIZE);
  const sk = skinRamp(l);
  const big = l.acc?.includes('big');
  // 목
  const nx0 = big ? 12 : 13;
  const nx1 = big ? 19 : 18;
  for (let y = 20; y <= 25; y++) for (let x = nx0; x <= nx1; x++) p.set(x, y, x >= nx1 - 1 || y <= 22 ? sk[2] : sk[1]);
  // 어깨 실루엣
  const rows: [number, number, number][] = big
    ? [[24, 10, 21], [25, 6, 25], [26, 4, 27], [27, 3, 28], [28, 3, 28], [29, 2, 29], [30, 2, 29], [31, 2, 29]]
    : [[24, 11, 20], [25, 8, 23], [26, 6, 25], [27, 5, 26], [28, 5, 26], [29, 4, 27], [30, 4, 27], [31, 4, 27]];
  const cloth = RAMP[l.cloth ?? defaultCloth(l.outfit)];
  const torso = new Pix(SIZE, SIZE);
  for (const [y, a, b] of rows) {
    for (let x = a; x <= b; x++) {
      // 오른쪽 그림자, 왼쪽 어깨 윤기
      let c: number = cloth[1];
      if (x >= b - 2 || (x >= 21 && bayer(x, y) < 6)) c = cloth[2];
      if (y <= 27 && x <= a + 2 && x <= 10) c = cloth[0];
      torso.set(x, y, c);
    }
  }
  outfitDetail(torso, l, cloth, rows);
  return { neck: p, torso, cloth };
}

function defaultCloth(o: Outfit): RampName {
  return (
    {
      uniform: 'uniform',
      shabby: 'uniform',
      noble: 'cream',
      robe: 'violetCloth',
      labcoat: 'whiteCloth',
      habit: 'blackCloth',
      apron: 'orangeCloth',
      work: 'brownCloth',
      coat: 'grayCloth',
      cloak: 'blackCloth',
    } as const
  )[o];
}

function outfitDetail(p: Pix, l: Look, cloth: Ramp, rows: [number, number, number][]) {
  const trim = l.trim ?? C.gold1;
  const tie = l.tie ?? C.red1;
  const shirt = C.mist2;
  const vneck = (depth: number, fill: number) => {
    for (let i = 0; i <= depth; i++) {
      const y = 24 + i;
      const half = Math.max(0, 3 - Math.floor(i * 0.75));
      for (let x = 15 - half; x <= 16 + half; x++) p.set(x, y, fill);
    }
  };
  switch (l.outfit) {
    case 'uniform':
    case 'shabby': {
      vneck(4, shirt);
      // 깃
      p.line(12, 24, 14, 28, trim);
      p.line(19, 24, 17, 28, trim);
      if (l.outfit === 'uniform') {
        p.rect(15, 25, 2, 1, tie);
        p.rect(15, 26, 2, 6, tie);
        p.set(16, 27, darker(tie));
        p.set(16, 29, darker(tie));
      } else {
        p.rect(14, 27, 2, 5, tie);
        p.set(15, 28, darker(tie));
        p.set(13, 25, shirt);
        p.set(18, 25, shirt);
      }
      p.set(13, 30, C.gold1);
      break;
    }
    case 'noble': {
      vneck(2, C.mist2);
      p.rect(15, 24, 2, 2, C.red1);
      for (const [y, a, b] of rows) {
        if (y === 26 || y === 27) {
          p.hline(a + 1, a + 3, y, C.gold1);
          p.hline(b - 3, b - 1, y, C.gold1);
        }
      }
      p.vline(15, 26, 31, C.gold2);
      p.poly([[8, 26], [11, 26], [24, 32], [21, 32]], (x, y) => ((x + y) % 5 === 0 ? C.red2 : C.red1));
      break;
    }
    case 'robe': {
      for (let x = 12; x <= 19; x++) p.set(x, 24, cloth[0]);
      p.set(11, 25, cloth[0]);
      p.set(20, 25, cloth[0]);
      p.vline(15, 25, 31, C.gold1);
      p.vline(16, 25, 31, C.gold2);
      p.set(15, 27, C.teal1);
      p.set(16, 27, C.teal2);
      break;
    }
    case 'labcoat': {
      vneck(5, C.slate1);
      p.line(13, 24, 15, 30, C.mist1);
      p.line(18, 24, 16, 30, C.mist1);
      p.set(20, 29, C.wood1);
      p.set(21, 30, C.wood2);
      break;
    }
    case 'habit': {
      for (let y = 24; y <= 26; y++) {
        const half = y === 24 ? 4 : y === 25 ? 5 : 4;
        for (let x = 16 - half; x <= 15 + half; x++) p.set(x, y, y === 26 ? C.mist1 : C.white);
      }
      p.set(15, 28, C.gold1);
      p.set(16, 28, C.gold1);
      p.rect(15, 27, 2, 1, C.gold2);
      p.rect(14, 28, 4, 1, C.gold1);
      p.rect(15, 29, 2, 2, C.gold2);
      break;
    }
    case 'apron': {
      vneck(1, C.skin1);
      for (let y = 27; y <= 31; y++) for (let x = 11; x <= 20; x++) p.set(x, y, x >= 19 ? C.mist1 : C.white);
      p.line(11, 27, 9, 25, C.white);
      p.line(20, 27, 22, 25, C.mist1);
      p.set(15, 29, C.pink1);
      break;
    }
    case 'work': {
      for (let x = 13; x <= 18; x++) p.set(x, 24, cloth[2]);
      p.vline(11, 25, 31, C.wood3);
      p.vline(20, 25, 31, C.wood3);
      p.set(11, 28, C.gold2);
      p.set(20, 28, C.gold2);
      break;
    }
    case 'coat': {
      for (let y = 22; y <= 24; y++) for (let x = 12; x <= 19; x++) p.set(x, y, x >= 18 ? cloth[1] : cloth[0]);
      p.vline(15, 25, 31, cloth[2]);
      for (const y of [26, 28, 30]) p.set(16, y, C.mist2);
      break;
    }
    case 'cloak': {
      p.set(15, 25, C.gold1);
      p.set(16, 25, C.gold2);
      p.line(15, 26, 13, 31, cloth[2]);
      p.line(16, 26, 18, 31, cloth[2]);
      break;
    }
  }
}

function darker(c: number): number {
  const ch = (s: number) => Math.round(((c >> s) & 255) * 0.72);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ---- 얼굴

export function head(l: Look, ol = true): Pix {
  const p = new Pix(SIZE, SIZE);
  const sk = skinRamp(l);
  for (const [y, a, b] of FACE) {
    for (let x = a; x <= b; x++) {
      let c: number = sk[1];
      if (x >= b - 1 && y >= 9) c = x === b ? sk[2] : bayer(x, y) < 8 ? sk[2] : sk[1];
      if (y >= 19 && x >= b - 2) c = sk[2];
      if (x <= a + 1 && y >= 9 && y <= 16) c = x === a ? sk[1] : sk[0];
      p.set(x, y, c);
    }
  }
  // 귀
  for (let y = 13; y <= 16; y++) {
    p.set(8, y, sk[1]);
    p.set(23, y, sk[2]);
  }
  p.set(8, 14, sk[2]);
  p.set(23, 14, sk[3]);
  if (ol) p.outline(sk[3]);
  return p;
}

function face(p: Pix, l: Look, m: Mood, acc: Set<Acc>, gentle = false) {
  const sk = skinRamp(l);
  const eye = RAMP[l.eyes];
  const brow = RAMP[l.hairColor][3];
  const k = C.ink;

  // 눈썹
  const brows: Record<string, [number, number][]> = {
    '': [[11, 11], [12, 11], [13, 11]],
    웃음: [[11, 11], [12, 10], [13, 11]],
    화남: [[11, 10], [12, 11], [13, 12]],
    슬픔: [[11, 12], [12, 11], [13, 10]],
    놀람: [[11, 10], [12, 9], [13, 10]],
    당황: [[11, 11], [12, 11], [13, 10]],
    진지: [[11, 11], [12, 11], [13, 12]],
  };
  for (const [x, y] of brows[m] ?? brows['']) {
    p.set(x, y, brow);
    p.set(31 - x, y, brow);
  }

  // 눈 (왼쪽 눈 x=11..13, 오른쪽 눈 x=18..20, 바깥쪽이 흰자)
  const W = C.mist2;
  const H = C.white;
  const narrow = m === '진지' || ((m === '' || m === '화남') && (acc.has('sleepy') || acc.has('sharp')));
  const left = (cols: number[][]) => cols.forEach((row, j) => row.forEach((c, i) => c !== CLEAR && p.set(11 + i, 13 + j, c)));
  const right = (cols: number[][]) => cols.forEach((row, j) => row.forEach((c, i) => c !== CLEAR && p.set(18 + i, 13 + j, c)));
  if (m === '웃음') {
    for (const [x, y] of [[11, 14], [12, 13], [13, 14]]) {
      p.set(x, y, k);
      p.set(31 - x, y, k);
    }
  } else if (m === '놀람') {
    left([[k, k, k], [W, eye[1], W], [W, eye[2], W]]);
    right([[k, k, k], [W, eye[1], W], [W, eye[2], W]]);
  } else if (narrow) {
    left([[k, k, k], [W, H, eye[1]], [CLEAR, CLEAR, CLEAR]]);
    right([[k, k, k], [H, eye[1], W], [CLEAR, CLEAR, CLEAR]]);
    for (let x = 11; x <= 13; x++) p.set(x, 15, sk[1]);
    for (let x = 18; x <= 20; x++) p.set(x, 15, sk[1]);
    if (acc.has('sharp')) {
      p.set(10, 12, k);
      p.set(21, 12, k);
    }
  } else {
    left([[k, k, k], [W, H, eye[1]], [W, eye[2], eye[1]]]);
    right([[k, k, k], [H, eye[1], W], [eye[2], eye[1], W]]);
    if (m === '화남') {
      p.set(13, 13, k);
      p.set(18, 13, k);
      p.set(11, 13, sk[1]);
      p.set(20, 13, sk[1]);
    }
  }
  if (m === '슬픔') {
    p.set(11, 16, C.sky0);
    p.set(11, 17, C.sky1);
  }

  // 코
  p.set(16, 17, sk[2]);

  // 입
  const lipDark = sk[3];
  const mouths: Record<string, [number, number, number][]> = {
    '': [[15, 19, lipDark], [16, 19, lipDark]],
    웃음: [[14, 19, k], [15, 19, k], [16, 19, k], [17, 19, k], [15, 20, C.lip], [16, 20, C.lip]],
    화남: [[14, 20, lipDark], [15, 19, lipDark], [16, 19, lipDark], [17, 20, lipDark]],
    슬픔: [[14, 20, lipDark], [15, 19, lipDark], [16, 19, lipDark], [17, 20, lipDark]],
    놀람: [[15, 19, k], [16, 19, k], [15, 20, k], [16, 20, k]],
    당황: [[14, 19, lipDark], [15, 20, lipDark], [16, 19, lipDark], [17, 20, lipDark]],
    진지: [[14, 19, lipDark], [15, 19, lipDark], [16, 19, lipDark], [17, 19, lipDark]],
  };
  // 기본 표정이 미소인 사람
  const smileRest = (m === '' && l.rest === undefined && acc.has('blushy')) || (gentle && m === '웃음');
  for (const [x, y, c] of smileRest ? [[14, 19, lipDark], [15, 20, lipDark], [16, 20, lipDark], [17, 19, lipDark]] as [number, number, number][] : mouths[m] ?? mouths['']) {
    p.set(x, y, c);
  }

  // 볼
  if (m === '당황' || acc.has('blushy') || m === '웃음') {
    const lv = m === '당황' ? 12 : 6;
    for (const x of [10, 11, 12, 19, 20, 21]) for (const y of [16, 17]) if (bayer(x, y) < lv) p.set(x, y, C.blush);
  }

  if (acc.has('freckles')) for (const [x, y] of [[11, 16], [12, 17], [13, 16], [18, 16], [19, 17], [20, 16]]) p.set(x, y, sk[2]);
  if (acc.has('bags')) {
    for (let x = 11; x <= 13; x++) p.set(x, 16, sk[2]);
    for (let x = 18; x <= 20; x++) p.set(x, 16, sk[2]);
  }
  if (acc.has('mole')) p.set(19, 18, sk[3]);
  if (acc.has('stubble')) {
    for (let y = 19; y <= 21; y++) {
      for (let x = 11; x <= 20; x++) {
        if (inFace(x, y) && bayer(x, y) < (y - 18) * 3 && !(y <= 20 && x >= 14 && x <= 17)) p.set(x, y, sk[2]);
      }
    }
  }
  if (acc.has('scar')) {
    for (const [x, y] of [[20, 10], [20, 11], [21, 12], [19, 15], [20, 16], [21, 17]]) p.set(x, y, C.pink2);
  }
  if (acc.has('beard')) {
    const hr = RAMP[l.hairColor];
    const beard = new Pix(SIZE, SIZE);
    for (let x = 13; x <= 18; x++) beard.set(x, 18, hr[1]);
    beard.set(15, 18, sk[1]);
    beard.set(16, 18, sk[1]);
    const rows: [number, number, number][] = [[19, 11, 20], [20, 11, 20], [21, 11, 20], [22, 12, 19], [23, 12, 19], [24, 13, 18], [25, 13, 18], [26, 14, 17], [27, 14, 17], [28, 15, 16]];
    for (const [y, a, b] of rows) for (let x = a; x <= b; x++) beard.set(x, y, x >= b - 1 ? hr[2] : bayer(x, y) < 3 ? hr[0] : hr[1]);
    beard.set(15, 20, sk[3]);
    beard.set(16, 20, sk[3]);
    beard.outline(hr[3]);
    p.blit(beard);
  }
  if (acc.has('glasses')) {
    const g = C.slate0;
    for (const x0 of [10, 17]) {
      p.hline(x0, x0 + 4, 12, g);
      p.hline(x0, x0 + 4, 16, g);
      p.vline(x0, 12, 16, g);
      p.vline(x0 + 4, 12, 16, g);
    }
    p.set(15, 13, g);
    p.set(16, 13, g);
    p.set(9, 13, g);
    p.set(22, 13, g);
    p.set(13, 15, C.white);
    p.set(20, 15, C.white);
  }
  if (acc.has('earring')) {
    p.set(8, 17, C.gold1);
    p.set(23, 17, C.gold2);
  }
}

// ---- 머리카락

function hairMask(l: Look, ol = true): { front: Pix; back: Pix | null } | null {
  const d = HAIR[l.hair];
  if (d.none) return null;
  const r = RAMP[l.hairColor];
  const front = new Pix(SIZE, SIZE);
  const cx = 15.5;
  const cy = 9.5;
  const rx = 8 + d.vol;
  const ry = 7.5 + d.vol;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const inCap = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
      let ok = false;
      if (x >= 9 && x <= 22) ok = inCap && y <= d.bangs[x - 9];
      else ok = (inCap && y <= Math.max(9, d.side)) || (y > 9 && y <= d.side && sideLock(x, y, d));
      if (ok) front.set(x, y, r[1]);
    }
  }
  // 삐친 머리
  for (const [sx, hgt] of d.spikes ?? []) {
    let top = 0;
    while (top < SIZE && !front.opaque(sx, top)) top++;
    for (let i = 1; i <= hgt; i++) front.set(sx - (i > 1 ? 1 : 0), top - i, r[1]);
  }
  // 드릴
  if (d.curls) {
    for (const side of [0, 1]) {
      for (let k = 0; k < 4; k++) {
        const x = side ? 23.5 : 7.5;
        const y = 13 + k * 4;
        front.ellipse(x + (side ? 0.5 : -0.5) * (k % 2 ? 1 : -1), y, 2.6 - k * 0.25, 2.3, (px, py, dd) =>
          py >= y + 1 ? r[2] : dd < 0.35 && px <= x ? r[0] : r[1]);
      }
    }
  }
  // 물결
  if (d.wavy) {
    for (let y = 12; y <= d.side; y++) {
      const off = Math.round(Math.sin(y / 2) * 1);
      for (const x of [6 + off, 25 + off]) front.set(x, y, r[1]);
    }
  }

  let back: Pix | null = null;
  if (d.back) {
    back = new Pix(SIZE, SIZE);
    for (let y = 6; y <= d.back; y++) {
      const t = (y - 6) / Math.max(1, d.back - 6);
      const spread = 9 + Math.min(1.5, t * 4) - Math.max(0, t - 0.8) * 8;
      for (let x = Math.round(15.5 - spread); x <= Math.round(15.5 + spread); x++) {
        if (y === d.back && (x % 3 === 0)) continue;
        back.set(x, y, x >= 20 ? r[2] : r[1]);
      }
    }
    if (ol) back.outline(r[3]);
  }
  if (d.tail) {
    back = back ?? new Pix(SIZE, SIZE);
    back.ellipse(24.5, 8, 2.5, 2, r[1]);
    for (let y = 9; y <= 24; y++) {
      const x = 25 + Math.round(Math.sin(y / 3) * 1.2);
      const w = y > 20 ? 1 : 2;
      for (let i = -w; i <= w; i++) back.set(x + i, y, i > 0 ? r[2] : r[1]);
    }
    if (ol) back.outline(r[3]);
  }
  return { front, back };
}

function sideLock(x: number, y: number, d: HairDef): boolean {
  // 옆머리: 얼굴 양옆 2~3픽셀 폭, 아래로 갈수록 가늘어짐
  const long = d.side >= 20;
  const left = x <= 9;
  const inner = left ? 10 - x : x - 21;
  if (inner < 1) return false;
  const width = long ? (y > d.side - 3 ? 2 : 3) : y > d.side - 2 ? 1 : 2;
  return inner <= width;
}

function shadeHair(p: Pix, l: Look) {
  const r = RAMP[l.hairColor];
  const d = HAIR[l.hair];
  const base = r[1];
  p.map((c, x, y) => {
    if (c !== base) return c;
    // 오른쪽 그림자
    if (x >= 20 && bayer(x, y) < (x - 18) * 4) return r[2];
    // 앞머리 끝 (가닥)
    if (x >= 9 && x <= 22 && y >= d.bangs[x - 9] - 1 && y >= 6) return r[2];
    // 옆머리 안쪽
    if ((x === 9 || x === 22) && y >= 10) return r[2];
    // 윤기 (왼쪽 위 호)
    const band = y - (3.4 + (x - 12.5) ** 2 * 0.12) - (d.vol < 0 ? 1 : 0);
    if (x >= 9 && x <= 17 && band >= 0 && band < 1.2) return r[0];
    return c;
  });
  // 가닥 사이 홈
  if (!d.none) {
    for (let x = 10; x <= 21; x++) {
      const b = d.bangs[x - 9];
      if (b < d.bangs[x - 10] && b < d.bangs[x - 8]) {
        p.paint(x, b - 1, r[2]);
        p.paint(x, b - 2, r[2]);
      }
    }
  }
}

function backHair(l: Look): Pix | null {
  const m = hairMask(l);
  if (!m?.back) return null;
  return m.back;
}

/** 뒷머리 (외곽선 없음) */
export function backHairRaw(l: Look): Pix | null {
  return hairMask(l, false)?.back ?? null;
}

/** 앞머리 (명암만, 외곽선 없음) */
export function frontHairRaw(l: Look): Pix | null {
  const m = hairMask(l, false);
  if (!m) return null;
  shadeHair(m.front, l);
  return m.front;
}

/** x=9..22 열의 앞머리 끝 y (32 기준) */
export function bangsOf(l: Look): number[] {
  return HAIR[l.hair].bangs;
}

function frontHair(l: Look): Pix | null {
  const m = hairMask(l);
  if (!m) return null;
  shadeHair(m.front, l);
  m.front.outline(RAMP[l.hairColor][3]);
  // 얼굴 위로 떨어지는 외곽선은 조금 부드럽게
  return m.front;
}

// ---- 머리에 쓰는 것

export function headwearBack(l: Look, ol = true): Pix {
  const p = new Pix(SIZE, SIZE);
  const hood = l.acc?.includes('hood');
  const cl = RAMP[hood ? (l.cloth ?? 'blackCloth') : 'blackCloth'];
  for (let y = 3; y <= 30; y++) {
    const t = (y - 3) / 27;
    const spread = hood ? 10 + t * 2 : 9.5 + t * 3;
    for (let x = Math.round(15.5 - spread); x <= Math.round(15.5 + spread); x++) {
      const dy = (y + 0.5 - 11) / 9;
      const dx = (x + 0.5 - 15.5) / 11;
      if (y < 11 && dx * dx + dy * dy > 1) continue;
      p.set(x, y, x >= 21 ? cl[2] : cl[1]);
    }
  }
  if (ol) p.outline(cl[3]);
  return p;
}

export function headwearFront(l: Look, under: Pix, ol = true): Pix {
  const p = new Pix(SIZE, SIZE);
  const hood = l.acc?.includes('hood');
  const cl = RAMP[hood ? (l.cloth ?? 'blackCloth') : 'blackCloth'];
  const sk = skinRamp(l);
  // 위쪽 덮개
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (x + 0.5 - 15.5) / 10.5;
      const dy = (y + 0.5 - 10) / 8.5;
      const inCap = dx * dx + dy * dy <= 1;
      const top = hood ? 9 : 7;
      const sideBand = (x <= 9 || x >= 22) && y <= (hood ? 24 : 26) && y >= 7 && (x >= 6 && x <= 25);
      if ((inCap && y <= top) || sideBand) p.set(x, y, x >= 21 ? cl[2] : y < 4 && x < 15 ? cl[0] : cl[1]);
    }
  }
  if (!hood) {
    // 수녀 베일의 흰 띠
    for (let x = 9; x <= 22; x++) p.set(x, 7, C.white);
    for (let x = 9; x <= 22; x++) p.set(x, 8, x >= 20 ? C.mist1 : C.mist2);
  } else {
    // 두건 그늘: 얼굴 윗부분을 어둡게, 눈만 빛난다
    for (let y = 9; y <= 15; y++) {
      for (let x = 9; x <= 22; x++) {
        if (!inFace(x, y)) continue;
        const c = under.get(x, y);
        if (c === CLEAR) continue;
        if (y <= 11) p.set(x, y, cl[3]);
        else if (y === 12) p.set(x, y, bayer(x, y) < 10 ? cl[3] : sk[3]);
        else if (bayer(x, y) < (15 - y) * 4) p.set(x, y, sk[2]);
      }
    }
    for (const x of [12, 19]) p.set(x, 14, C.gold1);
  }
  if (ol) p.outline(cl[3]);
  return p;
}

export function bandana(p: Pix) {
  for (let y = 1; y <= 7; y++) {
    for (let x = 7; x <= 24; x++) {
      const dx = (x + 0.5 - 15.5) / 9;
      const dy = (y + 0.5 - 8) / 6.5;
      if (dx * dx + dy * dy <= 1) p.set(x, y, (x + y) % 4 === 0 ? C.white : x >= 21 ? C.red2 : C.red1);
    }
  }
  for (let x = 8; x <= 23; x++) p.set(x, 7, C.red2);
  p.set(24, 5, C.red1);
  p.set(25, 4, C.red1);
  p.set(25, 6, C.red2);
  p.set(26, 5, C.red2);
}

export function elfEars(l: Look, long: boolean, ol = true): Pix {
  const p = new Pix(SIZE, SIZE);
  const sk = skinRamp(l);
  const pts: [number, number][] = long
    ? [[3, 8], [3, 9], [4, 9], [4, 10], [5, 10], [5, 11], [6, 11], [6, 12], [7, 12], [7, 13], [8, 13], [7, 14], [8, 14], [8, 15]]
    : [[6, 11], [6, 12], [7, 12], [7, 13], [8, 13], [7, 14], [8, 14], [8, 15]];
  for (const [x, y] of pts) {
    p.set(x, y, sk[1]);
    p.set(31 - x, y, sk[2]);
  }
  p.set(long ? 6 : 7, long ? 12 : 13, sk[2]);
  if (ol) p.outline(sk[3]);
  // 얼굴 쪽 외곽선은 지운다 (머리카락 위에만 그려지도록)
  for (let y = 0; y < SIZE; y++) for (let x = 9; x <= 22; x++) p.set(x, y, CLEAR);
  return p;
}
