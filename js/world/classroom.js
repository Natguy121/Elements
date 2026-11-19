import * as THREE from 'three';
import { cv, tex, speckle, signTex } from './textures.js';
import { play } from '../core/audio.js';

// Normal Mode's teaching lab: through the south door of the main lab. Wooden floor, teal walls,
// big windows, a whiteboard and a teacher's demonstration bench, six student benches with Bunsen
// burners, 26 stools you can sit on, an empty table, and wide aisles. Hidden in Story Mode
// (outside that door is the forest).
const BENCH = 0.92;
const X0 = -7, X1 = 7, Z0 = 5.3, Z1 = 19.3, H = 3.6;

function plankFloor() {
  const [c, g] = cv(1024, 1024);
  for (let i = 0; i < 16; i++) {
    g.fillStyle = `rgb(${150 + Math.random() * 25},${104 + Math.random() * 18},${62 + Math.random() * 12})`; g.fillRect(0, i * 64, 1024, 62);
    g.fillStyle = 'rgba(50,30,14,.55)'; g.fillRect(0, i * 64 + 62, 1024, 2); g.fillRect(((i * 397) % 1024), i * 64, 2, 62);
    for (let k = 0; k < 22; k++) { g.strokeStyle = `rgba(80,48,20,${0.05 + Math.random() * 0.09})`; g.beginPath(); const y = i * 64 + Math.random() * 60; g.moveTo(0, y); g.bezierCurveTo(340, y + (Math.random() - 0.5) * 6, 680, y + (Math.random() - 0.5) * 6, 1024, y); g.stroke(); }
  }
  speckle(g, 1024, 1024, 8000, 0.05);
  return tex(c, 4, 4);
}
function whiteboard() {
  const [c, g] = cv(1024, 384);
  g.fillStyle = '#f6f8f8'; g.fillRect(0, 0, 1024, 384);
  g.fillStyle = '#1f4fa8'; g.font = '700 46px "Comic Sans MS","Segoe Print",cursive'; g.fillText('Today: acids, bases and indicators', 40, 80);
  g.fillStyle = '#c8301c'; g.font = '600 40px "Comic Sans MS","Segoe Print",cursive';
  g.fillText('acid + alkali  ->  salt + water', 70, 170);
  g.fillStyle = '#1e7a3a'; g.fillText('NaHCO3 + CH3COOH -> CH3COONa + H2O + CO2', 70, 240);
  g.fillStyle = '#333'; g.font = '500 30px "Comic Sans MS","Segoe Print",cursive'; g.fillText('Goggles on. Tie hair back. Never point a test tube at anyone.', 70, 320);
  return tex(c);
}

export function buildClassroom(G, lab) {
  const { scene, phys } = G;
  const root = new THREE.Group(); scene.add(root);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    floor: std({ map: plankFloor(), roughness: 0.6 }),
    wall: std({ color: 0xcfe3df, roughness: 0.9 }),
    accent: std({ color: 0x1f6f6a, roughness: 0.8 }),
    ceil: std({ color: 0xf2f2ee, roughness: 1 }),
    top: std({ color: 0x23302f, roughness: 0.35 }),
    cab: std({ color: 0x2f8f86, roughness: 0.7 }),
    steel: std({ color: 0xa8b0b4, metalness: 0.9, roughness: 0.35 }),
    dark: std({ color: 0x26292b, metalness: 0.6, roughness: 0.5 }),
    seat: std({ color: 0xe06a2a, roughness: 0.6 }),
    brass: std({ color: 0xc8a050, metalness: 1, roughness: 0.35 }),
    rubber: std({ color: 0xd85a2a, roughness: 0.8 }),
    wood: std({ color: 0x9a6a3a, roughness: 0.7 }),
    glass: std({ color: 0xbfe0f2, emissive: 0x9cc8e8, emissiveIntensity: 0.8, roughness: 0.1 }),
  };
  const bodies = [];
  const solid = (cx, cy, cz, w, h, d) => { const b = phys.staticBox(cx, cy, cz, w, h, d); bodies.push(b); return b; };
  const box = (w, h, d, mat, x, y, z, collide = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; root.add(m); if (collide) solid(x, y, z, w, h, d); return m; };
  const cyl = (rt, rb, h, mat, x, y, z, seg = 14) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; root.add(m); return m; };
  const fixtures = [];

  // ---------- the room ----------
  const W = X1 - X0, D = Z1 - Z0, cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  { const f = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.floor); f.rotation.x = -Math.PI / 2; f.position.set(cx, 0.002, cz); f.receiveShadow = true; root.add(f); }
  solid(cx, -0.5, cz, W + 0.6, 1, D + 0.6);
  { const c = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.ceil); c.rotation.x = Math.PI / 2; c.position.set(cx, H, cz); root.add(c); }
  box(0.3, H, D + 0.6, M.wall, X0 - 0.15, H / 2, cz); // west
  box(0.3, H, D + 0.6, M.wall, X1 + 0.15, H / 2, cz); // east
  box(W + 0.6, H, 0.3, M.wall, cx, H / 2, Z1 + 0.15); // south (the front of the class)
  // the main lab's south wall is only 3.4 m high: close the gap above it
  box(W, H - 3.4 + 0.05, 0.3, M.wall, cx, 3.4 + (H - 3.4) / 2, Z0 - 0.15, false);
  // a teal stripe all round, and skirting
  for (const [w, d, x, z] of [[0.02, D, X0 + 0.01, cz], [0.02, D, X1 - 0.01, cz], [W, 0.02, cx, Z1 - 0.01]]) { box(w, 0.12, d, M.accent, x, 1.1, z, false); box(w, 0.1, d, M.accent, x, 0.05, z, false); }
  // big windows down both long walls
  for (let z = Z0 + 2; z < Z1 - 1; z += 3) for (const [x, ry] of [[X0 + 0.012, Math.PI / 2], [X1 - 0.012, -Math.PI / 2]]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.5), M.glass); w.position.set(x, 1.95, z); w.rotation.y = ry; root.add(w);
    for (const dy of [-0.78, 0.78]) box(0.03, 0.06, 2.1, M.accent, x, 1.95 + dy, z, false);
  }
  // whiteboard and teacher's area at the front (south wall)
  { const wb = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.0), std({ map: whiteboard(), roughness: 0.3 })); wb.position.set(0, 1.9, Z1 - 0.02); wb.rotation.y = Math.PI; root.add(wb); box(5.6, 0.06, 0.12, M.steel, 0, 0.86, Z1 - 0.06, false); }
  { const s = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.45), new THREE.MeshBasicMaterial({ map: signTex(['TEACHING LAB'], '#12302e', '#e8f4f2', 1024, 180, false) })); s.position.set(0, 3.2, Z1 - 0.02); s.rotation.y = Math.PI; root.add(s); }
  // sign over the door, on the main lab side
  const doorSign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: signTex(['TEACHING LAB  >'], '#06140c', '#43ff8a', 512, 128, false) }));
  doorSign.position.set(-5.4, 2.33, Z0 - 0.34); doorSign.rotation.y = Math.PI; root.add(doorSign);
  // ceiling lights
  for (let x = -4.5; x <= 4.5; x += 3) for (let z = Z0 + 2.5; z < Z1; z += 4) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.3), std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6 })); p.position.set(x, H - 0.03, z); root.add(p);
  }
  for (const [x, z] of [[-3.5, 9], [3.5, 9], [-3.5, 15], [3.5, 15]]) { const l = new THREE.PointLight(0xfff4e6, 9, 12, 1.6); l.position.set(x, H - 0.4, z); root.add(l); }

  // ---------- benches, burners and stools ----------
  const burners = [];
  function burner(x, z) {
    cyl(0.05, 0.062, 0.02, M.dark, x, BENCH + 0.01, z);
    cyl(0.011, 0.011, 0.12, M.steel, x, BENCH + 0.08, z);
    cyl(0.017, 0.017, 0.024, M.brass, x, BENCH + 0.05, z);
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x + 0.02, BENCH + 0.03, z + 0.02), new THREE.Vector3(x + 0.1, BENCH + 0.012, z + 0.14), new THREE.Vector3(x + 0.16, BENCH + 0.05, z + 0.3)]), 16, 0.006, 6), M.rubber); root.add(hose);
    // tripod with gauze
    const ty = BENCH + 0.215;
    box(0.15, 0.006, 0.15, M.steel, x, ty, z);
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; const leg = cyl(0.004, 0.004, 0.23, M.dark, x + Math.cos(a) * 0.085, BENCH + 0.105, z + Math.sin(a) * 0.085, 6); leg.rotation.z = -Math.cos(a) * 0.12; leg.rotation.x = Math.sin(a) * 0.12; }
    const fl = new THREE.Group(); fl.position.set(x, BENCH + 0.14, z); root.add(fl);
    const fm = (c, o) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.13, 14, 1, true), fm(0x2a5cff, 0.55)); outer.position.y = 0.065; fl.add(outer);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.055, 12, 1, true), fm(0x8fe0ff, 0.9)); inner.position.y = 0.028; fl.add(inner);
    fl.visible = false;
    const light = new THREE.PointLight(0x5a7cff, 0, 3, 2); light.position.set(x, BENCH + 0.22, z); root.add(light);
    const b = { on: false, pos: new THREE.Vector3(x, ty - 0.01, z), fl, light };
    lab.burners.push(b); burners.push(b);
    fixtures.push({ pos: new THREE.Vector3(x, BENCH + 0.06, z), r: 0.13, name: 'Bunsen burner', off: () => G.story, hint: () => (b.on ? 'Turn off the burner' : 'Light the burner'), use: () => { b.on = !b.on; fl.visible = b.on; play(b.on ? 'whoomp' : 'click', b.pos, 0.6); } });
  }
  const seats = [];
  function stool(x, z) {
    cyl(0.17, 0.17, 0.05, M.seat, x, 0.66, z, 20);
    cyl(0.03, 0.03, 0.62, M.steel, x, 0.33, z, 8);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 6, 20), M.steel); ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.25, z); root.add(ring);
    cyl(0.2, 0.22, 0.03, M.dark, x, 0.015, z, 20);
    const seat = { x, z };
    seats.push(seat);
    fixtures.push({ pos: new THREE.Vector3(x, 0.7, z), r: 0.22, name: 'Stool', off: () => G.story, hint: () => (G.player.sit === seat ? 'Stand up (or just walk)' : 'Sit down'), use: () => { if (G.player.sit === seat) { G.player.sit = null; return; } G.player.sit = seat; G.player.teleport(x, 0.35, z); play('wood', new THREE.Vector3(x, 0.6, z), 0.4); } });
  }
  function bench(x, z, w, burnerXs, stoolSide) {
    box(w, 0.05, 0.9, M.top, x, BENCH - 0.025, z, false);
    box(w - 0.08, BENCH - 0.12, 0.8, M.cab, x, (BENCH - 0.12) / 2 + 0.07, z, false);
    solid(x, BENCH / 2, z, w, BENCH, 0.9);
    for (const bx of burnerXs) burner(x + bx, z + 0.12 * -stoolSide);
    const n = burnerXs.length * 2;
    for (let i = 0; i < n; i++) stool(x - w / 2 + (i + 0.5) * (w / n), z + stoolSide * 0.75);
  }
  // students face the whiteboard (south, +z): stools on the north side of each bench
  for (const z of [8.2, 11.3, 14.4]) for (const x of [-3.4, 3.4]) bench(x, z, 4.0, [-1.0, 1.0], -1);
  // teacher's demonstration bench at the front, two stools behind it
  bench(0, 17.2, 3.2, [0], 1);
  // an empty table at the side, for anyone who wants one
  box(1.6, 0.05, 0.8, M.wood, 5.4, 0.78, 17.4, false);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.05, 0.76, 0.05, M.dark, 5.4 + a * 0.74, 0.38, 17.4 + b * 0.34, false);
  solid(5.4, 0.4, 17.4, 1.6, 0.8, 0.8);
  // put the fixtures into the game's list (after the lab's, before Story Mode's)
  for (const f of fixtures) G.fixtures.push(f);

  // ---------- glassware for the class ----------
  function populate(m) {
    for (const z of [8.2, 11.3, 14.4]) for (const x of [-3.4, 3.4]) for (const bx of [-1.0, 1.0]) {
      m.place(m.makeVessel('beaker250'), x + bx - 0.35, BENCH, z + 0.15); m.place(m.makeVessel('crucible'), x + bx + 0.35, BENCH, z + 0.15);
    }
    m.place(m.makeVessel('beaker600'), -0.6, BENCH, 17.35); m.place(m.makeVessel('flask250'), 0.6, BENCH, 17.35);
    m.place(m.makeProp('lighter'), 0.95, BENCH + 0.1, 17.1);
  }

  // ---------- show in Normal Mode only ----------
  let shown = true;
  function show(on) {
    if (on === shown) return;
    shown = on; root.visible = on;
    for (const b of bodies) { const inWorld = phys.world.bodies.includes(b); if (on && !inWorld) phys.world.addBody(b); if (!on && inWorld) phys.world.removeBody(b); }
    if (!on) for (const b of burners) { b.on = false; b.fl.visible = false; }
    if (!on && G.player.sit && seats.includes(G.player.sit)) G.player.sit = null;
  }
  function update(dt, t) {
    if (!shown) return;
    for (const b of burners) {
      if (!b.on) { b.light.intensity = 0; continue; }
      b.fl.scale.set(1 + Math.sin(t * 31) * 0.05, 1 + Math.sin(t * 23) * 0.07 + Math.sin(t * 7.1) * 0.04, 1 + Math.cos(t * 29) * 0.05);
      b.light.intensity = 0.7 + Math.sin(t * 19) * 0.08;
    }
  }
  const inside = (p) => shown && p.x > X0 && p.x < X1 && p.z > Z0 && p.z < Z1;
  return { show, update, populate, inside, seats: seats.length };
}
