// 아주 작은 CLI 인자 파서: --key value / --flag
export function parseArgs(argv = process.argv.slice(2)): { _: string[]; [k: string]: string | boolean | string[] } {
  const out: { _: string[]; [k: string]: string | boolean | string[] } = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

export function num(v: unknown, d: number): number {
  const n = Number(v);
  return v === undefined || v === true || !Number.isFinite(n) ? d : n;
}
