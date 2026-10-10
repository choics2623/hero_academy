// 도트 그림 전체를 한 장에 늘어놓는 작업용 페이지 (npm run gallery → dist/gallery.html)
import { CAST, enemyArt, extraLook, playerLook, PLAYER_HAIR, PLAYER_HAIR_COLOR } from '../src/art/cast';
import { drawPortrait, type Mood } from '../src/art/portrait';
import type { Pix } from '../src/art/pixel';
import { toCanvas } from '../src/web/art';
import * as art from '../src/art';

const MOODS: Mood[] = ['', '웃음', '화남', '슬픔', '놀람', '당황', '진지'];
const root = document.getElementById('root')!;

function section(title: string) {
  const h = document.createElement('h2');
  h.textContent = title;
  root.append(h);
  const d = document.createElement('div');
  d.className = 'row';
  root.append(d);
  return d;
}
const SCALE = Number(new URLSearchParams(location.search).get('s') ?? 4);
function show(where: HTMLElement, p: Pix, label: string, scale = SCALE) {
  const f = document.createElement('figure');
  const cv = toCanvas(p);
  cv.style.width = `${p.w * scale}px`;
  cv.style.height = `${p.h * scale}px`;
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  f.append(cv, cap);
  where.append(f);
}

const only = new URLSearchParams(location.search).get('only');
if (only === 'rest') {
  const row = section('기본 표정');
  for (const [id, look] of Object.entries(CAST)) show(row, drawPortrait(look), id);
}
if (!only || only === 'cast') {
  for (const [id, look] of Object.entries(CAST)) {
    const row = section(id);
    for (const m of MOODS) show(row, drawPortrait(look, m), m || '기본');
  }
}
if (!only || only === 'extra') {
  const row = section('엑스트라 / 적 / 플레이어');
  for (const n of ['교관', '학생 A', '선배', '상인', '경비병', '사감 선생', '여관 주인', '덩치']) show(row, drawPortrait(extraLook(n)), n);
  for (const [id, n] of [['rats', '쥐'], ['cult_shadow', '그림자'], ['senior', '선배'], ['t_prelim', '덩치'], ['t_kaiden', '카이든']]) show(row, enemyArt(id, n), id);
  const row2 = section('플레이어');
  PLAYER_HAIR.forEach((h, i) => show(row2, drawPortrait(playerLook({ hair: h.id, hairColor: PLAYER_HAIR_COLOR[i % PLAYER_HAIR_COLOR.length].id, eyes: 'eyeBrown', skin: 'fair' }, '평민장학생')), h.label));
}
if ((!only || only === 'icons') && 'ICONS' in art) {
  const row = section('아이콘');
  for (const id of Object.keys((art as any).ICONS)) show(row, (art as any).drawIcon(id), id, 3);
}
if ((!only || only === 'scenes') && 'SCENES' in art) {
  const tods = ['day', 'dusk', 'night'];
  for (const id of Object.keys((art as any).SCENES)) {
    const row = section(id);
    for (const t of tods) show(row, (art as any).drawScene(id, t), t, 3);
  }
}
