import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { BUILD, tiny } from './fixture';

const SKILLS = [
  { id: 'attack', name: '공격', kind: 'attack' },
  { id: 'heavy', name: '강타', kind: 'heavy', sp: 3 },
  { id: 'guard', name: '방어', kind: 'guard' },
  { id: 'dodge', name: '회피', kind: 'dodge' },
  { id: 'read', name: '간파', kind: 'read' },
  { id: 'surrender', name: '기권', kind: 'surrender' },
];

function world(pattern: unknown[], extra: Record<string, unknown> = {}) {
  return tiny({
    'rules.yaml': {
      calendar: { start: '1.3.1', end: '1.4.4', weeks_per_month: 4, slots: ['낮', '밤'] },
      base_stats: { 힘: 10, 지성: 10 },
      battle: { hp: '40', sp: '10', atk: '4 + stat.힘 * 0.5', def: '0', read: 'stat.지성', dodge: '0' },
    },
    'skills.yaml': SKILLS,
    'enemies.yaml': [{ id: 'dummy', name: '허수아비', hp: 30, atk: 5, def: 0, tell: 10, acc: 99, turns: 6, pattern, ...extra }],
    'events/a.yaml': [
      {
        id: 'fight',
        on: 'auto',
        at: '1.3.1.낮',
        battle: { enemy: 'dummy', win: { lines: ['이겼다'], effects: ['won = 1'] }, lose: { lines: ['졌다'] } },
      },
    ],
  });
}

function start(c: ReturnType<typeof world>, seed = 1) {
  const g = Game.create(c, BUILD, seed);
  expect(g.state.phase).toBe('battle'); // 대사가 없으면 바로 전투 시작
  return g;
}

describe('패턴 읽기 전투', () => {
  it('지성이 tell 이상이면 의도가 정확히 보이고, 아니면 흐릿하게 보인다', () => {
    const g = start(world(['강타']));
    expect(g.view().battle!.intent).toMatchObject({ clarity: 'exact', label: '강타' });
    const hard = start(world(['강타'], { tell: 22 }));
    expect(hard.view().battle!.intent).toMatchObject({ clarity: 'vague', label: '공격 기세' });
    const hidden = start(world(['강타'], { tell: 40 }));
    expect(hidden.view().battle!.intent.clarity).toBe('hidden');
  });

  it('강타를 방어하면 피해가 크게 줄고 적이 무방비가 된다', () => {
    const a = start(world(['강타']));
    a.act({ type: 'battle', skill: 'guard' });
    const guarded = 40 - a.state.battle!.hp;
    expect(a.state.battle!.broken).toBeGreaterThan(0);
    const b = start(world(['강타']));
    b.act({ type: 'battle', skill: 'attack' });
    const hit = 40 - b.state.battle!.hp;
    expect(guarded).toBeLessThan(hit / 2);
  });

  it('차지 중에 강타를 넣으면 힘 모으기가 끊긴다', () => {
    const g = start(world(['차지', '공격']));
    g.act({ type: 'battle', skill: 'heavy' });
    expect(g.state.battle!.charged).toBe(false);
    expect(g.state.battle!.log.some((l) => l.text.includes('흩어졌다'))).toBe(true);
    const h = start(world(['차지', '공격']));
    h.act({ type: 'battle', skill: 'attack' });
    expect(h.state.battle!.charged).toBe(true);
    expect(h.state.battle!.intent).toBe('강타'); // 모은 힘은 다음 턴 강타로
  });

  it('이기면 승리 결과로, 기권하면 패배 결과로 이어진다', () => {
    const g = start(world(['방어']));
    for (let i = 0; i < 20 && g.state.phase === 'battle'; i++) g.act({ type: 'battle', skill: 'attack' });
    expect(g.get('battle.result')).toBe('win');
    expect(g.get('won')).toBe(1);
    expect(g.view().lines.map((l) => l.text)).toContain('이겼다');
    expect(g.state.lastBattle?.result).toBe('win');

    const s = start(world(['공격']));
    s.act({ type: 'battle', skill: 'surrender' });
    expect(s.state.phase).not.toBe('battle');
    expect(s.view().lines.map((l) => l.text)).toContain('졌다');
  });

  it('턴 제한이 되면 남은 체력 비율로 판정한다', () => {
    const g = start(world(['방어'], { hp: 999, turns: 2 }));
    g.act({ type: 'battle', skill: 'attack' });
    g.act({ type: 'battle', skill: 'attack' });
    expect(g.get('battle.result')).toBe('win'); // 내 체력 100% 대 적 99%
  });

  it('기력이 모자란 기술은 쓸 수 없다', () => {
    const g = start(world(['방어']));
    g.state.battle!.sp = 1;
    const heavy = g.view().battle!.skills.find((k) => k.id === 'heavy')!;
    expect(heavy.enabled).toBe(false);
    expect(() => g.act({ type: 'battle', skill: 'heavy' })).toThrow();
  });
});
