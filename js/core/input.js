// Keyboard, mouse (pointer lock) and touch, folded into one state the game reads each frame.
// If pointer lock is unavailable (phones, tablets, some embedded viewers) the game switches to
// "tap mode": drag to look, tap an object to grab or drop it, on-screen buttons for the rest.

export function createInput(canvas, ui) {
  const keys = new Set(), pressed = new Set();
  const st = {
    lookX: 0, lookY: 0, wheel: 0, lmb: false, rmb: false, lDown: false, lUp: false, rDown: false,
    locked: false, tap: null, mode: 'lock', moveX: 0, moveZ: 0, enabled: false, sens: 1,
  };
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch) st.mode = 'tap';

  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
    if (st.enabled && ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'KeyF', 'Slash', 'Quote'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); st.lmb = st.rmb = false; });

  // ----- pointer lock (desktop) -----
  function lock() {
    if (st.mode !== 'lock') return;
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { st.mode = 'tap'; ui.onMode('tap'); }); } catch (e) { st.mode = 'tap'; ui.onMode('tap'); }
  }
  let skipMove = 0;
  document.addEventListener('pointerlockchange', () => { st.locked = document.pointerLockElement === canvas; skipMove = 2; ui.onLock(st.locked); if (!st.locked) st.lmb = st.rmb = false; });
  document.addEventListener('pointerlockerror', () => { st.mode = 'tap'; ui.onMode('tap'); });
  document.addEventListener('mousemove', (e) => {
    if (!st.locked) return;
    if (skipMove > 0) { skipMove--; return; } // browsers report a bogus jump right after locking
    st.lookX += Math.max(-160, Math.min(160, e.movementX)); st.lookY += Math.max(-160, Math.min(160, e.movementY));
  });
  canvas.addEventListener('mousedown', (e) => {
    if (st.mode !== 'lock' || !st.enabled) return;
    if (!st.locked) { lock(); return; }
    if (e.button === 0) { st.lmb = true; st.lDown = true; }
    if (e.button === 2) { st.rmb = true; st.rDown = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (st.mode !== 'lock') return;
    if (e.button === 0) { if (st.lmb) st.lUp = true; st.lmb = false; }
    if (e.button === 2) st.rmb = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { if (st.enabled) { st.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });

  // ----- tap mode (touch, or mouse without pointer lock) -----
  let joy = null, look = null;
  const joyEl = document.getElementById('joy');
  canvas.addEventListener('pointerdown', (e) => {
    if (st.mode !== 'tap' || !st.enabled) return;
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch' && !joy && e.clientX < innerWidth * 0.4 && e.clientY > innerHeight * 0.35) {
      joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; joyEl.firstElementChild.style.transform = ''; joyEl.hidden = false;
      return;
    }
    if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (st.mode !== 'tap') return;
    if (joy && e.pointerId === joy.id) {
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      const len = Math.hypot(dx, dy), max = 56;
      if (len > max) { dx *= max / len; dy *= max / len; }
      st.moveX = dx / max; st.moveZ = dy / max;
      joyEl.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
      return;
    }
    if (look && e.pointerId === look.id) {
      st.lookX += (e.clientX - look.x) * 2.2; st.lookY += (e.clientY - look.y) * 2.2;
      look.x = e.clientX; look.y = e.clientY;
      if (Math.abs(e.clientX - look.sx) + Math.abs(e.clientY - look.sy) > 10) look.moved = true;
    }
  });
  const end = (e) => {
    if (joy && e.pointerId === joy.id) { joy = null; st.moveX = st.moveZ = 0; joyEl.hidden = true; return; }
    if (look && e.pointerId === look.id) {
      if (!look.moved && performance.now() - look.t < 450) {
        const r = canvas.getBoundingClientRect();
        st.tap = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
      }
      look = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // on-screen buttons: data-hold="KeyX" behaves like holding a key, data-press like tapping it
  document.querySelectorAll('[data-hold]').forEach((b) => {
    const code = b.dataset.hold;
    const down = (e) => { e.preventDefault(); if (code === 'RMB') { st.rmb = true; st.rDown = true; } else { if (!keys.has(code)) pressed.add(code); keys.add(code); } b.classList.add('on'); };
    const up = (e) => { e.preventDefault(); if (code === 'RMB') st.rmb = false; else keys.delete(code); b.classList.remove('on'); };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  });
  document.querySelectorAll('[data-press]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); pressed.add(b.dataset.press); if (b.dataset.press === 'WheelUp') st.wheel -= 2; if (b.dataset.press === 'WheelDown') st.wheel += 2; }));

  return {
    st, keys, touch, lock,
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    down: (c) => keys.has(c),
    hit: (c) => pressed.has(c),
    press: (c) => pressed.add(c),
    // call at the end of every frame
    endFrame() { pressed.clear(); st.lookX = st.lookY = 0; st.wheel = 0; st.lDown = st.lUp = st.rDown = false; st.tap = null; },
  };
}
