// 게임 진행 루프.
//
// 한 슬롯(시간 칸)의 흐름:
//   1. 강제 이벤트 (on: auto) 중 조건이 맞는 것 → 가장 구체적인 하나가 발생
//   2. 없으면 플레이어가 활동을 고름 → 그 활동에 걸린 스토리렛 중 가장 구체적인 하나가 발생
//   3. 장면 → 선택지 → 결과 (분기/판정/다음 이벤트로 연결)
//   4. 슬롯 종료 → 시간 진행 → 마감된 갈림길은 "원작대로" 자동 결정
//
// 상태는 전부 직렬화 가능한 값이라서 clone()이 싸다. 시뮬레이터와 목표 탐색기가 이걸 이용한다.

import { applyBuild, checkBuild, type Build } from './creation';
import type { Activity, Choice, Content, EventDef, Note, Outcome } from './content';
import { evaluate, test, toNum, truthy } from './expr';
import { pickVariant, renderLines, renderTemplate, type RenderedLine } from './text';
import { World, type WorldState } from './world';

export type Action = { type: 'activity'; id: string } | { type: 'choice'; index: number } | { type: 'continue' };

export interface ChoiceView {
  index: number;
  text: string;
  enabled: boolean;
  hint?: string;
}

export interface View {
  phase: GameState['phase'];
  time: string;
  title?: string;
  lines: RenderedLine[];
  choices: ChoiceView[];
  activities: { id: string; name: string; desc?: string }[];
}

interface SceneState {
  eventId: string;
  title?: string;
  lines: RenderedLine[];
  owner?: string;
  choices: { index: number; enabled: boolean }[];
  next?: string;
  then: 'endSlot' | 'dispatch';
}

export interface GameState extends WorldState {
  phase: 'activity' | 'scene' | 'ended';
  scene?: SceneState;
  queue: string[];
  slotFired: string[];
  trace: { time: string; kind: string; text: string }[];
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

  private constructor(readonly content: Content, readonly state: GameState) {
    this.world = new World(content, state);
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
    });
    g.observer = observer;
    applyBuild(g.world, build);
    g.beginSlot();
    return g;
  }

  clone(): Game {
    return new Game(this.content, structuredClone(this.state));
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
    this.state.scene = { ...base, lines: r.lines, owner: choices.length ? r.owner!.path : undefined, choices, next: r.next };
    if (!r.lines.length && !choices.length) this.proceed();
  }

  private enter(o: Outcome): EnterResult {
    const w = this.world;
    const lines = renderLines(o.lines, w);
    w.applyAll(o.effects);
    for (const p of o.plants) {
      w.set(`fs.${p.id}.seen`, 1);
      if (truthy(w.get(`fs.${p.id}.noticed`))) continue;
      if (!p.notice || this.roll(p.notice.value, p.notice.dc)) {
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
    let owner = o.choices.length ? o : undefined;
    let next = o.next;
    const subs: Outcome[] = [];
    if (o.check) {
      const r = this.rollDetail(o.check.value, o.check.dc);
      const ok = r.ok;
      w.set('check.last', ok ? 1 : 0);
      if (o.check.label) {
        lines.push({
          speaker: '판정',
          text: `${o.check.label} · ${Math.floor(r.value)} + 주사위 ${r.d20} = ${Math.floor(r.value) + r.d20} / 목표 ${o.check.dc} · ${ok ? '성공' : '실패'}`,
        });
      }
      const s = ok ? o.success : o.fail;
      if (s) subs.push(s);
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
    }
    return { lines, owner, next };
  }

  /** 판정: 값 + d20 >= 난이도 */
  private roll(value: { ast: Parameters<typeof evaluate>[0] }, dc: number): boolean {
    return this.rollDetail(value, dc).ok;
  }

  private rollDetail(value: { ast: Parameters<typeof evaluate>[0] }, dc: number) {
    const d20 = 1 + Math.floor(this.world.random() * 20);
    const v = toNum(evaluate(value.ast, this.world));
    return { ok: Math.floor(v) + d20 >= dc, value: v, d20 };
  }

  private proceed() {
    const sc = this.state.scene!;
    if (sc.next) {
      const ev = this.content.events.get(sc.next);
      if (!ev) throw new Error(`없는 다음 이벤트: ${sc.next}`);
      return this.beginEvent(ev, sc.then);
    }
    this.state.scene = undefined;
    if (sc.then === 'endSlot') this.endSlot();
    else this.dispatch();
  }

  private endSlot() {
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
    if (this.state.phase === 'activity') return this.activities().map((a) => ({ type: 'activity', id: a.id }));
    const sc = this.state.scene!;
    if (sc.choices.length) return sc.choices.filter((c) => c.enabled).map((c) => ({ type: 'choice', index: c.index }));
    return [{ type: 'continue' }];
  }

  act(a: Action) {
    this.guard = 0;
    const label = this.content.calendar.label(this.state.time);
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
        return { index: c.index, text: def.text, enabled: c.enabled, hint: def.hint };
      }),
      activities: this.state.phase === 'activity' ? this.activities().map((a) => ({ id: a.id, name: a.name, desc: a.desc })) : [],
    };
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
