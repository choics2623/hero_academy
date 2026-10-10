// 대사 렌더링.
// 1) 변형 대사: 조건이 맞는 변형 중 "가장 구체적인 것"이 이긴다.
//    작가는 기본 대사를 먼저 쓰고, 특정 상황용 대사를 나중에 "덧붙이기만" 하면 된다.
// 2) 인라인 템플릿: {{식}}, {{if 조건}}...{{elif 조건}}...{{else}}...{{/if}}

import type { Line } from './content';
import { compile, evaluate, test, toNum, truthy, type Env } from './expr';

export interface RenderedLine {
  speaker?: string;
  mood?: string;
  text: string;
}

export function pickVariant<T extends { when?: { spec: number } }>(
  variants: T[],
  passes: (v: T) => boolean,
): T | undefined {
  let best: T | undefined;
  let bestSpec = -1;
  for (const v of variants) {
    if (!passes(v)) continue;
    const s = v.when ? v.when.spec : 0;
    if (s > bestSpec) {
      best = v;
      bestSpec = s;
    }
  }
  return best;
}

export function renderLines(lines: Line[], env: Env): RenderedLine[] {
  const out: RenderedLine[] = [];
  for (const line of lines) {
    if (!test(line.when, env)) continue;
    const v = pickVariant(line.variants, (x) => test(x.when, env));
    if (!v) continue;
    const text = renderTemplate(v.text, env).trim();
    if (text) out.push(line.mood ? { speaker: line.speaker, mood: line.mood, text } : { speaker: line.speaker, text });
  }
  return out;
}

// ---------------------------------------------------------------- template

type TNode = { k: 'text'; v: string } | { k: 'expr'; src: string } | { k: 'if'; arms: { cond?: string; body: TNode[] }[] };

const TAG_RE = /\{\{\s*(.*?)\s*\}\}/gs;

function parseTemplate(src: string): TNode[] {
  const tokens: ({ k: 'text'; v: string } | { k: 'tag'; v: string })[] = [];
  let last = 0;
  for (const m of src.matchAll(TAG_RE)) {
    if (m.index! > last) tokens.push({ k: 'text', v: src.slice(last, m.index) });
    tokens.push({ k: 'tag', v: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < src.length) tokens.push({ k: 'text', v: src.slice(last) });

  let i = 0;
  const block = (stop: (tag: string) => boolean): TNode[] => {
    const out: TNode[] = [];
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.k === 'text') {
        out.push(t);
        i++;
        continue;
      }
      if (stop(t.v)) return out;
      i++;
      if (t.v.startsWith('if ')) {
        const arms: { cond?: string; body: TNode[] }[] = [];
        let cond: string | undefined = t.v.slice(3);
        for (;;) {
          const body = block((x) => x.startsWith('elif ') || x === 'else' || x === '/if');
          arms.push({ cond, body });
          const end = tokens[i];
          if (!end) throw new Error(`{{/if}}가 없음: ${src}`);
          i++;
          if (end.k === 'tag' && end.v === '/if') break;
          cond = end.k === 'tag' && end.v.startsWith('elif ') ? end.v.slice(5) : undefined;
        }
        out.push({ k: 'if', arms });
      } else {
        out.push({ k: 'expr', src: t.v });
      }
    }
    return out;
  };
  return block(() => false);
}

const templateCache = new Map<string, TNode[]>();

export function templateParts(src: string): TNode[] {
  let t = templateCache.get(src);
  if (!t) {
    t = parseTemplate(src);
    templateCache.set(src, t);
  }
  return t;
}

export function renderTemplate(src: string, env: Env): string {
  if (!src.includes('{{')) return src;
  const run = (nodes: TNode[]): string =>
    nodes
      .map((n) => {
        if (n.k === 'text') return n.v;
        if (n.k === 'expr') {
          const v = evaluate(compile(n.src).ast, env);
          return typeof v === 'number' ? String(Math.floor(toNum(v))) : String(v ?? '');
        }
        const arm = n.arms.find((a) => a.cond === undefined || truthy(evaluate(compile(a.cond).ast, env)));
        return arm ? run(arm.body) : '';
      })
      .join('');
  return run(templateParts(src));
}

/** 템플릿 안의 모든 식 (린트용) */
export function templateExprs(src: string): string[] {
  const out: string[] = [];
  const walk = (nodes: TNode[]) => {
    for (const n of nodes) {
      if (n.k === 'expr') out.push(n.src);
      if (n.k === 'if')
        for (const a of n.arms) {
          if (a.cond) out.push(a.cond);
          walk(a.body);
        }
    }
  };
  walk(templateParts(src));
  return out;
}
