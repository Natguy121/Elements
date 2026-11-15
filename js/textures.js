import * as THREE from 'three';
import { SYMBOLS, NAMES, CONTENT, CAT_COLORS, gridPos } from './data.js';

// Every texture in the game is painted on a canvas at start-up. No image files.

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, rx = 0, ry = 0) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (rx) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); }
  return t;
}
function speckle(g, w, h, n, alpha, light = 255, dark = 0) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? light : dark;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}
const HAND = '"Segoe Print","Bradley Hand","Chalkboard SE","Comic Sans MS","Comic Neue",cursive';
const SANS = '"Arial Black","Helvetica Neue",Arial,sans-serif';

export function floorTex(rx, ry) {
  const [c, g] = cv(512, 512);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const v = 168 + Math.random() * 14;
    g.fillStyle = `rgb(${v},${v + 3},${v + 5})`;
    g.fillRect(i * 256, j * 256, 256, 256);
  }
  speckle(g, 512, 512, 9000, 0.22);
  g.strokeStyle = 'rgba(60,66,70,.55)'; g.lineWidth = 3;
  for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 512); g.moveTo(0, i * 256); g.lineTo(512, i * 256); g.stroke(); }
  return tex(c, rx, ry);
}

export function wallTex() {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#e9ecea'; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 3500, 0.05);
  return tex(c, 5, 2);
}

export function cardboardTex(stamps = false) {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#b88a57'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 4) { g.fillStyle = `rgba(90,60,25,${0.04 + Math.random() * 0.07})`; g.fillRect(0, y, 512, 2); }
  speckle(g, 512, 512, 5000, 0.08, 255, 60);
  if (stamps) {
    g.save(); g.translate(256, 300); g.rotate(-0.12);
    g.strokeStyle = g.fillStyle = 'rgba(170,25,20,.82)'; g.lineWidth = 8;
    g.strokeRect(-170, -52, 340, 104);
    g.font = `900 70px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('FRAGILE', 0, 4);
    g.restore();
    g.fillStyle = 'rgba(30,20,10,.75)'; g.font = `900 30px ${SANS}`; g.textAlign = 'center';
    g.fillText('↑ THIS SIDE UP (ISH) ↑', 256, 120);
    g.font = `700 20px ${SANS}`;
    g.fillText('DO NOT THROW. SERIOUSLY THIS TIME.', 256, 440);
  }
  return tex(c);
}

function wrap(g, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    if (g.measureText(line + w).width > maxW && line) { g.fillText(line.trim(), x, y); y += lh; line = ''; }
    line += w + ' ';
  }
  g.fillText(line.trim(), x, y);
  return y;
}

// Shipping label on the delivery box.
export function shippingLabelTex(z) {
  const el = CONTENT[z], [c, g] = cv(640, 400);
  g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, 640, 400);
  g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(6, 6, 628, 388);
  g.fillStyle = CAT_COLORS[el.cat]; g.fillRect(24, 24, 190, 210);
  g.strokeRect(24, 24, 190, 210);
  g.fillStyle = '#111'; g.textBaseline = 'alphabetic';
  g.font = `700 34px ${SANS}`; g.textAlign = 'left'; g.fillText(String(z), 36, 62);
  g.font = `900 120px ${SANS}`; g.textAlign = 'center'; g.fillText(SYMBOLS[z - 1], 119, 190);
  g.textAlign = 'left';
  g.font = `700 20px ${SANS}`; g.fillText('CONTENTS:', 236, 50);
  let size = 58;
  g.font = `900 ${size}px ${SANS}`;
  const name = NAMES[z - 1].toUpperCase();
  while (g.measureText(name).width > 380 && size > 24) { size -= 2; g.font = `900 ${size}px ${SANS}`; }
  g.fillText(name, 236, 110);
  g.font = `400 22px ${SANS}`;
  wrap(g, el.tag, 236, 150, 380, 28);
  g.fillRect(24, 250, 592, 4);
  g.font = `700 17px ${SANS}`;
  g.fillText('FROM: THE UNIVERSE, DEPT. OF MATTER', 24, 284);
  g.fillText('TO: YOU. YES, YOU. THE ONE WITH EYEBROWS.', 24, 310);
  let x = 24;
  while (x < 420) { const w = 2 + Math.floor(Math.random() * 6); g.fillRect(x, 330, w, 50); x += w + 2 + Math.floor(Math.random() * 5); }
  g.font = `900 34px ${SANS}`; g.textAlign = 'right'; g.fillText('QTY: 1', 612, 370);
  return tex(c);
}

// Wrap-around label for gas bottles and sample jars.
export function sampleLabelTex(z) {
  const el = CONTENT[z], [c, g] = cv(512, 256);
  g.fillStyle = '#f7f6f0'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = CAT_COLORS[el.cat]; g.fillRect(0, 0, 512, 44); g.fillRect(0, 222, 512, 34);
  g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = `900 130px ${SANS}`; g.fillText(SYMBOLS[z - 1], 256, 172);
  g.font = `700 28px ${SANS}`; g.fillText(String(z), 256, 34);
  g.font = `700 26px ${SANS}`; g.fillText(NAMES[z - 1].toUpperCase(), 256, 210);
  // hazard diamond
  g.save(); g.translate(440, 120); g.rotate(Math.PI / 4);
  g.fillStyle = '#ffc21a'; g.fillRect(-30, -30, 60, 60); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(-30, -30, 60, 60);
  g.restore();
  g.fillStyle = '#111'; g.font = `900 44px ${SANS}`; g.fillText('!', 440, 136);
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping; t.repeat.x = 2; // label repeats so it reads from any side
  return t;
}

export function whiteboardTex() {
  const [c, g] = cv(1024, 560);
  g.fillStyle = '#f6f8f7'; g.fillRect(0, 0, 1024, 560);
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(120,140,150,${0.02 + Math.random() * 0.03})`; g.beginPath(); g.ellipse(Math.random() * 1024, Math.random() * 560, 80 + Math.random() * 160, 20 + Math.random() * 40, Math.random(), 0, 7); g.fill(); }
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.fillStyle = '#c0261d'; g.font = `700 44px ${HAND}`;
  g.fillText('DAYS SINCE LAST INCIDENT:', 36, 70);
  g.fillStyle = '#16233a'; g.font = `700 76px ${HAND}`; g.fillText('0', 880, 80);
  g.strokeStyle = '#16233a'; g.lineWidth = 5; g.strokeRect(858, 14, 86, 82);
  g.font = `400 38px ${HAND}`; g.fillStyle = 'rgba(22,35,58,.45)';
  g.fillText('47  12  3', 700, 66);
  g.strokeStyle = 'rgba(22,35,58,.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(694, 54); g.lineTo(848, 50); g.stroke();
  g.fillStyle = '#16233a'; g.font = `700 40px ${HAND}`; g.fillText('TO DO', 40, 170);
  g.font = `400 34px ${HAND}`;
  ['1. science', '2. find eyebrows', '3. apologise to the duck', '4. more science'].forEach((s, i) => g.fillText(s, 46, 222 + i * 50));
  g.strokeStyle = '#16233a'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 232); g.lineTo(220, 226); g.stroke();
  g.fillStyle = '#1b7a3c'; g.font = `700 42px ${HAND}`;
  g.fillText('H₂ + spark = regret', 520, 200);
  g.fillText('E = mc² (probably)', 540, 270);
  g.strokeStyle = '#1b62b8'; g.lineWidth = 5;
  g.beginPath();
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; g[i ? 'lineTo' : 'moveTo'](720 + Math.cos(a) * 80, 410 + Math.sin(a) * 80); }
  g.stroke();
  g.beginPath(); g.arc(720, 410, 48, 0, 7); g.stroke();
  g.fillStyle = '#1b62b8'; g.font = `400 30px ${HAND}`; g.fillText('← benzene (do not sniff)', 600, 530);
  g.fillStyle = '#c0261d'; g.font = `700 32px ${HAND}`; g.fillText('SAFETY GOGGLES ≠ SUNGLASSES', 40, 520);
  return tex(c);
}

export function posterTex() {
  const [c, g] = cv(1024, 640);
  g.fillStyle = '#12202b'; g.fillRect(0, 0, 1024, 640);
  g.fillStyle = '#ffc21a'; g.font = `900 46px ${SANS}`; g.textAlign = 'center';
  g.fillText('THE PERIODIC TABLE', 512, 62);
  g.fillStyle = '#e8eef0'; g.font = `700 20px ${SANS}`;
  g.fillText('118 FLAVOURS OF EVERYTHING · COLLECT THEM ALL', 512, 94);
  const s = 52, ox = 44, oy = 108;
  for (let z = 1; z <= 118; z++) {
    const [col, row] = gridPos(z);
    const x = ox + (col - 1) * s, y = oy + (row - 1) * s + (row > 8 ? -30 : 0);
    const el = CONTENT[z];
    g.fillStyle = el ? CAT_COLORS[el.cat] : `hsl(${(col * 17 + row * 40) % 360},35%,62%)`;
    g.fillRect(x + 2, y + 2, s - 4, s - 4);
    g.fillStyle = '#10181e'; g.font = `900 20px ${SANS}`;
    g.fillText(SYMBOLS[z - 1], x + s / 2, y + s / 2 + 8);
  }
  return tex(c);
}

export function signTex(lines, bg, fg, w = 512, h = 256, border = true) {
  const [c, g] = cv(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lh = (h - 40) / lines.length;
  lines.forEach((l, i) => {
    let size = Math.min(lh * 0.82, 130);
    g.font = `900 ${size}px ${SANS}`;
    while (g.measureText(l).width > w - 60) { size -= 2; g.font = `900 ${size}px ${SANS}`; }
    g.fillText(l, w / 2, 20 + lh * (i + 0.5) + 4);
  });
  return tex(c);
}

export function clockTex() {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#fafafa'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 6;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100); g.lineTo(128 + Math.cos(a) * 114, 128 + Math.sin(a) * 114); g.stroke(); }
  return tex(c);
}

// ---------- particle sprites ----------
function radial(stops, size = 128) {
  const [c, g] = cv(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
export function particleTextures() {
  const glow = tex(radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.75)'], [0.6, 'rgba(255,255,255,.18)'], [1, 'rgba(255,255,255,0)']]));
  const spark = tex(radial([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,.9)'], [0.4, 'rgba(255,255,255,.12)'], [1, 'rgba(255,255,255,0)']], 64));
  const [sc, sg] = cv(128, 128);
  for (let i = 0; i < 16; i++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 18 + Math.random() * 26;
    const gr = sg.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
  }
  const smoke = tex(sc);
  const [bc, bg] = cv(64, 64);
  const gr = bg.createRadialGradient(32, 32, 14, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,.06)'); gr.addColorStop(0.75, 'rgba(255,255,255,.55)'); gr.addColorStop(0.92, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  bg.fillStyle = gr; bg.fillRect(0, 0, 64, 64);
  bg.fillStyle = 'rgba(255,255,255,.95)'; bg.beginPath(); bg.ellipse(22, 20, 6, 4, -0.7, 0, 7); bg.fill();
  const bubble = tex(bc);
  const drop = tex(radial([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,.8)'], [0.8, 'rgba(255,255,255,.15)'], [1, 'rgba(255,255,255,0)']], 64));
  return { glow, spark, smoke, bubble, drop };
}
