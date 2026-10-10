// npm run build:web — 엔진 + 콘텐츠를 HTML 한 장(dist/play.html)으로 묶는다.
import { build } from 'esbuild';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import { loadContent } from '../src/engine/load';

const CONTENT = 'content';
loadContent(CONTENT); // 콘텐츠 오류가 있으면 여기서 멈춘다

const files: Record<string, unknown> = {};
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.yaml')) files[relative(CONTENT, p).split(sep).join('/')] = parse(readFileSync(p, 'utf8'));
  }
};
walk(CONTENT);

const out = await build({
  entryPoints: ['src/web/main.ts'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
  legalComments: 'none',
});

// 인라인 <script> 안에서 HTML 파서가 오해할 수 있는 문자열을 막는다
const safe = (s: string) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const html = readFileSync('src/web/page.html', 'utf8')
  .replace('/*__CONTENT__*/', () => safe(JSON.stringify(files)))
  .replace('/*__BUNDLE__*/', () => safe(out.outputFiles[0].text));

mkdirSync('dist', { recursive: true });
writeFileSync('dist/play.html', html);
console.log(`dist/play.html (${Math.round(html.length / 1024)}KB, 콘텐츠 파일 ${Object.keys(files).length}개)`);
