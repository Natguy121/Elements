import { SUB, STOCK } from '../chem/db.js';
import { play } from '../core/audio.js';

// The Normal Mode chemical supply catalogue: search any chemical the lab knows and order it.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sub = (f) => esc(f || '').replace(/(\d+)/g, '<sub>$1</sub>');
const NO_ORDER = new Set(['Pharmaceuticals', 'Natural products and plant compounds']);

export function createSupply(G, onClose) {
  const list = Object.values(SUB).filter((s) => s.formula !== undefined || s.el)
    .filter((s) => !s.banned && s.state !== 'g' && !NO_ORDER.has(s.group) && !['soap', 'yeast', 'indicator', 'dye_blue', 'cabbage', 'phph', 'berries'].includes(s.id) || s.supply && s.state !== 'g');
  const starters = new Set(STOCK);
  const CATS = ['Starter reagents', 'All', ...[...new Set(list.map((s) => s.cat))].sort()];
  let cat = 'Starter reagents';
  $('supplyCount').textContent = list.length.toLocaleString() + ' chemicals';
  $('supplyCats').innerHTML = CATS.map((c) => `<button type="button" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  function render() {
    const q = $('supplySearch').value.trim().toLowerCase();
    const shown = list.filter((s) => (q ? (s.name.toLowerCase().includes(q) || (s.formula || '').toLowerCase().includes(q) || (s.aka || []).some((a) => a.toLowerCase().includes(q))) : cat === 'All' || (cat === 'Starter reagents' ? starters.has(s.id) || s.supply : s.cat === cat)))
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 300);
    document.querySelectorAll('#supplyCats button').forEach((b) => b.classList.toggle('on', !q && b.dataset.c === cat));
    $('supplyList').innerHTML = shown.map((s) => `<button type="button" class="supply-item" data-id="${s.id}"><i style="background:${s.color || '#ddd'}"></i><span>${esc(s.name)}<small>${sub(s.display || s.formula || s.el || '')}</small></span></button>`).join('') || '<p style="color:var(--mute)">Nothing matches. Gases, medicines and dangerous chemicals cannot be ordered.</p>';
  }
  function order(id) {
    const s = SUB[id], M = G.matter, at = G.deliverySpot;
    const liquid = s.state === 'l' || s.acid || s.id === 'ammonium_hydroxide';
    const type = liquid ? 'bottle' : 'jar';
    const it = M.makeVessel(type, { label: s.name.replace(/\s*\(.*?\)/g, ''), formula: (s.display || s.formula || s.el || '') + (s.acid && !s.acid.pKa ? ' 1 M' : ''), tags: [...(s.tags || [])], accent: s.color });
    if (s.acid && !/C/.test(s.formula || '') || s.id === 'ammonium_hydroxide' || s.id === 'hcl') { M.fill(it, 'water', 26); M.fill(it, id, 0.5); }
    else if (liquid) M.fill(it, id, Math.min(3, 150 * (s.density || 1) / s.M));
    else M.fill(it, id, Math.min(1, 120 / s.M));
    const n = [...M.items].filter((x) => x.ordered && !x.dead && Math.hypot(x.body.position.x - at.x, x.body.position.z - at.z) < 0.5).length;
    M.place(it, at.x + ((n % 3) - 1) * 0.13, at.y, at.z + (Math.floor(n / 3) % 3 - 1) * 0.16);
    it.info = s; it.ordered = true;
    play('ding'); G.hud.toast('Ordered', `${s.name} is on the cart under the supply terminal.`);
  }
  $('supplySearch').oninput = render;
  $('supplySearch').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); };
  $('supplySearch').onkeyup = (e) => e.stopPropagation();
  $('supplyCats').onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) { cat = b.dataset.c; $('supplySearch').value = ''; play('ui'); render(); } };
  $('supplyList').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) order(b.dataset.id); };
  $('supplyClose').onclick = () => close();
  function open() { render(); $('supply').hidden = false; setTimeout(() => $('supplySearch').focus(), 30); }
  function close() { $('supply').hidden = true; onClose(); }
  return { open, close, order, get isOpen() { return !$('supply').hidden; } };
}
