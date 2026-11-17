import * as THREE from 'three';
import { play } from '../core/audio.js';
import { G_STATIC, G_PROP, G_PLAYER, G_HELD } from '../physics/world.js';

// A static collision box that can be turned about the vertical axis.
export function solidBox(phys, cx, cy, cz, w, h, d, ry = 0, add = true) {
  const { CANNON } = phys;
  const b = new CANNON.Body({ mass: 0, material: phys.mats.matGround, collisionFilterGroup: G_STATIC, collisionFilterMask: G_PROP | G_PLAYER | G_HELD });
  b.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
  b.position.set(cx, cy, cz);
  b.quaternion.setFromEuler(0, ry, 0);
  if (add) phys.world.addBody(b);
  return b;
}

// A hinged door. The hinge sits at (x, z); the door leaf points along angle a0 when shut and a1 when open
// (angle about the vertical axis: 0 points along +x, -PI/2 along +z). F opens and shuts it.
// o.canUse() returns true, or a reason it will not open.
export function makeDoor(G, o) {
  const { scene, phys } = G;
  const w = o.w ?? 1, h = o.h ?? 2.1, t = o.t ?? 0.055;
  const pivot = new THREE.Group(); pivot.position.set(o.x, 0, o.z); pivot.rotation.y = o.a0; scene.add(pivot);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, h - 0.01, t), o.mat); leaf.position.set(w / 2, h / 2, 0); leaf.castShadow = true; leaf.receiveShadow = true; pivot.add(leaf);
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.3 });
  for (const s of [-1, 1]) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.03), knobMat); k.position.set(w - 0.13, 1.0, s * (t / 2 + 0.02)); pivot.add(k); }
  if (o.window) { const gl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, t + 0.006), new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.05, metalness: 0.6 })); gl.position.set(w / 2, 1.5, 0); pivot.add(gl); }
  const cx = o.x + Math.cos(o.a0) * w / 2, cz = o.z - Math.sin(o.a0) * w / 2;
  const body = solidBox(phys, cx, h / 2, cz, w, h, 0.16, o.a0);
  const d = { open: false, ang: o.a0, pivot, body, solid: true, hidden: false };
  const knob = new THREE.Vector3();
  const fixture = {
    pos: new THREE.Vector3(), r: 0.28, name: o.name || 'Door',
    hint: () => { const ok = o.canUse ? o.canUse() : true; return ok === true ? (d.open ? 'Close the door' : 'Open the door') : ok; },
    use: () => {
      const ok = o.canUse ? o.canUse() : true;
      if (ok !== true) { play('click', fixture.pos, 0.6); G.hud.toast(o.name || 'Door', o.lockedText || ok); return; }
      set(!d.open);
    },
  };
  function set(open) {
    if (open === d.open) return;
    d.open = open;
    play(open ? 'wood' : 'thud', fixture.pos, 0.6);
    if (open && d.solid) { phys.world.removeBody(body); d.solid = false; }
  }
  d.set = set;
  d.fixture = fixture;
  d.update = (dt) => {
    const target = d.open ? o.a1 : o.a0;
    d.ang += (target - d.ang) * Math.min(1, dt * 7);
    pivot.rotation.y = d.ang;
    if (!d.open && !d.solid && Math.abs(d.ang - o.a0) < 0.03) { phys.world.addBody(body); d.solid = true; }
    knob.set(w - 0.13, 1.0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), d.ang).add(pivot.position);
    fixture.pos.copy(knob);
  };
  d.update(0);
  d.show = (on) => { pivot.visible = on; d.hidden = !on; };
  return d;
}
