// 빌드 밸런스: 컨셉(시너지)마다 그 컨셉을 노린 캐릭터를 만들어 여러 번 플레이하고,
// 판정 종류별로 "고르기 전에 본 성공 확률"을 모은다.
//   - 컨셉마다 자기 분야 판정에서 확실히 유리한가 (빌드가 먹히는가)
//   - 모든 컨셉에게 너무 어렵거나(15% 미만) 너무 쉬운(95% 이상) 판정은 어디인가

import { checkBuild, type Build } from '../engine/creation';
import type { Content } from '../engine/content';
import { Game } from '../engine/game';
import { nextRandom } from '../engine/rng';

export interface Archetype {
  id: string;
  name: string;
  build: Build;
  /** 활동을 고를 때 키우려는 능력치 */
  focus: string[];
}

/** 시너지마다: 그 태그의 재능을 싼 것부터 3개 + 그 컨셉의 판정에 쓰이는 능력치에 분배 */
export function archetypes(c: Content): Archetype[] {
  const out: Archetype[] = [];
  const origin = [...c.origins.values()].find((o) => o.id === '평민장학생') ?? [...c.origins.values()][0];
  for (const sy of c.synergies.values()) {
    const want = sy.tiers[sy.tiers.length - 1].need;
    const pool = [...c.talents.values()]
      .filter((t) => t.tags.includes(sy.tag) && !t.locked && !t.evolved && t.cost >= 0 && !origin.talents.includes(t.id))
      .sort((a, b) => a.cost - b.cost);
    const talents: Build['talents'] = [];
    for (const t of pool) {
      if (talents.length >= want) break;
      if (talents.some((x) => c.talents.get(x.id)?.excludes.includes(t.id) || t.excludes.includes(x.id))) continue;
      const trial: Build = { name: sy.name, origin: origin.id, talents: [...talents, { id: t.id, option: t.options?.[0] }] };
      if (checkBuild(c, trial).ok) talents.push({ id: t.id, option: t.options?.[0] });
    }
    // 컨셉 판정에 쓰이는 능력치
    const types = Object.keys(sy.tiers[sy.tiers.length - 1].checks);
    const focus = [...new Set(types.flatMap((t) => (c.checks.types.get(t)?.value.refs ?? []).filter((r) => r.startsWith('stat.')).map((r) => r.slice(5))))];
    const b: Build = { name: sy.name, origin: origin.id, talents };
    const chk = checkBuild(c, b);
    const alloc: Record<string, number> = {};
    for (let i = 0; i < Math.max(0, chk.remaining); i++) alloc[focus[i % Math.max(1, focus.length)] ?? c.rules.stats[0]] = (alloc[focus[i % Math.max(1, focus.length)] ?? c.rules.stats[0]] ?? 0) + 1;
    out.push({ id: sy.id, name: sy.name, build: { ...b, alloc }, focus });
  }
  // 아무 컨셉도 노리지 않은 평범한 캐릭터
  out.push({ id: '평범', name: '평범', build: { name: '평범', origin: origin.id, talents: [] }, focus: c.rules.stats });
  return out;
}

export interface BalanceReport {
  archetypes: Archetype[];
  /** [컨셉][판정 종류] → 본 확률들 */
  seen: Map<string, Map<string, number[]>>;
  /** 선택지 경로 → 컨셉별 평균 확률 */
  perChoice: Map<string, { label: string; text: string; by: Map<string, number[]> }>;
  deaths: Map<string, number>;
  runs: number;
}

export function balance(c: Content, runs = 40, seed = 7): BalanceReport {
  const arch = archetypes(c);
  const seen = new Map<string, Map<string, number[]>>();
  const perChoice: BalanceReport['perChoice'] = new Map();
  const deaths = new Map<string, number>();
  let r = seed >>> 0;
  const rand = () => {
    const [v, n] = nextRandom(r);
    r = n;
    return v;
  };
  for (const a of arch) {
    const m = new Map<string, number[]>();
    seen.set(a.id, m);
    for (let run = 0; run < runs; run++) {
      const g = Game.create(c, a.build, Math.floor(rand() * 2 ** 31));
      for (let step = 0; step < 6000 && !g.ended; step++) {
        const v = g.view();
        if (v.phase === 'scene' && v.choices.length) {
          const owner = g.state.scene!.owner!;
          for (const ch of v.choices) {
            if (!ch.check?.type || !ch.enabled) continue;
            if (!m.has(ch.check.type)) m.set(ch.check.type, []);
            m.get(ch.check.type)!.push(ch.check.chance);
            const key = `${owner}#${ch.index}`;
            if (!perChoice.has(key)) perChoice.set(key, { label: ch.check.type, text: ch.text, by: new Map() });
            const pc = perChoice.get(key)!;
            if (!pc.by.has(a.id)) pc.by.set(a.id, []);
            pc.by.get(a.id)!.push(ch.check.chance);
          }
        }
        if (v.phase === 'dead') deaths.set(a.id, (deaths.get(a.id) ?? 0) + 1);
        const opts = g.options();
        if (!opts.length) break;
        let pick = opts[Math.floor(rand() * opts.length)];
        if (v.phase === 'activity' && rand() < 0.6) {
          // 열에 여섯은 컨셉 능력치를 키우는 활동 쪽으로 (피로가 높으면 쉰다), 나머지는 아무거나
          const tired = Number(g.get('fatigue') ?? 0) >= 70;
          let best = -Infinity;
          for (const o of opts) {
            if (o.type !== 'activity') continue;
            const pv = g.preview(o.id);
            const gain = pv.filter((x) => a.focus.some((s) => x.key === `stat.${s}`)).reduce((s, x) => s + x.delta, 0);
            const rest = -(pv.find((x) => x.key === 'fatigue')?.delta ?? 0);
            const score = (tired ? rest : gain) + rand() * 0.5;
            if (score > best) {
              best = score;
              pick = o;
            }
          }
        }
        g.act(pick);
        if (g.state.phase === 'activity') g.autoEquip();
      }
    }
  }
  return { archetypes: arch, seen, perChoice, deaths, runs };
}

const pct = (xs: number[]) => (xs.length ? `${Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 100)}%` : '-');
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN);

export function formatBalance(c: Content, rep: BalanceReport): string {
  const types = [...c.checks.types.keys()];
  const out: string[] = [`# 빌드 밸런스 (컨셉마다 ${rep.runs}회)`, ''];
  out.push('## 컨셉 빌드', '');
  for (const a of rep.archetypes) {
    out.push(`- **${a.name}**: ${a.build.talents.map((t) => c.talents.get(t.id)?.name ?? t.id).join(', ') || '(재능 없음)'} · 키우는 능력치 ${a.focus.join('/')}${rep.deaths.get(a.id) ? ` · 죽음 ${rep.deaths.get(a.id)}번` : ''}`);
  }
  out.push('', '## 판정 종류별 평균 성공 확률 (고르기 전에 본 값)', '');
  out.push(`| 컨셉 | ${types.join(' | ')} |`, `|---|${types.map(() => '---').join('|')}|`);
  for (const a of rep.archetypes) {
    const m = rep.seen.get(a.id)!;
    out.push(`| ${a.name} | ${types.map((t) => pct(m.get(t) ?? [])).join(' | ')} |`);
  }
  const hard: string[] = [];
  const easy: string[] = [];
  const flat: string[] = [];
  for (const [key, pc] of rep.perChoice) {
    const means = [...pc.by.values()].map(mean).filter((x) => !Number.isNaN(x));
    if (means.length < 2) continue;
    const hi = Math.max(...means);
    const lo = Math.min(...means);
    const line = `- \`${key}\` ${pc.label} — ${pc.text} (최고 ${Math.round(hi * 100)}%, 최저 ${Math.round(lo * 100)}%)`;
    if (hi < 0.15) hard.push(line);
    else if (lo > 0.95) easy.push(line);
    else if (hi - lo < 0.1) flat.push(line);
  }
  out.push('', `## 모든 컨셉에게 너무 어려운 판정 (15% 미만) — ${hard.length}개`, '', ...hard);
  out.push('', `## 모든 컨셉에게 너무 쉬운 판정 (95% 초과) — ${easy.length}개`, '', ...easy);
  out.push('', `## 빌드 차이가 거의 없는 판정 (컨셉 간 차이 10%p 미만) — ${flat.length}개`, '', ...flat);
  return out.join('\n') + '\n';
}
