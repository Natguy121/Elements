import * as THREE from 'three';
import * as T from './textures.js';
import { SUB } from '../chem/db.js';
import { CHUNK } from '../chem/mixture.js';
import { play } from '../core/audio.js';

// The main lab floor: one room for now (the rest of the complex comes in later stages).
// Builds what you see, the matching collision boxes, the working fixtures, and stocks the shelves.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const BENCH = 0.92;

export function buildLab(G) {
  const { scene, phys } = G;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const steelT = T.steelTex(2, 1), benchT = T.benchTex(2, 1), wallT = T.wallTex(6, 2), floorT = T.floorTex(7, 5), tileT = T.tileTex(10, 1.2);
  const M = {
    floor: std({ map: floorT, bumpMap: floorT, bumpScale: 0.6, roughnessMap: floorT, roughness: 0.62, envMapIntensity: 1.1 }),
    wall: std({ map: wallT, bumpMap: wallT, bumpScale: 0.4, color: 0xd4d8d4, roughness: 0.92 }),
    tile: std({ map: tileT, bumpMap: tileT, bumpScale: 0.5, roughness: 0.35 }),
    ceil: std({ color: 0xe6e8e6, roughness: 1 }),
    top: std({ map: benchT, roughness: 0.42, color: 0xffffff, envMapIntensity: 0.7 }),
    cab: std({ color: 0xd9dedd, roughness: 0.5 }),
    steel: std({ map: steelT, metalness: 1, roughness: 0.34, color: 0xcfd3d6 }),
    dark: std({ color: 0x1a1d20, roughness: 0.6 }),
    darkSteel: std({ color: 0x4a5056, metalness: 1, roughness: 0.45 }),
    brass: std({ color: 0xcfa640, metalness: 1, roughness: 0.3 }),
    rubber: std({ color: 0x0e0f10, roughness: 0.9 }),
    red: new THREE.MeshPhysicalMaterial({ color: 0xb81e1a, roughness: 0.35, clearcoat: 0.6 }),
    white: std({ color: 0xf2f2ee, roughness: 0.4 }),
    panel: std({ color: 0xffffff, emissive: 0xfff4e6, emissiveIntensity: 2.4 }),
    shelf: std({ color: 0xc9cdcb, metalness: 0.6, roughness: 0.5 }),
    sashGlass: new THREE.MeshPhysicalMaterial({ color: 0xdff2f5, roughness: 0.04, transparent: true, opacity: 0.16, envMapIntensity: 2, depthWrite: false }),
  };
  const mesh = (geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };
  // a visible box with a matching collision box
  const block = (w, h, d, mat, x, y, z, solid = true) => { const m = mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z); if (solid) phys.staticBox(x, y, z, w, h, d); return m; };
  const deco = (w, h, d, mat, x, y, z) => block(w, h, d, mat, x, y, z, false);
  const cyl = (r1, r2, h, mat, x, y, z, seg = 20) => mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat, x, y, z);

  const X0 = -7, X1 = 7, Z0 = -5, Z1 = 5, H = 3.4;
  G.bounds = { x0: X0, x1: X1, z0: Z0, z1: Z1, y1: H };
  const fixtures = [];
  G.fixtures = fixtures; G.plates = []; G.drains = [];
  const updaters = [];

  // ---------- shell ----------
  const floor = mesh(new THREE.PlaneGeometry(14, 10), M.floor, 0, 0, 0, false); floor.rotation.x = -Math.PI / 2;
  phys.staticBox(0, -0.5, 0, 16, 1, 12);
  const ceil = mesh(new THREE.PlaneGeometry(14, 10), M.ceil, 0, H, 0, false); ceil.rotation.x = Math.PI / 2;
  phys.staticBox(0, H + 0.5, 0, 16, 1, 12);
  [[0, Z0 - 0.15, 14.6, 0.3], [0, Z1 + 0.15, 14.6, 0.3], [X0 - 0.15, 0, 0.3, 10.6], [X1 + 0.15, 0, 0.3, 10.6]].forEach(([x, z, w, d]) => block(w, H, d, M.wall, x, H / 2, z));
  // tiled splashback along the north wall, skirting, ceiling lights
  deco(14, 1.1, 0.02, M.tile, 0, 1.45, Z0 + 0.012);
  [[0, Z0 + 0.02, 14, 0.03], [0, Z1 - 0.02, 14, 0.03]].forEach(([x, z, w, d]) => deco(w, 0.1, d, M.dark, x, 0.05, z));
  for (const x of [-4.4, 0, 4.4]) for (const z of [-2.4, 2.2]) { deco(1.5, 0.02, 0.42, M.panel, x, H - 0.05, z).castShadow = false; deco(1.62, 0.05, 0.54, M.steel, x, H - 0.022, z).castShadow = false; }
  for (const x of [-2.2, 2.2]) { const v = deco(0.6, 0.04, 0.6, M.darkSteel, x, H - 0.02, 0); v.castShadow = false; for (let i = -2; i <= 2; i++) deco(0.56, 0.012, 0.02, M.dark, x, H - 0.045, i * 0.11).castShadow = false; }

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x70757a, 0.55));
  const key = new THREE.SpotLight(0xfff1de, 85, 20, 1.15, 0.7, 2);
  key.position.set(-1.2, H - 0.1, 1.6); key.target.position.set(-1.6, 0.9, -2.4);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.camera.near = 0.5; key.shadow.camera.far = 14;
  scene.add(key, key.target);
  const key2 = new THREE.SpotLight(0xf4f6ff, 50, 18, 1.1, 0.8, 2);
  key2.position.set(3.4, H - 0.1, 0.6); key2.target.position.set(3.2, 0.9, 1.2);
  key2.castShadow = true; key2.shadow.mapSize.set(1024, 1024); key2.shadow.bias = -0.0004; key2.shadow.normalBias = 0.02; key2.shadow.camera.near = 0.5; key2.shadow.camera.far = 12;
  scene.add(key2, key2.target);
  const fillL = new THREE.PointLight(0xe6eeff, 9, 14, 2); fillL.position.set(-4.5, 2.9, 2.2); scene.add(fillL);
  G.lightsMain = [key, key2, fillL];

  // ---------- benches ----------
  function bench(x0, x1, z0, z1, opt = {}) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    deco(w, 0.05, d, M.top, cx, BENCH - 0.025, cz);
    deco(w - 0.06, BENCH - 0.13, d - 0.08, M.cab, cx, (BENCH - 0.13) / 2 + 0.08, cz);
    deco(w - 0.1, 0.08, d - 0.14, M.dark, cx, 0.04, cz);
    if (!opt.noCollide) phys.staticBox(cx, BENCH / 2, cz, w, BENCH, d);
    // doors and handles on the long faces
    const n = Math.max(1, Math.round(w / 0.6));
    for (const zf of opt.faces || [z1]) {
      const s = zf === z1 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const x = x0 + (i + 0.5) * (w / n);
        deco(0.012, BENCH - 0.2, 0.012, M.dark, x0 + i * (w / n) + 0.03, BENCH / 2, zf - s * 0.036);
        deco(0.16, 0.016, 0.03, M.steel, x, BENCH - 0.16, zf - s * 0.02);
      }
    }
  }
  // north wall bench, with a gap in the collision where the sink is
  const NZ0 = Z0, NZ1 = Z0 + 0.8;
  bench(-6.5, 3.2, NZ0, NZ1, { noCollide: true });
  phys.staticBox(-6.3, BENCH / 2, (NZ0 + NZ1) / 2, 0.4, BENCH, 0.8);
  phys.staticBox(-0.95, BENCH / 2, (NZ0 + NZ1) / 2, 8.3, BENCH, 0.8);
  phys.staticBox(-5.6, BENCH / 2, NZ1 - 0.05, 1.0, BENCH, 0.1);
  phys.staticBox(-5.6, BENCH / 2, NZ0 + 0.05, 1.0, BENCH, 0.1);
  phys.staticBox(-5.6, 0.36, (NZ0 + NZ1) / 2, 1.0, 0.72, 0.8);
  bench(-3.6, -0.6, -0.7, 0.7, { faces: [-0.7, 0.7] });
  bench(0.6, 3.6, -0.7, 0.7, { faces: [-0.7, 0.7] });

  // ---------- sink and tap ----------
  const sx = -5.6, sz = NZ0 + 0.4;
  deco(0.92, 0.012, 0.62, M.steel, sx, BENCH + 0.004, sz).visible = false;
  deco(0.9, 0.2, 0.6, M.darkSteel, sx, BENCH - 0.1, sz).material = std({ color: 0x9aa0a4, metalness: 1, roughness: 0.3, side: THREE.BackSide });
  const basin = mesh(new THREE.BoxGeometry(0.9, 0.2, 0.6), std({ map: steelT, metalness: 1, roughness: 0.28, side: THREE.BackSide }), sx, BENCH - 0.1, sz, false);
  basin.renderOrder = 0;
  deco(0.94, 0.012, 0.03, M.steel, sx, BENCH + 0.002, sz + 0.31); deco(0.94, 0.012, 0.03, M.steel, sx, BENCH + 0.002, sz - 0.31);
  deco(0.03, 0.012, 0.62, M.steel, sx - 0.46, BENCH + 0.002, sz); deco(0.03, 0.012, 0.62, M.steel, sx + 0.46, BENCH + 0.002, sz);
  cyl(0.03, 0.03, 0.006, M.dark, sx, BENCH - 0.196, sz);
  cyl(0.018, 0.022, 0.3, M.steel, sx, BENCH + 0.15, NZ0 + 0.1);
  const neck = mesh(new THREE.TorusGeometry(0.11, 0.014, 10, 20, Math.PI), M.steel, sx, BENCH + 0.3, NZ0 + 0.21); neck.rotation.y = Math.PI / 2;
  cyl(0.014, 0.012, 0.05, M.steel, sx, BENCH + 0.28, NZ0 + 0.32);
  const tapKnob = cyl(0.03, 0.03, 0.03, M.red, sx + 0.12, BENCH + 0.03, NZ0 + 0.1);
  const spout = V(sx, BENCH + 0.25, NZ0 + 0.32);
  G.drains.push({ x0: sx - 0.45, x1: sx + 0.45, z0: sz - 0.3, z1: sz + 0.3, y: BENCH - 0.2 });
  const tap = { on: false, acc: 0 };
  fixtures.push({ pos: V(sx + 0.12, BENCH + 0.06, NZ0 + 0.12), r: 0.14, name: 'Cold tap', hint: () => (tap.on ? 'Turn off the water' : 'Turn on the water'), use: () => { tap.on = !tap.on; tapKnob.rotation.y += 1.2; play('click', spout); } });
  updaters.push((dt) => {
    if (!tap.on) return;
    tap.acc += dt * 0.045; // litres per second
    while (tap.acc > 0.0009) {
      tap.acc -= 0.0009;
      const m = new G.Mixture(15); m.add('water', 0.0009 * 1000 / 18.015);
      G.matter.emitParcel(m, V(spout.x + (Math.random() - 0.5) * 0.004, spout.y - 0.03, spout.z + (Math.random() - 0.5) * 0.004), V(0, -0.6, 0));
    }
  });
  G.tap = tap;

  // ---------- Bunsen burners ----------
  const burners = [];
  function burner(x, z, tripod) {
    cyl(0.05, 0.062, 0.02, M.darkSteel, x, BENCH + 0.01, z);
    cyl(0.011, 0.011, 0.12, M.steel, x, BENCH + 0.08, z);
    cyl(0.017, 0.017, 0.024, M.brass, x, BENCH + 0.05, z);
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(x + 0.02, BENCH + 0.03, z - 0.02), V(x + 0.1, BENCH + 0.012, z - 0.14), V(x + 0.16, BENCH + 0.05, z - 0.3)]), 16, 0.006, 6), M.rubber); scene.add(hose);
    cyl(0.016, 0.02, 0.08, std({ color: 0xffc21a, roughness: 0.4 }), x + 0.16, BENCH + 0.04, z - 0.32);
    const fl = new THREE.Group(); fl.position.set(x, BENCH + 0.14, z); scene.add(fl);
    const fm = (c, o) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.13, 14, 1, true), fm(0x2a5cff, 0.55)); outer.position.y = 0.065; fl.add(outer);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.055, 12, 1, true), fm(0x8fe0ff, 0.9)); inner.position.y = 0.028; fl.add(inner);
    fl.visible = false;
    const light = new THREE.PointLight(0x5a7cff, 0, 3, 2); light.position.set(x, BENCH + 0.22, z); scene.add(light);
    const b = { on: false, pos: V(x, BENCH + 0.2, z), fl, light };
    burners.push(b);
    fixtures.push({ pos: V(x, BENCH + 0.06, z), r: 0.13, name: 'Bunsen burner', hint: () => (b.on ? 'Turn off the burner' : 'Light the burner'), use: () => { b.on = !b.on; fl.visible = b.on; play(b.on ? 'whoomp' : 'click', b.pos, 0.6); } });
    if (tripod) {
      const ty = BENCH + 0.215;
      block(0.15, 0.006, 0.15, std({ color: 0x8c9296, metalness: 1, roughness: 0.6 }), x, ty, z);
      const ring = mesh(new THREE.TorusGeometry(0.075, 0.005, 8, 24), M.darkSteel, x, ty - 0.004, z); ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; const leg = cyl(0.004, 0.004, 0.23, M.darkSteel, x + Math.cos(a) * 0.085, BENCH + 0.105, z + Math.sin(a) * 0.085, 6); leg.rotation.z = -Math.cos(a) * 0.12; leg.rotation.x = Math.sin(a) * 0.12; }
      b.pos.y = ty - 0.01;
    }
  }
  burner(-3.4, NZ0 + 0.42, true);
  burner(-2.5, NZ0 + 0.42, false);
  updaters.push((dt, t) => {
    let any = 0;
    for (const b of burners) {
      if (!b.on) { b.light.intensity = 0; continue; }
      b.fl.scale.set(1 + Math.sin(t * 31) * 0.05, 1 + Math.sin(t * 23) * 0.07 + Math.sin(t * 7.1) * 0.04, 1 + Math.cos(t * 29) * 0.05);
      b.light.intensity = 0.7 + Math.sin(t * 19) * 0.08;
      any = Math.max(any, G.dist(b.pos));
    }
    G.levels.burner = any * 0.1;
  });

  // ---------- hot plate ----------
  const hx = -1.3, hz = NZ0 + 0.42;
  block(0.3, 0.08, 0.3, M.white, hx, BENCH + 0.04, hz);
  const plateMat = std({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.6, emissive: 0xff3a0a, emissiveIntensity: 0 });
  deco(0.24, 0.008, 0.24, plateMat, hx, BENCH + 0.084, hz);
  const knob = cyl(0.02, 0.02, 0.02, M.dark, hx - 0.08, BENCH + 0.04, hz + 0.155); knob.rotation.x = Math.PI / 2;
  const plateLcd = T.lcdTex(256, 96);
  const plateScr = mesh(new THREE.PlaneGeometry(0.11, 0.04), new THREE.MeshBasicMaterial({ map: plateLcd }), hx + 0.06, BENCH + 0.04, hz + 0.1515, false);
  void plateScr;
  const LEVELS = [0, 100, 200, 350], NAMES = ['OFF', 'LOW', 'MED', 'HIGH'];
  const plate = { x0: hx - 0.13, x1: hx + 0.13, z0: hz - 0.13, z1: hz + 0.13, y: BENCH + 0.088, T: 20, set: 0, k: 7 };
  G.plates.push(plate);
  plateLcd.set('OFF', 'HOT PLATE');
  fixtures.push({ pos: V(hx - 0.08, BENCH + 0.05, hz + 0.16), r: 0.16, name: 'Hot plate', hint: () => `Hot plate: ${NAMES[plate.set]}. Turn the dial`, use: () => { plate.set = (plate.set + 1) % 4; knob.rotation.z -= 1.2; play('click', V(hx, BENCH, hz)); } });
  updaters.push((dt) => {
    const target = LEVELS[plate.set] || 20;
    plate.T += (target - plate.T) * Math.min(1, dt * (target > plate.T ? 0.12 : 0.05));
    plateMat.emissiveIntensity = Math.max(0, (plate.T - 280) / 70) * 0.9;
    plate.lcdT = (plate.lcdT || 0) - dt;
    if (plate.lcdT <= 0) { plate.lcdT = 0.5; plateLcd.set(plate.set ? Math.round(plate.T) + ' C' : (plate.T > 45 ? Math.round(plate.T) + ' C' : 'OFF'), plate.T > 45 ? 'CAUTION: HOT SURFACE' : 'HOT PLATE'); }
  });

  // ---------- balance ----------
  const bx = 0.1, bz = NZ0 + 0.42;
  block(0.3, 0.06, 0.32, M.white, bx, BENCH + 0.03, bz);
  block(0.22, 0.012, 0.22, M.steel, bx, BENCH + 0.066, bz - 0.03);
  const balLcd = T.lcdTex(256, 96);
  const scr = mesh(new THREE.PlaneGeometry(0.13, 0.048), new THREE.MeshBasicMaterial({ map: balLcd }), bx, BENCH + 0.034, bz + 0.1615, false);
  void scr;
  const pan = { x0: bx - 0.11, x1: bx + 0.11, z0: bz - 0.14, z1: bz + 0.08, y: BENCH + 0.072, tare: 0, last: -1 };
  fixtures.push({ pos: V(bx, BENCH + 0.04, bz + 0.16), r: 0.15, name: 'Balance', hint: () => 'Tare the balance (set to zero)', use: () => { pan.tare = pan.gross || 0; play('beep', V(bx, BENCH, bz)); } });
  let balT = 0;
  updaters.push((dt) => {
    balT -= dt; if (balT > 0) return; balT = 0.2;
    let g = 0;
    for (const it of G.matter.items) {
      const p = it.body.position, by = p.y - (it.halfH || 0);
      if (p.x > pan.x0 && p.x < pan.x1 && p.z > pan.z0 && p.z < pan.z1 && Math.abs(by - pan.y) < 0.03 && !it.held) g += it.body.mass * 1000;
    }
    pan.gross = g;
    const net = Math.round((g - pan.tare) * 100) / 100;
    if (net !== pan.last) { pan.last = net; balLcd.set(net.toFixed(2) + ' g', pan.tare ? 'NET  (TARE ' + pan.tare.toFixed(1) + ' g)' : 'PRECISION BALANCE'); }
  });

  // ---------- fume hood (not working yet: later stage) ----------
  const fx = 4.9;
  block(2.4, BENCH, 0.8, M.cab, fx, BENCH / 2, NZ0 + 0.4);
  deco(2.4, 0.05, 0.82, M.top, fx, BENCH + 0.0, NZ0 + 0.41);
  block(0.08, 1.5, 0.8, M.white, fx - 1.16, BENCH + 0.75, NZ0 + 0.4); block(0.08, 1.5, 0.8, M.white, fx + 1.16, BENCH + 0.75, NZ0 + 0.4);
  block(2.4, 0.3, 0.8, M.white, fx, BENCH + 1.65, NZ0 + 0.4);
  deco(2.24, 0.7, 0.012, M.sashGlass, fx, BENCH + 1.15, NZ0 + 0.78).castShadow = false;
  deco(2.24, 0.04, 0.03, M.steel, fx, BENCH + 0.8, NZ0 + 0.78);
  mesh(new THREE.PlaneGeometry(0.7, 0.16), std({ map: T.signTex(['FUME HOOD', 'OUT OF SERVICE'], '#ffc21a', '#111111', 512, 128, false), roughness: 0.6 }), fx, BENCH + 1.65, NZ0 + 0.802, false);

  // ---------- shelving ----------
  function shelving(x, z0, z1, levels, facing) {
    const d = 0.44, cx = x + facing * d / 2, len = z1 - z0, cz = (z0 + z1) / 2;
    deco(0.02, 2.2, len, M.shelf, x + facing * 0.01, 1.1, cz);
    for (const z of [z0, cz, z1]) deco(d, 2.2, 0.03, M.shelf, cx, 1.1, z);
    for (const y of levels) block(d, 0.05, len, M.shelf, cx, y - 0.025, cz);
    return cx;
  }
  const storeX = shelving(X0, -3.5, 2.9, [0.42, 0.95, 1.46, 1.98], 1);
  const glassX = shelving(X1, -3.2, 1.0, [0.42, 0.95, 1.46, 1.98], -1);
  mesh(new THREE.PlaneGeometry(1.5, 0.3), std({ map: T.signTex(['ELEMENT STORAGE'], '#12202b', '#e8ecec', 768, 150, false), roughness: 0.6 }), X0 + 0.012, 2.45, -0.3, false).rotation.y = Math.PI / 2;
  mesh(new THREE.PlaneGeometry(1.2, 0.3), std({ map: T.signTex(['GLASSWARE'], '#12202b', '#e8ecec', 640, 150, false), roughness: 0.6 }), X1 - 0.012, 2.45, -1.1, false).rotation.y = -Math.PI / 2;

  // ---------- south wall: periodic table, first aid, door, restock ----------
  const tableTex = T.tableWall(G.have);
  G.tableTex = tableTex;
  mesh(new THREE.PlaneGeometry(4.6, 2.65), new THREE.MeshStandardMaterial({ map: tableTex, emissive: 0xffffff, emissiveMap: tableTex, emissiveIntensity: 0.55, roughness: 0.6 }), -0.6, 1.75, Z1 - 0.012, false).rotation.y = Math.PI;
  deco(4.72, 2.77, 0.03, M.darkSteel, -0.6, 1.75, Z1 - 0.002);
  // first aid
  block(0.5, 0.6, 0.16, M.white, 4.2, 1.45, Z1 - 0.08);
  mesh(new THREE.PlaneGeometry(0.34, 0.34), std({ map: T.signTex(['+'], '#1f8a4c', '#ffffff', 256, 256, false), roughness: 0.5 }), 4.2, 1.45, Z1 - 0.165, false).rotation.y = Math.PI;
  G.firstAid = V(4.2, 1.2, Z1 - 0.5);
  // door (decor)
  deco(1.0, 2.1, 0.06, std({ color: 0x66757c, roughness: 0.45 }), -5.4, 1.05, Z1 - 0.03);
  deco(1.16, 2.2, 0.04, M.darkSteel, -5.4, 1.1, Z1 - 0.012);
  deco(0.3, 0.45, 0.065, std({ color: 0x0c1418, roughness: 0.05, metalness: 0.6 }), -5.4, 1.55, Z1 - 0.03);
  deco(0.14, 0.025, 0.05, M.steel, -5.0, 1.02, Z1 - 0.07);
  mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: T.signTex(['MORE ROOMS SOON'], '#06140c', '#43ff8a', 512, 128, false) }), -5.4, 2.33, Z1 - 0.04, false).rotation.y = Math.PI;
  // restock lever on the west wall
  const rs = V(X0 + 0.06, 1.25, 3.6);
  deco(0.08, 0.3, 0.2, M.darkSteel, rs.x, rs.y, rs.z);
  const lever = cyl(0.012, 0.012, 0.2, M.red, rs.x + 0.08, rs.y, rs.z, 8); lever.rotation.z = 1.2;
  mesh(new THREE.PlaneGeometry(0.5, 0.16), std({ map: T.signTex(['RESTOCK LAB'], '#ffc21a', '#111111', 512, 150, false), roughness: 0.6 }), X0 + 0.013, 1.62, 3.6, false).rotation.y = Math.PI / 2;
  fixtures.push({ pos: V(rs.x + 0.1, rs.y, rs.z), r: 0.22, name: 'Restock', hint: () => 'Restock: fresh supplies and clean glassware', use: () => { lever.rotation.z = lever.rotation.z > 0 ? -1.2 : 1.2; G.hooks.restock(); } });
  // signs, extinguisher, clock
  mesh(new THREE.PlaneGeometry(0.7, 0.35), std({ map: T.signTex(['ADD ACID', 'TO WATER'], '#ffc21a', '#111111'), roughness: 0.6 }), 1.6, 2.35, Z0 + 0.014, false);
  mesh(new THREE.PlaneGeometry(0.7, 0.35), std({ map: T.signTex(['REACTIVE METALS:', 'TONGS ONLY'], '#c8201c', '#ffffff'), roughness: 0.6 }), X0 + 0.013, 2.45, -2.9, false).rotation.y = Math.PI / 2;
  const ext = cyl(0.07, 0.07, 0.42, M.red, 3.55, 1.0, Z0 + 0.1); void ext;
  mesh(new THREE.SphereGeometry(0.07, 16, 10), M.red, 3.55, 1.21, Z0 + 0.1);
  cyl(0.02, 0.02, 0.07, M.dark, 3.55, 1.3, Z0 + 0.1);
  // low steel table and pallet for the heavy things
  block(1.3, 0.04, 0.7, M.steel, 4.9, 0.46, 3.0);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) deco(0.04, 0.44, 0.04, M.darkSteel, 4.9 + a * 0.6, 0.22, 3.0 + b * 0.3);
  mesh(new THREE.PlaneGeometry(1.1, 0.26), std({ map: T.signTex(['HEAVY: LIFT WITH A FRIEND'], '#ffc21a', '#111111', 768, 150, false), roughness: 0.6 }), X1 - 0.013, 1.5, 3.4, false).rotation.y = -Math.PI / 2;
  // floor drain
  const drain = mesh(new THREE.CircleGeometry(0.09, 20), M.darkSteel, -4.4, 0.002, -3.4, false); drain.rotation.x = -Math.PI / 2;

  // ---------- stock the room ----------
  const mat = () => G.matter;
  function supplyJar(type, sub, mol, x, y, z, o = {}) {
    const s = SUB[sub];
    if (s.el) G.stocked.add(s.el);
    const it = mat().makeVessel(type, { label: o.label || s.name, formula: o.formula ?? s.formula, tags: [...(s.tags || [])], accent: o.accent, glass: o.glass });
    mat().fill(it, sub, mol, o.surf, o.pieceMol, o.shape);
    if (o.extra) for (const [id, m] of o.extra) mat().fill(it, id, m);
    mat().place(it, x, y, z, o.ry ?? 0);
    it.info = s;
    return it;
  }
  function populate() {
    const m = mat();
    G.stocked = new Set(['Si', 'Au']);
    // glassware on the first island
    const A = BENCH;
    [[-3.25, -0.3], [-2.95, -0.3], [-2.65, -0.3], [-2.35, -0.3]].forEach(([x, z]) => m.place(m.makeVessel('beaker250'), x, A, z));
    m.place(m.makeVessel('beaker600'), -1.85, A, -0.3); m.place(m.makeVessel('beaker600'), -1.45, A, -0.3);
    m.place(m.makeVessel('flask250'), -3.2, A, 0.28); m.place(m.makeVessel('flask250'), -2.85, A, 0.28);
    m.place(m.makeVessel('cylinder100'), -2.5, A, 0.3);
    m.place(m.makeVessel('crucible'), -2.15, A, 0.3); m.place(m.makeVessel('crucible'), -1.95, A, 0.3);
    m.place(m.makeVessel('dish'), -1.6, A, 0.3);
    // kitchen chemistry on the second island
    supplyJar('jar', 'nahco3', 2.4, 1.0, A, -0.3, { ry: Math.PI });
    supplyJar('bottle', 'water', 26.3, 1.32, A, -0.3, { label: 'Vinegar', formula: 'CH3COOH 5%', extra: [['acetic_acid', 0.415]], ry: Math.PI });
    m.place(m.makeVessel('beaker250'), 1.75, A, -0.25); m.place(m.makeVessel('beaker250'), 2.05, A, -0.25);
    supplyJar('bottle', 'water', 21.5, 2.5, A, -0.3, { label: 'Hydrogen peroxide', formula: 'H2O2 3%', extra: [['h2o2', 0.36]], glass: 'amber', ry: Math.PI });
    supplyJar('jar', 'yeast', 0.4, 2.85, A, -0.3, { formula: 'catalase', ry: Math.PI });
    supplyJar('dropper', 'indicator', 0.06, 3.2, A, -0.3, { formula: 'pH 1-14', ry: Math.PI });
    supplyJar('dropper', 'dye_blue', 0.03, 3.36, A, -0.18, { formula: '', ry: Math.PI });
    supplyJar('jar', 'sucrose', 0.6, 1.0, A, 0.3);
    supplyJar('jar', 'nacl', 3.4, 1.34, A, 0.3);
    supplyJar('jar', 'starch', 1.3, 1.68, A, 0.3);
    supplyJar('bottle', 'oil', 0.42, 2.1, A, 0.3);
    supplyJar('bottle', 'ethanol', 6.8, 2.5, A, 0.3);
    supplyJar('bottle', 'water', 27, 2.95, A, 0.3, { label: 'Distilled water' });
    // lighter by the burners
    m.place(m.makeProp('lighter'), -2.9, BENCH + 0.1, NZ0 + 0.5);
    // element storage, west wall. Labels face into the room.
    const ry = Math.PI / 2, sxp = storeX + 0.02;
    let z = -3.2;
    const row = (y) => { z = -3.2; return (fn) => { fn(z, y); z += 0.37; }; };
    let put = row(0.95);
    put((zz, y) => supplyJar('jar', 'sodium', 0.52, sxp, y, zz, { surf: CHUNK, pieceMol: 0.065, extra: [['oil', 0.2]], ry, accent: '#e0785a' }));
    put((zz, y) => supplyJar('jar', 'potassium', 0.18, sxp, y, zz, { surf: CHUNK, pieceMol: 0.03, extra: [['oil', 0.2]], ry, accent: '#e0785a' }));
    put((zz, y) => supplyJar('jar', 'lithium', 0.5, sxp, y, zz, { surf: CHUNK, pieceMol: 0.085, extra: [['oil', 0.2]], ry, accent: '#e0785a' }));
    put((zz, y) => supplyJar('jar', 'calcium', 0.5, sxp, y, zz, { surf: CHUNK, pieceMol: 0.06, ry, accent: '#e0a85a' }));
    put((zz, y) => supplyJar('jar', 'magnesium', 0.2, sxp, y, zz, { surf: 0.45, pieceMol: 0.02, shape: 'ribbon', ry, accent: '#e0a85a' }));
    put((zz, y) => supplyJar('jar', 'iron', 0.36, sxp, y, zz, { label: 'Iron nails', surf: CHUNK, pieceMol: 0.045, shape: 'nail', ry, accent: '#d89aa8' }));
    put((zz, y) => supplyJar('jar', 'copper', 0.3, sxp, y, zz, { label: 'Copper pieces', surf: CHUNK, pieceMol: 0.05, ry, accent: '#d89aa8' }));
    put((zz, y) => supplyJar('jar', 'carbon', 1.6, sxp, y, zz, { label: 'Charcoal lumps', surf: 0.45, pieceMol: 0.25, ry, accent: '#5fb4d8' }));
    put((zz, y) => supplyJar('jar', 'aluminium', 0.6, sxp, y, zz, { label: 'Aluminium foil', surf: CHUNK, pieceMol: 0.06, ry, accent: '#a9b6c4' }));
    put = row(1.46);
    put((zz, y) => supplyJar('jar', 'sulfur', 4.6, sxp, y, zz, { ry, accent: '#5fb4d8' }));
    put((zz, y) => supplyJar('jar', 'iron', 4.4, sxp, y, zz, { label: 'Iron filings', ry, accent: '#d89aa8' }));
    put((zz, y) => supplyJar('jar', 'phosphorus_red', 1.2, sxp, y, zz, { ry, accent: '#5fb4d8' }));
    put((zz, y) => supplyJar('jar', 'aluminium', 2.2, sxp, y, zz, { label: 'Aluminium powder', ry, accent: '#a9b6c4' }));
    put((zz, y) => supplyJar('jar', 'carbon', 5, sxp, y, zz, { label: 'Charcoal powder', ry, accent: '#5fb4d8' }));
    put((zz, y) => supplyJar('jar', 'copper', 2.3, sxp, y, zz, { label: 'Copper turnings', surf: 0.8, ry, accent: '#d89aa8' }));
    put((zz, y) => supplyJar('bottle', 'mercury', 5.2, sxp, y, zz, { ry, accent: '#d89aa8' }));
    put((zz, y) => { const l = m.makeLump('silicon', 1.1); m.place(l, sxp, y, zz); });
    put((zz, y) => { const l = m.makeLump('gold', 0.26); m.place(l, sxp, y, zz); });
    // spare glassware, east wall
    let gz = -2.9;
    for (const t of ['beaker250', 'beaker250', 'beaker250', 'beaker600', 'flask250', 'flask250', 'cylinder100', 'crucible', 'dish', 'beaker250']) { m.place(m.makeVessel(t), glassX - 0.02, 0.95, gz); gz += 0.38; }
    gz = -2.9;
    for (const t of ['beaker600', 'beaker250', 'flask250', 'crucible', 'beaker250', 'beaker600']) { m.place(m.makeVessel(t), glassX - 0.02, 1.46, gz); gz += 0.5; }
    // things to test your back on
    m.place(m.makeLump('iron', 143, { shape: 'ingot' }), 4.6, 0.48, 3.0);       // 8 kg
    m.place(m.makeLump('gold', 63, { shape: 'ingot' }), 5.2, 0.48, 3.0, 0.4);   // 12.4 kg
    m.place(m.makeLump('copper', 63, { shape: 'ingot' }), 4.9, 0.48, 2.8, -0.3); // 4 kg
    m.place(m.makeLump('iron', 448, { shape: 'ingot' }), 3.9, 0, 3.9, 0.2);     // 25 kg
    m.place(m.makeProp('crate'), 5.9, 0, 2.2, 0.2); m.place(m.makeProp('crate'), 5.9, 0.37, 2.2, -0.1); m.place(m.makeProp('crateS'), 5.3, 0, 2.0, 0.5);
    m.place(m.makeProp('crateS'), 0.2, 0, 2.6, 0.3);
    m.place(m.makeProp('gascyl'), 6.4, 0, 4.2); m.place(m.makeProp('barrel'), 5.5, 0, 4.2);
  }

  G.fixtureSources = (arr) => { for (const b of burners) if (b.on) arr.push({ pos: b.pos, r: 0.07, T: 1500, k: 0.5, flame: true }); G.extraSources(arr); };
  function reset() { tap.on = false; for (const b of burners) { b.on = false; b.fl.visible = false; } plate.set = 0; pan.tare = 0; }
  function update(dt, t) { for (const u of updaters) u(dt, t); }
  return { populate, update, reset, M, burners, plate, tap, spout };
}
