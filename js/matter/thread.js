import * as THREE from 'three';
import { SUB } from '../chem/db.js';
import { Mixture } from '../chem/mixture.js';
import { play } from '../core/audio.js';

// Crystal threads: lay one across the mouth of a beaker and the thread hangs into the solution.
// Whatever crystallises out of the solution (as it cools, or as water evaporates) grows on the
// thread instead of settling on the bottom. Lift it out to keep the crystal.
export function createThreads(G) {
  const geo = new THREE.OctahedronGeometry(1, 0);
  function vesselUnder(it) {
    const p = it.body.position;
    for (const v of G.matter.items) {
      if (v.kind !== 'vessel' || v.dead || v.up.y < 0.85 || v.held) continue;
      const rim = v.base.y + v.def.H;
      if (Math.hypot(p.x - v.base.x, p.z - v.base.z) < v.def.rimR + 0.03 && p.y > rim - 0.03 && p.y < rim + 0.09) return v;
    }
    return null;
  }
  function attach(it, v) {
    if (it.type !== 'thread') { if (v.funnel && !v.funnel.dead) return; v.funnel = it; }
    it.hang = v;
    G.phys.world.removeBody(it.body);
    play('clink', it.body.position, 0.3);
  }
  function detach(it) {
    if (it.inRack) { releaseTube(it); return; }
    if (!it.hang) return;
    if (it.hang.funnel === it) it.hang.funnel = null;
    it.hang = null;
    if (!G.phys.world.bodies.includes(it.body)) G.phys.world.addBody(it.body);
    it.body.wakeUp();
  }
  function grow(it, dt) {
    const v = it.hang, mix = v.mix;
    if (!mix.n.water) return;
    const cm = it.cmix || (it.cmix = new Mixture(20));
    let moved = 0;
    for (const id in mix.xt) {
      const free = (mix.n[id] || 0) - mix.dissolvedMol(id);
      if (free <= 1e-7) continue;
      const mol = Math.min(free, free * dt * 0.6 + 2e-6);
      mix.remove(id, mol); mix.xt[id] = true;
      cm.add(id, mol, mix.T, 0.25);
      moved += mol;
    }
    if (!moved) return;
    v.dirty = true; v.changed = G.time;
    const g = cm.massG();
    if (g > 0.3 && !it.found) { it.found = true; G.hooks.discover('obs_thread_crystal', v); }
    it.name = 'Crystal on a thread (' + (g < 10 ? g.toFixed(1) : g.toFixed(0)) + ' g)';
    it.body.mass = 0.006 + g / 1000; it.body.updateMassProperties();
    draw(it);
  }
  function draw(it) {
    const cl = it.group.userData.cluster;
    const id = it.cmix && it.cmix.dominant();
    if (!cl || !id) return;
    const s = SUB[id], vol = it.cmix.massG() / (s.density || 2) / 1e6; // m³
    const size = Math.cbrt(vol) * 0.9;
    if (!cl.children.length) {
      const mat = new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 0.15, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.88, flatShading: true });
      for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(geo, mat); m.position.set((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.8); m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); m.scale.setScalar(0.45 + Math.random() * 0.4); m.castShadow = true; cl.add(m); }
    }
    cl.scale.setScalar(Math.max(0.0015, size));
  }
  // test tubes stand in the slots of a rack, and go wherever the rack goes
  const q = new THREE.Quaternion(), lp = new THREE.Vector3();
  function slotPos(rack, i, out) { return out.set(-0.125 + i * 0.05, -0.015 + 0.004, 0).applyQuaternion(q.set(rack.body.quaternion.x, rack.body.quaternion.y, rack.body.quaternion.z, rack.body.quaternion.w)).add(lp.set(rack.body.position.x, rack.body.position.y, rack.body.position.z)); }
  const sp = new THREE.Vector3();
  function tubes(dt) {
    for (const t of G.matter.items) {
      if (t.type !== 'testtube' || t.dead) continue;
      if (t.inRack) {
        const r = t.inRack;
        if (r.dead || t.held) { releaseTube(t); continue; }
        slotPos(r, t.slot, sp);
        t.body.position.set(sp.x, sp.y + t.halfH, sp.z);
        t.body.quaternion.set(r.body.quaternion.x, r.body.quaternion.y, r.body.quaternion.z, r.body.quaternion.w);
        t.body.velocity.set(0, 0, 0); t.body.angularVelocity.set(0, 0, 0);
        G.matter.sync(t);
        continue;
      }
      if (t.held || t.body.velocity.length() > 1) continue;
      for (const r of G.matter.items) {
        if (r.type !== 'rack' || r.dead) continue;
        if (Math.hypot(t.body.position.x - r.body.position.x, t.body.position.z - r.body.position.z) > 0.25) continue;
        const used = new Set([...G.matter.items].filter((x) => x.inRack === r).map((x) => x.slot));
        let best = -1, bd = 0.035;
        for (let i = 0; i < 6; i++) { if (used.has(i)) continue; slotPos(r, i, sp); const dd = Math.hypot(t.body.position.x - sp.x, t.body.position.z - sp.z); if (dd < bd && t.body.position.y - t.halfH > sp.y - 0.03 && t.body.position.y - t.halfH < sp.y + 0.16) { bd = dd; best = i; } }
        if (best >= 0) { t.inRack = r; t.slot = best; t.hang = r; G.phys.world.removeBody(t.body); play('clink', t.body.position, 0.35); break; }
      }
    }
  }
  function releaseTube(t) {
    t.inRack = null; t.hang = null;
    if (!G.phys.world.bodies.includes(t.body)) G.phys.world.addBody(t.body);
    t.body.wakeUp();
  }
  function update(dt) {
    tubes(dt);
    for (const it of G.matter.items) {
      if ((it.type !== 'thread' && it.type !== 'funnel' && it.type !== 'filterfunnel') || it.dead) continue;
      if (it.hang) {
        const v = it.hang;
        if (v.dead || v.up.y < 0.7 || it.held) { detach(it); continue; }
        // rest the pencil across the rim, thread hanging straight down
        it.body.position.set(v.base.x, v.base.y + v.def.H + (it.type === 'thread' ? 0.006 : 0.05), v.base.z);
        it.body.velocity.set(0, 0, 0); it.body.angularVelocity.set(0, 0, 0);
        it.body.quaternion.setFromEuler(0, it.yaw ?? 0, 0);
        G.matter.sync(it);
        if (it.type === 'thread') grow(it, dt * (G.timeScale || 1));
      } else if (!it.held && it.body.velocity.length() < 0.6) {
        const v = vesselUnder(it);
        if (v && v.def.H > 0.05) { it.yaw = Math.atan2(it.body.quaternion.y, it.body.quaternion.w) * 2; attach(it, v); }
      }
    }
  }
  // filter paper: undissolved solids stay behind, the solution runs through
  G.hooks.filter = (fn, mix) => {
    const res = fn.cmix || (fn.cmix = new Mixture(20));
    const water = mix.grams('water');
    for (const id of mix.ids()) {
      const s = SUB[id];
      if (s.state !== 's') continue;
      const keep = (mix.n[id] || 0) - (water > 0 ? Math.min(mix.n[id], s.sol ? (s.sol / 100) * water / s.M : 0) : 0);
      if (keep > 1e-9) { res.add(id, keep, mix.T, mix.surfOf(id)); mix.remove(id, keep); }
    }
    showResidue(fn);
    if (res.massG() > 0.2 && !fn.found) { fn.found = true; G.hooks.discover('obs_filtration', fn.hang); }
  };
  function showResidue(fn) {
    const r = fn.group.userData.residue, id = fn.cmix && fn.cmix.dominant();
    if (!r) return;
    r.visible = !!id;
    if (id) { r.material.color.set(SUB[id].color); r.scale.setScalar(Math.min(1.3, 0.4 + Math.cbrt(fn.cmix.massG()) * 0.25)); }
    fn.name = (fn.def.filter ? 'Filter funnel' : 'Funnel') + (id ? ` (${SUB[id].name.toLowerCase()} on the paper)` : '');
  }
  // scrape what is on the filter paper into whatever you are aiming at
  function scrape(fn, holder, ahead, dir) {
    if (!fn.cmix || fn.cmix.isEmpty()) return false;
    if (holder && holder.kind === 'vessel') { holder.mix.merge(fn.cmix); holder.dirty = true; holder.changed = G.time; }
    else G.matter.emitParcel(fn.cmix, ahead, new THREE.Vector3(dir.x * 0.4, -0.2, dir.z * 0.4));
    fn.cmix = new Mixture(20); showResidue(fn); play('scoop');
    return true;
  }
  return { update, detach, scrape };
}
