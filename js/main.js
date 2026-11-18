import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SUB, DISC, RXI, RX, canReact, equationOf } from './chem/db.js';
import { ELEMENTS } from './chem/formula.js';
import { Mixture } from './chem/mixture.js';
import { createPhysics, G_STATIC, G_PROP } from './physics/world.js';
import { createGrab } from './physics/grab.js';
import { createPlayer } from './player.js';
import { createInput } from './core/input.js';
import { Particles, updateTweens } from './core/fx.js';
import { initAudio, play, loopVol, setListener, setVolume, distGain } from './core/audio.js';
import { particleTextures } from './world/textures.js';
import { buildLab } from './world/lab.js';
import { createMatter } from './matter/items.js';
import { createGas } from './matter/gas.js';
import { createSim } from './matter/sim.js';
import { createHud, TOOLS } from './ui/hud.js';
import { createStory, storyDefaults } from './story.js';
import { createNet } from './net.js';
import { createAsk } from './ui/ask.js';
import { createSupply } from './ui/supply.js';

const $ = (id) => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SAVE_KEY = 'reaction-lab-save-v1';

// ---------- save ----------
const defaults = () => ({ found: {}, log: [], notes: '', story: storyDefaults(), settings: { sens: 1, fov: 72, volume: 0.8, quality: 'high', hazard: 1, bob: true, shake: true, flash: true, labVision: false, mode: 'student' } });
let save = defaults();
try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const o = JSON.parse(raw); save = { ...defaults(), ...o, settings: { ...defaults().settings, ...(o.settings || {}) }, story: { ...storyDefaults(), ...(o.story || {}) } }; } } catch (e) { /* no storage: play without saving */ }
let persistT = 0;
const persist = () => { persistT = 1; };
const persistNow = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

const START_HAVE = ELEMENTS.filter((e) => e.start).map((e) => e.sym);
// G.prog is the active progress: the main save in Normal Mode, save.story in Story Mode
const G = {
  THREE, Mixture, save, prog: save, settings: save.settings, persist, time: 0, sources: [], levels: { burner: 0 }, dist: distGain,
  timeScale: 1, have: new Set(START_HAVE), hooks: {}, stats: { biggest: 0, broken: 0 },
  story: false, unlocked: {}, waterAt: null, groundAt: null,
};

function boot() {
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06080a);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  const camera = new THREE.PerspectiveCamera(72, 1, 0.03, 60);
  scene.add(camera);
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.34, 0.7, 1.0);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  Object.assign(G, { scene, camera, renderer });

  G.ptex = particleTextures();
  G.P = new Particles(scene, G.ptex, 340);
  const phys = createPhysics(); G.phys = phys;
  const player = createPlayer(phys, camera, G.settings); G.player = player;
  const hud = createHud(G); G.hud = hud;
  const matter = createMatter(G); G.matter = matter;
  const gas = createGas(G); G.gas = gas;
  const lab = buildLab(G);
  const sim = createSim(G);
  const story = createStory(G, { save, persist: () => persist(), hud, player, lab });
  let state = 'menu', uiOpen = false;

  const input = createInput(canvas, {
    onLock(locked) { if (!locked && state === 'play' && !uiOpen) openPause(); },
    onMode(m) { document.body.classList.toggle('tapmode', m === 'tap'); $('touch').hidden = m !== 'tap' || state !== 'play'; },
  });
  if (input.st.mode === 'tap') document.body.classList.add('tapmode');

  // ---------- hooks used by the simulation ----------
  const MYSTERY_A = ['Regrettable', 'Suspicious', 'Unlabelled', 'Ominous', 'Lukewarm', 'Questionable', 'Sticky', 'Forbidden'], MYSTERY_B = ['Sludge', 'Soup', 'Gloop', 'Broth', 'Slurry', 'Cocktail', 'Paste', 'Mistake'];
  G.hooks.discover = (id, holder, rxHit) => {
    if (G.story && id.startsWith('sub_') && SUB[id.slice(4)]) story.addEl(SUB[id.slice(4)].el);
    const d = DISC[id];
    if (!d) return;
    const P = G.prog, rec = P.found[id];
    if (rec) { if (G.time - (rec.last || -99) > 25) { rec.n++; rec.last = G.time; persist(); } return; }
    P.found[id] = { t: Date.now(), by: 'You', n: 1, last: G.time };
    if (rxHit && rxHit.gen && id.startsWith('rx_gen_')) { const rx = rxHit; hud.banner({ ...d, eq: equationOf(rx), kind: rx.kind, name: rx.name }); P.log.push({ t: Date.now(), text: `Discovered: ${rx.name} (${d.name.toLowerCase()}).` }); persist(); return; }
    const extra = id === 'mystery' ? `${MYSTERY_A[Math.floor(Math.random() * 8)]} ${MYSTERY_B[Math.floor(Math.random() * 8)]} No. ${1 + Math.floor(Math.random() * 98)}` : null;
    hud.banner(d, extra);
    P.log.push({ t: Date.now(), text: `Discovered: ${extra || d.name}${holder && holder.name ? ' (in ' + holder.name.toLowerCase() + ')' : ''}.` + (G.story && d.fact ? ' ' + d.fact.split('. ')[0].replace(/\.$/, '') + '.' : '') });
    if (P.log.length > 120) P.log.shift();
    persist();
  };
  G.hooks.log = (h, rx) => {
    const P = G.prog;
    P.log.push({ t: Date.now(), text: `${rx.name} in ${(h.name || 'a spill').toLowerCase()}, starting at ${h.mix.T.toFixed(0)} °C with ${h.mix.describe(3).map((x) => hud.fmtG(x.g) + ' ' + x.name.toLowerCase()).join(', ')}.` });
    if (P.log.length > 120) P.log.shift();
    persist();
  };
  G.hooks.shake = (a, pos) => { const d = pos ? pos.distanceTo ? pos.distanceTo(player.pos) : Math.hypot(pos.x - player.pos.x, pos.y - player.pos.y, pos.z - player.pos.z) : 0; player.trauma = Math.min(1, Math.max(player.trauma, a / (1 + d * 0.25))); };
  const goggles = () => G.story && G.unlocked.goggles;
  G.hooks.flash = (a) => hud.flash(goggles() ? a * 0.4 : a);
  G.hooks.explosion = (kJ) => { G.stats.biggest = Math.max(G.stats.biggest, kJ); };
  let coughT = 0;
  G.hooks.breathe = (dose, irr) => {
    player.blur = Math.min(1, player.blur + 0.12 * (dose + irr * 0.5));
    if (dose > 1) player.hurt(dose * 0.9 * G.settings.hazard, 'gas', G.time);
    if (G.time - coughT > 1.6) { coughT = G.time; play('cough'); hud.toast('Fumes', dose > 1 ? 'You are breathing something toxic. Get out of the cloud.' : 'That smoke stings. Step back.', 'warn'); }
  };
  G.hooks.restock = () => {
    if (net.guest) { hud.toast('Restock', 'Only the host can restock.'); return; }
    grab.release(false); gas.clear(); lab.reset(); toolLoad = new Mixture(20); play('ding');
    if (G.story) {
      // Story Mode: clean glassware only. Your stored samples and what you carried in stay put.
      for (const it of [...matter.items]) if (it.kind === 'vessel' && !it.store && !it.kitchen && it.type !== 'bucket' && it.type !== 'jar' && lab.inLab(it.body.position)) matter.remove(it);
      lab.glassware(matter);
      hud.toast('Restocked', 'Clean glassware. Chemicals you have to find yourself.');
      return;
    }
    matter.clearAll(); lab.populate(); hud.toast('Restocked', 'Fresh supplies, clean glassware.');
  };
  G.hooks.wipe = () => {
    sim.progress.rx = {}; sim.progress.sub = {};
    if (G.story) { story.wipe(); persistNow(); worldMode = ''; startMode('story'); return; }
    save.found = {}; save.log = []; save.notes = ''; persistNow();
  };
  G.hooks.applySettings = applySettings;
  G.hooks.resume = () => { uiOpen = false; input.st.enabled = true; if (state === 'play') input.lock(); };
  G.hooks.title = () => { if (G.story && !G.netGuest) { story.serialize(); persistNow(); } if (net.guest) net.leave(); showMeta(); state = 'menu'; net.modeChanged(null); uiOpen = false; input.st.enabled = false; input.unlock(); hud.show(false); $('menu').hidden = false; $('touch').hidden = true; };
  G.hooks.selectTool = (id) => selectTool(id);
  { const hurt0 = player.hurt; player.hurt = (a, why, now) => hurt0(goggles() && why === 'blast' ? a * 0.6 : a, why, now); }
  player.onHurt = (amt) => { hud.hurt(Math.min(1, 0.3 + amt / 30)); };
  player.onDown = () => {
    grab.release(false); hud.downed(true); play('thud');
    setTimeout(() => {
      player.dead = false; player.health = 60; hud.downed(false);
      if (G.story) { player.teleport(-16.6, 0.35, 34.2); player.yaw = -0.57; hud.toast('Home', 'You wake up in bed at home, sore. Everything you were carrying is where you dropped it.'); return; }
      player.teleport(G.firstAid.x, 0.35, G.firstAid.z); player.yaw = Math.PI; hud.toast('First aid', 'Patched up. Maybe wear goggles next time.');
    }, 3200);
  };

  // ---------- grabbing ----------
  const grab = createGrab(phys, player, camera, {
    onGrab(it) { play('grab', it.body.position, 0.8); story.onGrab(it); },
    onRelease(it, h, knocked) { if (knocked) hud.toast('Knocked loose', 'A hard hit broke your grip.', 'warn'); else play('drop', it.body.position, 0.5); },
    onKnock() {},
    onSlip(it, why) { hud.toast('Dropped', why, 'warn'); },
  });
  G.grab = grab;

  // ---------- tools ----------
  let tool = null, toolLoad = new Mixture(20), extT = 0, pipT = 0, lighterOn = false, torchOn = false;
  function selectTool(id) { tool = tool === id ? null : id; play('click'); if (grab.hold && grab.hold.tool === 'tongs' && tool !== 'tongs') grab.release(false); refreshTool(); }
  function refreshTool() {
    let load = '';
    if (!toolLoad.isEmpty()) { const g = toolLoad.massG(); load = tool === 'pipette' ? (toolLoad.pourableL() * 1000).toFixed(1) + ' mL' : g.toFixed(1) + ' g'; }
    hud.setTool(tool, load);
    view.setTool(tool);
  }
  const torch = new THREE.SpotLight(0xfff4e0, 0, 12, 0.5, 0.5, 2);
  torch.position.set(0.15, -0.1, 0); camera.add(torch); camera.add(torch.target); torch.target.position.set(0, 0, -3);
  G.extraSources = (arr) => {
    if (lighterOn && grab.item && grab.item.tool === 'lighter') { const b = grab.item.body; const tip = V(0, 0.11, 0).applyQuaternion(grab.item.group.quaternion).add(V(b.position.x, b.position.y, b.position.z)); arr.push({ pos: tip, r: 0.055, T: 1000, k: 0.1, flame: true }); G.lighterTip = tip; }
  };

  // ---------- first-person arms and tools ----------
  const view = (() => {
    const g = new THREE.Group(); camera.add(g);
    const coat = new THREE.MeshStandardMaterial({ color: 0x6c7479, roughness: 1, envMapIntensity: 0.1 }), glove = new THREE.MeshStandardMaterial({ color: 0x2f5f9e, roughness: 0.5, envMapIntensity: 0.5 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.3 });
    const arm = (side) => {
      const a = new THREE.Group();
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.034, 1, 10), coat); sleeve.position.y = 0.5; a.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), glove); hand.scale.set(1, 1.25, 0.8); a.add(hand);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.03, 10), glove); cuff.position.y = 0.02; a.add(cuff);
      g.add(a);
      return { a, sleeve, hand, side, shoulder: V(side * 0.3, -0.62, 0.05), rest: V(side * 0.26, -0.36, -0.3), cur: V(side * 0.26, -0.36, -0.3) };
    };
    const R = arm(1), L = arm(-1);
    const tools = {};
    const mk = (name, build) => { const t = new THREE.Group(); build(t); t.visible = false; R.a.add(t); tools[name] = t; };
    mk('tongs', (t) => { for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.003, 1, 6), steel); r.position.set(s * 0.012, -0.5, 0); r.rotation.z = s * 0.02; t.add(r); } });
    mk('spatula', (t) => { const r = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.2, 0.003), steel); r.position.y = -0.1; t.add(r); const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.003), steel); b.position.y = -0.22; t.add(b); });
    mk('pipette', (t) => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.2, 8), new THREE.MeshPhysicalMaterial({ color: 0xdff2f5, transparent: true, opacity: 0.45, roughness: 0.05 })); r.position.y = -0.1; t.add(r); const b = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshStandardMaterial({ color: 0xa83a2a, roughness: 0.6 })); b.position.y = 0.01; t.add(b); });
    mk('thermo', (t) => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.22, 6), steel); r.position.y = -0.11; t.add(r); const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.012), new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.5 })); b.position.y = 0.02; t.add(b); });
    mk('ext', (t) => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xb81e1a, roughness: 0.4 })); r.position.y = -0.02; r.rotation.x = 0; t.add(r); const n = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 10), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5 })); n.position.y = -0.14; n.rotation.x = Math.PI; t.add(n); });
    const wood = new THREE.MeshStandardMaterial({ color: 0x7b5a3a, roughness: 0.8 });
    mk('pick', (t) => { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.3, 8), wood); h.position.y = -0.12; t.add(h); const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.022, 0.022), steel); head.position.set(0.03, -0.27, 0); t.add(head); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.05, 6), steel); tip.rotation.z = -Math.PI / 2; tip.position.set(0.135, -0.27, 0); t.add(tip); });
    mk('trowel', (t) => { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 8), wood); h.position.y = -0.04; t.add(h); const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 6, 0, Math.PI, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa8acb0, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide })); b.scale.set(0.8, 2.2, 1); b.rotation.x = Math.PI; b.position.y = -0.1; t.add(b); });
    const tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.35 }));
    tether.frustumCulled = false; g.add(tether);
    const up = V(0, 1, 0), d = V(), q = new THREE.Quaternion(), tp = V(), inv = new THREE.Matrix4();
    const cvv = new phys.CANNON.Vec3();
    function aim(A, target, dt) {
      A.cur.lerp(target, Math.min(1, dt * 14));
      d.copy(A.shoulder).sub(A.cur); const len = d.length();
      A.a.position.copy(A.cur);
      q.setFromUnitVectors(up, d.normalize()); A.a.quaternion.copy(q);
      A.sleeve.scale.y = len; A.sleeve.position.y = len / 2;
    }
    let current = null, swingT = 0;
    return {
      setTool(id) { current = id; for (const k in tools) tools[k].visible = k === id; },
      swing() { swingT = 0.32; },
      update(dt, t) {
        const h = grab.hold;
        let rt = R.rest, lt = L.rest, showT = false;
        const bobY = Math.sin(player.bob * 2) * 0.006 + Math.sin(t * 1.3) * 0.003, strain = player.strain;
        const rr = V(R.rest.x, R.rest.y + bobY, R.rest.z), ll = V(L.rest.x, L.rest.y + bobY - (current ? 0.25 : 0), L.rest.z);
        rt = rr; lt = ll;
        if (h && !h.item.dead) {
          const b = h.item.body; b.pointToWorldFrame(h.local, cvv);
          inv.copy(camera.matrixWorld).invert();
          tp.set(cvv.x, cvv.y, cvv.z).applyMatrix4(inv);
          const dist = tp.length(), reach = 0.5;
          const hp = tp.clone(); if (dist > reach) hp.multiplyScalar(reach / dist);
          const shake = strain > 0.7 ? (strain - 0.7) * 0.03 : 0;
          hp.x += Math.sin(t * 37) * shake; hp.y += Math.cos(t * 31) * shake;
          if (h.tool === 'tongs') { rt = V(0.16, -0.2, -0.38); const dd = tp.clone().sub(rt); tools.tongs.scale.set(1, dd.length(), 1); q.setFromUnitVectors(V(0, -1, 0), dd.normalize()); }
          else { rt = hp.clone().add(V(0.06, -0.07, 0.05)); rt.y = Math.min(rt.y, -0.12); if (b.mass > 2.5 || h.item.pickR > 0.15) lt = hp.clone().add(V(-0.07, -0.02, 0.04)); showT = dist > reach + 0.12; if (showT) { const p = tether.geometry.attributes.position; p.setXYZ(0, rt.x, rt.y, rt.z); p.setXYZ(1, tp.x, tp.y, tp.z); p.needsUpdate = true; } }
        } else if (current === 'tongs') tools.tongs.scale.set(1, 0.26, 1);
        tether.visible = showT;
        aim(R, rt, dt); aim(L, lt, dt);
        if (h && h.tool === 'tongs') { const dd = tp.clone().sub(R.cur).normalize(); tools.tongs.quaternion.copy(R.a.quaternion).invert().multiply(q.setFromUnitVectors(V(0, -1, 0), dd)); }
        else for (const k in tools) tools[k].quaternion.identity();
        if (swingT > 0) { swingT -= dt; const k = Math.sin(Math.max(0, swingT) / 0.32 * Math.PI); if (tools[current]) tools[current].rotation.x = -k * 1.3; } else if (tools[current]) tools[current].rotation.x = 0;
        g.visible = state === 'play' && !player.dead;
      },
    };
  })();

  // ---------- what am I looking at ----------
  const tmpV = V();
  function findTarget(dir = player.dir, maxD = 3) {
    const o = player.pos;
    const hit = phys.raycast(o.x, o.y, o.z, o.x + dir.x * maxD, o.y + dir.y * maxD, o.z + dir.z * maxD, G_STATIC | G_PROP);
    let best = null, bestScore = Infinity, wall = maxD;
    const st = story.lookAt(o, dir, hit, maxD);
    if (hit) {
      if (hit.body.item && !hit.body.item.held) { best = { item: hit.body.item, point: V(hit.hitPointWorld.x, hit.hitPointWorld.y, hit.hitPointWorld.z), dist: hit.distance }; bestScore = hit.distance; }
      else wall = hit.distance;
    }
    for (const it of matter.items) { // small things are hard to hit exactly, so be generous
      if (it.held || it.dead) continue;
      const b = it.body.position;
      tmpV.set(b.x - o.x, b.y - o.y, b.z - o.z);
      const t = tmpV.dot(dir);
      if (t < 0.15 || t > maxD) continue;
      const perp = Math.sqrt(Math.max(0, tmpV.lengthSq() - t * t)), R = Math.min(it.pickR, 0.09) + 0.012 * t;
      if (perp > R || t - it.pickR > wall + 0.06) continue;
      const score = t + perp * 3;
      if (score < bestScore - 0.02) { bestScore = score; best = { item: it, point: V(b.x, b.y, b.z), dist: t }; }
    }
    let fixture = null, fd = 2.7;
    for (const f of G.fixtures) {
      if (f.off && f.off()) continue;
      tmpV.copy(f.pos).sub(o);
      const t = tmpV.dot(dir);
      if (t < 0.2 || t > fd) continue;
      if (Math.sqrt(Math.max(0, tmpV.lengthSq() - t * t)) < f.r) { fixture = f; fd = t; }
    }
    let puddle = null;
    if (dir.y < -0.05) for (const pd of matter.puddles) {
      const t = (pd.y - o.y) / dir.y;
      if (t < 0.2 || t > maxD) continue;
      if (Math.hypot(o.x + dir.x * t - pd.x, o.z + dir.z * t - pd.z) < pd.r + 0.02) { puddle = pd; break; }
    }
    return { best, fixture: fixture && (!best || fd < best.dist + 0.1) && (!st || fd < st.dist + 0.1) ? fixture : null, puddle, wall, story: st && (!best || st.dist < best.dist) ? st : null };
  }
  const hotMax = () => (G.story && G.unlocked.gloves ? 200 : 75);
  const needsTongs = (it) => it.kind === 'lump' && SUB[it.sub].handle === 'tongs' && it.mix.n[it.sub] > 0;

  function primary(tg) {
    const b = tg.best, it = b && b.item;
    G.netTouch = G.time;
    if (it && net.otherHolds(it) && tool !== 'spatula' && tool !== 'pipette' && tool !== 'trowel') return hud.toast('Busy', 'Someone else is holding that.');
    const holder = it && it.mix && it.kind === 'vessel' ? it : tg.puddle;
    if (tool === 'spatula') {
      if (!holder) return hud.toast('Spatula', 'Point it at a jar or a pile of powder.');
      if (toolLoad.massG() > 8) return hud.toast('Spatula', 'It is full. Right button tips it out.');
      const m = holder.mix.takePowder(2.5);
      if (m.isEmpty()) return hud.toast('Spatula', 'No loose powder to scoop here.');
      toolLoad.merge(m); holder.dirty = true; holder.changed = G.time; play('scoop'); refreshTool();
      return;
    }
    if (tool === 'pick') { view.swing(); return story.pick(tg); }
    if (tool === 'trowel') { if (story.dig(tg, toolLoad)) refreshTool(); return; }
    if (tool === 'pipette') {
      if (!holder) return hud.toast('Pipette', 'Point it at a liquid.');
      if (toolLoad.pourableL() > 0.0095) return hud.toast('Pipette', 'It is full. Right button squeezes it out.');
      const m = holder.mix.takeLiquid(0.005);
      if (m.isEmpty()) return hud.toast('Pipette', 'Nothing liquid to draw up.');
      toolLoad.merge(m); holder.dirty = true; holder.changed = G.time; play('drip'); refreshTool();
      return;
    }
    if (!it) return;
    if (tool === 'tongs') {
      if (it.kind === 'vessel' && it.mix.firstChunk()) { const l = matter.takeChunk(it); matter.sync(l); grab.start(l, V(l.body.position.x, l.body.position.y, l.body.position.z), 'tongs'); play('clink', l.body.position, 0.4); return; }
      if (it.body.mass > 0.75) return hud.toast('Tongs', 'Too heavy for tongs. Put them away (1) and use your hands.');
      grab.start(it, b.point, 'tongs');
      return;
    }
    if (needsTongs(it)) { player.hurt(9 * G.settings.hazard, 'chem', G.time); return hud.toast('Chemical burn', `${SUB[it.sub].name} reacts with the moisture on skin. Use tongs (1).`, 'warn'); }
    if (it.mix && it.mix.T > hotMax() - 5) { player.hurt(7 * G.settings.hazard, 'burn', G.time); return hud.toast('Burn', 'That is hot. It looked exactly like cold glass, which is the problem. Use tongs or wait.', 'warn'); }
    grab.start(it, b.point, 'hand');
  }
  function secondary(tg, first, dt) {
    G.netTouch = G.time;
    const it = tg.best && tg.best.item, holder = it && it.kind === 'vessel' ? it : tg.puddle;
    const ahead = () => player.pos.clone().addScaledVector(player.dir, 0.55);
    if (grab.item && grab.item.tool === 'lighter') { if (first) play('spark', grab.item.body.position); lighterOn = true; return; }
    if (grab.hold) return;
    if ((tool === 'spatula' || tool === 'trowel') && first && !toolLoad.isEmpty()) {
      if (holder && holder.kind === 'vessel') { holder.mix.merge(toolLoad); holder.dirty = true; holder.changed = G.time; }
      else matter.emitParcel(toolLoad, ahead(), V(player.dir.x * 0.6, -0.2, player.dir.z * 0.6));
      toolLoad = new Mixture(20); play('scoop'); refreshTool();
    } else if (tool === 'pipette' && !toolLoad.isEmpty()) {
      pipT -= dt;
      if (first || pipT <= 0) {
        pipT = 0.11;
        const m = toolLoad.takeVolume(0.001);
        if (holder && holder.kind === 'vessel') { holder.mix.merge(m); holder.dirty = true; holder.changed = G.time; } else matter.emitParcel(m, ahead(), V(player.dir.x * 0.3, -0.3, player.dir.z * 0.3));
        play('drip', null, 0.6); refreshTool();
      }
    } else if (tool === 'ext') {
      extT -= dt;
      if (first || extT <= 0) { extT = 0.25; play('ext', null, 0.7); }
      const o = player.pos.clone().addScaledVector(player.dir, 0.35);
      for (let i = 0; i < 2; i++) G.P.emit({ pos: o.clone(), vel: player.dir.clone().multiplyScalar(5).add(V((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2)), life: 0.45, size: 0.06, size1: 0.5, color: 0xffffff, alpha: 0.5, tex: 'smoke', drag: 2 });
      for (const h of [...matter.items, ...matter.puddles]) {
        if (!h.mix) continue;
        const keys = Object.keys(h.mix.burning);
        if (!keys.length) continue;
        const p = matter.topOf(h, V()), v = p.clone().sub(player.pos), d = v.length();
        if (d > 2.8 || v.normalize().dot(player.dir) < 0.9) continue;
        for (const k of keys) {
          const rx = RXI[k];
          if (rx.inputs.some((i) => (SUB[i.id].tags || []).includes('metal_fire'))) { h.mix.addHeat(40); if (!h.warned) { h.warned = true; hud.toast('Wrong extinguisher', 'Burning metal pulls the oxygen out of carbon dioxide and keeps going. Metal fires need dry sand.', 'warn'); } }
          else { delete h.mix.burning[k]; const mt = rx.conditions && rx.conditions.minTemp; if (mt) h.mix.T = Math.min(h.mix.T, mt - 80); if (h.fx && h.fx.flame) h.fx.flame.t = 0; h.lit = 0; }
        }
      }
    }
  }

  function inspectInfo(it) {
    const rows = [], mix = it.mix;
    let name = it.name, formula = '', tags = [], fact = it.def && it.def.fact;
    if (it.kind === 'lump') { const s = SUB[it.mix.dominant() || it.sub]; formula = s.formula; tags = s.tags || []; fact = s.fact; rows.push(['State', mix.T > (s.mp ?? 1e9) ? 'liquid' : 'solid'], ['Density', s.est ? '?' : s.density + ' g/cm³'], ['Melts', s.est || s.mp === null || s.mp === undefined ? '?' : s.mp + ' °C']); if (s.z) rows.unshift(['Element', '#' + s.z]); }
    else if (it.kind === 'vessel') {
      const a = mix.analyse();
      rows.push(['Holds', (it.def.cap * 1000).toFixed(0) + ' mL to the brim'], ['Contents', a.total > 0 ? (a.total * 1000).toFixed(a.total < 0.01 ? 1 : 0) + ' mL' : 'empty']);
      if (it.info) { formula = it.info.formula || ''; tags = it.info.tags || []; fact = it.info.fact; }
      else if (!mix.isEmpty()) { const s = SUB[mix.dominant()]; fact = 'Mostly ' + s.name.toLowerCase() + '. ' + (s.fact || ''); tags = [...new Set(mix.ids().flatMap((id) => SUB[id].tags || []))]; }
      if (a.pH !== null && mix.n.indicator) rows.push(['pH (indicator)', a.pH.toFixed(1)]);
    }
    rows.unshift(['Mass', hud.fmtG(it.body.mass * 1000)]);
    rows.push(['Temperature', (tool === 'thermo' || G.settings.mode !== 'discovery') && mix ? mix.T.toFixed(1) + ' °C' : mix ? 'use the thermometer (4)' : 'room']);
    return { name, formula, rows, tags, fact };
  }

  // ---------- one frame of player interaction ----------
  let inspecting = null, lastRmb = false, hotT = 0, aidT = 0, targetNow = null;
  function interact(dt) {
    const st = input.st;
    const tools = TOOLS.filter((t) => !t.story || G.story);
    for (const t of tools) if (input.hit('Digit' + t.key)) selectTool(t.id);
    if (input.hit('ToolNext')) { const i = tools.findIndex((t) => t.id === tool); selectTool(i + 1 < tools.length ? tools[i + 1].id : tools[i].id); if (i + 1 >= tools.length) { tool = null; refreshTool(); } }
    const tg = findTarget();
    targetNow = tg;
    const held = grab.item;
    // primary: hold to carry (mouse), tap to toggle (touch)
    if (st.mode === 'lock') {
      if (st.lDown && !held) primary(tg);
      if (st.lUp && grab.hold && !grab.hold.placing) grab.release(true);
    } else {
      if (st.tap) {
        if (held) grab.release(true);
        else { const d = V(st.tap.x, st.tap.y, 0.5).unproject(camera).sub(player.pos).normalize(); primary(findTarget(d)); }
      }
      if (input.hit('Drop') && held) grab.release(false);
    }
    lighterOn = false;
    if (st.rmb) secondary(tg, !lastRmb, dt);
    lastRmb = st.rmb;
    if (input.hit('KeyX')) grab.place();
    if (input.hit('KeyF')) { if (tg.fixture) { if (!net.useFixture(tg.fixture)) tg.fixture.use(); } else if (tg.story && tg.story.water && grab.item && grab.item.kind === 'vessel') G.hooks.fillWater(tg.story.water === 'Lake' ? 'the lake' : 'the stream'); else { torchOn = !torchOn; torch.intensity = torchOn ? 26 : 0; play('click'); } }
    // E inspects whatever you hold or look at; with nothing there it leans
    const subject = grab.item || (tg.best && tg.best.item);
    if (input.hit('KeyE') || input.hit('KeyE2')) { if (inspecting) inspecting = null; else if (subject) inspecting = subject; }
    if (inspecting && (inspecting.dead || (inspecting !== grab.item && inspecting !== (tg.best && tg.best.item)))) inspecting = null;
    player.leanInput = (input.down('KeyQ') ? -1 : 0) + (input.down('KeyE') && !subject && !inspecting ? 1 : 0);
    hud.inspect(inspecting ? inspectInfo(inspecting) : null);

    // hot things burn bare hands
    hotT -= dt;
    if (hotT <= 0 && grab.hold && grab.hold.tool === 'hand' && grab.item.mix && grab.item.mix.T > hotMax()) { hotT = 0.6; player.hurt(5 * G.settings.hazard, 'burn', G.time); hud.toast('Burn', 'It got too hot to hold.', 'warn'); grab.release(false); }
    if (lighterOn && G.lighterTip) G.P.emit({ pos: G.lighterTip.clone(), vel: V(0, 0.5, 0), life: 0.2, size: 0.035, size1: 0.008, color: 0xffb040, boost: 2.4, add: true, tex: 'flame' });
    // first aid
    if (player.health < 100 && !player.dead && player.pos.distanceTo(G.firstAid) < 1.5) { player.health = Math.min(100, player.health + dt * 14); aidT -= dt; if (aidT <= 0) { aidT = 1.2; play('heal'); } }

    // HUD
    const student = G.settings.mode !== 'discovery';
    const showTemp = tool === 'thermo' || student;
    hud.setStudent(student);
    if (held) {
      hud.setCross('hold');
      hud.setTarget(held.name, hud.fmtG(held.body.mass * 1000) + (grab.hold.strain > 0.8 ? ' · straining' : ''));
      const p = [['LMB', 'let go']];
      if (held.kind === 'vessel') p.push(['RMB', 'pour']); else if (held.tool === 'lighter') p.push(['RMB', 'flame']);
      if (held.kind === 'vessel' && (tg.story && tg.story.water || tg.fixture && tg.fixture.name === 'Kitchen tap')) p.push(['F', 'fill with water']);
      p.push(['X', 'set down'], ['Wheel', 'push/pull'], ['R', 'rotate']);
      if (student && held.mix && tg.best && tg.best.item.mix && tg.best.item !== held) { const r = reactsWith(held.mix, tg.best.item.mix); if (r) p.push(['Tip', 'these react: ' + r]); }
      hud.setPrompt(p);
      hud.setHeld(held.mix ? held : null, showTemp);
    } else if (tg.fixture) {
      hud.setCross('can'); hud.setTarget(tg.fixture.name, ''); hud.setPrompt([['F', tg.fixture.hint()]]); hud.setHeld(null);
    } else if (tg.best) {
      const it = tg.best.item;
      hud.setCross('can');
      hud.setTarget(it.name, hud.fmtG(it.body.mass * 1000));
      const p = [];
      if (tool === 'spatula') p.push(['LMB', 'scoop'], ['RMB', 'tip out']); else if (tool === 'pipette') p.push(['LMB', 'draw up'], ['RMB', 'squeeze out']);
      else if (tool === 'tongs') p.push(['LMB', it.kind === 'vessel' && it.mix.firstChunk() ? 'take a piece' : 'grip']);
      else if (tool === 'pick') p.push(['LMB', 'crush']); else if (tool === 'trowel') p.push(['LMB', 'scoop'], ['RMB', 'tip out']); else p.push(['LMB', needsTongs(it) ? 'grab (needs tongs!)' : 'grab']);
      p.push(['E', 'inspect']);
      hud.setPrompt(p);
      hud.setHeld(it.mix && (it.kind === 'vessel') ? it : null, showTemp);
    } else if (tg.story && !tg.puddle) {
      const s = tg.story;
      hud.setHeld(null);
      if (s.deposit) { hud.setCross('can'); hud.setTarget(s.deposit.name, s.deposit.left > 0 ? `${s.deposit.left} sample${s.deposit.left === 1 ? '' : 's'} left` : 'picked clean, regrows'); hud.setPrompt(tool === 'pick' ? [['LMB', 'strike']] : [['6', 'rock pick']]); }
      else if (s.dig) { hud.setCross('can'); hud.setTarget(s.dig.name, 'quartz sand'); hud.setPrompt(tool === 'trowel' ? [['LMB', 'dig'], ['RMB', 'tip out']] : [['7', 'trowel']]); }
      else { hud.setCross(''); hud.setTarget(s.water, 'water'); hud.setPrompt(grab.item && grab.item.kind === 'vessel' ? [['F', 'fill']] : []); }
    } else if (tg.puddle) {
      hud.setCross(''); hud.setTarget('Spill', ''); hud.setPrompt(tool === 'spatula' || tool === 'pipette' ? [['LMB', 'collect']] : []); hud.setHeld(tg.puddle.mix.isEmpty() ? null : { id: tg.puddle.id, name: 'Spill', mix: tg.puddle.mix, kind: 'puddle' }, showTemp);
    } else { hud.setCross(''); hud.setTarget('', ''); hud.setPrompt([]); hud.setHeld(null); }
    hud.bars(player.health, player.stamina, grab.hold ? grab.hold.strain : null);
  }

  // ---------- pause, book, menu ----------
  function openPause() { uiOpen = true; input.st.enabled = false; hud.openPause(); }
  function openBook(tab) { uiOpen = true; input.st.enabled = false; input.unlock(); hud.openBook(tab); }
  const askUI = createAsk(() => { if (state === 'play') G.hooks.resume(); });
  const supplyUI = createSupply(G, () => { if (state === 'play') G.hooks.resume(); });
  G.hooks.openSupply = () => { if (net.guest) { hud.toast('Chemical supply', 'Only the host can order chemicals.'); return; } uiOpen = true; input.st.enabled = false; input.unlock(); supplyUI.open(); play('ui'); };
  function uiKeys() {
    if (state !== 'play') return;
    if (askUI.isOpen) { if (input.hit('Escape')) askUI.close(); return; }
    if (supplyUI.isOpen) { if (input.hit('Escape')) supplyUI.close(); return; }
    if (input.hit('KeyT') && !hud.bookOpen && !hud.pauseOpen) { uiOpen = true; input.st.enabled = false; input.unlock(); askUI.open(); play('ui'); return; }
    if (input.hit('KeyH') && (G.story || G.settings.mode !== 'discovery') && !hud.bookOpen && !hud.pauseOpen) { hud.guide(); play('ui'); }
    if (input.hit('KeyZ') && !hud.bookOpen && !hud.pauseOpen) {
      // fast-forward chemistry and heat (not your legs): for slow reactions, cooling and crystal growing
      G.timeScale = G.timeScale === 1 ? 4 : G.timeScale === 4 ? 16 : 1;
      $('timeChip').hidden = G.timeScale === 1; $('timeChip').textContent = 'Time ×' + G.timeScale + '  (Z)';
      play('click');
    }
    const esc = input.hit('Escape');
    if (hud.bookOpen) { if (esc || input.hit('Tab')) hud.closeBook(); else if (input.hit('KeyP')) hud.openBook('table'); else if (input.hit('KeyN') && document.activeElement !== $('notes')) hud.openBook('notes'); return; }
    if (hud.pauseOpen) { if (esc) { hud.closePause(); G.hooks.resume(); } return; }
    if (input.hit('Tab')) openBook('disc'); else if (input.hit('KeyP')) openBook('table'); else if (input.hit('KeyN')) openBook('notes'); else if (esc) { input.unlock(); openPause(); }
  }
  function reactsWith(a, b) {
    for (const x of a.ids()) for (const y of b.ids()) if (x !== y && canReact(x, y)) { const rx = RX.find((r) => r.inputs.some((i) => i.id === x) && r.inputs.some((i) => i.id === y)); return rx ? rx.kind.toLowerCase() : 'yes'; }
    return null;
  }
  // mode picker on the title screen
  function showMode() {
    document.querySelectorAll('.mode').forEach((b) => { const on = b.dataset.mode === (G.settings.mode || 'student'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    document.body.classList.toggle('discovery', G.settings.mode === 'discovery');
  }
  document.querySelectorAll('.mode').forEach((b) => { b.onclick = () => { G.settings.mode = b.dataset.mode; persist(); play('ui'); showMode(); }; });
  showMode();
  G.hooks.modeChanged = showMode;
  // Story Mode or Normal Mode. Normal is the free sandbox exactly as before; Story builds the outdoors the first time.
  let worldMode = 'normal';
  function startMode(mode, o = {}) {
    if (net.guest && !o.guest) { hud.toast('Multiplayer', 'You are in someone else\'s game. Leave it first.'); return; }
    initAudio(); setVolume(G.settings.volume); play('ding');
    if (mode !== worldMode || o.guest) {
      grab.release(false);
      if (G.story) story.stop();
      matter.clearAll(); gas.clear(); lab.reset(); toolLoad = new Mixture(20); tool = null;
      sim.progress.rx = {}; sim.progress.sub = {};
      G.timeScale = 1; $('timeChip').hidden = true;
      if (mode === 'story') story.start(o);
      else { G.prog = save; G.have = new Set(START_HAVE); if (!o.guest) lab.populate(); }
      worldMode = o.guest ? 'guest-' + mode : mode;
      if (!o.guest) net.modeChanged(mode);
    } else net.modeChanged(mode);
    hud.setStory(G.story);
    state = 'play'; $('menu').hidden = true; hud.show(true); uiOpen = false; input.st.enabled = true;
    $('touch').hidden = input.st.mode !== 'tap';
    if (mode === 'normal') { player.teleport(0, 0.35, 3.2); player.yaw = 0; player.pitch = -0.08; }
    try { input.lock(); } catch (e) { /* the browser may refuse until a click */ }
    refreshTool();
    if (o.guest) { hud.guide(false); hud.toast('Multiplayer', 'Joined. Everyone sees what you grab and pour.'); return; }
    if (!save.seenIntro) { save.seenIntro = true; persist(); hud.toast('Tip', 'Hold the left mouse button to carry things. Right button pours.'); }
    if (G.story) { hud.guide(true); return; }
    if (G.settings.mode !== 'discovery') { hud.guide(true); hud.toast('Student mode', 'Follow the experiment guide (H), or explore on your own.'); } else { hud.guide(false); hud.toast('Discovery mode', 'No hints. Use an indicator for pH and the thermometer (4) for temperature.'); }
  }
  function showMeta() {
    const p = save.story, n = Object.keys(p.mats).length, f = Object.keys(p.found).length;
    $('storyMeta').textContent = p.started ? `Continue · day ${p.days || 1} · ${n} material${n === 1 ? '' : 's'} · ${f} discover${f === 1 ? 'y' : 'ies'}` : 'New game';
  }
  showMeta();
  $('btnStory').onclick = () => startMode('story');
  $('btnNormal').onclick = () => startMode('normal');

  // ---------- multiplayer ----------
  const net = createNet(G, {
    matter, grab, player, hud, scene, lab, story,
    mode: () => (state === 'menu' ? null : worldMode ? worldMode.replace('guest-', '') : null),
    target: () => targetNow && targetNow.best && targetNow.best.item,
    enterAsGuest: (mode) => { worldMode = ''; startMode(mode, { guest: true }); },
    onLeft: () => { if (state !== 'menu') G.hooks.title(); },
    onStatus: () => showNet(),
  });
  G.net = net;
  function showNet() {
    const r = net.role, st = net.status;
    $('mpStatus').textContent = r === 'host' ? (net.code ? `Room code ${net.code} · ${st}${net.count > 1 ? ' · ' + net.count + ' players' : ''}` : st) : st;
    $('btnHost').hidden = r === 'guest'; $('btnHost').textContent = r === 'host' ? 'Stop hosting' : 'Host game';
    $('joinBox').hidden = r === 'host';
    $('btnJoin').textContent = r === 'guest' ? 'Leave' : 'Join';
    $('joinCode').disabled = r === 'guest';
    $('netChip').hidden = !r;
    $('netChip').textContent = r === 'host' ? `Room ${net.code} · ${net.count} player${net.count === 1 ? '' : 's'}` : r === 'guest' ? `Room ${net.code} · ${net.count} players` : '';
  }
  $('mpName').value = net.name;
  $('mpName').onchange = () => net.setName($('mpName').value);
  $('btnHost').onclick = () => { initAudio(); play('ui'); if (net.role === 'host') net.leave(); else net.host(); showNet(); };
  $('btnJoin').onclick = () => { initAudio(); play('ui'); if (net.role === 'guest') { net.leave(); if (state !== 'menu') G.hooks.title(); } else { net.setName($('mpName').value); net.join($('joinCode').value); } showNet(); };
  $('joinCode').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') $('btnJoin').click(); };
  $('mpName').onkeydown = (e) => e.stopPropagation();
  setInterval(showNet, 1000);
  window.addEventListener('pointerdown', () => initAudio(), { passive: true });
  // Browsers never let a page block Ctrl+W, but they do let it ask before the tab closes mid-experiment
  window.addEventListener('beforeunload', (e) => { if (state === 'play') { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('pagehide', () => { if (G.story) story.serialize(); persistNow(); });

  // ---------- settings and resize ----------
  let pr = 1, scale = 1;
  const QUALITY = { low: { pr: 0.8, bloom: false, shadow: false }, medium: { pr: 1.1, bloom: true, shadow: true }, high: { pr: 1.5, bloom: true, shadow: true }, ultra: { pr: 2, bloom: true, shadow: true } };
  function applySettings() {
    const q = QUALITY[G.settings.quality] || QUALITY.high;
    pr = Math.min(window.devicePixelRatio || 1, q.pr) * scale;
    bloom.enabled = q.bloom;
    for (const l of G.lightsMain) if (l.isSpotLight) l.castShadow = q.shadow;
    resize();
  }
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    composer.setPixelRatio(pr); composer.setSize(w, h);
    camera.aspect = w / h;
    const a = camera.aspect, base = G.settings.fov;
    camera.fov = a >= 1.2 ? base : Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * 1.2 / a)));
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  lab.populate();
  applySettings();
  hud.loadSettings();

  // ---------- main loop ----------
  const dbg = { maxDt: 0.05, speed: 1, freeze: false };
  window.__lab = { G, grab, matter, sim, gas, lab, player, input, dbg, findTarget, primary, story, startMode, askUI, supplyUI, get net() { return net; }, selectTool: (t) => { tool = t; refreshTool(); }, state: () => state };
  let last = performance.now(), slow = 0, frames = 0;
  // one step of the whole game, without drawing it (tests call this directly to run fast)
  function step(dt) {
    G.time += dt;
    uiKeys();
    const active = state === 'play' && !uiOpen;
    const rot = input.down('KeyR') && grab.hold ? 0 : 1;
    if (active) { player.look(input.st.lookX * rot, input.st.lookY * rot); player.frozen = false; } else player.frozen = true;
    if (state === 'play') player.update(dt, input);
    phys.step(dt);
    if (state === 'play') player.applyCamera(dt);
    else { const t = G.time; camera.position.set(2.9 + Math.sin(t * 0.12) * 0.5, 1.72 + Math.sin(t * 0.1) * 0.05, 3.5); camera.lookAt(-1.4, 1.0, -2.6); player.pos.copy(camera.position); camera.getWorldDirection(player.dir); }
    if (active) interact(dt);
    grab.update(dt, input);
    matter.update(dt, G.time);
    sim.update(dt);
    gas.update(dt, G.time);
    lab.update(dt, G.time);
    story.update(dt);
    net.update(dt);
    updateTweens(dt);
    G.P.update(dt);
    view.update(dt, G.time);
    if (persistT > 0) { persistT -= dt; if (persistT <= 0) persistNow(); }
  }
  window.__lab.run = (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) step(dt); };
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000; last = now;
    if (document.hidden || dbg.freeze) return;
    step(Math.min(raw, dbg.maxDt) * dbg.speed);
    // sound beds
    setListener(player.pos);
    let pour = 0;
    for (const it of matter.items) if (it.flowing > 0) pour = Math.max(pour, Math.min(1, it.flowing * 30) * distGain(it.body.position));
    loopVol('pour', pour * 0.16, 1); loopVol('fizz', sim.levels.fizz * 0.5); loopVol('flame', sim.levels.flame * 0.5); loopVol('burner', G.levels.burner);
    loopVol('tap', G.tap.on ? 0.09 * distGain(lab.spout) : 0); loopVol('hum', state === 'play' ? 0.035 : 0.02);
    hud.frame(Math.min(raw, 0.1), state === 'play' ? sim.glare * (goggles() ? 0.4 : 1) : 0, player.blur);
    if (bloom.enabled) composer.render(); else renderer.render(scene, camera);
    input.endFrame();
    // if the machine is struggling, give up sharpness before frame rate
    frames++;
    if (frames > 60 && state === 'play') { slow = raw > 0.04 ? slow + 1 : Math.max(0, slow - 1); if (slow > 70 && scale > 0.55) { slow = 0; scale -= 0.15; applySettings(); } }
  }
  requestAnimationFrame((now) => { last = now; frame(now); $('loading').classList.add('gone'); });
}

try { boot(); } catch (err) {
  console.error(err);
  $('loading').innerHTML = '<span>The lab could not start on this device. It needs WebGL 2.<br>' + String(err && err.message || err).slice(0, 160) + '</span>';
}
