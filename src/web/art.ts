// 도트 그림(Pix)을 화면에 올린다. 같은 그림은 한 번만 만들어 data URL로 기억해 둔다.

import type { Pix } from '../art/pixel';

const cache = new Map<string, string>();

export function toCanvas(p: Pix): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = p.w;
  cv.height = p.h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(p.w, p.h);
  for (let i = 0; i < p.data.length; i++) {
    const c = p.data[i];
    if (c < 0) continue;
    img.data[i * 4] = (c >> 16) & 255;
    img.data[i * 4 + 1] = (c >> 8) & 255;
    img.data[i * 4 + 2] = c & 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export function artUrl(key: string, make: () => Pix): string {
  let u = cache.get(key);
  if (!u) {
    u = toCanvas(make()).toDataURL('image/png');
    cache.set(key, u);
  }
  return u;
}

/** 도트 이미지 요소. scale배로 키워서 또렷하게 보인다 */
export function pixImg(key: string, make: () => Pix, size: { w: number; h: number }, scale: number, cls = '', alt = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.src = artUrl(key, make);
  img.width = size.w * scale;
  img.height = size.h * scale;
  img.alt = alt;
  img.decoding = 'async';
  img.className = `px ${cls}`.trim();
  if (!alt) img.setAttribute('aria-hidden', 'true');
  return img;
}
