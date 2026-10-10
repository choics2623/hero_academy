// 시드 고정 난수 (mulberry32). 상태가 숫자 하나라서 게임 상태와 함께 복제된다.
// 같은 시드 + 같은 선택 = 항상 같은 결과. 시뮬레이션과 탐색이 재현 가능해진다.

export function nextRandom(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return [value, t];
}
