import * as THREE from 'three';
import { SUB } from '../chem/db.js';
import { CHUNK } from '../chem/mixture.js';
import { play } from '../core/audio.js';
import { G_STATIC, G_PROP, G_PLAYER, G_HELD } from '../physics/world.js';
import { cv, tex, speckle, signTex } from './textures.js';
import { solidBox, makeDoor } from './door.js';

// Story Mode's world outside the lab: your house, the forest, a stream, a lake, a cave and a meteorite
// crater. It is only built the first time Story Mode starts, and hidden in Normal Mode.
// The lab sits at the origin with its door in the south wall; "north" is -z.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const LAKE = { x: 31, z: 31, r: 10, level: -0.2 };
export const STREAM = [[-82, 9], [-56, 15], [-34, 12], [-14, 18], [4, 15], [16, 21], [25, 27]];
export const STREAM_LEVEL = -0.17;
const PATHS = [
  [[-5.4, 5.6], [-6.6, 11], [-9.6, 17.4], [-12.6, 24], [-14, 29]], // lab to home
  [[-3.6, 5.6], [5, 10], [13, 18], [20, 25]], // lab to the lake
  [[-6.5, 5.8], [-12, 3], [-20, -5], [-29, -14], [-34.5, -21]], // lab to the cave
  [[2, 5.6], [10, 6.2], [19, 1], [27, -5]], // lab to the red rocks
];
export const HOUSE = { x0: -18.5, x1: -9.5, z0: 29.5, z1: 36.5, h: 2.7, doorX: -14 };
export const CAVE = { x: -42, z: -22, r: 7.2, h: 4.4 };
const CRATER = { x: 6, z: 72, r: 6 };
export const BOUNDS = { x0: -68, x1: 68, z0: -52, z1: 88 };
const BUILDINGS = [[-7.6, 11.6, -5.6, 5.6], [HOUSE.x0 - 0.3, HOUSE.x1 + 0.3, HOUSE.z0 - 0.3, HOUSE.z1 + 0.3]];

function segDist(px, pz, line) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(px - ax - dx * t, pz - az - dz * t));
  }
  return best;
}
const boxDist = (x, z, x0, x1, z0, z1) => Math.hypot(Math.max(0, x0 - x, x - x1), Math.max(0, z0 - z, z - z1));
export const streamDist = (x, z) => segDist(x, z, STREAM);
const pathDist = (x, z) => Math.min(...PATHS.map((p) => segDist(x, z, p)));

// the shape of the land (metres above the lab floor)
export function heightAt(x, z) {
  let h = 0.45 * Math.sin(x * 0.061 + 1.3) * Math.cos(z * 0.054 + 0.4) + 0.28 * Math.sin(x * 0.13 + z * 0.1) + 0.1 * Math.sin(x * 0.37 - z * 0.29);
  h += 3.2 * Math.exp(-((x + 55) ** 2 + (z + 36) ** 2) / 260); // hills behind the cave
  h += 1.6 * Math.exp(-((x - 48) ** 2 + (z + 20) ** 2) / 200);
  let flat = 0;
  flat = Math.max(flat, 1 - sstep(0, 5, boxDist(x, z, ...BUILDINGS[0])));
  flat = Math.max(flat, 1 - sstep(0, 4, boxDist(x, z, ...BUILDINGS[1])));
  flat = Math.max(flat, 1 - sstep(CAVE.r - 1, CAVE.r + 5, Math.hypot(x - CAVE.x, z - CAVE.z)));
  flat = Math.max(flat, 0.75 * (1 - sstep(0.8, 3.5, pathDist(x, z))));
  h *= 1 - flat;
  const ex = Math.max(0, Math.abs(x) - 58), ez = Math.max(0, z - 78, -42 - z);
  h += (ex * ex + ez * ez) * 0.014 + (ex + ez) * 0.05;
  // meteorite crater: a bowl with a raised rim
  const cd = Math.hypot(x - CRATER.x, z - CRATER.z);
  h += 0.55 * Math.exp(-((cd - CRATER.r) ** 2) / 3) - 1.2 * (1 - sstep(0, CRATER.r, cd)) ** 1.5;
  // the stream's channel and the lake's bowl
  h = lerp(h, -0.5, 1 - sstep(0.4, 2.4, streamDist(x, z)));
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  h = lerp(h, -1.0 * (1 - sstep(LAKE.r * 0.3, LAKE.r + 1.5, ld)), 1 - sstep(LAKE.r, LAKE.r + 4, ld));
  return h;
}
// height of open water at a point, or null on dry land
export function waterLevelAt(x, z) {
  const g = heightAt(x, z);
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2 && g < LAKE.level) return LAKE.level;
  if (streamDist(x, z) < 2.6 && g < STREAM_LEVEL) return STREAM_LEVEL;
  return null;
}
// floors: the land is tucked just under these so it never shows through
const FLOORS = [[-7.35, 7.35, -5.35, 5.35], [7.25, 11.35, -0.35, 5.35], [HOUSE.x0 - 0.05, HOUSE.x1 + 0.05, HOUSE.z0 - 0.05, HOUSE.z1 + 0.05]];
const inBuilding = (x, z) => FLOORS.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- what can be found where ----------
const caveAt = (a, r) => [CAVE.x + Math.cos(a) * r, CAVE.z + Math.sin(a) * r];
const DEPOSITS = [
  { mat: 'hematite', sub: 'fe2o3', mol: 0.35, name: 'Rusty red rock', base: '#7a3b26', speck: '#3c1a10', hard: 3, n: 6, at: [[30, -7, 0.75], [33.5, -9.5, 0.55], [27.5, -10.5, 0.6], [34, -4, 0.5]] },
  { mat: 'malachite', sub: 'malachite', mol: 0.22, name: 'Green-streaked rock', base: '#686760', speck: '#2fa071', hard: 3, n: 5, at: [[-27, -15, 0.6], [-24.5, -18.5, 0.5], [-29.5, -11.5, 0.45]] },
  { mat: 'limestone', sub: 'caco3', mol: 0.5, name: 'Pale limestone', base: '#d6cfbd', speck: '#a8a08a', hard: 2, n: 6, at: [[39.5, 41.5, 0.9], [42.5, 37.5, 0.6], [36.5, 45, 0.55]] },
  { mat: 'sulfur', sub: 'sulfur', mol: 1.6, name: 'Sulfur crust by a warm vent', base: '#c9ae26', speck: '#f2df4c', hard: 1, n: 6, at: [[...caveAt(Math.PI, 5.2), 0.55]], vent: true },
  { mat: 'coal', sub: 'carbon', mol: 4, name: 'Coal seam', base: '#262420', speck: '#0b0b0b', hard: 2, n: 8, at: [[...caveAt(2.3, 5.1), 0.6]] },
  { mat: 'salt', sub: 'nacl', mol: 0.9, name: 'Pink rock salt', base: '#ddb2a6', speck: '#f6e4dc', hard: 2, n: 6, at: [[...caveAt(-2.3, 5.1), 0.55]] },
  { mat: 'quartz', sub: 'sio2', mol: 0.9, name: 'Quartz crystals', base: '#9a9890', speck: '#ffffff', hard: 3, n: 5, crystal: true, at: [[...caveAt(1.35, 5.1), 0.5]] },
];
const DIGS = [
  { mat: 'sand', sub: 'sio2', x: 20.2, z: 30.5, r: 3.4, name: 'Sandy beach' },
  { mat: 'sand', sub: 'sio2', x: -20.5, z: 15.6, r: 2.2, name: 'Sandy bank' },
  { mat: 'sand', sub: 'sio2', x: -46, z: 14.4, r: 2.4, name: 'Sandy bank' },
];
const SPAWNS = [
  { mat: 'charcoal', sub: 'carbon', mol: 0.6, name: 'Charcoal', at: [8, 30], r: 0.55, max: 5, every: 60 },
  { mat: 'berries', sub: 'berries', mol: 0.1, name: 'Elderberries', at: [27.5, 43.2], r: 1.1, max: 4, every: 45 },
  { mat: 'berries', sub: 'berries', mol: 0.1, name: 'Elderberries', at: [23.2, 41], r: 1.1, max: 3, every: 45 },
  { mat: 'gold', sub: 'gold', mol: 0.012, name: 'Gold flake', at: [-34, 12], r: 0.4, max: 1, every: 150 },
  { mat: 'gold', sub: 'gold', mol: 0.012, name: 'Gold flake', at: [-56, 15], r: 0.4, max: 1, every: 150 },
  { mat: 'gold', sub: 'gold', mol: 0.015, name: 'Gold flake', at: [-5, 16.5], r: 0.3, max: 1, every: 200 },
  { mat: 'meteorite', sub: 'iron', mol: 3.2, name: 'Meteorite', at: [CRATER.x, CRATER.z], r: 0.2, max: 1, every: 400 },
  { mat: 'copper', sub: 'copper', mol: 0.25, name: 'Native copper nugget', at: caveAt(-1.75, 3.9), r: 0.6, max: 2, every: 200 },
  { mat: 'wood', sub: 'wood', mol: 0.25, shape: 'stick', name: 'Dry stick', at: [-9, 9], r: 2, max: 2, every: 50 },
  { mat: 'wood', sub: 'wood', mol: 0.25, shape: 'stick', name: 'Dry stick', at: [12, 24], r: 2.5, max: 3, every: 50 },
  { mat: 'wood', sub: 'wood', mol: 0.25, shape: 'stick', name: 'Dry stick', at: [-20, 24], r: 2.5, max: 3, every: 50 },
  { mat: 'wood', sub: 'wood', mol: 0.25, shape: 'stick', name: 'Dry stick', at: [-24, -6], r: 2.5, max: 2, every: 50 },
];
export const KITCHEN = [
  { key: 'salt', type: 'jar', sub: 'nacl', mol: 3.4, label: 'Salt', formula: 'NaCl', mat: 'salt', at: [-9.95, 31.0] },
  { key: 'soda', type: 'jar', sub: 'nahco3', mol: 2.4, label: 'Baking soda', formula: 'NaHCO3', mat: 'bakingsoda', at: [-9.95, 31.45] },
  { key: 'vinegar', type: 'bottle', sub: 'water', mol: 26.3, extra: [['acetic_acid', 0.415]], label: 'Vinegar', formula: 'CH3COOH 5%', mat: 'vinegar', at: [-9.95, 31.9] },
  { key: 'sugar', type: 'jar', sub: 'sucrose', mol: 0.6, label: 'Sugar', formula: 'C12H22O11', mat: 'sugar', at: [-9.95, 32.35] },
];

// ---------- painted textures ----------
function grassTex() {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 9000, 0.35, 255, 40, 3);
  for (let i = 0; i < 500; i++) { g.strokeStyle = `rgba(${Math.random() < 0.5 ? 255 : 30},${Math.random() < 0.5 ? 255 : 40},30,${0.08 + Math.random() * 0.12})`; g.beginPath(); const x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 6, y - 4 - Math.random() * 8); g.stroke(); }
  return tex(c, 1, 1, false);
}
function plasterTex() { const [c, g] = cv(256, 256); g.fillStyle = '#eee6d8'; g.fillRect(0, 0, 256, 256); speckle(g, 256, 256, 5000, 0.08, 255, 120, 3); return tex(c, 3, 1); }
function plankTex() {
  const [c, g] = cv(512, 512);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgb(${128 + Math.random() * 30},${88 + Math.random() * 20},${52 + Math.random() * 14})`; g.fillRect(0, i * 64, 512, 62);
    g.fillStyle = 'rgba(40,24,10,.6)'; g.fillRect(0, i * 64 + 62, 512, 2); g.fillRect((i * 173) % 512, i * 64, 2, 62);
    for (let k = 0; k < 18; k++) { g.strokeStyle = `rgba(60,36,14,${0.06 + Math.random() * 0.1})`; g.beginPath(); const y = i * 64 + Math.random() * 60; g.moveTo(0, y); g.bezierCurveTo(170, y + (Math.random() - 0.5) * 8, 340, y + (Math.random() - 0.5) * 8, 512, y); g.stroke(); }
  }
  return tex(c, 2, 2);
}
function barkTex() { const [c, g] = cv(64, 256); g.fillStyle = '#5a4430'; g.fillRect(0, 0, 64, 256); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 20 : 120},${Math.random() < 0.5 ? 14 : 96},10,0.35)`; g.fillRect(Math.random() * 64, 0, 1 + Math.random() * 3, 256); } return tex(c, 2, 2); }

export function buildOutdoors(G) {
  const { scene, phys } = G;
  const { CANNON } = phys;
  const root = new THREE.Group(); scene.add(root);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const add = (m, x = 0, y = 0, z = 0, shadow = true) => { m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; root.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, solid = true, ry = 0) => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z); m.rotation.y = ry; if (solid) solidBox(phys, x, y, z, w, h, d, ry); return m; };
  const fixtures = [];
  const doors = [];
  const R = rng(1977);

  // ---------- sky, sun and air ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: V(0.45, 0.62, 0.35).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 top = vec3(0.24,0.47,0.78), mid = vec3(0.62,0.78,0.92), low = vec3(0.78,0.84,0.86);
        vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, low, min(1.0, -h * 6.0));
        float s = max(0.0, dot(vDir, sunDir)); c += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(230, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -1; root.add(sky);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  root.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x56653a, 1.0); root.add(hemi);
  const fog = new THREE.Fog(0xb3cbdc, 40, 165);

  // ---------- the land ----------
  const X0 = -80, Z1 = 96, N = 160;
  const data = [];
  for (let i = 0; i <= N; i++) { const row = []; for (let j = 0; j <= N; j++) row.push(heightAt(X0 + i, Z1 - j)); data.push(row); }
  const hf = new CANNON.Heightfield(data, { elementSize: 1 });
  const ground = new CANNON.Body({ mass: 0, material: phys.mats.matGround, collisionFilterGroup: G_STATIC, collisionFilterMask: G_PROP | G_PLAYER | G_HELD });
  ground.addShape(hf); ground.position.set(X0, 0, Z1); ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); ground.tag = 'ground';
  phys.world.addBody(ground);
  // the exact surface of the terrain triangles (the same split as the mesh and the heightfield)
  function groundAt(x, z) {
    const fx = x - X0, fz = Z1 - z, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= N || j >= N) return heightAt(x, z);
    const u = fx - i, v = fz - j, a = data[i][j], b = data[i + 1][j], c = data[i][j + 1], d = data[i + 1][j + 1];
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  // cannon-es lets small, fast things slip between heightfield triangles, so loose objects outdoors
  // are also kept above the surface directly
  phys.onPreStep(() => {
    if (!shown || !G.matter) return;
    for (const it of G.matter.items) {
      const bd = it.body;
      if (bd.mass === 0 || bd.sleepState === 2) continue;
      const p = bd.position, g = groundAt(p.x, p.z);
      if (p.y > g + 0.7) continue;
      bd.updateAABB();
      const low = bd.aabb.lowerBound.y;
      if (low > g + 0.004) continue;
      if (low < g) { p.y += g - low; if (bd.velocity.y < 0) bd.velocity.y = 0; }
      // soil and grass grip: slow things stop instead of rolling down every slope
      const v = bd.velocity, k = v.x * v.x + v.z * v.z < 0.64 ? 0.8 : 0.97;
      v.x *= k; v.z *= k; bd.angularVelocity.scale(k, bd.angularVelocity);
    }
  });
  {
    const n = N + 1, pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), idx = [];
    const c = new THREE.Color(), deep = new THREE.Color(0x2c3f1e), grass = new THREE.Color(0x4f6b2e), grass2 = new THREE.Color(0x6a7d34), sand = new THREE.Color(0xc4b48a), mud = new THREE.Color(0x5e5240), dirt = new THREE.Color(0x7a5f40), rock = new THREE.Color(0x77756c), dark = new THREE.Color(0x3a3630);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = X0 + i, z = Z1 - j, k = i * n + j;
      let h = data[i][j];
      if (inBuilding(x, z)) h -= 0.06; // tucked under the floors
      pos.set([x, h, z], k * 3); uv.set([x * 0.25, z * 0.25], k * 2);
      const v = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.19);
      c.copy(grass).lerp(grass2, v * 0.8);
      const sd = streamDist(x, z), ld = Math.hypot(x - LAKE.x, z - LAKE.z);
      c.lerp(sand, Math.max(1 - sstep(1.6, 3.4, sd), 1 - sstep(LAKE.r - 0.5, LAKE.r + 3, ld)));
      if (h < -0.15) c.lerp(mud, Math.min(1, (-0.15 - h) * 4));
      c.lerp(dirt, (1 - sstep(0.5, 1.3, pathDist(x, z))) * 0.85);
      const edge = sstep(-2, 6, Math.max(Math.abs(x) - 60, z - 80, -44 - z));
      c.lerp(rock, sstep(1.4, 4, h) * (1 - edge)); c.lerp(deep, edge * 0.8);
      if (Math.hypot(x - CAVE.x, z - CAVE.z) < CAVE.r) c.lerp(dark, 0.85);
      const cd = Math.hypot(x - CRATER.x, z - CRATER.z); if (cd < CRATER.r + 1.5) c.lerp(dark, 0.6 * (1 - sstep(CRATER.r - 2, CRATER.r + 1.5, cd)));
      for (const dg of DIGS) if (Math.hypot(x - dg.x, z - dg.z) < dg.r) c.lerp(sand, 0.85);
      col.set([c.r, c.g, c.b], k * 3);
      if (i < N && j < N) { const a = k, b = (i + 1) * n + j, cc = i * n + j + 1, d = (i + 1) * n + j + 1; idx.push(a, b, cc, d, cc, b); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, std({ vertexColors: true, map: grassTex(), roughness: 0.95, envMapIntensity: 0.35 }));
    terrain.receiveShadow = true; root.add(terrain);
  }
  // invisible fences at the edge of the map (the hills there are steep anyway)
  for (const [x, z, w, d] of [[0, BOUNDS.z0, 140, 1], [0, BOUNDS.z1, 140, 1], [BOUNDS.x0, 18, 1, 145], [BOUNDS.x1, 18, 1, 145]]) solidBox(phys, x, 4, z, w, 12, d);

  // ---------- water ----------
  const waterMat = std({ color: 0x2a5864, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.8, envMapIntensity: 1.4, depthWrite: false });
  const lakeGeo = new THREE.CircleGeometry(LAKE.r + 2.5, 56); lakeGeo.rotateX(-Math.PI / 2);
  const lake = add(new THREE.Mesh(lakeGeo, waterMat), LAKE.x, LAKE.level, LAKE.z, false); lake.renderOrder = 1;
  {
    const pts = [];
    for (let i = 0; i < STREAM.length - 1; i++) { const [ax, az] = STREAM[i], [bx, bz] = STREAM[i + 1], L = Math.hypot(bx - ax, bz - az); for (let s = 0; s < L; s += 1) pts.push([ax + (bx - ax) * s / L, az + (bz - az) * s / L]); }
    pts.push(STREAM[STREAM.length - 1]);
    const pos = [], idx = [];
    pts.forEach((p, i) => { const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)], dx = q[0] - o[0], dz = q[1] - o[1], l = Math.hypot(dx, dz) || 1; pos.push(p[0] - dz / l * 2.7, STREAM_LEVEL, p[1] + dx / l * 2.7, p[0] + dz / l * 2.7, STREAM_LEVEL, p[1] - dx / l * 2.7); if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
    const st = add(new THREE.Mesh(g, waterMat), 0, 0, 0, false); st.renderOrder = 1;
  }
  // footbridge where the home path crosses the stream
  {
    const a = Math.atan2(17.4 - 11, -9.6 - -6.6), cx = -9.15, cz = 16.4, plank = std({ color: 0x7b5a3a, roughness: 0.85 });
    const ry = -a; // boxes are long along x
    box(5.4, 0.1, 1.5, plank, cx, 0.12, cz, true, ry);
    for (const s of [-1, 1]) { const ox = Math.sin(a) * 0.72 * s, oz = -Math.cos(a) * 0.72 * s; box(5.4, 0.06, 0.06, plank, cx + ox, 0.95, cz + oz, false, ry); for (const t of [-2.5, 0, 2.5]) box(0.08, 0.85, 0.08, plank, cx + ox + Math.cos(a) * t, 0.55, cz + oz + Math.sin(a) * t, false, ry); }
  }

  // ---------- trees, bushes, grass and boulders ----------
  const clear = (x, z, m = 0) => {
    if (x < BOUNDS.x0 + 2 || x > BOUNDS.x1 - 2 || z < BOUNDS.z0 + 2 || z > BOUNDS.z1 - 2) return false;
    if (boxDist(x, z, ...BUILDINGS[0]) < 5 + m || boxDist(x, z, ...BUILDINGS[1]) < 4 + m) return false;
    if (pathDist(x, z) < 2.2 + m || streamDist(x, z) < 3.2 + m || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 3 + m) return false;
    if (Math.hypot(x - CAVE.x, z - CAVE.z) < CAVE.r + 2.5 + m || Math.hypot(x - CRATER.x, z - CRATER.z) < CRATER.r + 2 + m || Math.hypot(x - 8, z - 30) < 4) return false;
    for (const d of DEPOSITS) for (const p of d.at) if (Math.hypot(x - p[0], z - p[1]) < 2.5 + m) return false;
    return true;
  };
  const trees = [];
  for (let k = 0; k < 900 && trees.length < 210; k++) {
    const x = BOUNDS.x0 + R() * (BOUNDS.x1 - BOUNDS.x0), z = BOUNDS.z0 + R() * (BOUNDS.z1 - BOUNDS.z0);
    if (!clear(x, z) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
    trees.push({ x, z, y: heightAt(x, z), h: 3.5 + R() * 3.5, r: 0.16 + R() * 0.14, pine: R() < 0.45, s: 0.85 + R() * 0.5 });
  }
  // a dense band of forest beyond the fences, so the map ends in trees rather than a wall
  for (let k = 0; k < 4000; k++) {
    const x = X0 + 1 + R() * (N - 2), z = Z1 - N + 1 + R() * (N - 2);
    if (x > BOUNDS.x0 + 0.5 && x < BOUNDS.x1 - 0.5 && z > BOUNDS.z0 + 0.5 && z < BOUNDS.z1 - 0.5) continue;
    if (trees.some((t) => t.edge && Math.abs(t.x - x) < 2.6 && Math.abs(t.z - z) < 2.6)) continue;
    trees.push({ x, z, y: heightAt(x, z), h: 6 + R() * 5, r: 0.2 + R() * 0.12, pine: R() < 0.7, s: 1.1 + R() * 0.6, edge: true });
  }
  {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1, 1, 7), std({ map: barkTex(), roughness: 0.95 }), trees.length);
    const crownGeo = new THREE.IcosahedronGeometry(1, 1); { const p = crownGeo.attributes.position; for (let i = 0; i < p.count; i++) { const n = 1 + 0.18 * Math.sin(p.getX(i) * 5 + p.getY(i) * 3) * Math.cos(p.getZ(i) * 4); p.setXYZ(i, p.getX(i) * n, p.getY(i) * n, p.getZ(i) * n); } crownGeo.computeVertexNormals(); }
    const pineGeo = new THREE.ConeGeometry(1, 1, 9); pineGeo.translate(0, 0.5, 0);
    const leaves = std({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const nP = trees.filter((t) => t.pine).length;
    const crowns = new THREE.InstancedMesh(crownGeo, leaves, trees.length - nP), pines = new THREE.InstancedMesh(pineGeo, leaves, nP * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(), p = V(), c = new THREE.Color();
    let ci = 0, pi = 0;
    trees.forEach((t, i) => {
      m.compose(p.set(t.x, t.y + t.h * 0.5 - 0.1, t.z), q.identity(), s.set(t.r, t.h, t.r)); trunk.setMatrixAt(i, m);
      if (t.pine) {
        for (let k = 0; k < 2; k++) { m.compose(p.set(t.x, t.y + t.h * (0.32 + k * 0.28), t.z), q.setFromEuler(new THREE.Euler(0, R() * 3, 0)), s.set(t.s * (1.7 - k * 0.5), t.h * (0.62 - k * 0.12), t.s * (1.7 - k * 0.5))); pines.setMatrixAt(pi, m); pines.setColorAt(pi++, c.setHSL(0.33 + R() * 0.04, 0.42, 0.17 + R() * 0.05)); }
      } else {
        m.compose(p.set(t.x, t.y + t.h * 0.86, t.z), q.setFromEuler(new THREE.Euler(R(), R() * 3, R())), s.set(t.s * 1.9, t.s * 1.6, t.s * 1.9)); crowns.setMatrixAt(ci, m); crowns.setColorAt(ci++, c.setHSL(0.24 + R() * 0.06, 0.45, 0.24 + R() * 0.08));
      }
      if (!t.edge) solidBox(phys, t.x, t.y + 1.5, t.z, t.r * 1.7, 3, t.r * 1.7);
    });
    for (const im of [trunk, crowns, pines]) { im.castShadow = true; im.receiveShadow = true; root.add(im); }
  }
  {
    // bushes (the purple-flecked ones by the lake are elderberries)
    const list = [];
    for (let k = 0; k < 600 && list.length < 120; k++) { const x = BOUNDS.x0 + R() * 136, z = BOUNDS.z0 + R() * 140; if (clear(x, z, -1)) list.push([x, z, 0.4 + R() * 0.5, 0]); }
    for (const sp of SPAWNS.filter((s) => s.mat === 'berries')) { list.push([sp.at[0], sp.at[1] - 0.9, 0.75, 1]); list.push([sp.at[0] + 1, sp.at[1] + 0.4, 0.6, 1]); }
    const geo = new THREE.IcosahedronGeometry(1, 1); { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const n = 1 + 0.22 * Math.sin(p.getX(i) * 7 + p.getZ(i) * 5); p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * 0.75, p.getZ(i) * n); } geo.computeVertexNormals(); }
    const im = new THREE.InstancedMesh(geo, std({ color: 0xffffff, roughness: 0.9, flatShading: true }), list.length);
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), std({ color: 0x2a0f36, roughness: 0.35 }), list.filter((b) => b[3]).length * 26);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(), p = V(), c = new THREE.Color();
    let di = 0;
    list.forEach(([x, z, r, berry], i) => {
      const y = heightAt(x, z);
      m.compose(p.set(x, y + r * 0.45, z), q.setFromEuler(new THREE.Euler(0, R() * 6, 0)), s.set(r, r, r)); im.setMatrixAt(i, m); im.setColorAt(i, c.setHSL(0.27 + R() * 0.05, 0.42, berry ? 0.2 : 0.22 + R() * 0.08));
      if (berry) for (let k = 0; k < 26; k++) { const a = R() * 6.28, e = R() * 1.2; m.compose(p.set(x + Math.cos(a) * Math.cos(e) * r * 1.02, y + r * 0.45 + Math.sin(e) * r * 0.75, z + Math.sin(a) * Math.cos(e) * r * 1.02), q.identity(), s.set(1, 1, 1)); dots.setMatrixAt(di++, m); }
    });
    dots.count = di;
    im.castShadow = true; im.receiveShadow = true; root.add(im, dots);
  }
  {
    // grass tufts: three thin blades each
    const blade = [];
    for (let k = 0; k < 3; k++) { const a = k * 2.1, ca = Math.cos(a), sa = Math.sin(a), lean = 0.06; blade.push(-0.03 * sa, 0, -0.03 * ca, 0.03 * sa, 0, 0.03 * ca, ca * lean, 0.28, -sa * lean); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(blade, 3)); geo.computeVertexNormals();
    const cols = []; for (let k = 0; k < 3; k++) cols.push(0.2, 0.3, 0.1, 0.2, 0.3, 0.1, 0.55, 0.7, 0.3); geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const list = [];
    for (let k = 0; k < 9000 && list.length < 3200; k++) { const x = BOUNDS.x0 + R() * 136, z = BOUNDS.z0 + R() * 140; if (clear(x, z, -1.8) && heightAt(x, z) < 1.2) list.push([x, z]); }
    const im = new THREE.InstancedMesh(geo, std({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(), p = V();
    list.forEach(([x, z], i) => { const k = 0.7 + R() * 1.1; m.compose(p.set(x, heightAt(x, z) - 0.02, z), q.setFromEuler(new THREE.Euler(0, R() * 6, 0)), s.set(k, k, k)); im.setMatrixAt(i, m); });
    im.receiveShadow = true; root.add(im);
  }
  const rockGeo = (seed, flat = 0.7) => { const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, r2 = rng(seed); const a = [r2() * 5, r2() * 5, r2() * 5]; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + 0.2 * Math.sin(x * 3 + a[0]) * Math.cos(z * 3 + a[1]) + 0.1 * Math.sin(y * 7 + a[2]); p.setXYZ(i, x * n, y * n * flat, z * n); } g.computeVertexNormals(); return g; };
  {
    const im = new THREE.InstancedMesh(rockGeo(5), std({ color: 0x8a877e, roughness: 0.95, flatShading: true }), 80);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(), p = V();
    let i = 0;
    for (let k = 0; k < 400 && i < 70; k++) { const x = BOUNDS.x0 + R() * 136, z = BOUNDS.z0 + R() * 140; if (!clear(x, z, -1)) continue; const r = 0.15 + R() * 0.35; m.compose(p.set(x, heightAt(x, z), z), q.setFromEuler(new THREE.Euler(R(), R() * 6, R() * 0.3)), s.set(r * 1.3, r, r)); im.setMatrixAt(i++, m); }
    // a few at the cave mouth
    for (const [a, rr, r] of [[0.48, 7.2, 0.9], [-0.5, 7.1, 0.8], [0.62, 6.5, 0.55], [-0.66, 6.6, 0.6]]) { const [x, z] = caveAt(a, rr); m.compose(p.set(x, 0, z), q.setFromEuler(new THREE.Euler(0, a, 0)), s.set(r * 1.2, r * 1.3, r)); im.setMatrixAt(i++, m); }
    im.count = i; im.castShadow = true; im.receiveShadow = true; root.add(im);
  }

  // ---------- the cave: a rock dome with a way in on the side facing the lab ----------
  {
    const g = new THREE.SphereGeometry(1, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
    const p = g.attributes.position, keep = [];
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + 0.08 * Math.sin(x * 9 + z * 4) * Math.cos(y * 7) + 0.05 * Math.sin(z * 13 - x * 5); p.setXYZ(i, x * CAVE.r * n, y * CAVE.h * (0.95 + 0.1 * Math.sin(x * 6)), z * CAVE.r * n); }
    for (let t = 0; t < p.count; t += 3) {
      let ang = 0, yy = 0; for (let k = 0; k < 3; k++) { ang += Math.atan2(p.getZ(t + k), p.getX(t + k)) / 3; yy += p.getY(t + k) / 3; }
      if (!(Math.abs(ang) < 0.36 && yy < 2.5)) keep.push(t);
    }
    const pos = new Float32Array(keep.length * 9);
    keep.forEach((t, i) => { for (let k = 0; k < 3; k++) pos.set([p.getX(t + k), p.getY(t + k), p.getZ(t + k)], i * 9 + k * 3); });
    const dome = new THREE.BufferGeometry(); dome.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dome.computeVertexNormals();
    add(new THREE.Mesh(dome, std({ color: 0x6f6a60, roughness: 0.97, flatShading: true, side: THREE.DoubleSide })), CAVE.x, -0.05, CAVE.z);
    const NW = 18, rw = CAVE.r * 0.84;
    for (let i = 0; i < NW; i++) {
      const a = (i + 0.5) / NW * Math.PI * 2, aa = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(aa) < 0.42) continue;
      solidBox(phys, CAVE.x + Math.cos(a) * rw, 1.5, CAVE.z + Math.sin(a) * rw, 0.8, 3, 2 * Math.PI * rw / NW * 1.15, -a);
    }
    solidBox(phys, CAVE.x, CAVE.h * 0.78, CAVE.z, CAVE.r * 1.6, 0.4, CAVE.r * 1.6);
    const glow = new THREE.PointLight(0xffa040, 1.6, 7, 2); glow.position.set(...[caveAt(Math.PI, 4.3)].map(([x, z]) => [x, 0.6, z])[0]); root.add(glow);
  }

  // ---------- deposits: rocks you break pieces off with the rock pick ----------
  const deposits = [];
  for (const def of DEPOSITS) {
    def.at.forEach(([x, z, size], k) => {
      const y = heightAt(x, z);
      let mesh;
      if (def.crystal) {
        mesh = new THREE.Group();
        const base = new THREE.Mesh(rockGeo(31 + k, 0.5), std({ color: def.base, roughness: 0.9, flatShading: true })); base.scale.setScalar(size); mesh.add(base);
        const xm = new THREE.MeshPhysicalMaterial({ color: 0xf2f8fa, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.8, clearcoat: 1, flatShading: true, envMapIntensity: 1.6 });
        for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), xm); const prism = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6), xm); const grp = new THREE.Group(); prism.position.y = 0.11; c.position.y = 0.28; grp.add(prism, c); const a = i * 0.7, rr = (i % 3) * 0.12; grp.position.set(Math.cos(a) * rr, size * 0.25, Math.sin(a) * rr); grp.rotation.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); grp.scale.setScalar(0.7 + (i % 4) * 0.25); mesh.add(grp); }
      } else {
        const geo = rockGeo(11 + k * 7 + def.mat.length, def.vent ? 0.45 : 0.7), pa = geo.attributes.position, col = new Float32Array(pa.count * 3), cb = new THREE.Color(def.base), cs = new THREE.Color(def.speck), cc = new THREE.Color();
        for (let i = 0; i < pa.count; i++) { const n = Math.sin(pa.getX(i) * 13 + pa.getY(i) * 7) * Math.cos(pa.getZ(i) * 11 - pa.getY(i) * 5); cc.copy(cb).lerp(cs, n > 0.35 ? 0.9 : n > 0.1 ? 0.35 : 0); col.set([cc.r, cc.g, cc.b], i * 3); }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        mesh = new THREE.Mesh(geo, std({ vertexColors: true, roughness: def.mat === 'coal' ? 0.55 : 0.9, flatShading: true }));
        mesh.scale.setScalar(size);
      }
      mesh.position.set(x, y + size * 0.15, z); mesh.rotation.y = k * 1.7;
      mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      root.add(mesh);
      const body = solidBox(phys, x, y + size * 0.35, z, size * 1.5, size * 1.1, size * 1.5, k * 1.7);
      const dep = { ...def, x, y, z, size, mesh, body, left: def.n, hits: 0, regen: 0 };
      body.deposit = dep;
      deposits.push(dep);
    });
  }

  // ---------- old campfire, crater, signpost ----------
  {
    const stone = std({ color: 0x77736b, roughness: 0.95, flatShading: true }), char = std({ color: 0x1b1714, roughness: 0.8 });
    const g = rockGeo(77);
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, m = add(new THREE.Mesh(g, stone), 8 + Math.cos(a) * 0.75, heightAt(8, 30) + 0.04, 30 + Math.sin(a) * 0.75); m.scale.set(0.16, 0.12, 0.13); m.rotation.y = a; }
    for (let i = 0; i < 3; i++) { const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 7), char), 8 + (i - 1) * 0.14, heightAt(8, 30) + 0.06, 30); m.rotation.set(Math.PI / 2, 0, i * 1.1); }
    const ash = add(new THREE.Mesh(new THREE.CircleGeometry(0.62, 18).rotateX(-Math.PI / 2), std({ color: 0x2a2724, roughness: 1 })), 8, heightAt(8, 30) + 0.02, 30, false); void ash;
  }
  {
    // signpost outside the lab door: each board points at its place
    const wood = std({ color: 0x6b4c30, roughness: 0.85 }), sx = -3.2, sz = 8.6;
    box(0.12, 2.2, 0.12, wood, sx, 1.1, sz);
    [['HOME', -14, 31], ['CAVE', -40, -20], ['LAKE', 30, 30], ['RED ROCKS', 30, -7]].forEach(([txt, tx, tz], i) => {
      const a = Math.atan2(-(tz - sz), tx - sx);
      const mat = std({ map: signTex([txt + '  ›'], '#e9dcc0', '#3a2a18', 512, 110, false), roughness: 0.8 }), matB = std({ map: signTex(['‹  ' + txt], '#e9dcc0', '#3a2a18', 512, 110, false), roughness: 0.8 });
      const grp = new THREE.Group(); grp.position.set(sx, 1.95 - i * 0.24, sz); grp.rotation.y = a;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.19), mat); f.position.set(0.5, 0, 0.026); grp.add(f);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.19), matB); b.position.set(0.5, 0, -0.026); b.rotation.y = Math.PI; grp.add(b);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 0.05), wood); plank.position.set(0.5, 0, 0); grp.add(plank);
      grp.traverse((o) => { if (o.isMesh) o.castShadow = true; }); root.add(grp);
    });
  }

  // ---------- the lab from outside: a roof and a sign over the door ----------
  {
    const roof = std({ color: 0x4a4f53, roughness: 0.8 });
    box(14.9, 0.3, 10.9, roof, 0, 3.62, 0, false); // underside clear of the lab ceiling (3.4 m), or the two flicker
    box(4.5, 0.3, 5.9, roof, 9.35, 3.62, 2.5, false);
    const s = add(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), std({ map: signTex(['SCIENCE LAB'], '#12202b', '#e8ecec', 768, 160, false), roughness: 0.6 })), -5.4, 2.75, 5.31, false); void s;
  }

  // ---------- home ----------
  const plaster = std({ map: plasterTex(), roughness: 0.92 }), planks = std({ map: plankTex(), roughness: 0.7 });
  {
    const H = HOUSE, h = H.h, t = 0.2, cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2, W = H.x1 - H.x0, D = H.z1 - H.z0;
    const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(W, D), planks), cx, 0.004, cz, false); floor.rotation.x = -Math.PI / 2;
    const ceil = add(new THREE.Mesh(new THREE.PlaneGeometry(W, D), std({ color: 0xf2eee6, roughness: 1 })), cx, h, cz, false); ceil.rotation.x = Math.PI / 2;
    const dx = H.doorX;
    box(dx - 0.5 - H.x0, h, t, plaster, (H.x0 + dx - 0.5) / 2, h / 2, H.z0);
    box(H.x1 - dx - 0.5, h, t, plaster, (H.x1 + dx + 0.5) / 2, h / 2, H.z0);
    box(1, h - 2.1, t, plaster, dx, 2.1 + (h - 2.1) / 2, H.z0);
    box(W + t, h, t, plaster, cx, h / 2, H.z1);
    box(t, h, D, plaster, H.x0, h / 2, cz);
    box(t, h, D, plaster, H.x1, h / 2, cz);
    box(0.12, h, 4.9, plaster, -15.2, h / 2, 34.05); // bedroom wall
    // gable roof
    const rise = 1.4, half = D / 2 + 0.45, ang = Math.atan2(rise, D / 2), len = half / Math.cos(ang), tile = std({ color: 0x7a3a2a, roughness: 0.8 });
    for (const s of [-1, 1]) { const m = add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.9, 0.14, len), tile), cx, h + rise / 2 + 0.07, cz + s * half / 2); m.rotation.x = s * ang; }
    const gable = new THREE.Shape(); gable.moveTo(-D / 2, 0); gable.lineTo(D / 2, 0); gable.lineTo(0, rise); gable.lineTo(-D / 2, 0);
    for (const x of [H.x0, H.x1]) { const m = add(new THREE.Mesh(new THREE.ShapeGeometry(gable), std({ color: 0xe6dccb, roughness: 0.92, side: THREE.DoubleSide })), x, h, cz); m.rotation.y = Math.PI / 2; }
    // windows (bright daylight panes) and a warm lamp
    const pane = std({ color: 0xbfdcef, emissive: 0x9cc6e6, emissiveIntensity: 0.9, roughness: 0.1 }), frame = std({ color: 0xf4f1ea, roughness: 0.6 });
    for (const [x, z, ry] of [[H.x0 + 0.11, 33.6, Math.PI / 2], [H.x0 - 0.11, 33.6, -Math.PI / 2], [-12, H.z1 - 0.11, Math.PI], [-12, H.z1 + 0.11, 0], [-17, H.z0 - 0.11, Math.PI], [-17, H.z0 + 0.11, 0]]) {
      const m = add(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), pane), x, 1.55, z, false); m.rotation.y = ry;
      const f = add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.02), frame), x, 1.55, z, false); f.rotation.y = ry; f.position.addScaledVector(V(Math.sin(ry), 0, Math.cos(ry)), -0.012);
    }
    const lamp = new THREE.PointLight(0xffe2b8, 7, 11, 2); lamp.position.set(-13.5, 2.4, 33); root.add(lamp);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), std({ color: 0xfff4dc, emissive: 0xffe6b0, emissiveIntensity: 2 })), -13.5, 2.5, 33, false);
    // bed
    const bx = -17.4, bz = 35.1;
    box(1.1, 0.4, 2.0, std({ color: 0x6a4a30, roughness: 0.7 }), bx, 0.2, bz);
    box(1.0, 0.16, 1.9, std({ color: 0xece8e0, roughness: 0.95 }), bx, 0.48, bz, false);
    box(1.04, 0.06, 1.3, std({ color: 0x3f5f8a, roughness: 0.95 }), bx, 0.58, bz - 0.25, false);
    box(0.6, 0.12, 0.35, std({ color: 0xf8f6f0, roughness: 0.95 }), bx, 0.62, bz + 0.72, false);
    box(1.1, 0.9, 0.08, std({ color: 0x6a4a30, roughness: 0.7 }), bx, 0.45, bz + 1.0);
    fixtures.push({ pos: V(bx, 0.55, bz), r: 0.6, name: 'Bed', hint: () => 'Sleep until morning (the forest regrows, the kitchen is restocked)', use: () => G.hooks.sleep && G.hooks.sleep() });
    // kitchen: counter along the east wall, a table, a tap
    const counterMat = std({ color: 0xd8d2c4, roughness: 0.55 }), cab = std({ color: 0x8a6a48, roughness: 0.7 });
    box(0.62, 0.86, 5.6, cab, -9.92, 0.43, 33.4, false); solidBox(phys, -9.92, 0.45, 33.4, 0.62, 0.9, 5.6);
    box(0.66, 0.04, 5.64, counterMat, -9.92, 0.88, 33.4, false);
    box(0.5, 0.05, 0.42, std({ color: 0xa8acb0, metalness: 0.9, roughness: 0.3 }), -9.92, 0.905, 34.6, false);
    const tap = add(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 16, Math.PI), std({ color: 0xc8ccd0, metalness: 1, roughness: 0.3 })), -9.72, 1.08, 34.6); tap.rotation.y = Math.PI / 2;
    fixtures.push({ pos: V(-9.8, 1.0, 34.6), r: 0.22, name: 'Kitchen tap', hint: () => (G.grab.item && G.grab.item.kind === 'vessel' ? 'Fill what you are holding with water' : 'Hold a container, then press F to fill it'), use: () => G.hooks.fillWater && G.hooks.fillWater('the kitchen tap') });
    box(1.2, 0.05, 0.8, cab, -12.4, 0.75, 34.2, false); solidBox(phys, -12.4, 0.39, 34.2, 1.2, 0.78, 0.8);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.05, 0.73, 0.05, cab, -12.4 + a * 0.55, 0.365, 34.2 + b * 0.35, false);
    // front door
    const d = makeDoor(G, { x: dx - 0.5, z: H.z0, a0: 0, a1: -Math.PI / 2 * 0.92, mat: std({ color: 0x6b3f22, roughness: 0.6 }), name: 'Front door' });
    doors.push(d); fixtures.push(d.fixture);
    const mat2 = add(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), std({ color: 0x8a3a2a, roughness: 1 })), dx, 0.008, H.z0 - 0.5, false); mat2.rotation.x = -Math.PI / 2;
  }

  // ---------- story pickups ----------
  const spawners = SPAWNS.map((s) => ({ ...s, items: new Set(), t: 0 }));
  function spawnOne(sp) {
    const M = G.matter, a = Math.random() * 6.28, r = Math.random() * sp.r;
    const x = sp.at[0] + Math.cos(a) * r, z = sp.at[1] + Math.sin(a) * r;
    const inCave = Math.hypot(x - CAVE.x, z - CAVE.z) < CAVE.r;
    const l = M.makeLump(sp.sub, sp.mol * (0.8 + Math.random() * 0.4), { shape: sp.shape, name: sp.name });
    l.matId = sp.mat; l.spawner = sp;
    M.place(l, x, (inCave ? 0 : heightAt(x, z)) + 0.01, z, Math.random() * 6);
    sp.items.add(l);
    return l;
  }
  function alive(sp) { for (const it of sp.items) if (it.dead || it.taken) sp.items.delete(it); return sp.items.size; }
  function spawnAll(full = true) { for (const sp of spawners) { const n = full ? sp.max : 0; while (alive(sp) < n) spawnOne(sp); } }
  function regrow() { for (const d of deposits) { d.left = d.n; d.hits = 0; } spawnAll(true); }

  // ---------- where am I ----------
  function zoneAt(p) {
    if (p.x > -7.3 && p.x < 7.3 && p.z > -5.3 && p.z < 5.3) return 'lab';
    if (p.x > 7.3 && p.x < 11.3 && p.z > -0.3 && p.z < 5.3) return 'store';
    if (p.x > HOUSE.x0 && p.x < HOUSE.x1 && p.z > HOUSE.z0 && p.z < HOUSE.z1) return 'house';
    if (Math.hypot(p.x - CAVE.x, p.z - CAVE.z) < CAVE.r * 0.88) return 'cave';
    if (Math.hypot(p.x - LAKE.x, p.z - LAKE.z) < LAKE.r + 7) return 'lake';
    if (streamDist(p.x, p.z) < 4) return 'stream';
    if (Math.hypot(p.x - CRATER.x, p.z - CRATER.z) < CRATER.r + 4) return 'crater';
    if (Math.hypot(p.x - 31, p.z + 7) < 9) return 'rocks';
    return 'forest';
  }
  function digAt(x, z) { for (const d of DIGS) if (Math.hypot(x - d.x, z - d.z) < d.r) return d; return null; }

  // ---------- per frame ----------
  let shown = false, inside = 0, ventT = 0;
  function show(on) {
    shown = on; root.visible = on;
    scene.fog = on ? fog : null;
    scene.background = on ? new THREE.Color(0xb3cbdc) : new THREE.Color(0x06080a);
    G.camera.far = on ? 260 : 60; G.camera.updateProjectionMatrix();
    for (const d of doors) d.show(on);
  }
  function update(dt, t) {
    if (!shown) return;
    const p = G.player.pos;
    for (const d of doors) d.update(dt);
    sky.position.copy(p);
    sun.position.set(p.x + 45, p.y + 62, p.z + 35); sun.target.position.set(p.x, 0, p.z); sun.target.updateMatrixWorld();
    // light falls off indoors and in the cave (the lab and house have their own lamps)
    const z = zoneAt(p), want = z === 'cave' ? 0.03 : z === 'lab' || z === 'store' ? 0.12 : z === 'house' ? 0.35 : 1;
    inside += (want - inside) * Math.min(1, dt * 2.5);
    hemi.intensity = 1.0 * inside; scene.environmentIntensity = 0.42 * (0.25 + 0.75 * Math.min(1, inside * 1.6)) + (z === 'lab' ? 0.1 : 0);
    // the warm vent in the cave breathes a little smoke
    ventT -= dt;
    if (ventT <= 0 && Math.hypot(p.x - CAVE.x, p.z - CAVE.z) < 20) { ventT = 0.35; const [vx, vz] = caveAt(Math.PI, 4.9); G.P.emit({ pos: V(vx, 0.5, vz), vel: V((Math.random() - 0.5) * 0.1, 0.35, (Math.random() - 0.5) * 0.1), life: 3, size: 0.08, size1: 0.5, color: 0xd8d4b0, alpha: 0.25, tex: 'smoke' }); }
    // deposits slowly regrow, and pickups come back when you are not looking
    for (const d of deposits) if (d.left < d.n) { d.regen += dt; if (d.regen > 120) { d.regen = 0; d.left++; } }
    if (!G.netGuest) for (const sp of spawners) { sp.t += dt; if (sp.t > sp.every) { sp.t = 0; if (alive(sp) < sp.max && Math.hypot(p.x - sp.at[0], p.z - sp.at[1]) > 18) spawnOne(sp); } }
    // wading slows you down
    const feet = G.player.body.position.y - 0.3, wl = waterLevelAt(G.player.body.position.x, G.player.body.position.z);
    G.player.slow = wl !== null && feet < wl - 0.08 ? 0.6 : 1;
    void t;
  }
  show(false);
  return { root, show, update, spawnAll, regrow, deposits, spawners, fixtures, doors, zoneAt, digAt, heightAt, groundAt, waterLevelAt, get shown() { return shown; }, startPos: { x: -16.6, z: 33.6, yaw: -0.57 } };
}
