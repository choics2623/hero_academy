import { describe, expect, it } from 'vitest';
import { compile, compileEffect, distance, evaluate, ExprError } from '../src/engine/expr';

const env = (vars: Record<string, unknown>) => ({ get: (n: string) => vars[n] as never });

describe('조건식', () => {
  it('한글 변수, 비교, 논리 연산', () => {
    const e = compile("affinity.리아나 >= 20 and not fired.x and fate.세라 == 'saved'");
    expect(evaluate(e.ast, env({ 'affinity.리아나': 25, 'fate.세라': 'saved' }))).toBe(true);
    expect(evaluate(e.ast, env({ 'affinity.리아나': 25, 'fate.세라': 'saved', 'fired.x': 1 }))).toBe(false);
  });

  it('없는 변수는 0 / 거짓으로 취급', () => {
    expect(evaluate(compile('a + 3').ast, env({}))).toBe(3);
    expect(evaluate(compile("fate.x == 'dead'").ast, env({}))).toBe(false);
    expect(evaluate(compile('not flag').ast, env({}))).toBe(true);
  });

  it('산술, 함수, 우선순위', () => {
    expect(evaluate(compile('floor(25 / 10) + 2 * 3').ast, env({}))).toBe(8);
    expect(evaluate(compile('max(1, a) - -2').ast, env({ a: 5 }))).toBe(7);
  });

  it('구체성 = and로 묶인 조건 수, or는 느슨한 쪽', () => {
    expect(compile('a').spec).toBe(1);
    expect(compile('a and b > 1 and c').spec).toBe(3);
    expect(compile('(a and b) or c').spec).toBe(1);
  });

  it('거리: 수치가 가까울수록 작다', () => {
    const e = compile('affinity >= 40');
    expect(distance(e.ast, env({ affinity: 40 }))).toBe(0);
    expect(distance(e.ast, env({ affinity: 30 }))).toBeLessThan(distance(e.ast, env({ affinity: 0 })));
  });

  it('참조 변수 수집', () => {
    expect(compile('a.b + c > d.e').refs.sort()).toEqual(['a.b', 'c', 'd.e']);
  });

  it('효과식', () => {
    const f = compileEffect("fate.sera = 'saved'");
    expect([f.target, f.op]).toEqual(['fate.sera', '=']);
    expect(compileEffect('stat.근력 += 2 * x').op).toBe('+=');
    expect(() => compileEffect('그냥 문장')).toThrow(ExprError);
  });

  it('문법 오류', () => {
    expect(() => compile('a >= ')).toThrow(ExprError);
    expect(() => compile('foo(1)')).toThrow(/알 수 없는 함수/);
    expect(() => compile("a == 'unterminated")).toThrow(/닫히지 않은/);
  });
});
