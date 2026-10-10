// 목표 탐색기: "이 결과에 실제로 도달할 수 있는가? 있다면 어떻게?"
//
// 알고리즘: 빔 탐색 + 역추적 휴리스틱.
//   - 목표 조건을 원자 조건으로 쪼갠다 (예: fate.liana == 'awakened', item.세계수의이슬 >= 1)
//   - 아직 거짓인 원자마다, 의존성 그래프에서 "그 변수를 목표 쪽으로 바꿔주는 이벤트"를 찾는다
//   - 그 이벤트의 조건이 얼마나 멀었는지를 다시 재귀적으로 잰다 (깊이 2까지)
//   - 바꿔줄 이벤트가 전부 마감됐으면 그 상태는 "죽은 상태"로 가지치기한다
//   이렇게 하면 "아직 결과는 안 바뀌었지만 필요한 조건에 다가가는" 행동을 우선 탐색할 수 있다.
// 실패하면 무엇이 막고 있는지(마감된 이벤트, 못 채운 조건)를 설명한다.

import { battleStats, compile, distance, evaluate, show, test, toNum, truthy, type Action, type Build, type Content, type Expr, type Node } from '../engine';
import { Game } from '../engine/game';
import { nextRandom } from '../engine/rng';
import { buildGraph, positiveAtoms, type Graph, type Writer } from './graph';

export interface SeekOptions {
  beam?: number;
  maxSteps?: number;
  seed?: number;
}

export interface Blocker {
  atom: string;
  current: string;
  writers: { source: string; status: string }[];
}

export interface SeekResult {
  found: boolean;
  goal: string;
  game: Game;
  explored: number;
  pruned: number;
  blockers: Blocker[];
}

const INF = Number.POSITIVE_INFINITY;

export class GoalHeuristic {
  constructor(readonly content: Content, readonly graph: Graph, readonly goal: Expr) {}

  private now(g: Game) {
    return this.content.calendar.ord(g.state.time);
  }

  /** 이 쓰기가 원자 조건을 참 쪽으로 움직이는가 */
  helps(w: Writer, atom: Node, g: Game): boolean {
    if (w.op === 'implicit') return true;
    if (atom.k === 'var') return w.op === '+=' || (w.op === '=' && (w.literal === undefined || truthy(w.literal)));
    if (atom.k !== 'cmp') return false;
    const target = atom.b.k === 'num' || atom.b.k === 'str' ? atom.b.v : undefined;
    if (atom.op === '==' && typeof target === 'string') return w.op === '=' && (w.literal === undefined || w.literal === target);
    if (atom.op === '>=' || atom.op === '>') {
      if (w.op === '-=') return false;
      if (w.op === '=') return w.literal === undefined || toNum(w.literal) >= toNum(target);
      return true;
    }
    if (atom.op === '==') {
      if (w.op === '=') return w.literal === undefined || w.literal === target;
      const cur = toNum(g.get((atom.a as { name: string }).name));
      return w.op === '+=' ? cur < toNum(target) : cur > toNum(target);
    }
    return true;
  }

  /** 아직 일어날 수 있는 쓰기인가 */
  open(w: Writer, g: Game): boolean {
    if (w.initial) return false;
    if (w.window && w.window.to < this.now(g)) return false;
    if (w.eventId) {
      const ev = this.content.events.get(w.eventId)!;
      // 이미 발생했어도 지금 그 이벤트의 선택지가 화면에 떠 있으면 아직 열려 있다
      const active = g.state.scene?.eventId === ev.id || g.state.battle?.eventId === ev.id;
      if (!active && toNum(g.state.vars[`fired.${ev.id}`]) >= ev.repeat) return false;
    }
    return true;
  }

  /** 이 적을 이길 준비가 얼마나 안 됐는가 (0 = 충분, 1 = 한참 모자람). 쓰러뜨리는 데 걸리는 턴 vs 버티는 턴 */
  battleGap(g: Game, enemyId: string): number {
    const e = this.content.enemies.get(enemyId);
    if (!e) return 0;
    const s = battleStats(this.content, g.world);
    const dps = Math.max(s.atk - e.def, s.matk - e.def * 0.5, 1);
    const toKill = e.hp / dps;
    // 강타·마법·분노를 감안해 평균 피해를 넉넉히 잡고, 쓰러지기 한참 전에 이길 수 있어야 '준비됨'
    const toDie = s.hp / Math.max(1, Math.max(e.atk, e.matk) * 1.4 * (e.enrage ? 1.1 : 1) - s.def);
    return Math.max(0, Math.min(1, (toKill - toDie * 0.6) / toKill));
  }

  atomCost(g: Game, name: string, atom: Node, depth: number, memo: Map<string, number>): number {
    if (truthy(evaluate(atom, g.world))) return 0;
    const key = `${name}|${show(atom)}|${depth}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    memo.set(key, INF); // 순환 방지
    let best = INF;
    for (const w of this.graph.writers.get(name) ?? []) {
      if (!this.open(w, g) || !this.helps(w, atom, g)) continue;
      let cost = 1 + (w.battle ? 3 * this.battleGap(g, w.battle) : 0);
      for (const cond of w.conds) {
        if (depth <= 0) {
          cost += distance(cond.ast, g.world);
          continue;
        }
        const atoms = positiveAtoms(cond.ast);
        if (!atoms.length) {
          cost += distance(cond.ast, g.world);
          continue;
        }
        for (const a of atoms) {
          const c = this.atomCost(g, a.name, a.node, depth - 1, memo);
          cost += c === INF ? 5 : 0.7 * c;
        }
      }
      best = Math.min(best, cost);
    }
    // 수치형은 지금 얼마나 모자란지도 반영
    if (best !== INF) best += distance(atom, g.world);
    memo.set(key, best);
    return best;
  }

  h(g: Game): number {
    if (test(this.goal, g.world)) return 0;
    const memo = new Map<string, number>();
    let total = distance(this.goal.ast, g.world);
    // 전투 중이면 이기는 쪽으로 가는 상태를 조금 더 선호
    const b = g.state.battle;
    if (b) total += 0.5 * (b.ehp / b.emaxHp) - 0.4 * (b.hp / b.maxHp);
    for (const a of positiveAtoms(this.goal.ast)) {
      const c = this.atomCost(g, a.name, a.node, 5, memo);
      if (c === INF) return INF;
      total += c;
    }
    return total;
  }

  explain(g: Game): Blocker[] {
    const out: Blocker[] = [];
    for (const a of positiveAtoms(this.goal.ast)) {
      if (truthy(evaluate(a.node, g.world))) continue;
      const writers = (this.graph.writers.get(a.name) ?? [])
        .filter((w) => !w.initial && this.helps(w, a.node, g))
        .map((w) => {
          if (!this.open(w, g)) return { source: w.source, status: '마감됨 (시간이 지났거나 이미 발생)' };
          const unmet = w.conds
            .filter((c) => !test(c, g.world))
            .map((c) => `${show(c.ast)} [현재 ${c.refs.map((r) => `${r}=${JSON.stringify(g.get(r) ?? null)}`).join(', ')}]`);
          return { source: w.source, status: unmet.length ? `조건 미달: ${unmet.join(' / ')}` : '열려 있음' };
        });
      out.push({ atom: show(a.node), current: `${a.name} = ${JSON.stringify(g.get(a.name) ?? null)}`, writers });
    }
    return out;
  }
}

/** 선택할 게 없는 장면(계속만 가능)은 자동으로 넘긴다 */
export function advance(g: Game) {
  for (let i = 0; i < 1000; i++) {
    const opts = g.options();
    if (opts.length !== 1 || opts[0].type !== 'continue') return;
    g.act(opts[0]);
  }
}

function stateHash(g: Game): string {
  const keys = Object.keys(g.state.vars).filter((k) => k !== 'time.roll').sort();
  const sc = g.state.scene;
  const b = g.state.battle;
  const bk = b ? [b.enemy, b.hp, b.ehp, b.sp, b.mp, b.turn, b.intent, b.charged, b.broken, b.counter] : null;
  return JSON.stringify([g.state.time, g.state.phase, sc?.eventId, sc?.owner, bk, keys.map((k) => [k, g.state.vars[k]])]);
}

export function seek(content: Content, build: Build, goalSrc: string, opts: SeekOptions = {}, graph = buildGraph(content)): SeekResult {
  const goal = compile(goalSrc);
  const H = new GoalHeuristic(content, graph, goal);
  const beam = opts.beam ?? 24;
  const maxSteps = opts.maxSteps ?? 400;
  let rng = (opts.seed ?? 7) >>> 0;
  const jitter = () => {
    const [v, n] = nextRandom(rng);
    rng = n;
    return v * 0.01;
  };

  const root = Game.create(content, build, opts.seed ?? 7);
  advance(root);
  let explored = 0;
  let pruned = 0;
  let best = { g: root, h: H.h(root) };
  if (best.h === 0) return { found: true, goal: goalSrc, game: root, explored, pruned, blockers: [] };
  let frontier = [root];
  const seen = new Set<string>([stateHash(root)]);

  for (let step = 0; step < maxSteps && frontier.length; step++) {
    const children: { g: Game; score: number }[] = [];
    for (const g of frontier) {
      for (const a of g.options() as Action[]) {
        const c = g.clone();
        c.act(a);
        advance(c);
        explored++;
        if (test(goal, c.world)) return { found: true, goal: goalSrc, game: c, explored, pruned, blockers: [] };
        const h = H.h(c);
        if (h === INF) {
          pruned++;
          if (best.h === INF || pruned === 1) best = { g: c, h: INF };
          continue;
        }
        if (h < best.h || best.h === INF) best = { g: c, h };
        if (c.ended) continue;
        const hash = stateHash(c);
        if (seen.has(hash)) continue;
        seen.add(hash);
        children.push({ g: c, score: h + jitter() });
      }
    }
    children.sort((a, b) => a.score - b.score);
    frontier = children.slice(0, beam).map((x) => x.g);
  }
  return { found: false, goal: goalSrc, game: best.g, explored, pruned, blockers: H.explain(best.g) };
}
