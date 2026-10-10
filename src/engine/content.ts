// 콘텐츠 정의와 컴파일.
// YAML에서 읽은 원본(raw)을 검증하고, 모든 조건식/효과식을 미리 파싱해 둔다.
// 파일 시스템에 의존하지 않으므로 나중에 브라우저에서도 그대로 쓸 수 있다.

import { compile, compileEffect, type Effect, type Expr, type Value } from './expr';
import { Calendar, type CalendarDef, type Window } from './time';

// ---------------------------------------------------------------- compiled types

export interface Variant {
  when?: Expr;
  text: string;
}

export interface Line {
  speaker?: string;
  when?: Expr;
  variants: Variant[];
}

export interface Check {
  value: Expr;
  dc: number;
}

export interface Plant {
  id: string;
  notice?: Check;
}

export interface Outcome {
  path: string;
  when?: Expr;
  lines: Line[];
  effects: Effect[];
  next?: string;
  check?: Check;
  success?: Outcome;
  fail?: Outcome;
  branch: Outcome[];
  choices: Choice[];
  plants: Plant[];
  pays: string[];
}

export interface Choice extends Outcome {
  text: string;
  requires?: Expr;
  hint?: string;
}

export type Trigger = { kind: 'auto' } | { kind: 'none' } | { kind: 'activity'; ids: string[] };

export interface EventDef extends Outcome {
  id: string;
  file: string;
  title?: string;
  trigger: Trigger;
  window?: Window;
  slots?: string[];
  priority: number;
  weight: number;
  repeat: number;
  free: boolean;
  /** 선택 시 점수 = priority*1000 + spec */
  spec: number;
}

export interface Activity {
  id: string;
  name: string;
  desc?: string;
  when?: Expr;
  window?: Window;
  slots?: string[];
  effects: Effect[];
  lines: Line[];
}

export interface Crossroad {
  id: string;
  title: string;
  key: string;
  canon: Value;
  deadline: number;
  deadlineLabel: string;
  weight: number;
  canonEffects: Effect[];
  canonEvent?: string;
  about: string[];
  /** 결과 값 → 화면에 보일 이름 */
  labels: Record<string, string>;
}

export interface Note {
  id: string;
  title: string;
  text: string;
  grade: number;
  when?: Expr;
  about: string[];
  validWhile?: Expr;
  fragile?: number;
}

export interface Foreshadow {
  id: string;
  title: string;
  meaning?: string;
  pending?: string;
}

export interface Talent {
  id: string;
  name: string;
  cost: number;
  category: string;
  desc: string;
  excludes: string[];
  effects: Effect[];
  options?: string[];
  locked?: Expr;
}

export interface Origin {
  id: string;
  name: string;
  points: number;
  desc: string;
  talents: string[];
  effects: Effect[];
}

export interface Perk {
  id: string;
  name: string;
  cost: number;
  desc: string;
  effects: Effect[];
}

export interface Character {
  id: string;
  name: string;
  desc?: string;
}

export interface Rules {
  calendar: CalendarDef;
  stats: string[];
  baseStats: Record<string, number>;
  clamps: { re: RegExp; pattern: string; min: number; max: number }[];
  hooks: Record<'slot_end' | 'week_end' | 'month_end' | 'year_end', Effect[]>;
  initial: Effect[];
  creation: { maxTalents: number; negativeCap: number; statPerPoint: number };
  memoryDecay?: Expr;
  status: { key: string; label: string }[];
  /** 캐릭터 목록 외에 화자로 쓸 수 있는 이름 (속마음, 나, ...) */
  speakers: string[];
}

export interface Content {
  rules: Rules;
  calendar: Calendar;
  events: Map<string, EventDef>;
  activities: Map<string, Activity>;
  crossroads: Map<string, Crossroad>;
  crossroadByKey: Map<string, Crossroad>;
  notes: Map<string, Note>;
  foreshadows: Map<string, Foreshadow>;
  talents: Map<string, Talent>;
  origins: Map<string, Origin>;
  perks: Map<string, Perk>;
  characters: Map<string, Character>;
  derived: Map<string, Expr>;
}

// ---------------------------------------------------------------- raw input

export interface RawContent {
  /** 파일 경로 → 파싱된 YAML 값 */
  files: Record<string, unknown>;
}

export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(`콘텐츠 오류 ${problems.length}건:\n` + problems.map((p) => '  - ' + p).join('\n'));
  }
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asList(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

const OUTCOME_KEYS = new Set([
  'when', 'lines', 'effects', 'next', 'check', 'success', 'fail', 'branch', 'choices', 'plants', 'pays',
]);
const EVENT_KEYS = new Set([
  ...OUTCOME_KEYS, 'id', 'title', 'on', 'window', 'at', 'slots', 'priority', 'weight', 'repeat', 'free',
]);
const CHOICE_KEYS = new Set([...OUTCOME_KEYS, 'text', 'requires', 'hint']);

/** 대사 한 줄의 화자로 쓸 수 없는 예약어 */
const LINE_RESERVED = new Set(['when']);

class Builder {
  problems: string[] = [];
  private calendar!: Calendar;

  constructor(private raw: RawContent) {}

  private err(where: string, msg: string) {
    this.problems.push(`[${where}] ${msg}`);
  }

  private expr(where: string, src: unknown): Expr | undefined {
    if (src === undefined || src === null) return undefined;
    try {
      return compile(src as string);
    } catch (e) {
      this.err(where, (e as Error).message);
      return undefined;
    }
  }

  private effects(where: string, src: unknown): Effect[] {
    const out: Effect[] = [];
    for (const s of asList(src)) {
      try {
        out.push(compileEffect(String(s)));
      } catch (e) {
        this.err(where, (e as Error).message);
      }
    }
    return out;
  }

  private windowOf(where: string, o: Obj): Window | undefined {
    try {
      if (o.at !== undefined) return this.calendar.window(o.at as string);
      if (isObj(o.window)) return this.calendar.window(o.window.from as string, o.window.to as string);
      if (o.window !== undefined) return this.calendar.window(o.window as string);
    } catch (e) {
      this.err(where, (e as Error).message);
    }
    return undefined;
  }

  private file(name: string): unknown {
    return this.raw.files[name];
  }

  private filesUnder(prefix: string): [string, unknown][] {
    return Object.entries(this.raw.files)
      .filter(([k]) => k.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b));
  }

  // ---- lines

  private lines(where: string, src: unknown): Line[] {
    const out: Line[] = [];
    for (const item of asList(src)) {
      if (typeof item === 'string') {
        out.push({ variants: [{ text: item }] });
        continue;
      }
      if (!isObj(item)) {
        this.err(where, `대사 형식이 이상함: ${JSON.stringify(item)}`);
        continue;
      }
      const keys = Object.keys(item).filter((k) => !LINE_RESERVED.has(k));
      if (keys.length !== 1) {
        this.err(where, `대사 한 줄에는 화자가 하나만 있어야 함: ${JSON.stringify(item)}`);
        continue;
      }
      const speaker = keys[0] === '나레이션' ? undefined : keys[0];
      const body = item[keys[0]];
      const variants: Variant[] = [];
      for (const v of asList(body)) {
        if (typeof v === 'string') variants.push({ text: v });
        else if (isObj(v) && typeof v.text === 'string') variants.push({ text: v.text, when: this.expr(where, v.when) });
        else this.err(where, `변형 대사 형식이 이상함: ${JSON.stringify(v)}`);
      }
      out.push({ speaker, when: this.expr(where, item.when), variants });
    }
    return out;
  }

  private check(where: string, src: unknown): Check | undefined {
    if (src === undefined) return undefined;
    if (!isObj(src) || src.value === undefined || typeof src.dc !== 'number') {
      this.err(where, `check는 {value: 식, dc: 숫자} 형태여야 함`);
      return undefined;
    }
    const value = this.expr(where, src.value);
    return value ? { value, dc: src.dc } : undefined;
  }

  private outcome(where: string, path: string, o: Obj, allowed: Set<string>): Outcome {
    for (const k of Object.keys(o)) if (!allowed.has(k)) this.err(where, `알 수 없는 항목 '${k}' (${path})`);
    const plants: Plant[] = [];
    for (const p of asList(o.plants)) {
      if (typeof p === 'string') plants.push({ id: p });
      else if (isObj(p) && typeof p.id === 'string') plants.push({ id: p.id, notice: this.check(where, p.notice) });
      else this.err(where, `plants 형식이 이상함`);
    }
    const sub = (key: string, v: unknown) =>
      isObj(v) ? this.outcome(where, `${path}.${key}`, v, OUTCOME_KEYS) : undefined;
    return {
      path,
      when: this.expr(where, o.when),
      lines: this.lines(where, o.lines),
      effects: this.effects(where, o.effects),
      next: o.next as string | undefined,
      check: this.check(where, o.check),
      success: sub('success', o.success),
      fail: sub('fail', o.fail),
      branch: asList(o.branch).map((b, i) =>
        this.outcome(where, `${path}.branch[${i}]`, isObj(b) ? b : {}, OUTCOME_KEYS),
      ),
      choices: asList(o.choices).map((c, i) => this.choice(where, `${path}.choices[${i}]`, c)),
      plants,
      pays: asList(o.pays).map(String),
    };
  }

  private choice(where: string, path: string, c: unknown): Choice {
    const o = isObj(c) ? c : {};
    if (typeof o.text !== 'string') this.err(where, `선택지에 text가 없음 (${path})`);
    return {
      ...this.outcome(where, path, o, CHOICE_KEYS),
      text: String(o.text ?? '???'),
      requires: this.expr(where, o.requires),
      hint: o.hint as string | undefined,
    };
  }

  private event(file: string, o: Obj): EventDef | undefined {
    const id = o.id;
    if (typeof id !== 'string') {
      this.err(file, `id가 없는 이벤트가 있음`);
      return undefined;
    }
    const where = `${file}#${id}`;
    let trigger: Trigger;
    if (o.on === 'auto') trigger = { kind: 'auto' };
    else if (o.on === undefined || o.on === 'none') trigger = { kind: 'none' };
    else trigger = { kind: 'activity', ids: asList(o.on).map(String) };
    const base = this.outcome(where, id, o, EVENT_KEYS);
    const window = this.windowOf(where, o);
    const slots = o.slots === undefined ? undefined : asList(o.slots).map(String);
    const spec = (base.when?.spec ?? 0) + (window ? 1 : 0) + (slots ? 1 : 0);
    const repeat = o.repeat === true ? Infinity : typeof o.repeat === 'number' ? o.repeat : 1;
    return {
      ...base,
      id,
      file,
      title: o.title as string | undefined,
      trigger,
      window,
      slots,
      priority: typeof o.priority === 'number' ? o.priority : 0,
      weight: typeof o.weight === 'number' ? o.weight : 1,
      repeat,
      free: o.free === true,
      spec,
    };
  }

  // ---- top level

  build(): Content {
    const rulesRaw = this.file('rules.yaml');
    if (!isObj(rulesRaw) || !isObj(rulesRaw.calendar)) throw new ContentError(['rules.yaml에 calendar가 없음']);
    this.calendar = new Calendar(rulesRaw.calendar as unknown as CalendarDef);
    const rules = this.rules(rulesRaw);

    const byId = <T extends { id: string }>(file: string, items: (T | undefined)[]): Map<string, T> => {
      const m = new Map<string, T>();
      for (const it of items) {
        if (!it) continue;
        if (m.has(it.id)) this.err(file, `중복 id '${it.id}'`);
        m.set(it.id, it);
      }
      return m;
    };

    const events = new Map<string, EventDef>();
    for (const [file, data] of this.filesUnder('events/')) {
      for (const e of asList(data)) {
        if (!isObj(e)) continue;
        const ev = this.event(file, e);
        if (!ev) continue;
        if (events.has(ev.id)) this.err(file, `중복 이벤트 id '${ev.id}' (${events.get(ev.id)!.file})`);
        events.set(ev.id, ev);
      }
    }

    const activities = byId(
      'activities.yaml',
      asList(this.file('activities.yaml')).map((a) => {
        if (!isObj(a) || typeof a.id !== 'string') return undefined;
        const where = `activities.yaml#${a.id}`;
        return {
          id: a.id,
          name: String(a.name ?? a.id),
          desc: a.desc as string | undefined,
          when: this.expr(where, a.when),
          window: this.windowOf(where, a),
          slots: a.slots === undefined ? undefined : asList(a.slots).map(String),
          effects: this.effects(where, a.effects),
          lines: this.lines(where, a.lines),
        };
      }),
    );

    const crossroads = byId(
      'crossroads.yaml',
      asList(this.file('crossroads.yaml')).map((c) => {
        if (!isObj(c) || typeof c.id !== 'string') return undefined;
        const where = `crossroads.yaml#${c.id}`;
        let deadline = 0;
        try {
          deadline = this.calendar.ord(this.calendar.point(c.deadline as string, 'to'));
        } catch (e) {
          this.err(where, (e as Error).message);
        }
        return {
          id: c.id,
          title: String(c.title ?? c.id),
          key: String(c.key),
          canon: c.canon as Value,
          deadline,
          deadlineLabel: String(c.deadline),
          weight: typeof c.weight === 'number' ? c.weight : 5,
          canonEffects: this.effects(where, c.canon_effects),
          canonEvent: c.canon_event as string | undefined,
          about: asList(c.about).map(String),
          labels: (isObj(c.labels) ? c.labels : {}) as Record<string, string>,
        };
      }),
    );
    const crossroadByKey = new Map([...crossroads.values()].map((c) => [c.key, c]));

    const notes = byId(
      'notes.yaml',
      asList(this.file('notes.yaml')).map((n) => {
        if (!isObj(n) || typeof n.id !== 'string') return undefined;
        const where = `notes.yaml#${n.id}`;
        return {
          id: n.id,
          title: String(n.title ?? n.id),
          text: String(n.text ?? ''),
          grade: typeof n.grade === 'number' ? n.grade : 1,
          when: this.expr(where, n.when),
          about: asList(n.about).map(String),
          validWhile: this.expr(where, n.valid_while),
          fragile: typeof n.fragile === 'number' ? n.fragile : undefined,
        };
      }),
    );

    const foreshadows = byId(
      'foreshadows.yaml',
      asList(this.file('foreshadows.yaml')).map((f) =>
        isObj(f) && typeof f.id === 'string'
          ? { id: f.id, title: String(f.title ?? f.id), meaning: f.meaning as string, pending: f.pending as string }
          : undefined,
      ),
    );

    const talents = byId(
      'talents.yaml',
      asList(this.file('talents.yaml')).map((t) => {
        if (!isObj(t) || typeof t.id !== 'string') return undefined;
        const where = `talents.yaml#${t.id}`;
        return {
          id: t.id,
          name: String(t.name ?? t.id),
          cost: Number(t.cost ?? 0),
          category: String(t.category ?? '기타'),
          desc: String(t.desc ?? ''),
          excludes: asList(t.excludes).map(String),
          effects: this.effects(where, t.effects),
          options: t.options === undefined ? undefined : asList(t.options).map(String),
          locked: this.expr(where, t.locked),
        };
      }),
    );

    const origins = byId(
      'origins.yaml',
      asList(this.file('origins.yaml')).map((o) => {
        if (!isObj(o) || typeof o.id !== 'string') return undefined;
        return {
          id: o.id,
          name: String(o.name ?? o.id),
          points: Number(o.points ?? 0),
          desc: String(o.desc ?? ''),
          talents: asList(o.talents).map(String),
          effects: this.effects(`origins.yaml#${o.id}`, o.effects),
        };
      }),
    );

    const perks = byId(
      'perks.yaml',
      asList(this.file('perks.yaml')).map((p) => {
        if (!isObj(p) || typeof p.id !== 'string') return undefined;
        return {
          id: p.id,
          name: String(p.name ?? p.id),
          cost: Number(p.cost ?? 0),
          desc: String(p.desc ?? ''),
          effects: this.effects(`perks.yaml#${p.id}`, p.effects),
        };
      }),
    );

    const characters = byId(
      'characters.yaml',
      asList(this.file('characters.yaml')).map((c) =>
        isObj(c) && typeof c.id === 'string' ? { id: c.id, name: String(c.name ?? c.id), desc: c.desc as string } : undefined,
      ),
    );

    const derived = new Map<string, Expr>();
    const derivedRaw = this.file('derived.yaml');
    if (isObj(derivedRaw)) {
      for (const [k, v] of Object.entries(derivedRaw)) {
        const e = this.expr(`derived.yaml#${k}`, v);
        if (e) derived.set(k, e);
      }
    }

    if (this.problems.length) throw new ContentError(this.problems);
    return {
      rules,
      calendar: this.calendar,
      events,
      activities,
      crossroads,
      crossroadByKey,
      notes,
      foreshadows,
      talents,
      origins,
      perks,
      characters,
      derived,
    };
  }

  private rules(r: Obj): Rules {
    const where = 'rules.yaml';
    const baseStats = (isObj(r.base_stats) ? r.base_stats : {}) as Record<string, number>;
    const clamps = Object.entries(isObj(r.clamps) ? r.clamps : {}).map(([pattern, range]) => {
      const [min, max] = range as [number, number];
      const re = new RegExp('^' + pattern.replace(/[.]/g, '\\.').replace(/\*/g, '[^.]+') + '$', 'u');
      return { re, pattern, min, max };
    });
    const hooks = isObj(r.hooks) ? r.hooks : {};
    const creation = isObj(r.creation) ? r.creation : {};
    const status = asList(r.status).map((s) => {
      const o = isObj(s) ? s : {};
      return { key: String(o.key), label: String(o.label ?? o.key) };
    });
    return {
      calendar: r.calendar as unknown as CalendarDef,
      stats: Object.keys(baseStats),
      baseStats,
      clamps,
      hooks: {
        slot_end: this.effects(where, hooks.slot_end),
        week_end: this.effects(where, hooks.week_end),
        month_end: this.effects(where, hooks.month_end),
        year_end: this.effects(where, hooks.year_end),
      },
      initial: this.effects(where, r.initial),
      creation: {
        maxTalents: Number(creation.max_talents ?? 8),
        negativeCap: Number(creation.negative_cap ?? 12),
        statPerPoint: Number(creation.stat_per_point ?? 2),
      },
      memoryDecay: this.expr(where, r.memory_decay),
      status,
      speakers: asList(r.speakers).map(String),
    };
  }
}

export function buildContent(raw: RawContent): Content {
  return new Builder(raw).build();
}

/** 이벤트 안의 모든 결과 노드를 순회한다 (분석 도구용). */
export function* walkOutcomes(o: Outcome, ctx: Expr[] = []): Generator<{ node: Outcome; conds: Expr[] }> {
  const conds = o.when && !('text' in o) ? [...ctx, o.when] : ctx;
  yield { node: o, conds };
  for (const b of o.branch) yield* walkOutcomes(b, conds);
  if (o.success) yield* walkOutcomes(o.success, conds);
  if (o.fail) yield* walkOutcomes(o.fail, conds);
  for (const c of o.choices) {
    const cc = [...conds, ...(c.when ? [c.when] : []), ...(c.requires ? [c.requires] : [])];
    yield* walkOutcomes(c, cc);
  }
}
