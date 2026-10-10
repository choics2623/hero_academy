// 조건식/효과식 언어.
// 작가가 YAML에 쓰는 "affinity.liana >= 20 and not fired.x" 같은 문자열을 파싱하고 평가한다.
// 평가 외에도 세 가지 분석을 제공한다:
//   - refs: 어떤 변수를 읽는가 (린트, 노트 의존성)
//   - specificity: 조건이 얼마나 구체적인가 (가장 구체적인 스토리렛/대사가 이긴다)
//   - distance: 조건이 참이 되기까지 얼마나 멀었는가 (목표 탐색 휴리스틱)

export type Value = number | string | boolean | undefined;

export type CmpOp = '==' | '!=' | '<' | '<=' | '>' | '>=';
export type ArithOp = '+' | '-' | '*' | '/';

export type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'var'; name: string }
  | { k: 'not'; x: Node }
  | { k: 'neg'; x: Node }
  | { k: 'and'; a: Node; b: Node }
  | { k: 'or'; a: Node; b: Node }
  | { k: 'cmp'; op: CmpOp; a: Node; b: Node }
  | { k: 'arith'; op: ArithOp; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };

export interface Env {
  get(name: string): Value;
}

export class ExprError extends Error {}

const FUNCS: Record<string, (...xs: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  floor: Math.floor,
};

// ---------------------------------------------------------------- tokenizer

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string };

const ID_RE = /[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}\p{N}_]+)*/uy;
const NUM_RE = /\d+(?:\.\d+)?/y;
const OPS = ['==', '!=', '<=', '>=', '&&', '||', '<', '>', '+', '-', '*', '/', '(', ')', ',', '!'];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new ExprError(`닫히지 않은 문자열: ${src}`);
      out.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    NUM_RE.lastIndex = i;
    const num = NUM_RE.exec(src);
    if (num) {
      out.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    ID_RE.lastIndex = i;
    const id = ID_RE.exec(src);
    if (id) {
      out.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      out.push({ t: 'op', v: op });
      i += op.length;
      continue;
    }
    throw new ExprError(`알 수 없는 문자 '${c}' (위치 ${i}): ${src}`);
  }
  return out;
}

// ---------------------------------------------------------------- parser

class Parser {
  private i = 0;
  constructor(private toks: Tok[], private src: string) {}

  parse(): Node {
    const n = this.or();
    if (this.i < this.toks.length) this.fail(`해석할 수 없는 부분이 남음`);
    return n;
  }

  private fail(msg: string): never {
    throw new ExprError(`${msg}: ${this.src}`);
  }
  private peek(): Tok | undefined {
    return this.toks[this.i];
  }
  private isOp(...vs: string[]): boolean {
    const t = this.peek();
    return !!t && t.t === 'op' && vs.includes(t.v);
  }
  private isWord(...vs: string[]): boolean {
    const t = this.peek();
    return !!t && t.t === 'id' && vs.includes(t.v);
  }

  private or(): Node {
    let a = this.and();
    while (this.isWord('or') || this.isOp('||')) {
      this.i++;
      a = { k: 'or', a, b: this.and() };
    }
    return a;
  }
  private and(): Node {
    let a = this.not();
    while (this.isWord('and') || this.isOp('&&')) {
      this.i++;
      a = { k: 'and', a, b: this.not() };
    }
    return a;
  }
  private not(): Node {
    if (this.isWord('not') || this.isOp('!')) {
      this.i++;
      return { k: 'not', x: this.not() };
    }
    return this.cmp();
  }
  private cmp(): Node {
    const a = this.sum();
    if (this.isOp('==', '!=', '<', '<=', '>', '>=')) {
      const op = (this.toks[this.i++] as { v: string }).v as CmpOp;
      return { k: 'cmp', op, a, b: this.sum() };
    }
    return a;
  }
  private sum(): Node {
    let a = this.term();
    while (this.isOp('+', '-')) {
      const op = (this.toks[this.i++] as { v: string }).v as ArithOp;
      a = { k: 'arith', op, a, b: this.term() };
    }
    return a;
  }
  private term(): Node {
    let a = this.unary();
    while (this.isOp('*', '/')) {
      const op = (this.toks[this.i++] as { v: string }).v as ArithOp;
      a = { k: 'arith', op, a, b: this.unary() };
    }
    return a;
  }
  private unary(): Node {
    if (this.isOp('-')) {
      this.i++;
      return { k: 'neg', x: this.unary() };
    }
    return this.primary();
  }
  private primary(): Node {
    const t = this.toks[this.i++];
    if (!t) this.fail('식이 갑자기 끝남');
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'op' && t.v === '(') {
      const n = this.or();
      if (!this.isOp(')')) this.fail(`')'가 필요함`);
      this.i++;
      return n;
    }
    if (t.t === 'id') {
      if (t.v === 'true' || t.v === 'false') return { k: 'bool', v: t.v === 'true' };
      if (['and', 'or', 'not'].includes(t.v)) this.fail(`'${t.v}' 위치가 이상함`);
      if (this.isOp('(')) {
        if (!(t.v in FUNCS)) this.fail(`알 수 없는 함수 ${t.v}`);
        this.i++;
        const args: Node[] = [];
        if (!this.isOp(')')) {
          args.push(this.or());
          while (this.isOp(',')) {
            this.i++;
            args.push(this.or());
          }
        }
        if (!this.isOp(')')) this.fail(`')'가 필요함`);
        this.i++;
        return { k: 'call', fn: t.v, args };
      }
      return { k: 'var', name: t.v };
    }
    this.fail(`예상치 못한 '${t.v}'`);
  }
}

// ---------------------------------------------------------------- evaluation

export function toNum(v: Value): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function truthy(v: Value): boolean {
  return v !== undefined && v !== false && v !== 0 && v !== '';
}

function eq(a: Value, b: Value): boolean {
  if (typeof a === 'string' || typeof b === 'string') {
    if (a === undefined || b === undefined) return false;
    return String(a) === String(b);
  }
  return toNum(a) === toNum(b);
}

export function evaluate(n: Node, env: Env): Value {
  switch (n.k) {
    case 'num':
    case 'str':
    case 'bool':
      return n.v;
    case 'var':
      return env.get(n.name);
    case 'not':
      return !truthy(evaluate(n.x, env));
    case 'neg':
      return -toNum(evaluate(n.x, env));
    case 'and':
      return truthy(evaluate(n.a, env)) && truthy(evaluate(n.b, env));
    case 'or':
      return truthy(evaluate(n.a, env)) || truthy(evaluate(n.b, env));
    case 'cmp': {
      const a = evaluate(n.a, env);
      const b = evaluate(n.b, env);
      switch (n.op) {
        case '==':
          return eq(a, b);
        case '!=':
          return !eq(a, b);
        case '<':
          return toNum(a) < toNum(b);
        case '<=':
          return toNum(a) <= toNum(b);
        case '>':
          return toNum(a) > toNum(b);
        case '>=':
          return toNum(a) >= toNum(b);
      }
      break;
    }
    case 'arith': {
      const a = toNum(evaluate(n.a, env));
      const b = toNum(evaluate(n.b, env));
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return b === 0 ? 0 : a / b;
      }
      break;
    }
    case 'call':
      return FUNCS[n.fn](...n.args.map((x) => toNum(evaluate(x, env))));
  }
  return undefined;
}

// ---------------------------------------------------------------- analysis

export function collectRefs(n: Node, out = new Set<string>()): Set<string> {
  switch (n.k) {
    case 'var':
      out.add(n.name);
      break;
    case 'not':
    case 'neg':
      collectRefs(n.x, out);
      break;
    case 'and':
    case 'or':
    case 'cmp':
    case 'arith':
      collectRefs(n.a, out);
      collectRefs(n.b, out);
      break;
    case 'call':
      n.args.forEach((x) => collectRefs(x, out));
      break;
  }
  return out;
}

/** 조건의 구체성: and로 묶인 조건 개수. or는 더 느슨한 쪽을 따른다. */
export function specificity(n: Node): number {
  switch (n.k) {
    case 'and':
      return specificity(n.a) + specificity(n.b);
    case 'or':
      return Math.min(specificity(n.a), specificity(n.b));
    case 'not':
      return specificity(n.x);
    case 'num':
    case 'str':
    case 'bool':
      return 0;
    default:
      return 1;
  }
}

/** and 체인을 원자 조건 목록으로 펼친다. */
export function conjuncts(n: Node): Node[] {
  if (n.k === 'and') return [...conjuncts(n.a), ...conjuncts(n.b)];
  return [n];
}

/**
 * 조건이 참이 되기까지의 거리 (0 = 참, 1 = 아주 멀다).
 * 수치 비교는 모자란 만큼 비례해서 거리를 준다. 그래서 "호감도 15/40"이 "0/40"보다 가깝다.
 */
export function distance(n: Node, env: Env): number {
  switch (n.k) {
    case 'and':
      return Math.min(1, distance(n.a, env) + distance(n.b, env));
    case 'or':
      return Math.min(distance(n.a, env), distance(n.b, env));
    case 'not':
      return truthy(evaluate(n.x, env)) ? 1 : 0;
    case 'cmp': {
      const a = evaluate(n.a, env);
      const b = evaluate(n.b, env);
      if (truthy(evaluate(n, env))) return 0;
      if (n.op === '==' || n.op === '!=') {
        if (typeof a === 'string' || typeof b === 'string' || n.op === '!=') return 1;
      }
      const x = toNum(a);
      const y = toNum(b);
      const gap = Math.abs(x - y) + (n.op === '<' || n.op === '>' ? 1 : 0);
      return Math.min(1, gap / Math.max(1, Math.abs(x), Math.abs(y)));
    }
    default:
      return truthy(evaluate(n, env)) ? 0 : 1;
  }
}

/** AST를 사람이 읽을 수 있는 식으로 */
export function show(n: Node): string {
  switch (n.k) {
    case 'num':
    case 'bool':
      return String(n.v);
    case 'str':
      return `'${n.v}'`;
    case 'var':
      return n.name;
    case 'not':
      return `not ${show(n.x)}`;
    case 'neg':
      return `-${show(n.x)}`;
    case 'and':
      return `${show(n.a)} and ${show(n.b)}`;
    case 'or':
      return `(${show(n.a)} or ${show(n.b)})`;
    case 'cmp':
    case 'arith':
      return `${show(n.a)} ${n.op} ${show(n.b)}`;
    case 'call':
      return `${n.fn}(${n.args.map(show).join(', ')})`;
  }
}

// ---------------------------------------------------------------- compiled form

export interface Expr {
  src: string;
  ast: Node;
  refs: string[];
  spec: number;
}

const cache = new Map<string, Expr>();

export function compile(src: string | number | boolean): Expr {
  const s = String(src);
  let e = cache.get(s);
  if (!e) {
    const ast = new Parser(tokenize(s), s).parse();
    e = { src: s, ast, refs: [...collectRefs(ast)], spec: specificity(ast) };
    cache.set(s, e);
  }
  return e;
}

export function test(e: Expr | undefined, env: Env): boolean {
  return !e || truthy(evaluate(e.ast, env));
}

// ---------------------------------------------------------------- effects

export type EffectOp = '=' | '+=' | '-=';

export interface Effect {
  src: string;
  target: string;
  op: EffectOp;
  value: Expr;
}

const EFFECT_RE = /^\s*([\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}\p{N}_]+)*)\s*(\+=|-=|=)\s*(.+?)\s*$/u;

export function compileEffect(src: string): Effect {
  const m = EFFECT_RE.exec(src);
  if (!m) throw new ExprError(`효과식은 "변수 = 값", "변수 += 값", "변수 -= 값" 형태여야 함: ${src}`);
  return { src, target: m[1], op: m[2] as EffectOp, value: compile(m[3]) };
}
