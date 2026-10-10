import { describe, expect, it } from 'vitest';
import { checkBuild } from '../src/engine/creation';
import { Game } from '../src/engine/game';
import { BUILD, tiny } from './fixture';

describe('캐릭터 생성', () => {
  const c = tiny();
  it('포인트 계산: 가장 비싼 특전 하나는 무료', () => {
    const r = checkBuild(c, { ...BUILD, perks: ['기억', '눈'], talents: [{ id: '강골' }] });
    expect(r.spent).toBe(2 + 3);
    expect(r.remaining).toBe(0);
    expect(r.ok).toBe(true);
  });
  it('상호 배제, 음수 상한, 포인트 부족', () => {
    expect(checkBuild(c, { ...BUILD, talents: [{ id: '강골' }, { id: '병약' }] }).errors.join()).toMatch(/같이 고를 수 없음/);
    expect(checkBuild(c, { ...BUILD, talents: [{ id: '불운' }] }).errors.join()).toMatch(/최대 12점/);
    expect(checkBuild(c, { ...BUILD, perks: ['기억', '눈'], talents: [{ id: '강골' }], alloc: { 힘: 1 } }).ok).toBe(false);
  });
  it('성장률은 생성 이후의 상승에만 곱해진다', () => {
    const g = Game.create(c, { ...BUILD, talents: [{ id: '강골' }] });
    expect(g.get('stat.힘')).toBe(10);
    g.act({ type: 'activity', id: '훈련' });
    expect(g.get('stat.힘')).toBe(13); // 2 * 1.5
  });
});

describe('스토리렛 선택', () => {
  const c = tiny({
    'events/a.yaml': [
      { id: 'walk_basic', on: '산책', repeat: true, lines: ['기본 산책'] },
      { id: 'walk_liana', on: '산책', when: 'met.liana', lines: ['리아나와 산책'] },
      { id: 'intro', on: 'auto', at: '1.3.1.낮', lines: ['입학'], effects: ['met.liana = 1'] },
    ],
  });

  it('강제 이벤트가 먼저, 그다음 가장 구체적인 스토리렛', () => {
    const g = Game.create(c, BUILD);
    expect(g.view().lines[0].text).toBe('입학');
    g.act({ type: 'continue' });
    g.act({ type: 'activity', id: '산책' });
    expect(g.view().lines[0].text).toBe('리아나와 산책');
    g.act({ type: 'continue' });
    g.act({ type: 'activity', id: '산책' });
    expect(g.view().lines[0].text).toBe('기본 산책'); // walk_liana는 1회용
  });
});

describe('갈림길과 원작 붕괴도', () => {
  const c = tiny({
    'events/a.yaml': [
      {
        id: 'choice',
        on: 'auto',
        at: '1.3.1.낮',
        choices: [{ text: '구한다', effects: ["fate.x = 'saved'"] }, { text: '외면한다' }],
      },
      { id: 'news', free: true, lines: ['원작대로 죽었다.'] },
    ],
    'crossroads.yaml': [{ id: 'x', title: 'X', key: 'fate.x', canon: 'dead', deadline: '1.3.1', weight: 10, canon_event: 'news' }],
    'notes.yaml': [{ id: 'n', title: 'X의 죽음', text: '...', grade: 3, about: ['x'] }],
  });

  it('개입하면 즉시 붕괴도가 오르고 노트가 신뢰 불가가 된다', () => {
    const g = Game.create(c, BUILD);
    expect(g.notes()[0].reliable).toBe(true);
    g.act({ type: 'choice', index: 0 });
    expect(g.world.collapse()).toBe(10);
    expect(g.notes()[0].reliable).toBe(false);
  });

  it('개입하지 않으면 마감 후 원작대로 확정되고 원작 이벤트가 나온다', () => {
    const g = Game.create(c, BUILD);
    g.act({ type: 'choice', index: 1 }); // 결과 대사가 없으면 바로 다음 슬롯(밤)으로
    expect(g.view().time).toBe('1학년 3월 1주차 밤');
    expect(g.get('fate.x')).toBeUndefined();
    g.act({ type: 'activity', id: '산책' });
    g.act({ type: 'continue' }); // 1주차 끝 → 2주차 시작 시 마감 처리
    expect(g.get('fate.x')).toBe('dead');
    expect(g.view().lines.map((l) => l.text)).toContain('원작대로 죽었다.');
    expect(g.world.collapse()).toBe(0);
  });
});

describe('판정, 분기, 복선', () => {
  const c = tiny({
    'events/a.yaml': [
      {
        id: 'e',
        on: 'auto',
        at: '1.3.1.낮',
        plants: [{ id: 'F1', notice: { value: 'stat.지성', dc: 0 } }],
        branch: [{ when: 'stat.힘 >= 100', lines: ['괴력'] }, { lines: ['평범'] }],
        check: { value: 'stat.힘', dc: 0 },
        success: { lines: ['성공'], effects: ['ok = 1'] },
      },
      { id: 'pay', on: '산책', pays: ['F1'], lines: ['그 원의 의미를 알았다.'] },
    ],
    'foreshadows.yaml': [{ id: 'F1', title: '피의 원' }],
  });

  it('판정 성공 → 분기 → 복선 기록과 회수', () => {
    const g = Game.create(c, BUILD);
    const texts = g.view().lines.map((l) => l.text);
    expect(texts).toEqual(['복선 기록 — 피의 원', '성공', '평범']);
    expect(g.get('fs.F1.noticed')).toBe(1);
    g.act({ type: 'continue' });
    g.act({ type: 'activity', id: '산책' });
    expect(g.view().lines.map((l) => l.text)).toContain('복선 회수 — 피의 원');
  });

  it('같은 시드 = 같은 결과 (재현 가능)', () => {
    const a = Game.create(c, BUILD, 42);
    const b = Game.create(c, BUILD, 42);
    expect(a.state).toEqual(b.state);
    const d = a.clone();
    d.act({ type: 'continue' });
    expect(a.state.phase).toBe('scene'); // 복제본은 원본에 영향 없음
  });
});
