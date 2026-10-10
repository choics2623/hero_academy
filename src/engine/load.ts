// Node 전용: content/ 폴더의 YAML을 모두 읽어 컴파일한다.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import { buildContent, ContentError, type Content } from './content';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : name.endsWith('.yaml') ? [p] : [];
  });
}

export function loadContent(dir = 'content'): Content {
  const files: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const p of walk(dir)) {
    const key = relative(dir, p).split(sep).join('/');
    try {
      files[key] = parse(readFileSync(p, 'utf8'));
    } catch (e) {
      problems.push(`[${key}] YAML 문법 오류: ${(e as Error).message}`);
    }
  }
  if (problems.length) throw new ContentError(problems);
  return buildContent({ files });
}
