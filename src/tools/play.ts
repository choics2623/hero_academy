// npm run play -- [--origin 악역도련님 --perks 데이터마이너 --talents 병약,마나탱크] [--seed 1]
// 터미널에서 텍스트로 플레이한다. 숫자로 고르고, s=상태, n=공략 노트, q=종료.
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { Game } from '../engine/game';
import { checkBuild } from '../engine/creation';
import { loadContent } from '../engine/load';
import { num, parseArgs } from './args';
import { buildFromArgs, describeBuild } from './buildarg';

const args = parseArgs();
const content = loadContent((args.content as string) ?? 'content');
const build = buildFromArgs(content, args);
const chk = checkBuild(content, build);
if (!chk.ok) {
  console.log('빌드 오류:\n' + chk.errors.join('\n'));
  process.exit(1);
}
const game = Game.create(content, build, num(args.seed, 1));
const rl = createInterface({ input: stdin, output: stdout, terminal: false });
const lines = rl[Symbol.asyncIterator]();
async function ask(prompt: string): Promise<string> {
  stdout.write(prompt);
  const r = await lines.next();
  if (r.done) {
    console.log();
    process.exit(0);
  }
  return r.value;
}

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

function printStatus() {
  console.log(game.status().map((s) => `${s.label} ${s.value}`).join(' · '));
}

function printNotes() {
  const notes = game.notes();
  if (!notes.length) return console.log(dim('(공략 노트가 비어 있다)'));
  for (const n of notes) {
    const flag = n.reliable ? '' : ` ⚠ 신뢰할 수 없음 (${n.reason})`;
    console.log(`${stars(n.grade)} ${bold(n.title)}${flag}\n   ${n.text}`);
  }
}

console.log(bold(`\n「멸망까지 10년」 엔진 프로토타입`));
console.log(dim(describeBuild(content, build)));
console.log(dim('숫자로 선택 · s 상태 · n 공략 노트 · q 종료\n'));

let lastTime = '';
while (!game.ended) {
  const v = game.view();
  if (v.time !== lastTime) {
    console.log(`\n── ${bold(v.time)} ──`);
    lastTime = v.time;
  }
  if (v.phase === 'scene') {
    if (v.title) console.log(bold(`[${v.title}]`));
    for (const l of v.lines) {
      if (!l.speaker) console.log(l.text);
      else if (l.speaker === '속마음') console.log(dim(`💭 ${l.text}`));
      else console.log(`${bold(l.speaker)}: ${l.text}`);
    }
  }
  const opts: { label: string; act: () => void }[] = [];
  if (game.state.lastBattle) {
    for (const l of game.state.lastBattle.log) console.log(dim(`  ${l.text}${l.dmg ? ` (-${l.dmg})` : ''}`));
    console.log(bold(game.state.lastBattle.result === 'win' ? '  ── 승리 ──' : '  ── 패배 ──'));
  }
  if (v.phase === 'battle' && v.battle) {
    const bt = v.battle;
    for (const l of bt.log) console.log(dim(`  ${l.text}${l.dmg ? ` (-${l.dmg})` : ''}${l.heal ? ` (+${l.heal})` : ''}`));
    console.log(`\n  ${bold(bt.enemy.name)} 체력 ${bt.enemy.hp}/${bt.enemy.maxHp}   |   나 체력 ${bt.me.hp}/${bt.me.maxHp} 기력 ${bt.me.sp}/${bt.me.maxSp} 마나 ${bt.me.mp}/${bt.me.maxMp}`);
    console.log(`  다음 행동: ${bold(bt.intent.label)} — ${bt.intent.text}   (턴 ${bt.turn + 1}/${bt.turns})${bt.status.length ? '  [' + bt.status.join(', ') + ']' : ''}`);
    for (const k of bt.skills) {
      const label = `${k.enabled ? '' : '🔒 '}${k.name}${k.cost ? dim(` (${k.cost})`) : ''} ${dim('— ' + k.desc)}`;
      opts.push({ label, act: () => k.enabled && game.act({ type: 'battle', skill: k.id }) });
    }
  } else if (v.phase === 'activity') {
    for (const a of v.activities) opts.push({ label: a.name, act: () => game.act({ type: 'activity', id: a.id }) });
  } else if (v.choices.length) {
    for (const c of v.choices) {
      const label = c.enabled ? c.text : `🔒 ${c.text}`;
      opts.push({ label: c.hint ? `${label} ${dim('— ' + c.hint)}` : label, act: () => c.enabled && game.act({ type: 'choice', index: c.index }) });
    }
  }
  if (!opts.length) {
    await ask(dim('(엔터)') + '\n');
    game.act({ type: 'continue' });
    continue;
  }
  if (v.phase === 'activity') console.log(dim('무엇을 할까?'));
  opts.forEach((o, i) => console.log(`  ${i + 1}. ${o.label}`));
  for (;;) {
    const ans = (await ask('> ')).trim();
    if (ans === 'q') {
      rl.close();
      process.exit(0);
    }
    if (ans === 's') {
      printStatus();
      continue;
    }
    if (ans === 'n') {
      printNotes();
      continue;
    }
    const i = Number(ans) - 1;
    if (opts[i]) {
      opts[i].act();
      break;
    }
  }
}
console.log(bold('\n── MVP 범위 끝 (1학년 6월) ──'));
printStatus();
for (const cr of content.crossroads.values()) {
  const v = game.state.vars[cr.key];
  console.log(`${cr.title}: ${v === undefined ? '아직 미정' : String(v)}${v === cr.canon ? ' (원작대로)' : v !== undefined ? ' (원작 이탈)' : ''}`);
}
rl.close();
