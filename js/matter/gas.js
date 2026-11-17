import * as THREE from 'three';
import { SUB } from '../chem/db.js';
import { burnGas } from '../chem/engine.js';
import { play, muffle } from '../core/audio.js';

// Gases as drifting clouds. Each cloud knows what it contains (moles), so it can rise or sink by
// its real density, thin out as it mixes with air, catch fire inside its flammable range, and
// poison anyone who breathes it. Explosions also live here.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AIR_MOL_M3 = 41.6, AIR_M = 29;

export function createGas(G) {
  const { scene } = G;
  const puffs = [], pool = [];
  for (let i = 0; i < 70; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.ptex.smoke, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; s.renderOrder = 6; scene.add(s); pool.push(s);
  }
  const flashLight = new THREE.PointLight(0xffffff, 0, 14, 2); scene.add(flashLight);
  let flashT = 0, flashPow = 0, ignT = 0, toxT = 0;
  const scorchGeo = new THREE.CircleGeometry(1, 20); scorchGeo.rotateX(-Math.PI / 2);
  const scorches = [];

  function puff(pos, n, T = 20, opt = {}) {
    let tot = 0; for (const id in n) tot += n[id];
    if (tot < 1e-7) return;
    for (const p of puffs) { // feed a young cloud nearby instead of making a new one
      if (p.age < 1.2 && Math.abs(p.x - pos.x) < 0.1 && Math.abs(p.y - pos.y) < 0.12 && Math.abs(p.z - pos.z) < 0.1) {
        for (const id in n) p.n[id] = (p.n[id] || 0) + n[id];
        p.T = (p.T * p.tot + T * tot) / (p.tot + tot); p.tot += tot;
        p.r = Math.max(p.r, Math.cbrt(p.tot / AIR_MOL_M3 * 0.75 / Math.PI) * 1.0);
        return p;
      }
    }
    if (puffs.length >= pool.length) kill(0);
    const p = { x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 0.08, vy: opt.vy ?? 0.12, vz: (Math.random() - 0.5) * 0.08, r: Math.max(0.03, Math.cbrt(tot / AIR_MOL_M3 * 0.75 / Math.PI)), n: { ...n }, tot, T, age: 0, sprite: pool.find((s) => !s.visible) };
    if (p.sprite) { p.sprite.visible = true; p.sprite.material.rotation = Math.random() * 6; }
    puffs.push(p);
    return p;
  }
  function kill(i) { const p = puffs[i]; if (p.sprite) { p.sprite.visible = false; p.sprite.material.opacity = 0; } puffs.splice(i, 1); }
  const frac = (p, id) => (p.n[id] || 0) / Math.max(p.tot, (4 / 3) * Math.PI * p.r * p.r * p.r * AIR_MOL_M3);

  function update(dt, t) {
    const B = G.bounds;
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.age += dt;
      const vol = (4 / 3) * Math.PI * p.r * p.r * p.r, nAir = Math.max(0, vol * AIR_MOL_M3 - p.tot);
      let mSum = nAir * AIR_M, vis = 0, col = null, worst = 0;
      for (const id in p.n) {
        const s = SUB[id], f = p.n[id] / (p.tot + nAir);
        mSum += p.n[id] * s.M;
        if (s.vis) { const a = s.vis * Math.min(1, f * 8); if (a > vis * 0.5) col = s.color; vis += a; }
        if (s.lel !== undefined || s.toxic || s.irritant) worst = Math.max(worst, f);
      }
      const mEff = mSum / (p.tot + nAir);
      const lift = Math.max(-5, Math.min(7, 9.81 * (AIR_M / mEff * (p.T + 273) / 293 - 1)));
      p.vy += lift * dt;
      const drag = Math.exp(-2.2 * dt);
      p.vx *= drag; p.vy *= drag; p.vz *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.r += dt * 0.05 / (1 + p.age * 0.12);
      p.T += (20 - p.T) * Math.min(1, dt * 0.7);
      // indoors the ceiling and walls hold it in; outdoors (Story Mode) it is free to drift off
      const indoors = !G.story || (p.x > B.x0 - 0.2 && p.x < B.x1 + 0.2 && p.z > B.z0 - 0.2 && p.z < B.z1 + 0.2);
      const floorY = indoors ? 0 : G.groundAt ? G.groundAt(p.x, p.z) : 0;
      if (indoors && p.y > B.y1 - p.r * 0.5) { p.y = B.y1 - p.r * 0.5; p.vy = 0; p.r += dt * 0.04; }
      if (p.y < floorY + p.r * 0.35) { p.y = floorY + p.r * 0.35; p.vy = 0; p.r += dt * 0.03; }
      if (indoors && !(G.story && p.z > B.z1 - 1.2 && p.x < B.x0 + 2.4)) { p.x = Math.max(B.x0 + 0.1, Math.min(B.x1 - 0.1, p.x)); p.z = Math.max(B.z0 + 0.1, Math.min(B.z1 - 0.1, p.z)); }
      if (p.age > 50 || (p.age > 5 && worst < 0.002 && vis < 0.02) || p.r > 2.2) { kill(i); continue; }
      if (p.sprite) {
        const s = p.sprite; s.position.set(p.x, p.y, p.z); s.scale.setScalar(p.r * 2.6);
        s.material.opacity = Math.min(0.8, vis) * Math.min(1, p.age * 4) * (G.settings.labVision ? 1 : 1);
        if (G.settings.labVision && vis < 0.2) { s.material.opacity = Math.min(0.5, worst * 6 + 0.08); col = '#7dffb0'; }
        if (col) s.material.color.set(col);
        s.material.rotation += dt * 0.15;
      }
    }
    // flames reach a flammable cloud
    ignT -= dt;
    if (ignT <= 0) {
      ignT = 0.08;
      for (const p of puffs) {
        let fuel = null;
        for (const id in p.n) { const s = SUB[id]; if (s.lel !== undefined && frac(p, id) * 100 >= s.lel) { fuel = id; break; } }
        if (!fuel) continue;
        for (const s of G.sources) {
          if (!s.flame) continue;
          if (Math.hypot(p.x - s.pos.x, p.y - s.pos.y, p.z - s.pos.z) < p.r + s.r) { ignite(p, fuel); break; }
        }
      }
    }
    // breathing it
    toxT -= dt;
    if (toxT <= 0) {
      toxT = 0.25;
      const h = G.player.pos;
      let dose = 0, irr = 0;
      for (const p of puffs) {
        if (Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z) > p.r) continue;
        for (const id in p.n) { const s = SUB[id], f = frac(p, id); if (s.toxic) dose += f / s.toxic; if (s.irritant) irr += f / s.irritant; }
      }
      if (dose > 1 || irr > 1) G.hooks.breathe(Math.min(8, dose), Math.min(8, irr));
    }
    if (flashT > 0) { flashT -= dt; flashLight.intensity = flashPow * Math.max(0, flashT / 0.45) ** 2; } else flashLight.intensity = 0;
    for (let i = scorches.length - 1; i >= 0; i--) { const s = scorches[i]; s.life -= dt; if (s.life < 10) s.m.material.opacity = 0.55 * s.life / 10; if (s.life <= 0) { scene.remove(s.m); scorches.splice(i, 1); } }
  }

  function ignite(p0, fuel) {
    // everything touching burns together
    const group = [p0], seen = new Set([p0]);
    for (let i = 0; i < group.length; i++) for (const q of puffs) {
      if (seen.has(q) || !(q.n[fuel] > 0)) continue;
      const a = group[i];
      if (Math.hypot(a.x - q.x, a.y - q.y, a.z - q.z) < a.r + q.r) { seen.add(q); group.push(q); }
    }
    let mol = 0; const c = V();
    for (const q of group) { mol += q.n[fuel]; c.x += q.x * q.n[fuel]; c.y += q.y * q.n[fuel]; c.z += q.z * q.n[fuel]; }
    c.multiplyScalar(1 / mol);
    const res = burnGas({ [fuel]: mol }, fuel);
    if (!res) return;
    for (const q of group) { q.tot -= q.n[fuel]; delete q.n[fuel]; q.T = 300; }
    for (const id in res.products) p0.n[id] = (p0.n[id] || 0) + res.products[id];
    p0.tot = 0; for (const id in p0.n) p0.tot += p0.n[id];
    G.hooks.discover(res.rx.discovery);
    explode(c, res.kJ, { gas: true, color: 0xffd9a0 });
  }

  // kJ sets everything: light, sound, shove, broken glass and how much it hurts
  function explode(pos, kJ, opt = {}) {
    const s = Math.cbrt(kJ), P = G.P, color = opt.color || 0xff9a30;
    const d = pos.distanceTo(G.player.pos);
    if (kJ < 1.2) play('pop', pos, 0.8 + kJ * 0.4); else if (kJ < 12) play('bang', pos, 0.7 + kJ * 0.04); else { play('boom', pos, 1.6); if (d < 7) muffle(Math.min(5, 1.5 + kJ / 15)); }
    const fb = 0.07 * s + 0.03;
    P.burst(Math.min(30, 6 + Math.round(s * 7)), () => ({ pos: V(pos.x + (Math.random() - 0.5) * fb, pos.y + (Math.random() - 0.5) * fb, pos.z + (Math.random() - 0.5) * fb), vel: V((Math.random() - 0.5) * s * 1.6, (Math.random() - 0.2) * s * 1.4, (Math.random() - 0.5) * s * 1.6), life: 0.25 + Math.random() * 0.35 + s * 0.05, size: fb * 1.6, size1: fb * 5.5, color, boost: 2.6, add: true, drag: 3 }));
    P.emit({ pos: pos.clone(), vel: V(), life: 0.14, size: fb * 5, size1: fb * 14, color: 0xfff6e0, boost: 3.5, add: true });
    if (kJ > 2) {
      P.burst(Math.min(22, Math.round(s * 6)), () => ({ pos: pos.clone(), vel: V((Math.random() - 0.5) * s * 4, Math.random() * s * 3, (Math.random() - 0.5) * s * 4), gravity: 7, life: 0.5 + Math.random() * 0.8, size: 0.03, color: 0xffc860, boost: 4, add: true, tex: 'spark' }));
      P.burst(Math.min(14, Math.round(s * 4)), () => ({ pos: pos.clone(), vel: V((Math.random() - 0.5) * s * 0.5, 0.4 + Math.random() * 0.9, (Math.random() - 0.5) * s * 0.5), life: 1.8 + Math.random() * 1.6, size: fb * 3, size1: fb * 12, color: 0x2a2a2a, alpha: 0.5, tex: 'smoke', drag: 0.8, spin: Math.random() - 0.5 }));
    }
    flashLight.position.copy(pos); flashLight.color.set(color); flashPow = Math.min(900, 60 * kJ); flashT = 0.45;
    // shove and break things
    const R = 0.6 + 0.6 * s, CANNON = G.phys.CANNON;
    for (const it of [...G.matter.items]) {
      const b = it.body, dx = b.position.x - pos.x, dy = b.position.y - pos.y, dz = b.position.z - pos.z, dist = Math.hypot(dx, dy, dz);
      if (dist > R * 2.2) continue;
      if (it.breakV && kJ > 2.5 && dist < 0.16 * s + 0.1 && it !== opt.keep) { G.matter.shatter(it); continue; }
      const J = Math.min(40, 9 * Math.pow(kJ, 0.6) / (dist * dist + 0.12)) * Math.min(1, 0.4 + (it.pickR || 0.05) * 6);
      if (J < 0.02) continue;
      b.wakeUp();
      const k = J / Math.max(dist, 0.05);
      b.applyImpulse(new CANNON.Vec3(dx * k, dy * k + J * 0.25, dz * k), new CANNON.Vec3((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.02));
    }
    const pl = G.player, dmg = 26 * Math.sqrt(kJ) / (1 + d * d * 2.2);
    if (dmg > 1.5) pl.hurt(dmg * G.settings.hazard, 'blast', G.time);
    if (d < R * 2.5) { const k = Math.min(9, 5 * Math.pow(kJ, 0.5) / (d * d + 0.4)); const dir = V().subVectors(pl.pos, pos).setY(0).normalize(); pl.body.velocity.x += dir.x * k; pl.body.velocity.z += dir.z * k; pl.body.velocity.y += k * 0.3; }
    G.hooks.shake(Math.min(1, 0.55 * Math.pow(kJ, 0.4) / (0.6 + d * 0.5)), pos);
    G.hooks.flash(Math.min(1, kJ / 14 / (1 + d * 0.6)));
    if (kJ > 6) {
      const hit = G.phys.raycast(pos.x, pos.y + 0.05, pos.z, pos.x, pos.y - 1.2, pos.z, 1);
      if (hit) { const m = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ color: 0x0c0a08, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); m.position.set(hit.hitPointWorld.x, hit.hitPointWorld.y + 0.002, hit.hitPointWorld.z); m.scale.setScalar(0.1 + 0.07 * s); scene.add(m); scorches.push({ m, life: 90 }); if (scorches.length > 14) { scene.remove(scorches[0].m); scorches.shift(); } }
    }
    G.hooks.explosion(kJ, pos);
    if (kJ > 10) G.hooks.discover('obs_explosion');
  }
  function clear() { while (puffs.length) kill(0); for (const s of scorches) scene.remove(s.m); scorches.length = 0; }
  return { puffs, puff, update, explode, clear, frac };
}
