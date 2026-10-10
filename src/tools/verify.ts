// npm run verify — 모든 갈림길의 모든 결과가 "어떤 빌드로든" 도달 가능한지 자동 증명한다.
// 출신마다 무작위 빌드를 하나씩 만들어 목표 탐색기를 돌린다.
import { randomBuild, type Build, type Content } from '../engine';
import { loadContent } from '../engine/load';
import { nextRandom } from '../engine/rng';
import { buildGraph } from '../analysis/graph';
import { seek } from '../analysis/seek';
import { num, parseArgs } from './args';
import { describeBuild } from './buildarg';

const args = parseArgs();
const content = loadContent((args.content as string) ?? 'content');
const graph = buildGraph(content);
const beam = num(args.beam, 16);

function buildsFor(c: Content, seed: number): Build[] {
  let s = seed;
  const rand = () => {
    const [v, n] = nextRandom(s);
    s = n;
    return v;
  };
  return [...c.origins.keys()].map((origin) => {
    for (let i = 0; i < 300; i++) {
      const b = randomBuild(c, rand);
      if (b.origin === origin) return b;
    }
    throw new Error(`${origin} 출신 빌드를 만들지 못함`);
  });
}

const goals: { title: string; goal: string; skip?: string }[] = [];
for (const cr of content.crossroads.values()) {
  const values = new Set<unknown>([cr.canon]);
  for (const w of graph.writers.get(cr.key) ?? []) if (w.literal !== undefined) values.add(w.literal);
  for (const v of values) {
    const lit = typeof v === 'string' ? `'${v}'` : String(v);
    const late = v === cr.canon && cr.deadline > content.calendar.endOrd;
    goals.push({
      title: `${cr.title} → ${String(v)}${v === cr.canon ? ' (원작)' : ''}`,
      goal: `${cr.key} == ${lit}`,
      skip: late ? `마감(${cr.deadlineLabel})이 현재 달력 범위 밖` : undefined,
    });
  }
}
for (const extra of (typeof args.goal === 'string' ? [args.goal] : [])) goals.push({ title: extra, goal: extra });

const builds = buildsFor(content, num(args.seed, 3));
let failed = 0;
const t0 = Date.now();
let skipped = 0;
for (const g of goals) {
  if (g.skip) {
    skipped++;
    console.log(`⏭  ${g.title}  — ${g.skip}`);
    continue;
  }
  let ok = false;
  for (const b of builds) {
    const r = seek(content, b, g.goal, { beam, maxSteps: 300 }, graph);
    if (r.found) {
      console.log(`✅ ${g.title}\n     ${r.game.state.trace.length}단계 · ${describeBuild(content, b)}`);
      ok = true;
      break;
    }
  }
  if (!ok) {
    failed++;
    console.log(`❌ ${g.title}  — 출신 ${builds.length}종 모두 실패`);
  }
}
const checked = goals.length - skipped;
console.log(`\n${checked}개 결과 중 ${checked - failed}개 도달 가능, ${skipped}개 건너뜀 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
process.exit(failed ? 1 : 0);
