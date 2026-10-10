// npm run sim -- --runs 2000 --policy curious
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadContent } from '../engine/load';
import { formatReport, simulate, type Policy } from '../analysis/simulate';
import { num, parseArgs } from './args';

const args = parseArgs();
const content = loadContent((args.content as string) ?? 'content');
const runs = num(args.runs, 1000);
const t0 = Date.now();
const rep = simulate(content, { runs, seed: num(args.seed, 1), policy: ((args.policy as Policy) ?? 'curious') });
const md = formatReport(content, rep);
mkdirSync('reports', { recursive: true });
const out = (args.out as string) ?? 'reports/sim.md';
writeFileSync(out, md);

const never = [...rep.eventFires].filter(([, n]) => n === 0).map(([id]) => id);
const hidden = [...rep.choices].filter(([, v]) => v.shown === 0).length;
console.log(`${runs}회 플레이 완료 (${((Date.now() - t0) / 1000).toFixed(1)}초) — 오류 ${rep.errors.length}건`);
console.log(`이벤트 커버리지: ${content.events.size - never.length}/${content.events.size}` + (never.length ? `  미발생: ${never.join(', ')}` : ''));
console.log(`한 번도 안 보인 선택지: ${hidden}개`);
for (const [id, m] of rep.crossroads) {
  const cr = content.crossroads.get(id)!;
  const parts = [...m].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}${v === String(cr.canon) ? '(원작)' : ''} ${Math.round((n / runs) * 100)}%`);
  console.log(`갈림길 ${cr.title}: ${parts.join(' / ')}`);
}
for (const [id, b] of rep.battles) {
  if (b.fights) console.log(`전투 ${content.enemies.get(id)!.name}: ${b.fights}회, 승률 ${Math.round((b.wins / b.fights) * 100)}%, 평균 ${(b.turns / b.fights).toFixed(1)}턴`);
}
console.log(`자세한 리포트: ${out}`);
if (rep.errors.length) process.exit(1);
