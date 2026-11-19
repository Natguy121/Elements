import * as THREE from 'three';
import { SUB, DISC } from './chem/db.js';
import { Mixture, POWDER } from './chem/mixture.js';
import { play } from './core/audio.js';
import { buildOutdoors, KITCHEN, heightAt } from './world/outdoors.js';
import { MATS, MAT, GOALS, UNLOCKS } from './story-data.js';

// Story Mode: the game loop of leaving the lab, gathering materials outside, carrying them back,
// storing them and finding out what they make. Normal Mode never touches any of this.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const storyDefaults = () => ({ found: {}, log: [], notes: '', mats: {}, goals: {}, unlocked: {}, store: {}, loose: [], els: [], days: 1, started: false });
const ZONE_TIPS = {
  lab: ['Science lab', 'The storage room is through the door on the east wall. Store samples in the labelled jars so they are kept.'],
  stream: ['The stream', 'Dip an open container in for water. Gold flakes sometimes glint in the stream bed.'],
  lake: ['The lake', 'Dig sand on the beach with the trowel (7). Berries and limestone on the far shore.'],
  rocks: ['Red rocks', 'Rusty iron ore. Break samples off with the rock pick (6).'],
  cave: ['The cave', 'Dark in here: F turns your torch on. Coal, sulfur, rock salt and quartz.'],
  crater: ['The crater', 'Something heavy fell here a very long time ago.'],
};

export function createStory(G, d) {
  const { save, persist, hud, player } = d;
  let world = null;
  const M = () => G.matter;
  const prog = () => (G.story ? G.prog : save.story);

  function ensureWorld() {
    if (world) return world;
    world = buildOutdoors(G);
    for (const f of world.fixtures) { f.off = () => !G.story; G.fixtures.push(f); }
    return world;
  }

  // ---------- materials ----------
  function addEl(sym) {
    if (!sym || G.have.has(sym)) return;
    G.have.add(sym); prog().els.push(sym);
  }
  function foundMat(id, where) {
    const mt = MAT[id], p = prog();
    if (!mt) return;
    addEl(SUB[mt.sub] && SUB[mt.sub].el);
    if (p.mats[id]) return;
    p.mats[id] = { t: Date.now() };
    hud.banner({ id: 'mat_' + id, name: mt.name, cat: 'Materials', formula: SUB[mt.sub].formula, fact: mt.desc, eyebrow: 'Material collected' });
    log(`Collected: ${mt.name}${where ? ' (' + where + ')' : ''}.`);
    persist();
  }
  function log(text) { const p = prog(); p.log.push({ t: Date.now(), text }); if (p.log.length > 120) p.log.shift(); }
  function onGrab(it) {
    if (!G.story) return;
    if (it.matId) { foundMat(it.matId); it.taken = true; }
  }

  // ---------- the kitchen at home ----------
  function stockKitchen() {
    const m = M();
    for (const it of [...m.items]) if (it.kitchen && world.zoneAt(it.body.position) === 'house') m.remove(it);
    for (const k of KITCHEN) {
      const s = SUB[k.sub];
      const it = m.makeVessel(k.type, { label: k.label, formula: k.formula, tags: [...(SUB[k.mat === 'vinegar' ? 'acetic_acid' : k.sub].tags || [])] });
      m.fill(it, k.sub, k.mol);
      if (k.extra) for (const [id, mol] of k.extra) m.fill(it, id, mol);
      m.place(it, k.at[0], 0.9, k.at[1], -Math.PI / 2);
      it.info = s; it.matId = k.mat; it.kitchen = k.key;
    }
  }

  // ---------- storage: what you bring back is kept ----------
  let lastSaved = '';
  function serialize() {
    const store = {}, loose = [];
    let any = false;
    for (const it of M().items) {
      if (it.dead) continue;
      if (it.store && !it.mix.isEmpty()) {
        store[it.store] = { n: { ...it.mix.n }, surf: { ...it.mix.surf }, piece: { ...it.pieceMol }, shape: { ...it.pieceShape } };
        any = true;
      } else if (it.kind === 'lump' && !it.held && loose.length < 40) {
        const z = world.zoneAt(it.body.position);
        if (z === 'lab' || z === 'store') { const b = it.body.position; loose.push({ n: { ...it.mix.n }, surf: { ...it.mix.surf }, sub: it.sub, shape: it.shape, name: it.name, mat: it.matId || null, x: +b.x.toFixed(3), y: +b.y.toFixed(3), z: +b.z.toFixed(3) }); }
      }
    }
    const p = prog();
    p.store = store; p.loose = loose;
    const key = JSON.stringify([store, loose]);
    if (key !== lastSaved) { lastSaved = key; persist(); }
    return any;
  }
  function restoreLoose() {
    const m = M();
    for (const r of prog().loose || []) {
      const ids = Object.keys(r.n).filter((id) => SUB[id]);
      if (!ids.length || !SUB[r.sub]) continue;
      const l = m.makeLump(r.sub, r.n[r.sub] || 1e-4, { shape: r.shape, name: r.name, surf: r.surf[r.sub] });
      l.mix.n = {}; l.mix.surf = {};
      for (const id of ids) l.mix.add(id, r.n[id], 20, r.surf[id]);
      l.dirty = true; if (r.mat) { l.matId = r.mat; l.taken = true; }
      m.place(l, r.x, r.y + 0.02, r.z);
    }
  }

  // ---------- water ----------
  function fillVessel(it, where, maxL = Infinity) {
    const a = it.mix.analyse(), room = Math.min(it.def.cap * 0.85, maxL) - a.total;
    if (room <= 0.002) return false;
    it.mix.add('water', room * 1000 / 18.015, 14);
    it.dirty = true; it.changed = G.time;
    foundMat('water', where);
    return true;
  }
  G.hooks.fillWater = (where) => {
    const it = G.grab.item;
    if (!it || it.kind !== 'vessel') { hud.toast('Water', 'Pick up a container first (a beaker, a bottle or a bucket).'); return; }
    if (fillVessel(it, where)) play('splash', it.body.position, 0.6); else hud.toast('Water', 'It is already full.');
  };
  let dipT = 0;
  function autoDip(dt) {
    dipT -= dt;
    const it = G.grab.item;
    if (dipT > 0 || !it || it.kind !== 'vessel' || it.up.y < 0.3) return;
    const wl = world.waterLevelAt(it.base.x, it.base.z);
    if (wl === null || it.base.y + it.up.y * it.def.H * 0.6 > wl) return;
    dipT = 0.4;
    if (fillVessel(it, world.zoneAt(it.base) === 'lake' ? 'the lake' : 'the stream')) play('splash', it.body.position, 0.4);
  }

  // ---------- what can be done to the world from where you stand ----------
  // water to dip into, sand to dig, and rock deposits are looked up here so the HUD can name them
  function lookAt(o, dir, hit, maxD = 3) {
    if (!G.story || !world) return null;
    if (hit && hit.body.deposit && hit.distance < 2.8) return { deposit: hit.body.deposit, dist: hit.distance };
    const limit = hit ? Math.min(maxD, hit.distance + 0.02) : maxD;
    for (let t = 0.3; t <= limit; t += 0.08) {
      const x = o.x + dir.x * t, y = o.y + dir.y * t, z = o.z + dir.z * t;
      const wl = world.waterLevelAt(x, z);
      if (wl !== null && y <= wl + 0.02) return { water: world.zoneAt({ x, z }) === 'lake' ? 'Lake' : 'Stream', dist: t, point: V(x, y, z) };
      if (y <= world.groundAt(x, z) + 0.02) { const dg = world.digAt(x, z); return dg ? { dig: dg, dist: t, point: V(x, y, z) } : null; }
    }
    if (hit && hit.body.tag === 'ground') { const p = hit.hitPointWorld, dg = world.digAt(p.x, p.z); if (dg) return { dig: dg, dist: hit.distance, point: V(p.x, p.y, p.z) }; }
    return null;
  }

  // the rock pick: break samples off deposits, crush loose lumps (or the lumps in a container) to powder
  let pickT = 0;
  function chips(pos, color, n = 7) { for (let i = 0; i < n; i++) G.P.emit({ pos: pos.clone(), vel: V((Math.random() - 0.5) * 2, Math.random() * 2.2, (Math.random() - 0.5) * 2), life: 0.5, size: 0.025, size1: 0.01, color, alpha: 0.9, tex: 'smoke', gravity: 6 }); }
  function pick(tg, inHand) {
    if (G.time - pickT < 0.42) return;
    pickT = G.time;
    const lk = inHand ? null : tg.story, it = inHand || (tg.best && tg.best.item);
    if (lk && lk.deposit && (!it || lk.dist < tg.best.dist)) {
      const dp = lk.deposit, at = G.player.pos.clone().addScaledVector(G.player.dir, lk.dist - 0.05);
      play('chip', at, 0.9); chips(at, new THREE.Color(dp.base).getHex());
      G.hooks.shake(0.06);
      if (dp.left <= 0) { hud.toast(dp.name, 'Picked clean for now. It regrows over a few minutes, or sleep at home.'); return; }
      if (++dp.hits < dp.hard) return;
      dp.hits = 0; dp.left--;
      const mt = MAT[dp.mat];
      const l = M().makeLump(dp.sub, dp.mol * (0.8 + Math.random() * 0.4), { name: mt.name.replace(/ \(.*\)/, '') + ' sample' });
      l.matId = dp.mat;
      const back = at.clone().addScaledVector(G.player.dir, -0.25);
      l.body.position.set(back.x, Math.max(back.y, world.groundAt(back.x, back.z) + 0.15), back.z);
      l.body.velocity.set(-G.player.dir.x * 1.2, 1.4, -G.player.dir.z * 1.2);
      play('clink', at, 0.5);
      return;
    }
    if (!it) { hud.toast('Rock pick', 'Strike rock outcrops to break off samples, or crush a loose lump to powder.'); return; }
    if (it.kind === 'lump') {
      const s = SUB[it.mix.dominant() || it.sub];
      if (s.look === 'metal') { play('metal', it.body.position, 0.6); hud.toast('Rock pick', `${s.name} is a metal: it dents and bends instead of shattering.`); return; }
      const p = V(it.body.position.x, it.body.position.y, it.body.position.z), mix = new Mixture(it.mix.T);
      for (const id of it.mix.ids()) mix.add(id, it.mix.n[id], it.mix.T, SUB[id].state === 's' ? POWDER : undefined);
      play('chip', p, 0.8); chips(p, new THREE.Color(s.color).getHex(), 10);
      if (it.matId) foundMat(it.matId);
      if (it.held) G.grab.release(false);
      hud.toast('Crushed', it.sub === 'berries' ? 'Purple berry mash. Scoop it into water (spatula or trowel) for a natural pH indicator.' : `${it.name} crushed to powder. Scoop it up with the spatula or trowel.`);
      it.netCrushed = true; M().remove(it);
      M().emitParcel(mix, p.add(V(0, 0.03, 0)), V(0, -0.2, 0));
      return;
    }
    if (it.kind === 'vessel') {
      let n = 0;
      for (const id of it.mix.ids()) if (it.mix.isChunk(id) && SUB[id].look !== 'metal') { it.mix.surf[id] = POWDER; delete it.pieceMol[id]; n++; }
      if (!n) { hud.toast('Rock pick', 'Nothing in there to crush. Metals bend instead of breaking.'); return; }
      it.dirty = true; it.changed = G.time; play('chip', it.body.position, 0.7);
      hud.toast('Crushed', `Ground the pieces in the ${it.name.toLowerCase()} to powder. Powders react much faster.`);
      return;
    }
    hud.toast('Rock pick', 'That will not break into anything useful.');
  }
  // the trowel scoops sand from sandy ground, or loose powder from a pile or container
  function dig(tg, load) {
    const lk = tg.story;
    if (load.massG() > 55) { hud.toast('Trowel', 'The trowel is full. Right button tips it out (into a jar or bucket).'); return; }
    if (lk && lk.dig && (!tg.best || lk.dist < tg.best.dist)) {
      load.add(lk.dig.sub, 20 / SUB[lk.dig.sub].M, 18, POWDER);
      play('scoop'); chips(lk.point, 0xc4b48a, 6);
      foundMat(lk.dig.mat, lk.dig.name.toLowerCase());
      return true;
    }
    const it = tg.best && tg.best.item, holder = it && it.mix && it.kind === 'vessel' ? it : tg.puddle;
    if (!holder) { hud.toast('Trowel', 'Dig where the ground is sandy (the lake beach, the stream banks), or scoop a pile of powder.'); return; }
    const m = holder.mix.takePowder(20);
    if (m.isEmpty()) { hud.toast('Trowel', 'Nothing loose to scoop here.'); return; }
    load.merge(m); holder.dirty = true; holder.changed = G.time; play('scoop');
    return true;
  }

  // ---------- goals and unlocks ----------
  let gasMade = false;
  G.hooks.reacted = (rx) => {
    if (!G.story) return;
    if (!gasMade && rx.outputs.some((o) => SUB[o.id].state === 'g')) gasMade = true;
    // a pure element made from an ore (smelted copper or iron) goes on your periodic table
    for (const o of rx.outputs) {
      const s = SUB[o.id];
      if (!s.el || G.have.has(s.el)) continue;
      addEl(s.el);
      hud.banner({ id: 'el_' + s.el, name: s.name, cat: 'Elements', formula: s.el, fact: s.fact, eyebrow: 'Element obtained' });
      log(`Element obtained: ${s.name} (${s.el}), made by ${rx.name.toLowerCase()}.`);
      persist();
    }
  };
  const has = (...ids) => ids.some((id) => prog().found[id]);
  const CHECK = {
    outside: (z) => z !== 'house',
    lab: (z) => z === 'lab' || z === 'store',
    collect: () => Object.keys(prog().mats).length > 0,
    store: () => Object.keys(prog().store).length > 0,
    water: () => !!prog().mats.water,
    fizz: () => gasMade,
    burn: () => Object.keys(prog().found).some((id) => DISC[id] && DISC[id].kind === 'Combustion'),
    ph: () => has('obs_berry', 'obs_cabbage'),
    metal: () => has('rx_cu_smelt', 'rx_fe_smelt'),
    gold: () => !!prog().mats.gold,
    lime: () => has('rx_lime'),
    glass: () => has('rx_glass'),
    all: () => MATS.every((m) => prog().mats[m.id]),
  };
  const nDisc = () => Object.keys(prog().found).length;
  function checkGoals(zone) {
    const p = prog();
    for (const g of GOALS) {
      if (p.goals[g.id] || !CHECK[g.id](zone)) continue;
      p.goals[g.id] = Date.now();
      play('ding'); hud.toast('Goal complete', g.t);
      log('Goal complete: ' + g.t + '.');
      persist(); hud.renderGuide();
    }
    const n = nDisc();
    for (const u of UNLOCKS) {
      if (p.unlocked[u.id] || n < u.at) continue;
      p.unlocked[u.id] = Date.now();
      hud.banner({ id: 'unlock_' + u.id, name: u.t, cat: 'Unlocked', fact: u.d, eyebrow: `Unlocked · ${n} discoveries`, rarity: 'uncommon' });
      log('Unlocked: ' + u.t + '.');
      persist(); hud.renderGuide();
    }
  }

  // ---------- sleeping ----------
  let sleeping = false;
  G.hooks.sleep = () => {
    if (sleeping || G.netGuest) return;
    sleeping = true;
    const fx = document.getElementById('fxSleep');
    fx.classList.add('on'); play('heal');
    setTimeout(() => {
      world.regrow(); stockKitchen();
      player.health = 100; player.stamina = 1;
      const p = prog(); p.days = (p.days || 1) + 1;
      log(`Day ${p.days}. Slept at home.`);
      serialize(); persist();
      setTimeout(() => { fx.classList.remove('on'); sleeping = false; hud.toast('Morning', `Day ${p.days}. The forest has regrown and the kitchen is restocked.`); }, 700);
    }, 1100);
  };

  // ---------- start and stop ----------
  let zoneLast = '', seen = new Set(), saveT = 0, goalT = 0;
  function start(o = {}) {
    ensureWorld();
    // a guest plays in the host's world: their own save is not touched
    const p = o.guest ? storyDefaults() : save.story;
    G.netGuest = !!o.guest;
    G.story = true; G.prog = p; G.unlocked = p.unlocked;
    G.have = new Set(p.els);
    G.waterAt = world.waterLevelAt; G.groundAt = world.groundAt;
    gasMade = false; seen = new Set(); zoneLast = '';
    world.show(true);
    d.lab.setStory(true);
    if (!o.guest) { d.lab.populateStory(p.store); restoreLoose(); stockKitchen(); world.spawnAll(); }
    const s = world.startPos;
    player.teleport(s.x, 0.35, s.z); player.yaw = s.yaw; player.pitch = -0.05;
    lastSaved = JSON.stringify([p.store, p.loose]);
    if (o.guest) hud.toast('Story Mode', 'You are in the host\'s world. Press H for goals.');
    else if (!p.started) {
      p.started = true; persist();
      setTimeout(() => hud.toast('Story Mode', 'Morning. The science lab is up the path to the north. Take what you can carry from the kitchen.'), 600);
      setTimeout(() => hud.toast('Goals', 'Press H for your goals. Tools 6 and 7 are the rock pick and the trowel.'), 4200);
    } else hud.toast('Story Mode', `Day ${p.days || 1}. Press H for your goals.`);
  }
  function stop() {
    if (G.story && !G.netGuest) serialize();
    G.netGuest = false;
    G.story = false; G.prog = save; G.unlocked = {};
    G.waterAt = null; G.groundAt = null;
    if (world) world.show(false);
    d.lab.setStory(false);
  }
  function update(dt) {
    if (!G.story || !world) return;
    world.update(dt, G.time);
    autoDip(dt);
    const z = world.zoneAt(G.player.pos);
    if (z !== zoneLast) {
      zoneLast = z;
      if (ZONE_TIPS[z] && !seen.has(z)) { seen.add(z); hud.toast(...ZONE_TIPS[z]); }
    }
    saveT -= dt; if (saveT <= 0 && !G.netGuest) { saveT = 2; serialize(); }
    goalT -= dt; if (goalT <= 0) { goalT = 0.5; checkGoals(z); }
  }
  // wipe only the story save
  function wipe() { save.story = storyDefaults(); }

  return { start, stop, update, onGrab, foundMat, lookAt, pick, dig, serialize, wipe, addEl, get world() { return world; }, zone: () => zoneLast };
}
