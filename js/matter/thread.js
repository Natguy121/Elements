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
    it.hang = v;
    G.phys.world.removeBody(it.body);
    play('clink', it.body.position, 0.3);
  }
  function detach(it) {
    if (!it.hang) return;
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
  function update(dt) {
    for (const it of G.matter.items) {
      if (it.type !== 'thread' || it.dead) continue;
      if (it.hang) {
        const v = it.hang;
        if (v.dead || v.up.y < 0.7 || it.held) { detach(it); continue; }
        // rest the pencil across the rim, thread hanging straight down
        it.body.position.set(v.base.x, v.base.y + v.def.H + 0.006, v.base.z);
        it.body.velocity.set(0, 0, 0); it.body.angularVelocity.set(0, 0, 0);
        it.body.quaternion.setFromEuler(0, it.yaw ?? 0, 0);
        G.matter.sync(it);
        grow(it, dt * (G.timeScale || 1));
      } else if (!it.held && it.body.velocity.length() < 0.6) {
        const v = vesselUnder(it);
        if (v && v.def.H > 0.05) { it.yaw = Math.atan2(it.body.quaternion.y, it.body.quaternion.w) * 2; attach(it, v); }
      }
    }
  }
  return { update, detach };
}
