// 브라우저 플레이 화면. 엔진은 터미널 버전과 똑같은 것을 쓴다.
// 콘텐츠(YAML)는 빌드 시 JSON으로 바뀌어 window.__HERO_CONTENT__로 들어온다.

import { buildContent, checkBuild, randomBuild, test, type Action, type Build, type Content } from '../engine';
import { applyBuild } from '../engine/creation';
import { Game, type GameState } from '../engine/game';
import type { RenderedLine } from '../engine/text';
import { World } from '../engine/world';

declare global {
  interface Window {
    __HERO_CONTENT__: Record<string, unknown>;
    claude?: { hot?: { snapshot?: (fn: () => unknown) => void; ready?: (fn: (data: unknown) => void) => void; data?: unknown } };
  }
}

type LogItem =
  | { k: 'scene'; when: string; title?: string; lines: RenderedLine[]; cont?: boolean; flavor?: boolean }
  | { k: 'act'; text: string; deltas?: string[] }
  | { k: 'week'; title: string; items: string[] };
interface Save {
  v: 1;
  build: Build;
  state: GameState;
  log: LogItem[];
  weekKey?: string;
  weekSnap?: Record<string, number>;
}
type Tab = 'goals' | 'status' | 'people' | 'notes' | 'fate';

const content: Content = buildContent({ files: window.__HERO_CONTENT__ });
const cal = content.calendar;
const SAVE_KEY = 'hero-academy-save-v1';
const CATEGORIES = ['신체', '마력', '정신', '사회', '특수'];
const NO_ENV = { get: () => undefined };

let build: Build = exampleBuild();
let game: Game | null = null;
let log: LogItem[] = [];
let rendered = 0;
let tab: Tab = 'goals';
let weekKey = '';
let weekSnap: Record<string, number> = {};

// ------------------------------------------------------------ helpers

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const $ = (id: string) => document.getElementById(id)!;

function button(cls: string, text: string, onClick: () => void, key?: string): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  if (key) b.dataset.key = key;
  return b;
}

function grade(v: number): string {
  return v >= 95 ? 'SS' : v >= 80 ? 'S' : v >= 65 ? 'A' : v >= 50 ? 'B' : v >= 35 ? 'C' : v >= 20 ? 'D' : v >= 10 ? 'E' : 'F';
}

function deadlineText(label: string): string {
  const [y, m, w] = label.split('.');
  return `${y}학년 ${m}월${w ? ` ${w}주차` : ''}까지`;
}

function twoStep(b: HTMLButtonElement, armedText: string, run: () => void) {
  const original = b.textContent!;
  let armed = false;
  let timer = 0;
  b.addEventListener('click', () => {
    if (armed) {
      window.clearTimeout(timer);
      run();
      return;
    }
    armed = true;
    b.textContent = armedText;
    b.classList.add('danger');
    timer = window.setTimeout(() => {
      armed = false;
      b.textContent = original;
      b.classList.remove('danger');
    }, 4000);
  });
}

// ------------------------------------------------------------ save

function snapshot(): Save | null {
  return game ? { v: 1, build, state: game.state, log: log.slice(-150), weekKey, weekSnap } : null;
}
function readSave(): Save | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && s.v === 1 && s.state && s.build ? (s as Save) : null;
  } catch {
    return null;
  }
}
function writeSave() {
  try {
    const s = snapshot();
    if (s) localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* 저장이 막힌 환경에서는 그냥 진행 */
  }
}
function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 무시 */
  }
}

// ------------------------------------------------------------ character creation

function exampleBuild(): Build {
  return {
    name: '한결',
    origin: '평민장학생',
    perks: ['고인물의기억'],
    talents: [{ id: '병약' }, { id: '마나탱크' }, { id: '마도학재능' }, { id: '직감' }],
    alloc: { 지성: 2, 의지: 1 },
  };
}

function previewStats(): Record<string, number> {
  const w = new World(content, { vars: {}, time: cal.startTime, rng: 1 });
  try {
    applyBuild(w, build);
  } catch {
    /* 잘못된 빌드는 미리보기만 생략 */
  }
  return Object.fromEntries(content.rules.stats.map((s) => [s, Math.floor(Number(w.get(`stat.${s}`) ?? 0))]));
}

function setBuild(next: Build) {
  build = next;
  renderCreate();
}

function renderCreate() {
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key;
  const root = $('screen-create');
  const scroll = root.scrollTop;
  root.replaceChildren();
  const grid = el('div', 'create-grid');
  const main = el('div');
  const ledger = el('aside', 'ledger');
  grid.append(main, ledger);
  root.append(grid);

  const chk = checkBuild(content, build);
  const origin = content.origins.get(build.origin)!;
  const chosen = [...origin.talents, ...build.talents.map((t) => t.id)];

  // 소개
  const intro = el('section', 'intro');
  intro.append(el('h1', undefined, '멸망까지 10년'));
  const lede = el('p', 'lede');
  lede.append(
    '3,000시간을 플레이한 망겜 《에테르 크로니클》. 37번째 배드 엔딩을 본 날, 그 게임 속 엑스트라로 눈을 떴다. 아무것도 바꾸지 않으면 ',
    el('em', undefined, '10년 뒤 세계는 멸망한다.'),
    ' 이 몸에 어떤 재능이 있었는지부터 정하자.',
  );
  intro.append(lede);
  const saved = readSave();
  if (saved) {
    const r = el('div', 'resume');
    r.append(el('span', undefined, `저장된 진행 — ${saved.build.name} · ${cal.label(saved.state.time)}`));
    r.append(button('ghost', '이어하기', () => resume(saved), 'resume'));
    const del = button('ghost', '지우기', () => {}, 'del-save');
    twoStep(del, '정말 지울까요?', () => {
      clearSave();
      renderCreate();
    });
    r.append(del);
    intro.append(r);
  }
  main.append(intro);

  // 이름
  const sName = el('section', 'step');
  sName.append(el('h3', undefined, '이름'));
  const input = el('input', 'name-input');
  input.id = 'player-name';
  input.value = build.name;
  input.maxLength = 12;
  input.addEventListener('input', () => {
    build = { ...build, name: input.value.trim() || '나' };
  });
  sName.append(input);
  main.append(sName);

  // 출신
  const sOrigin = el('section', 'step');
  const hOrigin = el('h3', undefined, '빙의할 몸');
  hOrigin.append(el('small', undefined, '출신마다 시작 포인트와 기본 재능이 다르다'));
  sOrigin.append(hOrigin);
  const oc = el('div', 'cards');
  for (const o of content.origins.values()) {
    const b = button('card', '', () => {
      setBuild({ ...build, origin: o.id, talents: build.talents.filter((t) => !o.talents.includes(t.id)) });
    }, `origin-${o.id}`);
    b.setAttribute('aria-pressed', String(o.id === build.origin));
    const top = el('span', 'top');
    top.append(el('span', undefined, o.name), el('span', 'cost free', `${o.points}P`));
    b.append(top, el('span', 'desc', o.desc));
    if (o.talents.length) b.append(el('span', 'desc', `기본 재능: ${o.talents.map((t) => content.talents.get(t)?.name ?? t).join(', ')}`));
    oc.append(b);
  }
  sOrigin.append(oc);
  main.append(sOrigin);

  // 특전
  const sPerk = el('section', 'step');
  const hPerk = el('h3', undefined, '빙의자 특전');
  hPerk.append(el('small', undefined, '고른 것 중 가장 비싼 하나는 무료'));
  sPerk.append(hPerk);
  const pc = el('div', 'cards');
  const perkCosts = build.perks.map((id) => content.perks.get(id)!.cost);
  const freeCost = perkCosts.length ? Math.max(...perkCosts) : -1;
  let freeUsed = false;
  for (const p of content.perks.values()) {
    const on = build.perks.includes(p.id);
    const b = button('card', '', () => {
      setBuild({ ...build, perks: on ? build.perks.filter((x) => x !== p.id) : [...build.perks, p.id] });
    }, `perk-${p.id}`);
    b.setAttribute('aria-pressed', String(on));
    let costEl: HTMLElement;
    if (on && !freeUsed && p.cost === freeCost) {
      freeUsed = true;
      costEl = el('span', 'cost free', '무료');
    } else costEl = el('span', 'cost spend', `−${p.cost}P`);
    const top = el('span', 'top');
    top.append(el('span', undefined, p.name), costEl);
    b.append(top, el('span', 'desc', p.desc));
    pc.append(b);
  }
  sPerk.append(pc);
  main.append(sPerk);

  // 재능
  const sTal = el('section', 'step');
  const hTal = el('h3', undefined, '재능');
  hTal.append(el('small', undefined, `좋은 재능은 포인트를 쓰고, 나쁜 재능은 포인트를 준다 (최대 ${content.rules.creation.negativeCap}P) · 최대 ${content.rules.creation.maxTalents}개`));
  sTal.append(hTal);
  for (const cat of CATEGORIES) {
    sTal.append(el('div', 'cat', cat));
    const tc = el('div', 'cards');
    for (const t of content.talents.values()) {
      if (t.category !== cat || t.evolved) continue;
      const isBase = origin.talents.includes(t.id);
      const sel = build.talents.find((x) => x.id === t.id);
      const on = isBase || !!sel;
      let why = '';
      if (isBase) why = '출신 기본 재능';
      else if (!on) {
        const clash = chosen.find((x) => t.excludes.includes(x) || content.talents.get(x)?.excludes.includes(t.id));
        if (clash) why = `${content.talents.get(clash)?.name ?? clash}와(과) 같이 고를 수 없음`;
        else if (t.locked && test(t.locked, NO_ENV)) why = '2회차부터 해금';
        else if (chosen.length >= content.rules.creation.maxTalents) why = '재능 칸이 가득 참';
      }
      const wrap = el('div', 'card');
      wrap.style.padding = '0';
      wrap.style.cursor = 'default';
      if (on) wrap.setAttribute('aria-pressed', 'true');
      const b = button('card', '', () => {
        setBuild({
          ...build,
          talents: sel ? build.talents.filter((x) => x.id !== t.id) : [...build.talents, { id: t.id, option: t.options?.[0] }],
        });
      }, `talent-${t.id}`);
      b.style.border = '0';
      b.style.background = 'none';
      b.style.boxShadow = 'none';
      b.disabled = isBase || (!on && !!why);
      b.setAttribute('aria-pressed', String(on));
      const top = el('span', 'top');
      top.append(el('span', undefined, t.name), el('span', `cost ${t.cost >= 0 ? 'spend' : 'gain'}`, t.cost >= 0 ? `−${t.cost}P` : `+${-t.cost}P`));
      b.append(top, el('span', 'desc', t.desc));
      if (why) b.append(el('span', 'why', why));
      wrap.append(b);
      if (sel && t.options) {
        const s = el('select');
        s.id = `opt-${t.id}`;
        s.dataset.key = `opt-${t.id}`;
        s.style.margin = '0 12px 10px';
        s.setAttribute('aria-label', `${t.name} 선택`);
        for (const o of t.options) {
          const op = el('option', undefined, o);
          op.value = o;
          op.selected = sel.option === o;
          s.append(op);
        }
        s.addEventListener('change', () => {
          setBuild({ ...build, talents: build.talents.map((x) => (x.id === t.id ? { ...x, option: s.value } : x)) });
        });
        wrap.append(s);
      }
      tc.append(wrap);
    }
    sTal.append(tc);
  }
  main.append(sTal);

  // 능력치 분배
  const sAlloc = el('section', 'step');
  const hAlloc = el('h3', undefined, '시작 능력치');
  hAlloc.append(el('small', undefined, `남은 포인트 1점 = 능력치 +${content.rules.creation.statPerPoint}`));
  sAlloc.append(hAlloc);
  const ac = el('div', 'alloc');
  const stats = previewStats();
  for (const s of content.rules.stats) {
    const n = build.alloc?.[s] ?? 0;
    const row = el('div', 'alloc-row');
    row.append(el('span', undefined, s));
    const ctl = el('span');
    ctl.style.display = 'flex';
    ctl.style.alignItems = 'center';
    ctl.style.gap = '6px';
    const minus = button('step-btn', '−', () => setBuild({ ...build, alloc: { ...build.alloc, [s]: n - 1 } }), `minus-${s}`);
    minus.disabled = n <= 0;
    minus.setAttribute('aria-label', `${s} 내리기`);
    const plus = button('step-btn', '+', () => setBuild({ ...build, alloc: { ...build.alloc, [s]: n + 1 } }), `plus-${s}`);
    plus.disabled = chk.remaining <= 0;
    plus.setAttribute('aria-label', `${s} 올리기`);
    ctl.append(minus, el('span', 'v', `${stats[s]} ${grade(stats[s])}`), plus);
    row.append(ctl);
    ac.append(row);
  }
  sAlloc.append(ac);
  main.append(sAlloc);

  // 포인트 장부
  const perkCost = perkCosts.length ? perkCosts.reduce((a, x) => a + x, 0) - freeCost : 0;
  const allocated = Object.values(build.alloc ?? {}).reduce((a, x) => a + x, 0);
  const win = el('div', 'window');
  win.append(el('h4', undefined, '[포인트 장부]'));
  const row = (label: string, value: string, cls = '') => {
    const r = el('div', `row ${cls}`);
    const v = el('span', undefined, value);
    r.append(el('span', undefined, label), v);
    win.append(r);
    return v;
  };
  row('출신', `+${chk.total}`);
  row('특전', perkCost ? `−${perkCost}` : '0');
  row('재능 (소모)', `−${chk.spent - perkCost}`);
  row(`재능 (획득, 최대 ${content.rules.creation.negativeCap})`, `+${chk.gained}`);
  row('능력치 분배', allocated ? `−${allocated}` : '0');
  const left = row('남은 포인트', String(chk.remaining), 'total');
  if (chk.remaining < 0) left.className = 'bad';
  ledger.append(win);
  if (chk.errors.length) {
    const ul = el('ul', 'errors');
    for (const e of chk.errors) ul.append(el('li', undefined, e));
    ledger.append(ul);
  }
  const start = button('primary', '이 몸으로 깨어나기', startGame, 'start');
  start.disabled = !chk.ok;
  ledger.append(start);
  ledger.append(button('secondary', '무작위로 정하기', () => setBuild(randomBuild(content, Math.random, build.name)), 'random'));
  ledger.append(button('secondary', '예시 빌드로 되돌리기', () => setBuild({ ...exampleBuild(), name: build.name }), 'example'));

  // 모바일 하단 막대
  const mb = el('div', 'mobilebar');
  mb.append(el('span', 'left', `남은 포인트 ${chk.remaining}${chk.ok ? '' : ' · 조건 확인'}`));
  const mstart = button('primary', '깨어나기', startGame, 'mstart');
  mstart.disabled = !chk.ok;
  mb.append(mstart);
  root.append(mb);

  root.scrollTop = scroll;
  if (focusKey) (root.querySelector(`[data-key="${CSS.escape(focusKey)}"]`) as HTMLElement | null)?.focus();
}

// ------------------------------------------------------------ game

function showCreate() {
  $('screen-game').hidden = true;
  $('screen-create').hidden = false;
  for (const id of ['clock', 'meter', 'panel-toggle', 'restart']) $(id).hidden = true;
  renderCreate();
}

function showGame() {
  $('screen-create').hidden = true;
  $('screen-game').hidden = false;
  for (const id of ['clock', 'meter', 'panel-toggle', 'restart']) $(id).hidden = false;
  $('log').replaceChildren();
  rendered = 0;
  renderGame(true);
}

function startGame() {
  if (!checkBuild(content, build).ok) return;
  game = Game.create(content, structuredClone(build), Math.floor(Math.random() * 2147483646) + 1);
  log = [];
  weekKey = '';
  capture(false);
  writeSave();
  showGame();
}

function resume(s: Save) {
  build = s.build;
  game = Game.restore(content, s.state);
  log = s.log ?? [];
  weekKey = s.weekKey ?? '';
  weekSnap = s.weekSnap ?? {};
  showGame();
}

// ---- 변화량 기록: 행동마다 "근력 +2.5 · 피로 +15", 주마다 결산

function tracked(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(game!.state.vars)) {
    if (typeof v !== 'number') continue;
    if (k.startsWith('stat.') || k.startsWith('affinity.') || k === 'fatigue' || k === 'stress' || k === 'money') out[k] = v;
  }
  return out;
}

function describeDiff(a: Record<string, number>, b: Record<string, number>, min = 0.5): string[] {
  const order = (k: string) =>
    k.startsWith('stat.') ? content.rules.stats.indexOf(k.slice(5)) : k.startsWith('affinity.') ? 20 : ({ fatigue: 30, stress: 31, money: 32 } as Record<string, number>)[k] ?? 40;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort((x, y) => order(x) - order(y));
  const out: string[] = [];
  for (const k of keys) {
    const d = Math.round(((b[k] ?? 0) - (a[k] ?? 0)) * 10) / 10;
    if (Math.abs(d) < min) continue;
    const label = k.startsWith('stat.')
      ? k.slice(5)
      : k.startsWith('affinity.')
        ? `${content.characters.get(k.slice(9))?.name ?? k.slice(9)} 호감`
        : ({ fatigue: '피로', stress: '스트레스', money: '은화' } as Record<string, string>)[k];
    out.push(`${label} ${d > 0 ? '+' : ''}${d}`);
  }
  return out;
}

function currentWeek(): string {
  const t = game!.state.time;
  return `${t.y}.${t.m}.${t.w}`;
}

function checkWeek() {
  if (!game || game.ended) return;
  const key = currentWeek();
  if (!weekKey) {
    weekKey = key;
    weekSnap = tracked();
    return;
  }
  if (key === weekKey) return;
  const [y, m, w] = weekKey.split('.');
  const items = describeDiff(weekSnap, tracked(), 1).filter((x) => !x.startsWith('피로') && !x.startsWith('스트레스'));
  if (items.length) log.push({ k: 'week', title: `${y === '0' ? '입학 전' : `${y}학년`} ${m}월 ${w}주차 결산`, items });
  weekKey = key;
  weekSnap = tracked();
}

/** 선택지 없는 일상 묘사 (제목 없는 반복 장면) */
function isFlavor(): boolean {
  const sc = game!.state.scene;
  if (!sc || sc.choices.length) return false;
  return !sc.eventId || !content.events.get(sc.eventId)?.title;
}

function capture(cont: boolean) {
  checkWeek();
  const v = game!.view();
  if (v.phase === 'scene' && v.lines.length) {
    log.push({ k: 'scene', when: v.time, title: v.title, lines: v.lines, cont, flavor: isFlavor() });
  }
}

function act(a: Action, label: string) {
  if (!game) return;
  const before = tracked();
  const at = log.length;
  game.act(a);
  const deltas = a.type === 'continue' ? [] : describeDiff(before, tracked());
  capture(a.type === 'choice');
  // 일상 묘사는 '계속'을 누르지 않아도 다음으로 넘어간다
  for (let i = 0; i < 20 && game.state.phase === 'scene' && isFlavor(); i++) {
    game.act({ type: 'continue' });
    capture(false);
  }
  checkWeek();
  if (label || deltas.length) log.splice(at, 0, { k: 'act', text: label, deltas });
  writeSave();
  renderGame(true);
}

function doomText(): string {
  const t = game!.state.time;
  const s = cal.startTime;
  const elapsed = t.y * 12 + cal.monthIndex(t.m) - (s.y * 12 + cal.monthIndex(s.m));
  const left = Math.max(0, 120 - elapsed);
  return `멸망까지 ${Math.floor(left / 12)}년 ${left % 12}개월`;
}

function renderLine(l: RenderedLine): HTMLElement {
  if (!l.speaker) return el('p', undefined, l.text);
  if (l.speaker === '속마음') return el('p', 'inner', l.text);
  if (l.speaker === '시스템') return el('div', 'sysline', l.text);
  if (l.speaker === '판정') {
    const ok = l.text.endsWith('성공');
    const d = el('div', ok ? 'check ok' : 'check ng');
    d.append(el('span', 'tag', ok ? '성공' : '실패'), el('span', undefined, l.text.replace(/ · (성공|실패)$/, '')));
    return d;
  }
  if (l.speaker === '📌') {
    const [kind, rest] = l.text.split(' — ');
    const d = el('div', 'pin');
    d.append(el('span', 'tag', kind), el('span', undefined, rest ?? ''));
    return d;
  }
  const p = el('p', l.speaker === '나' ? 'say me' : 'say');
  p.append(el('span', 'who', l.speaker === '나' ? build.name : l.speaker), `“${l.text}”`);
  return p;
}

function renderItem(item: LogItem): HTMLElement {
  if (item.k === 'act') {
    const d = el('div', item.text ? 'act' : 'act bare', item.text);
    if (item.deltas?.length) d.append(el('span', 'delta', item.deltas.join(' · ')));
    return d;
  }
  if (item.k === 'week') {
    const d = el('div', 'weekly');
    d.append(el('span', 'wt', item.title));
    const chips = el('span', 'chips');
    for (const x of item.items) chips.append(el('span', x.includes('-') ? 'chip down' : 'chip', x));
    d.append(chips);
    return d;
  }
  const a = el('article', item.cont || item.flavor ? 'scene cont' : 'scene');
  if (!item.cont && !item.flavor) {
    a.append(el('div', 'when', item.when));
    if (item.title) a.append(el('h2', undefined, item.title));
  }
  for (const l of item.lines) a.append(renderLine(l));
  return a;
}

function effectSummary(id: string): string {
  const names: Record<string, string> = { fatigue: '피로', stress: '스트레스', money: '돈' };
  const a = content.activities.get(id)!;
  return a.effects
    .map((e) => {
      const n = e.target.startsWith('stat.') ? e.target.slice(5) : names[e.target];
      return n && e.op !== '=' ? n + (e.op === '+=' ? '↑' : '↓') : '';
    })
    .filter(Boolean)
    .join(' ');
}

function renderControls() {
  const g = game!;
  const v = g.view();
  const c = $('controls');
  c.replaceChildren();
  if (v.phase === 'ended') {
    const box = el('div', 'ending');
    box.append(el('h3', undefined, '1학년 1학기 끝 — 프로토타입은 여기까지'));
    box.append(el('p', undefined, `원작 붕괴도 ${g.world.collapse()}%. 지금까지 바꾼 운명은 이렇다.`));
    const ul = el('ul');
    for (const cr of content.crossroads.values()) {
      const val = g.state.vars[cr.key];
      const txt = val === undefined ? '아직 정해지지 않음' : `${cr.labels[String(val)] ?? String(val)} (${val === cr.canon ? '원작대로' : '원작 이탈'})`;
      ul.append(el('li', undefined, `${cr.title}: ${txt}`));
    }
    box.append(ul);
    box.append(el('p', undefined, '다른 출신이나 재능으로 다시 하면 다른 장면과 선택지가 열린다.'));
    const again = button('primary', '다른 몸으로 다시 시작', () => {
      clearSave();
      game = null;
      showCreate();
    });
    again.style.width = 'auto';
    again.style.justifySelf = 'start';
    box.append(again);
    c.append(box);
    return;
  }
  if (v.phase === 'activity') {
    const slot = cal.slotName(g.state.time);
    c.append(el('div', 'prompt', `무엇을 할까? · ${slot}`));
    const next = g.upcoming(1)[0];
    const active = g.goals().filter((x) => x.status === 'active');
    if (next || active.length) {
      const nu = el('div', 'nextup');
      if (next) nu.append(el('span', undefined, `다음 일정 · ${next.label} (${next.weeks <= 0 ? '이번 주' : `${next.weeks}주 뒤`})`));
      if (active.length) {
        const gb = button('linkish', `목표 ${active.length}개 진행 중`, () => {
          tab = 'goals';
          renderPanel();
          $('panel').classList.add('open');
          $('panel-toggle').textContent = '닫기';
        });
        nu.append(gb);
      }
      c.append(nu);
    }
    const grid = el('div', 'activities');
    v.activities.forEach((a, i) => {
      const b = button('activity', '', () => act({ type: 'activity', id: a.id }, a.name));
      b.dataset.idx = String(i + 1);
      if (i < 9) b.append(el('span', 'k', String(i + 1)));
      b.append(el('b', undefined, a.name));
      if (a.desc) b.append(el('span', 'ad', a.desc));
      const fx = effectSummary(a.id);
      if (fx) b.append(el('span', 'fx', fx));
      grid.append(b);
    });
    c.append(grid);
    return;
  }
  if (v.choices.length) {
    v.choices.forEach((ch, i) => {
      const b = button('choice', '', () => act({ type: 'choice', index: ch.index }, ch.text));
      b.dataset.idx = String(i + 1);
      b.disabled = !ch.enabled;
      const body = el('span');
      body.append(ch.text);
      if (!ch.enabled) body.append(el('span', 'lock', '조건이 부족하다'));
      if (ch.hint) body.append(el('span', 'hint', `⚠ ${ch.hint}`));
      b.append(el('span', 'k', String(i + 1)), body);
      c.append(b);
    });
    return;
  }
  c.append(button('continue', '계속', () => act({ type: 'continue' }, '')));
}

function window_(title: string): HTMLElement {
  const w = el('div', 'window');
  w.append(el('h4', undefined, title));
  return w;
}

function renderPanel() {
  const g = game!;
  const p = $('panel');
  p.replaceChildren();
  const notes = g.notes();
  const goals = g.goals();
  const people = g.relationships();
  const tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  const defs: [Tab, string, number?][] = [
    ['goals', '목표', goals.filter((x) => x.status === 'active').length],
    ['status', '상태'],
    ['people', '인연', people.length],
    ['notes', '노트', notes.length],
    ['fate', '운명'],
  ];
  for (const [id, label, n] of defs) {
    const b = button('tab', label, () => {
      tab = id;
      renderPanel();
    });
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(tab === id));
    if (n) b.append(el('span', 'n', String(n)));
    tabs.append(b);
  }
  p.append(tabs);
  const pane = el('div', 'pane');
  p.append(pane);

  if (tab === 'goals') {
    const sch = window_('[다가오는 일정]');
    const up = g.upcoming(5);
    if (!up.length) sch.append(el('div', 'legend', '남은 일정이 없다.'));
    for (const u of up) {
      const r = el('div', 'row');
      r.append(el('span', undefined, u.label), el('span', 'when-s', u.weeks <= 0 ? '이번 주' : `${u.weeks}주 뒤`));
      sch.append(r);
    }
    pane.append(sch);
    const order = { active: 0, done: 1, failed: 2 } as const;
    for (const x of [...goals].sort((a, b) => order[a.status] - order[b.status])) {
      const d = el('div', `goal ${x.status}`);
      d.append(el('span', 'gs', x.status === 'active' ? '진행 중' : x.status === 'done' ? '달성' : '실패'), el('b', undefined, x.title));
      if (x.status === 'active' && x.hint) d.append(el('p', undefined, x.hint));
      pane.append(d);
    }
    if (!goals.length) pane.append(el('p', 'empty', '아직 목표가 없다.'));
  } else if (tab === 'status') {
    const exact = !!g.state.vars['perk.상태창'];
    const w = window_(`[상태창] ${build.name}`);
    w.append(el('div', 'legend', content.origins.get(build.origin)?.name ?? ''));
    if (!exact) w.append(el('div', 'legend', '상태창 특전이 없어서 등급만 보인다'));
    for (const s of content.rules.stats) {
      const v = Math.floor(Number(g.get(`stat.${s}`) ?? 0));
      const r = el('div', 'stat');
      const bar = el('div', 'bar-s');
      const fill = el('i');
      fill.style.width = `${Math.min(100, v)}%`;
      bar.append(fill);
      r.append(el('span', undefined, s), bar, el('span', 'g', exact ? `${v} ${grade(v)}` : grade(v)));
      w.append(r);
    }
    pane.append(w);

    const cond = window_('[컨디션]');
    for (const [key, label] of [['fatigue', '피로'], ['stress', '스트레스']] as const) {
      const v = Math.floor(Number(g.get(key) ?? 0));
      const r = el('div', 'stat');
      const bar = el('div', v >= 70 ? 'bar-s warn' : 'bar-s');
      const fill = el('i');
      fill.style.width = `${v}%`;
      bar.append(fill);
      r.append(el('span', undefined, label), bar, el('span', 'g', String(v)));
      cond.append(r);
    }
    const money = el('div', 'row');
    money.append(el('span', undefined, '돈'), el('span', undefined, `은화 ${Math.floor(Number(g.get('money') ?? 0))}`));
    cond.append(money);
    if (Number(g.get('fatigue') ?? 0) >= 50) cond.append(el('div', 'legend', '피로가 50을 넘으면 훈련 효율이 떨어진다. 85가 넘으면 쓰러진다.'));
    pane.append(cond);

    const tw = window_('[재능]');
    const chips = el('div', 'chips');
    for (const t of content.talents.values()) {
      const lv = Number(g.state.vars[`talent.${t.id}`] ?? 0);
      if (!lv) continue;
      const opt = t.options?.find((o) => g.state.vars[`talent.${t.id}.${o}`]);
      const bloom = lv >= 2 || t.evolved;
      chips.append(el('span', bloom ? 'chip bloom' : 'chip', `${t.name}${opt ? `(${opt})` : ''}${lv >= 2 ? ' · 개화' : t.evolved ? ' · 진화' : ''}`));
    }
    tw.append(chips);
    const perks = [...content.perks.values()].filter((x) => g.state.vars[`perk.${x.id}`]);
    if (perks.length) {
      tw.append(el('h4', undefined, '[빙의자 특전]'));
      const pc = el('div', 'chips');
      for (const x of perks) pc.append(el('span', 'chip', x.name));
      tw.append(pc);
    }
    pane.append(tw);
  } else if (tab === 'people') {
    if (!people.length) pane.append(el('p', 'empty', '아직 인연을 맺은 사람이 없다.'));
    for (const r of people) {
      const d = el('div', 'rel');
      const top = el('div', 'rel-top');
      top.append(el('b', undefined, r.name), el('span', 'rank', `인연 ${r.rank}`));
      const bar = el('div', 'bar-s');
      const fill = el('i');
      fill.style.width = `${Math.min(100, Math.max(0, r.affinity))}%`;
      bar.append(fill);
      d.append(top, bar);
      if (r.memo) d.append(el('p', undefined, r.memo));
      if (r.trust >= 15) d.append(el('span', 'trust', '나를 믿고 있다'));
      else if (r.trust < 0) d.append(el('span', 'trust low', '나를 경계한다'));
      pane.append(d);
    }
    pane.append(el('p', 'legend', '호감도 10마다 인연 1단계. 신뢰는 숫자로 보이지 않는다.'));
  } else if (tab === 'notes') {
    if (!notes.length) pane.append(el('p', 'empty', '기억나는 원작 정보가 없다.'));
    for (const n of [...notes].sort((a, b) => b.grade - a.grade)) {
      const d = el('div', n.reliable ? 'note' : 'note bad');
      d.append(el('span', 'stars', '★'.repeat(n.grade) + '☆'.repeat(3 - n.grade)), el('b', undefined, n.title), el('p', undefined, n.text));
      if (!n.reliable) d.append(el('span', 'warn', `⚠ 신뢰할 수 없음 — ${n.reason}`));
      pane.append(d);
    }
    pane.append(el('p', 'legend', '★★★ 직접 플레이 · ★★ 커뮤니티 공략 · ★ 데이터마이닝. 원작을 바꾸면 관련 기억은 더 이상 믿을 수 없다.'));
  } else {
    pane.append(el('div', 'cat', '갈림길'));
    for (const cr of content.crossroads.values()) {
      const val = g.state.vars[cr.key];
      const d = el('div', 'fate');
      d.append(el('b', undefined, cr.title));
      if (val === undefined) d.append(el('span', 'st open', `미정 · ${deadlineText(cr.deadlineLabel)} (지나면 원작대로)`));
      else if (val === cr.canon) d.append(el('span', 'st canon', `원작대로 — ${cr.labels[String(val)] ?? String(val)}`));
      else d.append(el('span', 'st changed', `원작 이탈 — ${cr.labels[String(val)] ?? String(val)} · 붕괴도 +${cr.weight}`));
      pane.append(d);
    }
    const noticed = [...content.foreshadows.values()].filter((f) => g.state.vars[`fs.${f.id}.noticed`]);
    pane.append(el('div', 'cat', `복선 ${noticed.length}`));
    if (!noticed.length) pane.append(el('p', 'empty', '아직 눈치챈 복선이 없다.'));
    for (const f of noticed) {
      const d = el('div', 'note');
      const paid = !!g.state.vars[`fs.${f.id}.paid`];
      d.append(el('span', 'stars', paid ? '회수됨' : '미회수'), el('b', undefined, f.title));
      if (paid && f.meaning) d.append(el('p', undefined, f.meaning));
      pane.append(d);
    }
    pane.append(el('p', 'legend', '눈치챈 복선만 기록된다. 지성, 직감, 마력 감응이 높을수록 더 많이 알아챈다.'));
  }
}

function renderGame(scroll: boolean) {
  const g = game!;
  const v = g.view();
  $('time').textContent = v.phase === 'ended' ? '1학년 1학기 끝' : v.time;
  $('doom').textContent = doomText();
  const collapse = g.world.collapse();
  ($('collapse-fill') as HTMLElement).style.width = `${collapse}%`;
  $('collapse-val').textContent = `${collapse}%`;

  const logEl = $('log');
  let first: HTMLElement | null = null;
  for (; rendered < log.length; rendered++) {
    const node = renderItem(log[rendered]);
    first ??= node;
    logEl.append(node);
  }
  renderControls();
  renderPanel();

  if (scroll) {
    const story = $('story');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bottom = story.scrollHeight - story.clientHeight;
    const target = first ? Math.min(bottom, first.offsetTop - 16) : bottom;
    story.scrollTo({ top: Math.max(0, target), behavior: reduce ? 'auto' : 'smooth' });
    ($('controls').querySelector('button:not([disabled])') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }
}

// ------------------------------------------------------------ boot

document.addEventListener('keydown', (e) => {
  if (!game || $('screen-game').hidden) return;
  const t = e.target as HTMLElement;
  if (t.matches('input, select, textarea')) return;
  if (e.key >= '1' && e.key <= '9') {
    const b = $('controls').querySelector<HTMLButtonElement>(`[data-idx="${e.key}"]`);
    if (b && !b.disabled) {
      e.preventDefault();
      b.click();
    }
  }
});

$('panel-toggle').addEventListener('click', () => {
  const open = $('panel').classList.toggle('open');
  $('panel-toggle').textContent = open ? '닫기' : '상태창';
});
twoStep($('restart') as HTMLButtonElement, '진행이 지워져요 · 다시 누르기', () => {
  clearSave();
  game = null;
  const r = $('restart');
  r.textContent = '처음으로';
  r.classList.remove('danger');
  showCreate();
});

window.claude?.hot?.snapshot?.(() => snapshot());
function boot(data: unknown) {
  const s = data as Save | null;
  if (s && s.v === 1 && s.state) resume(s);
  else showCreate();
}
const hot = window.claude?.hot;
if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? null);
