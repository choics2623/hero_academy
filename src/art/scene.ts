// 삽화 목록과 그리기 진입점.
import { RAMP } from './palette';
import { Pix } from './pixel';
import { CORE_SCENES, H, W, ambient, clouds, ridge, sky, stars, type SceneFn, type Tod } from './scenes';
import { MORE_SCENES } from './scenes_more';

export const SCENES: Record<string, SceneFn> = { ...CORE_SCENES, ...MORE_SCENES };

export function drawScene(id: string, tod: Tod | string = 'day'): Pix {
  const p = new Pix(W, H);
  const fn = SCENES[id];
  const t = (['dawn', 'day', 'dusk', 'night'].includes(tod) ? tod : 'day') as Tod;
  if (!fn) {
    placeholder(p, id, t);
    return p;
  }
  fn(p, t);
  return p;
}

/** 아직 그리지 않은 삽화: 하늘과 언덕 */
function placeholder(p: Pix, id: string, tod: Tod) {
  let seed = 0;
  for (const ch of id) seed = seed * 31 + ch.charCodeAt(0);
  sky(p, tod);
  if (tod === 'night') stars(p, seed, 60, 60);
  clouds(p, seed, tod, 40, 3);
  ridge(p, seed, 70, 14, RAMP.greenCloth[2], 26);
  ridge(p, seed + 1, 82, 10, RAMP.greenCloth[3], 16);
  ambient(p, tod, 0.6);
}
