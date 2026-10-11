// npm run balance -- --runs 40 — 컨셉 빌드별 판정 확률 리포트 (reports/balance.md)
import { mkdirSync, writeFileSync } from 'node:fs';
import { balance, formatBalance } from '../analysis/balance';
import { loadContent } from '../engine/load';
import { num, parseArgs } from './args';

const args = parseArgs();
const content = loadContent((args.content as string) ?? 'content');
const t0 = Date.now();
const rep = balance(content, num(args.runs, 40), num(args.seed, 7));
const md = formatBalance(content, rep);
mkdirSync('reports', { recursive: true });
const out = (args.out as string) ?? 'reports/balance.md';
writeFileSync(out, md);
const lines = md.split('\n');
const start = lines.findIndex((l) => l.startsWith('## 판정 종류별'));
console.log(lines.slice(start, start + rep.archetypes.length + 4).join('\n'));
for (const l of lines.filter((x) => x.startsWith('## 모든') || x.startsWith('## 빌드 차이'))) console.log(l);
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}초) 자세한 리포트: ${out}`);
