// Lab cart (trolley). Press F on it to push it in front of you; anything sitting on its
// shelves rides along without tipping, so flasks and solutions can be moved safely.
import * as THREE from 'three';
import { G_STATIC, G_PROP, G_PLAYER, G_HELD } from '../physics/world.js';

const W = 0.6, L = 0.95, TOP = 0.82, LOW = 0.3, RIM = 0.05;

export function buildCarts(G, scene, spots) {
  const { CANNON, world } = G.phys;
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8c0c6, metalness: 0.8, roughness: 0.35 });
  const tray = new THREE.MeshStandardMaterial({ color: 0x2f8f86, roughness: 0.55 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const carts = [];

  function make(x, z, yaw) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
    const box = (w, h, d, m, px, py, pz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); o.receiveShadow = true; g.add(o); };
    for (const y of [TOP, LOW]) {
      box(W, 0.03, L, tray, 0, y, 0);
      box(W, RIM, 0.02, steel, 0, y + RIM / 2, L / 2); box(W, RIM, 0.02, steel, 0, y + RIM / 2, -L / 2);
      box(0.02, RIM, L, steel, W / 2, y + RIM / 2, 0); box(0.02, RIM, L, steel, -W / 2, y + RIM / 2, 0);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(0.025, TOP - 0.06, 0.025, steel, sx * (W / 2 - 0.02), (TOP + 0.06) / 2, sz * (L / 2 - 0.02));
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14), tyre); wh.rotation.z = Math.PI / 2; wh.position.set(sx * (W / 2 - 0.04), 0.05, sz * (L / 2 - 0.05)); g.add(wh);
    }
    // handle on the back (+z) end, the side you push from
    box(0.02, 0.2, 0.02, steel, -W / 2 + 0.03, TOP + 0.1, L / 2 + 0.02); box(0.02, 0.2, 0.02, steel, W / 2 - 0.03, TOP + 0.1, L / 2 + 0.02);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, W, 10), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 })); bar.rotation.z = Math.PI / 2; bar.position.set(0, TOP + 0.2, L / 2 + 0.02); g.add(bar);

    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: G.phys.mats.matMetal, collisionFilterGroup: G_STATIC, collisionFilterMask: G_PROP | G_PLAYER | G_HELD });
    const add = (w, h, d, px, py, pz) => body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)), new CANNON.Vec3(px, py, pz));
    for (const y of [TOP, LOW]) {
      add(W, 0.03, L, 0, y, 0);
      add(W, RIM * 2, 0.02, 0, y + RIM, L / 2); add(W, RIM * 2, 0.02, 0, y + RIM, -L / 2);
      add(0.02, RIM * 2, L, W / 2, y + RIM, 0); add(0.02, RIM * 2, L, -W / 2, y + RIM, 0);
    }
    body.position.set(x, 0, z); body.quaternion.setFromEuler(0, yaw, 0);
    world.addBody(body);
    const c = { g, body, x, z, yaw, pushing: false };
    carts.push(c);
    G.fixtures.push({ pos: new THREE.Vector3(), r: 0.35, name: 'Lab cart',
      hint: () => (c.pushing ? 'Let go of the cart' : 'Push the cart (things on it ride along safely)'),
      use: () => { for (const o of carts) if (o !== c) o.pushing = false; c.pushing = !c.pushing; G.hud?.toast?.('Lab cart', c.pushing ? 'Pushing. Walk to move it, press F to let go.' : 'Cart parked.'); } });
    c.fix = G.fixtures[G.fixtures.length - 1];
    syncFix(c);
  }
  function syncFix(c) { c.fix.pos.set(c.x + Math.sin(c.yaw) * (L / 2), TOP + 0.15, c.z + Math.cos(c.yaw) * (L / 2)); }

  // is a world point on one of this cart's shelves?
  function onCart(c, p) {
    const dx = p.x - c.x, dz = p.z - c.z, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    if (Math.abs(lx) > W / 2 + 0.02 || Math.abs(lz) > L / 2 + 0.02) return false;
    return (p.y > TOP - 0.02 && p.y < TOP + 0.5) || (p.y > LOW - 0.02 && p.y < TOP - 0.05);
  }

  const q = new CANNON.Quaternion();
  G.phys.onPreStep((dt) => {
    const pl = G.player;
    for (const c of carts) {
      if (!c.pushing) continue;
      const bp = pl.body.position;
      if (Math.hypot(bp.x - c.x, bp.z - c.z) > 2.2 || pl.sit) { c.pushing = false; continue; }
      const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw), reach = L / 2 + 0.45;
      let tx = bp.x + fx * reach, tz = bp.z + fz * reach;
      // turn gently toward where the player faces
      let dy = pl.yaw - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const nyaw = c.yaw + dy * Math.min(1, dt * 6);
      let mx = tx - c.x, mz = tz - c.z; const ml = Math.hypot(mx, mz), maxStep = 3.5 * dt;
      if (ml > maxStep) { mx *= maxStep / ml; mz *= maxStep / ml; }
      // stop at walls and benches: probe the front corners at shelf height
      body0(c, 0);
      let blocked = false;
      for (const s of [-1, 1]) {
        const ox = c.x + Math.cos(nyaw) * s * W / 2, oz = c.z - Math.sin(nyaw) * s * W / 2;
        const ex = ox + mx - Math.sin(nyaw) * (L / 2 + 0.05), ez = oz + mz - Math.cos(nyaw) * (L / 2 + 0.05);
        for (const y of [0.15, TOP]) if (G.phys.raycast(ox, y, oz, ex, y, ez, G_STATIC)) blocked = true;
      }
      body0(c, 1);
      if (blocked) { mx = 0; mz = 0; }
      const ox = c.x, oz = c.z, oyaw = c.yaw;
      c.x += mx; c.z += mz; c.yaw = blocked ? c.yaw : nyaw;
      const da = c.yaw - oyaw, cs = Math.cos(da), sn = Math.sin(da);
      // carry everything on the shelves with the cart
      for (const it of G.matter.items) {
        if (it.held || it.dead) continue;
        const p = it.body.position;
        if (!onCart({ x: ox, z: oz, yaw: oyaw }, p)) continue;
        const rx = p.x - ox, rz = p.z - oz;
        p.x = c.x + rx * cs + rz * sn; p.z = c.z - rx * sn + rz * cs;
        const v = it.body.velocity; v.x = 0; v.z = 0;
        it.body.angularVelocity.set(0, 0, 0);
        if (da) { q.setFromEuler(0, da, 0); it.body.quaternion.copy(q.mult(it.body.quaternion)); }
        it.body.wakeUp?.();
      }
      c.body.position.set(c.x, 0, c.z); c.body.quaternion.setFromEuler(0, c.yaw, 0); c.body.aabbNeedsUpdate = true; c.body.updateAABB();
      c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.yaw;
      syncFix(c);
    }
  });
  function body0(c, on) { c.body.collisionFilterGroup = on ? G_STATIC : 0; }

  for (const [x, z, yaw] of spots) make(x, z, yaw);
  return { carts };
}
