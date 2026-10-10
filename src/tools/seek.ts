// npm run seek -- "fate.edric == 'saved'" [--origin ... --perks ... --talents ...] [--beam 24]
import { loadContent } from '../engine/load';
import { seek } from '../analysis/seek';
import { num, parseArgs } from './args';
import { buildFromArgs, describeBuild } from './buildarg';

const args = parseArgs();
const goal = args._[0];
if (!goal) {
  console.log('사용법: npm run seek -- "<목표 조건>" [--origin 출신 --perks a,b --talents x,y:옵션] [--beam 24]');
  process.exit(2);
}
const content = loadContent((args.content as string) ?? 'content');
const build = buildFromArgs(content, args);
console.log(`목표: ${goal}\n빌드: ${describeBuild(content, build)}\n`);
const t0 = Date.now();
const r = seek(content, build, goal, { beam: num(args.beam, 24), seed: num(args.seed, 7) });
console.log(`탐색한 상태 ${r.explored}개, 가지치기 ${r.pruned}개 (${((Date.now() - t0) / 1000).toFixed(1)}초)\n`);
if (r.found) {
  console.log(`✅ 도달 가능 — ${r.game.state.trace.length}단계\n`);
  for (const t of r.game.state.trace) console.log(`  ${t.time.padEnd(22)} ${t.kind}: ${t.text}`);
  console.log(`\n도달 시점: ${r.game.view().time} / 원작 붕괴도 ${r.game.world.collapse()}%`);
} else {
  console.log('❌ 이 빌드로는 도달하지 못함. 막고 있는 것:\n');
  for (const b of r.blockers) {
    console.log(`  • ${b.atom}  (현재 ${b.current})`);
    if (!b.writers.length) console.log('      바꿀 수 있는 이벤트가 없음');
    for (const w of b.writers) console.log(`      - ${w.source}: ${w.status}`);
  }
  process.exit(1);
}
