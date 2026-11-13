import { SYMBOLS, NAMES, CONTENT, STATIONS, CAT_COLORS, MAX_PLAYABLE, MIXES, MIX_TOTAL, LOCKED_LINES, gridPos, taskName, mixResult } from './data.js';
import { initAudio, setMuted, sfx } from './audio.js';
import { updateTweens, wait } from './fx.js';
import { buildLab } from './lab.js';
import { createExperiments } from './experiments.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'elements-lab-save-v1';

// ---------- save ----------
const fresh = () => ({ unlocked: 1, done: {}, delivered: {}, cleared: {}, mixes: {}, muted: false });
let save = fresh();
try { const raw = localStorage.getItem(SAVE_KEY); if (raw) save = { ...fresh(), ...JSON.parse(raw) }; } catch (e) { /* private mode: play without saving */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
const tasksDone = (z) => CONTENT[z].tasks.filter((t) => save.done[z] && save.done[z][t]).length;
const isCleared = (z) => !!CONTENT[z] && tasksDone(z) === 3;

// ---------- lab ----------
const canvas = $('gl');
let L, X;
let state = 'menu', current = 0, busy = false, phase = 'idle', session = 0;
let pendingTap = null;

const ui = {
  flash(a = 1, fade = 0.7) { fx($('fxFlash'), a, fade); },
  whiteout() { const el = $('fxFlash'); el.style.transition = 'none'; el.style.opacity = 0.96; setTimeout(() => { el.style.transition = 'opacity 1.8s'; el.style.opacity = 0; }, 1500); },
  soot() { fx($('fxSoot'), 0.95, 7); },
  tint(css, secs = 3) { const el = $('fxTint'); el.style.background = css; fx(el, 1, secs); },
  bubble(text, pitch = 1) {
    const b = $('bubble');
    b.textContent = text;
    b.style.fontSize = Math.round(Math.max(11, Math.min(34, 19 / Math.pow(pitch, 1.1)))) + 'px';
    b.style.fontStyle = pitch > 1.4 ? 'italic' : 'normal';
    b.hidden = true; void b.offsetWidth; b.hidden = false;
    clearTimeout(ui._bt);
    ui._bt = setTimeout(() => { b.hidden = true; }, 2300);
  },
  caption(text) {
    const p = $('capText');
    clearInterval(ui._ct);
    let i = 0;
    p.textContent = '';
    ui._ct = setInterval(() => { i += 2; p.textContent = text.slice(0, i); if (i >= text.length) clearInterval(ui._ct); }, 16);
  },
};
function fx(el, a, fade) {
  el.style.transition = 'none'; el.style.opacity = a;
  void el.offsetWidth;
  el.style.transition = `opacity ${fade}s ease-in`; el.style.opacity = 0;
}
let toastTimer = 0;
function toast(text, ms = 2600) {
  const t = $('toast');
  t.textContent = text; t.hidden = true; void t.offsetWidth; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- sound toggle ----------
function refreshSound() {
  $('btnSound').textContent = 'Sound: ' + (save.muted ? 'off' : 'on');
  $('btnSnd2').textContent = save.muted ? 'Sound off' : 'Sound on';
  setMuted(save.muted);
}
function toggleSound() { save.muted = !save.muted; persist(); refreshSound(); sfx.click(); }
$('btnSound').onclick = toggleSound;
$('btnSnd2').onclick = toggleSound;
window.addEventListener('pointerdown', () => initAudio(), { passive: true });

// ---------- screens ----------
function show(next) {
  state = next;
  $('menu').hidden = next !== 'menu';
  $('table').hidden = next !== 'table';
  $('hud').hidden = next !== 'lab';
  if (next === 'menu') L.setView('menu');
  L.setLift(next === 'lab' ? (window.innerWidth < window.innerHeight ? 0.07 : 0.13) : 0);
  if (next === 'table') refreshTable();
}

// ---------- periodic table ----------
const cells = {};
function buildTable() {
  const grid = $('grid');
  for (let z = 1; z <= 118; z++) {
    const [col, row] = gridPos(z);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cell';
    b.style.gridColumn = col; b.style.gridRow = row;
    b.setAttribute('aria-label', NAMES[z - 1]);
    b.innerHTML = `<span class="n">${z}</span><span class="s">${SYMBOLS[z - 1]}</span>`;
    if (CONTENT[z]) b.style.setProperty('--c', CAT_COLORS[CONTENT[z].cat]);
    b.onclick = () => pickElement(z);
    grid.appendChild(b);
    cells[z] = b;
  }
}
function sizeTable() {
  const w = window.innerWidth, h = window.innerHeight;
  const cell = Math.max(36, Math.min(76, Math.floor((w - 40) / 18) - 3, Math.floor((h - 190) / 9.3) - 3));
  $('grid').style.setProperty('--cell', cell + 'px');
}
function nextUp() {
  for (let z = 1; z <= Math.min(save.unlocked, MAX_PLAYABLE); z++) if (!isCleared(z)) return z;
  return 0;
}
function refreshTable() {
  sizeTable();
  const up = nextUp();
  for (let z = 1; z <= 118; z++) {
    const open = z <= save.unlocked && !!CONTENT[z];
    cells[z].classList.toggle('open', open);
    cells[z].classList.toggle('done', open && isCleared(z));
    cells[z].classList.toggle('pop', z === up);
  }
  const n = Math.min(save.unlocked, MAX_PLAYABLE);
  $('tProgress').textContent = `${n} of 118 unlocked · ${Object.keys(save.mixes).length} compounds found`;
  $('tHint').textContent = up
    ? `${NAMES[up - 1]} is waiting. Finish three experiments with it to unlock the next element.`
    : 'Every delivered element is cleared. The mixer is still open for bad ideas.';
  if ($('grid').scrollWidth > $('tScroll').clientWidth) $('tHint').textContent += ' Swipe sideways to see the whole table.';
  if (up) requestAnimationFrame(() => cells[up].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }));
}
let lockedLine = 0;
function pickElement(z) {
  if (z <= save.unlocked && CONTENT[z]) { sfx.ding(); enterLab(z); return; }
  sfx.fizzle();
  const cell = cells[z];
  cell.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 220 });
  if (z > MAX_PLAYABLE) toast(`${NAMES[z - 1]} is on backorder. Elements 19 to 118 arrive in a future update.`);
  else toast(LOCKED_LINES[lockedLine++ % LOCKED_LINES.length].replace('{n}', NAMES[z - 1]));
}

// ---------- HUD ----------
const ICONS = {
  balloon: '<ellipse cx="12" cy="9" rx="6" ry="7"/><path d="M12 16v1.500M12 17.500c-2 2 2 3 0 5"/>',
  burner: '<path d="M12 3c1 4 5 5.500 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 1.500 2.500 2 2.500C11 9 10.500 6 12 3z"/>',
  zap: '<path d="M13 2 5 13h6l-1 9 8-11h-6z"/>',
  water: '<path d="M12 3c3.500 4.500 6 7.500 6 11a6 6 0 0 1-12 0c0-3.500 2.500-6.500 6-11z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>',
  mix: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.800 3h10.400a2 2 0 0 0 1.800-3l-5-9V3M7.500 15h9"/>',
};
const dockBtns = {};
function buildDock() {
  STATIONS.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[s.id]}</svg><span>${s.name}</span>`;
    b.onclick = () => useStation(s.id);
    $('dock').appendChild(b);
    dockBtns[s.id] = b;
  });
}
function refreshHud() {
  const z = current, el = CONTENT[z];
  $('chip').style.setProperty('--c', CAT_COLORS[el.cat]);
  $('chipSym').textContent = SYMBOLS[z - 1];
  $('chipNum').textContent = 'No. ' + z;
  $('chipName').textContent = NAMES[z - 1];
  const done = save.done[z] || {};
  $('tasks').innerHTML = `<li class="head">Experiments ${tasksDone(z)}/3</li>` +
    el.tasks.map((t) => `<li class="${done[t] ? 'done' : ''}">${taskName(z, t)}</li>`).join('');
  STATIONS.forEach((s) => {
    const isTask = el.tasks.includes(s.id);
    dockBtns[s.id].classList.toggle('todo', isTask && !done[s.id]);
    dockBtns[s.id].classList.toggle('did', isTask && !!done[s.id]);
  });
  $('dock').classList.toggle('off', busy || phase !== 'play');
  $('tasks').hidden = phase !== 'play';
  $('btnBack').disabled = busy && !pendingTap;
}

function waitTap(kind) {
  return new Promise((resolve, reject) => {
    pendingTap = { kind, resolve, reject };
    $('markerText').textContent = kind === 'door' ? 'Open the door' : 'Open the package';
    $('marker').hidden = false;
    refreshHud();
  });
}
function resolveTap(kind) {
  if (!pendingTap || (kind && pendingTap.kind !== kind)) return;
  const p = pendingTap;
  pendingTap = null;
  $('marker').hidden = true;
  sfx.tap();
  refreshHud();
  p.resolve();
}
$('marker').onclick = () => resolveTap();

const firstTodo = (z) => CONTENT[z].tasks.find((t) => !(save.done[z] && save.done[z][t])) || CONTENT[z].tasks[0];

async function enterLab(z) {
  const my = ++session;
  current = z;
  show('lab');
  $('bubble').hidden = true;
  const el = CONTENT[z];
  if (!save.delivered[z]) {
    phase = 'delivery'; busy = true;
    refreshHud();
    L.setView('door', true);
    try { await X.deliver(z, waitTap); } catch (e) { if (e !== 'cancel') throw e; return; }
    if (my !== session) return;
    save.delivered[z] = true; persist();
    phase = 'play';
    const st = firstTodo(z);
    L.setView(st);
    await X.bring(st);
    if (my !== session) return;
    busy = false;
    ui.caption('Three experiments unlock the next element. Pick a glowing station below, or tap things in the lab.');
  } else {
    phase = 'play'; busy = false;
    const st = firstTodo(z);
    X.placeSample(z, st);
    L.setView(st, true);
    ui.caption(isCleared(z) ? `${NAMES[z - 1]} again. Everything here still works. Go wild.` : el.intro);
  }
  refreshHud();
}

function leaveLab() {
  if (busy && !pendingTap) return;
  session++;
  if (pendingTap) { // walked out mid-delivery: put the door and box back
    const p = pendingTap; pendingTap = null;
    $('marker').hidden = true;
    L.door.rotation.y = 0; L.pack.group.visible = false;
    p.reject('cancel');
  }
  busy = false; phase = 'idle';
  sfx.click();
  show('table');
}
$('btnBack').onclick = leaveLab;
$('btnWide').onclick = () => { if (!busy) { L.setView('wide'); sfx.click(); } };

async function useStation(id) {
  if (state !== 'lab' || busy || phase !== 'play') return;
  if (id === 'mix') { openMixer(); return; }
  const z = current, my = session, r = CONTENT[z].r[id];
  busy = true; refreshHud();
  sfx.click();
  await X.run(id, z);
  if (my !== session) return;
  ui.caption(r.text);
  const isTask = CONTENT[z].tasks.includes(id);
  save.done[z] = save.done[z] || {};
  let justCleared = false;
  if (isTask && !save.done[z][id]) {
    save.done[z][id] = true;
    sfx.ding();
    if (isCleared(z) && !save.cleared[z]) { save.cleared[z] = true; justCleared = true; if (z < MAX_PLAYABLE) save.unlocked = Math.max(save.unlocked, z + 1); }
    persist();
  }
  refreshHud();
  if (justCleared) {
    await wait(2.2);
    if (my !== session) return;
    showUnlock(z);
  }
  busy = false; refreshHud();
}

// ---------- unlock ----------
function showUnlock(z) {
  const last = z >= MAX_PLAYABLE, n = last ? z : z + 1;
  $('unlockTile').style.setProperty('--c', CAT_COLORS[CONTENT[n].cat]);
  $('unlockNum').textContent = n;
  $('unlockSym').textContent = SYMBOLS[n - 1];
  $('unlockEyebrow').textContent = `${NAMES[z - 1]}: 3 of 3 experiments`;
  $('unlockTitle').textContent = last ? 'Lab cleared' : `${NAMES[n - 1]} unlocked`;
  $('unlockText').textContent = last
    ? 'You have cleared every element delivered so far. Potassium is on backorder, along with the other 99. The mixer is still open.'
    : `A package marked "${NAMES[n - 1].toUpperCase()}" is on its way. Try not to be standing behind the door.`;
  const cf = $('confetti');
  cf.innerHTML = '';
  const cols = ['#ffc21a', '#ff5fa8', '#43e08f', '#7fd6ff', '#d59bff', '#ffffff'];
  for (let i = 0; i < 44; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = cols[i % cols.length];
    p.style.animationDelay = Math.random() * 0.8 + 's';
    p.style.animationDuration = 1.8 + Math.random() * 1.4 + 's';
    cf.appendChild(p);
  }
  $('unlock').hidden = false;
  sfx.fanfare();
}
$('unlockStay').onclick = () => { $('unlock').hidden = true; sfx.click(); };
$('unlockGo').onclick = () => { $('unlock').hidden = true; busy = false; leaveLab(); };

// ---------- mixer ----------
let mixSel = [];
function openMixer() {
  const have = Object.keys(save.delivered).map(Number).filter((z) => CONTENT[z]).sort((a, b) => a - b);
  if (have.length < 2) { sfx.fizzle(); ui.caption('The mixer needs two elements and you own one. Finish your experiments to earn a second.'); L.setView('mix'); return; }
  sfx.click();
  mixSel = [];
  const g = $('mixGrid');
  g.innerHTML = '';
  have.forEach((z) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = SYMBOLS[z - 1];
    b.style.setProperty('--c', CAT_COLORS[CONTENT[z].cat]);
    b.setAttribute('aria-label', NAMES[z - 1]);
    b.onclick = () => {
      const i = mixSel.indexOf(z);
      if (i >= 0) mixSel.splice(i, 1); else { if (mixSel.length === 2) mixSel.shift(); mixSel.push(z); }
      sfx.tap(); refreshMixer();
    };
    b.dataset.z = z;
    g.appendChild(b);
  });
  refreshMixer();
  $('mixPanel').hidden = false;
}
function refreshMixer() {
  [...$('mixGrid').children].forEach((b) => b.classList.toggle('sel', mixSel.includes(+b.dataset.z)));
  ['slotA', 'slotB'].forEach((id, i) => {
    const s = $(id), z = mixSel[i];
    s.classList.toggle('full', !!z);
    s.textContent = z ? SYMBOLS[z - 1] : '?';
    if (z) s.style.setProperty('--c', CAT_COLORS[CONTENT[z].cat]);
  });
  $('mixGo').disabled = mixSel.length !== 2;
  const found = Object.keys(save.mixes);
  $('mixCount').textContent = `Compounds discovered: ${found.length} of ${MIX_TOTAL}`;
  $('mixFound').innerHTML = found.map((k) => `<span>${MIXES[k] ? MIXES[k].name + ' ' + MIXES[k].formula : k}</span>`).join('');
}
$('mixCancel').onclick = () => { $('mixPanel').hidden = true; sfx.click(); };
$('mixGo').onclick = async () => {
  if (mixSel.length !== 2 || busy) return;
  const [a, b] = mixSel, my = session;
  $('mixPanel').hidden = true;
  busy = true; refreshHud();
  ui.caption(`${NAMES[a - 1]} plus ${NAMES[b - 1]}. What could possibly go wrong.`);
  const res = mixResult(a, b);
  await X.mix(a, b, res);
  if (my !== session) return;
  if (res.key) {
    ui.caption(`${res.name} (${res.formula}). ${res.text}`);
    if (!save.mixes[res.key]) {
      save.mixes[res.key] = true; persist();
      toast(`New compound: ${res.name} ${res.formula} · ${Object.keys(save.mixes).length}/${MIX_TOTAL}`, 3400);
      sfx.ding();
    }
  } else ui.caption(res.text);
  busy = false; refreshHud();
};

// ---------- menu ----------
$('btnPlay').onclick = () => { initAudio(); sfx.ding(); show('table'); };
$('btnMenu').onclick = () => { sfx.click(); show('menu'); };
$('btnReset').onclick = () => { sfx.click(); $('confirm').hidden = false; };
$('confirmNo').onclick = () => { $('confirm').hidden = true; sfx.click(); };
$('confirmYes').onclick = () => {
  const muted = save.muted;
  save = fresh(); save.muted = muted; persist();
  $('confirm').hidden = true;
  toast('Progress reset. Hydrogen is back in the mail.');
  sfx.pop();
};

// ---------- pointer: drag to look around, tap to use things ----------
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'lab') return;
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 10) drag.moved = true;
  if (drag.moved) {
    L.rig.yaw = Math.max(-1.1, Math.min(1.1, L.rig.yaw + dx * 0.004));
    L.rig.pitch = Math.max(-0.5, Math.min(0.6, L.rig.pitch + dy * 0.004));
  }
});
const endDrag = (e) => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.moved || performance.now() - d.t > 500) return;
  const r = canvas.getBoundingClientRect();
  const id = L.pick(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  if (!id) return;
  if (id === 'door' || id === 'pkg') resolveTap(id);
  else useStation(id);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => { drag = null; });

// iPad Safari: stop pinch-zoom and double-tap zoom from hijacking the game
['gesturestart', 'gesturechange', 'dblclick'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

// ---------- boot + loop ----------
let pixelCap = Math.min(window.devicePixelRatio || 1, 2);
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  L.resize(w, h, pixelCap);
  L.setLift(state === 'lab' ? (w < h ? 0.07 : 0.13) : 0);
  if (state === 'table') sizeTable();
}
const markerPos = { door: null, pkg: null };
function placeMarker() {
  if (!pendingTap) return;
  let p;
  if (pendingTap.kind === 'door') p = L.project(L.doorHandle);
  else { markerPos.pkg = L.pack.group.position.clone(); markerPos.pkg.y += 0.5; p = L.project(markerPos.pkg); }
  const m = $('marker');
  if (p) { m.style.left = p[0] + 'px'; m.style.top = p[1] + 'px'; }
}

function boot() {
  L = buildLab(canvas);
  X = createExperiments(L, ui);
  buildTable(); buildDock(); refreshSound();
  resize();
  window.addEventListener('resize', resize);
  L.setView('menu', true);
  show('menu');
  window.__lab = { maxDt: 0.1, speed: 1, L, X, save: () => save, useStation, enterLab, resolveTap, state: () => ({ state, busy, phase, current }) };

  let last = performance.now(), t = 0, slow = 0, frames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(raw, window.__lab.maxDt) * window.__lab.speed;
    if (state === 'table' || document.hidden) return;
    t += dt;
    updateTweens(dt);
    L.update(dt, t);
    L.render();
    placeMarker();
    // If the device is struggling, trade sharpness, then glow, for frame rate.
    frames++;
    if (frames > 30) {
      slow = raw > 0.045 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 45) {
        slow = 0;
        if (pixelCap > 1) { pixelCap = Math.max(1, pixelCap - 0.5); resize(); }
        else if (L.quality.bloom) L.setBloom(false);
      }
    }
  }
  requestAnimationFrame((now) => { last = now; frame(now); $('loading').classList.add('gone'); });
}

try { boot(); } catch (err) {
  console.error(err);
  $('loading').innerHTML = '<span>This device could not start the 3D lab (WebGL is unavailable).</span>';
}
