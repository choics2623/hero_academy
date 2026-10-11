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

/** 대사 표정. 화자 뒤에 @를 붙여 쓴다: `리아나@웃음: "..."` */
export const MOODS = ['웃음', '화남', '슬픔', '놀람', '당황', '진지'] as const;

export interface Line {
  speaker?: string;
  mood?: string;
  when?: Expr;
  variants: Variant[];
}

export interface CheckMod {
  when?: Expr;
  value: number;
  label: string;
}

export interface Check {
  /** 옛 형식: 직접 쓴 판정 공식 */
  value?: Expr;
  /** 새 형식: checks.yaml의 판정 종류 */
  type?: string;
  /** 숫자 난이도 (tier가 있으면 그 이름의 기준값, 달마다 오른다) */
  dc: number;
  tier?: string;
  /** 화면에 보일 판정 이름 (예: "근력 판정"). 옛 형식에서 없으면 판정 결과를 숨긴다 */
  label?: string;
  hidden?: boolean;
  mods: CheckMod[];
}

/** 판정 종류 (checks.yaml) */
export interface CheckType {
  id: string;
  name: string;
  icon: string;
  desc: string;
  value: Expr;
  /** 재능 이름(talent. 뒤) → 보너스 */
  plus: Record<string, number>;
  minus: Record<string, number>;
}

export interface CheckRules {
  types: Map<string, CheckType>;
  tiers: Record<string, number>;
  /** 달 → 난이도 가산 */
  monthOffset: Record<number, number>;
  /** [최소 확률, 말] 내림차순 */
  odds: [number, string][];
  /** 능력치 기본값이 그 달의 기대치(expected)보다 over 이상 높으면 넘친 만큼에 rate를 곱한다 (몰아준 능력치가 모든 걸 집어삼키지 않게) */
  softcap?: { expected: Record<number, number>; over: number; rate: number };
}

export const SLOTS = ['모자', '윗옷', '아래옷', '한벌옷', '장신구', '무기', '신발'] as const;
export type Slot = (typeof SLOTS)[number];
/** 실제 장착 칸 (장신구는 두 칸) */
export const EQUIP_SLOTS = ['모자', '윗옷', '아래옷', '한벌옷', '장신구1', '장신구2', '무기', '신발'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];
export const GEAR_STATS = ['hp', 'sp', 'mp', 'atk', 'matk', 'def', 'dodge', 'read', 'persuade'] as const;

export interface Item {
  id: string;
  name: string;
  kind: 'equip' | 'use' | 'key';
  slot?: Slot;
  icon: string;
  price?: number;
  desc: string;
  checks: Record<string, number>;
  battle: Record<string, number>;
  use: Effect[];
}

export interface SynergyTier {
  need: number;
  desc: string;
  checks: Record<string, number>;
  battle: Record<string, number>;
}

export interface Synergy {
  id: string;
  name: string;
  tag: string;
  desc: string;
  tiers: SynergyTier[];
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
  battle?: BattleSpec;
  /** 이 결과가 펼쳐질 때 보여줄 삽화 (art.yaml의 id) */
  art?: string;
  /** 대성공일 때 success 뒤에 덧붙는 결과 */
  great?: Outcome;
  /** 대실패일 때 fail 뒤에 덧붙는 결과 */
  fumble?: Outcome;
}

// ---------------------------------------------------------------- battle

export type Intent = '공격' | '강타' | '방어' | '차지' | '마법';
export const INTENTS: Intent[] = ['공격', '강타', '방어', '차지', '마법'];

export type SkillKind =
  | 'attack' | 'heavy' | 'guard' | 'dodge' | 'magic' | 'read' | 'heal' | 'intimidate' | 'blind' | 'focus' | 'item' | 'surrender';
export const SKILL_KINDS: SkillKind[] = [
  'attack', 'heavy', 'guard', 'dodge', 'magic', 'read', 'heal', 'intimidate', 'blind', 'focus', 'item', 'surrender',
];

export interface BattleSpec {
  enemy: string;
  /** 같이 싸우는 동료의 캐릭터 id를 돌려주는 식 (예: lab.partner) */
  ally?: Expr;
  win?: Outcome;
  lose?: Outcome;
}

export interface Enemy {
  id: string;
  name: string;
  hp: number;
  atk: number;
  matk: number;
  def: number;
  /** 회피 난이도 */
  acc: number;
  /** 의도를 정확히 읽는 데 필요한 '간파' 수치 */
  tell: number;
  turns: number;
  /** 행동 순서. 각 칸은 후보 목록 (여러 개면 무작위) */
  pattern: Intent[][];
  weak: { physical: number; magic: number };
  tells: Partial<Record<Intent, string>>;
  acts: Partial<Record<Intent, string>>;
  intro: Line[];
  /** 이 식이 참이면 의도를 항상 정확히 안다 (공략 노트, 관찰) */
  reveal?: Expr;
  enrage?: { below: number; pattern: Intent[][]; atk: number; line: string };
}

export interface Skill {
  id: string;
  name: string;
  desc: string;
  kind: SkillKind;
  when?: Expr;
  mult: number;
  sp: number;
  mp: number;
  /** 판정 보너스 (간파, 회피, 위압) */
  bonus: number;
  /** 방어 중인 적에게도 온전한 피해 */
  pierce: boolean;
  /** 회피 성공 시 다음 공격 배율 */
  counter: number;
  /** 회복량 (최대 체력 비율) */
  heal: number;
  /** 방어 시 마법 피해 배율 (기본 0.6) */
  ward: number;
  item?: string;
}

export interface Choice extends Outcome {
  text: string;
  requires?: Expr;
  hint?: string;
  /** 기억의 파편으로도 미래가 보이지 않는다 (반전 보호) */
  veiled?: boolean;
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
  /** 이 확률로만 후보가 된다 (0~1) */
  chance: number;
  /** 한 번 발생하면 이 주(週) 수만큼 쉰다 */
  cooldown: number;
  /** 학사 일정에 표시할 이름 */
  announce?: string;
  /** 선택 시 점수 = priority*1000 + spec. pool 이벤트는 spec 0.5로 고정 (서로 무작위 경쟁) */
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
  /** 장소 그림 (art.yaml의 id). 제목 있는 장면에 배경 띠로 나온다 */
  art?: string;
}

/** 삽화 목록. 그림 자체는 src/art에 코드로 그려져 있다 */
export interface ArtDef {
  id: string;
  title: string;
  desc?: string;
  /** 이벤트 CG: 배경 삽화 위에 인물과 효과를 얹는다 */
  bg?: string;
  /** CG의 시간대 (없으면 그 장면의 시간대) */
  tod?: string;
  cast?: { who: string; mood?: string; x?: number; flip?: boolean }[];
  fx?: string[];
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
  /** 시너지 태그 (검 마법 신성 사교 은밀 학자 야생 강인 저주) */
  tags: string[];
  options?: string[];
  locked?: Expr;
  /** 진화로만 얻는 재능 (캐릭터 생성 화면에 나오지 않음) */
  evolved: boolean;
}

export interface Origin {
  id: string;
  name: string;
  points: number;
  desc: string;
  talents: string[];
  effects: Effect[];
}

export interface Character {
  id: string;
  name: string;
  desc?: string;
  /** 만난 적이 있는가. 기본: affinity.<id> > 0 or met.<id> */
  met: Expr;
  /** 인연 화면의 한 줄 메모 (변형 대사) */
  memo: Line[];
  /** 전투에서 동료로 함께할 때 */
  assist?: { dmg: number; text: string };
}

export interface Goal {
  id: string;
  title: string;
  when?: Expr;
  done?: Expr;
  failed?: Expr;
  hints: Line[];
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
  /** 전투 수치 공식: hp sp mp atk matk def dodge read persuade mp_regen */
  battle: Record<string, Expr>;
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
  checks: CheckRules;
  items: Map<string, Item>;
  synergies: Map<string, Synergy>;
  characters: Map<string, Character>;
  goals: Map<string, Goal>;
  enemies: Map<string, Enemy>;
  skills: Map<string, Skill>;
  art: Map<string, ArtDef>;
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
  'when', 'lines', 'effects', 'next', 'check', 'success', 'fail', 'great', 'fumble', 'branch', 'choices', 'plants', 'pays',
  'battle', 'art',
]);
const EVENT_KEYS = new Set([
  ...OUTCOME_KEYS, 'id', 'title', 'on', 'window', 'at', 'slots', 'priority', 'weight', 'repeat', 'free',
  'chance', 'cooldown', 'announce', 'pool',
]);
const CHOICE_KEYS = new Set([...OUTCOME_KEYS, 'text', 'requires', 'hint', 'veiled']);

/** 대사 한 줄의 화자로 쓸 수 없는 예약어 */
const LINE_RESERVED = new Set(['when']);

class Builder {
  problems: string[] = [];
  private calendar!: Calendar;
  private checkRules!: CheckRules;

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
      const [who, mood] = keys[0].split('@');
      const speaker = who === '나레이션' ? undefined : who;
      if (mood !== undefined && !(MOODS as readonly string[]).includes(mood)) {
        this.err(where, `알 수 없는 표정 '${mood}' (가능: ${MOODS.join(', ')})`);
      }
      const body = item[keys[0]];
      const variants: Variant[] = [];
      for (const v of asList(body)) {
        if (typeof v === 'string') variants.push({ text: v });
        else if (isObj(v) && typeof v.text === 'string') variants.push({ text: v.text, when: this.expr(where, v.when) });
        else this.err(where, `변형 대사 형식이 이상함: ${JSON.stringify(v)}`);
      }
      out.push({ speaker, mood: mood || undefined, when: this.expr(where, item.when), variants });
    }
    return out;
  }

  private check(where: string, src: unknown): Check | undefined {
    if (src === undefined) return undefined;
    if (!isObj(src)) {
      this.err(where, `check 형식이 이상함`);
      return undefined;
    }
    for (const k of Object.keys(src)) {
      if (!['type', 'value', 'dc', 'label', 'hidden', 'mods'].includes(k)) this.err(where, `check에 알 수 없는 항목 '${k}'`);
    }
    const label = typeof src.label === 'string' ? src.label : undefined;
    const mods: CheckMod[] = [];
    for (const m of asList(src.mods)) {
      if (!isObj(m) || typeof m.value !== 'number' || typeof m.label !== 'string') {
        this.err(where, `check.mods는 {when: 식, value: 숫자, label: 이름} 형태여야 함`);
        continue;
      }
      mods.push({ when: this.expr(where, m.when), value: m.value, label: m.label });
    }
    let dc = 0;
    let tier: string | undefined;
    if (typeof src.dc === 'number') dc = src.dc;
    else if (typeof src.dc === 'string' && src.dc in this.checkRules.tiers) {
      tier = src.dc;
      dc = this.checkRules.tiers[src.dc];
    } else this.err(where, `check.dc는 숫자나 난이도 이름(${Object.keys(this.checkRules.tiers).join('/')})이어야 함`);
    if (typeof src.type === 'string') {
      if (!this.checkRules.types.has(src.type)) this.err(where, `없는 판정 종류 '${src.type}' (checks.yaml)`);
      if (src.value !== undefined) this.err(where, `check에 type과 value를 함께 쓸 수 없음`);
      return { type: src.type, dc, tier, label, hidden: src.hidden === true, mods };
    }
    if (src.value === undefined) {
      this.err(where, `check에는 type(판정 종류)이나 value(식)가 있어야 함`);
      return undefined;
    }
    const value = this.expr(where, src.value);
    return value ? { value, dc, tier, label, hidden: src.hidden === true, mods } : undefined;
  }

  private numMap(where: string, v: unknown): Record<string, number> {
    if (v === undefined) return {};
    if (!isObj(v)) {
      this.err(where, `{이름: 숫자} 형태여야 함`);
      return {};
    }
    const out: Record<string, number> = {};
    for (const [k, x] of Object.entries(v)) {
      if (typeof x !== 'number') this.err(where, `'${k}'의 값이 숫자가 아님`);
      else out[k] = x;
    }
    return out;
  }

  private checkRulesOf(src: unknown): CheckRules {
    const where = 'checks.yaml';
    const o = isObj(src) ? src : {};
    const types = new Map<string, CheckType>();
    for (const t of asList(o.types)) {
      if (!isObj(t) || typeof t.id !== 'string') {
        this.err(where, `판정 종류에 id가 없음`);
        continue;
      }
      const w = `${where}#${t.id}`;
      const value = this.expr(w, t.value);
      if (!value) {
        this.err(w, `value(공식)가 없음`);
        continue;
      }
      if (types.has(t.id)) this.err(w, `중복 판정 종류`);
      types.set(t.id, {
        id: t.id,
        name: String(t.name ?? t.id),
        icon: String(t.icon ?? 'dice'),
        desc: String(t.desc ?? ''),
        value,
        plus: this.numMap(w, t.plus),
        minus: this.numMap(w, t.minus),
      });
    }
    const tiers = this.numMap(where, o.tiers ?? { 쉬움: 24, 보통: 29, 어려움: 34, 극한: 40 });
    const monthOffset: Record<number, number> = {};
    for (const [k, v] of Object.entries(this.numMap(where, o.month_offset))) monthOffset[Number(k)] = v;
    const odds: [number, string][] = [];
    for (const x of asList(o.odds)) {
      if (Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'string') odds.push([x[0], x[1]]);
      else this.err(where, `odds는 [[최소확률, 말], ...] 형태여야 함`);
    }
    if (!odds.length) odds.push([0.9, '확실'], [0.65, '유리'], [0.4, '반반'], [0.15, '불리'], [0, '무모']);
    odds.sort((a, b) => b[0] - a[0]);
    let softcap: CheckRules['softcap'];
    if (isObj(o.softcap)) {
      const expected: Record<number, number> = {};
      for (const [k, v] of Object.entries(this.numMap(where, o.softcap.expected))) expected[Number(k)] = v;
      softcap = { expected, over: Number(o.softcap.over ?? 8), rate: Number(o.softcap.rate ?? 0.35) };
    }
    return { types, tiers, monthOffset, odds, softcap };
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
    if ((o.great !== undefined || o.fumble !== undefined) && o.check === undefined) {
      this.err(where, `great/fumble은 check가 있는 곳에만 쓸 수 있음 (${path})`);
    }
    return {
      path,
      when: this.expr(where, o.when),
      lines: this.lines(where, o.lines),
      effects: this.effects(where, o.effects),
      next: o.next as string | undefined,
      check: this.check(where, o.check),
      success: sub('success', o.success),
      fail: sub('fail', o.fail),
      great: sub('great', o.great),
      fumble: sub('fumble', o.fumble),
      branch: asList(o.branch).map((b, i) =>
        this.outcome(where, `${path}.branch[${i}]`, isObj(b) ? b : {}, OUTCOME_KEYS),
      ),
      choices: asList(o.choices).map((c, i) => this.choice(where, `${path}.choices[${i}]`, c)),
      plants,
      pays: asList(o.pays).map(String),
      art: typeof o.art === 'string' ? o.art : undefined,
      battle: isObj(o.battle)
        ? {
            enemy: String(o.battle.enemy),
            ally: this.expr(where, o.battle.ally),
            win: sub('battle.win', o.battle.win),
            lose: sub('battle.lose', o.battle.lose),
          }
        : undefined,
    };
  }

  private intents(where: string, v: unknown): Intent[][] {
    const out: Intent[][] = [];
    for (const step of asList(v)) {
      const opts = asList(step).map(String) as Intent[];
      for (const i of opts) if (!INTENTS.includes(i)) this.err(where, `알 수 없는 적 행동 '${i}' (가능: ${INTENTS.join(', ')})`);
      if (opts.length) out.push(opts);
    }
    if (!out.length) this.err(where, 'pattern이 비어 있음');
    return out;
  }

  private choice(where: string, path: string, c: unknown): Choice {
    const o = isObj(c) ? c : {};
    if (typeof o.text !== 'string') this.err(where, `선택지에 text가 없음 (${path})`);
    return {
      ...this.outcome(where, path, o, CHOICE_KEYS),
      text: String(o.text ?? '???'),
      requires: this.expr(where, o.requires),
      hint: o.hint as string | undefined,
      veiled: o.veiled === true ? true : undefined,
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
    const spec = o.pool === true ? 0.5 : (base.when?.spec ?? 0) + (window ? 1 : 0) + (slots ? 1 : 0);
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
      chance: typeof o.chance === 'number' ? o.chance : 1,
      cooldown: typeof o.cooldown === 'number' ? o.cooldown : 0,
      announce: o.announce as string | undefined,
      spec,
    };
  }

  // ---- top level

  build(): Content {
    const rulesRaw = this.file('rules.yaml');
    if (!isObj(rulesRaw) || !isObj(rulesRaw.calendar)) throw new ContentError(['rules.yaml에 calendar가 없음']);
    this.calendar = new Calendar(rulesRaw.calendar as unknown as CalendarDef);
    const rules = this.rules(rulesRaw);
    this.checkRules = this.checkRulesOf(this.file('checks.yaml'));

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
          art: typeof a.art === 'string' ? a.art : undefined,
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
          tags: asList(t.tags).map(String),
          options: t.options === undefined ? undefined : asList(t.options).map(String),
          locked: this.expr(where, t.evolved === true ? 'true' : t.locked),
          evolved: t.evolved === true,
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

    const items = byId(
      'items.yaml',
      asList(this.file('items.yaml')).map((it): Item | undefined => {
        if (!isObj(it) || typeof it.id !== 'string') return undefined;
        const where = `items.yaml#${it.id}`;
        for (const k of Object.keys(it)) {
          if (!['id', 'name', 'kind', 'slot', 'icon', 'price', 'desc', 'checks', 'battle', 'use'].includes(k)) this.err(where, `알 수 없는 항목 '${k}'`);
        }
        const kind = String(it.kind ?? (it.slot ? 'equip' : 'key')) as Item['kind'];
        if (!['equip', 'use', 'key'].includes(kind)) this.err(where, `kind는 equip/use/key 중 하나`);
        const slot = it.slot === undefined ? undefined : (String(it.slot) as Slot);
        if (slot && !(SLOTS as readonly string[]).includes(slot)) this.err(where, `없는 장비 칸 '${slot}' (가능: ${SLOTS.join(', ')})`);
        if (kind === 'equip' && !slot) this.err(where, `장비(equip)에는 slot이 있어야 함`);
        const battle = this.numMap(where, it.battle);
        for (const k of Object.keys(battle)) {
          if (!(GEAR_STATS as readonly string[]).includes(k)) this.err(where, `battle에 없는 능력 '${k}' (가능: ${GEAR_STATS.join(' ')})`);
        }
        return {
          id: it.id,
          name: String(it.name ?? it.id),
          kind,
          slot,
          icon: String(it.icon ?? 'misc'),
          price: typeof it.price === 'number' ? it.price : undefined,
          desc: String(it.desc ?? ''),
          checks: this.numMap(where, it.checks),
          battle,
          use: this.effects(where, it.use),
        };
      }),
    );

    const synergies = byId(
      'synergies.yaml',
      asList(this.file('synergies.yaml')).map((sy): Synergy | undefined => {
        if (!isObj(sy) || typeof sy.id !== 'string') return undefined;
        const where = `synergies.yaml#${sy.id}`;
        const tiers = asList(sy.tiers).map((t) => {
          const o = isObj(t) ? t : {};
          const battle = this.numMap(where, o.battle);
          for (const k of Object.keys(battle)) {
            if (!(GEAR_STATS as readonly string[]).includes(k)) this.err(where, `battle에 없는 능력 '${k}'`);
          }
          return { need: Number(o.need ?? 2), desc: String(o.desc ?? ''), checks: this.numMap(where, o.checks), battle };
        });
        tiers.sort((a, b) => a.need - b.need);
        if (!tiers.length) this.err(where, `tiers가 비어 있음`);
        return { id: sy.id, name: String(sy.name ?? sy.id), tag: String(sy.tag ?? ''), desc: String(sy.desc ?? ''), tiers };
      }),
    );

    const characters = byId(
      'characters.yaml',
      asList(this.file('characters.yaml')).map((c) => {
        if (!isObj(c) || typeof c.id !== 'string') return undefined;
        const where = `characters.yaml#${c.id}`;
        return {
          id: c.id,
          name: String(c.name ?? c.id),
          desc: c.desc as string,
          met: this.expr(where, c.met ?? `affinity.${c.id} > 0 or met.${c.id}`)!,
          memo: this.lines(where, c.memo === undefined ? [] : [{ 메모: c.memo }]),
          assist: isObj(c.assist) ? { dmg: Number(c.assist.dmg ?? 3), text: String(c.assist.text ?? '') } : undefined,
        };
      }),
    );

    const goals = byId(
      'goals.yaml',
      asList(this.file('goals.yaml')).map((g) => {
        if (!isObj(g) || typeof g.id !== 'string') return undefined;
        const where = `goals.yaml#${g.id}`;
        return {
          id: g.id,
          title: String(g.title ?? g.id),
          when: this.expr(where, g.when),
          done: this.expr(where, g.done),
          failed: this.expr(where, g.failed),
          hints: this.lines(where, g.hint === undefined ? [] : [{ 힌트: g.hint }]),
        };
      }),
    );

    const enemies = byId(
      'enemies.yaml',
      asList(this.file('enemies.yaml')).map((e) => {
        if (!isObj(e) || typeof e.id !== 'string') return undefined;
        const where = `enemies.yaml#${e.id}`;
        const strMap = (v: unknown) => (isObj(v) ? (Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])) as Partial<Record<Intent, string>>) : {});
        const weak = isObj(e.weak) ? e.weak : {};
        const en = isObj(e.enrage) ? e.enrage : undefined;
        return {
          id: e.id,
          name: String(e.name ?? e.id),
          hp: Number(e.hp ?? 20),
          atk: Number(e.atk ?? 4),
          matk: Number(e.matk ?? e.atk ?? 4),
          def: Number(e.def ?? 0),
          acc: Number(e.acc ?? 20),
          tell: Number(e.tell ?? 20),
          turns: Number(e.turns ?? 12),
          pattern: this.intents(where, e.pattern),
          weak: { physical: Number(weak.physical ?? 1), magic: Number(weak.magic ?? 1) },
          tells: strMap(e.tells),
          acts: strMap(e.acts),
          intro: this.lines(where, e.intro),
          reveal: this.expr(where, e.reveal),
          enrage: en
            ? { below: Number(en.below ?? 0.5), pattern: this.intents(where, en.pattern), atk: Number(en.atk ?? 1.2), line: String(en.line ?? '') }
            : undefined,
        };
      }),
    );

    const skills = byId(
      'skills.yaml',
      asList(this.file('skills.yaml')).map((k) => {
        if (!isObj(k) || typeof k.id !== 'string') return undefined;
        const where = `skills.yaml#${k.id}`;
        const kind = String(k.kind) as SkillKind;
        if (!SKILL_KINDS.includes(kind)) this.err(where, `알 수 없는 기술 종류 '${kind}'`);
        return {
          id: k.id,
          name: String(k.name ?? k.id),
          desc: String(k.desc ?? ''),
          kind,
          when: this.expr(where, k.when),
          mult: Number(k.mult ?? (kind === 'heavy' ? 1.8 : 1)),
          sp: Number(k.sp ?? 0),
          mp: Number(k.mp ?? 0),
          bonus: Number(k.bonus ?? 0),
          pierce: k.pierce === true,
          counter: Number(k.counter ?? 1.5),
          heal: Number(k.heal ?? 0),
          ward: Number(k.ward ?? 0.6),
          item: k.item as string | undefined,
        };
      }),
    );

    const derived = new Map<string, Expr>();
    const derivedRaw = this.file('derived.yaml');
    if (isObj(derivedRaw)) {
      for (const [k, v] of Object.entries(derivedRaw)) {
        const e = this.expr(`derived.yaml#${k}`, v);
        if (e) derived.set(k, e);
      }
    }

    const art = byId(
      'art.yaml',
      asList(this.file('art.yaml')).map((a) =>
        isObj(a) && typeof a.id === 'string'
          ? {
              id: a.id,
              title: String(a.title ?? a.id),
              desc: a.desc as string | undefined,
              bg: typeof a.bg === 'string' ? a.bg : undefined,
              tod: typeof a.tod === 'string' ? a.tod : undefined,
              cast: a.cast === undefined
                ? undefined
                : asList(a.cast).map((c) => {
                    const o = (isObj(c) ? c : { who: String(c) }) as Obj;
                    return {
                      who: String(o.who),
                      mood: typeof o.mood === 'string' ? o.mood : undefined,
                      x: typeof o.x === 'number' ? o.x : undefined,
                      flip: o.flip === true ? true : undefined,
                    };
                  }),
              fx: a.fx === undefined ? undefined : asList(a.fx).map(String),
            }
          : undefined,
      ),
    );

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
      checks: this.checkRules,
      items,
      synergies,
      characters,
      goals,
      enemies,
      skills,
      art,
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
      battle: Object.fromEntries(
        Object.entries(isObj(r.battle) ? r.battle : {}).flatMap(([k, v]) => {
          const e = this.expr(where, v);
          return e ? [[k, e]] : [];
        }),
      ),
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
  if (o.great) yield* walkOutcomes(o.great, conds);
  if (o.fumble) yield* walkOutcomes(o.fumble, conds);
  if (o.battle?.win) yield* walkOutcomes(o.battle.win, conds);
  if (o.battle?.lose) yield* walkOutcomes(o.battle.lose, conds);
  for (const c of o.choices) {
    const cc = [...conds, ...(c.when ? [c.when] : []), ...(c.requires ? [c.requires] : [])];
    yield* walkOutcomes(c, cc);
  }
}
