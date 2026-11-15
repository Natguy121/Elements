import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as T from './textures.js';
import { CONTENT } from './data.js';
import { Particles, rnd, rs } from './fx.js';
import { makeRobot, animateRobot } from './robot.js';

// Builds the whole lab: room, bench, six stations, door, delivery box, clutter.
// Everything is procedural geometry with physically based materials.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BENCH = 0.92; // bench top height
export const STATION_X = { balloon: -4.0, burner: -2.8, zap: -1.6, water: -0.4, mic: 0.8, mix: 2.0 };

export function buildLab(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090b);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.38;

  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 60);
  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.38, 0.7, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const ptex = T.particleTextures();
  const P = new Particles(scene, ptex);

  // ---------- materials ----------
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const wallT = T.wallTex(), floorT = T.floorTex(8, 7.6);
  const M = {
    wall: std({ map: wallT, bumpMap: wallT, bumpScale: 0.5, color: 0xd6dcda, roughness: 0.9 }),
    floor: std({ map: floorT, bumpMap: floorT, bumpScale: 0.7, roughnessMap: floorT, roughness: 0.5, envMapIntensity: 1.4 }),
    ceiling: std({ color: 0xeceeed, roughness: 1 }),
    benchTop: std({ color: 0x131618, roughness: 0.2 }),
    cabinet: std({ color: 0xe6ebea, roughness: 0.42 }),
    dark: std({ color: 0x1b1e21, roughness: 0.6 }),
    steel: std({ color: 0xc9ced3, metalness: 1, roughness: 0.26 }),
    darkSteel: std({ color: 0x4b5157, metalness: 1, roughness: 0.42 }),
    brass: std({ color: 0xcfa640, metalness: 1, roughness: 0.3 }),
    copper: std({ color: 0xc8703a, metalness: 1, roughness: 0.35 }),
    plastic: std({ color: 0x17191b, roughness: 0.45 }),
    rubber: std({ color: 0x0d0d0e, roughness: 0.9 }),
    ceramic: std({ color: 0xf2f0ea, roughness: 0.25 }),
    red: phys({ color: 0xc8201c, roughness: 0.3, clearcoat: 0.7 }),
    yellow: phys({ color: 0xffc21a, roughness: 0.35, clearcoat: 0.5 }),
    wood: std({ color: 0xcdb48a, roughness: 0.6 }),
    door: std({ color: 0x6a777d, roughness: 0.45 }),
    panelLight: std({ color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 2.6 }),
    glass: phys({ color: 0xffffff, roughness: 0.03, transmission: 1, thickness: 0.012, ior: 1.5, side: THREE.DoubleSide, envMapIntensity: 1.4 }),
    amber: phys({ color: 0xa65e1c, roughness: 0.06, transmission: 0.85, thickness: 0.05, ior: 1.5, envMapIntensity: 1.3 }),
    // "thin" glass is plain alpha so that things inside it (bubbles, glow, flames) still draw
    thinGlass: std({ color: 0xdff2f5, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2 }),
  };
  const liquid = (c) => std({ color: c, roughness: 0.12, emissive: c, emissiveIntensity: 0.1 });

  // ---------- mesh helpers ----------
  let cur = null; // parent that new meshes go into (the scene, or a station that has been moved)
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = cur || scene) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const box = (w, h, d, mat, x, y, z, p) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p);
  const cyl = (rt, rb, h, mat, x, y, z, p, seg = 28, open = false) => add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat, x, y, z, p);
  const sph = (r, mat, x, y, z, p) => add(new THREE.SphereGeometry(r, 28, 18), mat, x, y, z, p);
  const lathe = (pts, mat, x, y, z, p, seg = 36) => add(new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(r, yy)), seg), mat, x, y, z, p);
  const plane = (w, h, mat, x, y, z, p) => add(new THREE.PlaneGeometry(w, h), mat, x, y, z, p);
  const noShadow = (m) => { m.traverse((o) => { o.userData.noShadow = true; }); return m; };
  const group = (x = 0, y = 0, z = 0, p = cur || scene) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; };
  const tube = (pts, r, mat, p = cur || scene) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => V(...q))), 24, r, 8), mat, 0, 0, 0, p);

  const flickMat = std({ color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 2.6 });
  // ---------- room ----------
  const floor = plane(10.3, 9.8, M.floor, 0, 0, -0.75);
  floor.rotation.x = -Math.PI / 2;
  const ceil = plane(10.3, 7.3, M.ceiling, 0, 3.2, 0.5);
  ceil.rotation.x = Math.PI / 2;
  box(8.2, 3.2, 0.15, M.wall, -0.9, 1.6, -3.075);
  box(0.8, 3.2, 0.15, M.wall, 4.6, 1.6, -3.075);
  box(1.0, 1.1, 0.15, M.wall, 3.7, 2.65, -3.075);
  box(0.15, 3.2, 7.3, M.wall, -5.075, 1.6, 0.5);
  box(0.15, 3.2, 7.3, M.wall, 5.075, 1.6, 0.5);
  box(10.3, 3.2, 0.15, M.wall, 0, 1.6, 4.075);
  box(8.2, 0.1, 0.02, M.dark, -0.9, 0.05, -2.99);
  box(0.02, 0.1, 7, M.dark, -4.99, 0.05, 0.5);
  box(0.02, 0.1, 7, M.dark, 4.99, 0.05, 0.5);
  [[-3, -0.9], [0.2, -0.9], [-3, 1.6], [0.2, 1.6], [3.4, 0.4]].forEach(([x, z]) => {
    noShadow(box(1.5, 0.03, 0.5, x > 3 ? flickMat : M.panelLight, x, 3.19, z));
    box(1.6, 0.04, 0.6, M.steel, x, 3.2, z);
  });
  // hallway behind the door
  const hallMat = std({ color: 0x9fb3b0, roughness: 0.9 });
  box(2.2, 2.9, 0.1, hallMat, 3.7, 1.45, -5.5);
  box(0.1, 2.9, 2.5, hallMat, 2.65, 1.45, -4.3);
  box(0.1, 2.9, 2.5, hallMat, 4.75, 1.45, -4.3);
  box(2.2, 0.1, 2.5, hallMat, 3.7, 2.9, -4.3);
  noShadow(box(0.9, 0.03, 0.3, std({ color: 0xffffff, emissive: 0xfff0d0, emissiveIntensity: 4 }), 3.7, 2.84, -4.2));
  const hallLight = new THREE.PointLight(0xffe6c0, 5, 7, 2);
  hallLight.position.set(3.7, 2.4, -4.2);
  scene.add(hallLight);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x7a7f86, 0.38));
  const key = new THREE.SpotLight(0xfff3e2, 42, 14, 1.12, 0.75, 2);
  key.position.set(-0.6, 3.1, 0.9);
  key.target.position.set(-0.9, 0.9, -2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 10;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xdfeaff, 5, 12, 2);
  fill.position.set(2.6, 2.8, 0.6);
  scene.add(fill);
  const fxLight = new THREE.PointLight(0xffffff, 0, 9, 2);
  scene.add(fxLight);

  // ---------- bench ----------
  box(7.4, 0.05, 0.85, M.benchTop, -1.1, BENCH - 0.025, -2.575);
  box(7.4, 0.8, 0.78, M.cabinet, -1.1, 0.47, -2.61);
  box(7.4, 0.07, 0.7, M.dark, -1.1, 0.035, -2.65);
  box(7.4, 0.14, 0.03, M.benchTop, -1.1, BENCH + 0.07, -2.985);
  box(7.4, 0.012, 0.012, M.dark, -1.1, 0.7, -2.217);
  for (let i = 0; i < 12; i++) {
    const x = -4.8 + i * (7.4 / 12);
    box(0.012, 0.8, 0.012, M.dark, x, 0.47, -2.217);
    box(0.016, 0.16, 0.03, M.steel, x + (i % 2 ? 0.08 : 7.4 / 12 - 0.08), 0.52, -2.205);
    box(0.16, 0.016, 0.03, M.steel, x + 7.4 / 24, 0.79, -2.205);
  }
  [-3.4, -2.6, -2.2, -1.0, 0.2, 1.4].forEach((x) => { // gas taps along the back
    cyl(0.018, 0.022, 0.09, M.yellow, x, BENCH + 0.045, -2.9);
    box(0.06, 0.014, 0.02, M.dark, x, BENCH + 0.095, -2.9);
  });

  // ---------- glassware factories ----------
  function beaker(h = 0.12, r = 0.045, liq = null, fill = 0.5, p = scene) {
    const g = group(0, 0, 0, p);
    noShadow(lathe([[0, 0.002], [r, 0.002], [r, h * 0.96], [r * 1.08, h]], M.glass, 0, 0, 0, g));
    if (liq) cyl(r * 0.93, r * 0.93, h * fill, liquid(liq), 0, h * fill / 2 + 0.005, 0, g);
    return g;
  }
  function erlen(h = 0.17, r = 0.058, liq = null, fill = 0.45, p = scene) {
    const g = group(0, 0, 0, p);
    noShadow(lathe([[0, 0.002], [r, 0.002], [r, 0.014], [r * 0.3, h * 0.72], [r * 0.3, h], [r * 0.37, h + 0.005]], M.glass, 0, 0, 0, g));
    if (liq) {
      const hh = h * 0.72 * fill, rt = r - (r - r * 0.3) * fill;
      cyl(rt * 0.92, r * 0.93, hh, liquid(liq), 0, hh / 2 + 0.008, 0, g);
    }
    return g;
  }
  function bottle(h = 0.2, r = 0.04, mat = M.amber, liq = 0x3a2208, capMat = M.plastic, p = scene) {
    const g = group(0, 0, 0, p);
    noShadow(lathe([[0, 0.002], [r, 0.002], [r, h * 0.62], [r * 0.38, h * 0.78], [r * 0.38, h * 0.94]], mat, 0, 0, 0, g));
    cyl(r * 0.88, r * 0.88, h * 0.4, liquid(liq), 0, h * 0.2 + 0.006, 0, g);
    cyl(r * 0.44, r * 0.44, h * 0.08, capMat, 0, h * 0.97, 0, g);
    return g;
  }
  const place = (g, x, y, z, ry = 0) => { g.position.set(x, y, z); g.rotation.y = ry; return g; };

  // ---------- shelves + clutter ----------
  const shelfMat = std({ color: 0xf1f1ee, roughness: 0.5 });
  const liquids = [0xbfd9e6, 0x9fb9c9, 0xc9a86a, 0xdfe7ea, 0x7f99a8, 0xb98d4f, 0xcfd8dc];
  const bookCols = [0x3a4652, 0x55606a, 0x6b6558, 0x2f3a44, 0x7a7468, 0x444a50];
  [1.93, 2.42].forEach((y, row) => {
    box(4.9, 0.035, 0.3, shelfMat, -2.3, y, -2.85);
    [-4.5, -2.3, -0.1].forEach((x) => box(0.02, 0.1, 0.24, M.steel, x, y - 0.065, -2.87));
    let x = -4.6;
    let i = row * 5;
    while (x < -0.1) {
      const kind = (i * 7 + row * 3) % 6;
      const yy = y + 0.018, zz = -2.85 + rs(0.03);
      if (kind === 0 || kind === 3) { const r = rnd(0.035, 0.05); place(bottle(rnd(0.17, 0.25), r, M.amber, 0x2a1705), x + r, yy, zz); x += r * 2 + 0.03; }
      else if (kind === 1) { place(erlen(rnd(0.15, 0.2), 0.06, liquids[i % 7], rnd(0.3, 0.7)), x + 0.06, yy, zz); x += 0.15; }
      else if (kind === 2) { place(bottle(rnd(0.16, 0.24), 0.042, M.glass, liquids[(i + 3) % 7], M.plastic), x + 0.045, yy, zz); x += 0.12; }
      else if (kind === 4) { place(beaker(rnd(0.1, 0.14), 0.05, liquids[(i + 5) % 7], rnd(0.3, 0.7)), x + 0.05, yy, zz); x += 0.13; }
      else { // a few books, one leaning
        for (let b = 0; b < 4; b++) {
          const w = rnd(0.03, 0.05), h = rnd(0.2, 0.27);
          const bk = box(w, h, 0.19, std({ color: bookCols[(i + b) % 6], roughness: 0.7 }), x + w / 2, yy + h / 2, -2.87);
          if (b === 3) { bk.rotation.z = -0.22; bk.position.x += 0.03; bk.position.y -= 0.004; }
          x += w + 0.004;
        }
        x += 0.07;
      }
      x += rnd(0.02, 0.09);
      i++;
    }
  });
  // bench clutter between the stations
  const rack = group(-3.42, BENCH, -2.82);
  box(0.26, 0.012, 0.07, M.wood, 0, 0.09, 0, rack); box(0.26, 0.012, 0.07, M.wood, 0, 0.006, 0, rack);
  box(0.012, 0.1, 0.07, M.wood, -0.125, 0.05, 0, rack); box(0.012, 0.1, 0.07, M.wood, 0.125, 0.05, 0, rack);
  for (let i = 0; i < 5; i++) {
    noShadow(lathe([[0, 0], [0.011, 0.008], [0.012, 0.15], [0.014, 0.152]], M.glass, -0.09 + i * 0.045, 0.014, 0, rack, 16));
    cyl(0.009, 0.009, 0.04 + (i % 3) * 0.025, liquid(liquids[i]), -0.09 + i * 0.045, 0.04 + (i % 3) * 0.0125, 0, rack, 12);
  }
  // Loose props: everything registered here can be picked up, thrown, dunked, burnt, frozen or broken.
  const props = [];
  const prop = (obj, o) => { props.push([obj, o]); return obj; };
  const GL = (r) => ({ r, kind: 'glass', fragile: true, name: 'glassware' });
  prop(place(beaker(0.13, 0.05, 0xbfd9e6, 0.6), -3.4, BENCH, -2.62, 0.3), GL(0.065));
  prop(place(erlen(0.19, 0.065, 0xc9a86a, 0.5), -2.2, BENCH, -2.82), GL(0.085));
  prop(place(beaker(0.09, 0.035, 0xdfe7ea, 0.4), -2.32, BENCH, -2.68), GL(0.045));
  prop(place(erlen(0.15, 0.05, 0x9fb9c9, 0.55), 0.3, BENCH, -2.84), GL(0.07));
  prop(place(beaker(0.14, 0.055, 0xcfd8dc, 0.35), 0.18, BENCH, -2.36), GL(0.07));
  prop(place(bottle(0.22, 0.045, M.amber, 0x2a1705), 2.46, BENCH, -2.85), GL(0.09));
  prop(place(erlen(0.16, 0.055, 0xc9a86a, 0.6), 2.42, BENCH, -2.4), GL(0.075));
  prop(place(beaker(0.12, 0.05, 0x9fb9c9, 0.5), -2.0, BENCH, 1.2), GL(0.06));
  prop(place(erlen(0.17, 0.06, 0xdfe7ea, 0.4), -3.2, BENCH, 0.75), GL(0.08));
  prop(place(beaker(0.11, 0.045, 0xc9a86a, 0.6), 2.8, BENCH, 1.85), GL(0.055));
  prop(place(bottle(0.2, 0.042, M.amber, 0x2a1705), 1.56, BENCH, 1.3), GL(0.085));
  prop(place(erlen(0.16, 0.055, 0xbfd9e6, 0.5), 3.62, BENCH, 2.62), GL(0.075));
  prop(place(beaker(0.13, 0.055, 0xdfe7ea, 0.3), -0.9, BENCH, -2.38), GL(0.065));
  prop(place(bottle(0.24, 0.05, M.glass, 0x9fb9c9), 1.25, BENCH, -2.42), GL(0.1));
  // books, weights, boxes, a cannonball nobody will explain
  const bookAt = (x, y, z, ry, c) => { const g = group(x, y, z); g.rotation.y = ry; box(0.23, 0.036, 0.16, std({ color: c, roughness: 0.75 }), 0, 0.018, 0, g); box(0.22, 0.028, 0.15, M.ceramic, 0.004, 0.018, 0, g); prop(g, { r: 0.05, kind: 'paper', name: 'book' }); };
  bookAt(4.62, BENCH, 2.18, 0.2, 0x3a4652); bookAt(4.62, BENCH + 0.037, 2.18, -0.1, 0x6b6558); bookAt(4.62, BENCH + 0.074, 2.18, 0.35, 0x2f3a44);
  bookAt(-0.2, BENCH, -2.8, 0.5, 0x55606a); bookAt(-3.1, BENCH, 1.25, -0.4, 0x7a7468);
  [[2.75, 1.32, 0.03], [2.86, 1.36, 0.024], [2.8, 1.25, 0.018]].forEach(([x, z, r]) => { const g = group(x, BENCH, z); cyl(r, r * 1.05, r * 2, M.brass, 0, r, 0, g); cyl(r * 0.4, r * 0.4, r * 0.5, M.brass, 0, r * 2.2, 0, g); prop(g, { r: r * 1.3, kind: 'metal', name: 'brass weight' }); });
  const ball = group(-0.4, 0, -1.9); sph(0.1, std({ color: 0x2a2d31, metalness: 1, roughness: 0.45 }), 0, 0.1, 0, ball); prop(ball, { r: 0.1, kind: 'metal', name: 'cannonball' });
  const cardM = std({ map: T.cardboardTex(true), roughness: 0.85 });
  [[4.45, 0, 0.62, 0.1], [4.42, 0, 1.2, -0.15], [4.46, 0.36, 0.9, 0.3]].forEach(([x, y, z, ry]) => { const g = group(x, y, z); g.rotation.y = ry; box(0.46, 0.36, 0.4, cardM, 0, 0.18, 0, g); prop(g, { r: 0.18, kind: 'paper', name: 'cardboard box' }); });
  const pot = group(3.68, BENCH, 2.15); cyl(0.06, 0.045, 0.09, std({ color: 0x8a5a44, roughness: 0.85 }), 0, 0.045, 0, pot); sph(0.05, std({ color: 0x5c7a5a, roughness: 0.8 }), 0, 0.14, 0, pot).scale.set(1, 1.5, 1); prop(pot, { r: 0.08, kind: 'ceramic', fragile: true, name: 'cactus' });
  const clip = group(1.9, BENCH, 1.75); clip.rotation.y = 0.4; box(0.2, 0.01, 0.28, std({ color: 0x5a4632, roughness: 0.7 }), 0, 0.005, 0, clip); box(0.18, 0.004, 0.25, M.ceramic, 0, 0.012, -0.005, clip); box(0.08, 0.016, 0.03, M.steel, 0, 0.018, 0.125, clip); prop(clip, { r: 0.04, kind: 'paper', name: 'clipboard' });
  // mug
  const mug = group(-1.02, BENCH, -2.86);
  cyl(0.04, 0.036, 0.09, M.ceramic, 0, 0.045, 0, mug);
  cyl(0.034, 0.034, 0.004, std({ color: 0x1c0f08, roughness: 0.15 }), 0, 0.086, 0, mug);
  const handle = add(new THREE.TorusGeometry(0.026, 0.007, 10, 20, Math.PI), M.ceramic, 0.04, 0.045, 0, mug);
  handle.rotation.z = -Math.PI / 2;
  prop(mug, { r: 0.05, kind: 'ceramic', fragile: true, name: 'mug' });
  // microscope
  const ms = group(1.48, BENCH, -2.82);
  ms.rotation.y = -0.5;
  box(0.14, 0.02, 0.18, M.dark, 0, 0.01, 0, ms);
  const arm = box(0.03, 0.26, 0.04, M.ceramic, 0, 0.14, -0.06, ms); arm.rotation.x = 0.18;
  box(0.1, 0.008, 0.1, M.dark, 0, 0.11, 0.02, ms);
  const scopeTube = cyl(0.018, 0.018, 0.16, M.darkSteel, 0, 0.26, -0.01, ms); scopeTube.rotation.x = 0.5;
  cyl(0.012, 0.016, 0.04, M.steel, 0, 0.165, 0.035, ms);
  cyl(0.022, 0.022, 0.03, M.plastic, 0, 0.335, -0.052, ms).rotation.x = 0.5;
  prop(ms, { r: 0.13, kind: 'metal', name: 'microscope' });
  // fire extinguisher, bin
  const ext = group(2.92, 0.95, -2.9);
  cyl(0.075, 0.075, 0.42, M.red, 0, 0, 0, ext); sph(0.075, M.red, 0, 0.21, 0, ext);
  cyl(0.02, 0.02, 0.08, M.dark, 0, 0.3, 0, ext); box(0.1, 0.02, 0.03, M.dark, 0.03, 0.35, 0, ext);
  const tag = plane(0.13, 0.1, std({ map: T.signTex(['EMPTY', '(AGAIN)'], '#fff8d8', '#b01818', 256, 200), roughness: 0.8 }), 0, 0.0, 0.078, ext);
  tag.rotation.z = -0.12;
  prop(ext, { r: 0.13, base: 0.21, kind: 'metal', pinned: true, name: 'fire extinguisher' });
  const bin = group(2.92, 0, -2.45);
  cyl(0.15, 0.12, 0.34, M.darkSteel, 0, 0.17, 0, bin, 24, true).material = std({ color: 0x4b5157, metalness: 1, roughness: 0.42, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) add(new THREE.IcosahedronGeometry(0.05, 0), M.ceramic, rs(0.06), 0.27 + rnd(0.07), rs(0.06), bin).rotation.set(rnd(3), rnd(3), 0);
  prop(bin, { r: 0.16, kind: 'metal', name: 'bin' });
  // whiteboard, clock, signs, poster
  box(1.94, 1.08, 0.03, M.steel, 1.4, 1.95, -2.985);
  plane(1.86, 1.0, std({ map: T.whiteboardTex(), roughness: 0.25 }), 1.4, 1.95, -2.968);
  box(1.2, 0.02, 0.06, M.steel, 1.4, 1.4, -2.96);
  box(0.1, 0.03, 0.04, M.dark, 1.1, 1.425, -2.955); cyl(0.008, 0.008, 0.11, M.red, 1.5, 1.42, -2.95).rotation.z = 1.57;
  const clock = cyl(0.17, 0.17, 0.03, M.dark, 2.78, 2.62, -2.98); clock.rotation.x = Math.PI / 2;
  add(new THREE.CircleGeometry(0.155, 40), std({ map: T.clockTex(), roughness: 0.4 }), 2.78, 2.62, -2.963);
  const hands = [[0.075, 0.012], [0.115, 0.008], [0.125, 0.003]].map(([len, w], i) => {
    const h = group(2.78, 2.62, -2.96 + i * 0.002);
    box(w, len, 0.002, i === 2 ? M.red : M.dark, 0, len / 2 - 0.012, 0, h);
    return h;
  });
  // ceiling fan
  const fan = group(-1.3, 3.2, 0.5);
  cyl(0.015, 0.015, 0.22, M.darkSteel, 0, -0.11, 0, fan);
  const rotor = group(0, -0.24, 0, fan);
  cyl(0.09, 0.09, 0.06, M.darkSteel, 0, 0, 0, rotor);
  for (let i = 0; i < 4; i++) { const b = box(0.62, 0.012, 0.13, std({ color: 0xdfe3e2, roughness: 0.5 }), 0, 0, 0, group(0, 0, 0, rotor)); b.position.x = 0.4; b.rotation.x = 0.14; b.parent.rotation.y = i * Math.PI / 2; }
  // monitor with a live trace, where the microphone used to be
  const scopeCv = document.createElement('canvas'); scopeCv.width = 256; scopeCv.height = 160;
  const scopeG = scopeCv.getContext('2d');
  const scopeTex = new THREE.CanvasTexture(scopeCv); scopeTex.colorSpace = THREE.SRGBColorSpace;
  const mon = group(0.8, BENCH, -2.74);
  box(0.2, 0.015, 0.14, M.plastic, 0, 0.008, 0, mon); box(0.03, 0.14, 0.03, M.plastic, 0, 0.08, -0.03, mon);
  box(0.46, 0.3, 0.03, M.plastic, 0, 0.3, 0, mon);
  noShadow(plane(0.42, 0.26, new THREE.MeshBasicMaterial({ map: scopeTex }), 0, 0.3, 0.017, mon));
  box(0.36, 0.012, 0.12, M.plastic, 0, 0.006, 0.2, mon);
  let scopeT = 0;
  function drawScope(t) {
    const g = scopeG;
    g.fillStyle = '#06100c'; g.fillRect(0, 0, 256, 160);
    g.strokeStyle = 'rgba(80,160,120,.18)'; g.lineWidth = 1;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 160); g.moveTo(0, i * 20); g.lineTo(256, i * 20); g.stroke(); }
    g.strokeStyle = '#9dffc8'; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x <= 256; x += 4) { const y = 84 + Math.sin(x * 0.06 + t * 4) * 26 * Math.sin(x * 0.012 + t) + Math.sin(x * 0.3 + t * 9) * 4; g[x ? 'lineTo' : 'moveTo'](x, y); }
    g.stroke();
    g.fillStyle = '#9dffc8'; g.font = '700 12px monospace'; g.fillText('SCIENCE LEVEL: ' + (60 + Math.round(Math.sin(t * 0.7) * 30 + 30)) + '%', 10, 18);
    if (Math.floor(t * 2) % 2) g.fillText('REC', 220, 18);
    scopeTex.needsUpdate = true;
  }
  // a spare robot on charge in the corner, so you can see what you look like
  const spare = makeRobot(0x9dffc8);
  spare.position.set(-4.35, 0, 3.2); spare.rotation.y = 2.3;
  scene.add(spare);
  box(0.5, 0.03, 0.5, M.darkSteel, -4.35, 0.015, 3.2);
  tube([[-4.35, 0.03, 3.45], [-4.6, 0.02, 3.7], [-4.9, 0.3, 3.8]], 0.012, M.rubber);
  // liquid nitrogen dewar
  const dewarAt = V(-4.2, 0, -1.1);
  const dw = group(dewarAt.x, 0, dewarAt.z);
  box(0.5, 0.04, 0.5, M.darkSteel, 0, 0.33, 0, dw);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(0.04, 0.33, 0.04, M.darkSteel, a * 0.2, 0.165, b * 0.2, dw));
  cyl(0.22, 0.2, 0.58, M.steel, 0, 0.64, 0, dw, 32, true).material = std({ color: 0xc9ced3, metalness: 1, roughness: 0.22, side: THREE.DoubleSide });
  add(new THREE.TorusGeometry(0.22, 0.014, 10, 32), M.steel, 0, 0.93, 0, dw).rotation.x = Math.PI / 2;
  noShadow(cyl(0.2, 0.2, 0.01, std({ color: 0xeaf6ff, roughness: 0.2, emissive: 0xbfe4ff, emissiveIntensity: 0.25 }), 0, 0.86, 0, dw));
  plane(0.3, 0.1, std({ map: T.signTex(['LIQUID NITROGEN', '-196 °C. NOT A DRINK.'], '#e8eef2', '#16233a', 512, 170, false), roughness: 0.5 }), 0, 0.6, 0.218, dw);
  plane(0.62, 0.31, std({ map: T.signTex(['SAFETY', 'THIRD'], '#ffc21a', '#111111'), roughness: 0.5 }), 4.6, 1.8, -2.997);
  noShadow(box(0.9, 0.2, 0.05, std({ color: 0x08130c, emissive: 0xffffff, emissiveMap: T.signTex(['DELIVERIES'], '#03140a', '#43ff8a', 512, 128, false), emissiveIntensity: 1.6 }), 3.7, 2.33, -2.975));
  const poster = plane(1.7, 1.06, std({ map: T.posterTex(), roughness: 0.6 }), -4.995, 1.85, -0.7);
  poster.rotation.y = Math.PI / 2;
  // storage cabinet, right wall
  const cab = group(4.7, 0, -0.6);
  box(0.55, 2.0, 1.3, std({ color: 0x8c949a, metalness: 0.7, roughness: 0.42 }), 0, 1.0, 0, cab);
  box(0.012, 1.9, 0.012, M.dark, -0.28, 1.0, 0, cab);
  box(0.02, 0.2, 0.02, M.steel, -0.29, 1.05, 0.06, cab); box(0.02, 0.2, 0.02, M.steel, -0.29, 1.05, -0.06, cab);
  const flam = plane(0.5, 0.25, std({ map: T.signTex(['FLAMMABLE', '(SO IS EVERYTHING ELSE)'], '#c8201c', '#ffffff'), roughness: 0.5 }), -0.281, 1.55, 0.33, cab);
  flam.rotation.y = -Math.PI / 2;
  // big gas cylinders, left wall
  [[-4.72, 0.3, 0x2b6a3a], [-4.72, 0.02, 0x30343a]].forEach(([x, z, c]) => {
    const m = phys({ color: c, roughness: 0.35, metalness: 0.3, clearcoat: 0.4 });
    cyl(0.12, 0.12, 1.3, m, x, 0.65, z); sph(0.12, m, x, 1.3, z); cyl(0.035, 0.04, 0.12, M.brass, x, 1.46, z);
  });
  box(0.04, 0.03, 0.7, M.darkSteel, -4.58, 0.95, 0.16);
  // stool with a bunch of party balloons tied to it
  const stool = group(4.55, 0, -2.45);
  cyl(0.17, 0.17, 0.05, M.plastic, 0, 0.64, 0, stool);
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.78; const leg = cyl(0.012, 0.012, 0.66, M.steel, Math.cos(a) * 0.15, 0.32, Math.sin(a) * 0.15, stool); leg.rotation.z = -Math.cos(a) * 0.14; leg.rotation.x = Math.sin(a) * 0.14; }
  add(new THREE.TorusGeometry(0.16, 0.008, 8, 28), M.steel, 0, 0.25, 0, stool).rotation.x = Math.PI / 2;
  prop(stool, { r: 0.2, kind: 'metal', name: 'stool' });

  // ---------- balloons ----------
  const balloonGeo = (() => {
    const pts = [[0, 0], [0.012, 0], [0.005, 0.014]];
    for (let i = 0; i <= 26; i++) { const t = i / 26; pts.push([0.005 + 0.168 * Math.sin(Math.PI * Math.pow(t, 1.3)) * (i === 26 ? 0 : 1), 0.016 + t * 0.43]); }
    return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 36);
  })();
  const stringMat = new THREE.LineBasicMaterial({ color: 0xe8e8e8 });
  function makeBalloon(color, stringLen = 0.55) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(balloonGeo, phys({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.2 }));
    g.add(m);
    g.userData.skin = m;
    if (stringLen) {
      const pts = [];
      for (let i = 0; i <= 10; i++) pts.push(V(Math.sin(i * 1.3) * 0.012, -i / 10 * stringLen, Math.cos(i * 0.9) * 0.012));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), stringMat);
      g.add(line);
      g.userData.string = line;
    }
    return g;
  }
  const partyCols = [0xe8e8e6, 0x8c949a, 0x2a2e33, 0xffc21a, 0xbfc6cb];
  const party = partyCols.map((c, i) => {
    const b = makeBalloon(c, 0);
    const a = i * 1.26;
    b.position.set(-4.6 + Math.cos(a) * 0.15, 1.5 + (i % 3) * 0.15, -2.42 + Math.sin(a) * 0.13);
    b.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    scene.add(b);
    const geo = new THREE.BufferGeometry().setFromPoints([b.position.clone(), V(-4.6, BENCH + 0.05, -2.42)]);
    const str = new THREE.Line(geo, stringMat);
    scene.add(str);
    prop(b, { r: 0.2, kind: 'balloon', buoy: 11.6, pinned: true, name: 'balloon', onGrab: () => { str.visible = false; } });
    return b;
  });

  cyl(0.035, 0.045, 0.05, M.darkSteel, -4.6, BENCH + 0.025, -2.42); // weight the party balloons are tied to

  // ---------- station placement ----------
  // Stations are modelled at bench coordinates, then some are moved out onto their own tables
  // around the room so the player has to walk around and find them.
  const OFF = { balloon: [1.4, 3.55], burner: [0, 0], zap: [3.8, 4.15], water: [0, 0], mic: [3.2, 4.95], mix: [0, 0] };
  const stationPos = {};
  Object.keys(STATION_X).forEach((id) => { stationPos[id] = { x: STATION_X[id] + OFF[id][0], z: -2.55 + OFF[id][1] }; });
  stationPos.cryo = { x: dewarAt.x, z: dewarAt.z };
  const off = (id) => V(OFF[id][0], 0, OFF[id][1]);
  function stationGroup(id, tableW = 1.6, cx = 0) {
    cur = null;
    const g = group(OFF[id][0], 0, OFF[id][1]);
    cur = g;
    const x = STATION_X[id] + cx;
    box(tableW, 0.05, 0.9, M.benchTop, x, BENCH - 0.025, -2.575);
    box(tableW - 0.1, 0.03, 0.8, M.steel, x, 0.3, -2.575);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(0.05, BENCH - 0.05, 0.05, M.steel, x + a * (tableW / 2 - 0.05), (BENCH - 0.05) / 2, -2.575 + b * 0.4));
    return g;
  }
  // trolley where the current sample waits
  const home = V(0.9, BENCH, -0.9);
  box(0.6, 0.04, 0.5, M.steel, home.x, BENCH - 0.02, home.z);
  box(0.56, 0.03, 0.46, M.steel, home.x, 0.3, home.z);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { cyl(0.015, 0.015, BENCH - 0.1, M.steel, home.x + a * 0.27, (BENCH - 0.1) / 2 + 0.06, home.z + b * 0.22); cyl(0.035, 0.035, 0.03, M.rubber, home.x + a * 0.27, 0.035, home.z + b * 0.22).rotation.z = Math.PI / 2; });

  // ---------- station: balloon ----------
  stationGroup('balloon');
  const SX = STATION_X;
  const nozzle = V(SX.balloon, 1.245, -2.5);
  cyl(0.085, 0.095, 0.03, M.darkSteel, SX.balloon, BENCH + 0.015, -2.5);
  cyl(0.012, 0.012, 0.27, M.steel, SX.balloon, BENCH + 0.16, -2.5);
  cyl(0.007, 0.015, 0.045, M.brass, SX.balloon, 1.222, -2.5);
  tube([[SX.balloon, BENCH + 0.04, -2.5], [SX.balloon - 0.12, BENCH + 0.012, -2.42], [SX.balloon - 0.28, BENCH + 0.012, -2.43], [SX.balloon - 0.36, BENCH + 0.05, -2.4]], 0.008, M.rubber);
  const bbox = group(SX.balloon + 0.36, BENCH, -2.62);
  bbox.rotation.y = -0.3;
  box(0.2, 0.07, 0.14, M.wood, 0, 0.035, 0, bbox);
  partyCols.forEach((c, i) => { const d = cyl(0.03, 0.03, 0.006, std({ color: c, roughness: 0.4 }), -0.06 + i * 0.03, 0.074 + i * 0.002, rs(0.03), bbox, 16); d.rotation.z = rs(0.2); });

  nozzle.add(off('balloon'));
  cur = null;

  // ---------- station: burner ----------
  const flamePos = V(SX.burner, 1.1, -2.55);
  box(0.34, 0.01, 0.34, std({ color: 0x8e9499, roughness: 0.8 }), SX.burner, BENCH + 0.005, -2.55);
  cyl(0.055, 0.068, 0.022, M.darkSteel, SX.burner, BENCH + 0.021, -2.55);
  cyl(0.013, 0.013, 0.15, M.steel, SX.burner, BENCH + 0.1, -2.55);
  cyl(0.02, 0.02, 0.028, M.brass, SX.burner, BENCH + 0.06, -2.55);
  tube([[SX.burner + 0.02, BENCH + 0.035, -2.57], [SX.burner + 0.1, BENCH + 0.015, -2.7], [SX.burner + 0.19, BENCH + 0.03, -2.85], [SX.burner + 0.2, BENCH + 0.06, -2.9]], 0.007, M.rubber);
  box(0.18, 0.012, 0.11, M.darkSteel, SX.burner + 0.3, BENCH + 0.006, -2.62);
  cyl(0.006, 0.006, 0.56, M.steel, SX.burner + 0.3, BENCH + 0.28, -2.64);
  const clampArm = cyl(0.005, 0.005, 0.3, M.steel, SX.burner + 0.15, 1.42, -2.6); clampArm.rotation.z = Math.PI / 2; clampArm.rotation.y = 0.28;
  const tongs = group(SX.burner, 1.42, -2.55);
  cyl(0.003, 0.003, 0.1, M.steel, -0.012, -0.05, 0, tongs).rotation.z = 0.12;
  cyl(0.003, 0.003, 0.1, M.steel, 0.012, -0.05, 0, tongs).rotation.z = -0.12;
  tongs.visible = false;

  const flameMat = (base, tip, alpha) => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBase: { value: new THREE.Color(base) }, uTip: { value: new THREE.Color(tip) }, uAlpha: { value: alpha } },
    vertexShader: `uniform float uTime; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = uv.y; vec3 p = position; float w = vY*vY;
        p.x += sin(uTime*13.0 + p.y*40.0)*0.006*w; p.z += cos(uTime*11.0 + p.y*33.0)*0.006*w;
        p.y *= 1.0 + sin(uTime*19.0)*0.05 + sin(uTime*7.3)*0.04;
        vec4 mv = modelViewMatrix*vec4(p,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uBase; uniform vec3 uTip; uniform float uAlpha; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        vec3 c = mix(uBase, uTip, smoothstep(0.0, 0.75, vY));
        float a = f * (1.0 - smoothstep(0.55, 1.0, vY)) * smoothstep(0.0, 0.08, vY) * uAlpha;
        gl_FragColor = vec4(c * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flameShape = (R, h) => { const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new THREE.Vector2(R * Math.sin(Math.PI * Math.pow(t, 0.55)) + 0.0005, t * h)); } return new THREE.LatheGeometry(pts, 20); };
  const flameG = group(flamePos.x, flamePos.y, flamePos.z);
  const BLUE = { base: 0x1a4cff, tip: 0x3a6aff };
  const flameOuter = new THREE.Mesh(flameShape(0.024, 0.19), flameMat(BLUE.base, BLUE.tip, 2.4));
  const flameInner = new THREE.Mesh(flameShape(0.011, 0.085), flameMat(0x9fe8ff, 0x4fb8ff, 3.5));
  flameG.add(flameOuter, flameInner);
  noShadow(flameG);
  const flameLight = new THREE.PointLight(0x5a7cff, 0.5, 3.5, 2);
  flameLight.position.copy(flamePos).y += 0.1;
  scene.add(flameLight);
  const flame = {
    group: flameG, outer: flameOuter, inner: flameInner, light: flameLight, power: 1, tint: new THREE.Color(0x5a7cff),
    setColor(c) {
      if (c === null) { flameOuter.material.uniforms.uBase.value.set(BLUE.base); flameOuter.material.uniforms.uTip.value.set(BLUE.tip); this.tint.set(0x5a7cff); }
      else { const col = new THREE.Color(c); flameOuter.material.uniforms.uBase.value.copy(col).multiplyScalar(0.8); flameOuter.material.uniforms.uTip.value.copy(col).multiplyScalar(1.6); this.tint.copy(col); }
    },
  };

  // ---------- station: zapper ----------
  stationGroup('zap');
  const zx = SX.zap;
  box(0.56, 0.075, 0.28, std({ color: 0x1f3a44, roughness: 0.35, metalness: 0.4 }), zx, BENCH + 0.038, -2.56);
  plane(0.3, 0.055, std({ map: T.signTex(['DANGER: HIGH VOLTAGE', '(AND LOW STANDARDS)'], '#ffc21a', '#111111', 512, 96, false), roughness: 0.5 }), zx + 0.02, BENCH + 0.038, -2.419);
  [-0.31, 0.31].forEach((dx) => {
    cyl(0.018, 0.024, 0.28, M.ceramic, zx + dx, BENCH + 0.215, -2.6);
    for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.024, 0.007, 8, 20), M.ceramic, zx + dx, BENCH + 0.12 + i * 0.055, -2.6).rotation.x = Math.PI / 2;
    cyl(0.042, 0.042, 0.035, M.steel, zx + dx * 0.97, 1.3, -2.6).rotation.z = Math.PI / 2;
  });
  const zTube = noShadow(cyl(0.036, 0.036, 0.58, M.thinGlass, zx, 1.3, -2.6, scene, 28, true)); zTube.rotation.z = Math.PI / 2; zTube.renderOrder = 6;
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const zCore = noShadow(cyl(0.017, 0.017, 0.55, coreMat, zx, 1.3, -2.6)); zCore.rotation.z = Math.PI / 2; zCore.visible = false;
  cyl(0.004, 0.004, 0.56, M.darkSteel, zx, 1.3, -2.6).rotation.z = Math.PI / 2;
  cyl(0.05, 0.05, 0.14, M.copper, zx, BENCH + 0.145, -2.74);
  for (let i = 0; i < 9; i++) add(new THREE.TorusGeometry(0.051, 0.004, 6, 24), M.copper, zx, BENCH + 0.085 + i * 0.015, -2.74).rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(0.055, 0.022, 14, 30), M.steel, zx, BENCH + 0.24, -2.74).rotation.x = Math.PI / 2;
  const lever = group(zx - 0.2, BENCH + 0.075, -2.47);
  cyl(0.006, 0.006, 0.12, M.steel, 0, 0.06, 0, lever); sph(0.02, M.red, 0, 0.125, 0, lever);
  lever.rotation.x = -0.7;
  box(0.05, 0.016, 0.07, M.dark, zx - 0.2, BENCH + 0.08, -2.47);
  cyl(0.02, 0.022, 0.03, M.brass, zx + 0.2, BENCH + 0.09, -2.47);
  const bulbMat = std({ color: 0xfff6e0, roughness: 0.15, emissive: 0xffb84a, emissiveIntensity: 0 });
  noShadow(sph(0.03, bulbMat, zx + 0.2, BENCH + 0.135, -2.47));
  [-0.05, 0.05].forEach((dx) => { cyl(0.005, 0.005, 0.1, M.copper, zx + dx, BENCH + 0.05, -2.33); box(0.016, 0.02, 0.012, M.red, zx + dx * 0.86, BENCH + 0.1, -2.33); });
  const zapLight = new THREE.PointLight(0xffffff, 0, 5, 2);
  zapLight.position.set(zx, 1.34, -2.45);
  cur.add(zapLight);
  const zap = { core: zCore, coreMat, lever, bulbMat, light: zapLight, tube: V(zx, 1.3, -2.6), clips: V(zx, BENCH + 0.125, -2.33), bulb: V(zx + 0.2, BENCH + 0.135, -2.47) };

  [zap.tube, zap.clips, zap.bulb].forEach((v) => v.add(off('zap')));
  cur = null;

  // ---------- station: water tank ----------
  const wx = SX.water, WS = 1.3, WB = BENCH + 0.035;
  box(0.94, 0.025, 0.44, M.plastic, wx, BENCH + 0.0125, -2.56);
  const tankGlass = noShadow(box(0.9, 0.44, 0.4, M.thinGlass, wx, BENCH + 0.245, -2.56)); tankGlass.renderOrder = 6;
  [[0, 0.2, 0.92, 0.02], [0, -0.2, 0.92, 0.02], [0.45, 0, 0.02, 0.42], [-0.45, 0, 0.02, 0.42]].forEach(([dx, dz, w, d]) => box(w, 0.018, d, M.plastic, wx + dx, BENCH + 0.47, -2.56 + dz));
  box(0.88, 0.02, 0.38, std({ color: 0xd8c49a, roughness: 1 }), wx, BENCH + 0.034, -2.56);
  const waterMat = std({ color: 0x3fa4dc, roughness: 0.03, transparent: true, opacity: 0.42, depthWrite: false, envMapIntensity: 1.6 });
  const water = noShadow(box(0.885, WS - WB, 0.385, waterMat, wx, (WS + WB) / 2, -2.56)); water.renderOrder = 2;
  const duck = group(wx + 0.26, WS, -2.5);
  const duckMat = phys({ color: 0xffd21a, roughness: 0.25, clearcoat: 0.8 });
  sph(0.05, duckMat, 0, 0.012, 0, duck).scale.set(1.25, 0.82, 1);
  sph(0.032, duckMat, 0.04, 0.066, 0, duck);
  const beak = add(new THREE.ConeGeometry(0.013, 0.03, 12), phys({ color: 0xff7a1a, roughness: 0.3, clearcoat: 0.6 }), 0.076, 0.062, 0, duck); beak.rotation.z = -Math.PI / 2;
  const tail = add(new THREE.ConeGeometry(0.02, 0.04, 12), duckMat, -0.066, 0.035, 0, duck); tail.rotation.z = 0.9;
  [-0.014, 0.014].forEach((dz) => sph(0.005, M.rubber, 0.062, 0.078, dz, duck));
  duck.rotation.y = 2.4;
  const tank = { x: wx, z: -2.56, WS, WB, water, waterMat, duck, duckHome: duck.position.clone(), duckBob: 1, duckFree: false };
  prop(duck, { r: 0.05, kind: 'rubber', name: 'duck' });

  // ---------- station: microphone ----------
  stationGroup('mic', 1.4, 0.15);
  const mx = SX.mic;
  const micG = group(mx, BENCH, -2.5);
  cyl(0.07, 0.08, 0.02, M.plastic, 0, 0.01, 0, micG);
  cyl(0.008, 0.008, 0.3, M.steel, 0, 0.16, 0, micG);
  const micHead = group(0, 0.32, 0, micG); micHead.rotation.x = 0.55;
  cyl(0.022, 0.017, 0.11, M.darkSteel, 0, 0, 0, micHead);
  sph(0.033, std({ color: 0x8c9298, metalness: 1, roughness: 0.55 }), 0, 0.075, 0, micHead);
  add(new THREE.TorusGeometry(0.034, 0.004, 8, 24), M.steel, 0, 0.055, 0, micHead).rotation.x = Math.PI / 2;
  const pop = group(0, 0.38, 0.11, micG);
  add(new THREE.TorusGeometry(0.06, 0.005, 8, 30), M.plastic, 0, 0, 0, pop);
  noShadow(add(new THREE.CircleGeometry(0.058, 30), std({ color: 0x111111, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0, pop));
  const recMat = std({ color: 0x400808, emissive: 0xff1a1a, emissiveIntensity: 0 });
  noShadow(sph(0.008, recMat, 0.04, 0.024, 0.04, micG));
  box(0.2, 0.28, 0.17, M.plastic, mx + 0.42, BENCH + 0.14, -2.7);
  const cone = add(new THREE.CircleGeometry(0.07, 30), std({ color: 0x2a2d30, roughness: 0.7 }), mx + 0.42, BENCH + 0.115, -2.614);
  add(new THREE.RingGeometry(0.07, 0.08, 30), M.steel, mx + 0.42, BENCH + 0.115, -2.6135);
  add(new THREE.CircleGeometry(0.022, 20), std({ color: 0x2a2d30, roughness: 0.7 }), mx + 0.42, BENCH + 0.225, -2.614);
  const mic = { group: micG, recMat, cone, head: V(mx, BENCH + 0.4, -2.46) };

  mic.head.add(off('mic'));
  cur = null;

  // ---------- station: mixer ----------
  const qx = SX.mix, R = 0.13, flaskY = BENCH + 0.085;
  box(0.28, 0.07, 0.28, M.ceramic, qx, BENCH + 0.035, -2.55);
  cyl(0.105, 0.105, 0.012, M.darkSteel, qx, BENCH + 0.076, -2.55);
  [-0.07, 0.07].forEach((dx) => { const k = cyl(0.02, 0.02, 0.02, M.plastic, qx + dx, BENCH + 0.035, -2.405); k.rotation.x = Math.PI / 2; });
  const aMax = Math.acos(0.036 / R);
  const fpts = [];
  for (let i = 0; i <= 22; i++) { const a = -Math.PI / 2 + (i / 22) * (Math.PI / 2 + aMax); fpts.push([Math.max(R * Math.cos(a), 0.0005), R + R * Math.sin(a)]); }
  const neckBase = R + R * Math.sin(aMax);
  fpts.push([0.036, neckBase + 0.2], [0.044, neckBase + 0.206]);
  noShadow(lathe(fpts, M.glass, qx, flaskY, -2.55));
  const mixMat = std({ color: 0x9fd0e8, roughness: 0.1, emissive: 0x9fd0e8, emissiveIntensity: 0.12 });
  const mixLiquid = group(qx, flaskY + R, -2.55);
  const Rl = R * 0.93;
  add(new THREE.SphereGeometry(Rl, 32, 16, 0, Math.PI * 2, Math.PI * 0.46, Math.PI * 0.54), mixMat, 0, 0, 0, mixLiquid);
  const capTop = add(new THREE.CircleGeometry(Rl * Math.sin(Math.PI * 0.46), 32), mixMat, 0, Rl * Math.cos(Math.PI * 0.46), 0, mixLiquid); capTop.rotation.x = -Math.PI / 2;
  const crystals = group(qx, flaskY + 0.03, -2.55);
  const crystalMat = phys({ color: 0xffffff, roughness: 0.15, metalness: 0, clearcoat: 1, flatShading: true });
  for (let i = 0; i < 6; i++) { const c = add(new THREE.OctahedronGeometry(rnd(0.018, 0.032), 0), crystalMat, rs(0.05), 0.04 + rnd(0.03), rs(0.05), crystals); c.rotation.set(rnd(3), rnd(3), rnd(3)); c.scale.y = rnd(1, 1.8); }
  crystals.visible = false;
  box(0.2, 0.012, 0.12, M.darkSteel, qx + 0.26, BENCH + 0.006, -2.7);
  cyl(0.006, 0.006, 0.62, M.steel, qx + 0.26, BENCH + 0.31, -2.72);
  const ringArm = cyl(0.005, 0.005, 0.3, M.steel, qx + 0.13, flaskY + neckBase + 0.12, -2.64); ringArm.rotation.z = Math.PI / 2; ringArm.rotation.y = 0.55;
  add(new THREE.TorusGeometry(0.042, 0.006, 8, 24), M.steel, qx, flaskY + neckBase + 0.12, -2.55).rotation.x = Math.PI / 2;
  const mixer = { mat: mixMat, liquid: mixLiquid, crystals, crystalMat, neck: V(qx, flaskY + neckBase + 0.21, -2.55), center: V(qx, flaskY + R, -2.55) };

  // ---------- door ----------
  const frameMat = M.darkSteel;
  box(0.08, 2.18, 0.2, frameMat, 3.16, 1.09, -3.02); box(0.08, 2.18, 0.2, frameMat, 4.24, 1.09, -3.02); box(1.16, 0.08, 0.2, frameMat, 3.7, 2.14, -3.02);
  const door = group(3.2, 0, -2.99);
  box(1.0, 2.1, 0.05, M.door, 0.5, 1.05, 0, door);
  box(0.34, 0.5, 0.056, std({ color: 0x0c1418, roughness: 0.05, metalness: 0.6 }), 0.5, 1.6, 0, door);
  box(1.0, 0.24, 0.056, M.steel, 0.5, 0.13, 0, door);
  box(0.16, 0.025, 0.03, M.steel, 0.84, 1.02, 0.05, door); cyl(0.022, 0.022, 0.03, M.steel, 0.9, 1.02, 0.035, door).rotation.x = Math.PI / 2;
  const doorHandle = V(4.05, 1.02, -2.9);

  // ---------- delivery box ----------
  const BW = 0.5, BH = 0.36, BD = 0.42;
  const cardSide = std({ map: T.cardboardTex(false), roughness: 0.85 });
  const cardStamp = std({ map: T.cardboardTex(true), roughness: 0.85 });
  const cardIn = std({ color: 0x1a120a, roughness: 1 });
  const pkg = group(3.7, 0.5, -4.6);
  const pkgBody = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BD), [cardStamp, cardStamp, cardIn, cardSide, cardSide, cardSide]);
  pkgBody.position.y = BH / 2; pkg.add(pkgBody);
  const labelMat = std({ color: 0xffffff, roughness: 0.6 });
  plane(0.4, 0.25, labelMat, 0, BH / 2, BD / 2 + 0.002, pkg);
  const tape = box(0.07, 0.003, BD + 0.004, phys({ color: 0xd8c08a, roughness: 0.2, clearcoat: 0.6 }), 0, BH + 0.01, 0, pkg);
  const flapL = group(-BW / 2, BH, 0, pkg), flapR = group(BW / 2, BH, 0, pkg);
  box(BW / 2, 0.008, BD, cardSide, BW / 4, 0.004, 0, flapL);
  box(BW / 2, 0.008, BD, cardSide, -BW / 4, 0.004, 0, flapR);
  pkg.visible = false;
  const pack = { group: pkg, flapL, flapR, tape, labelMat, h: BH };

  // packing peanuts
  const PEA = 70;
  const peanuts = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.014, 0.03, 3, 8), std({ color: 0xf6f1e4, roughness: 0.8 }), PEA);
  peanuts.frustumCulled = false; peanuts.visible = false;
  scene.add(peanuts);
  const pea = Array.from({ length: PEA }, () => ({ p: V(0, 0, 0), v: V(0, 0, 0), r: new THREE.Euler(), rv: V(0, 0, 0) }));
  let peaTime = 0;
  const dummy = new THREE.Object3D();
  function burstPeanuts(origin) {
    pea.forEach((q) => { q.p.copy(origin).add(V(rs(0.15), rnd(0.1), rs(0.12))); q.v.set(rs(1.3), rnd(2, 4.2), rs(1.3)); q.rv.set(rs(8), rs(8), rs(8)); });
    peaTime = 9; peanuts.visible = true;
  }

  // ---------- sample containers ----------
  const labelCache = {};
  function makeSample(z) {
    const el = CONTENT[z];
    const g = new THREE.Group();
    const lm = std({ map: (labelCache[z] ||= T.sampleLabelTex(z)), roughness: 0.55 });
    if (el.form === 'gas') {
      const paint = phys({ color: el.color, roughness: 0.32, metalness: 0.25, clearcoat: 0.6 });
      cyl(0.064, 0.064, 0.02, M.dark, 0, 0.01, 0, g);
      cyl(0.06, 0.06, 0.3, paint, 0, 0.16, 0, g);
      add(new THREE.SphereGeometry(0.06, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), paint, 0, 0.31, 0, g);
      cyl(0.0606, 0.0606, 0.13, lm, 0, 0.17, 0, g, 28, true);
      cyl(0.02, 0.022, 0.05, M.brass, 0, 0.385, 0, g);
      box(0.06, 0.028, 0.028, M.brass, 0.008, 0.41, 0, g);
      cyl(0.03, 0.03, 0.008, M.red, 0, 0.435, 0, g, 8);
      g.userData.valve = V(0.045, 0.41, 0);
    } else {
      noShadow(lathe([[0, 0.003], [0.062, 0.003], [0.062, 0.13], [0.05, 0.15], [0.05, 0.162]], M.glass, 0, 0, 0, g));
      cyl(0.0626, 0.0626, 0.045, lm, 0, 0.03, 0, g, 28, true);
      g.userData.lid = cyl(0.054, 0.054, 0.02, M.steel, 0, 0.17, 0, g);
      const geo = new THREE.IcosahedronGeometry(0.036, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) { // deterministic lumpiness
        const n = 1 + 0.16 * Math.sin(pos.getX(i) * 190 + pos.getY(i) * 130 + z) + 0.1 * Math.sin(pos.getZ(i) * 240 + z * 3);
        pos.setXYZ(i, pos.getX(i) * n, pos.getY(i) * n * 0.85, pos.getZ(i) * n);
      }
      geo.computeVertexNormals();
      const cm = el.metal ? std({ color: el.color, metalness: 1, roughness: 0.34, flatShading: true, emissive: 0xff5a10, emissiveIntensity: 0 })
        : std({ color: el.color, roughness: el.waxy ? 0.35 : 0.7, metalness: 0.05, flatShading: true, emissive: el.waxy ? 0x9dffb0 : 0xff5a10, emissiveIntensity: el.waxy ? 0.25 : 0 });
      const chunk = new THREE.Mesh(geo, cm);
      chunk.position.set(0, 0.085, 0);
      g.add(chunk);
      g.userData.chunk = chunk;
      g.userData.chunkHome = chunk.position.clone();
      g.userData.baseGlow = cm.emissiveIntensity;
      g.userData.baseEmissive = cm.emissive.getHex();
    }
    g.userData.z = z;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !o.userData.noShadow; o.receiveShadow = true; } });
    return g;
  }

  // ---------- shadows ----------
  scene.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh) { o.castShadow = !o.userData.noShadow && !o.material.transparent; o.receiveShadow = !o.userData.noShadow; }
  });
  floor.castShadow = false; ceil.castShadow = false;
  peanuts.castShadow = true;

  // ---------- camera rig ----------
  const rig = { pos: V(-0.5, 1.9, 3.2), look: V(-0.8, 1.2, -2.6), tPos: V(-0.5, 1.9, 3.2), tLook: V(-0.8, 1.2, -2.6), yaw: 0, pitch: 0, shake: 0, speed: 3 };
  const VIEWS = {
    menu: [[-0.4, 1.95, 3.1], [-0.9, 1.25, -2.6]],
    wide: [[-1.0, 1.7, 2.5], [-1.0, 1.3, -2.6]],
    door: [[2.45, 1.45, 0.7], [3.6, 0.85, -2.7]],
    unbox: [[2.35, 1.65, 0.9], [3.35, 0.35, -1.3]],
  };
  // First-person player. The scripted camera is only used behind the start menu.
  const pl = { x: 0.3, z: 0.6, yaw: 0, pitch: -0.1 };
  const WALLS = [ // things you cannot walk through: [x0, x1, z0, z1]
    [-4.8, 2.6, -3.2, -2.15], [-3.4, -1.8, 0.525, 1.425], [1.4, 3.0, 1.125, 2.025], [3.45, 4.85, 1.925, 2.825],
    [4.42, 5, -1.25, 0.05], [-5, -4.55, -0.2, 0.5], [0.6, 1.2, -1.15, -0.65], [-4.5, -3.9, -1.4, -0.8], [-4.7, -4.0, 2.85, 3.55],
  ];
  function setView(name, snap = false) {
    if (name !== 'menu') return;
    rig.walk = false;
    const v = VIEWS.menu;
    rig.tPos.set(...v[0]); rig.tLook.set(...v[1]);
    rig.yaw = 0; rig.pitch = 0;
    rig.view = name;
    if (snap) { rig.pos.copy(rig.tPos); rig.look.copy(rig.tLook); }
  }
  function startWalk(x, z, yaw) { rig.walk = true; rig.view = 'walk'; pl.x = x; pl.z = z; pl.yaw = yaw; pl.pitch = -0.2; }
  function move(dt, fwd, strafe) {
    const sp = 2.4 * dt, sn = Math.sin(pl.yaw), cs = Math.cos(pl.yaw), r = 0.28;
    pl.x += (-sn * fwd + cs * strafe) * sp; pl.z += (-cs * fwd - sn * strafe) * sp;
    pl.x = Math.max(-4.65, Math.min(4.65, pl.x)); pl.z = Math.max(-2.7, Math.min(3.65, pl.z));
    for (const [x0, x1, z0, z1] of WALLS) {
      if (pl.x > x0 - r && pl.x < x1 + r && pl.z > z0 - r && pl.z < z1 + r) {
        const d = [pl.x - (x0 - r), (x1 + r) - pl.x, pl.z - (z0 - r), (z1 + r) - pl.z];
        const m = Math.min(...d), i = d.indexOf(m);
        if (i === 0) pl.x = x0 - r; else if (i === 1) pl.x = x1 + r; else if (i === 2) pl.z = z0 - r; else pl.z = z1 + r;
      }
    }
  }
  function look(dx, dy) { pl.yaw -= dx; pl.pitch = Math.max(-1.2, Math.min(1.2, pl.pitch - dy)); }
  // The station the player is standing at and facing, if any.
  function nearStation() {
    let best = null, bd = 1.9;
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    for (const id in stationPos) {
      const dx = stationPos[id].x - pl.x, dz = stationPos[id].z - pl.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / d > 0.6) { bd = d; best = id; }
    }
    return best;
  }
  const dir = V(0, 0, 0), sphr = new THREE.Spherical();
  function updateCamera(dt, t) {
    if (rig.walk) {
      camera.position.set(pl.x, 1.45, pl.z);
      if (rig.shake > 0.001) { camera.position.x += rs(rig.shake) * 0.05; camera.position.y += rs(rig.shake) * 0.05; rig.shake *= Math.exp(-dt * 5); }
      camera.rotation.set(pl.pitch, pl.yaw, 0, 'YXZ');
      return;
    }
    const k = 1 - Math.exp(-dt * rig.speed);
    rig.pos.lerp(rig.tPos, k); rig.look.lerp(rig.tLook, k);
    camera.position.copy(rig.pos);
    if (rig.view === 'menu') { camera.position.x += Math.sin(t * 0.15) * 0.9; camera.position.y += Math.sin(t * 0.11) * 0.08; }
    if (rig.shake > 0.001) { camera.position.x += rs(rig.shake) * 0.06; camera.position.y += rs(rig.shake) * 0.06; rig.shake *= Math.exp(-dt * 5); }
    dir.subVectors(rig.look, rig.pos);
    sphr.setFromVector3(dir);
    sphr.theta += rig.yaw; sphr.phi = THREE.MathUtils.clamp(sphr.phi - rig.pitch, 0.5, 2.6);
    dir.setFromSpherical(sphr);
    camera.lookAt(dir.add(camera.position));
  }

  // ---------- per-frame ----------
  let amb = 0, flick = 6;
  const floaters = []; // balloons the player has released
  const hv = V(0, 0, 0);
  function update(dt, t) {
    flameOuter.material.uniforms.uTime.value = t; flameInner.material.uniforms.uTime.value = t + 3;
    flameLight.color.copy(flame.tint);
    flameLight.intensity = flame.power * (0.5 + Math.sin(t * 23) * 0.06 + Math.sin(t * 7.7) * 0.05) * flameG.scale.y;
    for (const f of floaters) {
      if (f.mode === 'ceil') { f.b.position.y = f.y + Math.sin(t * 1.3 + f.ph) * 0.012; f.b.rotation.z = Math.sin(t * 0.7 + f.ph) * 0.06; }
      else if (f.mode === 'hover') { hv.set(f.x + Math.sin(t * 0.23 + f.ph) * 0.5, f.y + Math.sin(t * 0.5 + f.ph) * 0.12, f.z + Math.cos(t * 0.19 + f.ph) * 0.25); f.b.position.lerp(hv, Math.min(1, dt * 1.2)); f.b.rotation.z = Math.sin(t * 0.4 + f.ph) * 0.1; }
    }
    party.forEach((b, i) => { b.rotation.x += Math.sin(t * 0.9 + i * 2) * 0.0006; });
    if (tank.duckFree) {
      duck.position.y = WS - 0.004 + Math.sin(t * 2.1) * 0.006 * tank.duckBob;
      duck.rotation.z = Math.sin(t * 1.7) * 0.05 * tank.duckBob;
      duck.rotation.x = Math.sin(t * 1.3) * 0.04 * tank.duckBob;
      duck.position.x = tank.duckHome.x + Math.sin(t * 0.21) * 0.06;
    }
    if (peaTime > 0) {
      peaTime -= dt;
      const shrink = Math.min(1, peaTime / 1.2);
      pea.forEach((q, i) => {
        q.v.y -= 9.8 * dt;
        q.p.addScaledVector(q.v, dt);
        if (q.p.y < 0.018) { q.p.y = 0.018; q.v.y *= -0.35; q.v.x *= 0.6; q.v.z *= 0.6; q.rv.multiplyScalar(0.5); }
        q.r.x += q.rv.x * dt; q.r.y += q.rv.y * dt; q.r.z += q.rv.z * dt;
        dummy.position.copy(q.p); dummy.rotation.copy(q.r); dummy.scale.setScalar(shrink); dummy.updateMatrix();
        peanuts.setMatrixAt(i, dummy.matrix);
      });
      peanuts.instanceMatrix.needsUpdate = true;
      if (peaTime <= 0) peanuts.visible = false;
    }
    rotor.rotation.y += dt * 5;
    const now = new Date(), sec = now.getSeconds() + now.getMilliseconds() / 1000, mins = now.getMinutes() + sec / 60;
    hands[0].rotation.z = -((now.getHours() % 12) + mins / 60) / 12 * Math.PI * 2;
    hands[1].rotation.z = -mins / 60 * Math.PI * 2;
    hands[2].rotation.z = -Math.floor(sec) / 60 * Math.PI * 2;
    scopeT += dt; if (scopeT > 0.12) { scopeT = 0; drawScope(t); }
    animateRobot(spare, t, dt);
    spare.userData.head.rotation.y = Math.atan2(pl.x - spare.position.x, pl.z - spare.position.z) - spare.rotation.y;
    amb += dt;
    if (amb > 0.14) {
      amb = 0;
      const a = rnd(6.28);
      P.emit({ pos: V(dewarAt.x + Math.cos(a) * 0.2, 0.93, dewarAt.z + Math.sin(a) * 0.2), vel: V(Math.cos(a) * 0.18, 0.05, Math.sin(a) * 0.18), gravity: 0.5, life: rnd(1.4, 2.2), size: 0.12, size1: 0.4, color: 0xf2f8ff, alpha: 0.3, tex: 'smoke' });
      if (mixLiquid.visible && Math.random() < 0.5) P.emit({ pos: V(qx + rs(0.05), flaskY + R + 0.02, -2.55 + rs(0.05)), vel: V(0, 0.12, 0), life: 0.9, size: 0.012, size1: 0.02, tex: 'bubble', alpha: 0.9 });
    }
    mixLiquid.rotation.y += dt * 0.6;
    flick -= dt;
    if (flick < 0) { flickMat.emissiveIntensity = Math.random() < 0.5 ? 0.4 : 2.6; if (flick < -0.35) { flick = rnd(5, 14); flickMat.emissiveIntensity = 2.6; } }
    P.update(dt);
    updateCamera(dt, t);
  }

  let pr = 1, lift = 0, vw = 1, vh = 1;
  // Lift: shift the picture up so the action is not hidden behind the HUD at the bottom of the screen.
  function setLift(k) { lift = k; if (k) camera.setViewOffset(vw, vh, 0, Math.round(vh * k), vw, vh); else camera.clearViewOffset(); }
  function resize(w, h, pixelRatio) {
    pr = pixelRatio; vw = w; vh = h;
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    composer.setPixelRatio(pr); composer.setSize(w, h);
    camera.aspect = w / h;
    const a = camera.aspect;
    camera.fov = a >= 1.5 ? 46 : THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(36)) / a)), 46, 76);
    camera.updateProjectionMatrix();
    setLift(lift);
  }
  const quality = { bloom: true };
  function render() { if (quality.bloom) composer.render(); else renderer.render(scene, camera); }
  function setBloom(on) { quality.bloom = on; bloom.enabled = on; }

  // tap targets
  const hits = [];
  hits.push({ id: 'door', box: new THREE.Box3(V(3.2, 0, -3.1), V(4.2, 2.1, -2.85)) });
  const pkgHit = { id: 'pkg', box: new THREE.Box3() };
  hits.push(pkgHit);
  const ray = new THREE.Raycaster(), ip = V(0, 0, 0);
  function pick(nx, ny) {
    ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
    pkgHit.box.setFromCenterAndSize(V(pkg.position.x, pkg.position.y + 0.2, pkg.position.z), V(0.75, 0.7, 0.75));
    let best = null, bd = 1e9;
    for (const h of hits) {
      if (h.id === 'pkg' && !pkg.visible) continue;
      if (ray.ray.intersectBox(h.box, ip)) { const d = ip.distanceTo(camera.position); if (d < bd && (d < 3.2 || h.id === 'door' || h.id === 'pkg')) { bd = d; best = h.id; } }
    }
    return best;
  }
  // flat tops loose props can rest on: [x0, x1, z0, z1, height, solid-underneath]
  const surfaces = [
    [-4.8, 2.6, -3, -2.15, BENCH, 1], [-3.4, -1.8, 0.525, 1.425, BENCH, 0], [1.4, 3.0, 1.125, 2.025, BENCH, 0], [3.45, 4.85, 1.925, 2.825, BENCH, 0],
    [0.6, 1.2, -1.15, -0.65, BENCH, 0], [4.42, 5, -1.25, 0.05, 2.0, 1], [-4.75, 0.15, -3, -2.7, 1.95, 0], [-4.75, 0.15, -3, -2.7, 2.44, 0],
    [tank.x - 0.44, tank.x + 0.44, tank.z - 0.19, tank.z + 0.19, tank.WB, 0], [-4.44, -3.96, -1.34, -0.86, 0.87, 1],
  ];
  // where each piece of equipment "reaches": bring something here and it reacts
  const zones = {
    balloon: { p: nozzle.clone().add(V(0, 0.05, 0)), r: 0.28 }, burner: { p: flamePos.clone().add(V(0, 0.16, 0)), r: 0.26 },
    zap: { p: zap.clips.clone().add(V(0, 0.08, 0)), r: 0.3 }, water: { p: V(tank.x, tank.WS - 0.1, tank.z), r: 0.32 },
    mic: { p: mic.head.clone(), r: 0.3 }, mix: { p: mixer.neck.clone().add(V(0, 0.08, 0)), r: 0.28 },
    cryo: { p: V(dewarAt.x, 1.0, dewarAt.z), r: 0.34 },
  };
  const sv = V(0, 0, 0);
  function project(v) { // world point -> CSS pixels (or null when behind the camera)
    sv.copy(v).project(camera);
    if (sv.z > 1) return null;
    return [(sv.x * 0.5 + 0.5) * renderer.domElement.clientWidth, (-sv.y * 0.5 + 0.5) * renderer.domElement.clientHeight];
  }

  return {
    THREE, renderer, scene, camera, P, M, rig, setView, startWalk, move, look, nearStation, stationPos, home, update, render, resize, setBloom, setLift, pick, project, quality,
    fxLight, flame, flamePos, tongs, nozzle, zap, tank, mic, mixer, door, doorHandle, pack, burstPeanuts,
    makeSample, makeBalloon, floaters, BENCH, sample: null, props, surfaces, zones, pl, dewarAt,
    shake(a) { rig.shake = Math.max(rig.shake, a); },
  };
}
