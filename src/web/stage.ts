// 무대: 배경 삽화 위에 인물 흉상이 서고, 아래 대사창에 글이 한 자씩 찍힌다 (비주얼 노벨식).
// 스크롤 대신 장면이 바뀐다. 지난 내용은 '기록'에서 본다.

import { iconUrl } from './visuals';
import { reduceMotion, sfx } from './fx';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, reduceMotion() ? Math.min(ms, 60) : ms));

export interface ActorSpec {
  key: string;
  /** 기본·깜빡임·말하기 3프레임 가로 스프라이트 (192×64) */
  sheet: string;
  name: string;
}

interface Actor {
  key: string;
  el: HTMLElement;
  img: HTMLElement;
  slot: number;
  blinkTimer: number;
  talkTimer: number;
  mood: string;
  last: number;
}

export class Stage {
  readonly root: HTMLElement;
  private bgA: HTMLImageElement;
  private bgB: HTMLImageElement;
  private front: 'a' | 'b' = 'a';
  private actorsEl: HTMLElement;
  readonly fxEl: HTMLElement;
  private cardEl: HTMLElement;
  private titleEl: HTMLElement;
  readonly hudEl: HTMLElement;
  private actors = new Map<string, Actor>();
  private tick = 0;
  bgKey = '';

  constructor(root: HTMLElement) {
    this.root = root;
    root.replaceChildren();
    const bg = el('div', 'st-bg');
    this.bgA = el('img', 'st-bgimg on');
    this.bgB = el('img', 'st-bgimg');
    for (const i of [this.bgA, this.bgB]) {
      i.alt = '';
      i.setAttribute('aria-hidden', 'true');
    }
    bg.append(this.bgA, this.bgB);
    this.actorsEl = el('div', 'st-actors');
    this.hudEl = el('div', 'st-hud');
    this.fxEl = el('div', 'st-fx');
    this.cardEl = el('div', 'st-card');
    this.cardEl.hidden = true;
    this.titleEl = el('div', 'st-title');
    root.append(bg, this.actorsEl, this.hudEl, this.fxEl, this.titleEl, this.cardEl);
  }

  // ------------------------------------------------------------ 배경

  /** 배경을 바꾼다. 같은 그림이면 아무것도 하지 않는다 */
  setBackground(key: string, url: string, mode: 'fade' | 'flash' | 'cut' = 'fade') {
    if (key === this.bgKey) return;
    this.bgKey = key;
    const next = this.front === 'a' ? this.bgB : this.bgA;
    const cur = this.front === 'a' ? this.bgA : this.bgB;
    next.src = url;
    if (mode === 'cut' || reduceMotion()) {
      next.classList.add('on', 'now');
      cur.classList.remove('on');
      window.setTimeout(() => next.classList.remove('now'), 30);
    } else {
      next.classList.add('on');
      cur.classList.remove('on');
      if (mode === 'flash') this.flash('white');
      else sfx('whoosh');
    }
    this.front = this.front === 'a' ? 'b' : 'a';
  }

  // ------------------------------------------------------------ 인물

  /** 인물을 무대에 세운다 (없으면 등장시킨다). 최대 두 명 */
  showActor(spec: ActorSpec, mood: string, intro = false): void {
    let a = this.actors.get(spec.key);
    if (!a) {
      const used = new Set([...this.actors.values()].map((x) => x.slot));
      let slot = this.actors.size === 0 ? 1 : [0, 2].find((s) => !used.has(s)) ?? 2;
      if (this.actors.size === 1) {
        // 혼자 서 있던 사람은 왼쪽으로 비켜선다
        const only = [...this.actors.values()][0];
        if (only.slot === 1) this.place(only, 0);
        slot = 2;
      }
      if (this.actors.size >= 2) {
        // 가장 오래 말하지 않은 사람이 퇴장
        const old = [...this.actors.values()].sort((x, y) => x.last - y.last)[0];
        slot = old.slot;
        this.removeActor(old.key);
      }
      const box = el('div', `actor enter${intro ? ' intro' : ''}`);
      box.dataset.key = spec.key;
      const img = el('div', 'actor-img');
      img.style.backgroundImage = `url(${spec.sheet})`;
      box.append(img);
      this.actorsEl.append(box);
      a = { key: spec.key, el: box, img, slot, blinkTimer: 0, talkTimer: 0, mood, last: 0 };
      this.actors.set(spec.key, a);
      this.place(a, slot);
      this.scheduleBlink(a);
      window.setTimeout(() => box.classList.remove('enter', 'intro'), 600);
    } else if (a.mood !== mood || a.img.style.backgroundImage !== `url("${spec.sheet}")`) {
      a.img.style.backgroundImage = `url(${spec.sheet})`;
    }
    if (a.mood !== mood) this.react(a, mood);
    a.mood = mood;
  }

  private place(a: Actor, slot: number) {
    a.slot = slot;
    a.el.style.setProperty('--x', ['24%', '50%', '76%'][slot]);
  }

  /** 지금 말하는 사람만 밝게 */
  focus(key: string | null) {
    this.tick++;
    for (const a of this.actors.values()) {
      const on = a.key === key;
      a.el.classList.toggle('speaking', on);
      a.el.classList.toggle('idle', !on);
      if (on) a.last = this.tick;
    }
  }

  removeActor(key: string) {
    const a = this.actors.get(key);
    if (!a) return;
    window.clearTimeout(a.blinkTimer);
    window.clearInterval(a.talkTimer);
    this.actors.delete(key);
    a.el.classList.add('leave');
    window.setTimeout(() => a.el.remove(), 350);
  }

  clearActors() {
    for (const k of [...this.actors.keys()]) this.removeActor(k);
  }

  setActorsHidden(hidden: boolean) {
    this.actorsEl.classList.toggle('hidden', hidden);
  }

  hasActor(key: string) {
    return this.actors.has(key);
  }

  actorEl(key: string): HTMLElement | undefined {
    return this.actors.get(key)?.el;
  }

  private scheduleBlink(a: Actor) {
    if (reduceMotion()) return;
    a.blinkTimer = window.setTimeout(() => {
      if (!a.img.classList.contains('talk')) {
        a.img.classList.add('blink');
        window.setTimeout(() => a.img.classList.remove('blink'), 130);
      }
      this.scheduleBlink(a);
    }, 2200 + Math.random() * 3200);
  }

  /** 말하는 동안 입을 움직인다 */
  talk(key: string, on: boolean) {
    const a = this.actors.get(key);
    if (!a) return;
    window.clearInterval(a.talkTimer);
    a.img.classList.remove('talk');
    if (on && !reduceMotion()) {
      a.talkTimer = window.setInterval(() => a.img.classList.toggle('talk'), 120);
    }
  }

  stopTalking() {
    for (const a of this.actors.values()) this.talk(a.key, false);
  }

  /** 표정이 바뀔 때의 몸짓 */
  private react(a: Actor, mood: string) {
    const cls = { 놀람: 'r-hop', 웃음: 'r-bounce', 화남: 'r-shake', 슬픔: 'r-sink', 당황: 'r-wobble', 진지: 'r-lean' }[mood];
    if (!cls || reduceMotion()) return;
    a.el.classList.remove('r-hop', 'r-bounce', 'r-shake', 'r-sink', 'r-wobble', 'r-lean');
    void a.el.offsetWidth;
    a.el.classList.add(cls);
  }

  /** 지정한 인물에 효과 클래스를 다시 건다 */
  hit(key: string, cls: string) {
    const a = this.actors.get(key);
    if (!a) return;
    a.el.classList.remove(cls);
    void a.el.offsetWidth;
    a.el.classList.add(cls);
  }

  // ------------------------------------------------------------ 연출

  shake(power: 'small' | 'big' = 'small') {
    if (reduceMotion()) return;
    const c = power === 'big' ? 'shake-big' : 'shake';
    this.root.classList.remove('shake', 'shake-big');
    void this.root.offsetWidth;
    this.root.classList.add(c);
  }

  flash(color: 'white' | 'red' | 'gold' | 'blue') {
    if (reduceMotion()) return;
    const f = el('div', `st-flash ${color}`);
    this.fxEl.append(f);
    window.setTimeout(() => f.remove(), 600);
  }

  /** 무대 위에 잠깐 떠오르는 글자 (피해 숫자, "막았다!") */
  pop(text: string, x: number, y: number, cls = '') {
    const p = el('div', `st-pop ${cls}`, text);
    p.style.left = `${x}%`;
    p.style.top = `${y}%`;
    this.fxEl.append(p);
    window.setTimeout(() => p.remove(), 1300);
  }

  /** 베기 궤적 */
  slash(x: number, y: number, kind: 'slash' | 'magic' | 'claw' = 'slash') {
    if (reduceMotion()) return;
    const s = el('div', `st-slash ${kind}`);
    s.style.left = `${x}%`;
    s.style.top = `${y}%`;
    this.fxEl.append(s);
    window.setTimeout(() => s.remove(), 500);
  }

  /** 불꽃 튀는 입자 */
  burst(x: number, y: number, color: string, n = 10) {
    if (reduceMotion()) return;
    for (let i = 0; i < n; i++) {
      const d = el('i', 'st-spark');
      const th = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const r = 30 + Math.random() * 50;
      d.style.left = `${x}%`;
      d.style.top = `${y}%`;
      d.style.background = color;
      d.style.setProperty('--dx', `${Math.cos(th) * r}px`);
      d.style.setProperty('--dy', `${Math.sin(th) * r}px`);
      this.fxEl.append(d);
      window.setTimeout(() => d.remove(), 700);
    }
  }

  /** 오른쪽 위에 차례로 떠오르는 수치 칩 */
  chips(items: { icon?: string; text: string; tone: 'up' | 'down' | 'bond' }[]) {
    const box = el('div', 'st-chips');
    items.forEach((it, i) => {
      const c = el('span', `st-chip ${it.tone}`);
      if (it.icon) {
        const im = el('img', 'px');
        im.src = iconUrl(it.icon);
        im.width = 16;
        im.height = 16;
        im.alt = '';
        c.append(im);
      }
      c.append(it.text);
      c.style.animationDelay = `${i * 110}ms`;
      box.append(c);
    });
    this.fxEl.append(box);
    window.setTimeout(() => box.remove(), 2600 + items.length * 110);
  }

  /** 장면 제목 띠 */
  title(when: string, title?: string) {
    this.titleEl.replaceChildren(el('span', 'tw', when));
    if (title) this.titleEl.append(el('b', undefined, title));
    this.titleEl.classList.remove('show');
    void this.titleEl.offsetWidth;
    this.titleEl.classList.add('show');
  }

  /** 가운데 카드 (주·달 넘김, 전투 개시 …) */
  card(content: HTMLElement, cls = '') {
    this.cardEl.className = `st-card ${cls}`;
    this.cardEl.replaceChildren(content);
    this.cardEl.hidden = false;
    void this.cardEl.offsetWidth;
    this.cardEl.classList.add('show');
  }

  hideCard() {
    this.cardEl.classList.remove('show');
    window.setTimeout(() => {
      if (!this.cardEl.classList.contains('show')) this.cardEl.hidden = true;
    }, 300);
  }

  /** 주사위가 굴러와서 멈춘다. 반환: 멈춘 뒤 */
  async dice(final: number, ok: boolean, label: string): Promise<void> {
    const box = el('div', 'st-dice');
    const die = el('div', 'st-die');
    const im = el('img', 'px');
    im.src = iconUrl('dice');
    im.alt = '';
    const num = el('b', undefined, '?');
    die.append(im, num);
    const cap = el('div', 'st-dice-cap', label);
    box.append(die, cap);
    this.fxEl.append(box);
    sfx('dice');
    if (!reduceMotion()) {
      for (let i = 0; i < 12; i++) {
        num.textContent = String(1 + Math.floor(Math.random() * 20));
        await sleep(55);
      }
    }
    num.textContent = String(final);
    box.classList.add('landed');
    await sleep(160);
    const stamp = el('div', `st-stamp ${ok ? 'ok' : 'ng'}`, final === 20 && ok ? '대성공' : final === 1 && !ok ? '대실패' : ok ? '성공' : '실패');
    box.append(stamp);
    if (final === 20 && ok) {
      this.flash('gold');
      this.burst(50, 42, '#ffd36b', 16);
      sfx('crit');
    } else if (!ok) {
      this.shake('small');
      sfx('hurt');
    } else sfx('pick');
    window.setTimeout(() => box.classList.add('out'), 2200);
    window.setTimeout(() => box.remove(), 2600);
  }

  clearFx() {
    this.fxEl.replaceChildren();
  }
}

// ---------------------------------------------------------------- 대사창

export class Dialog {
  readonly root: HTMLElement;
  private nameEl: HTMLElement;
  private faceEl: HTMLElement;
  private textEl: HTMLElement;
  private nextEl: HTMLElement;
  private typing: { done: () => void; full: () => void } | null = null;
  /** 빨리 넘기기: 글자를 한 번에 찍는다 */
  fast = false;

  constructor(root: HTMLElement) {
    this.root = root;
    root.replaceChildren();
    const plate = el('div', 'dl-plate');
    this.faceEl = el('span', 'dl-face');
    this.nameEl = el('span', 'dl-name');
    plate.append(this.faceEl, this.nameEl);
    this.textEl = el('div', 'dl-text');
    this.nextEl = el('div', 'dl-next', '▼');
    root.append(plate, this.textEl, this.nextEl);
  }

  get isTyping() {
    return !!this.typing;
  }

  /** 글자를 한 자씩 찍는다. 다 찍히면 resolve */
  show(opts: { kind: 'narr' | 'say' | 'inner' | 'sys' | 'check' | 'battle' | 'prompt'; name?: string; face?: HTMLElement; lines: (string | HTMLElement)[]; speed?: number; onTick?: () => void }): Promise<void> {
    this.complete();
    this.root.className = `dialog k-${opts.kind}`;
    this.nameEl.textContent = opts.name ?? '';
    this.faceEl.replaceChildren();
    if (opts.face) this.faceEl.append(opts.face);
    this.root.classList.toggle('has-name', !!opts.name);
    this.nextEl.classList.remove('on');
    this.textEl.replaceChildren();
    // 문단마다 빈 span을 만들어 두고 글자를 채운다
    const targets: { span: HTMLElement; text: string }[] = [];
    for (const l of opts.lines) {
      if (typeof l === 'string') {
        const p = el('p');
        const span = el('span');
        p.append(span);
        this.textEl.append(p);
        targets.push({ span, text: l });
      } else this.textEl.append(l);
    }
    const speed = this.fast ? 0 : opts.speed ?? 24;
    if (reduceMotion() || speed <= 0) {
      for (const t of targets) t.span.textContent = t.text;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let ti = 0;
      let ci = 0;
      let timer = 0;
      const finish = () => {
        window.clearInterval(timer);
        for (const t of targets) t.span.textContent = t.text;
        this.typing = null;
        resolve();
      };
      this.typing = { done: finish, full: finish };
      timer = window.setInterval(() => {
        if (ti >= targets.length) return finish();
        const t = targets[ti];
        ci += 1;
        t.span.textContent = t.text.slice(0, ci);
        if (ci % 3 === 0) opts.onTick?.();
        if (ci >= t.text.length) {
          ti++;
          ci = 0;
        }
      }, speed);
    });
  }

  /** 찍던 글을 한 번에 다 보여준다 */
  complete() {
    this.typing?.full();
  }

  ready(on: boolean) {
    this.nextEl.classList.toggle('on', on);
  }

  clear() {
    this.complete();
    this.root.className = 'dialog';
    this.nameEl.textContent = '';
    this.faceEl.replaceChildren();
    this.textEl.replaceChildren();
    this.nextEl.classList.remove('on');
  }
}
