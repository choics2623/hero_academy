import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { BUILD, tiny } from './fixture';

const CHECKS = {
  tiers: { 보통: 20 },
  month_offset: { 4: 5 },
  types: [{ id: '설득', value: 'stat.지성', plus: { 달변: 5 }, minus: { 말더듬: 5 } }],
};
const TALENTS = [
  { id: '달변', cost: 1, tags: ['사교'] },
  { id: '미모', cost: 1, tags: ['사교'] },
  { id: '말더듬', cost: -1 },
];

describe('판정 종류', () => {
  const c = tiny({
    'checks.yaml': CHECKS,
    'talents.yaml': TALENTS,
    'synergies.yaml': [{ id: '사교가', tag: '사교', tiers: [{ need: 2, checks: { 설득: 3 } }] }],
    'items.yaml': [{ id: '넥타이', kind: 'equip', slot: '장신구', checks: { 설득: 2 } }],
    'events/a.yaml': [
      {
        id: 'ask', on: 'auto', at: '1.3.1.낮',
        choices: [
          {
            text: '부탁한다',
            check: { type: '설득', dc: '보통', mods: [{ when: "origin == '평민'", value: 1, label: '같은 처지' }] },
            success: { effects: ['ok = 1'] },
            fail: { effects: ['ok = 0'] },
          },
        ],
      },
    ],
  });

  it('재능·시너지·장비·상황 보정이 요인으로 보인다', () => {
    const g = Game.create(c, { ...BUILD, talents: [{ id: '달변' }, { id: '미모' }] });
    g.state.vars['item.넥타이'] = 1;
    g.equip('넥타이');
    const ch = g.view().choices[0].check!;
    const labels = Object.fromEntries(ch.factors.map((f) => [f.label, f.value]));
    expect(labels['달변']).toBe(5);
    expect(labels['사교가']).toBe(3);
    // 요인은 최대 3개만 보인다 (큰 것부터)
    expect(ch.factors.length).toBe(3);
    // 10 + 5 + 3 + 2 + 1 = 21 >= 20 → 확실
    expect(ch.chance).toBe(1);
    expect(ch.odds).toBe('확실');
  });

  it('감점 재능은 확률을 깎는다', () => {
    const g = Game.create(c, { ...BUILD, talents: [{ id: '말더듬' }] });
    const ch = g.view().choices[0].check!;
    // 10 - 5 + 1 = 6 → 20 - 6 = 14 필요 → 7/20
    expect(ch.chance).toBeCloseTo(0.35);
    expect(ch.odds).toBe('불리');
  });

  it('판정 결과 줄에 결정적 요인이 실린다', () => {
    const g = Game.create(c, { ...BUILD, talents: [{ id: '달변' }, { id: '미모' }] });
    g.act({ type: 'choice', index: 0 });
    const line = g.view().lines.find((l) => l.speaker === '판정')!;
    expect(line.check?.ok).toBe(true);
    expect(line.check?.key?.label).toBe('달변');
  });
});

describe('기억의 파편과 회귀', () => {
  const c = tiny({
    'rules.yaml': {
      calendar: { start: '1.3.1', end: '1.4.4', weeks_per_month: 4, slots: ['낮', '밤'] },
      base_stats: { 힘: 10, 지성: 10 },
      clamps: { shard: [0, 3] },
      initial: ['shard = 1'],
      speakers: ['속마음'],
    },
    'events/a.yaml': [
      {
        id: 'cliff', on: 'auto', at: '1.3.1.밤',
        choices: [
          { text: '뛰어내린다', lines: ['바람.'], effects: ["death = '절벽'"] },
          { text: '돌아간다', effects: ['stat.힘 += 1', 'item.돌 += 1'] },
        ],
      },
      { id: 'wake', on: 'auto', when: 'loop.just', priority: 5, free: true, lines: ['또 이 아침이다.'], effects: ['loop.just = 0'] },
    ],
    'items.yaml': [{ id: '돌', kind: 'key' }],
  });

  it('미래를 보면 파편이 줄고, 각 선택의 결과가 보인다', () => {
    const g = Game.create(c, BUILD);
    g.act({ type: 'activity', id: '산책' });
    g.act({ type: 'continue' });
    expect(g.view().memory).toMatchObject({ shard: 1, cost: 1 });
    const f = g.foresee();
    expect(g.view().memory.shard).toBe(0);
    expect(f.options[0].branches[0].death).toBe('절벽');
    expect(f.options[1].branches[0].changes).toEqual(
      expect.arrayContaining([{ key: 'stat.힘', delta: 1 }, { key: 'item.돌', delta: 1 }]),
    );
    // 미래 보기는 진짜 상태를 건드리지 않는다
    expect(g.get('stat.힘')).toBe(10);
  });

  it('죽으면 그 달 1주차로 돌아가고, 본 미래는 공짜로 다시 보인다', () => {
    const g = Game.create(c, BUILD);
    g.act({ type: 'activity', id: '산책' });
    g.act({ type: 'continue' });
    g.foresee();
    g.act({ type: 'choice', index: 0 });
    g.act({ type: 'continue' });
    expect(g.state.phase).toBe('dead');
    expect(g.options()).toEqual([{ type: 'regress' }]);
    g.act({ type: 'regress' });
    expect(g.get('loop.count')).toBe(1);
    expect(g.get('died.절벽')).toBe(1);
    // 회귀 직후 장면
    expect(g.view().lines[0].text).toBe('또 이 아침이다.');
    g.act({ type: 'continue' });
    g.act({ type: 'activity', id: '산책' });
    g.act({ type: 'continue' });
    // 같은 자리: 공짜, 지난 생에 고른 선택 표시
    expect(g.view().memory.cost).toBe(0);
    expect(g.view().choices[0].past).toBe(true);
    const shard = g.view().memory.shard;
    g.foresee();
    expect(g.view().memory.shard).toBe(shard);
  });
});

describe('가방과 장비', () => {
  const c = tiny({
    'checks.yaml': CHECKS,
    'items.yaml': [
      { id: '셔츠', kind: 'equip', slot: '윗옷' },
      { id: '로브', kind: 'equip', slot: '한벌옷', battle: { def: 1 } },
      { id: '반지', kind: 'equip', slot: '장신구' },
      { id: '물약', kind: 'use', use: ['stat.힘 += 1'] },
    ],
    'events/a.yaml': [
      { id: 'gift', on: 'auto', at: '1.3.1.낮', effects: ['item.셔츠 += 1', 'item.반지 += 2', 'item.물약 += 1'] },
      { id: 'lose', on: 'auto', at: '1.3.1.밤', effects: ['item.반지 -= 1'] },
    ],
  });

  it('얻으면 빈 칸에 바로 차고, 한벌옷은 윗옷·아래옷을 벗긴다', () => {
    const g = Game.create(c, BUILD);
    expect(g.get('equip.윗옷')).toBe('셔츠');
    expect(g.get('equip.장신구1')).toBe('반지');
    g.equip('반지', '장신구2');
    expect(g.get('equip.장신구2')).toBe('반지');
    g.state.vars['item.로브'] = 1;
    g.equip('로브');
    expect(g.get('equip.윗옷')).toBeUndefined();
    expect(g.get('gear.def')).toBe(1);
    g.useItem('물약');
    expect(g.get('stat.힘')).toBe(11);
    expect(g.get('item.물약')).toBe(0);
  });

  it('물건을 잃으면 장비에서도 빠진다', () => {
    const g = Game.create(c, BUILD);
    g.equip('반지', '장신구2');
    g.act({ type: 'continue' });
    const worn = ['장신구1', '장신구2'].filter((s) => g.get(`equip.${s}`) === '반지');
    expect(worn.length).toBe(1);
  });
});
