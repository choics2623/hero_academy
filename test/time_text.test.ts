import { describe, expect, it } from 'vitest';
import { compile } from '../src/engine/expr';
import { pickVariant, renderTemplate } from '../src/engine/text';
import { Calendar } from '../src/engine/time';

const cal = new Calendar({
  start: '0.2.1',
  end: '1.6.4',
  weeks_per_month: 4,
  slots: ['방과후', '밤', '주말'],
  overrides: [{ from: '0.2', to: '0.2', slots: ['오전', '오후'] }],
});

describe('달력', () => {
  it('학년은 3월에 시작하고 2월이 그 학년의 마지막 달', () => {
    expect(cal.ord(cal.point('0.2.4', 'to'))).toBeLessThan(cal.ord(cal.point('1.3.1', 'from')));
    expect(cal.ord(cal.point('1.12', 'to'))).toBeLessThan(cal.ord(cal.point('1.1', 'from')));
  });

  it('슬롯 오버라이드와 학년 넘김', () => {
    let t = cal.point('0.2.4.오후', 'from');
    expect(cal.slotName(t)).toBe('오후');
    const adv = cal.advance(t);
    t = adv.time;
    expect([t.y, t.m, t.w, cal.slotName(t)]).toEqual([1, 3, 1, '방과후']);
    expect(adv.year).toBe(true);
  });

  it('시간창: "1.6"은 6월 전체', () => {
    const w = cal.window('1.6');
    expect(cal.ord(cal.point('1.6.1.방과후', 'from'))).toBe(w.from);
    expect(cal.ord(cal.point('1.6.4.주말', 'from'))).toBeLessThanOrEqual(w.to);
    expect(cal.ord(cal.point('1.7.1', 'from'))).toBeGreaterThan(w.to);
  });

  it('잘못된 표기', () => {
    expect(() => cal.point('1.13', 'from')).toThrow();
    expect(() => cal.point('1.3.1.새벽', 'from')).toThrow(/슬롯/);
  });
});

describe('대사', () => {
  const env = (vars: Record<string, unknown>) => ({ get: (n: string) => vars[n] as never });

  it('가장 구체적인 변형이 이긴다', () => {
    const vs = [
      { text: '기본' },
      { text: '혐오', when: compile('t.혐오') },
      { text: '혐오+친함', when: compile('t.혐오 and aff >= 40') },
    ];
    expect(pickVariant(vs, (v) => !v.when)?.text).toBe('기본');
    expect(pickVariant(vs, (v) => !v.when || v.when.src === 't.혐오')?.text).toBe('혐오');
    expect(pickVariant(vs, () => true)?.text).toBe('혐오+친함');
  });

  it('템플릿 if / elif / else 와 값 삽입', () => {
    const src = '{{if aff >= 40}}친해{{elif aff >= 10}}아는 사이{{else}}누구?{{/if}} ({{aff}})';
    expect(renderTemplate(src, env({ aff: 50 }))).toBe('친해 (50)');
    expect(renderTemplate(src, env({ aff: 12.7 }))).toBe('아는 사이 (12)');
    expect(renderTemplate(src, env({}))).toBe('누구? ()'); // 값이 없으면 빈칸
  });
});
