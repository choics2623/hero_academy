import { describe, expect, it } from 'vitest';
import { ACTIVITY_ICON, CAST, FX, ICONS, INTENT_ICON, SCENES, STAT_ICON, bustResolver, drawCG, drawIcon, drawPortrait, drawScene, enemyArt, extraLook } from '../src/art';
import { INTENTS } from '../src/engine';
import { loadContent } from '../src/engine/load';

const content = loadContent('content');
const MOODS = ['', '웃음', '화남', '슬픔', '놀람', '당황', '진지'] as const;

describe('도트 그림', () => {
  it('art.yaml의 모든 삽화가 그려져 있다', () => {
    const missing = [...content.art.values()].filter((a) => !a.bg && !SCENES[a.id]).map((a) => a.id);
    expect(missing).toEqual([]);
  });

  it('CG는 그려진 배경, 있는 인물, 아는 효과만 쓴다', () => {
    const bust = bustResolver({ origin: '평민장학생' });
    for (const a of content.art.values()) {
      if (!a.bg) continue;
      expect(SCENES[a.bg], `${a.id}: 배경 ${a.bg}`).toBeTruthy();
      expect(content.art.get(a.bg)?.bg, `${a.id}: 배경이 또 CG`).toBeUndefined();
      for (const c of a.cast ?? []) expect(c.who === '나' || content.characters.has(c.who), `${a.id}: ${c.who}`).toBe(true);
      for (const f of a.fx ?? []) expect((FX as readonly string[]).includes(f), `${a.id}: 효과 ${f}`).toBe(true);
      if (a.tod) expect(['dawn', 'day', 'dusk', 'night']).toContain(a.tod);
      const p = drawCG(a, 'day', bust);
      expect([p.w, p.h]).toEqual([160, 90]);
    }
  });

  it('그려진 삽화는 모두 art.yaml에 있다', () => {
    const orphan = Object.keys(SCENES).filter((id) => !content.art.has(id));
    expect(orphan).toEqual([]);
  });

  it('삽화는 시간대마다 160×90으로 빈틈없이 그려진다', () => {
    for (const id of Object.keys(SCENES)) {
      for (const tod of ['dawn', 'day', 'dusk', 'night']) {
        const p = drawScene(id, tod);
        expect([p.w, p.h]).toEqual([160, 90]);
        const holes = p.data.filter((c) => c < 0).length;
        expect(holes, `${id}/${tod}`).toBe(0);
      }
    }
  });

  it('같은 입력이면 같은 그림 (결정적)', () => {
    expect(drawScene('campus', 'dusk').data).toEqual(drawScene('campus', 'dusk').data);
    expect(drawPortrait(CAST.aren, '웃음').data).toEqual(drawPortrait(CAST.aren, '웃음').data);
  });

  it('모든 등장인물에게 초상화가 있고 표정마다 그려진다', () => {
    for (const id of content.characters.keys()) {
      expect(CAST[id], id).toBeTruthy();
      for (const m of MOODS) expect(drawPortrait(CAST[id], m).w).toBe(32);
    }
  });

  it('엑스트라와 적도 그려진다', () => {
    for (const n of ['교관', '학생 A', '상인']) expect(drawPortrait(extraLook(n)).h).toBe(32);
    for (const e of content.enemies.values()) expect(enemyArt(e.id, e.name).w).toBe(32);
  });

  it('활동·능력치·적 의도마다 아이콘이 있다', () => {
    for (const a of content.activities.keys()) expect(ICONS[ACTIVITY_ICON[a]], a).toBeTruthy();
    for (const s of content.rules.stats) expect(ICONS[STAT_ICON[s]], s).toBeTruthy();
    for (const i of INTENTS) expect(ICONS[INTENT_ICON[i]], i).toBeTruthy();
    for (const id of Object.keys(ICONS)) expect(drawIcon(id).w).toBe(16);
  });
});
