// 64×64 흉상 (무대와 CG용). 지금은 32×32 초상화를 Scale2x로 키운 것 — 고해상도 버전으로 바꿀 자리.

import { CAST, playerLook, type PlayerLook } from './cast';
import { scale2x, type Pix } from './pixel';
import { drawPortrait, type Look, type Mood } from './portrait';

export const BUST = 64;

export function drawBust(look: Look, mood: Mood | string = ''): Pix {
  return scale2x(drawPortrait(look, mood as Mood, { bg: false }));
}

/** CG용: 캐릭터 id 또는 '나' → 흉상 */
export function bustResolver(player?: { look?: PlayerLook; origin: string }) {
  return (who: string, mood: string): Pix | null => {
    if (who === '나' || who === 'me') return player ? drawBust(playerLook(player.look, player.origin), mood) : null;
    const l = CAST[who];
    return l ? drawBust(l, mood) : null;
  };
}
