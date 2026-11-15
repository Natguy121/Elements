import * as THREE from 'three';

// The player body: a small lab assistant robot. One wheel, a pill-shaped torso,
// a monitor for a head and two floating mitts. Original design for this game.

export function makeRobot(accent = 0xffc21a) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xe9ecec, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const dark = std({ color: 0x15181b, roughness: 0.4, metalness: 0.5 });
  const rubber = std({ color: 0x0e0f10, roughness: 0.9 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.8) });
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  add(new THREE.SphereGeometry(0.13, 20, 14), rubber, 0, 0.13, 0);
  add(new THREE.CylinderGeometry(0.17, 0.21, 0.12, 24), dark, 0, 0.22, 0);
  const torso = add(new THREE.CapsuleGeometry(0.19, 0.26, 6, 20), shell, 0, 0.58, 0);
  add(new THREE.BoxGeometry(0.2, 0.14, 0.02), dark, 0, 0.6, 0.185);
  add(new THREE.CircleGeometry(0.018, 12), glow, -0.06, 0.62, 0.197);
  add(new THREE.BoxGeometry(0.09, 0.012, 0.005), std({ color: 0x8c949a, metalness: 1, roughness: 0.3 }), 0.035, 0.62, 0.197);
  add(new THREE.CylinderGeometry(0.045, 0.06, 0.08, 14), dark, 0, 0.92, 0);

  const head = new THREE.Group();
  head.position.set(0, 1.1, 0);
  g.add(head);
  const skull = add(new THREE.CapsuleGeometry(0.15, 0.2, 6, 18), shell, 0, 0, 0, head);
  skull.rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(0.36, 0.17, 0.04), new THREE.MeshPhysicalMaterial({ color: 0x05080a, roughness: 0.08, clearcoat: 1 }), 0, 0, 0.135, head);
  const eyeGeo = new THREE.CapsuleGeometry(0.02, 0.035, 4, 10);
  const eyes = [add(eyeGeo, glow, -0.075, 0.005, 0.158, head), add(eyeGeo, glow, 0.075, 0.005, 0.158, head)];
  add(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 6), dark, 0.1, 0.22, 0, head);
  add(new THREE.SphereGeometry(0.022, 12, 10), glow, 0.1, 0.31, 0, head);

  const hands = [-1, 1].map((s) => add(new THREE.SphereGeometry(0.06, 16, 12), rubber, s * 0.31, 0.56, 0.06));
  g.scale.setScalar(1.18);
  g.userData = { head, eyes, hands, torso, blink: Math.random() * 4, ph: Math.random() * 6 };
  return g;
}

// idle life: bob, blink, mitts drifting
export function animateRobot(r, t, dt, moving = 0) {
  const u = r.userData;
  u.torso.position.y = 0.58 + Math.sin(t * 2.2 + u.ph) * 0.008;
  u.head.position.y = 1.1 + Math.sin(t * 2.2 + u.ph + 0.6) * 0.012;
  u.blink -= dt;
  const closed = u.blink < 0.12;
  if (u.blink < 0) u.blink = 2 + Math.random() * 4;
  u.eyes.forEach((e) => { e.scale.y = closed ? 0.12 : 1; });
  u.hands.forEach((h, i) => {
    h.position.y = 0.56 + Math.sin(t * 2.6 + i * 2 + u.ph) * (0.015 + moving * 0.05);
    h.position.z = 0.06 + Math.sin(t * 6 + i * Math.PI) * 0.09 * moving;
  });
}
