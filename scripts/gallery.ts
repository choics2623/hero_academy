// npm run gallery — 도트 그림 전체를 dist/gallery.html 한 장에 그린다 (그림 작업용)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';

const artList = parse(readFileSync('content/art.yaml', 'utf8'));

const out = await build({ entryPoints: ['scripts/gallery-entry.ts'], bundle: true, format: 'iife', target: 'es2020', write: false });
const html = `<!doctype html><meta charset="utf-8"><title>도트 갤러리</title>
<style>body{background:#15131f;color:#ccc;font:12px sans-serif;margin:16px}h2{font-size:13px;margin:14px 0 4px;color:#9cf}
.row{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0}canvas{image-rendering:pixelated;display:block;background:#2a2838}figcaption{text-align:center}</style>
<div id="root"></div><script>var __ART__ = ${JSON.stringify(artList)};</script><script>${out.outputFiles[0].text}</script>`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/gallery.html', html);
console.log('dist/gallery.html');
