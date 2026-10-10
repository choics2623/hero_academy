// npm run lint:story — 콘텐츠 정적 검사
import { loadContent } from '../engine/load';
import { lint } from '../analysis/lint';
import { parseArgs } from './args';

const args = parseArgs();
const content = loadContent((args.content as string) ?? 'content');
const findings = lint(content);
const icon = { error: '❌', warn: '⚠️ ', info: 'ℹ️ ' } as const;
const shown = args.all ? findings : findings.filter((f) => f.level !== 'info');
for (const f of shown) console.log(`${icon[f.level]} [${f.code}] ${f.where}: ${f.msg}`);
const count = (l: string) => findings.filter((f) => f.level === l).length;
console.log(
  `\n이벤트 ${content.events.size}개, 갈림길 ${content.crossroads.size}개, 복선 ${content.foreshadows.size}개 검사 — ` +
    `오류 ${count('error')} / 경고 ${count('warn')} / 정보 ${count('info')}` +
    (args.all ? '' : ' (정보까지 보려면 --all)'),
);
process.exit(count('error') ? 1 : 0);
