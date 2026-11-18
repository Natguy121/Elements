import { SUB, DISC, DISC_LIST } from '../chem/db.js';
import { ELEMENTS } from '../chem/formula.js';
import { blockColor } from '../world/textures.js';
import { play, setVolume } from '../core/audio.js';
import { MATS, GOALS, UNLOCKS } from '../story-data.js';

// Everything drawn in HTML on top of the 3D view: crosshair, prompts, readouts, discovery banners,
// the Discovery Book with its periodic table and notebook, and the pause/settings panel.

const $ = (id) => document.getElementById(id);
const CATS = ['Elements', 'Molecules', 'Compounds', 'Gases', 'Acids & Bases', 'Salts', 'Oxides', 'Complexes', 'Organic compounds', 'Food & Life', 'Medicines', 'Natural products', 'Minerals', 'Pigments & Dyes', 'Metals & Alloys', 'Glass & Ceramics', 'Materials', 'Fireworks & Light', 'Inventions', 'Reactions', 'Observations', 'Mystery Mixtures', 'Secrets'];
export const TOOLS = [
  { id: 'tongs', key: '1', name: 'Tongs' }, { id: 'spatula', key: '2', name: 'Spatula' }, { id: 'pipette', key: '3', name: 'Pipette' },
  { id: 'thermo', key: '4', name: 'Thermometer' }, { id: 'ext', key: '5', name: 'Extinguisher' },
  { id: 'pick', key: '6', name: 'Rock pick', story: true }, { id: 'trowel', key: '7', name: 'Trowel', story: true },
];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtG = (g) => (g >= 1000 ? (g / 1000).toFixed(2) + ' kg' : g >= 10 ? g.toFixed(0) + ' g' : g.toFixed(2) + ' g');
const sub2 = (f) => (f || '').replace(/(\d+)/g, '<sub>$1</sub>');

export function createHud(G) {
  // ---------- toasts and banners ----------
  function toast(title, text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 4200);
  }
  const queue = [];
  let bannerT = 0;
  function banner(d, extra) { queue.push({ d, extra }); if (guideOn && !G.story) { renderGuide(); const g = GUIDE[gi]; if (g && g.d === d.id) setTimeout(() => { gi = (gi + 1) % GUIDE.length; renderGuide(); }, 6000); } }
  function showBanner({ d, extra }) {
    const rare = d.rarity === 'rare' || d.rarity === 'uncommon';
    $('banner').className = 'banner' + (d.rarity === 'rare' ? ' rare' : '');
    $('bannerKind').textContent = d.eyebrow || (d.cat === 'Observations' ? 'Observation' : d.rarity === 'rare' ? 'Rare discovery' : 'New discovery') + (d.kind ? ' · ' + d.kind : '');
    $('bannerName').textContent = extra || d.name;
    $('bannerFormula').innerHTML = d.eq ? esc(d.eq) : d.formula ? sub2(esc(d.formula)) : esc(d.cat);
    $('bannerFact').textContent = d.fact || '';
    $('banner').hidden = true; void $('banner').offsetWidth; $('banner').hidden = false;
    bannerT = d.cat === 'Observations' ? 4.5 : 6.5;
    play(d.cat === 'Observations' ? 'note' : 'discovery', null, rare ? 1 : 0.8);
  }

  // ---------- small readouts ----------
  let lastTarget = '', lastPrompt = '';
  function setTarget(name, sub) {
    const key = name + '|' + sub;
    if (key === lastTarget) return;
    lastTarget = key;
    $('target').hidden = !name;
    $('targetName').textContent = name || ''; $('targetSub').textContent = sub || '';
  }
  function setPrompt(parts) { // [['LMB','grab'], ...]
    const html = parts.map(([k, t]) => `<kbd>${esc(k)}</kbd>${esc(t)}`).join('');
    if (html !== lastPrompt) { lastPrompt = html; $('prompt').innerHTML = html; }
  }
  function setCross(state) { $('cross').className = 'cross ' + state; }
  function bars(health, stamina, grip) {
    $('barHealth').style.transform = `scaleX(${Math.max(0, health / 100)})`;
    $('barHealth').style.background = health < 35 ? 'var(--danger)' : 'var(--ok)';
    $('barStamina').style.transform = `scaleX(${Math.max(0, stamina)})`;
    $('gripRow').hidden = grip === null;
    if (grip !== null) { $('barGrip').style.transform = `scaleX(${Math.min(1, grip)})`; $('barGrip').style.background = grip > 0.85 ? 'var(--danger)' : 'var(--accent)'; }
  }
  const toolBtns = {};
  TOOLS.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<kbd>${t.key}</kbd><span>${t.name}</span><span class="load"></span>`;
    b.onclick = () => G.hooks.selectTool(t.id);
    $('tools').appendChild(b);
    toolBtns[t.id] = b;
    if (t.story) b.hidden = true;
  });
  function setStory(on) {
    for (const t of TOOLS) if (t.story) toolBtns[t.id].hidden = !on;
    document.body.classList.toggle('story', on);
    $('wipeAskText').textContent = on ? 'Erase all Story Mode progress (materials, storage, discoveries, goals)?' : 'Erase every discovery and note?';
    $('btnWipe').textContent = on ? 'Restart story' : 'Erase discoveries';
    renderGuide();
  }
  function setTool(id, loadText) {
    for (const t of TOOLS) { toolBtns[t.id].classList.toggle('on', t.id === id); toolBtns[t.id].querySelector('.load').textContent = t.id === id ? loadText || '' : ''; }
  }
  let heldKey = '';
  function setHeld(it, showTemp) {
    if (!it) { if (heldKey) { heldKey = ''; $('held').hidden = true; } return; }
    const mix = it.mix, T = mix ? mix.T : 20;
    const list = mix ? mix.describe(5) : [];
    const key = it.id + '|' + list.map((l) => l.id + Math.round(l.g * 10)).join(',') + '|' + Math.round(T) + showTemp + Math.round(it.body ? it.body.mass * 1000 : 0);
    if (key === heldKey) return;
    heldKey = key;
    $('held').hidden = false;
    $('heldName').textContent = it.name;
    $('heldMass').textContent = it.body ? fmtG(it.body.mass * 1000) : '';
    $('heldList').innerHTML = it.kind === 'lump' && list.length <= 1 ? '' : list.map((l) => {
      const s = SUB[l.id], liquid = s.state === 'l';
      return `<li><span><i style="background:${s.color}"></i>${esc(l.name)}</span><span>${liquid ? (l.g / s.density).toFixed(l.g / s.density < 10 ? 1 : 0) + ' mL' : fmtG(l.g)}</span></li>`;
    }).join('') + (it.kind === 'vessel' && !list.length ? '<li><span>Empty</span><span></span></li>' : '');
    $('heldTemp').innerHTML = showTemp ? `<span class="${T > 60 ? 'hot' : ''}">${T.toFixed(1)} °C</span>` : 'Temp: needs thermometer';
    const pH = mix && (studentOn || mix.ids().some((id) => SUB[id].indicator)) ? mix.pH() : null;
    $('heldPh').textContent = pH !== null && pH !== undefined ? 'pH ' + pH.toFixed(1) : '';
  }
  let studentOn = true;
  function setStudent(on) { if (on !== studentOn) { studentOn = on; heldKey = ''; } }
  // ---------- experiment guide (student mode) ----------
  const GUIDE = [
    { d: 'rx_soda_vinegar', t: 'Fizzing volcano', s: ['Take a beaker from the left island.', 'Pour in some baking soda (the jar on the right island).', 'Pour vinegar on top (right button to pour).', 'Add dish soap first for a bigger eruption.'], w: 'Acid + carbonate makes a salt, water and carbon dioxide gas.' },
    { d: 'obs_acid', t: 'Is it an acid?', s: ['Pour a little vinegar into an empty beaker.', 'Pick up the universal indicator dropper and tip a few drops in.', 'Red or orange means acid. Green means neutral.'], w: 'Indicators change colour with pH. Below 7 is acidic.' },
    { d: 'rx_elephant', t: 'Elephant toothpaste', s: ['Pour hydrogen peroxide into an empty flask.', 'Add a squirt of dish soap and a drop of food colouring.', 'Use the spatula (2) to add a scoop of yeast.', 'Stand back.'], w: 'Yeast is a catalyst: it speeds up peroxide splitting into water and oxygen. Soap traps the oxygen as foam.' },
    { d: 'obs_endpoint', t: 'Titration', s: ['Pour about 20 mL of hydrochloric acid (back bench) into a flask.', 'Add a few drops of phenolphthalein.', 'Add sodium hydroxide a little at a time with the pipette (3).', 'Stop when it turns pink: that is the endpoint.'], w: 'Acid + alkali gives salt + water. The indicator shows the moment the acid is used up.' },
    { d: 'obs_cabbage', t: 'Cabbage rainbow', s: ['Set out a few beakers with water.', 'Add acid to one, sodium hydroxide to another, baking soda to a third.', 'Add red cabbage juice to each and compare the colours.'], w: 'Red cabbage dye changes shape, and colour, at different pH values.' },
    { d: 'obs_cryst_cool', t: 'Grow crystals', s: ['Put a beaker of water on the hot plate and turn it to HIGH (F).', 'Stir in lots of copper sulfate until no more dissolves.', 'Move the beaker to the chiller plate and set it to COLD.', 'Press Z to speed up time and watch crystals form.'], w: 'Hot water dissolves more solid. As it cools, the extra comes out as crystals.' },
    { d: 'rx_displace', t: 'Copper-plate a nail', s: ['Make blue copper sulfate solution in a beaker of water.', 'Use tongs (1) to drop in an iron nail.', 'Press Z to speed up time. The nail turns pink-brown.'], w: 'Iron is more reactive than copper, so it pushes copper out of the solution.' },
    { d: 'rx_water_test', t: 'The test for water', s: ['Put copper sulfate crystals in a crucible on the tripod.', 'Light the burner under it (F) until the blue turns white.', 'Let it cool, then pipette (3) a few drops of water on it.'], w: 'White anhydrous copper sulfate turns blue again when water touches it.' },
    { d: 'rx_na_water', t: 'Sodium in water (careful)', s: ['Half-fill a big beaker with water.', 'Use tongs (1) to take one small piece of sodium from its jar.', 'Drop it in and step back.'], w: 'Sodium is so reactive it pulls water apart, making hydrogen and an alkali.' },
    { d: 'rx_mg_burn', t: 'Burning magnesium', s: ['Light a Bunsen burner (F).', 'With tongs (1), hold a magnesium ribbon in the flame.', 'Do not stare at the light.'], w: 'Magnesium burns with oxygen to make white magnesium oxide and a very bright light.' },
  ];
  let gi = 0, guideOn = false;
  function renderGoals(el) {
    const P = G.prog, n = Object.keys(P.found).length, open = GOALS.filter((g) => !P.goals[g.id]), done = GOALS.length - open.length;
    const next = UNLOCKS.find((u) => !P.unlocked[u.id]), nm = Object.keys(P.mats).length;
    el.innerHTML = `<div class="nav"><span>Goals ${done} / ${GOALS.length} · H to hide</span><span>${nm} / ${MATS.length} materials</span></div>
      <ul class="goals">${open.slice(0, 3).map((g, i) => `<li class="${i ? '' : 'now'}"><b>${esc(g.t)}</b><span>${esc(g.d)}</span></li>`).join('') || '<li class="now"><b>Every goal done</b><span>Keep experimenting: the Discovery Book has plenty left.</span></li>'}</ul>
      ${next ? `<p class="why">Next unlock: <b>${esc(next.t)}</b> at ${next.at} discoveries (${n} so far).</p>` : '<p class="why">All equipment unlocked.</p>'}
      ${UNLOCKS.some((u) => P.unlocked[u.id]) ? `<p class="why">Equipment: ${UNLOCKS.filter((u) => P.unlocked[u.id]).map((u) => esc(u.t)).join(', ')}.</p>` : ''}`;
  }
  function renderGuide() {
    const el = $('guide');
    el.hidden = !guideOn;
    if (!guideOn) return;
    if (G.story) { renderGoals(el); return; }
    const g = GUIDE[gi], done = !!G.prog.found[g.d];
    el.innerHTML = `<div class="nav"><button type="button" class="btn small" data-g="-1" aria-label="Previous experiment">‹</button><span>Experiment ${gi + 1} of ${GUIDE.length} · H to hide</span><button type="button" class="btn small" data-g="1" aria-label="Next experiment">›</button></div>
      <h3>${esc(g.t)}</h3>${done ? '<span class="done">Done ✓</span>' : ''}<ol>${g.s.map((x) => `<li>${esc(x)}</li>`).join('')}</ol><p class="why">${esc(g.w)}</p>`;
  }
  $('guide').addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) { gi = (gi + +b.dataset.g + GUIDE.length) % GUIDE.length; play('ui'); renderGuide(); } });
  function guide(on) { guideOn = on === undefined ? !guideOn : on; renderGuide(); }
  function inspect(info) {
    const el = $('inspect');
    if (!info) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<h3>${esc(info.name)}</h3>${info.formula ? `<span class="sym">${sub2(esc(info.formula))}</span>` : ''}
      <dl>${info.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${info.tags && info.tags.length ? `<div class="tags">${info.tags.map((t) => `<span>${esc(t.replace(/_/g, ' '))}</span>`).join('')}</div>` : ''}
      ${info.fact ? `<p>${esc(info.fact)}</p>` : ''}`;
  }

  // ---------- screen effects ----------
  function fxSet(el, a, fade) { el.style.transition = 'none'; el.style.opacity = a; void el.offsetWidth; el.style.transition = `opacity ${fade}s ease-in`; el.style.opacity = 0; }
  const flash = (a) => { if (a > 0.03) fxSet($('fxFlash'), Math.min(0.95, a * (G.settings.flash ? 1 : 0.25)), 0.5 + a * 1.5); };
  const hurt = (a) => fxSet($('fxHurt'), Math.min(1, a), 0.9);
  let glareNow = 0, blurNow = -1;
  function frame(dt, glare, blur) {
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').hidden = true; }
    else if (queue.length) showBanner(queue.shift());
    // looking at burning magnesium whites out your view, then fades as your eyes recover
    const g = Math.min(0.78, glare) * (G.settings.flash ? 1 : 0.3);
    glareNow = g > glareNow ? g : Math.max(0, glareNow - dt * 0.45);
    const fl = $('fxFlash');
    if (glareNow > 0.02 && !fl.style.transition.includes('opacity 0.') ) { fl.style.transition = 'none'; fl.style.opacity = Math.min(0.92, glareNow); }
    else if (glareNow <= 0.02 && fl.style.transition === 'none') fl.style.opacity = 0;
    const b = Math.round(Math.min(7, blur * 9));
    if (b !== blurNow) { blurNow = b; const el = $('fxBlur'); el.style.backdropFilter = el.style.webkitBackdropFilter = b ? `blur(${b}px)` : 'none'; }
  }

  // ---------- Discovery Book ----------
  let cat = 'Reactions', tab = 'disc', selEl = 1;
  const elEntries = ELEMENTS.map((e) => ({ id: 'el_' + e.sym, el: e, name: e.name, cat: 'Elements', formula: e.sym, hint: e.hint || '', fact: (Object.values(SUB).find((s) => s.el === e.sym) || {}).fact || '' }));
  const all = () => [...elEntries, ...DISC_LIST];
  const isFound = (d) => (d.el ? G.have.has(d.el.sym) : !!G.prog.found[d.id]);
  function renderBook() {
    const list = all();
    const total = list.length, got = list.filter(isFound).length;
    $('bookCount').textContent = `${got} / ${total} found · ${Math.round(got / total * 100)}%`;
    $('cats').innerHTML = CATS.map((c) => { const inC = list.filter((d) => d.cat === c); return inC.length ? `<button type="button" data-cat="${esc(c)}" class="${c === cat ? 'on' : ''}">${esc(c)}<span>${inC.filter(isFound).length}/${inC.length}</span></button>` : ''; }).join('');
    const q = $('bookSearch').value.trim().toLowerCase();
    const shown = list.filter((d) => (q ? isFound(d) && (d.name.toLowerCase().includes(q) || (d.formula || '').toLowerCase().includes(q)) : d.cat === cat));
    shown.sort((a, b) => (isFound(b) - isFound(a)) || (a.el && b.el ? a.el.z - b.el.z : 0));
    $('entries').innerHTML = shown.map((d) => {
      const f = isFound(d), rec = G.prog.found[d.id];
      if (!f) return `<article class="entry locked"><h4>${d.el ? esc(d.el.sym) + ' · ???' : '???'}</h4><p>${esc(G.settings.mode === 'discovery' ? 'Not found yet.' : d.hint || 'Not found yet.')}</p>${d.el && d.el.tier ? `<span class="who">Tier ${d.el.tier}</span>` : ''}</article>`;
      return `<article class="entry ${d.rarity === 'rare' ? 'rare' : ''}"><h4>${esc(d.name)}</h4>${d.kind ? `<span class="kind">${esc(d.kind)}</span>` : ''}${d.eq ? `<span class="f eq">${esc(d.eq)}</span>` : d.formula ? `<span class="f">${sub2(esc(d.formula))}</span>` : ''}<p>${esc(d.fact || '')}</p>
        <span class="who">${d.el ? (G.story ? 'Found as a pure sample' : 'In the store room from the start') : `Found by ${esc(rec.by)} · made ${rec.n} time${rec.n === 1 ? '' : 's'}`}</span></article>`;
    }).join('') || '<p style="color:var(--mute)">Nothing here yet.</p>';
  }
  function renderTable() {
    const w = $('pt').parentElement.clientWidth || 800;
    $('pt').style.setProperty('--c', Math.max(30, Math.min(52, Math.floor((w - 28) / 18) - 3)) + 'px');
    $('pt').innerHTML = ELEMENTS.map((e) => `<button type="button" data-z="${e.z}" class="${G.have.has(e.sym) ? 'have' : ''} ${e.z === selEl ? 'sel' : ''}" style="grid-column:${e.pos[0]};grid-row:${e.pos[1]};--bc:${blockColor(e.block)}" aria-label="${esc(e.name)}"><small>${e.z}</small>${e.sym}</button>`).join('');
    const e = ELEMENTS[selEl - 1], have = G.have.has(e.sym), s = Object.values(SUB).find((x) => x.el === e.sym);
    const val = (v, u) => (v === null || v === undefined ? 'unknown' : v + ' ' + u);
    $('ptInfo').innerHTML = have
      ? `<div class="big">${e.sym}</div><h3>${esc(e.name)}</h3>
         <dl><dt>Number</dt><dd>${e.z}</dd><dt>Mass</dt><dd>${e.mass} u</dd><dt>At 20 °C</dt><dd>${esc(e.state || 'unknown')}</dd><dt>Melts</dt><dd>${val(e.mp, '°C')}</dd><dt>Boils</dt><dd>${val(e.bp, '°C')}</dd>
         <dt>Density</dt><dd>${val(e.density, e.state === 'gas' ? 'g/L' : 'g/cm³')}</dd><dt>Family</dt><dd>${esc(e.block)}</dd><dt>Known since</dt><dd>${esc(e.year || 'unknown')}</dd>
         ${e.flame ? `<dt>Flame</dt><dd><span class="swatch" style="background:${e.flame}"></span>${e.flame}</dd>` : ''}</dl>
         ${s && s.fact ? `<p>${esc(s.fact)}</p>` : ''}<p style="color:var(--mute)">${G.story ? 'You have found this element in pure form.' : G.stocked && G.stocked.has(e.sym) ? 'On the storage shelves now.' : e.state === 'gas' ? 'Unlocked. Its gas cylinder arrives with the gas-handling update.' : 'Unlocked, but its samples arrive in a later build.'}</p>`
      : `<div class="big" style="color:#3a464c">${e.sym}</div><h3 style="color:var(--mute)">Locked</h3><span class="tier">Tier ${e.tier} · number ${e.z}</span><p>${esc(e.hint)}</p>
         <p style="color:var(--mute)">Earned by finding a source, processing it and verifying the sample. The rooms for that arrive in later builds.</p>`;
  }
  function renderNotes() {
    const save = G.prog;
    $('log').innerHTML = save.log.slice().reverse().map((l) => `<li><time>${new Date(l.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>${esc(l.text)}</li>`).join('') || '<li style="color:var(--mute);list-style:none">Nothing logged yet. Reactions are recorded here with their temperatures.</li>';
    if (document.activeElement !== $('notes')) $('notes').value = save.notes || '';
  }
  // Story Mode: every material, where it is found and how much of it is in storage
  function renderMats() {
    const P = G.prog, student = G.settings.mode !== 'discovery';
    $('matList').innerHTML = MATS.map((m) => {
      const s = SUB[m.sub], got = P.mats[m.id], st = P.store[m.id];
      const g = st ? Object.keys(st.n).reduce((a, id) => a + st.n[id] * (SUB[id] ? SUB[id].M : 0), 0) : 0;
      if (!got) return `<article class="entry locked"><h4>???</h4><p>${esc(student ? m.where : 'Not found yet.')}</p><span class="who">${esc(m.how)}</span></article>`;
      return `<article class="entry"><h4>${esc(m.name)}</h4><span class="f">${sub2(esc(s.formula || ''))}</span><p>${esc(m.desc)}</p><p class="where">${esc(m.where)}</p><span class="who">${g > 0 ? 'In storage: ' + fmtG(g) : 'Nothing in its storage jar'}</span></article>`;
    }).join('');
  }
  function showTab(t) {
    if (t === 'mats' && !G.story) t = 'disc';
    tab = t;
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    for (const k of ['disc', 'table', 'notes', 'mats']) $('tab-' + k).hidden = k !== t;
    if (t === 'disc') renderBook(); else if (t === 'table') renderTable(); else if (t === 'mats') renderMats(); else renderNotes();
    $('bookCount').hidden = false;
  }
  function openBook(t = 'disc') { $('book').hidden = false; renderBook(); showTab(t); }
  function closeBook() { $('book').hidden = true; G.hooks.resume(); }
  document.querySelectorAll('.tabs button').forEach((b) => { b.onclick = () => { play('ui'); showTab(b.dataset.tab); }; });
  $('cats').onclick = (e) => { const b = e.target.closest('button'); if (b) { cat = b.dataset.cat; $('bookSearch').value = ''; play('ui'); renderBook(); } };
  $('bookSearch').oninput = renderBook;
  $('pt').onclick = (e) => { const b = e.target.closest('button'); if (b) { selEl = +b.dataset.z; play('ui'); renderTable(); } };
  $('bookClose').onclick = closeBook;
  $('notes').oninput = () => { G.prog.notes = $('notes').value; G.persist(); };

  // ---------- pause and settings ----------
  const S = G.settings;
  function loadSettings() {
    $('setSens').value = S.sens; $('setFov').value = S.fov; $('setVol').value = S.volume; $('setQuality').value = S.quality; $('setHazard').value = String(S.hazard);
    $('setBob').checked = S.bob; $('setShake').checked = S.shake; $('setFlash').checked = S.flash; $('setVision').checked = S.labVision; $('setMode').value = S.mode || 'student';
  }
  const bind = (id, key, conv, ev = 'input') => $(id).addEventListener(ev, () => { S[key] = conv($(id)); G.hooks.applySettings(); G.persist(); });
  bind('setSens', 'sens', (e) => +e.value); bind('setFov', 'fov', (e) => +e.value); bind('setVol', 'volume', (e) => { setVolume(+e.value); return +e.value; });
  bind('setQuality', 'quality', (e) => e.value, 'change'); bind('setHazard', 'hazard', (e) => +e.value, 'change');
  bind('setMode', 'mode', (e) => e.value, 'change');
  $('setMode').addEventListener('change', () => { G.hooks.modeChanged && G.hooks.modeChanged(); guide(G.settings.mode !== 'discovery'); });
  bind('setBob', 'bob', (e) => e.checked, 'change'); bind('setShake', 'shake', (e) => e.checked, 'change'); bind('setFlash', 'flash', (e) => e.checked, 'change'); bind('setVision', 'labVision', (e) => e.checked, 'change');
  $('btnResume').onclick = () => { $('pause').hidden = true; G.hooks.resume(); };
  $('btnRestock').onclick = () => { G.hooks.restock(); $('pause').hidden = true; G.hooks.resume(); };
  $('btnTitle').onclick = () => { $('pause').hidden = true; G.hooks.title(); };
  $('btnWipe').onclick = () => { $('wipeAsk').hidden = false; };
  $('wipeNo').onclick = () => { $('wipeAsk').hidden = true; };
  $('wipeYes').onclick = () => { $('wipeAsk').hidden = true; G.hooks.wipe(); toast('Progress', 'Discoveries and notes erased.'); };
  function openPause() { loadSettings(); $('wipeAsk').hidden = true; $('pause').hidden = false; }
  $('btnHow').onclick = () => { $('how').hidden = !$('how').hidden; play('ui'); };

  return {
    toast, banner, setTarget, setStudent, setStory, guide, renderGuide, setPrompt, setCross, bars, setTool, setHeld, inspect, flash, hurt, frame, openBook, closeBook, openPause, loadSettings,
    get bookOpen() { return !$('book').hidden; }, get pauseOpen() { return !$('pause').hidden; },
    closePause() { $('pause').hidden = true; },
    show(on) { $('hud').hidden = !on; },
    downed(on) { $('downed').hidden = !on; },
    fmtG,
  };
}
