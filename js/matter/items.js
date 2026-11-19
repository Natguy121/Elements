import * as THREE from 'three';
import { SUB, canReact, stateAt } from '../chem/db.js';
import { Mixture, CHUNK } from '../chem/mixture.js';
import { VESSELS, PROPS, heatGlow } from './defs.js';
import { labelTex, woodTex, steelTex } from '../world/textures.js';
import { play } from '../core/audio.js';
import { G_STATIC, G_PROP, G_HELD } from '../physics/world.js';

// Everything you can pick up, and everything that can be spilled.
//   vessel : a container with an inside (beaker, jar, bottle...). Holds a Mixture.
//   lump   : a loose solid piece (a pea of sodium, a nail, a gold bar). Is a Mixture of one thing.
//   prop   : plain objects with no chemistry (crates, gas cylinder, drum, lighter).
//   puddle : a spill on a fixed surface. Holds a Mixture too, so spills keep reacting.
//   parcel : a blob of liquid or powder in flight between the above.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const G9 = 9.81;

export function createMatter(G) {
  const { scene, phys } = G;
  const { CANNON } = phys;
  const items = new Set(), puddles = [], parcels = [], breakQueue = [];
  let nextId = 1;
  const cv = new CANNON.Vec3(), cv2 = new CANNON.Vec3(), cq = new CANNON.Vec3();
  const t1 = V(), t2 = V(), t3 = V();

  // ---------- shared materials ----------
  const M = {
    // borosilicate glass: mostly see-through, slightly green-grey at the edges, sharp highlights
    glass: new THREE.MeshPhysicalMaterial({ color: 0xdbe8e6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.3, specularIntensity: 1, ior: 1.47 }),
    amber: new THREE.MeshPhysicalMaterial({ color: 0x7a3d10, roughness: 0.05, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.8, clearcoat: 1 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xeeebe2, roughness: 0.35, side: THREE.DoubleSide }),
    shard: new THREE.MeshPhysicalMaterial({ color: 0xdff2f5, roughness: 0.05, transparent: true, opacity: 0.4, envMapIntensity: 2.2, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.75 }),
    steel: new THREE.MeshStandardMaterial({ map: steelTex(), color: 0xc4c9cc, metalness: 1, roughness: 0.32 }),
    cyl: new THREE.MeshPhysicalMaterial({ color: 0x3d4a52, metalness: 0.6, roughness: 0.38, clearcoat: 0.3 }),
    drum: new THREE.MeshPhysicalMaterial({ color: 0x2f5a78, metalness: 0.7, roughness: 0.42, clearcoat: 0.2 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xcfa640, metalness: 1, roughness: 0.3 }),
    black: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.45, side: THREE.DoubleSide }),
  };
  // Glass is see-through face-on and reflective toward its edges (Fresnel). Doing this in the shader
  // stops empty glassware reading as frosted grey cups against the dark bench.
  function fresnelGlass(mat, faceAlpha, edgeAlpha) {
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
        float fresK = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        gl_FragColor.a = clamp(mix(${faceAlpha.toFixed(3)}, ${edgeAlpha.toFixed(3)}, fresK * fresK * fresK), 0.0, 1.0);`);
    };
    mat.customProgramCacheKey = () => 'fresnel' + faceAlpha + edgeAlpha;
    return mat;
  }
  fresnelGlass(M.glass, 0.035, 0.75);
  fresnelGlass(M.amber, 0.5, 0.9);
  fresnelGlass(M.shard, 0.15, 0.8);
  const geoCache = {};
  function vesselGeo(type) {
    if (geoCache[type]) return geoCache[type];
    const d = VESSELS[type];
    const outer = new THREE.LatheGeometry([new THREE.Vector2(0.0005, 0), ...d.prof.map(([r, y]) => new THREE.Vector2(r, y))], 30);
    const inner = new THREE.LatheGeometry([new THREE.Vector2(0.0005, d.inner[0][1]), ...d.inner.map(([r, y]) => new THREE.Vector2(r * 0.97, y)), new THREE.Vector2(d.rimR * 0.97, d.H + 0.05)], 26);
    const rim = new THREE.TorusGeometry(d.prof[d.prof.length - 1][0], 0.0016, 6, 30);
    return (geoCache[type] = { outer, inner, rim });
  }
  const DARK = new THREE.Color(0x0b0f12);
  const crystalGeo = new THREE.OctahedronGeometry(1, 0);
  const xtalMats = {};
  const crystalMat = (c) => (xtalMats[c] ||= new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.06, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.9, flatShading: true, envMapIntensity: 1.4 }));
  // spills spread into irregular blobs, not perfect circles
  function blobGeo() {
    const sh = new THREE.Shape(), n = 26, ph = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, r = 1 + 0.16 * Math.sin(a * 2 + ph[0]) + 0.1 * Math.sin(a * 3 + ph[1]) + 0.06 * Math.sin(a * 5 + ph[2]); if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const g = new THREE.ShapeGeometry(sh, 2); g.rotateX(-Math.PI / 2); return g;
  }
  const discGeo = new THREE.CircleGeometry(1, 28); discGeo.rotateX(-Math.PI / 2);
  const coneGeo = new THREE.ConeGeometry(1, 1, 22); coneGeo.translate(0, 0.5, 0);
  const pieceGeo = new THREE.IcosahedronGeometry(1, 1);
  { const p = pieceGeo.attributes.position; for (let i = 0; i < p.count; i++) { const n = 1 + 0.16 * Math.sin(p.getX(i) * 9 + p.getY(i) * 5) + 0.1 * Math.sin(p.getZ(i) * 11); p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * 0.85, p.getZ(i) * n); } pieceGeo.computeVertexNormals(); }
  const subMat = {};
  function lumpMaterial(id) {
    const s = SUB[id];
    const metal = s.look === 'metal';
    return new THREE.MeshStandardMaterial({ color: s.color, metalness: metal ? 1 : 0.05, roughness: metal ? (id === 'gold' ? 0.22 : 0.36) : 0.75, flatShading: id !== 'gold' && id !== 'mercury', emissive: 0x000000 });
  }
  const pieceMat = (id) => (subMat[id] ||= lumpMaterial(id));

  // ---------- registry ----------
  function register(it) {
    it.id = nextId++;
    it.nid = (G.netPrefix || 'h') + it.id; // network id: the same item on every player's screen
    it.body.item = it;
    it.lastHit = 0;
    it.body.addEventListener('collide', (e) => onCollide(it, e));
    items.add(it);
    scene.add(it.group);
    return it;
  }
  function onCollide(it, e) {
    const sp = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (sp < 0.5) return;
    const now = G.time;
    if (it.breakV && sp > it.breakV && !it.dead && !it.breaking) {
      it.lastImpact = sp; it.lastHitBy = e.body.item ? e.body.item.name + (e.body.item.held ? ' (held)' : '') : 'the room';
      const soft = e.body.item && e.body.item.kind === 'lump' && e.body.mass < 0.05; // a pea of sodium does not smash a beaker
      if (!soft) { it.breaking = true; breakQueue.push(it); return; }
    }
    if (now - it.lastHit < 0.09) return;
    it.lastHit = now;
    const pos = it.body.position, loud = Math.min(1.4, sp * 0.22 * (0.5 + Math.min(1.5, it.body.mass * 0.15)));
    play(it.sound || 'thud', pos, loud);
    if (it.body.mass > 15 && sp > 1.6) G.hooks.shake(Math.min(0.5, it.body.mass * sp * 0.0016), pos);
  }
  function added(it) { if (G.hooks.added) G.hooks.added(it); return it; }
  function remove(it) {
    if (it.dead) return;
    it.dead = true;
    items.delete(it);
    scene.remove(it.group);
    if (it.extras) for (const m of it.extras) scene.remove(m);
    phys.world.removeBody(it.body);
    if (G.hooks.removed) G.hooks.removed(it);
  }

  // ---------- vessels ----------
  function makeVessel(type, o = {}) {
    const d = VESSELS[type], g = vesselGeo(type);
    const group = new THREE.Group();
    const wallMat = d.mat === 'ceramic' ? M.ceramic : d.mat === 'plastic' ? M.plastic : o.glass === 'amber' ? M.amber : M.glass;
    const shell = new THREE.Mesh(g.outer, wallMat); shell.renderOrder = 3; shell.castShadow = d.mat === 'ceramic' || d.mat === 'plastic'; group.add(shell);
    const rim = new THREE.Mesh(g.rim, wallMat); rim.rotation.x = Math.PI / 2; rim.position.y = d.H; rim.renderOrder = 3; group.add(rim);
    const layers = [];
    for (let i = 0; i < 4; i++) {
      const top = new THREE.Plane(V(0, -1, 0), 0), bot = new THREE.Plane(V(0, 1, 0), 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: [top, bot] });
      const m = new THREE.Mesh(g.inner, mat); m.renderOrder = 1; m.visible = false; group.add(m);
      layers.push({ m, mat, top, bot });
    }
    const surface = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.6, depthWrite: false, envMapIntensity: 2 }));
    surface.renderOrder = 2; surface.visible = false; scene.add(surface);
    const pieces = [];
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(pieceGeo, pieceMat('iron')); m.visible = false; m.castShadow = true; scene.add(m); pieces.push(m); }
    let label = null;
    if (d.label && o.label) {
      const r = d.prof[2][0] + 0.0006, h = Math.min(0.06, d.prof[2][1] * 0.6);
      label = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true, -1.15, 2.3), new THREE.MeshStandardMaterial({ map: labelTex(o.label, o.formula || '', o.tags || [], o.accent), roughness: 0.7 }));
      label.position.y = d.prof[1][1] + h / 2 + 0.012; label.renderOrder = 4;
      group.add(label);
    }
    const body = phys.dynamicBody(new CANNON.Cylinder(Math.max(d.prof[d.prof.length - 1][0], d.maxR * 0.6), d.prof[1][0], d.H, 10), d.mass, new CANNON.Vec3(0, 1, 0), d.mat === 'ceramic' || d.mat === 'plastic' ? phys.mats.matGround : phys.mats.matGlass);
    const mix = new Mixture(20);
    mix.extraC = d.heatC;
    const it = register({
      kind: 'vessel', type, def: d, group, body, mix, name: o.label || d.name, label: o.label || null, layers, surface, pieces, extras: [surface, ...pieces],
      halfH: d.H / 2, pickR: Math.max(d.maxR, 0.03) + 0.015, breakV: d.breakV, sound: d.mat === 'plastic' ? 'thud' : 'clink', dirty: true, an: null,
      up: V(0, 1, 0), base: V(), foam: 0, pourAcc: 0, pourT: 0, pieceMol: {}, pieceShape: {}, air: d.air ?? 0.6, skitter: 0, flowing: 0, supply: !!o.label,
    });
    it.spawn = { f: 'v', type, o: { label: o.label, formula: o.formula, tags: o.tags, accent: o.accent, glass: o.glass } };
    if (G.hooks.added) G.hooks.added(it);
    return it;
  }
  function fill(it, id, mol, surf, pieceMol, shape) {
    it.mix.add(id, mol, 20, surf);
    if (pieceMol) { it.pieceMol[id] = pieceMol; it.pieceShape[id] = shape || 'chunk'; }
    it.dirty = true;
  }
  function place(it, x, y, z, ry = 0) {
    const h = it.halfH ?? 0;
    it.body.position.set(x, y + h + 0.002, z);
    it.body.quaternion.setFromEuler(0, ry, 0);
    it.body.velocity.set(0, 0, 0); it.body.angularVelocity.set(0, 0, 0);
    it.body.sleep();
    sync(it);
    return it;
  }

  // ---------- lumps ----------
  function makeLump(id, mol, o = {}) {
    const s = SUB[id], massKg = mol * s.M / 1000, volM3 = massKg / (s.density * 1000);
    const shape = o.shape || 'chunk';
    let geo, phShape, halfH, pickR;
    const mat = lumpMaterial(id);
    if (shape === 'ingot') {
      const k = Math.cbrt(volM3 / (3.2 * 1 * 1.15)), w = 3.2 * k, h = k, dd = 1.15 * k;
      geo = new THREE.BoxGeometry(w, h, dd, 1, 1, 1);
      const p = geo.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * 0.9, p.getY(i), p.getZ(i) * 0.82);
      geo.computeVertexNormals();
      phShape = new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, dd / 2)); halfH = h / 2; pickR = Math.max(w, dd) * 0.45;
      mat.flatShading = false;
    } else if (shape === 'ribbon' || shape === 'nail' || shape === 'stick') {
      const len = shape === 'nail' ? 0.05 : shape === 'stick' ? 0.24 : 0.07, a = Math.sqrt(volM3 / len), w = shape === 'ribbon' ? a * 2.4 : a, h = shape === 'ribbon' ? a / 2.4 : a;
      geo = shape === 'nail' ? new THREE.CylinderGeometry(a * 0.55, a * 0.4, len, 8).rotateZ(Math.PI / 2) : shape === 'stick' ? new THREE.CylinderGeometry(a * 0.5, a * 0.62, len, 7).rotateZ(Math.PI / 2) : new THREE.BoxGeometry(len, h, w, 6, 1, 1);
      if (shape === 'ribbon') { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 90) * 0.0025); geo.computeVertexNormals(); }
      phShape = new CANNON.Box(new CANNON.Vec3(len / 2, Math.max(0.004, h / 2 + 0.002), Math.max(0.005, w / 2))); halfH = Math.max(0.004, h / 2 + 0.002); pickR = len * 0.55;
    } else {
      const r = Math.max(0.0055, Math.cbrt(volM3 * 3 / (4 * Math.PI)));
      geo = pieceGeo; phShape = new CANNON.Sphere(r * 0.92); halfH = r * 0.85; pickR = r + 0.012;
      o.scale = r;
    }
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true;
    if (o.scale) mesh.scale.setScalar(o.scale);
    const group = new THREE.Group(); group.add(mesh);
    const body = phys.dynamicBody(phShape, massKg, new CANNON.Vec3(0, 1, 0), s.look === 'metal' ? phys.mats.matMetal : phys.mats.matGround);
    body.angularDamping = shape === 'chunk' ? 0.75 : 0.3; body.linearDamping = 0.06;
    const mix = new Mixture(o.T ?? 20);
    mix.add(id, mol, o.T ?? 20, o.surf ?? CHUNK);
    return added(register({
      kind: 'lump', sub: id, shape, group, body, mix, mesh, mat, name: o.name || s.name + (shape === 'ingot' ? ' bar' : shape === 'ribbon' ? ' ribbon' : shape === 'nail' ? ' nail' : massKg > 0.02 ? ' lump' : ''),
      halfH, pickR, sound: s.look === 'metal' ? (massKg > 3 ? 'heavy' : 'metal') : 'thud', air: 1, mol0: mol, baseColor: new THREE.Color(s.color), small: massKg < 0.08,
      spawn: { f: 'l', id, mol, o: { shape: o.shape, name: o.name, surf: o.surf } },
    }));
  }

  // ---------- props ----------
  function makeProp(type) {
    const d = PROPS[type], group = new THREE.Group();
    let shape, halfH;
    if (d.shape === 'box') {
      const [w, h, dd] = d.size;
      if (d.look === 'rack') {
        const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.7 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), wood); group.add(base);
        const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, dd), wood); top.position.y = 0.07; group.add(top);
        for (const sx of [-1, 1]) { const end = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.085, dd), wood); end.position.set(sx * (w / 2 - 0.006), 0.035, 0); group.add(end); }
        for (let i = 0; i < 6; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.002, 6, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 })); ring.position.set(-0.125 + i * 0.05, 0.077, 0); group.add(ring); }
      } else if (d.look === 'funnel') {
        const prof = [[0.004, -0.055], [0.004, -0.005], [0.048, 0.05], [0.05, 0.055]].map(([r, y]) => new THREE.Vector2(r, y));
        const cone = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), M.glass); cone.renderOrder = 3; group.add(cone);
        if (d.filter) { const paper = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.05, 20, 1, true).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 1, side: THREE.DoubleSide })); paper.position.y = 0.024; group.add(paper); }
        const res = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.02, 16).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })); res.position.y = 0.012; res.visible = false; group.add(res); group.userData.residue = res;
      } else if (d.look === 'thread') {
        const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, w, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8b830, roughness: 0.6 })); group.add(pencil);
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.075, 5), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 1 })); string.position.y = -0.0375; group.add(string);
        const cluster = new THREE.Group(); cluster.position.y = -0.065; group.add(cluster); group.userData.cluster = cluster;
      } else if (d.look === 'lighter') {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, h * 0.6, 12), M.black); m.position.y = -h * 0.2; group.add(m);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, h * 0.5, 8), M.steel); tube.position.y = h * 0.25; group.add(tube);
        const btn = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.008), new THREE.MeshStandardMaterial({ color: 0xc8201c, roughness: 0.4 })); btn.position.set(0, -h * 0.02, 0.014); group.add(btn);
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), M.wood); group.add(m);
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.012, 0.03, dd + 0.012), M.steel); band.position.y = h * 0.3; group.add(band);
        const band2 = band.clone(); band2.position.y = -h * 0.3; group.add(band2);
      }
      shape = new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, dd / 2)); halfH = h / 2;
    } else {
      const [r, h] = d.size;
      const mat = d.look === 'barrel' ? M.drum : M.cyl;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.look === 'barrel' ? h : h * 0.86, 28), mat); m.position.y = d.look === 'barrel' ? 0 : -h * 0.07; group.add(m);
      if (d.look === 'barrel') { for (const y of [-0.3, 0, 0.3]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.004, 0.012, 8, 30), mat); ring.rotation.x = Math.PI / 2; ring.position.y = y * h; group.add(ring); } const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.01, 28), M.steel); lid.position.y = h / 2 - 0.02; group.add(lid); }
      else { const sh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, 6.3, 0, 1.57), mat); sh.position.y = h * 0.36; group.add(sh); const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.1, 12), M.brass); valve.position.y = h * 0.46; group.add(valve); const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.14, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.5 })); band.position.y = h * 0.28; group.add(band); }
      shape = new CANNON.Cylinder(r, r, h, 14); halfH = h / 2;
    }
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const body = phys.dynamicBody(shape, d.mass, new CANNON.Vec3(0, 1, 0), d.sound === 'wood' ? phys.mats.matGround : phys.mats.matMetal);
    if (d.mass > 20) { body.angularDamping = 0.35; body.linearDamping = 0.08; }
    return added(register({ spawn: { f: 'p', type }, kind: 'prop', type, def: d, group, body, name: d.name, halfH, pickR: Math.max(d.size[0], d.shape === 'box' ? d.size[2] : d.size[0]) * 0.7, sound: d.sound, tool: type === 'lighter' ? 'lighter' : null }));
  }

  // ---------- breaking glass ----------
  const shardGeo = new THREE.BufferGeometry();
  shardGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0.2, 0.3, 0.1, 1, 0, 0, 0, 0.3, 0.1, 1, 1, 0, 0.2], 3)); shardGeo.computeVertexNormals();
  const shards = [];
  function shatter(it) {
    if (it.dead) return;
    G.stats.broken++; G.stats.lastBroken = it.name + ' (hit at ' + (it.lastImpact || 0).toFixed(1) + ' m/s by ' + (it.lastHitBy || 'something') + ')';
    (G.stats.brokenList ||= []).push(G.stats.lastBroken);
    const p = it.body.position, v = it.body.velocity;
    play('shatter', p, 1.2);
    G.hooks.discover('obs_broken');
    const n = it.def.mat === 'ceramic' ? 5 : 9;
    for (let i = 0; i < n; i++) {
      const s = 0.012 + Math.random() * 0.03;
      const m = new THREE.Mesh(shardGeo, it.def.mat === 'ceramic' ? M.ceramic : M.shard); m.scale.set(s, s * 0.6, s); m.castShadow = true;
      const b = phys.dynamicBody(new CANNON.Box(new CANNON.Vec3(s * 0.45, 0.003, s * 0.45)), 0.006, new CANNON.Vec3(p.x + (Math.random() - 0.5) * 0.05, p.y + Math.random() * 0.05, p.z + (Math.random() - 0.5) * 0.05), phys.mats.matGlass);
      b.velocity.set(v.x * 0.5 + (Math.random() - 0.5) * 1.6, Math.random() * 1.4, v.z * 0.5 + (Math.random() - 0.5) * 1.6);
      b.angularVelocity.set(Math.random() * 14, Math.random() * 14, Math.random() * 14);
      scene.add(m); shards.push({ m, b, life: 40 });
    }
    while (shards.length > 70) { const s = shards.shift(); scene.remove(s.m); phys.world.removeBody(s.b); }
    G.P.burst(14, () => ({ pos: V(p.x, p.y, p.z), vel: V((Math.random() - 0.5) * 3, Math.random() * 2.2, (Math.random() - 0.5) * 3), gravity: 9, life: 0.4 + Math.random() * 0.4, size: 0.012 + Math.random() * 0.02, color: 0xeaf6ff, boost: 2, add: true, tex: 'spark' }));
    spillAll(it, 1.4);
    remove(it);
  }
  // throw the whole contents out as flying blobs (broken or blown apart)
  function spillAll(it, speed = 1) {
    const p = it.body.position;
    for (const id of it.mix.ids()) {
      if (!it.mix.isChunk(id)) continue;
      const per = it.pieceMol[id] || it.mix.n[id], count = Math.max(1, Math.min(8, Math.round(it.mix.n[id] / per)));
      for (let i = 0; i < count; i++) { const l = makeLump(id, it.mix.n[id] / count, { shape: it.pieceShape[id], T: it.mix.T }); l.body.position.set(p.x + (Math.random() - 0.5) * 0.06, p.y + 0.02, p.z + (Math.random() - 0.5) * 0.06); l.body.velocity.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed); }
      it.mix.remove(id, it.mix.n[id]);
    }
    const total = it.mix.pourableL();
    if (total > 0) {
      const n = Math.max(1, Math.min(14, Math.ceil(total / 0.012)));
      for (let i = 0; i < n; i++) emitParcel(it.mix.split(1 / (n - i)), V(p.x + (Math.random() - 0.5) * 0.05, p.y + Math.random() * 0.05, p.z + (Math.random() - 0.5) * 0.05), V((Math.random() - 0.5) * speed * 1.4, Math.random() * speed, (Math.random() - 0.5) * speed * 1.4));
    }
    it.dirty = true;
  }

  // ---------- parcels (liquid and powder in flight) ----------
  const MAXP = 420;
  const parcelMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshStandardMaterial({ roughness: 0.15, transparent: true, opacity: 0.85, envMapIntensity: 1.6 }), MAXP);
  parcelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); parcelMesh.frustumCulled = false; parcelMesh.count = 0;
  scene.add(parcelMesh);
  const dm = new THREE.Object3D(), pc = new THREE.Color();
  function emitParcel(mix, pos, vel, opt = {}) {
    if (mix.isEmpty()) return;
    const a = mix.analyse();
    const top = a.top || { color: '#dddddd' };
    const volL = Math.max(a.total, 1e-5);
    parcels.push({ mix, x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z, r: Math.min(0.018, Math.max(0.0035, Math.cbrt(volL * 0.001 * 0.24))), color: opt.color || top.color, life: 6, foam: !!opt.foam, src: opt.src || null, age: 0 });
    if (parcels.length > MAXP) { const p = parcels.shift(); landOnGround(p); }
  }
  function landOnGround(p) { const hit = phys.raycast(p.x, p.y + 0.02, p.z, p.x, p.y - 4, p.z, G_STATIC); if (hit) spill(p.mix, hit.hitPointWorld.x, hit.hitPointWorld.y, hit.hitPointWorld.z); }
  function inDrain(x, y, z) {
    for (const d of G.drains) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1 && y < d.y + 0.25 && y > d.y - 0.1) return true;
    if (G.waterAt) { const wl = G.waterAt(x, z); if (wl !== null && y < wl + 0.05) return true; } // the stream or lake carries it away
    return false;
  }
  function updateParcels(dt) {
    let n = 0;
    for (let i = parcels.length - 1; i >= 0; i--) {
      const p = parcels[i];
      const ox = p.x, oy = p.y, oz = p.z;
      p.vy -= G9 * dt; p.age += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.life -= dt;
      let done = p.life <= 0 || p.y < -1;
      // into a container?
      if (!done && p.vy < 0.5) {
        for (const it of items) {
          if (it.kind !== 'vessel' || it === p.src && p.age < 0.25 || it.up.y < 0.45) continue;
          const b = it.body.position, dx = p.x - b.x, dy = p.y - b.y, dz = p.z - b.z;
          if (dx * dx + dy * dy + dz * dz > 0.09) continue;
          cv.set(p.x, p.y, p.z); it.body.pointToLocalFrame(cv, cv2);
          const hb = cv2.y + it.halfH, rad = Math.hypot(cv2.x, cv2.z), d = it.def;
          const fn = it.funnel, top = fn ? 0.115 : 0.03, catchR = fn ? 0.05 : d.rimR + 0.004;
          if (hb > d.H - 0.045 && hb < d.H + top && rad < catchR) {
            if (!p.foam && fn && fn.def.filter) G.hooks.filter(fn, p.mix);
            if (!p.foam) { it.mix.merge(p.mix); it.dirty = true; it.changed = G.time; if (Math.random() < 0.3) play(p.r > 0.008 ? 'splash' : 'drip', b, 0.25); }
            if (G.landings) G.landings.push([p.x, p.z, 'in']);
            done = true; break;
          }
        }
      }
      if (!done) {
        const hit = phys.raycast(ox, oy, oz, p.x, p.y, p.z, G_STATIC | G_PROP | G_HELD);
        if (hit && !(hit.body.item === p.src && p.age < 0.25)) {
          const hp = hit.hitPointWorld, ny = hit.hitNormalWorld.y, tgt = hit.body.item;
          if (tgt && tgt.kind === 'vessel' && ny > 0.6 && Math.hypot(hp.x - (tgt.base.x + tgt.up.x * tgt.def.H), hp.z - (tgt.base.z + tgt.up.z * tgt.def.H)) < (tgt.funnel ? 0.05 : tgt.def.rimR + 0.004)) {
            if (!p.foam && tgt.funnel && tgt.funnel.def.filter) G.hooks.filter(tgt.funnel, p.mix);
            if (!p.foam) { tgt.mix.merge(p.mix); tgt.dirty = true; tgt.changed = G.time; }
            if (G.landings) G.landings.push([hp.x, hp.z, 'in']);
            done = true;
          } else if (ny > 0.45) {
            if (inDrain(hp.x, hp.y, hp.z)) done = true;
            else if (!tgt) { if (G.landings) G.landings.push([hp.x, hp.z, 'bench']); if (!p.foam) spill(p.mix, hp.x, hp.y, hp.z); else foamBlob(hp); done = true; }
            else if (tgt.kind === 'lump' && [...p.mix.ids()].some((id) => canReact(tgt.sub, id))) { landOnGround(p); done = true; }
            else { p.x = hp.x + hit.hitNormalWorld.x * 0.02; p.z = hp.z + hit.hitNormalWorld.z * 0.02; p.y = hp.y + 0.004; p.vx += (Math.random() - 0.5) * 0.6; p.vz += (Math.random() - 0.5) * 0.6; p.vy = 0.2; p.life = Math.min(p.life, 0.6); }
          } else { p.x = hp.x + hit.hitNormalWorld.x * 0.006; p.y = hp.y; p.z = hp.z + hit.hitNormalWorld.z * 0.006; p.vx *= 0.1; p.vz *= 0.1; }
        }
      }
      if (done) { if (p.life <= 0 && !p.foam) landOnGround(p); parcels.splice(i, 1); continue; }
      if (n < MAXP) {
        // each drop is stretched along its path so consecutive drops merge into a stream
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        dm.position.set(p.x, p.y, p.z);
        if (sp > 0.05) { t1.set(p.vx / sp, p.vy / sp, p.vz / sp); dm.quaternion.setFromUnitVectors(UP, t1); } else dm.quaternion.identity();
        dm.scale.set(p.r * 0.85, p.r * (1.2 + Math.min(4, sp * 2.6)), p.r * 0.85);
        dm.updateMatrix(); parcelMesh.setMatrixAt(n, dm.matrix); parcelMesh.setColorAt(n, pc.set(p.color)); n++;
      }
    }
    parcelMesh.count = n;
    parcelMesh.instanceMatrix.needsUpdate = true;
    if (parcelMesh.instanceColor) parcelMesh.instanceColor.needsUpdate = true;
  }
  function foamBlob(hp) { G.P.emit({ pos: V(hp.x, hp.y + 0.01, hp.z), vel: V(0, 0.02, 0), life: 3 + Math.random() * 2, size: 0.05, size1: 0.02, color: 0xffffff, alpha: 0.85, tex: 'smoke' }); }

  // ---------- foam: a column climbing out of the mouth, and mounds where it falls ----------
  // lumpy shapes so foam looks like foam, not like a smooth plastic cylinder
  const foamColGeo = (() => {
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(t < 0.82 ? 1 + 0.05 * Math.sin(t * 19) : Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.82) / 0.18, 2))) * 1.02 + 0.001, t)); }
    const g = new THREE.LatheGeometry(pts, 22), pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), n = 1 + 0.09 * Math.sin(x * 23 + y * 31) * Math.cos(z * 19 - y * 17); pa.setXYZ(i, x * n, y, z * n); }
    g.computeVertexNormals();
    return g;
  })();
  const foamMoundGeo = (() => {
    const g = new THREE.SphereGeometry(1, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2), pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), n = 1 + 0.13 * Math.sin(x * 9 + z * 7) * Math.cos(z * 11 - x * 5) + 0.06 * Math.sin(y * 21 + x * 13); pa.setXYZ(i, x * n, y * n, z * n); }
    g.computeVertexNormals();
    return g;
  })();
  // matte and a touch below pure white, so it reads as foam under the lamps instead of glowing
  const foamMat = (color) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), roughness: 0.9, metalness: 0, envMapIntensity: 0.3 });
  const heaps = [];
  // foam takes the colour of the dye in the liquid it came from, otherwise it is white
  function foamColor(mix) {
    if (mix) for (const id in mix.n) { const s = SUB[id]; if (s.tint && s.tint > 50 && !s.surfactant) return new THREE.Color(s.color).lerp(new THREE.Color(0xffffff), 0.35).getHex(); }
    return 0xf4f2ec;
  }
  function foamAt(x, y, z, L, soapy, mix) {
    if (!(L > 0)) return;
    let hp = null;
    for (const q of heaps) if (Math.abs(q.y - y) < 0.05 && Math.hypot(q.x - x, q.z - z) < q.r * 0.7 + 0.03) { hp = q; break; }
    if (!hp) {
      if (heaps.length >= 24) { const o = heaps.shift(); scene.remove(o.m); }
      const m = new THREE.Mesh(foamMoundGeo, foamMat(foamColor(mix))); m.castShadow = true; m.receiveShadow = true; m.rotation.y = Math.random() * 6;
      scene.add(m);
      hp = { x, y, z, vol: 0, r: 0, m, decay: soapy ? 0.012 : 0.06, t: 0 };
      heaps.push(hp);
    }
    hp.vol += L; if (soapy) hp.decay = Math.min(hp.decay, 0.012);
  }
  function updateHeaps(dt, t) {
    for (let i = heaps.length - 1; i >= 0; i--) {
      const q = heaps[i];
      q.t += dt;
      q.vol -= q.vol * q.decay * dt; // bubbles burst and it slowly sinks
      const target = Math.cbrt(q.vol * 0.001 * 3 / (2 * Math.PI * 0.62));
      q.r += (target - q.r) * Math.min(1, dt * 6);
      if (q.vol < 0.002 && q.r < 0.008) { scene.remove(q.m); heaps.splice(i, 1); continue; }
      const breathe = 1 + Math.sin(t * 2.3 + i) * 0.012;
      q.m.position.set(q.x, q.y + 0.001, q.z); q.m.scale.set(q.r * breathe, q.r * 0.85, q.r * breathe);
    }
  }
  // overflow from one container: the column rises out of the mouth; past its height it topples into a mound
  function updateFoamColumn(it, dt, t, insideFree) {
    const d = it.def, up = it.up;
    const decay = it.soapy ? 0.025 : 0.1;
    it.foam = Math.max(0, it.foam - it.foam * dt * decay * 0.6);
    let over = it.foam - insideFree;
    if (over < 0) over = 0;
    const mouth = t2.set(it.base.x + up.x * d.H, it.base.y + up.y * d.H, it.base.z + up.z * d.H);
    if (up.y < 0.5 && it.foam > 0.0005) { // tipped over: foam slides out of the mouth
      const out = Math.min(it.foam, it.foam * dt * 2.5 + 0.002 * dt);
      it.foam -= out;
      const hit = phys.raycast(mouth.x, mouth.y + 0.02, mouth.z, mouth.x, mouth.y - 2, mouth.z, G_STATIC);
      if (hit) foamAt(hit.hitPointWorld.x, hit.hitPointWorld.y, hit.hitPointWorld.z, out, it.soapy, it.mix);
      over = 0;
    }
    const area = Math.PI * d.rimR * d.rimR * 1.17;
    const hMax = Math.min(0.3, 0.03 + 0.0035 / Math.max(d.rimR, 0.008)); // narrow necks shoot higher, wide beakers mushroom over
    let colH = over * 0.001 / area;
    if (colH > hMax) {
      // what does not fit in the column flops over the rim and down onto the bench
      const spillL = (colH - hMax) * area * 1000;
      it.foam -= spillL; colH = hMax;
      it.spillA = (it.spillA ?? Math.random() * 6) + dt * 0.7;
      const rr = d.maxR + 0.03 + Math.min(0.08, spillL * 0.02), sx = mouth.x + Math.cos(it.spillA) * rr, sz = mouth.z + Math.sin(it.spillA) * rr;
      const hit = phys.raycast(sx, mouth.y, sz, sx, mouth.y - 2, sz, G_STATIC);
      if (hit) foamAt(hit.hitPointWorld.x, hit.hitPointWorld.y, hit.hitPointWorld.z, spillL, it.soapy, it.mix);
      if (Math.random() < dt * 3) play('plop', mouth, 0.35);
    }
    if (colH > 0.003 && up.y >= 0.5) {
      if (!it.col) { it.col = new THREE.Mesh(foamColGeo, foamMat(foamColor(it.mix))); it.col.castShadow = true; scene.add(it.col); it.extras.push(it.col); }
      const c = it.col, wob = Math.sin(t * 7 + it.id) * 0.06, r = d.rimR * 1.06 * (1 + Math.min(1.3, colH * 5)); // it swells as it leaves the neck
      c.visible = true;
      c.position.copy(mouth); c.position.y -= 0.01;
      c.scale.set(r * (1 + wob * 0.3), colH + 0.01, r * (1 - wob * 0.3));
      c.rotation.set(Math.sin(t * 1.3 + it.id) * Math.min(0.25, colH * 1.2), t * 0.4, Math.cos(t * 1.1 + it.id) * Math.min(0.25, colH * 1.2));
      if (Math.random() < dt * 4) G.P.emit({ pos: V(mouth.x + (Math.random() - 0.5) * r, mouth.y + colH, mouth.z + (Math.random() - 0.5) * r), vel: V(0, 0.15, 0), life: 0.25, size: 0.008, size1: 0.02, tex: 'bubble', alpha: 0.9 });
    } else if (it.col) it.col.visible = false;
  }

  // ---------- puddles and piles ----------
  function spill(mix, x, y, z) {
    if (mix.isEmpty()) return null;
    if (inDrain(x, y, z)) return null;
    let pd = null;
    for (const q of puddles) if (Math.abs(q.y - y) < 0.03 && Math.hypot(q.x - x, q.z - z) < q.r + 0.05) { pd = q; break; }
    if (!pd) {
      if (puddles.length >= 36) { const old = puddles.shift(); disposePuddle(old); }
      const disc = new THREE.Mesh(blobGeo(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.5, depthWrite: false, envMapIntensity: 1.8, polygonOffset: true, polygonOffsetFactor: -2 }));
      const pile = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })); pile.castShadow = true;
      disc.renderOrder = 1; disc.receiveShadow = true;
      scene.add(disc, pile);
      const pieces = [];
      for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(pieceGeo, pieceMat('iron')); m.visible = false; m.castShadow = true; scene.add(m); pieces.push(m); }
      pd = { kind: 'puddle', id: nextId++, x, y, z, r: 0.01, mix: new Mixture(20), disc, pile, pieces, dirty: true, air: 1, pieceMol: {}, name: 'Spill', skitter: 0, foam: 0 };
      pd.mix.extraC = 40; // the bit of bench under it
      puddles.push(pd);
    }
    pd.mix.merge(mix); pd.dirty = true; pd.changed = G.time;
    return pd;
  }
  function disposePuddle(pd) { scene.remove(pd.disc, pd.pile); for (const m of pd.pieces) scene.remove(m); pd.dead = true; }
  function updatePuddle(pd, t) {
    if (pd.dirty) {
      pd.dirty = false;
      pd.an = pd.mix.analyse();
      const a = pd.an, liq = a.layers.filter((l) => l.key !== 'sed'), sed = a.layers.find((l) => l.key === 'sed');
      const top = liq.length ? liq[liq.length - 1] : null;
      const thick = top && top.metal ? 0.0035 : 0.0018;
      const rl = Math.min(0.7, Math.sqrt(a.liquid * 0.001 / (Math.PI * thick)));
      pd.disc.visible = !!top && rl > 0.004;
      // clear liquids read as a dark wet sheen on the bench, coloured or cloudy ones show their colour
      if (top) { const clear = !top.metal && top.alpha < 0.5 && !(top.cloud > 0.2); pd.disc.material.color.set(top.color); if (clear) pd.disc.material.color.lerp(DARK, 0.72); else if (!top.metal) pd.disc.material.color.lerp(DARK, 0.35); pd.disc.material.opacity = clear ? 0.42 : Math.min(0.72, top.alpha * 0.75); pd.disc.material.metalness = top.metal ? 1 : 0; pd.disc.material.roughness = top.metal ? 0.12 : 0.03; pd.disc.scale.setScalar(Math.max(rl, 0.001)); pd.disc.position.set(pd.x, pd.y + 0.0016, pd.z); }
      const rp = sed ? Math.cbrt(3 * sed.vol * 0.001 / (Math.PI * 0.62)) : 0;
      pd.pile.visible = rp > 0.003;
      if (sed) { pd.pile.material.color.set(sed.color); pd.pile.scale.set(rp, rp * 0.62, rp); pd.pile.position.set(pd.x, pd.y, pd.z); }
      pd.r = Math.max(rl, rp, 0.02);
      if (pd.mix.isEmpty()) { disposePuddle(pd); puddles.splice(puddles.indexOf(pd), 1); return; }
    }
    const a = pd.an; if (!a) return;
    const g = heatGlow(pd.mix.T);
    if (g) pd.pile.material.emissive.setRGB(g[0] * g[3], g[1] * g[3], g[2] * g[3]); else pd.pile.material.emissive.setRGB(0, 0, 0);
    let k = 0;
    for (const c of a.chunks) {
      if (k >= pd.pieces.length) break;
      const s = SUB[c.id], r = Math.max(0.005, Math.cbrt(c.mol * s.M / s.density * 1e-6 * 3 / (4 * Math.PI)));
      const m = pd.pieces[k++]; m.visible = true; m.material = pieceMat(c.id); m.scale.setScalar(r);
      const sk = pd.skitter > 0 ? 1 : 0, ang = k * 2.1 + (sk ? t * 5 : 0), rad = sk ? pd.r * (0.3 + 0.3 * Math.sin(t * 3.1 + k)) : 0.01 * k;
      m.position.set(pd.x + Math.cos(ang) * rad, pd.y + r * 0.8, pd.z + Math.sin(ang) * rad);
    }
    for (; k < pd.pieces.length; k++) pd.pieces[k].visible = false;
  }

  // ---------- per-frame: follow the physics, show the contents, pour ----------
  function sync(it) {
    const b = it.body;
    if (it.kind === 'vessel') {
      b.quaternion.vmult(cq.set(0, 1, 0), cv);
      it.up.set(cv.x, cv.y, cv.z);
      it.base.set(b.position.x - cv.x * it.halfH, b.position.y - cv.y * it.halfH, b.position.z - cv.z * it.halfH);
      it.group.position.copy(it.base);
    } else it.group.position.set(b.position.x, b.position.y, b.position.z);
    it.group.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
  }
  function updateVessel(it, dt, t) {
    const d = it.def, mix = it.mix;
    if (it.dirty) {
      it.dirty = false;
      it.an = mix.analyse();
      const m = d.mass + mix.massG() / 1000;
      if (Math.abs(m - it.body.mass) > 0.004 + it.body.mass * 0.02) { it.body.mass = m; it.body.updateMassProperties(); }
    }
    const a = it.an, up = it.up, base = it.base;
    const insideFree = Math.max(0, d.cap - a.total);
    updateFoamColumn(it, dt, t, insideFree);
    it.skitter = Math.max(0, it.skitter - dt);
    const foamIn = Math.min(it.foam, insideFree);
    const total = a.total + foamIn;
    const yw = (h) => base.y + up.y * h;
    // liquid layers, each clipped between two horizontal planes so the surface stays level when you tilt
    let cum = 0, k = 0, hPrev = d.inner[0][1] - 0.002, topH = hPrev, topLayer = null;
    const list = foamIn > 0.0003 ? [...a.layers, { key: 'foam', vol: foamIn, color: '#' + new THREE.Color(foamColor(mix)).getHexString(), alpha: 0.97 }] : a.layers;
    for (const l of list) {
      if (k >= it.layers.length) break;
      cum += l.vol;
      const h = cum >= d.cap ? d.H + 0.04 : d.heightFor(cum), L = it.layers[k++];
      L.m.visible = true;
      L.top.constant = yw(Math.min(h, d.H + (l.key === 'foam' ? 0.04 : 0)));
      L.bot.constant = -yw(hPrev) + 0.0004;
      const opaque = l.grain || l.metal || l.alpha >= 0.94;
      if (L.mat.transparent === opaque) { L.mat.transparent = !opaque; L.mat.depthWrite = opaque; L.mat.needsUpdate = true; }
      L.mat.color.set(l.color); L.mat.opacity = opaque ? 1 : Math.min(0.92, l.alpha + 0.12);
      L.mat.metalness = l.metal ? 1 : 0; L.mat.roughness = l.metal ? 0.1 : l.grain ? 0.9 : 0.12;
      const g = heatGlow(mix.T);
      if (g && (l.grain || l.key.startsWith('melt'))) L.mat.emissive.setRGB(g[0] * g[3], g[1] * g[3], g[2] * g[3]); else L.mat.emissive.setRGB(0, 0, 0);
      hPrev = Math.min(h, d.H); topH = hPrev;
      if (l.key !== 'sed') topLayer = l;
      l.h = hPrev;
    }
    for (; k < it.layers.length; k++) it.layers[k].m.visible = false;
    const s = it.surface;
    s.visible = !!topLayer && up.y > 0.93 && topH < d.H - 0.001;
    if (s.visible) { s.position.set(base.x + up.x * topH, yw(topH) - 0.0004, base.z + up.z * topH); s.scale.setScalar(d.rAt(topH) * 0.965); s.material.color.set(topLayer.color); s.material.opacity = Math.min(0.95, topLayer.alpha + 0.3); s.material.metalness = topLayer.metal ? 1 : 0; }
    // lumps sitting in or floating on the contents
    let pi = 0;
    for (const c of a.chunks) {
      const sub = SUB[c.id], per = it.pieceMol[c.id] || c.mol, count = Math.max(1, Math.min(3, Math.round(c.mol / per)));
      const r = Math.max(0.004, Math.cbrt((c.mol / count) * sub.M / sub.density * 1e-6 * 3 / (4 * Math.PI)));
      const fl = c.floatOn ? list.find((l) => l.key === c.floatOn) : null;
      for (let j = 0; j < count && pi < it.pieces.length; j++) {
        const m = it.pieces[pi++]; m.visible = true; m.material = pieceMat(c.id); m.scale.setScalar(c.molten ? r * 1.05 : r);
        const hh = fl ? fl.h : d.inner[0][1] + r * 0.8, lim = Math.max(0.001, d.rAt(hh) - r - 0.002);
        const sk = it.skitter > 0 && fl ? 1 : 0;
        const ang = pi * 2.3 + it.id + (sk ? t * 6.5 * (1 + 0.3 * Math.sin(t * 1.7)) : 0), rad = Math.min(lim, sk ? lim * (0.45 + 0.5 * Math.sin(t * 4.3 + pi)) : 0.009 * (pi - 1) + 0.004);
        t1.set(Math.cos(ang) * rad, hh, Math.sin(ang) * rad).applyQuaternion(it.group.quaternion).add(base);
        if (fl) t1.y = yw(fl.h) - r * 0.25 + (sk ? Math.sin(t * 30 + pi) * 0.0015 : 0);
        m.position.copy(t1);
        m.rotation.set(t * sk * 3, pi, t * sk * 2);
      }
    }
    for (; pi < it.pieces.length; pi++) it.pieces[pi].visible = false;
    // crystals that grew out of the solution, sitting on the bottom of the glass
    if (a.crystals && a.crystals.length) {
      if (!it.xtals) { it.xtals = []; for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(crystalGeo, crystalMat('#ffffff')); m.visible = false; m.castShadow = true; scene.add(m); it.xtals.push(m); it.extras.push(m); } }
      let xi = 0;
      for (const c of a.crystals) {
        const n = Math.min(9 - xi, 4 + Math.min(5, Math.floor(c.vol * 1000 / 4)));
        const size = Math.max(0.003, Math.cbrt(c.vol * 0.001 / n) * 1.25), r0 = d.rAt(d.inner[0][1]) * 0.72, mat = crystalMat(SUB[c.id].color);
        for (let j = 0; j < n && xi < 9; j++, xi++) {
          const m = it.xtals[xi], ang = j * 2.4 + it.id, rad = j === 0 ? 0 : r0 * (0.35 + 0.6 * ((j * 0.37) % 1));
          m.visible = true; m.material = mat;
          m.scale.set(size * (0.8 + (j % 3) * 0.2), size * (1.1 + (j % 2) * 0.5), size);
          t1.set(Math.cos(ang) * rad, d.inner[0][1] + size * 0.5, Math.sin(ang) * rad).applyQuaternion(it.group.quaternion).add(base);
          m.position.copy(t1); m.rotation.set(j * 0.7, j * 1.9 + it.id, j * 0.4);
        }
      }
      for (; xi < 9; xi++) it.xtals[xi].visible = false;
    } else if (it.xtals) for (const m of it.xtals) m.visible = false;

    // pouring: liquid leaves when its surface is above the lowest point of the rim
    it.flowing = 0;
    const awake = it.held || it.body.sleepState !== 2;
    if (!awake && total <= d.cap) return;
    // supply bottles and jars have lids: they only pour while someone is holding them
    if (it.supply && !it.held && total <= d.cap) return;
    const tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
    if (total <= 1e-6 || (tilt < 0.06 && total <= d.cap)) { dumpChunks(it, tilt, dt); return; }
    const over = Math.max(0, total - d.cap);
    const hFill = d.heightFor(Math.min(total, d.cap));
    const sinT = Math.sin(tilt), rimLowY = yw(d.H) - d.rimR * sinT;
    let head = yw(hFill) - rimLowY + over * 0.4;
    const dry = a.liquid < 1e-5;
    if (dry && tilt < 0.62) head = 0;
    if (head > 0.0003) {
      const w = Math.min(d.spout, d.rimR * 1.2);
      const visc = a.top && a.top.key === 'org' ? 7 : 1;
      let q = 0.6 * w * Math.sqrt(2 * G9) * Math.pow(head, 1.5) * 1000 / visc; // over the lip (weir), litres per second
      // a narrow neck chokes the flow, and air has to get in the same way, so bottles glug
      const orifice = 0.5 * 0.6 * Math.PI * d.rimR * d.rimR * Math.sqrt(2 * G9 * head) * 1000 / Math.sqrt(visc);
      q = Math.min(q, orifice);
      if (dry) q *= 0.5;
      q = Math.min(q, total / 0.2, 0.25);
      it.pourAcc += q * dt; it.pourT += dt; it.flowing = q;
      if (it.pourAcc >= 0.0007 || it.pourT > 0.05) {
        const hx = up.x, hz = up.z, hl = Math.hypot(hx, hz) || 1;
        const nx = hl > 0.02 ? hx / hl : Math.cos(it.id), nz = hl > 0.02 ? hz / hl : Math.sin(it.id);
        // the lowest point of the rim: from the mouth centre, toward 'down' as seen across the mouth
        const gx = up.x * up.y, gy = -1 + up.y * up.y, gz = up.z * up.y, gl = Math.hypot(gx, gy, gz) || 1;
        t2.set(base.x + up.x * d.H + gx / gl * (d.rimR + 0.002), base.y + up.y * d.H + gy / gl * (d.rimR + 0.002), base.z + up.z * d.H + gz / gl * (d.rimR + 0.002));
        const vo = Math.min(Math.sqrt(2 * G9 * head) * 0.55, 0.15 + q * 6), bv = t1.set(it.body.velocity.x, it.body.velocity.y, it.body.velocity.z).clampLength(0, 4);
        it.exitV = vo;
        // leaves the lip along the container's axis (sideways when level, downward when tipped further)
        const ax = up.x, ay = Math.min(0, up.y), az = up.z, al = Math.hypot(ax, ay, az) || 1;
        t3.set(ax / al * vo + bv.x, ay / al * vo + bv.y - 0.05, az / al * vo + bv.z);
        let vol = it.pourAcc; it.pourAcc = 0; it.pourT = 0;
        if (vol > 1e-6 && a.total > 1e-6) { emitParcel(mix.takeVolume(vol), t2, t3, { src: it }); if (G.emitLog && G.emitLog.length < 40) G.emitLog.push({ p: t2.toArray().map((v) => +v.toFixed(3)), v: t3.toArray().map((v) => +v.toFixed(2)), up: up.toArray().map((v) => +v.toFixed(2)), q: +q.toFixed(3), head: +head.toFixed(3) }); }
        it.dirty = true; it.changed = G.time;
      }
    }
    dumpChunks(it, tilt, dt);
  }
  function dumpChunks(it, tilt, dt) {
    if (tilt < 1.75 || !it.an.chunks.length) return;
    it.dumpT = (it.dumpT || 0) + dt;
    if (it.dumpT < 0.12) return;
    it.dumpT = 0;
    const c = it.an.chunks[0];
    const l = takeChunk(it, c.id);
    if (l) { l.body.velocity.set(it.up.x * 0.6, -0.3, it.up.z * 0.6); }
  }
  // pull one lump out of a container (tongs) or let it fall out
  function takeChunk(it, id) {
    id = id || it.mix.firstChunk();
    if (!id) return null;
    const mol = Math.min(it.pieceMol[id] || it.mix.n[id], it.mix.n[id]);
    const part = it.mix.takeChunk(id, mol);
    const l = makeLump(id, part.n[id], { shape: it.pieceShape[id], T: it.mix.T, surf: part.surf[id] });
    l.body.position.set(it.base.x + it.up.x * (it.def.H + 0.03), it.base.y + it.up.y * (it.def.H + 0.03), it.base.z + it.up.z * (it.def.H + 0.03));
    it.dirty = true; it.changed = G.time;
    return l;
  }
  function updateLump(it) {
    const g = heatGlow(it.mix.T);
    if (g) it.mat.emissive.setRGB(g[0] * g[3], g[1] * g[3], g[2] * g[3]); else if (it.mat.emissive.r > 0) it.mat.emissive.setRGB(0, 0, 0);
    if (it.dirty) { // colour follows what the lump is now made of
      it.dirty = false;
      const dom = it.mix.dominant();
      if (dom && dom !== it.shown) { it.shown = dom; const s = SUB[dom]; it.mat.color.set(s.color); it.mat.metalness = s.look === 'metal' ? 1 : 0.02; it.mat.roughness = s.look === 'metal' ? 0.36 : 0.92; if (dom !== it.sub) it.name = s.name + ' (was ' + SUB[it.sub].name.toLowerCase() + ')'; }
      const m = it.mix.massG() / 1000;
      if (m > 1e-5 && Math.abs(m - it.body.mass) > it.body.mass * 0.05) { it.body.mass = m; it.body.updateMassProperties(); }
    }
  }
  // loose lumps drop into containers they fall into, and join spills they can react with
  function absorb() {
    for (const l of items) {
      if (l.kind !== 'lump' || l.held || !l.small) continue;
      const lp = l.body.position;
      let done = false;
      for (const it of items) {
        if (it.kind !== 'vessel' || it.up.y < 0.55) continue;
        const b = it.body.position;
        const span = Math.max(0.08, it.def.rimR + 0.01);
        if (Math.abs(lp.x - b.x) > span || Math.abs(lp.z - b.z) > span || Math.abs(lp.y - b.y) > Math.max(0.16, it.def.H * 0.7)) continue;
        cv.set(lp.x, lp.y, lp.z); it.body.pointToLocalFrame(cv, cv2);
        const hb = cv2.y + it.halfH, rad = Math.hypot(cv2.x, cv2.z);
        if (hb > 0 && hb < it.def.H + 0.012 && rad < it.def.rimR + 0.002) {
          for (const id of l.mix.ids()) { it.mix.add(id, l.mix.n[id], l.mix.T, l.mix.surfOf(id)); it.pieceMol[id] = l.mix.n[id]; it.pieceShape[id] = l.shape; }
          for (const k in l.mix.burning) it.mix.burning[k] = true;
          it.dirty = true; it.changed = G.time;
          play(it.an && it.an.liquid > 0.005 ? 'plop' : 'clink', b, 0.6);
          remove(l); done = true; break;
        }
      }
      if (done) continue;
      for (const pd of puddles) {
        if (Math.abs(lp.y - pd.y) > 0.05 || Math.hypot(lp.x - pd.x, lp.z - pd.z) > pd.r + 0.01) continue;
        if (!pd.mix.ids().some((id) => canReact(l.sub, id))) continue;
        for (const id of l.mix.ids()) { pd.mix.add(id, l.mix.n[id], l.mix.T, l.mix.surfOf(id)); pd.pieceMol[id] = l.mix.n[id]; }
        pd.dirty = true; pd.changed = G.time; remove(l); break;
      }
    }
  }

  function update(dt, t) {
    while (breakQueue.length) shatter(breakQueue.pop());
    for (const it of items) {
      sync(it);
      if (it.kind === 'vessel') updateVessel(it, dt, t);
      else if (it.kind === 'lump') updateLump(it);
      if (it.body.position.y < -3) remove(it);
    }
    absorb();
    updateParcels(dt);
    updateHeaps(dt, t);
    for (let i = puddles.length - 1; i >= 0; i--) updatePuddle(puddles[i], t);
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i]; s.life -= dt;
      s.m.position.set(s.b.position.x, s.b.position.y, s.b.position.z); s.m.quaternion.set(s.b.quaternion.x, s.b.quaternion.y, s.b.quaternion.z, s.b.quaternion.w);
      if (s.life <= 0) { scene.remove(s.m); phys.world.removeBody(s.b); shards.splice(i, 1); }
    }
  }
  function clearAll() {
    for (const it of [...items]) remove(it);
    for (const pd of puddles) disposePuddle(pd); puddles.length = 0;
    for (const q of heaps) scene.remove(q.m); heaps.length = 0;
    parcels.length = 0; parcelMesh.count = 0;
    for (const s of shards) { scene.remove(s.m); phys.world.removeBody(s.b); } shards.length = 0;
  }
  // world position where a holder's contents meet the air (for flames, fumes, bubbles)
  function topOf(h, out = V()) {
    if (h.kind === 'vessel') { const y = h.an && h.an.total > 0 ? Math.min(h.def.H, h.def.heightFor(Math.min(h.an.total + h.foam, h.def.cap)) + (h.col && h.col.visible ? h.col.scale.y : 0)) : h.def.inner[0][1]; return out.set(h.base.x + h.up.x * y, h.base.y + h.up.y * y, h.base.z + h.up.z * y); }
    if (h.kind === 'puddle') return out.set(h.x, h.y + 0.01, h.z);
    return out.set(h.body.position.x, h.body.position.y, h.body.position.z);
  }
  function posOf(h, out = V()) {
    if (h.kind === 'puddle') return out.set(h.x, h.y, h.z);
    if (h.kind === 'vessel') return out.copy(h.base);
    return out.set(h.body.position.x, h.body.position.y, h.body.position.z);
  }

  return { foamAt, heaps, items, puddles, parcels, makeVessel, makeLump, makeProp, fill, place, remove, shatter, spillAll, spill, emitParcel, takeChunk, update, clearAll, topOf, posOf, sync, M };
}
