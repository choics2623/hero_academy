import { randomBuild, type Build, type Content } from '../engine';
import { nextRandom } from '../engine/rng';

/** --origin 악역도련님 --perks 데이터마이너 --talents 병약,마나탱크,원소친화:화 --random 3 */
export function buildFromArgs(c: Content, args: Record<string, unknown>): Build {
  if (args.random !== undefined || !args.origin) {
    let s = Number(args.random) || 1;
    return randomBuild(c, () => {
      const [v, n] = nextRandom(s);
      s = n;
      return v;
    });
  }
  const list = (v: unknown) => (typeof v === 'string' && v ? v.split(',') : []);
  return {
    name: (args.name as string) ?? '나',
    origin: args.origin as string,
    perks: list(args.perks),
    talents: list(args.talents).map((t) => {
      const [id, option] = t.split(':');
      return { id, option };
    }),
  };
}

export function describeBuild(c: Content, b: Build): string {
  const t = b.talents.map((x) => (x.option ? `${x.id}(${x.option})` : x.id));
  return `${c.origins.get(b.origin)?.name} / 특전: ${b.perks.join(', ') || '-'} / 재능: ${t.join(', ') || '-'}`;
}
