// 화면 연출과 효과음. 모든 움직임은 prefers-reduced-motion을 존중한다.
// 효과음은 파일 없이 WebAudio로 합성한다 (기본 꺼짐, 버튼을 눌러야 켜진다).

export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- sound

const SOUND_KEY = 'hero-academy-sound';
let ctx: AudioContext | null = null;
let enabled = false;

export function loadSoundPref() {
  try {
    enabled = localStorage.getItem(SOUND_KEY) === '1';
  } catch {
    enabled = false;
  }
}

export function soundOn() {
  return enabled;
}

export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {
    /* 저장이 막혀도 이번 세션 동안은 유지 */
  }
  if (on) audio();
}

function audio(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; to?: number } = {}) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  g.gain.setValueAtTime(opts.gain ?? 0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, cutoff: number, delay = 0) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export type Sfx = 'click' | 'pick' | 'hit' | 'crit' | 'hurt' | 'heal' | 'dice' | 'win' | 'lose' | 'glitch' | 'rank' | 'learn' | 'guard' | 'blip' | 'whoosh' | 'slash' | 'stamp';

export function sfx(kind: Sfx) {
  if (!enabled) return;
  switch (kind) {
    case 'click':
      tone(880, 0.05, { type: 'triangle', gain: 0.03 });
      break;
    case 'pick':
      tone(520, 0.08, { type: 'triangle', gain: 0.04, to: 880 });
      break;
    case 'hit':
      noise(0.12, 0.25, 900);
      tone(140, 0.12, { type: 'square', gain: 0.03, to: 70 });
      break;
    case 'crit':
      noise(0.16, 0.35, 1600);
      tone(1320, 0.18, { type: 'triangle', gain: 0.04, delay: 0.04 });
      break;
    case 'hurt':
      noise(0.18, 0.3, 500);
      tone(110, 0.2, { type: 'sawtooth', gain: 0.03, to: 55 });
      break;
    case 'guard':
      tone(300, 0.1, { type: 'square', gain: 0.03 });
      tone(600, 0.12, { type: 'triangle', gain: 0.03, delay: 0.03 });
      break;
    case 'heal':
      tone(660, 0.12, { gain: 0.04 });
      tone(990, 0.16, { gain: 0.04, delay: 0.08 });
      break;
    case 'dice':
      for (let i = 0; i < 6; i++) tone(1200 + Math.random() * 600, 0.025, { type: 'square', gain: 0.015, delay: i * 0.06 });
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.05, delay: i * 0.09 }));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(f, 0.3, { type: 'sine', gain: 0.05, delay: i * 0.14 }));
      break;
    case 'glitch':
      for (let i = 0; i < 5; i++) tone(200 + Math.random() * 1800, 0.04, { type: 'square', gain: 0.02, delay: i * 0.035 });
      break;
    case 'rank':
      [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, { type: 'sine', gain: 0.04, delay: i * 0.07 }));
      break;
    case 'blip':
      tone(1500 + Math.random() * 200, 0.018, { type: 'square', gain: 0.008 });
      break;
    case 'whoosh':
      noise(0.28, 0.08, 1400);
      break;
    case 'slash':
      noise(0.09, 0.3, 4000);
      tone(900, 0.08, { type: 'sawtooth', gain: 0.02, to: 300 });
      break;
    case 'stamp':
      tone(180, 0.14, { type: 'square', gain: 0.05, to: 90 });
      noise(0.1, 0.2, 700);
      break;
    case 'learn':
      [659, 880, 1319].forEach((f, i) => tone(f, 0.2, { type: 'triangle', gain: 0.04, delay: i * 0.08 }));
      break;
  }
}

// ---------------------------------------------------------------- visual

/** 버튼을 누른 자리에서 퍼지는 물결 */
export function attachRipple(root: HTMLElement) {
  root.addEventListener('pointerdown', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || b.disabled || reduceMotion()) return;
    const r = b.getBoundingClientRect();
    const s = document.createElement('span');
    const size = Math.max(r.width, r.height) * 1.2;
    s.className = 'ripple';
    s.style.width = s.style.height = `${size}px`;
    s.style.left = `${e.clientX - r.left - size / 2}px`;
    s.style.top = `${e.clientY - r.top - size / 2}px`;
    b.append(s);
    window.setTimeout(() => s.remove(), 650);
  });
}

/** 같은 요소에 애니메이션 클래스를 다시 걸기 */
export function replay(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/** 떠오르는 숫자 (-12, +8) */
export function floatText(target: HTMLElement, text: string, cls: string, delay = 0) {
  const s = document.createElement('span');
  s.className = `float ${cls}`;
  s.textContent = text;
  s.style.left = `${35 + Math.random() * 30}%`;
  s.style.animationDelay = `${delay}ms`;
  target.append(s);
  window.setTimeout(() => s.remove(), 1300 + delay);
}

/** 화면 위쪽에 잠깐 떴다 사라지는 알림 */
export function toast(text: string, kind = '', img?: HTMLElement) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  if (img) t.append(img);
  t.append(text);
  box.append(t);
  window.setTimeout(() => t.classList.add('out'), 2400);
  window.setTimeout(() => t.remove(), 2900);
}

/** 주사위 숫자가 굴러가다 멈춘다 */
export function rollDice(el: HTMLElement, final: number) {
  if (reduceMotion()) {
    el.textContent = String(final);
    return;
  }
  let n = 0;
  const id = window.setInterval(() => {
    el.textContent = String(1 + Math.floor(Math.random() * 20));
    if (++n >= 9) {
      window.clearInterval(id);
      el.textContent = String(final);
      el.classList.add('landed');
    }
  }, 45);
}

/** 막대가 이전 값에서 새 값으로 줄어들거나 늘어난다 */
export function animateBar(fill: HTMLElement, from: number, to: number) {
  const pct = (x: number) => `${Math.max(0, Math.min(100, x * 100))}%`;
  if (reduceMotion() || from === to) {
    fill.style.width = pct(to);
    return;
  }
  fill.style.width = pct(from);
  requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = pct(to))));
}
