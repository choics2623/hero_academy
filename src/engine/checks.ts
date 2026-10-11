// 판정 계산: 판정 종류(checks.yaml)의 공식 + 재능·시너지·장비·상황 보정.
// 화면이 "왜 유리한지"를 보여줄 수 있도록 보정 하나하나를 요인(factor)으로 돌려준다.

import type { Check, Content } from './content';
import { evaluate, test, toNum, truthy } from './expr';
import type { World } from './world';

export interface Factor {
  label: string;
  value: number;
  kind: 'talent' | 'synergy' | 'gear' | 'mod' | 'luck';
}

export interface CheckEval {
  /** 판정 이름 (예: "설득") */
  name: string;
  icon: string;
  /** 판정 종류 id (옛 형식이면 없음) */
  type?: string;
  value: number;
  dc: number;
  /** 성공 확률 0~1 */
  chance: number;
  /** 확률을 말로: 확실 유리 반반 불리 무모 */
  odds: string;
  /** 보정 요인 (큰 것부터) */
  factors: Factor[];
  /** 주사위 연출 없이 굴린다 */
  hidden: boolean;
}

function talentLabel(c: Content, key: string): string {
  const [id, opt] = key.split('.');
  const name = c.talents.get(id)?.name.replace(/\(.*\)$/, '') ?? id;
  return opt ? `${name}(${opt})` : name;
}

export function monthOffset(c: Content, w: World): number {
  return c.checks.monthOffset[w.state.time.m] ?? 0;
}

export function oddsWord(c: Content, chance: number): string {
  for (const [min, word] of c.checks.odds) if (chance >= min - 1e-9) return word;
  return c.checks.odds[c.checks.odds.length - 1]?.[1] ?? '';
}

/** 값 + d20 ≥ 난이도의 확률 (주사위 1도 실패가 아니다: 기존 규칙 유지) */
export function chanceOf(value: number, dc: number): number {
  const need = dc - Math.floor(value);
  return Math.max(0, Math.min(20, 21 - Math.max(1, need))) / 20;
}

export function evalCheck(c: Content, w: World, ch: Check): CheckEval {
  const factors: Factor[] = [];
  let base: number;
  let name: string;
  let icon = 'dice';
  let hidden = ch.hidden === true;
  const type = ch.type ? c.checks.types.get(ch.type) : undefined;
  if (type) {
    base = toNum(evaluate(type.value.ast, w));
    name = ch.label ?? type.name;
    icon = type.icon;
    for (const [k, v] of Object.entries(type.plus)) if (truthy(w.get(`talent.${k}`))) factors.push({ label: talentLabel(c, k), value: v, kind: 'talent' });
    for (const [k, v] of Object.entries(type.minus)) if (truthy(w.get(`talent.${k}`))) factors.push({ label: talentLabel(c, k), value: -v, kind: 'talent' });
    for (const sy of c.synergies.values()) {
      const tier = w.synergyTier(sy);
      const v = tier ? sy.tiers[tier - 1].checks[type.id] ?? 0 : 0;
      if (v) factors.push({ label: sy.name, value: v, kind: 'synergy' });
    }
    for (const { item } of w.equipped()) {
      const v = item.checks[type.id] ?? 0;
      if (v) factors.push({ label: item.name, value: v, kind: 'gear' });
    }
    const luck = toNum(w.get('luck'));
    if (luck) factors.push({ label: luck > 0 ? '행운' : '불운', value: luck, kind: 'luck' });
  } else {
    base = toNum(evaluate(ch.value!.ast, w));
    name = ch.label ?? '판정';
    if (!ch.label) hidden = true;
  }
  for (const m of ch.mods) if (test(m.when, w)) factors.push({ label: m.label, value: m.value, kind: 'mod' });
  factors.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const value = base + factors.reduce((a, f) => a + f.value, 0);
  const dc = ch.tier ? ch.dc + monthOffset(c, w) : ch.dc;
  const chance = chanceOf(value, dc);
  return { name, icon, type: type?.id, value, dc, chance, odds: oddsWord(c, chance), factors, hidden };
}

/** 판정 결과 한 줄에 실리는 정보 (화면 연출용) */
export interface CheckResult {
  name: string;
  icon: string;
  d20: number;
  total: number;
  dc: number;
  ok: boolean;
  grade: 'great' | 'ok' | 'fail' | 'fumble';
  odds: string;
  factors: Factor[];
  /** 결과를 가른 요인: 성공이면 가장 큰 플러스, 실패면 가장 큰 마이너스 */
  key?: Factor;
}

export function gradeOf(d20: number, total: number, dc: number): CheckResult['grade'] {
  const ok = total >= dc;
  if (ok) return d20 === 20 || total >= dc + 10 ? 'great' : 'ok';
  return d20 === 1 || total <= dc - 10 ? 'fumble' : 'fail';
}

export const GRADE_WORD: Record<CheckResult['grade'], string> = { great: '대성공', ok: '성공', fail: '실패', fumble: '대실패' };

export function keyFactor(factors: Factor[], ok: boolean): Factor | undefined {
  const xs = factors.filter((f) => (ok ? f.value > 0 : f.value < 0));
  return xs.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
}
