// 스토리 의존성 그래프: "어떤 변수를 누가, 언제, 어떤 조건에서 쓰고 읽는가".
// 린트(정적 검사)와 목표 탐색기(휴리스틱)가 공유한다.

import {
  compile,
  walkOutcomes,
  type Content,
  type Effect,
  type EffectOp,
  type Expr,
  type Node,
  type Value,
  type Window,
} from '../engine';
import { templateExprs } from '../engine/text';

export interface Writer {
  source: string;
  eventId?: string;
  target: string;
  op: EffectOp | 'implicit';
  /** 효과 값이 리터럴이면 그 값 */
  literal?: Value;
  /** 이 쓰기가 일어나려면 참이어야 하는 조건들 */
  conds: Expr[];
  /** 언제 일어날 수 있는가. undefined = 언제든 (생성, 훅, 시간 제한 없는 활동) */
  window?: Window;
  /** 처음부터 존재하는 값 (캐릭터 생성 등) */
  initial?: boolean;
}

export interface Reader {
  source: string;
  name: string;
  expr: Expr;
  window?: Window;
}

export interface Graph {
  writers: Map<string, Writer[]>;
  readers: Map<string, Reader[]>;
  /** next로 연결되는 이벤트까지 고려한 실효 시간창 */
  eventWindow: Map<string, Window | undefined>;
  /** 이 이벤트를 next로 가리키는 이벤트들 */
  incoming: Map<string, string[]>;
  plants: Map<string, { eventId: string; window?: Window }[]>;
  pays: Map<string, { eventId: string; window?: Window }[]>;
}

function literalOf(e: Effect): Value {
  const n: Node = e.value.ast;
  if (n.k === 'num' || n.k === 'str' || n.k === 'bool') return n.v;
  if (n.k === 'neg' && n.x.k === 'num') return -n.x.v;
  return undefined;
}

function union(a: Window | undefined, b: Window | undefined): Window | undefined {
  if (!a || !b) return undefined;
  return { from: Math.min(a.from, b.from), to: Math.max(a.to, b.to) };
}

export function buildGraph(c: Content): Graph {
  const writers = new Map<string, Writer[]>();
  const readers = new Map<string, Reader[]>();
  const incoming = new Map<string, string[]>();
  const plants: Graph['plants'] = new Map();
  const pays: Graph['pays'] = new Map();

  const write = (w: Writer) => {
    if (!writers.has(w.target)) writers.set(w.target, []);
    writers.get(w.target)!.push(w);
  };
  const read = (source: string, expr: Expr | undefined, window?: Window) => {
    if (!expr) return;
    for (const name of expr.refs) {
      if (!readers.has(name)) readers.set(name, []);
      readers.get(name)!.push({ source, name, expr, window });
    }
  };
  const writeEffects = (source: string, effects: Effect[], base: Omit<Writer, 'source' | 'target' | 'op'>) => {
    for (const e of effects) {
      write({ ...base, source, target: e.target, op: e.op, literal: literalOf(e) });
      read(source, e.value, base.window);
    }
  };

  // next 연결을 따라 시간창을 전파 (next로만 도달하는 이벤트는 부모의 시간을 따른다)
  for (const ev of c.events.values()) {
    for (const { node } of walkOutcomes(ev)) {
      if (node.next) {
        if (!incoming.has(node.next)) incoming.set(node.next, []);
        incoming.get(node.next)!.push(ev.id);
      }
    }
  }
  const canonEvents = new Map<string, number>();
  for (const cr of c.crossroads.values()) if (cr.canonEvent) canonEvents.set(cr.canonEvent, cr.deadline);
  const eventWindow = new Map<string, Window | undefined>();
  for (const ev of c.events.values()) eventWindow.set(ev.id, ev.window);
  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    for (const ev of c.events.values()) {
      if (ev.trigger.kind !== 'none' || ev.window) continue;
      const parents = incoming.get(ev.id) ?? [];
      let w: Window | undefined = parents.length ? eventWindow.get(parents[0]) : undefined;
      for (const p of parents.slice(1)) w = union(w, eventWindow.get(p));
      const canonAt = canonEvents.get(ev.id);
      if (canonAt !== undefined) w = { from: canonAt, to: canonAt + 64 };
      const prev = eventWindow.get(ev.id);
      if (w && (!prev || prev.from !== w.from || prev.to !== w.to)) {
        eventWindow.set(ev.id, w);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // 캐릭터 생성과 규칙
  const initial = { conds: [], initial: true };
  for (const s of c.rules.stats) write({ source: '생성', target: `stat.${s}`, op: 'implicit', ...initial });
  for (const t of ['player.name']) write({ source: '생성', target: t, op: 'implicit', ...initial });
  for (const o of c.origins.values()) {
    write({ source: `출신:${o.id}`, target: 'origin', op: '=', literal: o.id, ...initial });
    writeEffects(`출신:${o.id}`, o.effects, initial);
    for (const t of o.talents) write({ source: `출신:${o.id}`, target: `talent.${t}`, op: 'implicit', ...initial });
  }
  for (const t of c.talents.values()) {
    write({ source: `재능:${t.id}`, target: `talent.${t.id}`, op: 'implicit', ...initial });
    for (const o of t.options ?? []) write({ source: `재능:${t.id}`, target: `talent.${t.id}.${o}`, op: 'implicit', ...initial });
    writeEffects(`재능:${t.id}`, t.effects, initial);
  }
  for (const p of c.perks.values()) {
    write({ source: `특전:${p.id}`, target: `perk.${p.id}`, op: 'implicit', ...initial });
    writeEffects(`특전:${p.id}`, p.effects, initial);
  }
  writeEffects('규칙:initial', c.rules.initial, initial);
  for (const [hook, es] of Object.entries(c.rules.hooks)) writeEffects(`규칙:${hook}`, es, { conds: [] });
  read('규칙:memory_decay', c.rules.memoryDecay);
  for (const [k, e] of c.derived) read(`파생:${k}`, e);

  for (const a of c.activities.values()) {
    const base = { conds: a.when ? [a.when] : [], window: a.window };
    write({ source: `활동:${a.id}`, target: `count.${a.id}`, op: 'implicit', ...base });
    writeEffects(`활동:${a.id}`, a.effects, base);
    read(`활동:${a.id}`, a.when, a.window);
    for (const l of a.lines) for (const v of l.variants) read(`활동:${a.id}`, v.when, a.window);
  }

  for (const cr of c.crossroads.values()) {
    const at = { from: cr.deadline, to: cr.deadline + 64 };
    write({ source: `갈림길:${cr.id}(원작)`, target: cr.key, op: '=', literal: cr.canon, conds: [], window: at });
    write({ source: `갈림길:${cr.id}(원작)`, target: `crossroad.${cr.id}.canon`, op: 'implicit', conds: [], window: at });
    writeEffects(`갈림길:${cr.id}(원작)`, cr.canonEffects, { conds: [], window: at });
  }

  for (const n of c.notes.values()) {
    for (const k of ['known', 'grade']) write({ source: `노트:${n.id}`, target: `note.${n.id}.${k}`, op: 'implicit', conds: n.when ? [n.when] : [] });
    read(`노트:${n.id}`, n.when);
    read(`노트:${n.id}`, n.validWhile);
  }

  const readLines = (source: string, lines: { when?: Expr; variants: { when?: Expr; text: string }[] }[]) => {
    for (const l of lines) {
      read(source, l.when);
      for (const v of l.variants) {
        read(source, v.when);
        for (const t of templateExprs(v.text)) read(source, compile(t));
      }
    }
  };
  for (const g of c.goals.values()) {
    for (const e of [g.when, g.done, g.failed]) read(`목표:${g.id}`, e);
    readLines(`목표:${g.id}`, g.hints);
    for (const t of templateExprs(g.title)) read(`목표:${g.id}`, compile(t));
  }
  for (const ch of c.characters.values()) {
    read(`인연:${ch.id}`, ch.met);
    readLines(`인연:${ch.id}`, ch.memo);
  }

  for (const ev of c.events.values()) {
    const window = eventWindow.get(ev.id);
    write({ source: `이벤트:${ev.id}`, eventId: ev.id, target: `fired.${ev.id}`, op: 'implicit', conds: ev.when ? [ev.when] : [], window });
    for (const { node, conds } of walkOutcomes(ev)) {
      const src = `이벤트:${node.path}`;
      const base = { eventId: ev.id, conds, window };
      writeEffects(src, node.effects, base);
      for (const p of node.plants) {
        write({ ...base, source: src, target: `fs.${p.id}.seen`, op: 'implicit' });
        write({ ...base, source: src, target: `fs.${p.id}.noticed`, op: 'implicit' });
        if (!plants.has(p.id)) plants.set(p.id, []);
        plants.get(p.id)!.push({ eventId: ev.id, window });
        read(src, p.notice?.value, window);
      }
      for (const f of node.pays) {
        write({ ...base, source: src, target: `fs.${f}.paid`, op: 'implicit' });
        if (!pays.has(f)) pays.set(f, []);
        pays.get(f)!.push({ eventId: ev.id, window });
      }
      if (node.check) {
        write({ ...base, source: src, target: 'check.last', op: 'implicit' });
        read(src, node.check.value, window);
      }
      read(src, node.when, window);
      if ('requires' in node) read(src, (node as { requires?: Expr }).requires, window);
      for (const l of node.lines) {
        read(src, l.when, window);
        for (const v of l.variants) {
          read(src, v.when, window);
          for (const t of templateExprs(v.text)) read(src, compile(t), window);
        }
      }
      if ('text' in node) for (const t of templateExprs((node as { text: string }).text)) read(src, compile(t), window);
    }
  }

  return { writers, readers, eventWindow, incoming, plants, pays };
}

/** 이 이름은 엔진이 알아서 제공하는 값인가 */
export function isVirtual(c: Content, name: string): boolean {
  return (
    c.derived.has(name) ||
    ['world.collapse', 'world.collapse_bonus', 'time.year', 'time.month', 'time.week', 'time.slot', 'time.roll'].includes(name)
  );
}

/** 조건에서 "참이 되려면 이 변수가 채워져야 하는" 원자들 (부정/or 아래는 제외) */
export function positiveAtoms(n: Node): { name: string; node: Node }[] {
  switch (n.k) {
    case 'and':
      return [...positiveAtoms(n.a), ...positiveAtoms(n.b)];
    case 'var':
      return [{ name: n.name, node: n }];
    case 'cmp': {
      if (n.a.k !== 'var') return [];
      const b = n.b;
      if (b.k === 'str' && n.op === '==') return [{ name: n.a.name, node: n }];
      if (b.k === 'num' && ((n.op === '>=' && b.v > 0) || (n.op === '>' && b.v >= 0) || (n.op === '==' && b.v !== 0))) {
        return [{ name: n.a.name, node: n }];
      }
      return [];
    }
    default:
      return [];
  }
}
