// 캐릭터 생성: 출신 + 재능 포인트 + 능력치 분배.
// 빙의자 기본기(원작 지식)는 고르는 게 아니라 rules.yaml의 initial에 들어 있다.

import type { Content } from './content';
import { test } from './expr';
import type { World } from './world';

export interface Build {
  name: string;
  origin: string;
  talents: { id: string; option?: string }[];
  /** 남은 포인트를 능력치에 분배 (포인트 단위) */
  alloc?: Record<string, number>;
  /** 초상화 외형 (화면 전용, 게임 규칙과 무관) */
  look?: { hair: string; hairColor: string; eyes: string; skin: string };
}

export interface BuildCheck {
  ok: boolean;
  errors: string[];
  total: number;
  spent: number;
  gained: number;
  remaining: number;
}

export function checkBuild(c: Content, b: Build, meta?: { get(n: string): unknown }): BuildCheck {
  const errors: string[] = [];
  const origin = c.origins.get(b.origin);
  if (!origin) errors.push(`없는 출신: ${b.origin}`);
  const total = origin?.points ?? 0;

  const chosen = b.talents.map((t) => t.id);
  const all = [...(origin?.talents ?? []), ...chosen];
  if (new Set(all).size !== all.length) errors.push('같은 재능이 중복됨 (출신 기본 재능 포함)');
  if (all.length > c.rules.creation.maxTalents) errors.push(`재능은 최대 ${c.rules.creation.maxTalents}개`);

  let spent = 0;
  let gained = 0;
  for (const t of b.talents) {
    const def = c.talents.get(t.id);
    if (!def) {
      errors.push(`없는 재능: ${t.id}`);
      continue;
    }
    if (def.locked && test(def.locked, (meta ?? { get: () => undefined }) as never)) {
      errors.push(`아직 해금되지 않은 재능: ${def.name}`);
    }
    if (def.options && (!t.option || !def.options.includes(t.option))) {
      errors.push(`${def.name}: 선택지 중 하나를 골라야 함 (${def.options.join('/')})`);
    }
    if (def.cost >= 0) spent += def.cost;
    else gained += -def.cost;
  }
  for (const id of all) {
    const def = c.talents.get(id);
    for (const x of def?.excludes ?? []) {
      if (all.includes(x)) errors.push(`같이 고를 수 없음: ${def!.name} ↔ ${c.talents.get(x)?.name ?? x}`);
    }
  }
  if (gained > c.rules.creation.negativeCap) {
    errors.push(`음수 재능으로 얻는 포인트는 최대 ${c.rules.creation.negativeCap}점 (현재 ${gained}점)`);
  }
  const allocated = Object.values(b.alloc ?? {}).reduce((a, x) => a + x, 0);
  for (const k of Object.keys(b.alloc ?? {})) if (!c.rules.stats.includes(k)) errors.push(`없는 능력치: ${k}`);
  const remaining = total + gained - spent - allocated;
  if (remaining < 0) errors.push(`포인트 부족 (${-remaining}점 초과)`);
  // 상호 배제는 양쪽에서 두 번 잡히므로 중복 제거
  return { ok: errors.length === 0, errors: [...new Set(errors)], total, spent, gained, remaining };
}

export function applyBuild(w: World, b: Build) {
  const c = w.content;
  const origin = c.origins.get(b.origin)!;
  const opt = { noGrowth: true };
  for (const [k, v] of Object.entries(c.rules.baseStats)) w.set(`stat.${k}`, v);
  w.set('player.name', b.name);
  w.set('origin', b.origin);
  w.applyAll(c.rules.initial, opt);
  w.applyAll(origin.effects, opt);
  for (const id of origin.talents) {
    w.set(`talent.${id}`, 1);
    w.applyAll(c.talents.get(id)?.effects ?? [], opt);
  }
  for (const t of b.talents) {
    w.set(`talent.${t.id}`, 1);
    if (t.option) w.set(`talent.${t.id}.${t.option}`, 1);
    w.applyAll(c.talents.get(t.id)!.effects, opt);
  }
  for (const [k, v] of Object.entries(b.alloc ?? {})) {
    w.add(`stat.${k}`, v * c.rules.creation.statPerPoint);
  }
}

/** 시뮬레이션용: 규칙에 맞는 무작위 빌드 */
export function randomBuild(c: Content, rand: () => number, name = '나'): Build {
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  for (let attempt = 0; attempt < 500; attempt++) {
    const origin = pick([...c.origins.values()]);
    const pool = [...c.talents.values()].filter((t) => !t.locked && !origin.talents.includes(t.id));
    const talents: Build['talents'] = [];
    const n = 2 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const t = pick(pool);
      if (talents.some((x) => x.id === t.id)) continue;
      talents.push({ id: t.id, option: t.options ? pick(t.options) : undefined });
    }
    const b: Build = { name, origin: origin.id, talents };
    const chk = checkBuild(c, b);
    if (!chk.ok) continue;
    const alloc: Record<string, number> = {};
    for (let i = 0; i < chk.remaining; i++) {
      const s = pick(c.rules.stats);
      alloc[s] = (alloc[s] ?? 0) + 1;
    }
    return { ...b, alloc };
  }
  throw new Error('무작위 빌드를 만들지 못함 (재능/출신 데이터를 확인하세요)');
}
