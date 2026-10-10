// 스토리 린트: 플레이해보지 않고 찾을 수 있는 오류를 잡는다.
// 특히 "시간 데이터 흐름" 분석: 조건이 읽는 변수가 그 이벤트 시간창이 끝나기 전에
// 한 번도 쓰일 수 없다면, 그 조건은 영원히 참이 될 수 없다.

import { walkOutcomes, type Content, type Node } from '../engine';
import { buildGraph, isVirtual, positiveAtoms, type Graph } from './graph';

export type Level = 'error' | 'warn' | 'info';

export interface Finding {
  level: Level;
  code: string;
  where: string;
  msg: string;
}

/** 네임스페이스가 정해진 변수: 참조 대상이 실제로 존재해야 한다 */
const NAMESPACES: { prefix: string; kind: string; has: (c: Content, id: string) => boolean }[] = [
  { prefix: 'fired.', kind: '이벤트', has: (c, id) => c.events.has(id) },
  { prefix: 'talent.', kind: '재능', has: (c, id) => c.talents.has(id.split('.')[0]) },
  { prefix: 'perk.', kind: '특전', has: (c, id) => c.perks.has(id) },
  { prefix: 'count.', kind: '활동', has: (c, id) => c.activities.has(id) },
  { prefix: 'fs.', kind: '복선', has: (c, id) => c.foreshadows.has(id.split('.')[0]) },
  { prefix: 'note.', kind: '공략 노트', has: (c, id) => c.notes.has(id.split('.')[0]) },
  { prefix: 'crossroad.', kind: '갈림길', has: (c, id) => c.crossroads.has(id.split('.')[0]) },
];

/** 쓰이기만 하고 안 읽혀도 괜찮은 변수 (수치형 자원) */
const QUIET_PREFIXES = ['stat.', 'growth.', 'mod.', 'fired.', 'count.', 'fs.', 'note.', 'check.', 'crossroad.', 'talent.', 'perk.', 'time.'];

export function lint(c: Content, g: Graph = buildGraph(c)): Finding[] {
  const out: Finding[] = [];
  const add = (level: Level, code: string, where: string, msg: string) => out.push({ level, code, where, msg });
  const cal = c.calendar;
  const startOrd = cal.ord(cal.startTime);

  // ---- 참조 무결성
  for (const ev of c.events.values()) {
    if (ev.trigger.kind === 'activity') {
      for (const a of ev.trigger.ids) if (!c.activities.has(a)) add('error', 'ACTIVITY_MISSING', ev.id, `없는 활동 '${a}'`);
    }
    for (const { node } of walkOutcomes(ev)) {
      if (node.next && !c.events.has(node.next)) add('error', 'NEXT_MISSING', node.path, `없는 다음 이벤트 '${node.next}'`);
      for (const p of node.plants) if (!c.foreshadows.has(p.id)) add('error', 'FS_MISSING', node.path, `없는 복선 '${p.id}'`);
      for (const f of node.pays) if (!c.foreshadows.has(f)) add('error', 'FS_MISSING', node.path, `없는 복선 '${f}'`);
      if (node.choices.length && node.branch.some((b) => b.choices.length)) {
        add('info', 'CHOICES_OVERRIDE', node.path, '분기 안의 선택지가 바깥 선택지를 덮어씀');
      }
    }
  }
  for (const cr of c.crossroads.values()) {
    if (cr.canonEvent && !c.events.has(cr.canonEvent)) add('error', 'CANON_EVENT_MISSING', cr.id, `없는 원작 이벤트 '${cr.canonEvent}'`);
  }
  for (const n of c.notes.values()) {
    for (const a of n.about) if (!c.crossroads.has(a)) add('error', 'NOTE_ABOUT_MISSING', n.id, `없는 갈림길 '${a}'`);
  }
  for (const t of c.talents.values()) {
    for (const x of t.excludes) {
      const other = c.talents.get(x);
      if (!other) add('error', 'TALENT_EXCLUDE_MISSING', t.id, `없는 재능 '${x}'`);
      else if (!other.excludes.includes(t.id)) add('warn', 'TALENT_EXCLUDE_ASYM', t.id, `'${x}' 쪽에는 배제 표시가 없음`);
    }
  }
  for (const o of c.origins.values()) {
    for (const t of o.talents) if (!c.talents.has(t)) add('error', 'TALENT_MISSING', o.id, `없는 재능 '${t}'`);
  }

  // ---- 화자 이름 오타
  const speakers = new Set([...[...c.characters.values()].map((x) => x.name), ...c.rules.speakers]);
  for (const ev of c.events.values()) {
    for (const { node } of walkOutcomes(ev)) {
      for (const l of node.lines) {
        if (l.speaker && !speakers.has(l.speaker)) add('warn', 'SPEAKER_UNKNOWN', node.path, `알 수 없는 화자 '${l.speaker}'`);
      }
    }
  }

  // ---- 변수 읽기/쓰기
  for (const [name, rs] of g.readers) {
    const where = rs[0].source;
    const ns = NAMESPACES.find((n) => name.startsWith(n.prefix));
    if (ns) {
      const id = name.slice(ns.prefix.length);
      if (!ns.has(c, id)) add('error', 'REF_MISSING', where, `없는 ${ns.kind}를 참조: ${name}`);
      continue;
    }
    if (isVirtual(c, name) || g.writers.has(name)) continue;
    add('warn', 'REF_NEVER_WRITTEN', where, `'${name}'을(를) 쓰는 곳이 없음 (오타?) — ${rs.length}곳에서 읽음`);
  }
  for (const [name, ws] of g.writers) {
    if (g.readers.has(name) || QUIET_PREFIXES.some((p) => name.startsWith(p)) || ws.every((w) => w.op === 'implicit')) continue;
    if (['player.name', 'origin', 'world.collapse_bonus'].includes(name)) continue;
    add('info', 'WRITE_NEVER_READ', ws[0].source, `'${name}'을(를) 아무도 읽지 않음`);
  }

  // ---- 비교 값 오타: fate.sera == 'savd' 처럼 한 번도 대입되지 않는 값과 비교
  for (const [name, rs] of g.readers) {
    const ws = g.writers.get(name);
    if (!ws || ws.some((w) => w.op !== '=' || w.literal === undefined)) continue;
    const values = new Set(ws.map((w) => w.literal));
    for (const r of rs) {
      visitCmp(r.expr.ast, (varName, lit) => {
        if (varName === name && !values.has(lit)) {
          add('warn', 'VALUE_NEVER_SET', r.source, `${name} == '${lit}' 비교. 이 값은 대입되는 곳이 없음 (가능한 값: ${[...values].join(', ')})`);
        }
      });
    }
  }

  // ---- 시간 데이터 흐름: 조건이 이벤트 시간창 안에 참이 될 수 있는가
  for (const ev of c.events.values()) {
    const win = g.eventWindow.get(ev.id);
    if (!win || !ev.when) continue;
    for (const atom of positiveAtoms(ev.when.ast)) {
      const ws = g.writers.get(atom.name);
      if (!ws || isVirtual(c, atom.name)) continue;
      if (ws.some((w) => w.initial || !w.window || w.window.from <= win.to)) continue;
      const earliest = Math.min(...ws.map((w) => w.window!.from));
      add('warn', 'COND_TOO_EARLY', ev.id,
        `조건의 '${atom.name}'은(는) ${cal.labelOrd(earliest)}부터 쓰이는데 이벤트는 ${cal.labelOrd(win.to)}에 끝남 → 절대 발생하지 않음`);
    }
  }

  // ---- 고아 이벤트
  const canonEvents = new Set([...c.crossroads.values()].map((x) => x.canonEvent));
  for (const ev of c.events.values()) {
    if (ev.trigger.kind === 'none' && !g.incoming.has(ev.id) && !canonEvents.has(ev.id)) {
      add('warn', 'EVENT_ORPHAN', ev.id, '어디서도 연결되지 않는 이벤트 (on도 없고 next로 가리키는 곳도 없음)');
    }
    const win = g.eventWindow.get(ev.id);
    if (win && (win.to < startOrd || win.from > cal.endOrd)) {
      add('info', 'OUT_OF_CALENDAR', ev.id, `현재 달력 범위 밖 (${cal.labelOrd(win.from)} ~ ${cal.labelOrd(win.to)})`);
    }
  }

  // ---- 복선
  for (const f of c.foreshadows.values()) {
    const ps = g.plants.get(f.id) ?? [];
    const qs = g.pays.get(f.id) ?? [];
    if (!ps.length) add('warn', 'FS_NO_PLANT', f.id, `복선 '${f.title}'을(를) 심는 이벤트가 없음`);
    if (!qs.length) {
      if (f.pending) add('info', 'FS_PENDING', f.id, `회수 예정 (미작성): ${f.pending}`);
      else add('warn', 'FS_NO_PAYOFF', f.id, `복선 '${f.title}'을(를) 회수하는 이벤트가 없음`);
    }
    const firstPlant = Math.min(...ps.map((p) => p.window?.from ?? -Infinity));
    const lastPay = Math.max(...qs.map((p) => p.window?.to ?? Infinity));
    if (ps.length && qs.length && lastPay < firstPlant) {
      add('error', 'FS_ORDER', f.id, `회수(${cal.labelOrd(lastPay)})가 심기(${cal.labelOrd(firstPlant)})보다 항상 먼저 일어남`);
    }
  }

  // ---- 갈림길
  for (const cr of c.crossroads.values()) {
    const ws = (g.writers.get(cr.key) ?? []).filter((w) => !w.source.startsWith('갈림길:'));
    if (!ws.length) {
      add('warn', 'CROSSROAD_UNDECIDABLE', cr.id, `'${cr.key}'를 바꾸는 이벤트가 없음 → 항상 원작대로`);
      continue;
    }
    if (ws.every((w) => w.window && w.window.from > cr.deadline)) {
      add('warn', 'CROSSROAD_LATE', cr.id, `바꿀 수 있는 이벤트가 전부 마감(${cr.deadlineLabel}) 이후에 있음`);
    }
  }

  // ---- 파생 변수 순환
  const visiting = new Set<string>();
  const done = new Set<string>();
  const dfs = (k: string, stack: string[]) => {
    if (done.has(k)) return;
    if (visiting.has(k)) {
      add('error', 'DERIVED_CYCLE', k, `파생 변수 순환: ${[...stack, k].join(' → ')}`);
      return;
    }
    visiting.add(k);
    for (const r of c.derived.get(k)!.refs) if (c.derived.has(r)) dfs(r, [...stack, k]);
    visiting.delete(k);
    done.add(k);
  };
  for (const k of c.derived.keys()) dfs(k, []);

  return out.sort((a, b) => order(a.level) - order(b.level) || a.code.localeCompare(b.code));
}

function order(l: Level) {
  return l === 'error' ? 0 : l === 'warn' ? 1 : 2;
}

function visitCmp(n: Node, f: (name: string, lit: string) => void) {
  switch (n.k) {
    case 'cmp':
      if ((n.op === '==' || n.op === '!=') && n.a.k === 'var' && n.b.k === 'str') f(n.a.name, n.b.v);
      if ((n.op === '==' || n.op === '!=') && n.b.k === 'var' && n.a.k === 'str') f(n.b.name, n.a.v);
      break;
    case 'and':
    case 'or':
      visitCmp(n.a, f);
      visitCmp(n.b, f);
      break;
    case 'not':
      visitCmp(n.x, f);
      break;
  }
}

