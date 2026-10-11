// 게임 진행 루프.
//
// 한 슬롯(시간 칸)의 흐름:
//   1. 강제 이벤트 (on: auto) 중 조건이 맞는 것 → 가장 구체적인 하나가 발생
//   2. 없으면 플레이어가 활동을 고름 → 그 활동에 걸린 스토리렛 중 가장 구체적인 하나가 발생
//   3. 장면 → 선택지 → 결과 (분기/판정/다음 이벤트로 연결)
//   4. 슬롯 종료 → 시간 진행 → 마감된 갈림길은 "원작대로" 자동 결정
//
// 상태는 전부 직렬화 가능한 값이라서 clone()이 싸다. 시뮬레이터와 목표 탐색기가 이걸 이용한다.

import { battleView, startBattle, takeTurn, type BattleLine, type BattleState, type BattleView } from './battle';
import { evalCheck, gradeOf, GRADE_WORD, keyFactor, type CheckEval, type Factor } from './checks';
import { applyBuild, checkBuild, type Build } from './creation';
import { EQUIP_SLOTS, type Activity, type Check, type Choice, type Content, type EquipSlot, type EventDef, type Item, type Note, type Outcome } from './content';
import { evaluate, test, toNum, truthy, type Value } from './expr';
import { pickVariant, renderLines, renderTemplate, type RenderedLine } from './text';
import { World, type WorldState } from './world';

export type Action =
  | { type: 'activity'; id: string }
  | { type: 'choice'; index: number }
  | { type: 'continue' }
  | { type: 'battle'; skill: string }
  | { type: 'regress' };

export interface ChoiceView {
  index: number;
  text: string;
  enabled: boolean;
  hint?: string;
  /** 이 선택지가 바로 판정을 굴리면: 판정 이름, 확률(0~1), 확률을 말로, 보정 요인 */
  check?: { label?: string; type?: string; chance: number; odds: string; icon: string; factors: Factor[]; hidden: boolean };
  /** 지난 생에서 골랐던 선택 */
  past?: boolean;
}

/** 기억의 파편으로 본 미래 한 갈래 */
export interface FutureBranch {
  /** 판정이 있으면: 성공 / 실패 */
  label?: string;
  chance?: number;
  /** 바뀌는 값: 숫자면 delta, 아니면 value */
  changes: { key: string; delta?: number; value?: Value }[];
  /** 이어지는 사건 제목 */
  events: string[];
  battle?: string;
  death?: string;
  /** 그 뒤에 또 고를 일이 있다 */
  more?: boolean;
}

export interface FutureOption {
  /** 선택지 번호 또는 활동 id */
  id: string;
  text: string;
  veiled?: boolean;
  disabled?: boolean;
  branches: FutureBranch[];
}

export interface Foresight {
  key: string;
  options: FutureOption[];
}

/** 죽어도 남는 것 (회귀해도 되돌아가지 않는다) */
export interface Meta {
  deaths: number;
  causes: string[];
  /** 기억의 파편으로 미래를 본 결정 자리 */
  foreseen: string[];
  /** 골랐던 선택 (지난 생 표시용) */
  chosen: string[];
  /** 가장 최근 죽음의 원인 */
  last?: string;
  /** 그 달 1주차 첫 칸의 자동 저장 */
  checkpoint?: Omit<GameState, 'meta'>;
}

export interface View {
  phase: GameState['phase'];
  time: string;
  title?: string;
  lines: RenderedLine[];
  choices: ChoiceView[];
  activities: { id: string; name: string; desc?: string }[];
  battle?: BattleView;
  /** 기억의 파편: 가진 수, 최대, 지금 미래를 보는 데 드는 값 (없으면 볼 수 없는 때) */
  memory: { shard: number; max: number; cost?: number; deaths: number };
  dead?: { cause: string };
}

interface SceneState {
  eventId: string;
  title?: string;
  lines: RenderedLine[];
  owner?: string;
  choices: { index: number; enabled: boolean }[];
  next?: string;
  then: 'endSlot' | 'dispatch';
  /** 이 장면이 끝나면 시작할 전투 (전투를 품은 결과 노드 경로) */
  battle?: string;
}

/** 방금 끝난 전투 (화면 연출용, 다음 입력 때 지워진다) */
export interface BattleEnd {
  enemy: string;
  result: 'win' | 'lose';
  log: BattleLine[];
  turns: number;
}

export interface GameState extends WorldState {
  phase: 'activity' | 'scene' | 'battle' | 'dead' | 'ended';
  scene?: SceneState;
  battle?: BattleState;
  lastBattle?: BattleEnd;
  queue: string[];
  slotFired: string[];
  trace: { time: string; kind: string; text: string }[];
  dead?: { cause: string };
  /** 지금 결정에 대해 본 미래 (결정이 바뀌면 쓸모없어진다) */
  foresight?: Foresight;
  meta: Meta;
}

export interface Observer {
  onEvent?(id: string): void;
  onChoices?(owner: string, shown: { index: number; enabled: boolean }[]): void;
  onChoose?(owner: string, index: number): void;
}

interface EnterResult {
  lines: RenderedLine[];
  owner?: Outcome;
  next?: string;
  battle?: string;
}

const outcomeIndexCache = new WeakMap<Content, Map<string, Outcome>>();

function outcomeIndex(c: Content): Map<string, Outcome> {
  let idx = outcomeIndexCache.get(c);
  if (!idx) {
    idx = new Map();
    const walk = (o: Outcome) => {
      idx!.set(o.path, o);
      o.branch.forEach(walk);
      if (o.success) walk(o.success);
      if (o.fail) walk(o.fail);
      if (o.battle?.win) walk(o.battle.win);
      if (o.battle?.lose) walk(o.battle.lose);
      o.choices.forEach(walk);
    };
    c.events.forEach(walk);
    outcomeIndexCache.set(c, idx);
  }
  return idx;
}

export class Game {
  readonly world: World;
  observer?: Observer;
  private guard = 0;

  /** 이 인스턴스에서 결과가 갈릴 수 있었던 판정 수 (목표 탐색기가 주사위를 분기점으로 쓰려고 센다. 상태 아님) */
  uncertainRolls = 0;

  /** 미래 보기용 복제본: 슬롯이 끝나는 순간 멈춘다 */
  private stopAtSlotEnd = false;
  /** 미래 보기용: 다음 판정 결과를 정해 둔다 */
  private forced: boolean[] = [];

  private constructor(readonly content: Content, readonly state: GameState) {
    this.world = new World(content, state);
    state.meta ??= { deaths: 0, causes: [], foreseen: [], chosen: [] };
  }

  static create(content: Content, build: Build, seed = 1, observer?: Observer): Game {
    const chk = checkBuild(content, build);
    if (!chk.ok) throw new Error('잘못된 캐릭터 빌드:\n' + chk.errors.join('\n'));
    const g = new Game(content, {
      vars: {},
      time: content.calendar.startTime,
      rng: seed >>> 0,
      phase: 'activity',
      queue: [],
      slotFired: [],
      trace: [],
      meta: { deaths: 0, causes: [], foreseen: [], chosen: [] },
    });
    g.observer = observer;
    applyBuild(g.world, build);
    g.beginSlot();
    return g;
  }

  clone(): Game {
    // 자동 저장(checkpoint)은 만들어진 뒤 바뀌지 않으므로 복제본끼리 나눠 쓴다 (깊은 복사는 비싸다)
    const { meta, ...rest } = this.state;
    const st = structuredClone(rest) as GameState;
    st.meta = { deaths: meta.deaths, causes: [...meta.causes], foreseen: [...meta.foreseen], chosen: [...meta.chosen], last: meta.last, checkpoint: meta.checkpoint };
    return new Game(this.content, st);
  }

  /** 저장해둔 state(JSON)로 이어하기 */
  static restore(content: Content, state: GameState): Game {
    return new Game(content, structuredClone(state));
  }

  get(name: string) {
    return this.world.get(name);
  }

  get ended() {
    return this.state.phase === 'ended';
  }

  // ------------------------------------------------------------ queries

  private now(): number {
    return this.content.calendar.ord(this.state.time);
  }

  private inTime(x: { window?: { from: number; to: number }; slots?: string[] }): boolean {
    const now = this.now();
    if (x.window && (now < x.window.from || now > x.window.to)) return false;
    if (x.slots && !x.slots.includes(this.content.calendar.slotName(this.state.time))) return false;
    return true;
  }

  eligible(e: EventDef): boolean {
    if (toNum(this.state.vars[`fired.${e.id}`]) >= e.repeat) return false;
    const last = this.state.vars[`last.${e.id}`];
    if (e.cooldown && last !== undefined && this.now() - toNum(last) < e.cooldown * 16) return false;
    return this.inTime(e) && test(e.when, this.world);
  }

  activities(): Activity[] {
    return [...this.content.activities.values()].filter((a) => this.inTime(a) && test(a.when, this.world));
  }

  /**
   * 스토리렛 선택: 조건이 맞는 후보 중 (priority, 구체성)이 가장 높은 그룹에서 weight 비율로 하나.
   * "가장 구체적인 것이 이긴다" 덕분에 특수 상황용 이벤트를 추가해도 기존 이벤트를 고칠 필요가 없다.
   */
  private pick(filter: (e: EventDef) => boolean): EventDef | undefined {
    let best: EventDef[] = [];
    let bestScore = -Infinity;
    for (const e of this.content.events.values()) {
      if (!filter(e) || !this.eligible(e)) continue;
      if (e.chance < 1 && this.world.random() >= e.chance) continue;
      const score = e.priority * 1000 + e.spec;
      if (score > bestScore) {
        best = [e];
        bestScore = score;
      } else if (score === bestScore) best.push(e);
    }
    if (best.length <= 1) return best[0];
    const total = best.reduce((a, e) => a + e.weight, 0);
    let r = this.world.random() * total;
    for (const e of best) {
      r -= e.weight;
      if (r <= 0) return e;
    }
    return best[best.length - 1];
  }

  // ------------------------------------------------------------ slot flow

  private beginSlot() {
    const t = this.state.time;
    // 자동 저장: 그 달 1주차 첫 칸 (또는 아직 저장이 없으면 지금)
    if (!this.state.meta.checkpoint || (t.w === 1 && t.s === 0)) this.saveCheckpoint();
    this.state.slotFired = [];
    this.world.set('time.roll', this.world.random());
    this.refreshNotes();
    this.dispatch();
  }

  private dispatch() {
    const queued = this.state.queue.shift();
    if (queued) {
      const ev = this.content.events.get(queued)!;
      return this.beginEvent(ev, ev.free ? 'dispatch' : 'endSlot');
    }
    const auto = this.pick((e) => e.trigger.kind === 'auto' && !this.state.slotFired.includes(e.id));
    if (auto) return this.beginEvent(auto, auto.free ? 'dispatch' : 'endSlot');
    this.state.phase = 'activity';
    this.state.scene = undefined;
  }

  private beginEvent(ev: EventDef, then: SceneState['then']) {
    if (++this.guard > 500) throw new Error(`이벤트 연쇄가 너무 깊음 (무한 루프?): ${ev.id}`);
    this.state.slotFired.push(ev.id);
    this.world.add(`fired.${ev.id}`, 1);
    this.world.set(`last.${ev.id}`, this.now());
    this.observer?.onEvent?.(ev.id);
    const r = this.enter(ev);
    this.showScene({ eventId: ev.id, title: ev.title, then }, r);
  }

  private showScene(base: Pick<SceneState, 'eventId' | 'title' | 'then'>, r: EnterResult) {
    const choices: SceneState['choices'] = [];
    r.owner?.choices.forEach((c, index) => {
      if (test(c.when, this.world)) choices.push({ index, enabled: test(c.requires, this.world) });
    });
    if (r.owner && choices.length) this.observer?.onChoices?.(r.owner.path, choices);
    this.state.phase = 'scene';
    this.state.scene = {
      ...base,
      lines: r.lines,
      owner: choices.length ? r.owner!.path : undefined,
      choices,
      next: r.next,
      battle: r.battle,
    };
    if (!r.lines.length && !choices.length) this.proceed();
  }

  private enter(o: Outcome): EnterResult {
    const w = this.world;
    const lines = renderLines(o.lines, w);
    if (o.art) lines.unshift({ speaker: '삽화', text: o.art });
    const before = this.watchBefore();
    w.applyAll(o.effects);
    lines.push(...this.watchAfter(before));
    for (const p of o.plants) {
      w.set(`fs.${p.id}.seen`, 1);
      if (truthy(w.get(`fs.${p.id}.noticed`))) continue;
      if (!p.notice || this.roll(p.notice)) {
        w.set(`fs.${p.id}.noticed`, 1);
        lines.push({ speaker: '📌', text: `복선 기록 — ${this.content.foreshadows.get(p.id)?.title ?? p.id}` });
      }
    }
    for (const f of o.pays) {
      const fresh = !truthy(w.get(`fs.${f}.paid`));
      w.set(`fs.${f}.paid`, 1);
      if (fresh && truthy(w.get(`fs.${f}.noticed`))) {
        lines.push({ speaker: '📌', text: `복선 회수 — ${this.content.foreshadows.get(f)?.title ?? f}` });
      }
    }
    if (o.battle) return { lines, next: o.next, battle: o.path };
    let owner = o.choices.length ? o : undefined;
    let next = o.next;
    let battle: string | undefined;
    const subs: Outcome[] = [];
    if (o.check) {
      const r = this.rollCheck(o.check);
      w.set('check.last', r.ok ? 1 : 0);
      w.set('check.grade', r.grade);
      if (!r.ev.hidden) {
        const key = keyFactor(r.ev.factors, r.ok);
        lines.push({
          speaker: '판정',
          text: `${r.ev.name} · ${GRADE_WORD[r.grade]} (주사위 ${r.d20})${key ? ` · ${key.label}${r.ok ? ' 덕분에' : '에 발목'}` : ''}`,
          check: {
            name: r.ev.name,
            icon: r.ev.icon,
            d20: r.d20,
            total: Math.floor(r.ev.value) + r.d20,
            dc: r.ev.dc,
            ok: r.ok,
            grade: r.grade,
            odds: r.ev.odds,
            factors: r.ev.factors,
            key,
          },
        });
      }
      const s = r.ok ? o.success : o.fail;
      if (s) subs.push(s);
      if (r.grade === 'great' && o.great) subs.push(o.great);
      if (r.grade === 'fumble' && o.fumble) subs.push(o.fumble);
    }
    if (o.branch.length) {
      const b = pickVariant(o.branch, (x) => test(x.when, w));
      if (b) subs.push(b);
    }
    for (const s of subs) {
      const r = this.enter(s);
      lines.push(...r.lines);
      if (r.owner) owner = r.owner;
      if (r.next) next = r.next;
      if (r.battle) battle = r.battle;
    }
    return { lines, owner: battle ? undefined : owner, next, battle };
  }

  /** 복선 알아채기 같은 숨은 판정: 값 + d20 >= 난이도 */
  private roll(ch: Check): boolean {
    const d20 = 1 + Math.floor(this.world.random() * 20);
    const ev = evalCheck(this.content, this.world, ch);
    const v = Math.floor(ev.value);
    if (v + 1 < ev.dc && v + 20 >= ev.dc) this.uncertainRolls++;
    return v + d20 >= ev.dc;
  }

  /** 선택지·결과의 판정 (보정 요인 포함) */
  private rollCheck(ch: Check): { ok: boolean; grade: ReturnType<typeof gradeOf>; d20: number; ev: CheckEval } {
    const ev = evalCheck(this.content, this.world, ch);
    let d20 = 1 + Math.floor(this.world.random() * 20);
    const v = Math.floor(ev.value);
    if (v + 1 < ev.dc && v + 20 >= ev.dc) this.uncertainRolls++;
    const f = this.forced.shift();
    if (f !== undefined) {
      // 미래 보기: 결과를 정해 두고 그에 맞는 눈을 고른다
      const need = Math.max(1, Math.min(20, ev.dc - v));
      d20 = f ? Math.max(need, Math.min(20, need + 5)) : Math.max(1, need - 6);
      if (f && v + d20 < ev.dc) d20 = 20;
      if (!f && v + d20 >= ev.dc) d20 = 1;
    }
    const ok = f ?? v + d20 >= ev.dc;
    const grade = f === undefined ? gradeOf(d20, v + d20, ev.dc) : ok ? 'ok' : 'fail';
    return { ok, grade, d20, ev };
  }

  // ------------------------------------------------------------ 변화 감시 (물건 획득, 원작 변화, 장비)

  private watchBefore(): { cross: Map<string, Value>; items: Map<string, number> } {
    const cross = new Map<string, Value>();
    for (const c of this.content.crossroads.values()) cross.set(c.key, this.state.vars[c.key]);
    const items = new Map<string, number>();
    for (const id of this.content.items.keys()) items.set(id, toNum(this.state.vars[`item.${id}`]));
    return { cross, items };
  }

  private watchAfter(b: ReturnType<Game['watchBefore']>): RenderedLine[] {
    const w = this.world;
    const out: RenderedLine[] = [];
    // 갈림길을 원작과 다르게 바꾸면 기억의 파편 +1
    for (const c of this.content.crossroads.values()) {
      const now = this.state.vars[c.key];
      if (b.cross.get(c.key) === undefined && now !== undefined && now !== c.canon) {
        const had = toNum(w.get('shard'));
        w.add('shard', 1);
        out.push({ speaker: '💠', text: toNum(w.get('shard')) > had ? `원작이 바뀌었다 · 기억의 파편 +1` : `원작이 바뀌었다` });
      }
    }
    // 물건을 얻으면 알리고, 빈 칸에 맞는 장비는 바로 찬다
    for (const [id, was] of b.items) {
      const n = toNum(this.state.vars[`item.${id}`]);
      if (n > was) {
        const it = this.content.items.get(id)!;
        out.push({ speaker: '🎒', text: `${it.name}${n - was > 1 ? ` ×${n - was}` : ''}` });
        if (it.kind === 'equip' && it.slot) {
          const slot = this.slotFor(it);
          if (slot && !this.state.vars[`equip.${slot}`] && !(it.slot !== '한벌옷' && this.state.vars['equip.한벌옷'] && (it.slot === '윗옷' || it.slot === '아래옷'))) {
            this.setEquip(it, slot);
          }
        }
      }
    }
    this.sanitizeGear();
    return out;
  }

  // ------------------------------------------------------------ 가방과 장비

  private slotFor(it: Item, prefer?: EquipSlot): EquipSlot | undefined {
    if (!it.slot) return undefined;
    if (it.slot !== '장신구') return it.slot as EquipSlot;
    if (prefer === '장신구1' || prefer === '장신구2') return prefer;
    return !this.state.vars['equip.장신구1'] ? '장신구1' : !this.state.vars['equip.장신구2'] ? '장신구2' : '장신구1';
  }

  private setEquip(it: Item, slot: EquipSlot) {
    if (slot === '한벌옷') {
      delete this.state.vars['equip.윗옷'];
      delete this.state.vars['equip.아래옷'];
    } else if (slot === '윗옷' || slot === '아래옷') delete this.state.vars['equip.한벌옷'];
    this.world.set(`equip.${slot}`, it.id);
  }

  /** 가진 수보다 많이 차고 있으면 벗긴다 (물건을 잃었을 때) */
  private sanitizeGear() {
    const used = new Map<string, number>();
    for (const slot of EQUIP_SLOTS) {
      const id = this.state.vars[`equip.${slot}`];
      if (typeof id !== 'string') continue;
      const n = (used.get(id) ?? 0) + 1;
      if (n > toNum(this.state.vars[`item.${id}`])) delete this.state.vars[`equip.${slot}`];
      else used.set(id, n);
    }
  }

  /** 가방을 만질 수 있는 때 (전투 중, 죽은 뒤엔 안 된다) */
  canManage(): boolean {
    return this.state.phase === 'activity' || this.state.phase === 'scene';
  }

  inventory(): { item: Item; count: number; equipped: string[] }[] {
    const out: { item: Item; count: number; equipped: string[] }[] = [];
    for (const it of this.content.items.values()) {
      const count = toNum(this.state.vars[`item.${it.id}`]);
      if (count <= 0) continue;
      const equipped = EQUIP_SLOTS.filter((s) => this.state.vars[`equip.${s}`] === it.id);
      out.push({ item: it, count, equipped });
    }
    return out;
  }

  equip(itemId: string, prefer?: EquipSlot) {
    if (!this.canManage()) throw new Error('지금은 장비를 바꿀 수 없음');
    const it = this.content.items.get(itemId);
    if (!it || it.kind !== 'equip') throw new Error(`장비가 아님: ${itemId}`);
    const count = toNum(this.state.vars[`item.${itemId}`]);
    const worn = EQUIP_SLOTS.filter((s) => this.state.vars[`equip.${s}`] === itemId).length;
    const slot = this.slotFor(it, prefer)!;
    if (this.state.vars[`equip.${slot}`] !== itemId && worn >= count) throw new Error(`가진 ${it.name}이(가) 모자람`);
    this.setEquip(it, slot);
  }

  unequip(slot: EquipSlot) {
    if (!this.canManage()) throw new Error('지금은 장비를 바꿀 수 없음');
    delete this.state.vars[`equip.${slot}`];
  }

  useItem(itemId: string): RenderedLine[] {
    if (!this.canManage()) throw new Error('지금은 물건을 쓸 수 없음');
    const it = this.content.items.get(itemId);
    if (!it || it.kind !== 'use' || toNum(this.state.vars[`item.${itemId}`]) < 1) throw new Error(`쓸 수 없는 물건: ${itemId}`);
    this.world.add(`item.${itemId}`, -1);
    this.world.applyAll(it.use);
    this.sanitizeGear();
    this.state.trace.push({ time: this.content.calendar.label(this.state.time), kind: '물건', text: it.name });
    return [{ speaker: '🎒', text: `${it.name}을(를) 썼다` }];
  }

  /** 시뮬레이터용: 칸마다 보정 합이 가장 큰 장비를 찬다 */
  autoEquip() {
    if (!this.canManage()) return;
    const score = (it: Item) =>
      Object.values(it.checks).reduce((a, x) => a + x, 0) + Object.values(it.battle).reduce((a, x) => a + x, 0);
    const inv = this.inventory().filter((x) => x.item.kind === 'equip');
    for (const slot of EQUIP_SLOTS) {
      const want = slot.startsWith('장신구') ? '장신구' : slot;
      const cands = inv.filter((x) => x.item.slot === want).sort((a, b) => score(b.item) - score(a.item));
      const pick = slot === '장신구2' ? cands.find((x) => x.item.id !== this.state.vars['equip.장신구1'] || x.count > 1) : cands[0];
      if (pick && this.state.vars[`equip.${slot}`] !== pick.item.id) {
        try {
          this.equip(pick.item.id, slot);
        } catch {
          /* 모자라면 그만 */
        }
      }
    }
  }

  // ------------------------------------------------------------ 죽음과 회귀

  private saveCheckpoint() {
    const { meta, ...rest } = this.state;
    void meta;
    this.state.meta.checkpoint = structuredClone({ ...rest, foresight: undefined });
  }

  private die(cause: string) {
    const m = this.state.meta;
    m.deaths++;
    m.last = cause;
    if (!m.causes.includes(cause)) m.causes.push(cause);
    this.state.phase = 'dead';
    this.state.dead = { cause };
    this.state.scene = undefined;
    this.state.foresight = undefined;
    this.state.trace.push({ time: this.content.calendar.label(this.state.time), kind: '죽음', text: cause });
  }

  /** 그 달 1주차 첫 칸으로 돌아간다. 기억(meta)은 남는다. */
  private regress() {
    const meta = this.state.meta;
    const cp = meta.checkpoint;
    if (!cp) throw new Error('돌아갈 자동 저장이 없음');
    const fresh = structuredClone(cp) as GameState;
    for (const k of Object.keys(this.state)) delete (this.state as unknown as Record<string, unknown>)[k];
    Object.assign(this.state, fresh, { meta });
    // 같은 주사위가 반복되지 않게 섞는다
    this.state.rng = (this.state.rng ^ Math.imul(meta.deaths, 0x9e3779b9)) >>> 0 || 1;
    const w = this.world;
    w.set('loop.count', meta.deaths);
    for (const c of meta.causes) w.set(`died.${c}`, 1);
    if (meta.last) w.set('loop.last', meta.last);
    w.set('loop.just', 1);
    this.state.trace.push({ time: this.content.calendar.label(this.state.time), kind: '회귀', text: `${meta.deaths}번째` });
    this.state.phase = 'activity';
    this.beginSlot();
  }

  private proceed() {
    const cause = this.state.vars['death'];
    if (typeof cause === 'string' && cause) return this.die(cause);
    const sc = this.state.scene!;
    if (sc.battle) return this.beginBattle(sc);
    if (sc.next) {
      const ev = this.content.events.get(sc.next);
      if (!ev) throw new Error(`없는 다음 이벤트: ${sc.next}`);
      return this.beginEvent(ev, sc.then);
    }
    this.state.scene = undefined;
    if (sc.then === 'endSlot') this.endSlot();
    else this.dispatch();
  }

  // ------------------------------------------------------------ battle

  private beginBattle(sc: SceneState) {
    const spec = outcomeIndex(this.content).get(sc.battle!)!.battle!;
    const ally = spec.ally ? evaluate(spec.ally.ast, this.world) : undefined;
    this.state.battle = startBattle(
      this.content,
      this.world,
      spec.enemy,
      typeof ally === 'string' ? ally : undefined,
      { path: sc.battle!, next: sc.next, then: sc.then, eventId: sc.eventId, title: sc.title },
      () => this.world.random(),
    );
    const enemy = this.content.enemies.get(spec.enemy)!;
    this.state.battle.log.unshift(
      ...renderLines(enemy.intro, this.world).map((l) => ({ who: 'sys' as const, text: l.speaker ? `${l.speaker}: “${l.text}”` : l.text })),
    );
    this.state.scene = undefined;
    this.state.phase = 'battle';
  }

  private finishBattle() {
    const b = this.state.battle!;
    const w = this.world;
    const spec = outcomeIndex(this.content).get(b.path)!.battle!;
    w.set('battle.result', b.result!);
    w.set('battle.turns', b.turn);
    if (b.result === 'win') w.set(`beat.${b.enemy}`, 1);
    w.add('fatigue', b.turn * 2);
    this.state.lastBattle = { enemy: b.enemy, result: b.result!, log: b.log, turns: b.turn };
    this.state.battle = undefined;
    const outcome = b.result === 'win' ? spec.win : spec.lose;
    const r: EnterResult = outcome ? this.enter(outcome) : { lines: [] };
    this.showScene({ eventId: b.eventId, title: b.title, then: b.then }, { ...r, next: r.next ?? b.next });
  }

  private endSlot() {
    if (this.stopAtSlotEnd) {
      this.state.phase = 'ended';
      this.state.scene = undefined;
      return;
    }
    const c = this.content;
    const w = this.world;
    w.applyAll(c.rules.hooks.slot_end);
    const prevYear = this.state.time.y;
    const adv = c.calendar.advance(this.state.time);
    this.state.time = adv.time;
    if (adv.week) w.applyAll(c.rules.hooks.week_end);
    if (adv.month) w.applyAll(c.rules.hooks.month_end);
    if (adv.year) {
      w.applyAll(c.rules.hooks.year_end);
      if (prevYear >= 1) this.decayMemory();
    }
    this.resolveDeadlines();
    if (this.now() > c.calendar.endOrd) {
      this.state.phase = 'ended';
      this.state.scene = undefined;
      return;
    }
    this.beginSlot();
  }

  /** 마감이 지난 갈림길은 원작대로 확정된다. "원작은 기본값"이라 개입하지 않으면 원작이 흘러간다. */
  private resolveDeadlines() {
    const now = this.now();
    for (const cr of this.content.crossroads.values()) {
      if (this.state.vars[cr.key] !== undefined || now <= cr.deadline) continue;
      this.world.set(cr.key, cr.canon);
      this.world.set(`crossroad.${cr.id}.canon`, 1);
      this.world.applyAll(cr.canonEffects);
      if (cr.canonEvent) this.state.queue.push(cr.canonEvent);
    }
  }

  private refreshNotes() {
    for (const n of this.content.notes.values()) {
      if (truthy(this.state.vars[`note.${n.id}.known`])) continue;
      if (test(n.when, this.world)) {
        this.world.set(`note.${n.id}.known`, 1);
        this.world.set(`note.${n.id}.grade`, n.grade);
      }
    }
  }

  /** 기억 풍화: 해가 바뀔 때 확실했던(★★★) 기억이 흐려질 수 있다. */
  private decayMemory() {
    const decay = this.content.rules.memoryDecay;
    if (!decay) return;
    const p = toNum(evaluate(decay.ast, this.world));
    for (const n of this.content.notes.values()) {
      const key = `note.${n.id}.grade`;
      if (truthy(this.state.vars[`note.${n.id}.known`]) && toNum(this.state.vars[key]) >= 3 && this.world.random() < p) {
        this.world.set(key, 2);
      }
    }
  }

  // ------------------------------------------------------------ input

  options(): Action[] {
    if (this.state.phase === 'ended') return [];
    if (this.state.phase === 'dead') return [{ type: 'regress' }];
    if (this.state.phase === 'activity') return this.activities().map((a) => ({ type: 'activity', id: a.id }));
    if (this.state.phase === 'battle') {
      return battleView(this.content, this.world, this.state.battle!)
        .skills.filter((k) => k.enabled)
        .map((k) => ({ type: 'battle', skill: k.id }));
    }
    const sc = this.state.scene!;
    if (sc.choices.length) return sc.choices.filter((c) => c.enabled).map((c) => ({ type: 'choice', index: c.index }));
    return [{ type: 'continue' }];
  }

  act(a: Action) {
    this.guard = 0;
    this.state.lastBattle = undefined;
    this.state.foresight = undefined;
    const label = this.content.calendar.label(this.state.time);
    if (this.state.phase === 'dead' && a.type === 'regress') return this.regress();
    if (this.state.phase === 'battle' && a.type === 'battle') {
      const b = this.state.battle!;
      const ok = battleView(this.content, this.world, b).skills.find((k) => k.id === a.skill && k.enabled);
      if (!ok) throw new Error(`지금 쓸 수 없는 기술: ${a.skill}`);
      this.state.trace.push({ time: label, kind: '전투', text: ok.name });
      takeTurn(this.content, this.world, b, a.skill, () => this.world.random());
      if (b.result) this.finishBattle();
      return;
    }
    if (this.state.phase === 'activity' && a.type === 'activity') {
      const act = this.activities().find((x) => x.id === a.id);
      if (!act) throw new Error(`지금 할 수 없는 활동: ${a.id}`);
      this.state.trace.push({ time: label, kind: '활동', text: act.name });
      this.world.add(`count.${act.id}`, 1);
      this.world.applyAll(act.effects);
      const ev = this.pick((e) => e.trigger.kind === 'activity' && e.trigger.ids.includes(act.id));
      if (ev) return this.beginEvent(ev, 'endSlot');
      return this.showScene({ eventId: '', title: act.name, then: 'endSlot' }, { lines: renderLines(act.lines, this.world) });
    }
    if (this.state.phase === 'scene' && a.type === 'choice') {
      const sc = this.state.scene!;
      const shown = sc.choices.find((c) => c.index === a.index);
      if (!shown || !shown.enabled) throw new Error(`고를 수 없는 선택지: ${a.index}`);
      const choice = outcomeIndex(this.content).get(sc.owner!)!.choices[a.index] as Choice;
      this.state.trace.push({ time: label, kind: '선택', text: choice.text });
      const ck = `${this.decisionKey()}#${a.index}`;
      if (!this.state.meta.chosen.includes(ck)) this.state.meta.chosen.push(ck);
      this.observer?.onChoose?.(sc.owner!, a.index);
      const r = this.enter(choice);
      return this.showScene({ eventId: sc.eventId, title: sc.title, then: sc.then }, { ...r, next: r.next ?? sc.next });
    }
    if (this.state.phase === 'scene' && a.type === 'continue' && !this.state.scene!.choices.length) {
      return this.proceed();
    }
    throw new Error(`지금 할 수 없는 입력: ${JSON.stringify(a)} (phase=${this.state.phase})`);
  }

  // ------------------------------------------------------------ presentation

  view(): View {
    const sc = this.state.scene;
    const owner = sc?.owner ? outcomeIndex(this.content).get(sc.owner) : undefined;
    return {
      phase: this.state.phase,
      time: this.state.phase === 'ended' ? '끝' : this.content.calendar.label(this.state.time),
      title: sc?.title,
      lines: sc?.lines ?? [],
      choices: (sc?.choices ?? []).map((c) => {
        const def = owner!.choices[c.index];
        const v: ChoiceView = { index: c.index, text: def.text, enabled: c.enabled, hint: def.hint };
        if (def.check) {
          const ev = evalCheck(this.content, this.world, def.check);
          v.check = { label: ev.name, type: ev.type, chance: ev.chance, odds: ev.odds, icon: ev.icon, factors: ev.factors.slice(0, 3), hidden: ev.hidden };
        }
        const key = this.decisionKey();
        if (key && this.state.meta.chosen.includes(`${key}#${c.index}`)) v.past = true;
        return v;
      }),
      activities: this.state.phase === 'activity' ? this.activities().map((a) => ({ id: a.id, name: a.name, desc: a.desc })) : [],
      battle: this.state.battle ? battleView(this.content, this.world, this.state.battle) : undefined,
      memory: {
        shard: toNum(this.world.get('shard')),
        max: toNum(this.world.get('shard.max')) || 3,
        cost: this.foresightCost(),
        deaths: this.state.meta.deaths,
      },
      dead: this.state.dead && this.state.phase === 'dead' ? this.state.dead : undefined,
    };
  }

  // ------------------------------------------------------------ 기억의 파편: 미래 보기

  /** 지금 결정 자리의 이름. 회귀해서 같은 자리에 오면 같은 이름이 된다. */
  decisionKey(): string | undefined {
    const st = this.state;
    if (st.phase === 'activity') {
      const t = st.time;
      return `a:${t.y}.${t.m}.${t.w}.${t.s}`;
    }
    if (st.phase === 'scene' && st.scene?.owner && st.scene.choices.length) {
      return `c:${st.scene.owner}:${toNum(st.vars[`fired.${st.scene.eventId}`])}`;
    }
    return undefined;
  }

  /** 미래를 보는 데 드는 파편 수 (0 = 이미 본 자리). 볼 수 없는 때면 undefined */
  foresightCost(): number | undefined {
    const key = this.decisionKey();
    if (!key) return undefined;
    return this.state.meta.foreseen.includes(key) ? 0 : 1;
  }

  /** 기억의 파편을 써서 (이미 본 자리면 공짜로) 지금 결정의 미래를 본다 */
  foresee(): Foresight {
    const key = this.decisionKey();
    if (!key) throw new Error('지금은 미래를 볼 수 없음');
    if (this.state.foresight?.key === key) return this.state.foresight;
    if (!this.state.meta.foreseen.includes(key)) {
      if (toNum(this.world.get('shard')) < 1) throw new Error('기억의 파편이 없음');
      this.world.add('shard', -1);
      this.state.meta.foreseen.push(key);
    }
    const options: FutureOption[] = [];
    if (this.state.phase === 'activity') {
      for (const a of this.activities()) {
        options.push({ id: a.id, text: a.name, branches: [this.future((g) => g.act({ type: 'activity', id: a.id }))] });
      }
    } else {
      const sc = this.state.scene!;
      const owner = outcomeIndex(this.content).get(sc.owner!)!;
      for (const c of sc.choices) {
        const def = owner.choices[c.index] as Choice;
        const opt: FutureOption = { id: String(c.index), text: def.text, branches: [] };
        if (def.veiled) opt.veiled = true;
        else if (!c.enabled) opt.disabled = true;
        else if (def.check) {
          const ev = evalCheck(this.content, this.world, def.check);
          opt.branches.push({ ...this.future((g) => g.act({ type: 'choice', index: c.index }), true), label: '성공', chance: ev.chance });
          opt.branches.push({ ...this.future((g) => g.act({ type: 'choice', index: c.index }), false), label: '실패', chance: 1 - ev.chance });
        } else opt.branches.push(this.future((g) => g.act({ type: 'choice', index: c.index })));
        options.push(opt);
      }
    }
    this.state.foresight = { key, options };
    return this.state.foresight;
  }

  /** 복제본에서 실제로 한 번 해 보고 무엇이 바뀌는지 본다 (슬롯이 끝나거나 다음 결정이 오면 멈춤) */
  private future(run: (g: Game) => void, forced?: boolean): FutureBranch {
    const g = this.clone();
    g.stopAtSlotEnd = true;
    if (forced !== undefined) g.forced = [forced];
    const fired: string[] = [];
    g.observer = { onEvent: (id) => fired.push(id) };
    const before = { ...g.state.vars };
    const here = this.state.scene?.eventId;
    try {
      run(g);
      for (let i = 0; i < 60 && g.state.phase === 'scene' && !g.state.scene!.choices.length; i++) g.act({ type: 'continue' });
    } catch {
      /* 미래가 깨지면 본 데까지만 */
    }
    const changes: FutureBranch['changes'] = [];
    const cross = new Set([...this.content.crossroads.values()].map((c) => c.key));
    const keys = new Set([...Object.keys(before), ...Object.keys(g.state.vars)]);
    for (const k of keys) {
      const a = before[k];
      const b = g.state.vars[k];
      if (a === b) continue;
      const interesting =
        cross.has(k) ||
        /^(stat|affinity|item|talent|skill)\./.test(k) ||
        /^note\.[^.]+\.known$/.test(k) ||
        ['money', 'fatigue', 'stress', 'shard'].includes(k);
      if (!interesting) continue;
      if (typeof a !== 'string' && typeof b !== 'string' && !cross.has(k)) {
        const d = toNum(b) - toNum(a);
        if (Math.abs(d) >= 0.05) changes.push({ key: k, delta: Math.round(d * 100) / 100 });
      } else changes.push({ key: k, value: b });
    }
    const events = [...new Set(fired.filter((id) => id !== here).map((id) => this.content.events.get(id)?.title).filter((x): x is string => !!x))];
    const br: FutureBranch = { changes, events };
    if (g.state.phase === 'battle') br.battle = this.content.enemies.get(g.state.battle!.enemy)?.name;
    const death = g.state.vars['death'];
    if (typeof death === 'string' && death) br.death = death;
    if (g.state.phase === 'scene' && g.state.scene!.choices.length) br.more = true;
    return br;
  }

  /** 활동을 고르면 바로 바뀌는 수치 (지금 상태로 계산한 값) */
  preview(activityId: string): { key: string; delta: number }[] {
    const a = this.content.activities.get(activityId);
    if (!a) return [];
    const out: { key: string; delta: number }[] = [];
    for (const e of a.effects) {
      if (e.op === '=') continue;
      let delta = toNum(evaluate(e.value.ast, this.world)) * (e.op === '-=' ? -1 : 1);
      if (delta > 0 && e.target.startsWith('stat.')) delta *= Math.max(0, 1 + toNum(this.world.get(`growth.${e.target.slice(5)}`)));
      out.push({ key: e.target, delta });
    }
    return out;
  }

  status(): { label: string; value: string }[] {
    const out = this.content.rules.status.map((s) => {
      const v = this.world.get(s.key);
      return { label: s.label, value: typeof v === 'number' ? String(Math.floor(v)) : String(v ?? '-') };
    });
    out.push({ label: '원작 붕괴도', value: `${this.world.collapse()}%` });
    return out;
  }

  /** 보이는 목표들. status: active / done / failed */
  goals(): { id: string; title: string; status: 'active' | 'done' | 'failed'; hint: string }[] {
    const out: { id: string; title: string; status: 'active' | 'done' | 'failed'; hint: string }[] = [];
    for (const g of this.content.goals.values()) {
      if (!test(g.when, this.world)) continue;
      const done = g.done ? test(g.done, this.world) : false;
      const failed = !done && g.failed ? test(g.failed, this.world) : false;
      const hint = renderLines(g.hints, this.world).map((l) => l.text).join(' ');
      out.push({ id: g.id, title: renderTemplate(g.title, this.world), status: done ? 'done' : failed ? 'failed' : 'active', hint });
    }
    return out;
  }

  /** 다가오는 학사 일정 (announce가 있는 강제 이벤트) */
  upcoming(limit = 4): { label: string; time: string; weeks: number }[] {
    const now = this.now();
    const out: { label: string; time: string; weeks: number; ord: number }[] = [];
    for (const e of this.content.events.values()) {
      if (!e.announce || !e.window || e.window.from < now || this.state.vars[`fired.${e.id}`]) continue;
      out.push({
        label: e.announce,
        time: this.content.calendar.labelOrd(e.window.from),
        weeks: Math.floor(e.window.from / 16) - Math.floor(now / 16),
        ord: e.window.from,
      });
    }
    return out.sort((a, b) => a.ord - b.ord).slice(0, limit);
  }

  /** 만난 사람들 */
  relationships(): { id: string; name: string; affinity: number; rank: number; trust: number; memo: string }[] {
    const out: { id: string; name: string; affinity: number; rank: number; trust: number; memo: string }[] = [];
    for (const ch of this.content.characters.values()) {
      if (!test(ch.met, this.world)) continue;
      const affinity = Math.floor(toNum(this.world.get(`affinity.${ch.id}`)));
      out.push({
        id: ch.id,
        name: ch.name,
        affinity,
        rank: Math.floor(affinity / 10),
        trust: toNum(this.world.get(`trust.${ch.id}`)),
        memo: renderLines(ch.memo, this.world).map((l) => l.text).join(' '),
      });
    }
    return out.sort((a, b) => b.affinity - a.affinity);
  }

  notes(): (Note & ReturnType<World['noteStatus']>)[] {
    return [...this.content.notes.values()]
      .map((n) => ({ ...n, ...this.world.noteStatus(n) }))
      .filter((n) => n.known);
  }
}
