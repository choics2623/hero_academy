import { describe, expect, it } from 'vitest';
import { lint } from '../src/analysis/lint';
import { seek } from '../src/analysis/seek';
import { simulate } from '../src/analysis/simulate';
import { loadContent } from '../src/engine/load';
import { BUILD, tiny } from './fixture';

describe('린트', () => {
  const c = tiny({
    'events/a.yaml': [
      { id: 'a', on: '산책', when: "fate.x == 'savd'", next: 'nope' },
      { id: 'b', on: '산책', choices: [{ text: '구한다', effects: ["fate.x = 'saved'"] }], window: '1.3' },
      { id: 'late', on: '산책', window: '1.3.1', when: 'flag.y' },
      { id: 'setter', on: '산책', window: '1.4', effects: ['flag.y = 1'] },
      { id: 'typo', on: '산책', when: 'affinty.liana >= 3' },
      { id: 'early_pay', on: '산책', window: '1.3', pays: ['F1'] },
      { id: 'late_plant', on: '산책', window: '1.4', plants: ['F1'] },
      { id: 'orphan', lines: ['...'] },
      { id: 'who', on: '산책', lines: [{ 리애나: '안녕' }] },
    ],
    'foreshadows.yaml': [{ id: 'F1', title: '복선' }],
  });
  const codes = lint(c).map((f) => `${f.code}:${f.where}`);

  it('다양한 오류를 잡는다', () => {
    expect(codes).toContain('NEXT_MISSING:a');
    expect(codes.some((x) => x.startsWith('VALUE_NEVER_SET'))).toBe(true); // 'savd' 오타
    expect(codes).toContain('COND_TOO_EARLY:late'); // flag.y는 4월에야 쓰임
    expect(codes.some((x) => x.startsWith('REF_NEVER_WRITTEN') && x.includes('typo'))).toBe(true);
    expect(codes).toContain('FS_ORDER:F1');
    expect(codes).toContain('EVENT_ORPHAN:orphan');
    expect(codes).toContain('SPEAKER_UNKNOWN:who');
  });
});

describe('목표 탐색기', () => {
  const c = tiny({
    'events/a.yaml': [
      { id: 'meet', on: '산책', effects: ['affinity.liana += 10'], repeat: 5, lines: ['리아나를 만났다'] },
      { id: 'gift', on: '훈련', when: 'affinity.liana >= 30', window: '1.3', effects: ["fate.liana = 'saved'"], lines: ['선물'] },
    ],
    'crossroads.yaml': [{ id: 'l', key: 'fate.liana', canon: 'dead', deadline: '1.3' }],
  });

  it('필요한 조건을 역추적해서 경로를 찾는다', () => {
    const r = seek(c, BUILD, "fate.liana == 'saved'");
    expect(r.found).toBe(true);
    const acts = r.game.state.trace.map((t) => t.text);
    expect(acts.filter((a) => a === '산책').length).toBeGreaterThanOrEqual(3);
    expect(acts[acts.length - 1]).toBe('훈련');
  });

  it('마감이 지나면 막힌 이유를 설명한다', () => {
    const late = tiny({
      'events/a.yaml': [{ id: 'gift', on: '훈련', when: 'affinity.liana >= 30', window: '1.3', effects: ["fate.liana = 'saved'"] }],
      'crossroads.yaml': [{ id: 'l', key: 'fate.liana', canon: 'dead', deadline: '1.3' }],
    });
    const r = seek(late, BUILD, "fate.liana == 'saved'");
    expect(r.found).toBe(false);
    expect(r.blockers[0].atom).toContain('fate.liana');
  });
});

describe('실제 콘텐츠', () => {
  const c = loadContent('content');

  it('린트 오류 없음', () => {
    expect(lint(c).filter((f) => f.level === 'error')).toEqual([]);
  });

  it('시뮬레이션 300회 오류 없음, 이벤트 대부분 발생', () => {
    const r = simulate(c, { runs: 300, seed: 9 });
    expect(r.errors).toEqual([]);
    const never = [...r.eventFires].filter(([, n]) => n === 0).map(([id]) => id);
    // 무작위 300회로는 드문 사슬 끝이나 집중 육성이 필요한 개화가 빠질 수 있다.
    // 그런 것들의 도달 가능성은 목표 탐색기(seek/verify)가 따로 증명한다. 여기서는 대부분이 실제로 일어나는지만 본다.
    expect(never.length / r.eventFires.size, never.join(', ')).toBeLessThanOrEqual(0.03);
  });

  it('집중 육성하면 무투대회에서 우승할 수 있다', () => {
    const r = seek(c, { name: '나', origin: '엑스트라', perks: ['고인물의기억'], talents: [{ id: '강골' }, { id: '천생신력' }] }, "tourney.winner == 'me'", { beam: 32 });
    expect(r.found).toBe(true);
  });

  it('세라를 구하는 경로가 존재한다', () => {
    const r = seek(c, { name: '나', origin: '평민장학생', perks: ['고인물의기억'], talents: [] }, "fate.sera == 'saved'");
    expect(r.found).toBe(true);
  });
});
