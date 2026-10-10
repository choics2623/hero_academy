// 화면에 도트 그림을 붙이는 도우미: 초상화, 아이콘, 삽화.

import { drawIcon, drawPortrait, drawScene, enemyArt, type Look, type Mood, type Tod } from '../art';
import { artUrl, pixImg } from './art';

export function portraitImg(key: string, look: Look, mood: Mood | string = '', scale = 2, cls = ''): HTMLImageElement {
  const m = (mood || '') as Mood;
  return pixImg(`pt:${key}:${m}`, () => drawPortrait(look, m), { w: 32, h: 32 }, scale, `portrait ${cls}`.trim());
}

export function enemyImg(id: string, name: string, scale = 2, cls = ''): HTMLImageElement {
  return pixImg(`enemy:${id}`, () => enemyArt(id, name), { w: 32, h: 32 }, scale, `portrait ${cls}`.trim());
}

export function iconImg(id: string, scale = 1, cls = ''): HTMLImageElement {
  return pixImg(`icon:${id}`, () => drawIcon(id), { w: 16, h: 16 }, scale, `icon ${cls}`.trim());
}

export function iconUrl(id: string): string {
  return artUrl(`icon:${id}`, () => drawIcon(id));
}

export function sceneImg(id: string, tod: Tod | string, cls = '', alt = ''): HTMLImageElement {
  return pixImg(`scene:${id}:${tod}`, () => drawScene(id, tod), { w: 160, h: 90 }, 4, `scene-art ${cls}`.trim(), alt);
}
