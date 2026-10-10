// 64×64 흉상 (무대와 CG용).
// 32×32 초상화의 부품(머리 모양·옷·얼굴 틀)을 외곽선 없이 만들어 Scale2x로 매끈하게 키운 뒤,
// 64 해상도에서 외곽선을 1픽셀로 다시 두르고, 눈·눈썹·입·볼·머리 윤기는 64 해상도로 새로 그린다.
// 프레임: 기본 / 눈 감음(깜빡임) / 입 벌림(말하기)

import { CAST, enemyArt, enemyAs, extraLook, playerLook, type PlayerLook } from './cast';
import { C, RAMP, type Ramp } from './palette';
import { CLEAR, Pix, bayer, rng, hash, scale2x } from './pixel';
import {
  backHairRaw, bandana, bodyParts, bangsOf, elfEars, frontHairRaw, head, headwearBack, headwearFront, inFace, skinRamp,
  type Look, type Mood,
} from './portrait';

export const BUST = 64;
export type Frame = 'base' | 'blink' | 'talk';

const S = 64;

function up(p: Pix): Pix {
  return scale2x(p);
}

/** 64 해상도에서 1픽셀 외곽선 (투명한 곳에만) */
function outline1(p: Pix, c: number) {
  return p.outline(c);
}

export function drawBust(look: Look, mood: Mood | string = '', frame: Frame = 'base'): Pix {
  const out = new Pix(S, S);
  const l = look;
  const acc = new Set(l.acc ?? []);
  const m = ((mood || l.rest || '') as Mood);
  const gentle = !mood && !!l.rest;
  const sk = skinRamp(l);
  const hr = RAMP[l.hairColor];
  const hood = acc.has('hood');
  const veil = acc.has('veil');
  const covered = hood || veil;

  // 1) 뒷머리 / 두건 뒤
  const back32 = covered ? headwearBack(l, false) : backHairRaw(l);
  if (back32) {
    const b = up(back32);
    outline1(b, covered ? RAMP.blackCloth[3] : hr[3]);
    out.blit(b);
  }

  // 2) 몸: 목 → 상체
  const { neck, torso, cloth } = bodyParts(l);
  const n = up(neck);
  outline1(n, sk[3]);
  out.blit(n);
  const t = up(torso);
  outline1(t, cloth[3]);
  out.blit(t);

  // 3) 얼굴
  const h = up(head(l, false));
  outline1(h, sk[3]);
  // 목과 맞닿는 턱 아래에 그늘
  out.blit(h);
  for (let x = 24; x <= 39; x++) {
    if (n.get(x, 44) !== CLEAR && out.get(x, 44) !== sk[3]) out.set(x, 44, sk[2]);
    if (n.get(x, 45) !== CLEAR && bayer(x, 45) < 8) out.set(x, 45, sk[2]);
  }
  // 볼 윤곽을 살짝 밝게 (왼쪽에서 빛)
  for (let y = 20; y <= 34; y++) {
    for (let x = 18; x <= 22; x++) {
      if (out.get(x, y) === sk[1] && out.get(x - 1, y) === sk[3] && bayer(x, y) < 6) out.set(x, y, sk[0]);
    }
  }

  // 4) 이목구비 (64 해상도)
  face64(out, l, m, acc, frame, gentle);

  // 5) 앞머리 / 두건 앞
  if (!covered) {
    const f32 = frontHairRaw(l);
    if (f32) {
      const f = up(f32);
      hairDetail(f, l);
      // 앞머리 아래 이마 그늘 (2줄)
      for (let x = 16; x <= 47; x++) {
        for (let y = 8; y < 30; y++) {
          if (f.opaque(x, y) && !f.opaque(x, y + 1)) {
            for (const dy of [1, 2]) {
              const c = out.get(x, y + dy);
              if ((c === sk[1] || c === sk[0]) && (dy === 1 || bayer(x, y + dy) < 8)) out.set(x, y + dy, sk[2]);
            }
          }
        }
      }
      outline1(f, hr[3]);
      out.blit(f);
    }
  } else {
    const w = up(headwearFront(l, new Pix(32, 32).blit(head(l, false)), false));
    outline1(w, RAMP.blackCloth[3]);
    out.blit(w);
    if (hood) {
      // 두건 그늘: 위에서 아래로 짙어지다 옅어진다. 그늘 속에서 눈만 빛난다
      for (let y = 16; y <= 34; y++) {
        for (let x = 18; x <= 45; x++) {
          const c = out.get(x, y);
          if (c === CLEAR || !inFace(x >> 1, y >> 1)) continue;
          if (y <= 25) out.set(x, y, C.night0);
          else if (y <= 28) out.set(x, y, sk[3]);
          else if (y <= 31 && (c === sk[1] || c === sk[0])) out.set(x, y, sk[2]);
        }
      }
      for (const [x, y, c] of [[22, 28, C.gold1], [23, 28, C.gold1], [24, 28, C.gold2], [22, 27, C.gold0], [39, 28, C.gold1], [40, 28, C.gold1], [41, 28, C.gold2], [39, 27, C.gold0]] as [number, number, number][]) out.set(x, y, c);
    }
  }

  // 6) 머리 위 장신구와 귀
  const top = new Pix(32, 32);
  if (acc.has('circlet')) {
    for (let x = 9; x <= 22; x++) top.set(x, 7, x % 2 ? C.gold1 : C.gold2);
  }
  if (acc.has('headband')) {
    for (let x = 8; x <= 23; x++) {
      top.set(x, 7, C.red1);
      top.set(x, 8, C.red2);
    }
    top.set(24, 8, C.red1);
    top.set(25, 9, C.red1);
    top.set(25, 10, C.red2);
    top.set(24, 9, C.red2);
  }
  if (acc.has('bandana')) bandana(top);
  if (acc.has('ribbon')) {
    top.sprite(19, 1, ['.kk.kk.', 'kppkppk', 'kpPkPpk', '.kkPkk.', '..k.k..'], { k: C.pink2, p: C.pink1, P: C.pink0 });
  }
  if (top.data.some((c) => c !== CLEAR)) {
    const tp = up(top);
    // 머리띠·서클릿은 머리카락이나 얼굴 위에만
    tp.map((c, x, y) => (out.get(x, y) === CLEAR && !acc.has('ribbon') && !acc.has('bandana') ? CLEAR : c));
    out.blit(tp);
    if (acc.has('circlet')) {
      for (const [x, y, c] of [[31, 14, C.red1], [32, 14, C.red1], [31, 15, C.red2], [32, 15, C.red2], [31, 13, C.gold0], [32, 13, C.gold0], [30, 14, C.gold0], [33, 15, C.gold3]] as [number, number, number][]) {
        out.set(x, y, c);
      }
    }
  }
  if (acc.has('elfEars') || acc.has('longEars')) {
    const e = up(elfEars(l, acc.has('longEars'), false));
    // 얼굴 쪽으로는 그리지 않는다
    for (let y = 0; y < S; y++) for (let x = 18; x <= 45; x++) e.set(x, y, CLEAR);
    outline1(e, sk[3]);
    for (let y = 0; y < S; y++) for (let x = 18; x <= 45; x++) e.set(x, y, CLEAR);
    out.blit(e);
  }
  if (m === '당황') {
    out.sprite(45, 18, ['.s.', 'sbs', 'sbs', '.s.'], { s: C.sky0, b: C.sky1 });
  }
  return out;
}

// ---------------------------------------------------------------- 머리카락 디테일

function hairDetail(f: Pix, l: Look) {
  const r = RAMP[l.hairColor];
  const bangs = bangsOf(l);
  const rand = rng(hash(l.hair + l.hairColor));
  // 가닥 선: 앞머리 끝에서 정수리 쪽으로 가는 어두운 선
  if (bangs.length) {
    for (let i = 1; i < bangs.length - 1; i++) {
      const tip = bangs[i];
      const isTip = tip >= bangs[i - 1] && tip >= bangs[i + 1];
      const isGap = tip < bangs[i - 1] && tip < bangs[i + 1];
      const x0 = (9 + i) * 2 + (isTip ? 1 : 0);
      if (!isTip && !isGap && rand() < 0.5) continue;
      const len = 5 + Math.floor(rand() * 6);
      const yTip = tip * 2 + 1;
      for (let k = 0; k < len; k++) {
        const x = x0 + Math.round((k * (x0 < 32 ? 1 : -1)) / 5);
        const y = yTip - k;
        if (f.get(x, y) !== CLEAR && f.get(x, y) !== r[0]) f.set(x, y, r[2]);
      }
    }
  }
  // 윤기 고리 (천사의 고리): 정수리 아래 띠. 가운데는 두껍고 양끝은 가늘게 들쭉날쭉
  let top = 0;
  while (top < S && ![...Array(S).keys()].some((x) => f.opaque(x, top))) top++;
  for (let x = 15; x <= 40; x++) {
    const yc = top + 8 + Math.round(((x - 27) / 9) ** 2 * 1.6);
    const mid = 1 - Math.abs(x - 27) / 13;
    const len = Math.max(1, Math.round(mid * 3 + (rand() < 0.3 ? 1 : 0)));
    for (let k = 0; k < len; k++) {
      const y = yc + k;
      const c = f.get(x, y);
      if (c === CLEAR || c === r[2]) continue;
      f.set(x, y, r[0]);
    }
  }
}

// ---------------------------------------------------------------- 얼굴 (64)

// 눈 격자 (9×9): 왼쪽 눈 기준 (바깥쪽 = 왼쪽). 오른쪽 눈은 좌우를 뒤집되, 홍채 무늬는 그대로 둬서 하이라이트가 왼쪽 위에 남는다.
// k 속눈썹, w 흰자, d 홍채 어두움, m 홍채, l 홍채 밝음, p 동공, h 하이라이트, q 아래 눈꺼풀(피부 그림자)
const EYE_OPEN = [
  'k........',
  'kkkkkkkk.',
  'kkddddddk',
  'kwdhhdddw',
  '.wdhhpddw',
  '.wmdppdmw',
  '.wmmmmmmw',
  '..kmllmk.',
  '...qqqq..',
];
const EYE_SURPRISED = [
  '.........',
  '.kkkkkkk.',
  'kwwwwwwwk',
  'kwwdddwwk',
  'kwwhpdwwk',
  'kwwdpdwwk',
  'kwwwdwwwk',
  '.wwwwwww.',
  '..qqqqq..',
];
const EYE_NARROW = [
  '.........',
  '.........',
  'k........',
  'kkkkkkkk.',
  '.kkkkkkkk',
  '.wdhhpdmw',
  '.wmllllmw',
  '..qqqqq..',
  '.........',
];
const EYE_CLOSED = [
  '.........',
  '.........',
  '.........',
  '.........',
  'k........',
  'kkkkkkkkk',
  '.qqqqqqq.',
  '.........',
  '.........',
];
const EYE_HAPPY = [
  '.........',
  '.........',
  '..kkkkk..',
  '.kk...kk.',
  'kk.....kk',
  'q.......q',
  '.........',
  '.........',
  '.........',
];

const IRIS = /[dmlhp]+/;

function mirrorRow(row: string): string {
  const r = [...row].reverse().join('');
  const m = IRIS.exec(r);
  if (!m) return r;
  return r.slice(0, m.index) + [...m[0]].reverse().join('') + r.slice(m.index + m[0].length);
}

function eye(p: Pix, x0: number, y0: number, grid: string[], right: boolean, iris: Ramp, sk: Ramp) {
  const pal: Record<string, number> = {
    k: C.ink, w: C.white, d: iris[2], m: iris[1], l: iris[0], p: iris[3] === C.ink ? C.ink : iris[3], h: C.white, q: sk[2],
  };
  grid.forEach((row0, j) => {
    const row = right ? mirrorRow(row0) : row0;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      p.set(x0 + i, y0 + j, pal[ch]);
    }
  });
}

function face64(p: Pix, l: Look, m: Mood, acc: Set<string>, frame: Frame, gentle: boolean) {
  const sk = skinRamp(l);
  const iris = RAMP[l.eyes];
  const brow = RAMP[l.hairColor][3];
  const LX = 19; // 왼쪽 눈 x
  const RX = 36; // 오른쪽 눈 x
  const EY = 23; // 눈 y

  // 눈썹 (두께 2, 안쪽이 두꺼움)
  const browLine = (x0: number, y0: number, x1: number, y1: number) => {
    p.line(x0, y0, x1, y1, brow);
    p.line(x0 + 1, y0 + 1, x1, y1 + 1, brow);
  };
  const bY = { '': [20, 19], 웃음: [19, 18], 화남: [18, 21], 슬픔: [21, 18], 놀람: [17, 16], 당황: [20, 18], 진지: [20, 20] }[m] ?? [20, 19];
  // 왼쪽 눈썹: 바깥(왼) → 안(오)
  browLine(LX, bY[0], LX + 7, bY[1]);
  // 오른쪽 눈썹: 안(왼) → 바깥(오)
  browLine(RX + 1, bY[1], RX + 8, bY[0]);

  // 눈
  const sleepy = acc.has('sleepy') || acc.has('sharp');
  let grid = EYE_OPEN;
  if (frame === 'blink') grid = EYE_CLOSED;
  else if (m === '웃음' && !gentle) grid = EYE_HAPPY;
  else if (m === '놀람') grid = EYE_SURPRISED;
  else if (m === '진지' || (sleepy && (m === '' || m === '화남'))) grid = EYE_NARROW;
  eye(p, LX, EY, grid, false, iris, sk);
  eye(p, RX, EY, grid, true, iris, sk);
  if (acc.has('sharp') && grid !== EYE_CLOSED && grid !== EYE_HAPPY) {
    p.set(LX - 1, EY + (grid === EYE_NARROW ? 2 : 0), C.ink);
    p.set(RX + 9, EY + (grid === EYE_NARROW ? 2 : 0), C.ink);
  }
  if (m === '화남' && grid === EYE_OPEN) {
    // 미간 쪽 눈꺼풀을 눌러 내린다
    for (const [x, y] of [[LX + 6, EY + 2], [LX + 7, EY + 2], [LX + 7, EY + 3], [RX + 1, EY + 2], [RX + 2, EY + 2], [RX + 1, EY + 3]]) p.set(x, y, C.ink);
  }
  if (m === '슬픔' && frame !== 'blink') {
    p.set(LX + 1, EY + 8, C.sky0);
    p.set(LX + 1, EY + 9, C.sky1);
    p.set(LX + 1, EY + 10, C.sky0);
  }

  // 볼
  const blushy = m === '당황' || m === '웃음' || acc.has('blushy');
  if (blushy) {
    for (const cx of [LX + 3, RX + 4]) {
      for (let x = cx - 4; x <= cx + 4; x++) for (let y = 33; y <= 35; y++) if (bayer(x, y) < (m === '당황' ? 9 : 5)) p.paint(x, y, C.blush);
      for (const dx of [-3, 0, 3]) {
        p.set(cx + dx, 35, C.pink1);
        p.set(cx + dx + 1, 34, C.pink1);
      }
    }
  }

  // 코
  p.set(33, 33, sk[2]);
  p.set(33, 34, sk[2]);
  p.set(32, 35, sk[2]);

  // 입
  const lip = sk[3];
  const talk = frame === 'talk';
  const mouth: [number, number, number][] = [];
  const add = (pts: [number, number][], c: number) => pts.forEach(([x, y]) => mouth.push([x, y, c]));
  if (talk) {
    add([[30, 38], [31, 38], [32, 38], [33, 38], [29, 39], [34, 39], [29, 40], [34, 40], [30, 41], [31, 41], [32, 41], [33, 41]], C.ink);
    add([[30, 39], [31, 39], [32, 39], [33, 39], [30, 40], [33, 40]], C.red2);
    add([[31, 40], [32, 40]], C.pink1);
  } else if (m === '웃음' && !gentle) {
    add([[28, 38], [29, 38], [30, 38], [31, 38], [32, 38], [33, 38], [34, 38], [35, 38], [29, 39], [34, 39], [30, 40], [33, 40], [31, 41], [32, 41]], C.ink);
    add([[30, 39], [31, 39], [32, 39], [33, 39], [31, 40], [32, 40]], C.red2);
    add([[31, 40], [32, 40]], C.pink1);
  } else if (m === '화남') {
    add([[28, 39], [29, 38], [30, 38], [31, 38], [32, 38], [33, 38], [34, 38], [35, 39], [29, 40], [30, 40], [31, 40], [32, 40], [33, 40], [34, 40]], C.ink);
    add([[30, 39], [31, 39], [32, 39], [33, 39]], C.white);
  } else if (m === '놀람') {
    add([[31, 37], [32, 37], [30, 38], [33, 38], [30, 39], [33, 39], [30, 40], [33, 40], [31, 41], [32, 41]], C.ink);
    add([[31, 38], [32, 38], [31, 39], [32, 39], [31, 40], [32, 40]], C.red2);
  } else if (m === '슬픔') {
    add([[29, 40], [30, 39], [31, 39], [32, 39], [33, 39], [34, 40]], lip);
  } else if (m === '당황') {
    add([[28, 39], [29, 38], [30, 39], [31, 40], [32, 39], [33, 38], [34, 39], [35, 40]], lip);
  } else if (m === '진지') {
    add([[29, 39], [30, 39], [31, 39], [32, 39], [33, 39], [34, 39]], lip);
  } else if (gentle || acc.has('blushy') || m === '웃음') {
    add([[29, 38], [30, 39], [31, 39], [32, 39], [33, 39], [34, 38]], lip);
  } else {
    add([[30, 39], [31, 39], [32, 39], [33, 39]], lip);
    add([[31, 40], [32, 40]], sk[2]);
  }
  for (const [x, y, c] of mouth) p.set(x, y, c);

  // 장신구 (얼굴)
  if (acc.has('freckles')) for (const [x, y] of [[21, 34], [23, 35], [25, 34], [38, 34], [40, 35], [42, 34]]) p.set(x, y, sk[2]);
  if (acc.has('bags')) {
    for (let x = LX + 2; x <= LX + 7; x++) p.set(x, EY + 9, sk[2]);
    for (let x = RX + 1; x <= RX + 6; x++) p.set(x, EY + 9, sk[2]);
  }
  if (acc.has('mole')) p.set(39, 37, sk[3]);
  if (acc.has('stubble')) {
    for (let y = 37; y <= 43; y++) {
      for (let x = 21; x <= 42; x++) {
        if (inFace(x >> 1, y >> 1) && bayer(x, y) < (y - 36) * 1.6 && !(y <= 41 && x >= 28 && x <= 35)) p.paint(x, y, sk[2]);
      }
    }
  }
  if (acc.has('scar')) {
    p.line(40, 19, 44, 35, C.pink2);
    p.line(41, 19, 45, 35, C.pink1);
  }
  if (acc.has('beard')) {
    const hr = RAMP[l.hairColor];
    const b = new Pix(S, S);
    // 콧수염
    for (let x = 26; x <= 37; x++) b.set(x, 36 + (Math.abs(x - 31.5) > 4 ? 1 : 0), hr[1]);
    // 턱수염
    for (let y = 38; y <= 58; y++) {
      const half = Math.max(1, Math.round(10 - (y - 38) * 0.45));
      for (let x = 32 - half; x <= 31 + half; x++) {
        const strand = (x + Math.floor(y / 5)) % 4 === 0;
        b.set(x, y, x >= 31 + half - 2 ? hr[2] : strand ? hr[2] : x < 30 ? hr[0] : hr[1]);
      }
    }
    for (let x = 30; x <= 33; x++) b.set(x, 39, C.ink);
    outline1(b, hr[3]);
    p.blit(b);
  }
  if (acc.has('glasses')) {
    const g = C.slate0;
    for (const x0 of [LX - 1, RX - 1]) {
      p.hline(x0, x0 + 10, EY, g);
      p.hline(x0, x0 + 10, EY + 9, g);
      p.vline(x0, EY, EY + 9, g);
      p.vline(x0 + 10, EY, EY + 9, g);
      p.set(x0 + 8, EY + 2, C.white);
      p.set(x0 + 9, EY + 3, C.white);
    }
    p.hline(LX + 10, RX - 1, EY + 2, g);
  }
  if (acc.has('earring')) {
    p.set(16, 34, C.gold1);
    p.set(16, 35, C.gold2);
    p.set(47, 34, C.gold1);
    p.set(47, 35, C.gold2);
  }
}

/** 전투 무대의 적 (64×64, 배경 없음) */
export function enemyBust(id: string, name: string, frame: Frame = 'base'): Pix {
  const as = enemyAs(id);
  if (as && CAST[as[0]]) return drawBust(CAST[as[0]], as[1], frame);
  if (id === 'rats' || id === 'cult_shadow') return scale2x(enemyArt(id, name, true));
  const l = extraLook(name);
  return drawBust({ ...l, acc: [...(l.acc ?? []), id === 't_prelim' ? 'big' : 'sharp'] }, '화남', frame);
}

/** 이름만 있는 엑스트라의 흉상 */
export function extraBust(name: string, mood = '', frame: Frame = 'base'): Pix {
  return drawBust(extraLook(name), mood, frame);
}

/** CG와 무대용: 캐릭터 id 또는 '나' → 흉상 */
export function bustResolver(player?: { look?: PlayerLook; origin: string }) {
  return (who: string, mood: string, frame: Frame = 'base'): Pix | null => {
    if (who === '나' || who === 'me') return player ? drawBust(playerLook(player.look, player.origin), mood, frame) : null;
    const l = CAST[who];
    return l ? drawBust(l, mood, frame) : null;
  };
}

/** 세 프레임(기본·깜빡임·말하기)을 가로로 붙인 스프라이트 */
export function bustSheet(look: Look, mood: Mood | string = ''): Pix {
  const sheet = new Pix(S * 3, S);
  (['base', 'blink', 'talk'] as Frame[]).forEach((f, i) => sheet.blit(drawBust(look, mood, f), i * S, 0));
  return sheet;
}

/** 적의 3프레임 스프라이트 */
export function enemySheet(id: string, name: string): Pix {
  const sheet = new Pix(S * 3, S);
  (['base', 'blink', 'talk'] as Frame[]).forEach((f, i) => sheet.blit(enemyBust(id, name, f), i * S, 0));
  return sheet;
}
