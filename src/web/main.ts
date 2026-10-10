// 브라우저 플레이 화면. 엔진은 터미널 버전과 똑같은 것을 쓴다.
// 콘텐츠(YAML)는 빌드 시 JSON으로 바뀌어 window.__HERO_CONTENT__로 들어온다.

import { buildContent, checkBuild, randomBuild, test, type Action, type BattleLine, type BattleView, type Build, type Content } from '../engine';
import { applyBuild } from '../engine/creation';
import { Game, type GameState } from '../engine/game';
import type { RenderedLine } from '../engine/text';
import { World } from '../engine/world';
import {
  ACTIVITY_ICON, CAST, DEFAULT_PLAYER, INTENT_ICON, PLAYER_EYES, PLAYER_HAIR, PLAYER_HAIR_COLOR, PLAYER_SKIN, STAT_ICON,
  extraLook, playerLook, todOf, type Look,
} from '../art';
import { animateBar, attachRipple, floatText, loadSoundPref, reduceMotion, replay, rollDice, setSound, sfx, soundOn, toast } from './fx';
import { enemyImg, iconImg, portraitImg, sceneImg } from './visuals';

declare global {
  interface Window {
    __HERO_CONTENT__: Record<string, unknown>;
    claude?: { hot?: { snapshot?: (fn: () => unknown) => void; ready?: (fn: (data: unknown) => void) => void; data?: unknown } };
  }
}

type LogItem =
  | { k: 'scene'; when: string; title?: string; lines: RenderedLine[]; cont?: boolean; flavor?: boolean; tod?: string; strip?: string; intros?: string[] }
  | { k: 'act'; text: string; deltas?: string[]; ranks?: string[]; icon?: string }
  | { k: 'week'; title: string; items: string[]; season?: string }
  | { k: 'month'; title: string; art: string; season: string; items: string[] }
  | { k: 'battle'; enemy: string; lines: BattleLine[]; start?: boolean; result?: 'win' | 'lose' };
interface Save {
  v: 1;
  build: Build;
  state: GameState;
  log: LogItem[];
  weekKey?: string;
  weekSnap?: Record<string, number>;
  monthSnap?: Record<string, number>;
  introduced?: string[];
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
let monthSnap: Record<string, number> = {};
/** 인물 소개 카드를 이미 보여준 캐릭터 */
let introduced = new Set<string>();
let lastActivity = '';
let busy = false;
/** 직전 턴의 전투 연출 정보 */
let turnFx: { lines: BattleLine[]; prev?: { hp: number; ehp: number; sp: number; mp: number }; ended?: 'win' | 'lose' } | null = null;
let fresh: HTMLElement[] = [];

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

// ---- 그림

const byName = new Map([...content.characters.values()].map((c) => [c.name, c.id]));
const CROWD = new Set(['학생들', '관중']);
const NO_FACE = new Set(['속마음', '시스템', '판정', '📌', '삽화']);

/** 화자 이름 → 초상화 외형 (없으면 null) */
function lookOf(speaker: string): { key: string; look: Look } | null {
  if (NO_FACE.has(speaker) || CROWD.has(speaker)) return null;
  if (speaker === '나') return { key: `me:${JSON.stringify(build.look ?? DEFAULT_PLAYER)}:${build.origin}`, look: myLook() };
  const id = byName.get(speaker);
  if (id && CAST[id]) return { key: id, look: CAST[id] };
  return { key: `x:${speaker}`, look: extraLook(speaker) };
}

function myLook(): Look {
  return playerLook(build.look, build.origin);
}

/** 주마다 바뀌는 계절 한 줄 (월 → 주차별) */
const SEASON: Record<number, string[]> = {
  2: ['2월의 시골. 입김이 하얗다.', '눈이 녹아 길이 질척하다.', '입학까지 두 주.', '짐을 꾸렸다. 곧 아카데미다.'],
  3: ['교정에 벚꽃이 피기 시작했다.', '벚꽃이 한창이다. 신입생들이 길을 헤맨다.', '꽃잎이 바람에 흩날린다.', '벚꽃이 지고 새잎이 돋는다.'],
  4: ['아침 공기가 부드러워졌다.', '온실의 꽃들이 일제히 피었다.', '봄비가 하루 종일 내렸다.', '훈련장 흙바닥이 말라 먼지가 인다.'],
  5: ['신록이 짙어진다. 창밖이 온통 초록이다.', '축제 준비로 교정이 들썩인다.', '밤바람이 따뜻하다.', '이른 매미 소리가 들린다.'],
  6: ['시험 기간. 도서관에 빈자리가 없다.', '장마가 시작됐다.', '빗소리에 잠이 잘 온다.', '장마가 그쳤다. 하늘이 높다.'],
  7: ['무투대회 공고가 붙었다. 교정이 술렁인다.', '한낮의 훈련장은 찜통이다.', '밤마다 반딧불이가 난다.', '학기가 끝나 간다.'],
};
const MONTH_ART: Record<number, string> = { 2: 'home_room', 3: 'academy_gate', 4: 'campus', 5: 'greenhouse', 6: 'library', 7: 'arena' };

function seasonLine(m: number, w: number): string {
  return SEASON[m]?.[Math.max(0, Math.min(3, w - 1))] ?? '';
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
  return game ? { v: 1, build, state: game.state, log: log.slice(-150), weekKey, weekSnap, monthSnap, introduced: [...introduced] } : null;
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
  const hero = el('figure', 'hero');
  hero.append(sceneImg('title', 'night', '', '금 간 밤하늘 아래의 루미에르 아카데미'));
  intro.append(hero);
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

  // 외모
  const sLook = el('section', 'step');
  const hLook = el('h3', undefined, '외모');
  hLook.append(el('small', undefined, '이 몸의 얼굴. 능력과는 상관없다'));
  sLook.append(hLook);
  const lookRow = el('div', 'look-row');
  const cur = { ...DEFAULT_PLAYER, ...(build.look ?? {}) };
  const preview = el('div', 'look-preview');
  preview.append(portraitImg(`me:${JSON.stringify(cur)}:${build.origin}`, playerLook(cur, build.origin), '', 3));
  const moodRow = el('div', 'look-moods');
  for (const m of ['웃음', '놀람', '진지'] as const) moodRow.append(portraitImg(`me:${JSON.stringify(cur)}:${build.origin}`, playerLook(cur, build.origin), m, 1));
  preview.append(moodRow);
  lookRow.append(preview);
  const opts = el('div', 'look-opts');
  const optGroup = (label: string, key: keyof typeof cur, list: { id: string; label: string }[]) => {
    const g = el('div', 'look-group');
    g.append(el('span', 'lg', label));
    const chips = el('div', 'chips');
    for (const o of list) {
      const b = button('chip pick', o.label, () => setBuild({ ...build, look: { ...cur, [key]: o.id } }), `look-${key}-${o.id}`);
      b.setAttribute('aria-pressed', String(cur[key] === o.id));
      chips.append(b);
    }
    g.append(chips);
    opts.append(g);
  };
  optGroup('머리 모양', 'hair', PLAYER_HAIR);
  optGroup('머리색', 'hairColor', PLAYER_HAIR_COLOR);
  optGroup('눈', 'eyes', PLAYER_EYES);
  optGroup('피부', 'skin', PLAYER_SKIN);
  lookRow.append(opts);
  sLook.append(lookRow);
  main.append(sLook);

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
  ambienceKey = '';
  $('ambience').replaceChildren();
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
  introduced = new Set();
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
  monthSnap = s.monthSnap ?? {};
  introduced = new Set(s.introduced ?? []);
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
    monthSnap = tracked();
    return;
  }
  if (key === weekKey) return;
  const [y, m, w] = weekKey.split('.');
  const t = game!.state.time;
  const items = describeDiff(weekSnap, tracked(), 1).filter((x) => !x.startsWith('피로') && !x.startsWith('스트레스'));
  const monthChanged = String(t.m) !== m;
  if (items.length || !monthChanged) {
    log.push({ k: 'week', title: `${y === '0' ? '입학 전' : `${y}학년`} ${m}월 ${w}주차 결산`, items, season: monthChanged ? undefined : seasonLine(t.m, t.w) });
  }
  if (monthChanged) {
    const mi = describeDiff(monthSnap, tracked(), 2).filter((x) => !x.startsWith('피로') && !x.startsWith('스트레스'));
    log.push({
      k: 'month',
      title: `${t.y === 0 ? '입학 전' : `${t.y}학년`} ${t.m}월`,
      art: MONTH_ART[t.m] ?? 'campus',
      season: seasonLine(t.m, t.w),
      items: mi.length ? [`지난달: ${mi.join(' · ')}`] : [],
    });
    monthSnap = tracked();
  }
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
    const tod = todOf(cal.slotName(game!.state.time));
    let strip: string | undefined;
    if (!cont && v.title && !v.lines.some((l) => l.speaker === '삽화')) {
      const ev = content.events.get(game!.state.scene?.eventId ?? '');
      if (ev?.trigger.kind === 'activity') {
        const aid = ev.trigger.ids.includes(lastActivity) ? lastActivity : ev.trigger.ids[0];
        strip = content.activities.get(aid)?.art;
      }
    }
    const intros: string[] = [];
    for (const l of v.lines) {
      const id = l.speaker ? byName.get(l.speaker) : undefined;
      if (id && CAST[id] && !introduced.has(id)) {
        introduced.add(id);
        intros.push(l.speaker!);
      }
    }
    log.push({ k: 'scene', when: v.time, title: v.title, lines: v.lines, cont, flavor: isFlavor(), tod, strip, intros: intros.length ? intros : undefined });
  }
}

function barsOf(): { hp: number; ehp: number; sp: number; mp: number } | undefined {
  const b = game!.state.battle;
  return b ? { hp: b.hp / b.maxHp, ehp: b.ehp / b.emaxHp, sp: b.sp / Math.max(1, b.maxSp), mp: b.mp / Math.max(1, b.maxMp) } : undefined;
}

function act(a: Action, label: string) {
  if (!game) return;
  const before = tracked();
  const wasBattle = game.state.phase === 'battle';
  const prev = barsOf();
  const enemyName = wasBattle ? content.enemies.get(game.state.battle!.enemy)!.name : '';
  const at = log.length;
  if (a.type === 'activity') lastActivity = a.id;
  game.act(a);
  const ended = game.state.lastBattle?.result;
  if (wasBattle) {
    const lines = game.state.battle?.log ?? game.state.lastBattle?.log ?? [];
    log.push({ k: 'battle', enemy: enemyName, lines, result: ended });
    turnFx = { lines, prev, ended };
    label = '';
  }
  const deltas = a.type === 'continue' || (wasBattle && !ended) ? [] : describeDiff(before, tracked());
  const after = tracked();
  const ranks: string[] = [];
  for (const k of Object.keys(after)) {
    if (!k.startsWith('affinity.')) continue;
    const r0 = Math.floor((before[k] ?? 0) / 10);
    const r1 = Math.floor(after[k] / 10);
    if (r1 > r0) ranks.push(`${content.characters.get(k.slice(9))?.name ?? k} 인연 ${r1}`);
  }
  capture(a.type === 'choice');
  // 일상 묘사는 '계속'을 누르지 않아도 다음으로 넘어간다
  for (let i = 0; i < 20 && game.state.phase === 'scene' && isFlavor(); i++) {
    game.act({ type: 'continue' });
    capture(false);
  }
  if (game.state.phase === 'battle' && !wasBattle) {
    const b = game.state.battle!;
    log.push({ k: 'battle', enemy: content.enemies.get(b.enemy)!.name, lines: b.log, start: true });
    turnFx = null;
  }
  checkWeek();
  if (label || deltas.length || ranks.length) {
    log.splice(at, 0, { k: 'act', text: label, deltas, ranks, icon: a.type === 'activity' ? ACTIVITY_ICON[a.id] : undefined });
  }
  writeSave();
  renderGame(true);
}

/** 누른 버튼을 잠깐 강조한 뒤 실행 (연출) */
function pick(b: HTMLButtonElement, run: () => void) {
  if (busy) return;
  sfx('pick');
  if (reduceMotion()) return run();
  busy = true;
  b.classList.add('picked');
  b.parentElement?.querySelectorAll('button').forEach((x) => x !== b && x.classList.add('dim'));
  window.setTimeout(() => {
    busy = false;
    run();
  }, 170);
}

function doomText(): string {
  const t = game!.state.time;
  const s = cal.startTime;
  const elapsed = t.y * 12 + cal.monthIndex(t.m) - (s.y * 12 + cal.monthIndex(s.m));
  const left = Math.max(0, 120 - elapsed);
  return `멸망까지 ${Math.floor(left / 12)}년 ${left % 12}개월`;
}

function renderLine(l: RenderedLine, tod = 'day', prev = ''): HTMLElement {
  if (!l.speaker) return el('p', undefined, l.text);
  if (l.speaker === '속마음') return el('p', 'inner', l.text);
  if (l.speaker === '시스템') return el('div', 'sysline', l.text);
  if (l.speaker === '삽화') {
    const f = el('figure', 'art');
    const title = content.art.get(l.text)?.title ?? '';
    f.append(sceneImg(l.text, tod, '', title));
    if (title) f.append(el('figcaption', undefined, title));
    return f;
  }
  if (l.speaker === '판정') return renderCheck(l.text);
  if (l.speaker === '📌') {
    const [kind, rest] = l.text.split(' — ');
    const d = el('div', 'pin');
    d.append(iconImg(kind.includes('회수') ? 'target' : 'eye', 1), el('span', 'tag', kind), el('span', undefined, rest ?? ''));
    return d;
  }
  const me = l.speaker === '나';
  const p = el('div', me ? 'say me' : 'say');
  const face = lookOf(l.speaker);
  const same = prev === l.speaker;
  if (face) {
    const img = portraitImg(face.key, face.look, l.mood ?? '', 2, me ? 'flip' : '');
    if (same) img.classList.add('ghost-pt');
    p.append(img);
  } else p.append(iconImg('people', 2, 'crowd'));
  const body = el('div', 'bubble');
  if (!same) body.append(el('span', 'who', me ? build.name : l.speaker));
  body.append(`“${l.text}”`);
  p.append(body);
  return p;
}

/** 처음 등장하는 인물의 소개 카드 */
function introCard(name: string): HTMLElement {
  const id = byName.get(name)!;
  const ch = content.characters.get(id)!;
  const d = el('div', 'intro-card');
  d.append(portraitImg(id, CAST[id], '', 3));
  const t = el('div', 'ic-text');
  t.append(el('span', 'ic-k', '인물 등장'), el('b', undefined, ch.name));
  if (ch.desc) t.append(el('span', 'ic-d', ch.desc));
  d.append(t);
  return d;
}

/** 판정 줄: 작은 주사위가 굴러와서 멈춘다 */
function renderCheck(text: string): HTMLElement {
  const ok = text.endsWith('성공');
  const d = el('div', ok ? 'check ok' : 'check ng');
  const body = text.replace(/ · (성공|실패)$/, '');
  const m = /^(.*?) · (-?\d+) \+ 주사위 (\d+) = (-?\d+) \/ 목표 (\d+)$/.exec(body);
  if (!m) {
    d.append(el('span', 'tag', ok ? '성공' : '실패'), el('span', undefined, body));
    return d;
  }
  const [, label, value, die, sum, dc] = m;
  const n = Number(die);
  const wrap = el('span', `die-wrap${n === 20 ? ' nat20' : n === 1 ? ' nat1' : ''}`);
  wrap.append(iconImg('dice', 2, 'd20'));
  const num = el('b', 'die', die);
  num.dataset.final = die;
  wrap.append(num);
  const info = el('span', 'cinfo');
  info.append(el('b', 'clabel', label));
  const math = el('span', 'cmath', `${value} + 주사위 ${die} = ${sum} / 목표 ${dc}`);
  info.append(math);
  const tag = el('span', 'tag', ok ? (n === 20 ? '대성공' : '성공') : n === 1 ? '대실패' : '실패');
  d.append(wrap, info, tag);
  return d;
}

function renderItem(item: LogItem): HTMLElement {
  if (item.k === 'act') {
    const d = el('div', item.text ? 'act' : 'act bare');
    if (item.icon) d.append(iconImg(item.icon, 1, 'act-ic'));
    d.append(item.text);
    if (item.deltas?.length) d.append(el('span', 'delta', item.deltas.join(' · ')));
    if (item.ranks?.length) {
      const r = el('span', 'ranks');
      for (const x of item.ranks) r.append(el('span', 'rankup', `★ ${x}`));
      d.append(r);
    }
    return d;
  }
  if (item.k === 'battle') {
    const d = el('div', `battlelog${item.result ? ` end ${item.result}` : ''}`);
    if (item.start) d.append(el('div', 'bl-head', `전투 개시 — ${item.enemy}`));
    for (const l of item.lines) {
      const row = el('div', `bl ${l.who}${l.crit ? ' crit' : ''}`, l.text);
      if (l.dmg) row.append(el('span', l.to === 'me' ? 'dmg me' : 'dmg', ` −${l.dmg}`));
      if (l.heal) row.append(el('span', 'dmg heal', ` +${l.heal}`));
      d.append(row);
    }
    if (item.result) d.append(el('div', `result ${item.result}`, item.result === 'win' ? '승리' : '패배'));
    return d;
  }
  if (item.k === 'week') {
    const d = el('div', 'weekly');
    const top = el('div', 'wtop');
    top.append(iconImg('hourglass', 1), el('span', 'wt', item.title));
    d.append(top);
    if (item.items.length) {
      const chips = el('span', 'chips');
      for (const x of item.items) chips.append(el('span', x.includes('-') ? 'chip down' : 'chip', x));
      d.append(chips);
    }
    if (item.season) d.append(el('p', 'season', item.season));
    return d;
  }
  if (item.k === 'month') {
    const d = el('section', 'month');
    d.append(sceneImg(item.art, 'day', 'month-art'));
    const cap = el('div', 'mcap');
    cap.append(el('h2', undefined, item.title), el('p', 'season', item.season));
    for (const x of item.items) cap.append(el('p', 'mrec', x));
    d.append(cap);
    return d;
  }
  const a = el('article', item.cont || item.flavor ? 'scene cont' : 'scene');
  if (item.strip) {
    const f = el('figure', 'strip');
    f.append(sceneImg(item.strip, item.tod ?? 'day', '', content.art.get(item.strip)?.title ?? ''));
    a.append(f);
  }
  if (!item.cont && !item.flavor) {
    a.append(el('div', 'when', item.when));
    if (item.title) a.append(el('h2', undefined, item.title));
  }
  let prev = '';
  const intros = new Set(item.intros ?? []);
  for (const l of item.lines) {
    if (l.speaker && intros.has(l.speaker)) {
      intros.delete(l.speaker);
      a.append(introCard(l.speaker));
      prev = '';
    }
    a.append(renderLine(l, item.tod ?? 'day', prev));
    prev = l.speaker && !['판정', '📌', '시스템', '삽화'].includes(l.speaker) ? l.speaker : '';
  }
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
    box.append(sceneImg('rooftop', 'dusk', 'ending-art'));
    box.append(el('h3', undefined, '1학년 1학기 끝 — 프로토타입은 여기까지'));
    box.append(el('p', undefined, `원작 붕괴도 ${g.world.collapse()}%. 지금까지 바꾼 운명은 이렇다.`));
    const ul = el('ul');
    for (const cr of content.crossroads.values()) {
      const val = g.state.vars[cr.key];
      const txt = val === undefined ? '아직 정해지지 않음' : `${cr.labels[String(val)] ?? String(val)} (${val === cr.canon ? '원작대로' : '원작 이탈'})`;
      ul.append(el('li', undefined, `${cr.title}: ${txt}`));
    }
    box.append(ul);
    const top = g.relationships().filter((r) => CAST[r.id] && r.affinity > 0).sort((a, b) => b.affinity - a.affinity).slice(0, 4);
    if (top.length) {
      box.append(el('p', undefined, '이번 학기에 가장 가까워진 사람들.'));
      const row = el('div', 'bond-row');
      for (const r of top) {
        const f = el('figure', 'bond');
        f.append(portraitImg(r.id, CAST[r.id], '웃음', 2), el('figcaption', undefined, `${r.name} · 인연 ${r.rank}`));
        row.append(f);
      }
      box.append(row);
    }
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
  if (v.phase === 'battle' && v.battle) {
    renderBattle(c, v.battle);
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
      const b: HTMLButtonElement = button('activity', '', () => pick(b, () => act({ type: 'activity', id: a.id }, a.name)));
      b.dataset.idx = String(i + 1);
      b.append(iconImg(ACTIVITY_ICON[a.id] ?? 'star', 2, 'aic'));
      const txt = el('span', 'atext');
      const nm = el('b', undefined, a.name);
      if (i < 9) nm.prepend(el('span', 'k', String(i + 1)));
      txt.append(nm);
      if (a.desc) txt.append(el('span', 'ad', a.desc));
      const fx = effectSummary(a.id);
      if (fx) txt.append(el('span', 'fx', fx));
      b.append(txt);
      grid.append(b);
    });
    c.append(grid);
    return;
  }
  if (v.choices.length) {
    v.choices.forEach((ch, i) => {
      const b: HTMLButtonElement = button('choice', '', () => pick(b, () => act({ type: 'choice', index: ch.index }, ch.text)));
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
  const pending = g.state.scene?.battle;
  c.append(
    button(pending ? 'continue fight' : 'continue', pending ? '전투 시작' : '계속', () => {
      sfx('click');
      act({ type: 'continue' }, '');
    }),
  );
}

function bar(cls: string, from: number | undefined, to: number): HTMLElement {
  const b = el('div', `gauge ${cls}`);
  const f = el('i');
  b.append(f);
  animateBar(f, from ?? to, to);
  return b;
}

/** 전투가 벌어지는 곳: 가장 최근 장면의 삽화나 장소 */
function battleBackdrop(): { id: string; tod: string } | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const it = log[i];
    if (it.k !== 'scene') continue;
    const art = it.lines.find((l) => l.speaker === '삽화')?.text ?? it.strip;
    if (art) return { id: art, tod: it.tod ?? 'day' };
    if (!it.cont) return null;
  }
  return null;
}

function renderBattle(c: HTMLElement, bt: BattleView) {
  const prev = turnFx?.prev;
  const wrap = el('div', 'battle');

  const enemyId = game!.state.battle?.enemy ?? '';
  const foe = el('div', `combatant foe${bt.enemy.enraged ? ' enraged' : ''}`);
  const where = battleBackdrop();
  if (where) foe.append(sceneImg(where.id, where.tod, 'foe-bg'));
  const fh = el('div', 'ch');
  const fname = el('span', 'cn');
  fname.append(enemyImg(enemyId, bt.enemy.name, 2, 'cpt'), el('b', undefined, bt.enemy.name));
  fh.append(fname, el('span', 'num', `${bt.enemy.hp} / ${bt.enemy.maxHp}`));
  foe.append(fh, bar('hp foe', prev?.ehp, bt.enemy.hp / bt.enemy.maxHp));
  const danger = bt.intent.clarity === 'exact' && ['강타', '차지', '마법'].includes(bt.intent.label);
  const it = el('div', `intent ${bt.intent.clarity}${danger ? ' danger' : ''}`);
  const iconId = INTENT_ICON[bt.intent.label] ?? INTENT_ICON['?'];
  it.append(el('span', 'il', bt.intent.charged ? '다음 행동 · 힘을 모았다' : '다음 행동'));
  const lab = el('b');
  lab.append(iconImg(iconId, 2, 'iic'), bt.intent.label);
  it.append(lab, el('span', 'it', bt.intent.text));
  foe.append(it);

  const me = el('div', 'combatant me');
  const mh = el('div', 'ch');
  const mname = el('span', 'cn');
  mname.append(portraitImg(lookOf('나')!.key, myLook(), bt.me.hp / bt.me.maxHp < 0.3 ? '슬픔' : '진지', 2, 'cpt'), el('b', undefined, build.name));
  mh.append(mname, el('span', 'num', `${bt.me.hp} / ${bt.me.maxHp}`));
  me.append(mh, bar('hp mine', prev?.hp, bt.me.hp / bt.me.maxHp));
  const res = el('div', 'res');
  const sp = el('span', 'rl');
  sp.append(`기력 ${bt.me.sp}/${bt.me.maxSp}`, bar('sp', prev?.sp, bt.me.sp / Math.max(1, bt.me.maxSp)));
  res.append(sp);
  if (bt.me.maxMp > 0) {
    const mp = el('span', 'rl');
    mp.append(`마나 ${bt.me.mp}/${bt.me.maxMp}`, bar('mp', prev?.mp, bt.me.mp / Math.max(1, bt.me.maxMp)));
    res.append(mp);
  }
  me.append(res);
  const tags = el('div', 'chips');
  if (bt.ally) {
    const chip = el('span', 'chip ally');
    const face = lookOf(bt.ally);
    if (face) chip.append(portraitImg(face.key, face.look, '진지', 1, 'mini'));
    chip.append(`동료 · ${bt.ally}`);
    tags.append(chip);
  }
  for (const s of bt.status) tags.append(el('span', 'chip', s));
  tags.append(el('span', 'chip turn', `턴 ${bt.turn + 1} / ${bt.turns}`));
  me.append(tags);

  const grid = el('div', 'skills');
  bt.skills.forEach((k, i) => {
    const b: HTMLButtonElement = button('skill', '', () => pick(b, () => act({ type: 'battle', skill: k.id }, k.name)));
    b.dataset.idx = String(i + 1);
    b.disabled = !k.enabled;
    const top = el('span', 'st');
    if (i < 9) top.append(el('span', 'k', String(i + 1)));
    top.append(el('b', undefined, k.name));
    if (k.cost) top.append(el('span', 'cost', k.cost));
    b.append(top, el('span', 'sd', k.reason ?? k.desc));
    grid.append(b);
  });
  wrap.append(foe, me, grid);
  c.append(wrap);

  // 직전 턴 연출: 피해 숫자, 흔들림, 효과음
  if (turnFx && !turnFx.ended) {
    let t = 0;
    for (const l of turnFx.lines) {
      if (l.dmg && l.to === 'enemy') {
        floatText(foe, `−${l.dmg}`, l.crit ? 'crit' : '', t);
        window.setTimeout(() => {
          replay(foe, 'hit');
          sfx(l.crit ? 'crit' : 'hit');
        }, t);
        t += 160;
      } else if (l.dmg && l.to === 'me') {
        floatText(me, `−${l.dmg}`, 'me', t + 120);
        window.setTimeout(() => {
          replay(me, 'hurt');
          sfx('hurt');
        }, t + 120);
        t += 200;
      } else if (l.heal) {
        floatText(me, `+${l.heal}`, 'heal', t);
        window.setTimeout(() => sfx('heal'), t);
      } else if (l.text.includes('튕겨냈다') || l.text.includes('피했다')) {
        window.setTimeout(() => sfx('guard'), t);
      }
    }
    turnFx = null;
  }
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
    const who = el('div', 'me-card');
    who.append(portraitImg(lookOf('나')!.key, myLook(), '', 2), el('div', 'legend', content.origins.get(build.origin)?.name ?? ''));
    w.append(who);
    if (!exact) w.append(el('div', 'legend', '상태창 특전이 없어서 등급만 보인다'));
    for (const s of content.rules.stats) {
      const v = Math.floor(Number(g.get(`stat.${s}`) ?? 0));
      const r = el('div', 'stat');
      const bar = el('div', 'bar-s');
      const fill = el('i');
      fill.style.width = `${Math.min(100, v)}%`;
      bar.append(fill);
      const nm = el('span', 'sname');
      nm.append(iconImg(STAT_ICON[s] ?? 'star', 1), s);
      r.append(nm, bar, el('span', 'g', exact ? `${v} ${grade(v)}` : grade(v)));
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
      const look = CAST[r.id];
      if (look) d.append(portraitImg(r.id, look, r.trust < 0 ? '진지' : r.affinity >= 30 ? '웃음' : '', 2, 'rel-pt'));
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
  const tod = todOf(cal.slotName(g.state.time));
  $('time').prepend(iconImg(tod === 'night' ? 'moon' : tod === 'dawn' ? 'dawn' : 'sun', 1, 'tod-ic'));
  $('doom').textContent = doomText();
  const collapse = g.world.collapse();
  ($('collapse-fill') as HTMLElement).style.width = `${collapse}%`;
  $('collapse-val').textContent = `${collapse}%`;

  setAmbience(g.state.time.m, g.state.time.w, todOf(cal.slotName(g.state.time)));

  const logEl = $('log');
  let first: HTMLElement | null = null;
  fresh = [];
  for (; rendered < log.length; rendered++) {
    const node = renderItem(log[rendered]);
    first ??= node;
    logEl.append(node);
    fresh.push(node);
  }
  renderControls();
  renderPanel();
  runEffects();

  if (scroll) {
    const story = $('story');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bottom = story.scrollHeight - story.clientHeight;
    const target = first ? Math.min(bottom, first.offsetTop - 16) : bottom;
    story.scrollTo({ top: Math.max(0, target), behavior: reduce ? 'auto' : 'smooth' });
    ($('controls').querySelector('button:not([disabled])') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }
}

/** 계절 입자: 2월 눈, 3·4월 꽃잎, 5월 잎, 6월 장마, 7월 밤 반딧불 */
let ambienceKey = '';
function setAmbience(m: number, w: number, tod: string) {
  const kind = reduceMotion()
    ? ''
    : m === 2
      ? 'snow'
      : m === 3 || m === 4
        ? 'petal'
        : m === 5
          ? 'leaf'
          : m === 6 && (w === 2 || w === 3)
            ? 'rain'
            : m === 7 && tod === 'night'
              ? 'firefly'
              : '';
  const key = `${kind}`;
  if (key === ambienceKey) return;
  ambienceKey = key;
  const box = $('ambience');
  box.replaceChildren();
  box.className = kind;
  if (!kind) return;
  const n = kind === 'rain' ? 40 : kind === 'firefly' ? 12 : 16;
  for (let i = 0; i < n; i++) {
    const s = el('i');
    s.style.setProperty('--x', `${Math.random() * 100}%`);
    s.style.setProperty('--d', `${(kind === 'rain' ? 0.6 : kind === 'firefly' ? 6 : 9) * (0.7 + Math.random() * 0.6)}s`);
    s.style.setProperty('--delay', `${-Math.random() * 12}s`);
    s.style.setProperty('--drift', `${(Math.random() - 0.3) * 120}px`);
    s.style.setProperty('--y', `${Math.random() * 100}%`);
    box.append(s);
  }
}

/** 새로 그려진 기록에 연출을 건다 */
function runEffects() {
  if (!fresh.length) return;
  const motion = !reduceMotion();
  for (const node of fresh) {
    if (motion && node.matches('.scene')) {
      [...node.children].forEach((ch, i) => (ch as HTMLElement).style.setProperty('--i', String(Math.min(i, 14))));
      node.classList.add('reveal');
    }
    node.querySelectorAll<HTMLElement>('.check').forEach((chk) => {
      const d = chk.querySelector<HTMLElement>('.die');
      const wrap = chk.querySelector<HTMLElement>('.die-wrap');
      if (!d || !wrap) return;
      sfx('dice');
      if (!motion) return;
      chk.classList.add('rolling');
      rollDice(d, Number(d.dataset.final));
      window.setTimeout(() => {
        chk.classList.remove('rolling');
        chk.classList.add('landed');
        if (wrap.classList.contains('nat20')) {
          sfx('crit');
          for (let i = 0; i < 6; i++) floatText(wrap, '✦', 'spark', i * 40);
        }
      }, 620);
    });
    node.querySelectorAll<HTMLElement>('.sysline').forEach((d) => {
      const t = d.textContent ?? '';
      if (t.includes('원작 이탈')) {
        d.classList.add('glitch');
        replay($('meter'), 'pulse');
        sfx('glitch');
      }
      if (/기술 습득|아이템 획득|재능 개화|재능 진화/.test(t)) {
        d.classList.add('learn');
        toast(t.replace(/ \(.*\)$/, ''), 'learn');
        sfx('learn');
      }
    });
    node.querySelectorAll<HTMLElement>('.rankup').forEach((r) => {
      const name = /★ (.+) 인연/.exec(r.textContent ?? '')?.[1] ?? '';
      const face = lookOf(name);
      toast(r.textContent ?? '', 'rank', face ? portraitImg(face.key, face.look, '웃음', 1, 'mini') : undefined);
      sfx('rank');
    });
    if (node.matches('.battlelog.end')) {
      const win = node.classList.contains('win');
      toast(win ? '승리!' : '패배…', win ? 'win' : 'lose');
      sfx(win ? 'win' : 'lose');
    }
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
  } else if ((e.key === 'Enter' || e.key === ' ') && !(t instanceof HTMLButtonElement)) {
    const b = $('controls').querySelector<HTMLButtonElement>('.continue');
    if (b) {
      e.preventDefault();
      b.click();
    }
  }
});

loadSoundPref();
$('doom').before(iconImg('hourglass', 1, 'doom-ic'));
const soundBtn = $('sound') as HTMLButtonElement;
const syncSound = () => {
  soundBtn.textContent = soundOn() ? '소리 켬' : '소리 끔';
  soundBtn.setAttribute('aria-pressed', String(soundOn()));
};
syncSound();
soundBtn.addEventListener('click', () => {
  setSound(!soundOn());
  syncSound();
  sfx('click');
});
attachRipple(document.body);

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
