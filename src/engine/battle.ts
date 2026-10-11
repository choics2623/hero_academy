// 패턴 읽기 전투.
//
// 적은 매 턴 다음 행동(의도)을 예고한다: 공격 / 강타 / 방어 / 차지(힘 모으기) / 마법.
// 플레이어는 그 의도를 읽고 대응한다.
//   강타   → 방어하면 튕겨내서 빈틈을 만든다 / 회피하면 반격 기회
//   차지   → 강타로 끊으면 모으던 힘이 흩어진다 (못 끊으면 다음 턴에 1.5배 강타)
//   방어   → 물리 공격은 막힌다. 마법이나 간파로 무너뜨린다
//   마법   → 방어로도 덜 막힌다. 회피가 어렵다
// 의도가 얼마나 정확히 보이는지는 '간파' 수치(지성·직감 등)와 공략 노트에 달려 있다.
// 원작을 3,000시간 한 고인물이 패턴을 아는 것 자체가 무기가 되는 구조다.

import type { Content, Enemy, Intent, Skill } from './content';
import { evaluate, test, toNum, truthy } from './expr';
import type { World } from './world';

export interface BattleLine {
  who: 'me' | 'enemy' | 'ally' | 'sys';
  text: string;
  dmg?: number;
  to?: 'me' | 'enemy';
  crit?: boolean;
  heal?: number;
}

export interface BattleState {
  enemy: string;
  ally?: string;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  mp: number;
  maxMp: number;
  ehp: number;
  emaxHp: number;
  step: number;
  intent: Intent;
  charged: boolean;
  /** 적이 무방비 상태로 남은 턴 수 (방어 0, 피해 1.3배) */
  broken: number;
  blind: number;
  /** 다음 공격 배율 (회피 성공 시) */
  counter: number;
  revealed: number;
  enraged: boolean;
  turn: number;
  turns: number;
  log: BattleLine[];
  /** 전투를 품은 결과 노드의 경로 (승패 결과를 찾기 위해) */
  path: string;
  next?: string;
  then: 'endSlot' | 'dispatch';
  eventId: string;
  title?: string;
  result?: 'win' | 'lose';
}

export type Clarity = 'exact' | 'vague' | 'hidden';

export interface BattleView {
  enemy: { name: string; hp: number; maxHp: number; enraged: boolean };
  me: { hp: number; maxHp: number; sp: number; maxSp: number; mp: number; maxMp: number };
  ally?: string;
  intent: { clarity: Clarity; label: string; text: string; charged: boolean };
  status: string[];
  turn: number;
  turns: number;
  log: BattleLine[];
  skills: { id: string; name: string; desc: string; cost: string; enabled: boolean; reason?: string }[];
}

const DEFAULT_TELLS: Record<Intent, string> = {
  공격: '공격 자세를 잡는다',
  강타: '크게 숨을 들이쉰다 — 강한 일격이 온다',
  방어: '자세를 낮추고 몸을 웅크린다',
  차지: '힘을 모으기 시작한다',
  마법: '주위에 마력이 모인다',
};

/** 받침에 맞는 조사: ig('아렌') → '아렌이', ig('브루노') → '브루노가' */
export function ig(name: string): string {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  const batchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return name + (batchim ? '이' : '가');
}

const DEFAULT_ACTS: Record<Intent, string> = {
  공격: '{e}의 공격!',
  강타: '{e}의 강타!',
  방어: '{e:ig} 방어 태세를 취한다.',
  차지: '{e:ig} 힘을 모은다.',
  마법: '{e}의 마법 공격!',
};

type Rand = () => number;

interface Stats {
  hp: number;
  sp: number;
  mp: number;
  atk: number;
  matk: number;
  def: number;
  dodge: number;
  read: number;
  persuade: number;
  mpRegen: number;
}

export function battleStats(c: Content, w: World): Stats {
  // 장비·시너지의 전투 보정(gear.X)은 공식 밖에서 더한다
  const f = (k: string, d: number) => (c.rules.battle[k] ? toNum(evaluate(c.rules.battle[k].ast, w)) : d) + w.gear(k);
  return {
    hp: Math.round(f('hp', 30)),
    sp: Math.round(f('sp', 8)),
    mp: Math.round(f('mp', 0)),
    atk: f('atk', 6),
    matk: f('matk', 5),
    def: f('def', 0),
    dodge: f('dodge', 10),
    read: f('read', 10),
    persuade: f('persuade', 10),
    mpRegen: f('mp_regen', 0),
  };
}

function pickIntent(e: Enemy, b: BattleState, rand: Rand): Intent {
  if (b.charged) return '강타';
  const pat = b.enraged && e.enrage ? e.enrage.pattern : e.pattern;
  const opts = pat[b.step % pat.length];
  b.step++;
  return opts[Math.floor(rand() * opts.length)];
}

export function startBattle(
  c: Content,
  w: World,
  enemyId: string,
  ally: string | undefined,
  ctx: Pick<BattleState, 'path' | 'next' | 'then' | 'eventId' | 'title'>,
  rand: Rand,
): BattleState {
  const e = c.enemies.get(enemyId);
  if (!e) throw new Error(`없는 적: ${enemyId}`);
  const s = battleStats(c, w);
  const allyOk = ally && c.characters.get(ally)?.assist ? ally : undefined;
  const b: BattleState = {
    enemy: e.id,
    ally: allyOk,
    hp: s.hp,
    maxHp: s.hp,
    sp: s.sp,
    maxSp: s.sp,
    mp: s.mp,
    maxMp: s.mp,
    ehp: e.hp,
    emaxHp: e.hp,
    step: 0,
    intent: '공격',
    charged: false,
    broken: 0,
    blind: 0,
    counter: 0,
    revealed: 0,
    enraged: false,
    turn: 0,
    turns: e.turns,
    log: [],
    ...ctx,
  };
  b.intent = pickIntent(e, b, rand);
  if (allyOk) b.log.push({ who: 'ally', text: `${ig(c.characters.get(allyOk)!.name)} 옆에 선다.` });
  return b;
}

export function clarity(c: Content, w: World, b: BattleState): Clarity {
  const e = c.enemies.get(b.enemy)!;
  if (b.revealed > 0) return 'exact';
  if (e.reveal && test(e.reveal, w)) return 'exact';
  const read = battleStats(c, w).read;
  if (read >= e.tell) return 'exact';
  if (read >= e.tell - 15) return 'vague';
  return 'hidden';
}

export function intentInfo(c: Content, w: World, b: BattleState): BattleView['intent'] {
  const e = c.enemies.get(b.enemy)!;
  const cl = clarity(c, w, b);
  const aggressive = b.intent === '공격' || b.intent === '강타' || b.intent === '마법';
  if (cl === 'exact') {
    return { clarity: cl, label: b.intent, text: e.tells[b.intent] ?? DEFAULT_TELLS[b.intent], charged: b.charged };
  }
  if (cl === 'vague') {
    return { clarity: cl, label: aggressive ? '공격 기세' : '물러서는 기색', text: aggressive ? '무언가 공격해 올 것 같다' : '한발 물러서서 무언가 노린다', charged: false };
  }
  return { clarity: cl, label: '???', text: '속을 알 수 없다', charged: false };
}

export function skillState(c: Content, w: World, b: BattleState) {
  const out: BattleView['skills'] = [];
  for (const k of c.skills.values()) {
    if (k.when && !test(k.when, w)) continue;
    let reason: string | undefined;
    if (k.sp > b.sp) reason = `기력 ${k.sp} 필요`;
    else if (k.mp > b.mp) reason = `마나 ${k.mp} 필요`;
    else if (k.kind === 'item' && k.item && toNum(w.get(`item.${k.item}`)) < 1) reason = '없음';
    const cost = [k.sp ? `기력 ${k.sp}` : '', k.mp ? `마나 ${k.mp}` : '', k.kind === 'item' && k.item ? `보유 ${toNum(w.get(`item.${k.item}`))}` : '']
      .filter(Boolean)
      .join(' · ');
    out.push({ id: k.id, name: k.name, desc: k.desc, cost, enabled: !reason, reason });
  }
  return out;
}

export function battleView(c: Content, w: World, b: BattleState): BattleView {
  const e = c.enemies.get(b.enemy)!;
  const status: string[] = [];
  if (b.broken > 0) status.push('적 무방비');
  if (b.blind > 0) status.push('적 시야 방해');
  if (b.counter > 0) status.push('반격 준비');
  if (b.revealed > 0) status.push('패턴 간파');
  return {
    enemy: { name: e.name, hp: Math.max(0, b.ehp), maxHp: b.emaxHp, enraged: b.enraged },
    me: { hp: Math.max(0, b.hp), maxHp: b.maxHp, sp: b.sp, maxSp: b.maxSp, mp: b.mp, maxMp: b.maxMp },
    ally: b.ally ? c.characters.get(b.ally)?.name : undefined,
    intent: intentInfo(c, w, b),
    status,
    turn: b.turn,
    turns: b.turns,
    log: b.log,
    skills: skillState(c, w, b),
  };
}

const variance = (rand: Rand) => 0.85 + rand() * 0.3;
const d20 = (rand: Rand) => 1 + Math.floor(rand() * 20);
const fill = (t: string, e: Enemy) => t.replaceAll('{e:ig}', ig(e.name)).replaceAll('{e}', e.name);

/** 한 턴 진행. b를 직접 바꾼다. 끝나면 b.result가 정해진다. */
export function takeTurn(c: Content, w: World, b: BattleState, skillId: string, rand: Rand) {
  const e = c.enemies.get(b.enemy)!;
  const k: Skill | undefined = c.skills.get(skillId);
  if (!k) throw new Error(`없는 기술: ${skillId}`);
  const st = battleStats(c, w);
  const L: BattleLine[] = [];
  const I = b.intent;
  b.turn++;
  b.sp -= k.sp;
  b.mp -= k.mp;
  let incoming = 1;
  let interrupted = false;

  // ---------------- 내 행동
  switch (k.kind) {
    case 'attack':
    case 'heavy':
    case 'magic': {
      const magic = k.kind === 'magic';
      const raw = (magic ? st.matk : st.atk) * k.mult;
      let def = magic ? e.def * 0.5 : e.def;
      let mult = magic ? e.weak.magic : e.weak.physical;
      let crit = false;
      let blocked = false;
      if (I === '방어') {
        if (magic) mult *= 0.8;
        else if (!k.pierce) {
          mult *= k.kind === 'heavy' ? 0.35 : 0.5;
          blocked = true;
        }
      }
      if (I === '차지') mult *= 1.4;
      if (b.broken > 0) {
        def = 0;
        mult *= 1.3;
        crit = true;
      }
      if (b.counter > 0) {
        mult *= b.counter;
        b.counter = 0;
        crit = true;
      }
      const dmg = Math.max(1, Math.round(Math.max(1, raw - def) * mult * variance(rand)));
      b.ehp -= dmg;
      const verb = magic ? `${k.name}!` : k.kind === 'heavy' ? `${k.name}!` : '공격!';
      L.push({ who: 'me', text: blocked ? `${verb} 하지만 단단히 막혔다.` : crit ? `${verb} 빈틈을 정확히 꿰뚫었다!` : verb, dmg, to: 'enemy', crit });
      if (I === '차지' && k.kind === 'heavy') {
        interrupted = true;
        b.broken = 2;
        L.push({ who: 'sys', text: `${ig(e.name)} 모으던 힘이 흩어졌다! 빈틈이 생겼다.` });
      }
      break;
    }
    case 'guard':
      b.sp = Math.min(b.maxSp, b.sp + 2);
      L.push({ who: 'me', text: `${k.name} 자세를 잡았다.` });
      break;
    case 'dodge':
      L.push({ who: 'me', text: '몸을 낮추고 상대의 움직임을 본다.' });
      break;
    case 'read': {
      const ok = st.read + k.bonus + d20(rand) >= e.tell + 12;
      if (ok) {
        b.broken = 2;
        b.revealed = 3;
        L.push({ who: 'me', text: `${k.name} — 다음 수가 보인다. 자세의 빈틈까지.` });
      } else L.push({ who: 'me', text: `${k.name} — 읽히지 않는다.` });
      break;
    }
    case 'heal': {
      const h = Math.round(b.maxHp * k.heal);
      b.hp = Math.min(b.maxHp, b.hp + h);
      L.push({ who: 'me', text: `${k.name}.`, heal: h });
      break;
    }
    case 'intimidate': {
      const ok = st.persuade + k.bonus + d20(rand) >= e.tell + 8;
      if (ok) {
        incoming *= 0.3;
        L.push({ who: 'me', text: `${k.name} — ${ig(e.name)} 움찔한다.` });
      } else L.push({ who: 'me', text: `${k.name} — 통하지 않는다.` });
      break;
    }
    case 'blind':
      b.blind = 3;
      L.push({ who: 'me', text: `${k.name} — ${e.name}의 시야를 흐렸다.` });
      break;
    case 'focus':
      b.mp = Math.min(b.maxMp, b.mp + 4);
      b.sp = Math.min(b.maxSp, b.sp + 2);
      L.push({ who: 'me', text: `${k.name} — 숨을 고르며 마나와 기력을 끌어올렸다.` });
      break;
    case 'item': {
      if (k.item) w.add(`item.${k.item}`, -1);
      const h = Math.round(b.maxHp * k.heal);
      b.hp = Math.min(b.maxHp, b.hp + h);
      b.sp = Math.min(b.maxSp, b.sp + 3);
      L.push({ who: 'me', text: `${k.name} 사용 — 상처가 아문다.`, heal: h });
      break;
    }
    case 'surrender':
      b.result = 'lose';
      L.push({ who: 'me', text: '무기를 내려놓았다.' });
      b.log = L;
      return;
  }

  // ---------------- 동료
  if (b.ally && b.ehp > 0) {
    const a = c.characters.get(b.ally)!;
    const dmg = Math.max(1, Math.round(Math.max(1, a.assist!.dmg - e.def * 0.5) * (I === '방어' ? 0.5 : 1) * variance(rand)));
    b.ehp -= dmg;
    L.push({ who: 'ally', text: a.assist!.text || `${a.name}의 지원!`, dmg, to: 'enemy' });
  }

  if (b.ehp <= 0) {
    b.result = 'win';
    L.push({ who: 'sys', text: `${ig(e.name)} 쓰러졌다.` });
    b.log = L;
    return;
  }

  // ---------------- 적 행동
  const wasCharged = b.charged;
  if (I === '차지') {
    if (!interrupted) {
      b.charged = true;
      L.push({ who: 'enemy', text: fill(e.acts.차지 ?? DEFAULT_ACTS.차지, e) });
    }
  } else if (I === '방어') {
    L.push({ who: 'enemy', text: fill(e.acts.방어 ?? DEFAULT_ACTS.방어, e) });
  } else {
    let raw = I === '마법' ? e.matk * 1.5 : e.atk * (I === '강타' ? 2 : 1);
    if (I === '강타' && wasCharged) {
      raw *= 1.5;
      b.charged = false;
    }
    if (b.enraged && e.enrage) raw *= e.enrage.atk;
    let mult = incoming;
    if (b.blind > 0) mult *= 0.5;
    let dodged = false;
    if (k.kind === 'guard') {
      mult *= I === '마법' ? k.ward : 0.25;
      if (I === '강타') {
        b.broken = 2;
        L.push({ who: 'sys', text: '정면으로 받아 튕겨냈다! 상대 자세가 무너졌다.' });
      }
    }
    if (k.kind === 'dodge') {
      const dc = e.acc + (I === '마법' ? 8 : 0) - (I === '강타' ? 4 : 0);
      if (st.dodge + k.bonus + d20(rand) >= dc) {
        dodged = true;
        b.counter = k.counter;
        L.push({ who: 'sys', text: `피했다! 반격 기회 (다음 공격 ×${k.counter}).` });
      } else L.push({ who: 'sys', text: '피하지 못했다.' });
    }
    if (!dodged) {
      const dmg = Math.max(1, Math.round(Math.max(1, raw - st.def) * mult * variance(rand)));
      b.hp -= dmg;
      L.push({ who: 'enemy', text: fill(e.acts[I] ?? DEFAULT_ACTS[I], e), dmg, to: 'me', crit: I === '강타' });
    }
  }

  // ---------------- 턴 정리
  b.broken = Math.max(0, b.broken - 1);
  b.blind = Math.max(0, b.blind - 1);
  b.revealed = Math.max(0, b.revealed - 1);
  b.sp = Math.min(b.maxSp, b.sp + 1);
  b.mp = Math.min(b.maxMp, b.mp + st.mpRegen);
  if (!b.enraged && e.enrage && b.ehp <= b.emaxHp * e.enrage.below) {
    b.enraged = true;
    b.step = 0;
    b.charged = false;
    L.push({ who: 'sys', text: e.enrage.line });
  }
  if (b.hp <= 0) {
    b.result = 'lose';
    L.push({ who: 'sys', text: '눈앞이 캄캄해졌다.' });
  } else if (b.turn >= b.turns) {
    const mine = b.hp / b.maxHp;
    const theirs = b.ehp / b.emaxHp;
    b.result = mine >= theirs ? 'win' : 'lose';
    L.push({ who: 'sys', text: `시간 종료 — ${b.result === 'win' ? '판정승' : '판정패'} (남은 체력 ${Math.round(mine * 100)}% 대 ${Math.round(theirs * 100)}%)` });
  } else {
    b.intent = pickIntent(e, b, rand);
  }
  b.log = L;
}

/** 간단한 전투 인공지능 (시뮬레이터와 테스트용). 보이는 의도에 정석으로 대응한다. */
export function suggestSkill(c: Content, w: World, b: BattleState): string {
  const v = battleView(c, w, b);
  const can = (id: string) => v.skills.some((s) => s.id === id && s.enabled);
  const first = (...ids: string[]) => ids.find(can);
  if (b.hp < b.maxHp * 0.3) {
    const heal = v.skills.find((s) => s.enabled && ['heal', 'item'].includes(c.skills.get(s.id)!.kind));
    if (heal) return heal.id;
  }
  const label = v.intent.clarity === 'exact' ? b.intent : undefined;
  const st = battleStats(c, w);
  const magicStrong = st.matk > st.atk;
  let pick: string | undefined;
  if (label === '강타') pick = first('guard');
  else if (label === '차지') pick = first('heavy');
  else if (label === '방어') pick = magicStrong ? first('magic', 'read') : first('read', 'magic');
  else if (v.intent.clarity === 'hidden' && truthy(b.turn === 0)) pick = first('read');
  if (!pick) pick = magicStrong ? first('magic', 'focus', 'attack') : first('attack');
  return pick ?? v.skills.find((s) => s.enabled)!.id;
}
