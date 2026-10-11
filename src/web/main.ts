// 브라우저 플레이 화면. 엔진은 터미널 버전과 똑같은 것을 쓴다.
// 콘텐츠(YAML)는 빌드 시 JSON으로 바뀌어 window.__HERO_CONTENT__로 들어온다.

import { EQUIP_SLOTS, buildContent, checkBuild, randomBuild, test, type Action, type BattleLine, type BattleView, type Build, type CheckResult, type Content, type EquipSlot, type FutureBranch, type FutureOption, type Item } from '../engine';
import { applyBuild } from '../engine/creation';
import { Game, type GameState } from '../engine/game';
import type { RenderedLine } from '../engine/text';
import { World } from '../engine/world';
import {
  ACTIVITY_ICON, CAST, DEFAULT_PLAYER, INTENT_ICON, PLAYER_EYES, PLAYER_HAIR, PLAYER_HAIR_COLOR, PLAYER_SKIN, STAT_ICON,
  bustResolver, bustSheet, drawCG, drawScene, enemySheet, extraLook, playerLook, todOf, type Look, type Tod,
} from '../art';
import { artUrl } from './art';
import { animateBar, attachRipple, loadSoundPref, reduceMotion, replay, setSound, sfx, soundOn, toast } from './fx';
import { interlude } from './interlude';
import { Dialog, Stage } from './stage';
import { iconImg, portraitImg, sceneImg } from './visuals';

declare global {
  interface Window {
    __HERO_CONTENT__: Record<string, unknown>;
    claude?: { hot?: { snapshot?: (fn: () => unknown) => void; ready?: (fn: (data: unknown) => void) => void; data?: unknown } };
  }
}

type LogItem =
  | { k: 'death'; cause: string }
  | { k: 'loop'; n: number; when: string }
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
type Tab = 'goals' | 'status' | 'bag' | 'people' | 'notes' | 'fate';

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
const CROWD = new Set(['학생들', '관중', '목소리', '???']);
const NO_FACE = new Set(['속마음', '시스템', '판정', '📌', '💠', '🎒', '삽화']);

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

  // 빙의자 기본기 (고르는 게 아니라 원래 갖고 있다)
  const sPerk = el('section', 'step');
  sPerk.append(el('h3', undefined, '빙의자 기본기'));
  const pk = el('div', 'window perkbox');
  pk.append(
    el('p', undefined, '3,000시간의 기억 — 원작의 사건, 위키의 공략, 데이터 파일 속 숨은 이름까지 안다.'),
    el('p', undefined, '기억의 파편 — 갈림길 앞에서 미래를 엿본다. 매달 하나씩, 원작을 바꿀 때마다 하나씩 차오른다 (최대 3).'),
    el('p', undefined, '회귀 — 죽으면 그 달 1주차로 돌아간다. 본 미래와 고른 길은 잊지 않는다.'),
  );
  sPerk.append(pk);
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
      if (t.tags.length) b.append(el('span', 'tags', t.tags.map((x) => `#${x}`).join(' ')));
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

  // 컨셉 미리보기
  const mine = new Set([...(content.origins.get(build.origin)?.talents ?? []), ...build.talents.map((x) => x.id)]);
  const syn = el('div', 'window synprev');
  syn.append(el('h4', undefined, '[컨셉]'));
  let anySyn = false;
  for (const sy of content.synergies.values()) {
    const n = [...mine].filter((id) => content.talents.get(id)?.tags.includes(sy.tag)).length;
    if (!n) continue;
    anySyn = true;
    let tier = 0;
    sy.tiers.forEach((x, i) => {
      if (n >= x.need) tier = i + 1;
    });
    const next = sy.tiers[tier];
    const r = el('div', `syn${tier ? ' on' : ''}`);
    r.append(el('b', undefined, `${sy.name}${tier ? ` ${'★'.repeat(tier)}` : ''}`), el('span', 'syn-n', `#${sy.tag} ${n}${next ? `/${next.need}` : ''}`));
    r.append(el('span', 'syn-d', tier ? sy.tiers[tier - 1].desc : `${next!.need}개면 · ${next!.desc}`));
    syn.append(r);
  }
  if (!anySyn) syn.append(el('div', 'legend', '같은 #갈래의 재능을 모으면 컨셉이 깨어난다 (2개, 3개).'));

  // 포인트 장부
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
  row('재능 (소모)', `−${chk.spent}`);
  row(`재능 (획득, 최대 ${content.rules.creation.negativeCap})`, `+${chk.gained}`);
  row('능력치 분배', allocated ? `−${allocated}` : '0');
  const left = row('남은 포인트', String(chk.remaining), 'total');
  if (chk.remaining < 0) left.className = 'bad';
  ledger.append(win, syn);
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

// ------------------------------------------------------------ game: 무대 위에서 한 장씩 넘긴다

let stage: Stage;
let dialog: Dialog;
/** 아직 무대에서 보여주지 않은 기록 */
let queue: LogItem[] = [];
let playing = false;
let waiter: (() => void) | null = null;
let autoPlay = false;
let skipMode = false;
let ctrlHeld = false;
const skipping = () => skipMode || ctrlHeld;
let cgActive = false;
let prevBars: { hp: number; ehp: number; sp: number; mp: number } | undefined;
/** 막간을 이미 보여준 시간대 */
let lastSlotKey = '';

function slotKey(): string {
  const t = game!.state.time;
  return `${t.y}.${t.m}.${t.w}.${cal.slotName(t)}`;
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, reduceMotion() ? Math.min(ms, 40) : ms));

function showCreate() {
  ambienceKey = '';
  $('ambience').replaceChildren();
  closeLog();
  $('screen-game').hidden = true;
  $('screen-create').hidden = false;
  for (const id of ['clock', 'meter', 'panel-toggle', 'restart']) $(id).hidden = true;
  renderCreate();
}

function showGame() {
  $('screen-create').hidden = true;
  $('screen-game').hidden = false;
  for (const id of ['clock', 'meter', 'panel-toggle', 'restart']) $(id).hidden = false;
  stage = new Stage($('stage'));
  dialog = new Dialog($('dialog'));
  rendered = log.length;
  queue = [];
  lastSlotKey = slotKey();
  // 이어하기: 지금 장면을 처음부터 다시 보여준다
  if (game!.state.phase === 'scene') {
    let i = log.length - 1;
    while (i >= 0 && !(log[i].k === 'scene' && !(log[i] as { cont?: boolean }).cont)) i--;
    if (i >= 0) queue = log.slice(i).filter((x) => x.k === 'scene');
  }
  renderHeader();
  play();
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

function afterAct() {
  queue.push(...log.slice(rendered));
  rendered = log.length;
  renderHeader();
  play();
}

/** 다음으로 넘기기 (무대·대사창 클릭, 스페이스, 엔터) */
function advance() {
  if (!game || $('screen-game').hidden) return;
  if (dialog?.isTyping) {
    dialog.complete();
    return;
  }
  if (waiter) {
    sfx('click');
    waiter();
    return;
  }
  if (!playing && game.state.phase === 'scene' && !game.state.scene?.choices.length) {
    sfx('click');
    act({ type: 'continue' }, '');
  }
}

function waitAdvance(autoMs?: number): Promise<void> {
  dialog.ready(true);
  return new Promise((resolve) => {
    let t = 0;
    const done = () => {
      window.clearTimeout(t);
      if (waiter === done) waiter = null;
      dialog.ready(false);
      resolve();
    };
    waiter = done;
    dialog.fast = skipping();
    const ms = skipping() ? 70 : autoMs ?? (autoPlay ? 1900 : 0);
    if (ms) t = window.setTimeout(done, ms);
  });
}

async function play() {
  if (playing) return;
  playing = true;
  const c = $('controls');
  c.replaceChildren();
  c.classList.add('wait');
  try {
    while (queue.length) await runItem(queue.shift()!);
    if (game && game.state.phase === 'activity' && slotKey() !== lastSlotKey) {
      lastSlotKey = slotKey();
      await runInterlude();
    }
  } catch (e) {
    console.error(e);
  } finally {
    playing = false;
    c.classList.remove('wait');
    renderControls();
    renderPanel();
  }
}

/** 새 시간대의 막간: 장소를 깔고 두세 줄로 분위기를 잡는다 */
async function runInterlude() {
  const g = game!;
  const slot = cal.slotName(g.state.time);
  const tod = todOf(slot);
  stage.clearActors();
  setBg(idleBg(), tod);
  const lines = interlude(g.state.time, slot);
  const inner = lines.filter((l) => l.startsWith('('));
  const narr = lines.filter((l) => !l.startsWith('('));
  stage.title(g.view().time);
  if (narr.length) {
    await dialog.show({ kind: 'narr', lines: narr, onTick: () => sfx('blip') });
    await waitAdvance();
  }
  if (inner.length) {
    await dialog.show({ kind: 'inner', lines: inner, onTick: () => sfx('blip') });
    await waitAdvance();
  }
}

async function runItem(it: LogItem) {
  if (it.k === 'act') return runChips(it);
  if (it.k === 'week') return runWeek(it);
  if (it.k === 'month') return runMonth(it);
  if (it.k === 'scene') return runScene(it);
  if (it.k === 'battle') return it.start ? runBattleStart(it) : runBattleTurn(it);
  if (it.k === 'death') return runDeathItem(it);
  if (it.k === 'loop') return runLoop(it);
}

// ---- 배경

function lookKey() {
  return `${JSON.stringify(build.look ?? DEFAULT_PLAYER)}:${build.origin}`;
}

function bgUrl(id: string, tod: string): { key: string; url: string; cg: boolean } {
  const def = content.art.get(id);
  if (def?.bg) {
    const t = def.tod ?? tod;
    return {
      key: `cg:${id}:${t}`,
      url: artUrl(`cg:${id}:${t}:${lookKey()}`, () => drawCG(def, t as Tod, bustResolver({ look: build.look, origin: build.origin }))),
      cg: !!def.cast?.length,
    };
  }
  return { key: `${id}:${tod}`, url: artUrl(`scene:${id}:${tod}`, () => drawScene(id, tod)), cg: false };
}

function setBg(id: string, tod: string, mode: 'fade' | 'flash' | 'cut' = 'fade') {
  const b = bgUrl(id, tod);
  stage.setBackground(b.key, b.url, mode);
  cgActive = b.cg;
  stage.setActorsHidden(cgActive);
}

function idleBg(): string {
  return game!.state.time.y === 0 ? 'home_room' : 'campus';
}

/** 기록용 삽화 이미지 (CG면 인물까지 합성) */
function artImg(id: string, tod: string, alt = ''): HTMLImageElement {
  const img = el('img', 'px scene-art');
  img.src = bgUrl(id, tod).url;
  img.alt = alt;
  img.width = 640;
  img.height = 360;
  return img;
}

function sheetUrl(key: string, look: Look, mood: string): string {
  return artUrl(`sheet:${key}:${mood}`, () => bustSheet(look, mood));
}

// ---- 장면

type Page =
  | { t: 'art'; id: string }
  | { t: 'check'; text: string; data?: CheckResult }
  | { t: 'pin'; text: string; kind?: string }
  | { t: 'say'; speaker: string; mood?: string; lines: string[] }
  | { t: 'narr' | 'inner' | 'sys'; lines: string[] };

const chars = (xs: string[]) => xs.reduce((a, x) => a + x.length, 0);

/** 대사를 한 화면씩 묶는다: 같은 사람의 짧은 말, 이어지는 지문은 합친다 */
function paginate(lines: RenderedLine[]): Page[] {
  const out: Page[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (l.speaker === '삽화') out.push({ t: 'art', id: l.text });
    else if (l.speaker === '판정') out.push({ t: 'check', text: l.text, data: l.check });
    else if (l.speaker === '📌' || l.speaker === '💠' || l.speaker === '🎒') out.push({ t: 'pin', text: l.text, kind: l.speaker });
    else if (l.speaker === '시스템') out.push({ t: 'sys', lines: [l.text] });
    else if (l.speaker === '속마음') {
      if (prev?.t === 'inner' && prev.lines.length < 2 && chars(prev.lines) + l.text.length < 70) prev.lines.push(l.text);
      else out.push({ t: 'inner', lines: [l.text] });
    } else if (!l.speaker) {
      if (prev?.t === 'narr' && prev.lines.length < 2 && chars(prev.lines) + l.text.length < 80) prev.lines.push(l.text);
      else out.push({ t: 'narr', lines: [l.text] });
    } else if (prev?.t === 'say' && prev.speaker === l.speaker && (prev.mood ?? '') === (l.mood ?? '') && prev.lines.length < 2 && chars(prev.lines) < 24 && l.text.length < 24) {
      prev.lines.push(l.text);
    } else out.push({ t: 'say', speaker: l.speaker, mood: l.mood, lines: [l.text] });
  }
  return out;
}

async function runScene(it: Extract<LogItem, { k: 'scene' }>) {
  const tod = it.tod ?? 'day';
  if (it.flavor && it.strip) {
    stage.clearActors();
    setBg(it.strip, tod);
  }
  if (!it.cont && !it.flavor) {
    stage.clearActors();
    // 장면 맨 앞의 삽화만 첫 배경으로 쓴다 (중간의 삽화 줄은 그 자리에서 바뀐다)
    const first = it.lines[0]?.speaker === '삽화' ? it.lines[0].text : undefined;
    const bg = first ?? it.strip;
    if (bg) setBg(bg, tod);
    else if (!stage.bgKey) setBg(idleBg(), tod);
    else {
      cgActive = false;
      stage.setActorsHidden(false);
    }
    stage.title(it.when, it.title);
    if (it.title) await sleep(300);
  }
  const intros = new Set(it.intros ?? []);
  for (const pg of paginate(it.lines)) {
    if (pg.t === 'art') {
      const b = bgUrl(pg.id, tod);
      if (b.key === stage.bgKey) continue;
      setBg(pg.id, tod, 'flash');
      await sleep(420);
    } else if (pg.t === 'check') await runCheck(pg.text, pg.data);
    else if (pg.t === 'pin') pinToast(pg.text, pg.kind);
    else await runPage(pg, intros);
  }
}

async function runPage(pg: Exclude<Page, { t: 'art' | 'check' | 'pin' }>, intros: Set<string>) {
  let name: string | undefined;
  let face: HTMLElement | undefined;
  let talkKey: string | null = null;
  if (pg.t === 'say') {
    if (pg.speaker === '나') {
      name = build.name;
      face = portraitImg(lookOf('나')!.key, myLook(), pg.mood ?? '', 1, 'dl-pt');
      stage.focus(null);
    } else {
      name = pg.speaker;
      const f = lookOf(pg.speaker);
      if (!f) {
        face = iconImg('people', 2);
        stage.focus(null);
      } else if (cgActive) {
        face = portraitImg(f.key, f.look, pg.mood ?? '', 1, 'dl-pt');
        stage.focus(null);
      } else {
        const mood = pg.mood ?? '';
        stage.showActor({ key: f.key, sheet: sheetUrl(f.key, f.look, mood), name: pg.speaker }, mood, intros.has(pg.speaker));
        stage.focus(f.key);
        talkKey = f.key;
      }
      if (intros.has(pg.speaker)) {
        intros.delete(pg.speaker);
        introBanner(pg.speaker);
      }
    }
  } else stage.focus(null);
  if (talkKey) stage.talk(talkKey, true);
  const lines = pg.t === 'say' ? pg.lines.map((x) => `“${x}”`) : pg.lines;
  await dialog.show({ kind: pg.t, name, face, lines, onTick: () => sfx('blip') });
  if (talkKey) stage.talk(talkKey, false);
  if (pg.t === 'sys') sysEffects(pg.lines.join(' '));
  await waitAdvance();
}

function introBanner(name: string) {
  const id = byName.get(name);
  const ch = id ? content.characters.get(id) : undefined;
  if (!ch) return;
  const b = el('div', 'st-intro');
  b.append(el('span', 'ik', '인물 등장'), el('b', undefined, ch.name));
  if (ch.desc) b.append(el('span', 'id', ch.desc));
  stage.fxEl.append(b);
  sfx('rank');
  window.setTimeout(() => b.classList.add('out'), 3000);
  window.setTimeout(() => b.remove(), 3500);
}

function pinToast(text: string, kind = '📌') {
  if (kind === '💠') {
    toast(text, 'shard', iconImg('shard', 1));
    stage.flash('violet');
    stage.burst(50, 40, '#b98af0', 12);
    sfx('learn');
    renderHeader();
    return;
  }
  if (kind === '🎒') {
    const it = [...content.items.values()].find((x) => text.startsWith(x.name));
    toast(text.includes('썼다') ? text : `획득 · ${text}`, 'learn', iconImg(it?.icon ?? 'bag', 1));
    sfx('learn');
    return;
  }
  const [k, rest] = text.split(' — ');
  toast(`${k} · ${rest ?? ''}`, 'pin', iconImg(k.includes('회수') ? 'target' : 'eye', 1));
  sfx('learn');
}

function sysEffects(t: string) {
  if (t.includes('원작 이탈')) {
    stage.root.classList.remove('glitch');
    void stage.root.offsetWidth;
    stage.root.classList.add('glitch');
    replay($('meter'), 'pulse');
    sfx('glitch');
  }
  if (/기술 습득|아이템 획득|재능 개화|재능 진화/.test(t)) {
    stage.flash('gold');
    stage.burst(50, 40, '#ffd36b', 14);
    toast(t.replace(/ \(.*\)$/, ''), 'learn');
    sfx('learn');
  }
}

const GRADE_LABEL: Record<CheckResult['grade'], string> = { great: '대성공', ok: '성공', fail: '실패', fumble: '대실패' };

/** "달변▲ 말더듬▼" */
function factorText(fs: { label: string; value: number }[], n = 3): string {
  return fs.slice(0, n).map((f) => `${f.label}${f.value > 0 ? (f.value >= 4 ? '▲▲' : '▲') : f.value <= -4 ? '▼▼' : '▼'}`).join('  ');
}

async function runCheck(text: string, data?: CheckResult) {
  if (data) {
    stage.focus(null);
    const sub = [`${data.odds}했던 판정 — ${GRADE_LABEL[data.grade]}`];
    if (data.factors.length) sub.push(factorText(data.factors, 4));
    const shown = dialog.show({ kind: 'check', name: `${data.name} 판정`, lines: sub, speed: 0 });
    const key = data.key ? (data.ok ? `${data.key.label} 덕분에!` : `${data.key.label}에 발목 잡혔다`) : undefined;
    await stage.dice(data.d20, data.grade, data.name, key, data.icon);
    await shown;
    await waitAdvance();
    return;
  }
  const ok = text.endsWith('성공');
  const m = /^(.*?) · (-?\d+) \+ 주사위 (\d+) = (-?\d+) \/ 목표 (\d+)/.exec(text);
  stage.focus(null);
  if (!m) {
    await dialog.show({ kind: 'check', lines: [text], speed: 0 });
    await waitAdvance();
    return;
  }
  const [, label, value, die, sum, dc] = m;
  const shown = dialog.show({ kind: 'check', name: `${label} 판정`, lines: [`능력 ${value} + 주사위 ${die} = ${sum}   ·   목표 ${dc}`], speed: 0 });
  await stage.dice(Number(die), ok ? 'ok' : 'fail', label);
  await shown;
  await waitAdvance();
}

// ---- 수치, 주, 달

/** 수치는 숫자 대신 감으로 보여준다: ▲ 조금 · ▲▲ 꽤 · ▲▲▲ 크게 (scale = 한 주·한 달처럼 모아 볼 때의 배율) */
function feel(label: string, n: number, scale = 1): string {
  const a = Math.abs(n) / scale;
  const [t1, t2] = label === '피로' || label === '스트레스' ? [8, 20] : label === '은화' ? [10, 30] : label.endsWith(' 호감') ? [4, 9] : [1, 2];
  const lv = a < t1 ? 1 : a < t2 ? 2 : 3;
  if (label.endsWith(' 호감')) return n > 0 ? '♥'.repeat(lv) : '▼'.repeat(lv);
  return (n > 0 ? '▲' : '▼').repeat(lv);
}

/** "근력 +1.2" → "근력 ▲▲" */
function feelText(d: string, scale = 1): string {
  const m = /^(.+?) ([+-]?[\d.]+)$/.exec(d);
  if (!m) return d;
  const label = m[1].replace(/ 호감$/, '');
  return `${label} ${feel(m[1], Number(m[2]), scale)}`;
}

function chipFor(d: string, scale = 1): { icon?: string; text: string; tone: 'up' | 'down' | 'bond' } | null {
  const m = /^(.+?) ([+-]?[\d.]+)$/.exec(d);
  if (!m) return null;
  const [, label, v] = m;
  const n = Number(v);
  const text = feelText(d, scale);
  if (label.endsWith(' 호감')) return { icon: 'heart', text, tone: n > 0 ? 'bond' : 'down' };
  if (STAT_ICON[label]) return { icon: STAT_ICON[label], text, tone: n > 0 ? 'up' : 'down' };
  const icon = ({ 피로: 'zzz', 스트레스: 'cloud', 은화: 'coin' } as Record<string, string>)[label];
  const bad = label === '피로' || label === '스트레스';
  return { icon, text, tone: n > 0 !== bad ? 'up' : 'down' };
}

async function runChips(it: Extract<LogItem, { k: 'act' }>) {
  const items = (it.deltas ?? []).map(chipFor).filter((x): x is NonNullable<typeof x> => !!x);
  if (items.length) stage.chips(items);
  for (const r of it.ranks ?? []) {
    const name = /^(.+) 인연/.exec(r)?.[1] ?? '';
    const face = lookOf(name);
    toast(`★ ${r}`, 'rank', face ? portraitImg(face.key, face.look, '웃음', 1, 'mini') : undefined);
    sfx('rank');
  }
  await sleep(items.length ? 120 : 0);
}

async function runWeek(it: Extract<LogItem, { k: 'week' }>) {
  const box = el('div', 'wk');
  box.append(el('span', 'wk-t', it.title));
  if (it.items.length) {
    const chips = el('div', 'wk-chips');
    for (const x of it.items) {
      const c = chipFor(x, 3);
      const s = el('span', `st-chip ${c?.tone ?? 'up'}`);
      if (c?.icon) s.append(iconImg(c.icon, 1));
      s.append(c?.text ?? x);
      chips.append(s);
    }
    box.append(chips);
  }
  if (it.season) box.append(el('p', 'wk-s', it.season));
  stage.card(box, 'week');
  $('play').classList.add('carding');
  sfx('whoosh');
  await waitAdvance(autoPlay ? 1600 : 2600);
  stage.hideCard();
  $('play').classList.remove('carding');
  await sleep(150);
}

async function runMonth(it: Extract<LogItem, { k: 'month' }>) {
  stage.clearActors();
  setBg(it.art, 'day');
  const box = el('div', 'mo');
  box.append(el('span', 'mo-k', 'CHAPTER'), el('h2', undefined, it.title), el('p', 'mo-s', it.season));
  for (const x of it.items) box.append(el('p', 'mo-r', x));
  stage.card(box, 'month');
  $('play').classList.add('carding');
  sfx('learn');
  await waitAdvance(autoPlay ? 2200 : 3600);
  stage.hideCard();
  $('play').classList.remove('carding');
  await sleep(200);
}

// ---- 죽음과 회귀

async function runDeathItem(it: Extract<LogItem, { k: 'death' }>) {
  stage.clearActors();
  stage.flash('red');
  stage.shake('big');
  sfx('hurt');
  stage.root.classList.add('dead');
  void it;
  await sleep(reduceMotion() ? 0 : 700);
}

async function runLoop(it: Extract<LogItem, { k: 'loop' }>) {
  stage.root.classList.remove('dead');
  stage.clearActors();
  setBg(idleBg(), 'dawn');
  const box = el('div', 'mo loop');
  box.append(el('span', 'mo-k', `회귀 ${it.n}`), el('h2', undefined, it.when), el('p', 'mo-s', '기억은 남아 있다. 다시, 이 아침부터.'));
  stage.card(box, 'month');
  $('play').classList.add('carding');
  stage.flash('violet');
  sfx('learn');
  await waitAdvance(autoPlay ? 2200 : 3600);
  stage.hideCard();
  $('play').classList.remove('carding');
  await sleep(200);
}

// ---- 전투

function enemySheetUrl(id: string, name: string) {
  return artUrl(`esheet:${id}`, () => enemySheet(id, name));
}

function battleActors() {
  const b = game!.state.battle;
  if (!b) return;
  const name = content.enemies.get(b.enemy)!.name;
  if (!stage.hasActor('enemy') || !stage.hasActor('me-b')) {
    stage.clearActors();
    stage.setActorsHidden(false);
    cgActive = false;
    stage.showActor({ key: 'me-b', sheet: sheetUrl(`me:${lookKey()}`, myLook(), '진지'), name: build.name }, '진지');
    stage.showActor({ key: 'enemy', sheet: enemySheetUrl(b.enemy, name), name }, '');
  }
  const low = b.hp / b.maxHp < 0.3;
  stage.showActor({ key: 'me-b', sheet: sheetUrl(`me:${lookKey()}`, myLook(), low ? '슬픔' : '진지'), name: build.name }, low ? '슬픔' : '진지');
  stage.focus(null);
}

async function runBattleStart(it: Extract<LogItem, { k: 'battle' }>) {
  const where = battleBackdrop();
  if (where) setBg(content.art.get(where.id)?.bg ?? where.id, where.tod);
  battleActors();
  stage.root.classList.add('battle');
  const box = el('div', 'bt');
  box.append(el('span', 'bt-k', 'BATTLE'), el('b', undefined, it.enemy));
  stage.card(box, 'battle-card');
  stage.flash('red');
  stage.shake('big');
  sfx('stamp');
  await dialog.show({ kind: 'battle', lines: it.lines.map((l) => l.text), speed: 10 });
  await sleep(900);
  stage.hideCard();
}

async function runBattleTurn(it: Extract<LogItem, { k: 'battle' }>) {
  battleActors();
  const rows: HTMLElement[] = [];
  const shown = dialog.show({ kind: 'battle', lines: [], speed: 0 });
  await shown;
  const text = $('dialog').querySelector('.dl-text')!;
  const ex = 72;
  const mx = 26;
  for (const l of it.lines) {
    const row = el('p', `bl ${l.who}${l.crit ? ' crit' : ''}`, l.text);
    if (l.dmg) row.append(el('b', l.to === 'me' ? 'dmg me' : 'dmg', ` −${l.dmg}`));
    if (l.heal) row.append(el('b', 'dmg heal', ` +${l.heal}`));
    text.append(row);
    rows.push(row);
    if (l.dmg && l.to === 'enemy') {
      const magic = /마법|폭발|영창/.test(l.text);
      if (l.who === 'me') stage.hit('me-b', 'lunge-r');
      await sleep(110);
      stage.slash(ex, 42, magic ? 'magic' : 'slash');
      sfx(l.crit ? 'crit' : 'slash');
      await sleep(70); // 타격 정지
      stage.hit('enemy', 'hurt');
      stage.pop(`−${l.dmg}`, ex + (Math.random() * 8 - 4), 26, l.crit ? 'crit' : l.who === 'ally' ? 'ally' : '');
      stage.burst(ex, 44, l.crit ? '#ffd36b' : '#ffffff', l.crit ? 16 : 8);
      if (l.crit) {
        stage.shake('big');
        stage.flash('white');
        stage.pop('CRITICAL', ex, 14, 'tag');
      } else stage.shake('small');
      sfx('hit');
      await sleep(l.crit ? 380 : 260);
    } else if (l.dmg && l.to === 'me') {
      stage.hit('enemy', 'lunge-l');
      await sleep(110);
      stage.slash(mx, 44, 'claw');
      sfx('hurt');
      await sleep(60);
      stage.hit('me-b', 'hurt');
      stage.flash('red');
      stage.shake(l.dmg >= 8 || l.crit ? 'big' : 'small');
      stage.pop(`−${l.dmg}`, mx, 28, 'me');
      await sleep(320);
    } else if (l.heal) {
      stage.pop(`+${l.heal}`, mx, 28, 'heal');
      stage.burst(mx, 44, '#5fd39c', 12);
      sfx('heal');
      await sleep(260);
    } else if (/튕겨냈다/.test(l.text)) {
      stage.flash('blue');
      stage.burst(mx + 8, 44, '#62c3ff', 14);
      stage.pop('패링!', mx, 22, 'guard');
      stage.hit('enemy', 'stagger');
      sfx('guard');
      await sleep(320);
    } else if (/^피했다/.test(l.text)) {
      stage.hit('me-b', 'dodge');
      stage.pop('회피!', mx, 22, 'guard');
      sfx('whoosh');
      await sleep(300);
    } else if (/보인다/.test(l.text)) {
      stage.flash('blue');
      stage.pop('간파!', ex, 18, 'read');
      sfx('learn');
      await sleep(260);
    } else if (/흩어졌다|무너졌다/.test(l.text)) {
      stage.pop('빈틈!', ex, 18, 'gold');
      stage.hit('enemy', 'stagger');
      sfx('stamp');
      await sleep(260);
    } else if (l.who === 'enemy' && /자세|방벽|힘을 모|숨|영창|버틴|세웠|녹아/.test(l.text)) {
      stage.hit('enemy', 'r-lean');
      await sleep(200);
    } else await sleep(160);
  }
  if (it.result) {
    await sleep(200);
    if (it.result === 'win') {
      stage.hit('enemy', 'defeat');
      stage.flash('white');
      sfx('win');
    } else {
      stage.root.classList.add('defeated');
      sfx('lose');
    }
    const box = el('div', `res-stamp ${it.result}`, it.result === 'win' ? '승리' : '패배');
    stage.card(box, 'result-card');
    await waitAdvance(autoPlay ? 1500 : 2400);
    stage.hideCard();
    stage.root.classList.remove('battle', 'defeated');
    stage.clearActors();
    stage.hudEl.replaceChildren();
  }
}

// ---- 조작부

function renderHeader() {
  const g = game!;
  const v = g.view();
  $('time').textContent = v.phase === 'ended' ? '1학년 1학기 끝' : v.time;
  const tod = todOf(cal.slotName(g.state.time));
  $('time').prepend(iconImg(tod === 'night' ? 'moon' : tod === 'dawn' ? 'dawn' : 'sun', 1, 'tod-ic'));
  $('doom').textContent = doomText();
  const mem = g.view().memory;
  const sh = $('shards');
  sh.replaceChildren();
  sh.hidden = false;
  sh.title = `기억의 파편 ${mem.shard}/${mem.max}${mem.deaths ? ` · 회귀 ${mem.deaths}번` : ''}`;
  for (let i = 0; i < mem.max; i++) sh.append(iconImg('shard', 1, i < mem.shard ? 'sh on' : 'sh off'));
  if (mem.deaths) sh.append(el('span', 'loopn', `↺${mem.deaths}`));
  const collapse = g.world.collapse();
  ($('collapse-fill') as HTMLElement).style.width = `${collapse}%`;
  $('collapse-val').textContent = `${collapse}%`;
  setAmbience(g.state.time.m, g.state.time.w, tod);
}

function previewChips(id: string): HTMLElement {
  const row = el('span', 'pv');
  for (const { key, delta } of game!.preview(id)) {
    if (Math.abs(delta) < 0.05) continue;
    const label = key.startsWith('stat.') ? key.slice(5) : key;
    const icon = key.startsWith('stat.') ? STAT_ICON[label] : ({ fatigue: 'zzz', stress: 'cloud', money: 'coin' } as Record<string, string>)[key];
    if (!icon) continue;
    const bad = key === 'fatigue' || key === 'stress';
    const good = delta > 0 !== bad;
    const name = key.startsWith('stat.') ? label : ({ fatigue: '피로', stress: '스트레스', money: '은화' } as Record<string, string>)[key];
    const c = el('span', `pv-c ${good ? 'up' : 'down'}`);
    c.title = `${name} ${feel(name, delta)}`;
    c.append(iconImg(icon, 1), feel(name, delta));
    row.append(c);
  }
  return row;
}


// ---- 가방과 장비

const SLOT_ICON: Record<string, string> = { 모자: 'hat', 윗옷: 'shirt', 아래옷: 'pants', 한벌옷: 'robe', 장신구1: 'ring', 장신구2: 'amulet', 무기: 'sword', 신발: 'boots' };

function bonusChips(it: Item): HTMLElement {
  const row = el('span', 'bonus');
  const lv = (n: number) => (n > 0 ? '▲'.repeat(Math.min(3, Math.max(1, Math.round(n)))) : '▼');
  for (const [k, v] of Object.entries(it.checks)) row.append(el('span', 'bc', `${k} ${lv(v)}`));
  for (const [k, v] of Object.entries(it.battle)) row.append(el('span', 'bc war', `${GEAR_LABEL[k] ?? k} ${lv(v)}`));
  return row;
}

function afterBag() {
  writeSave();
  renderPanel();
  if (game && (game.state.phase === 'activity' || game.state.phase === 'scene')) renderControls();
}

function renderBag(pane: HTMLElement) {
  const g = game!;
  const can = g.canManage();
  const inv = g.inventory();
  const gear = window_('[장비]');
  const grid = el('div', 'slots');
  for (const slot of EQUIP_SLOTS) {
    const id = g.state.vars[`equip.${slot}`];
    const it = typeof id === 'string' ? content.items.get(id) : undefined;
    const covered = !it && (slot === '윗옷' || slot === '아래옷') && g.state.vars['equip.한벌옷'];
    const cell = el('button', `slot${it ? ' on' : ''}`);
    cell.type = 'button';
    cell.append(iconImg(it?.icon ?? SLOT_ICON[slot], 2, it ? '' : 'ghost'));
    cell.append(el('span', 'sl', slot.replace(/\d$/, '')), el('span', 'sn', it ? it.name : covered ? '(한벌옷)' : '비어 있음'));
    cell.disabled = !it || !can;
    if (it) cell.title = `${it.name} — 눌러서 벗기`;
    cell.addEventListener('click', () => {
      if (!it) return;
      g.unequip(slot as EquipSlot);
      sfx('click');
      afterBag();
    });
    grid.append(cell);
  }
  gear.append(grid);
  if (!can) gear.append(el('div', 'legend', '지금은 장비를 바꿀 수 없다.'));
  pane.append(gear);

  const groups: [string, Item['kind']][] = [['[장비품]', 'equip'], ['[소모품]', 'use'], ['[귀중품]', 'key']];
  for (const [title, kind] of groups) {
    const xs = inv.filter((x) => x.item.kind === kind);
    if (!xs.length) continue;
    const w = window_(title);
    for (const { item, count, equipped } of xs) {
      const r = el('div', 'inv');
      r.append(iconImg(item.icon, 2));
      const body = el('div', 'ib');
      body.append(el('b', undefined, `${item.name}${count > 1 ? ` ×${count}` : ''}${equipped.length ? ' · 착용 중' : ''}`));
      if (item.desc) body.append(el('span', 'idesc', item.desc));
      if (Object.keys(item.checks).length || Object.keys(item.battle).length) body.append(bonusChips(item));
      r.append(body);
      if (kind === 'equip' && can && equipped.length < count) {
        r.append(button('ibtn', '착용', () => {
          try {
            g.equip(item.id);
          } catch {
            return;
          }
          sfx('pick');
          afterBag();
        }));
      }
      if (kind === 'use' && can && item.use.length) {
        r.append(button('ibtn', '사용', () => {
          const lines = g.useItem(item.id);
          pinToast(lines[0]?.text ?? item.name, '🎒');
          afterBag();
          renderHeader();
        }));
      }
      w.append(r);
    }
    pane.append(w);
  }
  if (!inv.length) pane.append(el('p', 'empty', '가방이 비어 있다. 상점가에서 사거나, 누군가에게 받을 수 있다.'));
}

// ---- 기억의 파편: 미래 보기

const GEAR_LABEL: Record<string, string> = {
  hp: '체력', sp: '기력', mp: '마나', atk: '공격', matk: '마법 공격', def: '방어', dodge: '회피', read: '간파', persuade: '전투 설득',
};

/** 미래에 바뀌는 값 하나 → 칩 */
function futureChip(ch: FutureBranch['changes'][number]): HTMLElement | null {
  const k = ch.key;
  const d = ch.delta ?? 0;
  const chip = (text: string, tone: string, icon?: string) => {
    const c = el('span', `fc ${tone}`);
    if (icon) c.append(iconImg(icon, 1));
    c.append(text);
    return c;
  };
  if (k.startsWith('stat.')) return chip(`${k.slice(5)} ${feel(k.slice(5), d)}`, d > 0 ? 'up' : 'down', STAT_ICON[k.slice(5)]);
  if (k.startsWith('affinity.')) {
    const name = content.characters.get(k.slice(9))?.name ?? k.slice(9);
    return chip(`${name} ${feel(`${name} 호감`, d)}`, d > 0 ? 'bond' : 'down', 'heart');
  }
  if (k === 'money') return chip(`은화 ${feel('은화', d)}`, d > 0 ? 'up' : 'down', 'coin');
  if (k === 'fatigue') return chip(`피로 ${feel('피로', d)}`, d > 0 ? 'down' : 'up', 'zzz');
  if (k === 'stress') return chip(`스트레스 ${feel('스트레스', d)}`, d > 0 ? 'down' : 'up', 'cloud');
  if (k === 'shard') return chip(`기억의 파편 ${d > 0 ? '+' : ''}${d}`, d > 0 ? 'up' : 'down', 'shard');
  if (k.startsWith('item.')) {
    const it = content.items.get(k.slice(5));
    return it ? chip(`${it.name}${d < 0 ? ' 잃음' : ''}`, d > 0 ? 'gain' : 'down', it.icon) : null;
  }
  if (k.startsWith('talent.') && d > 0) {
    const t = content.talents.get(k.slice(7).split('.')[0]);
    return t ? chip(`재능 ${t.name}`, 'gain', 'star') : null;
  }
  if (k.startsWith('skill.') && d > 0) {
    const sk = content.skills.get(k.slice(6));
    return chip(`기술 ${sk?.name ?? k.slice(6)}`, 'gain', 'scroll');
  }
  if (k.startsWith('note.') && k.endsWith('.known')) {
    const n = content.notes.get(k.slice(5, -6));
    return n ? chip(`노트 ${n.title}`, 'gain', 'book') : null;
  }
  const cr = content.crossroadByKey.get(k);
  if (cr) return chip(`운명 · ${cr.title}: ${cr.labels[String(ch.value)] ?? String(ch.value)}`, ch.value === cr.canon ? 'down' : 'fate', 'hourglass');
  return null;
}

function futureEl(opt: FutureOption | undefined): HTMLElement | null {
  if (!opt) return null;
  const box = el('span', 'future');
  if (opt.veiled) {
    box.append(el('span', 'fv', '기억에 없는 일이다'));
    return box;
  }
  if (opt.disabled) return null;
  for (const br of opt.branches) {
    const row = el('span', 'fb');
    if (br.label) row.append(el('span', `fl ${br.label === '성공' ? 'ok' : 'ng'}`, `${br.label} ${Math.round((br.chance ?? 0) * 100)}%`));
    const chips = br.changes.map(futureChip).filter((x): x is HTMLElement => !!x);
    for (const c of chips.slice(0, 6)) row.append(c);
    for (const e of br.events.slice(0, 2)) row.append(el('span', 'fc ev', `→ 「${e}」`));
    if (br.battle) row.append(el('span', 'fc war', `⚔ ${br.battle}`));
    if (br.death) row.append(el('span', 'fc death', `☠ 죽는다`));
    if (!chips.length && !br.events.length && !br.battle && !br.death) row.append(el('span', 'fc none', '별일 없다'));
    if (br.more) row.append(el('span', 'fc more', '…또 고를 일이 생긴다'));
    box.append(row);
  }
  return box;
}

/** 지금 결정에 대해 본 미래 (이미 본 자리면 공짜로 다시 떠오른다) */
function currentFuture(): Map<string, FutureOption> | undefined {
  const g = game!;
  const key = g.decisionKey();
  if (!key) return undefined;
  if (g.state.foresight?.key !== key && g.foresightCost() === 0) g.foresee();
  if (g.state.foresight?.key !== key) return undefined;
  return new Map(g.state.foresight.options.map((o) => [o.id, o]));
}

function memoryBar(): HTMLElement | null {
  const g = game!;
  const v = g.view();
  const cost = v.memory.cost;
  if (cost === undefined) return null;
  const bar = el('div', 'memory');
  const gems = el('span', 'gems');
  for (let i = 0; i < v.memory.max; i++) gems.append(iconImg('shard', 1, i < v.memory.shard ? 'sh on' : 'sh off'));
  bar.append(gems);
  const seen = g.state.foresight?.key === g.decisionKey();
  if (seen) {
    bar.append(el('span', 'mtxt', cost === 0 && v.memory.deaths ? '지난 생에 본 미래가 떠오른다.' : '기억 속 미래가 겹쳐 보인다.'));
    return bar;
  }
  const can = cost === 0 || v.memory.shard >= 1;
  const b = button('remember', cost === 0 ? '본 적 있는 미래를 떠올린다' : '기억을 더듬는다 · 파편 1', () => {
    if (!game || busy) return;
    try {
      game.foresee();
    } catch {
      return;
    }
    sfx('learn');
    stage.flash('violet');
    stage.burst(50, 45, '#b98af0', 18);
    writeSave();
    renderControls();
  });
  b.prepend(iconImg('shard', 1));
  b.disabled = !can;
  if (!can) b.title = '기억의 파편이 없다. 매달 하나씩, 원작을 바꿀 때마다 하나씩 차오른다.';
  bar.append(b);
  return bar;
}

const ODDS_CLASS: Record<string, string> = { 확실: 'hi', 유리: 'hi', 반반: 'mid', 불리: 'lo', 무모: 'lo' };

function oddsChip(ck: NonNullable<ReturnType<Game['view']>['choices'][number]['check']>): HTMLElement {
  const tag = el('span', `odds ${ODDS_CLASS[ck.odds] ?? 'mid'}`);
  tag.append(iconImg(ck.icon || 'dice', 1), el('b', undefined, `${ck.label} · ${ck.odds}`));
  for (const f of ck.factors) tag.append(el('span', `fx ${f.value > 0 ? 'up' : 'down'}`, `${f.label}${f.value > 0 ? '▲' : '▼'}`));
  return tag;
}

function renderDeath(c: HTMLElement) {
  const g = game!;
  const v = g.view();
  stage.clearActors();
  stage.root.classList.add('dead');
  dialog.show({ kind: 'prompt', name: '', lines: ['……', `${v.dead?.cause ?? ''}`, '의식이 꺼진다.'], speed: 0 });
  const box = el('div', 'deathbox');
  box.append(el('p', 'dt', '[ 사망 ]'));
  box.append(el('p', undefined, '하지만 기억은 꺼지지 않았다. 이번 달 첫 주의 아침으로 돌아간다.'));
  const b = button('primary regress', '기억을 안고 돌아간다', () => {
    sfx('stamp');
    stage.root.classList.remove('dead');
    act({ type: 'regress' }, '');
  });
  box.append(b);
  c.append(box);
}

function renderControls() {
  const g = game!;
  const v = g.view();
  const c = $('controls');
  c.replaceChildren();
  renderHeader();
  if (v.phase !== 'battle') {
    stage.hudEl.replaceChildren();
    stage.root.classList.remove('battle');
  }
  if (v.phase === 'dead') {
    renderDeath(c);
    return;
  }
  stage.root.classList.remove('dead');
  if (v.phase === 'ended') {
    stage.clearActors();
    setBg('rooftop', 'dusk');
    dialog.show({ kind: 'prompt', name: '종업식', lines: ['1학년 1학기가 끝났다. 여름방학이다.'], speed: 0 });
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
    const tod = todOf(cal.slotName(g.state.time));
    stage.clearActors();
    setBg(idleBg(), tod);
    const next = g.upcoming(1)[0];
    const sub = next ? [`다음 일정 · ${next.label} (${next.weeks <= 0 ? '이번 주' : `${next.weeks}주 뒤`})`] : [];
    dialog.show({ kind: 'prompt', name: cal.slotName(g.state.time), lines: ['무엇을 할까?', ...sub], speed: 0 });
    const mb = memoryBar();
    if (mb) c.append(mb);
    const fut = currentFuture();
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
      txt.append(previewChips(a.id));
      const fe = futureEl(fut?.get(a.id));
      if (fe) {
        // 미래가 보이면 수치 미리보기 대신 벌어질 일을 보여준다
        txt.lastElementChild?.remove();
        txt.append(fe);
        b.classList.add('seen');
      }
      b.append(txt);
      grid.append(b);
    });
    c.append(grid);
    return;
  }
  if (v.choices.length) {
    const mb = memoryBar();
    if (mb) c.append(mb);
    const fut = currentFuture();
    const list = el('div', 'choices');
    v.choices.forEach((ch, i) => {
      const b: HTMLButtonElement = button('choice', '', () => pick(b, () => act({ type: 'choice', index: ch.index }, ch.text)));
      b.dataset.idx = String(i + 1);
      b.disabled = !ch.enabled;
      const body = el('span', 'ct');
      body.append(ch.text);
      if (!ch.enabled) body.append(el('span', 'lock', '조건이 부족하다'));
      if (ch.hint) body.append(el('span', 'hint', `⚠ ${ch.hint}`));
      if (ch.past) body.prepend(el('span', 'past', '지난 생에 고른 길'));
      const fe = futureEl(fut?.get(String(ch.index)));
      if (fe) {
        body.append(fe);
        b.classList.add('seen');
      }
      b.append(el('span', 'k', String(i + 1)), body);
      if (ch.check && !ch.check.hidden) b.append(oddsChip(ch.check));
      list.append(b);
    });
    c.append(list);
    dialog.ready(false);
    return;
  }
  const pending = g.state.scene?.battle;
  const nb = button(pending ? 'continue fight' : 'continue', pending ? '⚔ 전투 시작' : '다음 ▶', () => {
    sfx(pending ? 'stamp' : 'click');
    act({ type: 'continue' }, '');
  });
  c.append(nb);
  dialog.ready(true);
}

function renderBattle(c: HTMLElement, bt: BattleView) {
  stage.root.classList.add('battle');
  battleActors();
  const prev = prevBars;
  prevBars = undefined;
  const hud = stage.hudEl;
  hud.replaceChildren();
  const enemyId = game!.state.battle?.enemy ?? '';
  // 적 체력
  const foe = el('div', `hud-foe${bt.enemy.enraged ? ' enraged' : ''}`);
  const fh = el('div', 'hn');
  fh.append(el('b', undefined, bt.enemy.name), el('span', 'num', `${bt.enemy.hp}/${bt.enemy.maxHp}`));
  foe.append(fh, bar('hp foe', prev?.ehp, bt.enemy.hp / bt.enemy.maxHp));
  hud.append(foe);
  // 다음 행동
  const danger = bt.intent.clarity === 'exact' && ['강타', '차지', '마법'].includes(bt.intent.label);
  const it = el('div', `hud-intent intent ${bt.intent.clarity}${danger ? ' danger' : ''}`);
  const lab = el('b');
  lab.append(iconImg(INTENT_ICON[bt.intent.label] ?? INTENT_ICON['?'], 2, 'iic'), bt.intent.label);
  it.append(el('span', 'il', bt.intent.charged ? '다음 행동 · 힘을 모았다' : '다음 행동'), lab, el('span', 'it', bt.intent.text));
  hud.append(it);
  // 내 상태
  const me = el('div', 'hud-me');
  const mh = el('div', 'hn');
  mh.append(el('b', undefined, build.name), el('span', 'num', `${bt.me.hp}/${bt.me.maxHp}`));
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
  hud.append(me);
  const tags = el('div', 'hud-tags');
  tags.append(el('span', 'chip turn', `턴 ${bt.turn + 1}/${bt.turns}`));
  if (bt.ally) {
    const chip = el('span', 'chip ally');
    const face = lookOf(bt.ally);
    if (face) chip.append(portraitImg(face.key, face.look, '진지', 1, 'mini'));
    chip.append(`동료 · ${bt.ally}`);
    tags.append(chip);
  }
  for (const s of bt.status) tags.append(el('span', 'chip', s));
  hud.append(tags);
  void enemyId;

  if (!dialog.isTyping && !$('dialog').querySelector('.bl')) {
    dialog.show({ kind: 'battle', name: '전투', lines: ['적의 다음 행동을 보고 맞받아칠 기술을 고르자.'], speed: 0 });
  }

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
  c.append(grid);
}

// ---- 기록

function openLog() {
  const d = $('drawer');
  const lg = $('log');
  lg.replaceChildren(...log.map(renderItem));
  d.hidden = false;
  requestAnimationFrame(() => {
    d.classList.add('open');
    const body = $('drawer-body');
    body.scrollTop = body.scrollHeight;
  });
}

function closeLog() {
  const d = $('drawer');
  d.classList.remove('open');
  window.setTimeout(() => {
    if (!d.classList.contains('open')) d.hidden = true;
  }, 260);
}

// ------------------------------------------------------------ 기록·상태창 (그대로)

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
      items: mi.length ? [`지난달 · ${mi.map((x) => feelText(x, 8)).join('  ')}`] : [],
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
    if (!cont && !v.lines.some((l) => l.speaker === '삽화')) {
      const ev = content.events.get(game!.state.scene?.eventId ?? '');
      if (ev?.trigger.kind === 'activity') {
        const aid = ev.trigger.ids.includes(lastActivity) ? lastActivity : ev.trigger.ids[0];
        strip = content.activities.get(aid)?.art;
      } else if (!ev && lastActivity) strip = content.activities.get(lastActivity)?.art;
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
  const wasDead = game.state.phase === 'dead';
  game.act(a);
  if (wasDead) {
    log.push({ k: 'loop', n: game.state.meta.deaths, when: game.view().time });
    weekKey = '';
  }
  const ended = game.state.lastBattle?.result;
  if (wasBattle) {
    const lines = game.state.battle?.log ?? game.state.lastBattle?.log ?? [];
    log.push({ k: 'battle', enemy: enemyName, lines, result: ended });
    prevBars = prev;
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
  }
  if (game.state.phase === 'dead' && !wasDead) log.push({ k: 'death', cause: game.state.dead?.cause ?? '' });
  checkWeek();
  if (label || deltas.length || ranks.length) {
    log.splice(at, 0, { k: 'act', text: label, deltas, ranks, icon: a.type === 'activity' ? ACTIVITY_ICON[a.id] : undefined });
  }
  writeSave();
  afterAct();
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
    f.append(artImg(l.text, tod, title));
    if (title) f.append(el('figcaption', undefined, title));
    return f;
  }
  if (l.speaker === '판정' && l.check) {
    const c = l.check;
    const d = el('div', c.ok ? 'check ok' : 'check ng');
    d.append(el('span', 'tag', GRADE_LABEL[c.grade]), iconImg(c.icon, 1), el('b', 'clabel', `${c.name} · ${c.odds}`));
    if (c.factors.length) d.append(el('span', 'cmath', factorText(c.factors, 4)));
    return d;
  }
  if (l.speaker === '판정') return renderCheck(l.text);
  if (l.speaker === '💠' || l.speaker === '🎒') {
    const d = el('div', 'pin');
    d.append(iconImg(l.speaker === '💠' ? 'shard' : 'bag', 1), el('span', undefined, l.text));
    return d;
  }
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
    if (item.deltas?.length) d.append(el('span', 'delta', item.deltas.map((x) => feelText(x)).join('  ')));
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
      for (const x of item.items) chips.append(el('span', x.includes('-') ? 'chip down' : 'chip', feelText(x, 3)));
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
  if (item.k === 'death') return el('div', 'deathlog', `[ 사망 ] ${item.cause}`);
  if (item.k === 'loop') return el('div', 'looplog', `↺ 회귀 ${item.n} — ${item.when}`);
  const a = el('article', item.cont || item.flavor ? 'scene cont' : 'scene');
  if (item.strip) {
    const f = el('figure', 'strip');
    f.append(artImg(item.strip, item.tod ?? 'day', content.art.get(item.strip)?.title ?? ''));
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
    prev = l.speaker && !['판정', '📌', '💠', '🎒', '시스템', '삽화'].includes(l.speaker) ? l.speaker : '';
  }
  return a;
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
    ['bag', '가방', g.inventory().length],
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
    pane.append(tw);

    // 컨셉 시너지: 같은 태그의 재능이 모일수록 깨어난다
    const sw = window_('[컨셉]');
    let any = false;
    for (const sy of content.synergies.values()) {
      const have = [...content.talents.values()].filter((t) => t.tags.includes(sy.tag) && g.state.vars[`talent.${t.id}`]).length;
      if (!have) continue;
      any = true;
      const tier = g.world.synergyTier(sy);
      const next = sy.tiers[tier];
      const r = el('div', `syn${tier ? ' on' : ''}`);
      r.append(el('b', undefined, `${sy.name}${tier ? ` ${'★'.repeat(tier)}` : ''}`), el('span', 'syn-n', `${sy.tag} ${have}${next ? `/${next.need}` : ''}`));
      r.append(el('span', 'syn-d', tier ? sy.tiers[tier - 1].desc : `${sy.tag} 재능이 ${next!.need}개면: ${next!.desc}`));
      sw.append(r);
    }
    if (!any) sw.append(el('div', 'legend', '아직 깨어난 컨셉이 없다. 같은 갈래의 재능이 모이면 깨어난다.'));
    pane.append(sw);
  } else if (tab === 'bag') {
    renderBag(pane);
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

// ------------------------------------------------------------ boot

document.addEventListener('keydown', (e) => {
  if (!game || $('screen-game').hidden) return;
  const t = e.target as HTMLElement;
  if (t.matches('input, select, textarea')) return;
  if (e.key === 'Escape') return closeLog();
  if (!$('drawer').hidden) return;
  if (e.key === 'l' || e.key === 'L') return openLog();
  if (e.key >= '1' && e.key <= '9') {
    const b = $('controls').querySelector<HTMLButtonElement>(`[data-idx="${e.key}"]`);
    if (b && !b.disabled) {
      e.preventDefault();
      b.click();
    }
  } else if ((e.key === 'Enter' || e.key === ' ') && !(t instanceof HTMLButtonElement)) {
    e.preventDefault();
    advance();
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
$('stage').addEventListener('click', advance);
$('dialog').addEventListener('click', advance);
$('btn-log').addEventListener('click', openLog);
$('drawer-close').addEventListener('click', closeLog);
$('drawer').addEventListener('click', (e) => {
  if (e.target === $('drawer')) closeLog();
});
const skipBtn = $('btn-skip') as HTMLButtonElement;
const syncSkip = () => {
  skipBtn.setAttribute('aria-pressed', String(skipMode));
  skipBtn.textContent = skipMode ? '빠르게 ▶▶' : '빠르게';
  if (dialog) dialog.fast = skipping();
};
skipBtn.addEventListener('click', () => {
  skipMode = !skipMode;
  syncSkip();
  if (skipMode) waiter?.();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Control' && !ctrlHeld) {
    ctrlHeld = true;
    syncSkip();
    dialog?.complete();
    waiter?.();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'Control') {
    ctrlHeld = false;
    syncSkip();
  }
});
window.addEventListener('blur', () => {
  ctrlHeld = false;
});
const autoBtn = $('btn-auto') as HTMLButtonElement;
autoBtn.addEventListener('click', () => {
  autoPlay = !autoPlay;
  autoBtn.setAttribute('aria-pressed', String(autoPlay));
  autoBtn.textContent = autoPlay ? '자동 ▶' : '자동';
  if (autoPlay) waiter?.();
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
