// 달력. 아카데미 학년은 3월에 시작해서 다음 해 2월에 끝난다.
// 0학년 2월 = 입학 전 한 달 (서장).
// 시점 표기: "학년.월.주.슬롯" — 뒤쪽은 생략 가능 ("1.6" = 1학년 6월 전체).

export interface CalendarDef {
  start: string;
  end: string;
  weeks_per_month: number;
  slots: string[];
  overrides?: { from: string; to: string; slots: string[] }[];
}

export interface Time {
  y: number;
  m: number;
  w: number;
  s: number;
}

export interface Window {
  from: number;
  to: number;
}

const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
const SLOT_SPAN = 16;

export class Calendar {
  readonly startTime: Time;
  readonly endOrd: number;
  private overrides: { from: number; to: number; slots: string[] }[];

  constructor(readonly def: CalendarDef) {
    this.overrides = (def.overrides ?? []).map((o) => ({
      from: this.weekOrdOfPoint(o.from, 'from'),
      to: this.weekOrdOfPoint(o.to, 'to'),
      slots: o.slots,
    }));
    this.startTime = this.point(def.start, 'from');
    this.endOrd = this.ord(this.point(def.end, 'to'));
  }

  monthIndex(m: number): number {
    const i = MONTHS.indexOf(m);
    if (i < 0) throw new Error(`잘못된 월: ${m}`);
    return i;
  }

  weekOrd(t: Pick<Time, 'y' | 'm' | 'w'>): number {
    return (t.y * 12 + this.monthIndex(t.m)) * this.def.weeks_per_month + (t.w - 1);
  }

  ord(t: Time): number {
    return this.weekOrd(t) * SLOT_SPAN + t.s;
  }

  slotsAt(t: Pick<Time, 'y' | 'm' | 'w'>): string[] {
    const wo = this.weekOrd(t);
    const o = this.overrides.find((x) => wo >= x.from && wo <= x.to);
    return o ? o.slots : this.def.slots;
  }

  slotName(t: Time): string {
    return this.slotsAt(t)[t.s] ?? '?';
  }

  private weekOrdOfPoint(p: string, edge: 'from' | 'to'): number {
    return this.weekOrd(this.point(p, edge));
  }

  /** "1.6.2.밤" 같은 표기를 시점으로. edge='to'면 그 기간의 마지막 순간. */
  point(p: string | number, edge: 'from' | 'to'): Time {
    const parts = String(p).split('.');
    const y = Number(parts[0]);
    const m = parts[1] !== undefined ? Number(parts[1]) : edge === 'from' ? 3 : 2;
    const w = parts[2] !== undefined ? Number(parts[2]) : edge === 'from' ? 1 : this.def.weeks_per_month;
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(w) || w < 1 || w > this.def.weeks_per_month) {
      throw new Error(`잘못된 시점 표기: ${p}`);
    }
    this.monthIndex(m);
    let s = edge === 'from' ? 0 : SLOT_SPAN - 1;
    if (parts[3] !== undefined) {
      s = this.slotsAt({ y, m, w }).indexOf(parts[3]);
      if (s < 0) throw new Error(`그 주에 없는 슬롯 '${parts[3]}': ${p}`);
    }
    return { y, m, w, s };
  }

  window(from: string | number, to?: string | number): Window {
    return { from: this.ord(this.point(from, 'from')), to: this.ord(this.point(to ?? from, 'to')) };
  }

  /** 다음 슬롯으로. 주/월/학년이 바뀌었는지 알려준다. */
  advance(t: Time): { time: Time; week: boolean; month: boolean; year: boolean } {
    if (t.s + 1 < this.slotsAt(t).length) {
      return { time: { ...t, s: t.s + 1 }, week: false, month: false, year: false };
    }
    if (t.w < this.def.weeks_per_month) {
      return { time: { ...t, w: t.w + 1, s: 0 }, week: true, month: false, year: false };
    }
    const mi = this.monthIndex(t.m);
    if (mi < 11) {
      return { time: { y: t.y, m: MONTHS[mi + 1], w: 1, s: 0 }, week: true, month: true, year: false };
    }
    return { time: { y: t.y + 1, m: 3, w: 1, s: 0 }, week: true, month: true, year: true };
  }

  label(t: Time): string {
    const year = t.y === 0 ? '입학 전' : `${t.y}학년`;
    return `${year} ${t.m}월 ${t.w}주차 ${this.slotName(t)}`;
  }

  labelOrd(ord: number): string {
    const s = ord % SLOT_SPAN;
    let wo = Math.floor(ord / SLOT_SPAN);
    const w = (wo % this.def.weeks_per_month) + 1;
    wo = Math.floor(wo / this.def.weeks_per_month);
    const m = MONTHS[wo % 12];
    const y = Math.floor(wo / 12);
    return s === SLOT_SPAN - 1 ? `${y}.${m}.${w} 끝` : this.label({ y, m, w, s });
  }
}
