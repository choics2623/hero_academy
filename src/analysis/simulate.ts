// 몬테카를로 플레이테스터: 무작위 캐릭터로 수천 번 자동 플레이해서 통계를 낸다.
//   - 한 번도 발생하지 않은 이벤트, 한 번도 고를 수 없었던 선택지
//   - 갈림길 결과 분포 (원작대로 흘러간 비율)
//   - 복선: 심었는데 회수 못 함 / 회수됐는데 플레이어가 복선을 못 봄
// 'curious' 정책은 지금까지 덜 본 이벤트 쪽으로 가려고 해서 커버리지가 빨리 오른다.

import { randomBuild, suggestSkill, type Action, type Content } from '../engine';
import { Game } from '../engine/game';
import { nextRandom } from '../engine/rng';

export type Policy = 'random' | 'curious';

export interface SimOptions {
  runs: number;
  seed?: number;
  policy?: Policy;
}

export interface SimReport {
  runs: number;
  policy: Policy;
  eventFires: Map<string, number>;
  eventRuns: Map<string, number>;
  choices: Map<string, { text: string; shown: number; enabled: number; chosen: number }>;
  crossroads: Map<string, Map<string, number>>;
  foreshadow: Map<string, { seen: number; noticed: number; paid: number; paidUnnoticed: number }>;
  collapse: number[];
  errors: { seed: number; msg: string }[];
  origins: Map<string, number>;
  battles: Map<string, { fights: number; wins: number; turns: number }>;
}

export function simulate(c: Content, opts: SimOptions): SimReport {
  const policy = opts.policy ?? 'curious';
  let rng = (opts.seed ?? 1) >>> 0;
  const rand = () => {
    const [v, n] = nextRandom(rng);
    rng = n;
    return v;
  };
  const rep: SimReport = {
    runs: opts.runs,
    policy,
    eventFires: new Map([...c.events.keys()].map((k) => [k, 0])),
    eventRuns: new Map([...c.events.keys()].map((k) => [k, 0])),
    choices: new Map(),
    crossroads: new Map([...c.crossroads.keys()].map((k) => [k, new Map()])),
    foreshadow: new Map([...c.foreshadows.keys()].map((k) => [k, { seen: 0, noticed: 0, paid: 0, paidUnnoticed: 0 }])),
    collapse: [],
    errors: [],
    origins: new Map(),
    battles: new Map([...c.enemies.keys()].map((k) => [k, { fights: 0, wins: 0, turns: 0 }])),
  };
  // 모든 선택지를 미리 등록 (한 번도 안 보인 선택지를 찾기 위해)
  const walk = (o: import('../engine').Outcome) => {
    o.choices.forEach((ch, i) => rep.choices.set(`${o.path}#${i}`, { text: ch.text, shown: 0, enabled: 0, chosen: 0 }));
    o.branch.forEach(walk);
    if (o.success) walk(o.success);
    if (o.fail) walk(o.fail);
    o.choices.forEach(walk);
  };
  c.events.forEach(walk);

  for (let run = 0; run < opts.runs; run++) {
    const seed = Math.floor(rand() * 2 ** 31);
    try {
      const build = randomBuild(c, rand, '시뮬');
      rep.origins.set(build.origin, (rep.origins.get(build.origin) ?? 0) + 1);
      const firedThisRun = new Set<string>();
      const g = Game.create(c, build, seed, {
        onEvent: (id) => {
          rep.eventFires.set(id, rep.eventFires.get(id)! + 1);
          firedThisRun.add(id);
        },
        onChoices: (owner, shown) => {
          for (const s of shown) {
            const ch = rep.choices.get(`${owner}#${s.index}`)!;
            ch.shown++;
            if (s.enabled) ch.enabled++;
          }
        },
        onChoose: (owner, i) => rep.choices.get(`${owner}#${i}`)!.chosen++,
      });
      for (let steps = 0; !g.ended; steps++) {
        if (steps > 20000) throw new Error('진행이 끝나지 않음 (무한 루프?)');
        const opts = g.options();
        if (!opts.length) throw new Error(`막힘: 고를 수 있는 행동이 없음 (${g.view().time}, ${g.state.scene?.eventId ?? '활동 선택'})`);
        g.act(policy === 'curious' ? curious(c, g, opts, rep, rand) : opts[Math.floor(rand() * opts.length)]);
        const lb = g.state.lastBattle;
        if (lb) {
          const s = rep.battles.get(lb.enemy)!;
          s.fights++;
          s.turns += lb.turns;
          if (lb.result === 'win') s.wins++;
        }
      }
      for (const id of firedThisRun) rep.eventRuns.set(id, rep.eventRuns.get(id)! + 1);
      for (const cr of c.crossroads.values()) {
        const v = String(g.state.vars[cr.key] ?? '(미정)');
        const m = rep.crossroads.get(cr.id)!;
        m.set(v, (m.get(v) ?? 0) + 1);
      }
      for (const [id, f] of rep.foreshadow) {
        const seen = !!g.state.vars[`fs.${id}.seen`];
        const noticed = !!g.state.vars[`fs.${id}.noticed`];
        const paid = !!g.state.vars[`fs.${id}.paid`];
        if (seen) f.seen++;
        if (noticed) f.noticed++;
        if (paid) f.paid++;
        if (paid && !noticed) f.paidUnnoticed++;
      }
      rep.collapse.push(g.world.collapse());
    } catch (e) {
      rep.errors.push({ seed, msg: (e as Error).message });
    }
  }
  return rep;
}

/** 덜 본 이벤트/선택지로 향하는 행동을 고르는 정책 (70%), 나머지는 무작위 */
function curious(c: Content, g: Game, opts: Action[], rep: SimReport, rand: () => number): Action {
  // 전투는 대체로 정석대로 싸운다 (가끔 실수)
  if (g.state.phase === 'battle') {
    return rand() < 0.8 ? { type: 'battle', skill: suggestSkill(c, g.world, g.state.battle!) } : opts[Math.floor(rand() * opts.length)];
  }
  if (rand() < 0.3) return opts[Math.floor(rand() * opts.length)];
  let best = opts[0];
  let bestScore = -Infinity;
  for (const a of opts) {
    let score = rand() * 0.01;
    if (a.type === 'activity') {
      let novelty = 0.05;
      for (const e of c.events.values()) {
        if (e.trigger.kind === 'activity' && e.trigger.ids.includes(a.id) && g.eligible(e)) {
          novelty = Math.max(novelty, 1 / (1 + rep.eventFires.get(e.id)!));
        }
      }
      score += novelty;
    } else if (a.type === 'choice') {
      const owner = g.state.scene!.owner!;
      score += 1 / (1 + rep.choices.get(`${owner}#${a.index}`)!.chosen);
    }
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

export function formatReport(c: Content, r: SimReport): string {
  const pct = (n: number, d = r.runs) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '-');
  const L: string[] = [];
  L.push(`# 시뮬레이션 리포트`, '', `- 실행: ${r.runs}회 (정책: ${r.policy})`, `- 오류: ${r.errors.length}건`);
  const avg = r.collapse.reduce((a, x) => a + x, 0) / Math.max(1, r.collapse.length);
  L.push(`- 평균 원작 붕괴도 (종료 시점): ${Math.round(avg * 10) / 10}%`, '');
  if (r.errors.length) {
    L.push('## ❌ 오류', '');
    for (const e of r.errors.slice(0, 20)) L.push(`- seed ${e.seed}: ${e.msg}`);
    L.push('');
  }

  const never = [...r.eventFires].filter(([, n]) => n === 0).map(([id]) => id);
  L.push('## 이벤트 커버리지', '', `- 전체 ${c.events.size}개 중 ${c.events.size - never.length}개 발생 (${pct(c.events.size - never.length, c.events.size)})`);
  if (never.length) L.push(`- **한 번도 발생하지 않음:** ${never.join(', ')}`);
  L.push('', '| 이벤트 | 발생한 판 비율 | 총 발생 |', '|---|---|---|');
  for (const [id, n] of [...r.eventRuns].sort((a, b) => a[1] - b[1])) L.push(`| ${id} | ${pct(n)} | ${r.eventFires.get(id)} |`);

  const hidden = [...r.choices].filter(([, v]) => v.shown === 0);
  const locked = [...r.choices].filter(([, v]) => v.shown > 0 && v.enabled === 0);
  L.push('', '## 선택지', '');
  L.push(`- 한 번도 보이지 않은 선택지: ${hidden.length}개`);
  for (const [k, v] of hidden) L.push(`  - \`${k}\` "${v.text}"`);
  L.push(`- 보였지만 한 번도 고를 수 없었던 선택지 (requires 미달): ${locked.length}개`);
  for (const [k, v] of locked) L.push(`  - \`${k}\` "${v.text}" (${v.shown}번 보임)`);

  L.push('', '## 갈림길 결과 분포', '');
  for (const [id, m] of r.crossroads) {
    const cr = c.crossroads.get(id)!;
    const parts = [...m].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}${v === String(cr.canon) ? '(원작)' : ''} ${pct(n)}`);
    L.push(`- **${cr.title}** (마감 ${cr.deadlineLabel}): ${parts.join(' / ')}`);
  }

  L.push('', '## 복선', '', '| 복선 | 심김 | 눈치챔 | 회수 | 못 보고 회수됨 |', '|---|---|---|---|---|');
  for (const [id, f] of r.foreshadow) {
    const t = c.foreshadows.get(id)!;
    L.push(`| ${id} ${t.title} | ${pct(f.seen)} | ${pct(f.noticed)} | ${pct(f.paid)} | ${f.paidUnnoticed ? '⚠️ ' + pct(f.paidUnnoticed) : '-'} |`);
  }
  L.push('', '## 전투 (정석 대응 80% 정책 기준)', '', '| 적 | 전투 수 | 승률 | 평균 턴 |', '|---|---|---|---|');
  for (const [id, s] of r.battles) {
    if (!s.fights) continue;
    L.push(`| ${c.enemies.get(id)!.name} | ${s.fights} | ${pct(s.wins, s.fights)} | ${(s.turns / s.fights).toFixed(1)} |`);
  }
  L.push('', '## 출신 분포', '');
  for (const [o, n] of r.origins) L.push(`- ${c.origins.get(o)?.name ?? o}: ${n}`);
  return L.join('\n') + '\n';
}
