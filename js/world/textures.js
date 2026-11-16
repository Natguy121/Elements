import * as THREE from 'three';
import { ELEMENTS } from '../chem/formula.js';

// Every texture is painted on a canvas at start-up: no image files to download.

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rx = 0, ry = 0, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (rx) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); }
  return t;
}
function speckle(g, w, h, n, alpha, light = 255, dark = 0, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? light : dark;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * size, 1 + Math.random() * size);
  }
}
function stains(g, w, h, n, color, maxR) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * maxR;
    const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.5 + Math.random() * 0.5), Math.random() * 3, 0, 7); g.fill();
  }
}
const SANS = '"Arial Narrow","Helvetica Neue",Arial,sans-serif', BOLD = '"Arial Black","Helvetica Neue",Arial,sans-serif';

export function floorTex(rx, ry) {
  const [c, g] = cv(1024, 1024);
  g.fillStyle = '#8f9596'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const v = 138 + Math.random() * 12; g.fillStyle = `rgb(${v},${v + 3},${v + 4})`; g.fillRect(i * 512, j * 512, 512, 512); }
  speckle(g, 1024, 1024, 26000, 0.2);
  stains(g, 1024, 1024, 26, 'rgba(40,36,30,.10)', 110);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(30,30,30,${0.04 + Math.random() * 0.07})`; g.lineWidth = 1; g.beginPath(); const x = Math.random() * 1024, y = Math.random() * 1024; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 160, y + (Math.random() - 0.5) * 160); g.stroke(); }
  g.strokeStyle = 'rgba(40,44,46,.7)'; g.lineWidth = 4;
  for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 512, 0); g.lineTo(i * 512, 1024); g.moveTo(0, i * 512); g.lineTo(1024, i * 512); g.stroke(); }
  return tex(c, rx, ry);
}
export function wallTex(rx, ry) {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#d9dcd8'; g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 9000, 0.05);
  stains(g, 512, 512, 8, 'rgba(90,84,70,.05)', 120);
  return tex(c, rx, ry);
}
export function tileTex(rx, ry) {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#e4e6e2'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const v = 222 + Math.random() * 10; g.fillStyle = `rgb(${v},${v + 1},${v - 2})`; g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124); }
  speckle(g, 512, 512, 2500, 0.04);
  if (Math.random() < 2) { g.strokeStyle = 'rgba(60,60,60,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(140, 260); g.lineTo(180, 300); g.lineTo(172, 350); g.lineTo(230, 384); g.stroke(); }
  return tex(c, rx, ry);
}
export function steelTex(rx = 1, ry = 1) {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#b4b9bd'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y++) { const v = 150 + Math.random() * 70; g.fillStyle = `rgba(${v},${v},${v},0.22)`; g.fillRect(0, y, 512, 1); }
  for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.12})`; g.lineWidth = 0.6; g.beginPath(); const x = Math.random() * 512, y = Math.random() * 512, a = Math.random() * 6.28, l = 20 + Math.random() * 120; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.3); g.stroke(); }
  stains(g, 512, 512, 6, 'rgba(50,50,50,.06)', 90);
  return tex(c, rx, ry);
}
// dark epoxy bench top with ring stains, scratches and old burns
export function benchTex(rx = 1, ry = 1) {
  const [c, g] = cv(1024, 512);
  g.fillStyle = '#1b1d1f'; g.fillRect(0, 0, 1024, 512);
  speckle(g, 1024, 512, 9000, 0.06);
  for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(160,160,150,${0.05 + Math.random() * 0.08})`; g.lineWidth = 2 + Math.random() * 2; g.beginPath(); g.arc(Math.random() * 1024, Math.random() * 512, 22 + Math.random() * 30, 0, 5 + Math.random() * 1.3); g.stroke(); }
  for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(200,200,200,${0.03 + Math.random() * 0.06})`; g.lineWidth = 0.8; g.beginPath(); const x = Math.random() * 1024, y = Math.random() * 512; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 220, y + (Math.random() - 0.5) * 60); g.stroke(); }
  stains(g, 1024, 512, 5, 'rgba(120,80,40,.10)', 60);
  stains(g, 1024, 512, 4, 'rgba(220,220,210,.06)', 80);
  return tex(c, rx, ry);
}
export function woodTex() {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#a8834f'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgb(${150 + Math.random() * 30},${112 + Math.random() * 24},${66 + Math.random() * 18})`; g.fillRect(0, i * 128, 512, 126);
    for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(70,45,20,${0.05 + Math.random() * 0.12})`; g.lineWidth = 1; g.beginPath(); const y = i * 128 + Math.random() * 126; g.moveTo(0, y); g.bezierCurveTo(170, y + (Math.random() - 0.5) * 14, 340, y + (Math.random() - 0.5) * 14, 512, y + (Math.random() - 0.5) * 8); g.stroke(); }
  }
  g.fillStyle = 'rgba(30,20,10,.75)'; g.font = `900 46px ${BOLD}`; g.textAlign = 'center'; g.fillText('LAB SUPPLY', 256, 280);
  speckle(g, 512, 512, 4000, 0.07, 255, 40);
  return tex(c);
}

// GHS-style hazard marks. Each has its own shape so they read without colour.
const HAZ = {
  flammable: (g, s) => { g.beginPath(); g.moveTo(0, -s * 0.5); g.bezierCurveTo(s * 0.5, -s * 0.1, s * 0.4, s * 0.5, 0, s * 0.5); g.bezierCurveTo(-s * 0.4, s * 0.5, -s * 0.5, -s * 0.1, 0, -s * 0.5); g.fill(); },
  corrosive: (g, s) => { g.fillRect(-s * 0.45, s * 0.25, s * 0.9, s * 0.14); g.beginPath(); g.moveTo(-s * 0.1, -s * 0.5); g.lineTo(s * 0.25, -s * 0.5); g.lineTo(s * 0.05, s * 0.1); g.lineTo(-s * 0.2, s * 0.1); g.fill(); },
  toxic: (g, s) => { g.beginPath(); g.arc(0, -s * 0.1, s * 0.32, 0, 7); g.fill(); g.fillRect(-s * 0.18, s * 0.15, s * 0.36, s * 0.26); },
  water_reactive: (g, s) => { g.beginPath(); g.moveTo(0, -s * 0.5); g.quadraticCurveTo(s * 0.45, s * 0.1, 0, s * 0.45); g.quadraticCurveTo(-s * 0.45, s * 0.1, 0, -s * 0.5); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = s * 0.12; g.beginPath(); g.moveTo(-s * 0.4, -s * 0.4); g.lineTo(s * 0.4, s * 0.4); g.stroke(); },
  oxidizer: (g, s) => { g.lineWidth = s * 0.12; g.strokeStyle = g.fillStyle; g.beginPath(); g.arc(0, s * 0.12, s * 0.28, 0, 7); g.stroke(); g.beginPath(); g.moveTo(0, -s * 0.55); g.lineTo(s * 0.15, -s * 0.2); g.lineTo(-s * 0.15, -s * 0.2); g.fill(); },
};
export function labelTex(title, formula, tags = [], accent = '#d8dcdc') {
  const [c, g] = cv(512, 256);
  g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = accent; g.fillRect(0, 0, 512, 34);
  g.strokeStyle = '#1c1c1c'; g.lineWidth = 5; g.strokeRect(3, 3, 506, 250);
  g.fillStyle = '#151515'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  let size = 58; g.font = `900 ${size}px ${BOLD}`;
  while (g.measureText(title.toUpperCase()).width > 480 && size > 22) { size -= 2; g.font = `900 ${size}px ${BOLD}`; }
  g.fillText(title.toUpperCase(), 16, 108);
  g.font = `400 44px ${SANS}`; g.fillText(formula || '', 16, 164);
  const list = tags.filter((t) => HAZ[t]);
  list.forEach((t, i) => {
    const x = 470 - i * 84, y = 196;
    g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
    g.fillStyle = '#fff'; g.fillRect(-27, -27, 54, 54); g.strokeStyle = '#d3202a'; g.lineWidth = 6; g.strokeRect(-27, -27, 54, 54);
    g.restore(); g.save(); g.translate(x, y); g.fillStyle = '#111'; HAZ[t](g, 40); g.restore();
  });
  g.fillStyle = '#555'; g.font = `400 20px ${SANS}`; g.fillText(list.length ? list.join(' · ').replace(/_/g, ' ').toUpperCase() : 'GENERAL USE', 16, 232);
  speckle(g, 512, 256, 500, 0.05, 120, 60);
  return tex(c);
}
export function signTex(lines, bg, fg, w = 512, h = 256, border = true) {
  const [c, g] = cv(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lh = (h - 40) / lines.length;
  lines.forEach((l, i) => { let size = Math.min(lh * 0.8, 120); g.font = `900 ${size}px ${BOLD}`; while (g.measureText(l).width > w - 60) { size -= 2; g.font = `900 ${size}px ${BOLD}`; } g.fillText(l, w / 2, 20 + lh * (i + 0.5) + 3); });
  return tex(c);
}
const BLOCK_COL = { 'nonmetal': '#5fb4d8', 'noble gas': '#b68ad8', 'alkali metal': '#e0785a', 'alkaline earth metal': '#e0a85a', 'metalloid': '#62c09a', 'halogen': '#d8cf58', 'metal': '#a9b6c4', 'post-transition metal': '#a9b6c4', 'transition metal': '#d89aa8', 'lanthanoid': '#8fb0e0', 'actinoid': '#c0a0d0' };
export const blockColor = (b) => BLOCK_COL[b] || '#a9b6c4';
// The periodic table wall. Lit squares are elements the team has; the rest are dark.
export function tableWall(unlocked) {
  const [c, g] = cv(2048, 1180);
  const t = tex(c);
  t.draw = (have) => {
    g.fillStyle = '#0e1215'; g.fillRect(0, 0, 2048, 1180);
    g.fillStyle = '#e8ecec'; g.font = `900 64px ${BOLD}`; g.textAlign = 'left'; g.fillText('PERIODIC TABLE', 56, 92);
    g.font = `400 34px ${SANS}`; g.fillStyle = '#8f9a9f'; g.fillText(`${have.size} of 118 in the store room`, 60, 138);
    const s = 106, ox = 56, oy = 170;
    for (const e of ELEMENTS) {
      const x = ox + (e.pos[0] - 1) * s, y = oy + (e.pos[1] - 1) * s - (e.pos[1] > 8 ? 70 : 0);
      const lit = have.has(e.sym);
      g.fillStyle = lit ? blockColor(e.block) : '#1b2226'; g.fillRect(x + 3, y + 3, s - 6, s - 6);
      if (!lit) { g.strokeStyle = '#2a3338'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, s - 6, s - 6); }
      g.fillStyle = lit ? '#10161a' : '#46535a'; g.textAlign = 'left'; g.font = `700 20px ${SANS}`; g.fillText(String(e.z), x + 10, y + 28);
      g.textAlign = 'center'; g.font = `900 46px ${BOLD}`; g.fillText(e.sym, x + s / 2, y + 76);
    }
    t.needsUpdate = true;
  };
  t.draw(unlocked);
  return t;
}
export function lcdTex(w = 256, h = 96) {
  const [c, g] = cv(w, h);
  const t = tex(c);
  t.set = (text, sub = '') => {
    g.fillStyle = '#0b1a12'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7dffb0'; g.textAlign = 'right'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(h * 0.56)}px "DM Mono","Courier New",monospace`;
    g.fillText(text, w - 12, h * 0.46);
    g.font = `700 ${Math.round(h * 0.17)}px "Courier New",monospace`; g.textAlign = 'left'; g.fillStyle = '#4fb880'; g.fillText(sub, 10, h * 0.87);
    t.needsUpdate = true;
  };
  t.set('0.00 g');
  return t;
}

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
  for (let i = 0; i < 18; i++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 18 + Math.random() * 26;
    const gr = sg.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
  }
  const smoke = tex(sc);
  const [bc, bg] = cv(64, 64);
  const gr = bg.createRadialGradient(32, 32, 14, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,.06)'); gr.addColorStop(0.75, 'rgba(255,255,255,.5)'); gr.addColorStop(0.92, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  bg.fillStyle = gr; bg.fillRect(0, 0, 64, 64);
  bg.fillStyle = 'rgba(255,255,255,.95)'; bg.beginPath(); bg.ellipse(22, 20, 6, 4, -0.7, 0, 7); bg.fill();
  const bubble = tex(bc);
  const drop = tex(radial([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,.8)'], [0.8, 'rgba(255,255,255,.15)'], [1, 'rgba(255,255,255,0)']], 64));
  // tongue of flame: bright core, soft edge, taller than wide
  const [fc, fg] = cv(64, 128);
  const fgr = fg.createRadialGradient(32, 92, 2, 32, 76, 60);
  fgr.addColorStop(0, 'rgba(255,255,255,1)'); fgr.addColorStop(0.3, 'rgba(255,255,255,.7)'); fgr.addColorStop(1, 'rgba(255,255,255,0)');
  fg.fillStyle = fgr; fg.beginPath(); fg.moveTo(32, 2); fg.bezierCurveTo(60, 60, 58, 110, 32, 124); fg.bezierCurveTo(6, 110, 4, 60, 32, 2); fg.fill();
  const flame = tex(fc);
  return { glow, spark, smoke, bubble, drop, flame };
}
