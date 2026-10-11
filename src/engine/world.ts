// 게임 상태와 변수 읽기/쓰기.
// 모든 상태는 평평한 "점 표기 변수" 하나의 사전에 들어간다:
//   stat.근력, affinity.liana, trust.liana, mood.liana.불안, fate.sera, item.월광초, fired.<이벤트>, ...
// 평평하게 두면 복제/비교/분석이 쉬워진다 (원작과의 차이 계산, 상태 해시, 린트).

import { EQUIP_SLOTS, type Content, type Crossroad, type Item, type Note, type Synergy } from './content';
import { evaluate, toNum, truthy, type Effect, type Env, type Value } from './expr';
import { nextRandom } from './rng';
import type { Time } from './time';

export interface WorldState {
  vars: Record<string, Value>;
  time: Time;
  rng: number;
}

const tagKeyCache = new WeakMap<Content, Map<string, string[]>>();

/** 태그 → 그 태그를 가진 재능의 변수 이름들 (콘텐츠마다 한 번만 계산) */
function tagKeys(c: Content, tag: string): string[] {
  let m = tagKeyCache.get(c);
  if (!m) {
    m = new Map();
    for (const t of c.talents.values()) for (const g of t.tags) m.set(g, [...(m.get(g) ?? []), `talent.${t.id}`]);
    tagKeyCache.set(c, m);
  }
  return m.get(tag) ?? [];
}

export class World implements Env {
  private deriving = new Set<string>();

  constructor(readonly content: Content, public state: WorldState) {}

  random(): number {
    const [v, next] = nextRandom(this.state.rng);
    this.state.rng = next;
    return v;
  }

  get(name: string): Value {
    const d = this.content.derived.get(name);
    if (d) {
      if (this.deriving.has(name)) throw new Error(`파생 변수 순환 참조: ${name}`);
      this.deriving.add(name);
      try {
        return evaluate(d.ast, this);
      } finally {
        this.deriving.delete(name);
      }
    }
    switch (name) {
      case 'world.collapse':
        return this.collapse();
      case 'time.year':
        return this.state.time.y;
      case 'time.month':
        return this.state.time.m;
      case 'time.week':
        return this.state.time.w;
      case 'time.slot':
        return this.content.calendar.slotName(this.state.time);
    }
    if (name.startsWith('synergy.')) {
      const sy = this.content.synergies.get(name.slice(8));
      return sy ? this.synergyTier(sy) : 0;
    }
    if (name.startsWith('gear.')) return this.gear(name.slice(5));
    return this.state.vars[name];
  }

  set(name: string, value: Value) {
    if (typeof value === 'number') {
      for (const c of this.content.rules.clamps) {
        if (c.re.test(name)) {
          value = Math.min(c.max, Math.max(c.min, value));
          break;
        }
      }
      value = Math.round(value * 100) / 100;
    }
    this.state.vars[name] = value;
  }

  /**
   * 효과 적용. stat.X에 더하는 양은 growth.X(성장률 보너스)만큼 늘어난다.
   * 그래서 재능은 "수치 +n"보다 "성장률 +n%"로 표현하는 게 자연스럽다.
   */
  apply(e: Effect, opts: { noGrowth?: boolean } = {}) {
    const raw = evaluate(e.value.ast, this);
    if (e.op === '=') {
      this.set(e.target, raw);
      return;
    }
    let delta = toNum(raw) * (e.op === '-=' ? -1 : 1);
    if (!opts.noGrowth && delta > 0 && e.target.startsWith('stat.')) {
      delta *= Math.max(0, 1 + toNum(this.get('growth.' + e.target.slice(5))));
    }
    this.set(e.target, toNum(this.get(e.target)) + delta);
  }

  applyAll(es: Effect[], opts?: { noGrowth?: boolean }) {
    for (const e of es) this.apply(e, opts);
  }

  add(name: string, delta: number) {
    this.set(name, toNum(this.get(name)) + delta);
  }

  // ---- 시너지와 장비

  /** 태그가 같은 재능이 모이면 깨어나는 컨셉 단계 (0 = 없음) */
  synergyTier(sy: Synergy): number {
    let n = 0;
    for (const key of tagKeys(this.content, sy.tag)) if (truthy(this.state.vars[key])) n++;
    let tier = 0;
    sy.tiers.forEach((x, i) => {
      if (n >= x.need) tier = i + 1;
    });
    return tier;
  }

  /** 지금 장착한 물건들 (칸 이름과 함께) */
  equipped(): { slot: string; item: Item }[] {
    const out: { slot: string; item: Item }[] = [];
    for (const slot of EQUIP_SLOTS) {
      const id = this.state.vars[`equip.${slot}`];
      const item = typeof id === 'string' ? this.content.items.get(id) : undefined;
      if (item) out.push({ slot, item });
    }
    return out;
  }

  /** 장비와 시너지가 주는 전투 보정 */
  gear(stat: string): number {
    if (!this.content.items.size && !this.content.synergies.size) return 0;
    let sum = 0;
    for (const { item } of this.equipped()) sum += item.battle[stat] ?? 0;
    for (const sy of this.content.synergies.values()) {
      const tier = this.synergyTier(sy);
      if (tier) sum += sy.tiers[tier - 1].battle[stat] ?? 0;
    }
    return sum;
  }

  // ---- 원작 붕괴도: 원작(갈림길 기본값)과 지금 세계의 차이

  isDiverged(c: Crossroad): boolean {
    const v = this.state.vars[c.key];
    return v !== undefined && v !== c.canon;
  }

  collapse(): number {
    let sum = 0;
    for (const c of this.content.crossroads.values()) if (this.isDiverged(c)) sum += c.weight;
    sum = sum * Math.max(0, 1 + toNum(this.state.vars['mod.collapse'])) + toNum(this.state.vars['world.collapse_bonus']);
    return Math.max(0, Math.min(100, Math.round(sum * 10) / 10));
  }

  // ---- 공략 노트: 의존하는 원작 사실이 바뀌면 자동으로 "신뢰할 수 없음"

  noteStatus(n: Note): { known: boolean; grade: number; reliable: boolean; reason?: string } {
    const known = truthy(this.state.vars[`note.${n.id}.known`]);
    const grade = toNum(this.state.vars[`note.${n.id}.grade`]) || n.grade;
    for (const cid of n.about) {
      const c = this.content.crossroads.get(cid);
      if (c && this.isDiverged(c)) return { known, grade, reliable: false, reason: `원작과 달라짐: ${c.title}` };
    }
    if (n.validWhile && !truthy(evaluate(n.validWhile.ast, this))) {
      return { known, grade, reliable: false, reason: '전제가 무너짐' };
    }
    if (n.fragile !== undefined && this.collapse() > n.fragile) {
      return { known, grade, reliable: false, reason: `붕괴도 ${n.fragile}% 초과` };
    }
    return { known, grade, reliable: true };
  }
}
