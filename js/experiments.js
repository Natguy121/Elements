import * as THREE from 'three';
import { CONTENT } from './data.js';
import { sfx } from './audio.js';
import { anim, wait, to, arc, ease, rnd, rs, rv } from './fx.js';
import { shippingLabelTex } from './textures.js';
import { STATION_X } from './lab.js';

// What actually happens at each station, the delivery sequence and the mixer.
// `L` is the lab, `ui` is the set of screen effects owned by main.js.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, k) => a + (b - a) * k;

export function createExperiments(L, ui) {
  const { P, scene } = L;

  const samplePos = (id) => V(L.stationPos[id].x + (id === 'water' ? -0.57 : -0.36), L.BENCH, L.stationPos[id].z + (id === 'water' ? 0.25 : 0.2));
  const valve = () => L.sample.localToWorld(L.sample.userData.valve.clone());

  function setSample(z) {
    if (L.sample) {
      const old = L.sample;
      if (old.userData.chunk && old.userData.chunk.parent !== old) scene.remove(old.userData.chunk);
      scene.remove(old);
    }
    L.sample = L.makeSample(z);
    scene.add(L.sample);
    return L.sample;
  }
  function placeSample(z) { setSample(z).position.copy(L.home); }
  function toHome() { sfx.whoosh(); return arc(L.sample, L.home, 1.1, 0.6); }
  async function bring(id) {
    const tgt = samplePos(id);
    if (L.sample.position.distanceTo(tgt) > 0.05) { sfx.tap(); await arc(L.sample, tgt, 0.6, 0.4); }
  }

  // ----- shared bits -----
  function puff(from, target, color, n = 14, life = 0.55) {
    const d = target.clone().sub(from).divideScalar(life);
    let sent = 0;
    sfx.hiss(0.4, 0.12);
    return anim(0.35, (e, k) => {
      while (sent < k * n) {
        sent++;
        P.emit({ pos: from.clone().add(rv(0.01)), vel: d.clone().add(rv(0.1)), life: life * rnd(0.8, 1.1), size: 0.04, size1: 0.15, color, alpha: 0.4, tex: 'smoke' });
      }
    }, ease.lin);
  }
  function flashLight(pos, color, intensity, dur) {
    L.fxLight.position.copy(pos); L.fxLight.color.set(color);
    return anim(dur, (e) => { L.fxLight.intensity = intensity * (1 - e); }, ease.out);
  }
  function smoke(pos, n = 10, scale = 1, color = 0x1c1c1c, alpha = 0.6) {
    P.burst(n, () => ({ pos: pos.clone().add(rv(0.05 * scale)), vel: rv(0.45 * scale, 0.9), life: rnd(1.5, 2.6), size: 0.25 * scale, size1: 1.1 * scale, color, alpha, tex: 'smoke', drag: 0.8, spin: rs(1) }));
  }
  function fireball(pos, scale = 1, color = 0xff8a20) {
    P.burst(26, () => ({ pos: pos.clone().add(rv(0.05 * scale)), vel: rv(1.7 * scale, 0.7 * scale), life: rnd(0.45, 0.95), size: 0.2 * scale, size1: 0.8 * scale, color, boost: 2.4, add: true, drag: 2.6 }));
    P.burst(9, () => ({ pos: pos.clone(), vel: rv(2.4 * scale, 0.5), life: rnd(0.2, 0.4), size: 0.25 * scale, size1: 0.5 * scale, color: 0xfff2c8, boost: 4, add: true, drag: 3 }));
    P.burst(16, () => ({ pos: pos.clone(), vel: rv(3.5 * scale, 2), gravity: 6, life: rnd(0.5, 1.1), size: 0.035, color: 0xffc860, boost: 4, add: true, tex: 'spark' }));
    smoke(pos, 14, scale);
    flashLight(pos, color, 420 * scale, 0.8);
  }
  function sparks(pos, n = 12, color = 0xbfd8ff) {
    P.burst(n, () => ({ pos: pos.clone().add(rv(0.02)), vel: rv(1.3, 0.9), gravity: 5, life: rnd(0.3, 0.8), size: rnd(0.02, 0.04), color, boost: 5, add: true, tex: 'spark' }));
  }
  function takeChunk() {
    const s = L.sample, c = s.userData.chunk;
    scene.attach(c);
    to(s.userData.lid.position, { x: 0.11, y: 0.03 }, 0.25);
    return c;
  }
  async function returnChunk(popIn = false) {
    const s = L.sample, c = s.userData.chunk;
    const home = s.localToWorld(s.userData.chunkHome.clone());
    c.material.emissive.setHex(s.userData.baseEmissive);
    c.material.emissiveIntensity = s.userData.baseGlow;
    c.visible = true;
    if (popIn) { c.position.copy(home); await anim(0.35, (e) => c.scale.setScalar(Math.max(e, 0.01)), ease.back); sfx.tap(); }
    else { c.scale.setScalar(1); await arc(c, home, 0.55, 0.3); }
    s.attach(c);
    c.position.copy(s.userData.chunkHome); c.rotation.set(0, 0, 0); c.scale.setScalar(1);
    to(s.userData.lid.position, { x: 0, y: 0.17 }, 0.25);
  }
  const relight = () => { sfx.click(); L.flame.setColor(null); L.flame.power = 1; return anim(0.35, (e) => L.flame.group.scale.setScalar(Math.max(e, 0.001)), ease.back); };

  // ----- balloon -----
  async function balloon(z, el, r) {
    const N = L.nozzle;
    const b = L.makeBalloon(el.color);
    b.userData.skin.castShadow = true;
    b.userData.string.visible = false;
    b.position.copy(N); b.scale.setScalar(0.04);
    scene.add(b);
    let chunk = null;
    if (el.form === 'solid') { chunk = takeChunk(); await arc(chunk, N.clone().add(V(0, 0.04, 0)), 0.55, 0.3); chunk.visible = false; sfx.pop(); }
    else puff(valve(), N, el.color);
    sfx.inflate(1.3);
    await anim(1.3, (e) => b.scale.setScalar(0.04 + 0.96 * e), ease.out);
    await wait(0.35);
    b.userData.string.visible = true;
    const p0 = b.position.clone();
    const keep = (f) => { L.floaters.push(f); if (L.floaters.length > 12) scene.remove(L.floaters.shift().b); };
    if (r.fx === 'float') {
      const tx = N.x + rs(0.7), tz = N.z + 0.2 + rnd(0.45), ty = 3.2 - 0.46;
      L.rig.tLook.y = 2.1;
      await anim(r.slow ? 3.6 : 1.8, (e) => b.position.set(lerp(p0.x, tx, e), lerp(p0.y, ty, e), lerp(p0.z, tz, e)), r.slow ? ease.io : ease.in);
      sfx.tap();
      keep({ b, mode: 'ceil', y: ty, ph: rnd(6) });
      await wait(0.9);
      L.rig.tLook.y = 1.3;
    } else if (r.fx === 'hover') {
      const c = V(N.x + 0.5, 1.95, N.z + 0.7);
      L.rig.tLook.y = 1.7;
      await anim(2.2, (e) => b.position.lerpVectors(p0, c, e));
      keep({ b, mode: 'hover', x: c.x, y: c.y, z: c.z, ph: 0 });
      await wait(0.8);
      L.rig.tLook.y = 1.3;
    } else if (r.fx === 'sink') {
      const tgt = V(N.x + rs(0.5), 0, N.z + 1.0 + rs(0.2));
      sfx.trombone();
      L.rig.tLook.y = 0.9;
      await arc(b, tgt, 2.2, 0.25, ease.lin);
      await anim(0.5, (e, k) => { b.position.y = Math.sin(Math.PI * k) * 0.1; }, ease.lin);
      b.userData.string.visible = false;
      await to(b.rotation, { z: 1.25 }, 0.5, ease.out);
      keep({ b, mode: 'floor' });
      await wait(0.5);
      L.rig.tLook.y = 1.3;
    } else if (r.fx === 'eaten') {
      const m = b.userData.skin.material, c0 = m.color.clone(), c1 = new THREE.Color(0x3a2a12);
      sfx.hiss(1.6, 0.3);
      b.userData.string.visible = false;
      await anim(1.6, (e, k) => {
        m.color.lerpColors(c0, c1, Math.min(1, k * 2));
        b.scale.set(1 - 0.9 * e, 1 - 0.95 * e, 1 - 0.9 * e);
        if (Math.random() < 0.5) P.emit({ pos: N.clone().add(V(rs(0.1), 0.1 + rnd(0.25) * (1 - e), rs(0.1))), vel: rv(0.15, 0.4), life: rnd(0.8, 1.4), size: 0.08, size1: 0.35, color: 0xd8d27a, alpha: 0.5, tex: 'smoke' });
      }, ease.in);
      scene.remove(b);
      sfx.pop();
    } else { // rock
      const tgt = V(N.x + 0.12, 0, N.z + 0.85);
      L.rig.tLook.y = 0.8;
      await arc(b, tgt, 0.65, 0.08, ease.in);
      sfx.thud(); L.shake(0.7);
      await anim(0.2, (e) => b.scale.set(1 + 0.3 * e, 1 - 0.45 * e, 1 + 0.3 * e), ease.out);
      await wait(0.9);
      sfx.pop();
      P.burst(10, () => ({ pos: tgt.clone().add(V(0, 0.15, 0)), vel: rv(1.2, 1), gravity: 5, life: rnd(0.4, 0.8), size: 0.05, color: el.color, tex: 'drop' }));
      scene.remove(b);
      chunk.position.copy(tgt).y += 0.04; chunk.visible = true;
      await wait(0.4);
      L.rig.tLook.y = 1.3;
      await returnChunk();
    }
  }

  // ----- burner -----
  async function burner(z, el, r) {
    const F = L.flamePos, hold = F.clone().add(V(0, 0.22, 0)), fl = L.flame;
    let chunk = null;
    if (el.form === 'solid') { chunk = takeChunk(); L.tongs.visible = true; await arc(chunk, hold, 0.7, 0.25); }
    else { await puff(valve(), F.clone().add(V(0, 0.12, 0)), el.color, 16); await wait(0.2); }
    switch (r.fx) {
      case 'boom':
        sfx.boom(); ui.flash(0.9); fireball(F.clone().add(V(0, 0.25, 0)), 1.3); L.shake(1.2);
        fl.group.scale.setScalar(0.001); ui.soot();
        await wait(1.6); await relight();
        break;
      case 'tint':
        fl.setColor(r.color); fl.power = 3.5; sfx.sparkle(); sfx.hiss(0.6, 0.12);
        sparks(hold, 10, r.color);
        await anim(0.3, (e) => fl.group.scale.set(1 + 0.6 * e, 1 + 0.8 * e, 1 + 0.6 * e), ease.out);
        await anim(2.6, () => { if (Math.random() < 0.12) sparks(hold, 2, r.color); }, ease.lin);
        fl.setColor(null); fl.power = 1; fl.group.scale.setScalar(1);
        break;
      case 'out':
        sfx.fizzle();
        await anim(0.4, (e) => fl.group.scale.setScalar(Math.max(1 - e, 0.001)));
        smoke(F.clone().add(V(0, 0.08, 0)), 5, 0.3, 0x8a8a8a, 0.45);
        await wait(1.4); await relight();
        break;
      case 'roar':
        sfx.roar(2.5); fl.power = 4; fl.setColor(r.smoke ? 0xfff0b0 : 0x8fb4ff); L.shake(0.3);
        await anim(0.35, (e) => fl.group.scale.set(1 + 2.4 * e, 1 + 4.2 * e, 1 + 2.4 * e), ease.out);
        await anim(2.0, () => {
          if (Math.random() < 0.5) P.emit({ pos: F.clone().add(V(rs(0.04), rnd(0.2, 0.7), rs(0.04))), vel: V(rs(0.2), rnd(0.8, 1.6), rs(0.2)), life: rnd(0.3, 0.6), size: 0.1, size1: 0.25, color: r.smoke ? 0xffe9a0 : 0x7fa8ff, boost: 2, add: true });
          if (r.smoke && Math.random() < 0.4) P.emit({ pos: F.clone().add(V(0, 0.8, 0)), vel: rv(0.3, 0.9), life: rnd(1.2, 2), size: 0.2, size1: 0.9, color: 0xffffff, alpha: 0.5, tex: 'smoke' });
        }, ease.lin);
        await anim(0.4, (e) => fl.group.scale.set(3.4 - 2.4 * e, 5.2 - 4.2 * e, 3.4 - 2.4 * e));
        fl.setColor(null); fl.power = 1;
        break;
      case 'ember':
        chunk.material.emissive.setHex(0xff4a08);
        sfx.hiss(1.2, 0.08);
        await to(chunk.material, { emissiveIntensity: 4 }, 1.6);
        await wait(1.3);
        break;
      case 'white':
        sfx.hiss(2.2, 0.35); ui.whiteout();
        chunk.material.emissive.setHex(0xffffff); chunk.material.emissiveIntensity = 12;
        P.burst(6, () => ({ pos: hold.clone(), vel: rv(0.05), life: 2.2, size: 0.6, size1: 1.6, color: 0xffffff, boost: 6, add: true }));
        flashLight(hold, 0xffffff, 900, 2.6);
        await anim(2.4, () => { if (Math.random() < 0.3) sparks(hold, 2, 0xffffff); }, ease.lin);
        chunk.visible = false;
        break;
      case 'inferno': {
        sfx.boom(); sfx.roar(3); sfx.alarm(); ui.flash(0.7); ui.tint('rgba(255,70,0,.3)', 3.2);
        fireball(F.clone().add(V(0, 0.2, 0)), 1.6); L.shake(1.2); ui.soot();
        fl.setColor(0xffd040); fl.power = 5; fl.group.scale.set(3, 5, 3);
        await anim(2.8, () => {
          for (let i = 0; i < 2; i++) P.emit({ pos: V(F.x + rs(1.1), L.BENCH + rnd(0.02, 0.1), F.z + rs(0.3)), vel: V(rs(0.2), rnd(0.8, 1.8), rs(0.2)), life: rnd(0.35, 0.7), size: 0.14, size1: 0.4, color: Math.random() < 0.5 ? 0xff7a10 : 0xffd040, boost: 2.2, add: true });
          if (Math.random() < 0.2) L.shake(0.25);
        }, ease.lin);
        await anim(0.5, (e) => fl.group.scale.set(3 - 2 * e, 5 - 4 * e, 3 - 2 * e));
        fl.setColor(null); fl.power = 1;
        break;
      }
      default: // nothing happens
        await anim(0.7, (e, k) => { fl.group.scale.y = 1 + 0.18 * Math.sin(k * Math.PI * 3); }, ease.lin);
        fl.group.scale.y = 1;
        await wait(0.3); sfx.cricket(); await wait(1.3);
    }
    if (chunk) { await returnChunk(r.fx === 'white'); L.tongs.visible = false; }
  }

  // ----- zapper -----
  async function zapIt(z, el, r) {
    const Z = L.zap;
    let chunk = null;
    if (el.form === 'solid') { chunk = takeChunk(); await arc(chunk, Z.clips, 0.6, 0.25); }
    else await puff(valve(), Z.tube.clone().add(V(-0.28, 0, 0)), el.color, 14);
    sfx.click();
    await to(Z.lever.rotation, { x: 0.7 }, 0.18, ease.in);
    sfx.zap();
    if (r.fx === 'glow') {
      const col = new THREE.Color(r.color);
      Z.coreMat.color.copy(col).multiplyScalar(1.7);
      Z.light.color.copy(col);
      sfx.buzz(3.3);
      await anim(0.7, (e, k) => { const on = Math.random() < k * 1.1; Z.core.visible = on; Z.light.intensity = on ? 2 : 0; Z.bulbMat.emissiveIntensity = on ? 3 : 0; }, ease.lin);
      Z.core.visible = true; Z.bulbMat.emissiveIntensity = 3;
      await anim(2.6, () => {
        Z.light.intensity = 2 + rs(0.2);
        if (r.smoke && Math.random() < 0.35) P.emit({ pos: Z.tube.clone().add(V(rs(0.28), 0.04, 0)), vel: rv(0.1, 0.5), life: rnd(1, 1.6), size: 0.06, size1: 0.4, color: 0xe8e8c0, alpha: 0.45, tex: 'smoke' });
      }, ease.lin);
    } else if (r.fx === 'spark') {
      sfx.buzz(1.9);
      Z.bulbMat.emissiveIntensity = 6;
      L.fxLight.position.copy(Z.bulb).z += 0.1; L.fxLight.color.set(0xffc870);
      const p0 = chunk.position.clone();
      await anim(1.9, () => {
        L.fxLight.intensity = 2.2 + rs(0.5);
        if (Math.random() < 0.25) { sparks(Z.clips.clone().add(V(Math.random() < 0.5 ? -0.045 : 0.045, 0, 0)), 4); sfx.zap(); }
        chunk.position.set(p0.x + rs(0.002), p0.y + rs(0.002), p0.z);
      }, ease.lin);
      L.fxLight.intensity = 0;
    } else {
      sfx.fizzle();
      await wait(0.9); sfx.trombone(); await wait(1.4);
    }
    Z.core.visible = false; Z.light.intensity = 0; Z.bulbMat.emissiveIntensity = 0;
    sfx.click();
    to(Z.lever.rotation, { x: -0.7 }, 0.18);
    if (chunk) await returnChunk();
  }

  // ----- water tank -----
  async function waterIt(z, el, r) {
    const Tk = L.tank;
    const top = V(Tk.x - 0.08, 1.72, Tk.z), surf = V(Tk.x - 0.08, Tk.WS, Tk.z), bottom = V(Tk.x - 0.08, Tk.WB + 0.06, Tk.z);
    const bubblesAt = (p, n, spread = 0.05) => P.burst(n, () => {
      const v = rnd(0.35, 0.6), start = p.clone().add(V(rs(spread), 0, rs(spread * 0.5)));
      return { pos: start, vel: V(rs(0.03), v, 0), life: Math.max(0.05, (Tk.WS - start.y) / v), size: rnd(0.014, 0.034), tex: 'bubble', alpha: 0.95 };
    });
    const splash = (p, n = 14, power = 1) => P.burst(n, () => ({ pos: p.clone(), vel: V(rs(0.5 * power), rnd(0.8, 1.9) * power, rs(0.3 * power)), gravity: 6, life: rnd(0.35, 0.75), size: rnd(0.02, 0.05), color: 0xdff4ff, tex: 'drop', alpha: 0.9 }));
    const steam = (p, spread) => P.emit({ pos: p.clone().add(V(rs(spread), 0, rs(spread * 0.3))), vel: V(rs(0.2), rnd(0.5, 1.3), rs(0.1)), life: rnd(0.7, 1.3), size: 0.08, size1: 0.45, color: 0xffffff, alpha: 0.5, tex: 'smoke' });

    if (el.form === 'gas') {
      await puff(valve(), top, el.color, 12);
      if (r.fx === 'steam') {
        sfx.hiss(2.8, 0.45); sfx.bubbles(2.6); ui.flash(0.35);
        Tk.duckBob = 7;
        const c0 = Tk.waterMat.color.clone(), c1 = new THREE.Color(0xe8e060);
        L.fxLight.position.copy(surf); L.fxLight.color.set(0xfff080);
        await anim(2.8, (e, k) => {
          bubblesAt(bottom, 2, 0.3); steam(surf, 0.38); steam(surf, 0.38);
          Tk.waterMat.color.lerpColors(c0, c1, Math.sin(Math.PI * k));
          L.fxLight.intensity = 12 * Math.sin(Math.PI * k) * (0.6 + Math.random() * 0.4);
          if (Math.random() < 0.1) L.shake(0.2);
        }, ease.lin);
        Tk.waterMat.color.copy(c0); L.fxLight.intensity = 0; Tk.duckBob = 1;
      } else {
        sfx.bubbles(2.6); Tk.duckBob = 3;
        await anim(2.6, () => { if (Math.random() < 0.7) bubblesAt(bottom, 1, 0.07); }, ease.lin);
        Tk.duckBob = 1;
      }
      return;
    }
    const chunk = takeChunk();
    await arc(chunk, top, 0.6, 0.2);
    await anim(0.28, (e) => chunk.position.lerpVectors(top, surf, e), ease.in);
    sfx.splash(); splash(surf);
    const skitter = (t, speed) => chunk.position.set(surf.x + 0.3 * Math.sin(t * 3.1 * speed) + 0.05 * Math.sin(t * 11), Tk.WS + 0.006, surf.z + 0.1 * Math.sin(t * 4.7 * speed));
    if (r.fx === 'fizz') {
      sfx.hiss(3, 0.3); Tk.duckBob = 3;
      await anim(3, (e, k) => {
        skitter(k * 3, 1); chunk.rotation.y += 0.3; chunk.scale.setScalar(1 - 0.75 * k);
        if (Math.random() < 0.6) steam(chunk.position, 0.02);
        if (Math.random() < 0.3) bubblesAt(chunk.position.clone().add(V(0, -0.03, 0)), 1, 0.02);
      }, ease.lin);
      chunk.visible = false; Tk.duckBob = 1;
      await returnChunk(true);
    } else if (r.fx === 'boom') {
      sfx.hiss(1.5, 0.45); Tk.duckBob = 5;
      chunk.material.emissive.setHex(0xffa020);
      await anim(1.5, (e, k) => {
        skitter(k * 1.5, 2.2); chunk.material.emissiveIntensity = k * 5;
        steam(chunk.position, 0.02);
        if (Math.random() < 0.4) sparks(chunk.position, 2, 0xffc040);
      }, ease.lin);
      const at = chunk.position.clone();
      chunk.visible = false;
      sfx.boom(); ui.flash(0.85); fireball(at.clone().add(V(0, 0.15, 0)), 0.9, 0xffb040); splash(surf, 36, 2.3); L.shake(1.2);
      const setLevel = (s) => { Tk.water.scale.y = s; Tk.water.position.y = Tk.WB + (Tk.WS - Tk.WB) * s / 2; };
      setLevel(0.55);
      anim(3.5, (e) => setLevel(0.55 + 0.45 * e), ease.io);
      // the duck achieves orbit
      const d = Tk.duck;
      Tk.duckFree = false; sfx.squeak();
      L.rig.tLook.y = 2.0;
      const y0 = d.position.y;
      await anim(0.5, (e) => { d.position.y = lerp(y0, 3.08, e); d.rotation.z += 0.6; }, ease.out);
      d.rotation.set(0, 2.4, Math.PI); sfx.thud();
      await wait(1.5);
      sfx.squeak();
      L.rig.tLook.y = 1.3;
      await anim(0.55, (e) => { d.position.y = lerp(3.08, Tk.WS, e); d.rotation.z = Math.PI * (1 - e) * 3; }, ease.in);
      d.rotation.set(0, 2.4, 0); sfx.splash(); splash(d.position, 14, 1.1);
      Tk.duckFree = true; Tk.duckBob = 1;
      await returnChunk(true);
    } else { // sink, with optional lazy bubbles or a ghostly glow
      await anim(1.2, (e, k) => { chunk.position.lerpVectors(surf, bottom, e); if (Math.random() < 0.25 * (1 - k)) bubblesAt(chunk.position, 1, 0.02); }, ease.out);
      if (r.fx === 'glowsink') {
        sfx.sparkle();
        L.fxLight.position.copy(bottom).y += 0.1; L.fxLight.color.set(0x9dffb0);
        await anim(2.8, (e, k) => { const s = Math.sin(Math.PI * k); chunk.material.emissiveIntensity = 0.25 + 5 * s; L.fxLight.intensity = 5 * s; }, ease.lin);
        L.fxLight.intensity = 0;
      } else if (r.bubbles) {
        sfx.bubbles(2.2);
        await anim(2.2, () => { if (Math.random() < 0.25) bubblesAt(chunk.position, 1, 0.02); }, ease.lin);
      } else { await wait(0.5); sfx.cricket(); await wait(1.0); }
      await returnChunk();
    }
  }

  // ----- microphone -----
  async function micIt(z, el, r) {
    const Mi = L.mic;
    if (r.refuse) {
      await puff(valve(), Mi.head, el.color, 10);
      sfx.scratch();
      await to(Mi.group.rotation, { z: -1.48 }, 0.45, ease.in);
      sfx.thud(); L.shake(0.4);
      await wait(1.8);
      await to(Mi.group.rotation, { z: 0 }, 0.7, ease.back);
      return;
    }
    if (r.lick) {
      const chunk = takeChunk();
      const fwd = V(0, 0, 0); L.camera.getWorldDirection(fwd);
      const tgt = L.camera.position.clone().addScaledVector(fwd, 0.42).add(V(0, -0.07, 0));
      await arc(chunk, tgt, 0.6, 0.12);
      sfx.slurp(); ui.bubble('*lick*', 1);
      await anim(0.7, (e, k) => { chunk.rotation.z = Math.sin(k * 12) * 0.2; }, ease.lin);
      await wait(0.3);
      await returnChunk();
      return;
    }
    const fwd = V(0, 0, 0); L.camera.getWorldDirection(fwd);
    await puff(valve(), L.camera.position.clone().addScaledVector(fwd, 0.3).add(V(0, -0.15, 0)), el.color, 16, 0.6);
    sfx.inhale();
    await wait(0.85);
    Mi.recMat.emissiveIntensity = 4;
    ui.bubble('Testing, testing. I am a very serious scientist.', r.pitch);
    sfx.voice(r.pitch, 12);
    await anim(1.7, (e, k) => Mi.cone.scale.setScalar(1 + 0.12 * Math.abs(Math.sin(k * 40))), ease.lin);
    Mi.cone.scale.setScalar(1); Mi.recMat.emissiveIntensity = 0;
    await wait(0.3);
  }

  const RUN = { balloon, burner, zap: zapIt, water: waterIt, mic: micIt };
  async function run(id, z) {
    const el = CONTENT[z];
    L.setView(id);
    await bring(id);
    await RUN[id](z, el, el.r[id]);
  }

  // ----- mixer -----
  async function mix(a, b, res) {
    const Mx = L.mixer, mat = Mx.mat, neck = Mx.neck;
    L.setView('mix');
    Mx.crystals.visible = false; Mx.liquid.visible = true;
    await wait(0.5);
    const cols = [CONTENT[a].color, CONTENT[b].color];
    sfx.bubbles(1);
    await anim(1.0, () => {
      for (let i = 0; i < 2; i++) P.emit({ pos: neck.clone().add(V(i ? 0.012 : -0.012, 0.36 + rnd(0.05), 0)), vel: V(0, -1.3, 0), life: 0.27, size: 0.035, color: cols[i], tex: 'drop' });
    }, ease.lin);
    const c0 = mat.color.clone(), c1 = new THREE.Color(res.color);
    await anim(1.2, (e) => { mat.color.lerpColors(c0, c1, e); mat.emissive.copy(mat.color); Mx.liquid.rotation.y += 0.22; });
    switch (res.fx) {
      case 'boom':
        sfx.boom(); ui.flash(0.85); fireball(neck.clone().add(V(0, 0.15, 0)), 1.1); L.shake(1.1); ui.soot();
        await wait(1.5);
        break;
      case 'fizz':
        sfx.hiss(2.2, 0.3); sfx.bubbles(2.2);
        await anim(2.2, () => {
          P.emit({ pos: neck.clone().add(rv(0.02)), vel: V(rs(0.3), rnd(0.2, 0.8), rs(0.25)), gravity: 2.2, life: rnd(0.6, 1.1), size: rnd(0.03, 0.07), tex: 'bubble', alpha: 0.9 });
        }, ease.lin);
        break;
      case 'stink':
        sfx.stink(); ui.tint('rgba(130,175,30,.32)', 3.4);
        await anim(2.5, () => {
          if (Math.random() < 0.6) P.emit({ pos: neck.clone(), vel: V(rs(0.35), rnd(0.3, 0.8), rnd(0.1, 0.7)), life: rnd(1.5, 2.4), size: 0.12, size1: 0.9, color: 0x9ab52a, alpha: 0.5, tex: 'smoke', spin: rs(1) });
        }, ease.lin);
        sfx.trombone();
        break;
      case 'glow':
        sfx.sparkle(); ui.flash(0.5);
        L.fxLight.position.copy(Mx.center).z += 0.25; L.fxLight.color.set(res.color);
        await anim(2.4, (e, k) => { const s = Math.sin(Math.PI * k); mat.emissiveIntensity = 0.12 + 6 * s; L.fxLight.intensity = 14 * s; }, ease.lin);
        mat.emissiveIntensity = 0.12; L.fxLight.intensity = 0;
        break;
      case 'smoke':
        sfx.hiss(2.2, 0.22);
        await anim(2.3, () => {
          if (Math.random() < 0.6) P.emit({ pos: neck.clone(), vel: V(rs(0.2), rnd(0.4, 1.0), rs(0.2)), life: rnd(1.4, 2.2), size: 0.1, size1: 0.8, color: 0xf2f2f2, alpha: 0.55, tex: 'smoke', spin: rs(1) });
        }, ease.lin);
        break;
      case 'crystal':
        sfx.ding();
        Mx.crystalMat.color.set(res.color);
        Mx.liquid.visible = false; Mx.crystals.visible = true;
        sparks(Mx.center, 8, 0xffffff);
        await anim(0.8, (e) => Mx.crystals.scale.setScalar(Math.max(e, 0.01)), ease.back);
        await wait(0.9);
        break;
      case 'laugh':
        sfx.voice(1.9, 13); ui.bubble('HA HA HA HA HA', 1.9);
        await anim(2.2, () => {
          if (Math.random() < 0.5) P.emit({ pos: neck.clone(), vel: V(rs(0.4), rnd(0.3, 0.9), rnd(0, 0.6)), life: rnd(1.2, 2), size: 0.1, size1: 0.7, color: 0xff9ad0, alpha: 0.5, tex: 'smoke' });
        }, ease.lin);
        break;
      default:
        await wait(0.5); sfx.cricket(); await wait(1.3);
    }
  }

  // ----- the delivery -----
  // waitTap(kind) resolves when the player taps the door / the box.
  async function deliver(z, waitTap) {
    const el = CONTENT[z], pk = L.pack, g = pk.group;
    if (L.sample) { scene.remove(L.sample); L.sample = null; }
    L.setView('door');
    ui.caption('Knock knock. Something is at the door. It is probably science.');
    sfx.knock();
    await waitTap('door');
    sfx.creak();
    await to(L.door.rotation, { y: 1.75 }, 1.0);
    if (pk.labelMat.map) pk.labelMat.map.dispose();
    pk.labelMat.map = shippingLabelTex(z); pk.labelMat.needsUpdate = true;
    pk.flapL.rotation.z = 0; pk.flapR.rotation.z = 0; pk.tape.visible = true;
    const start = V(3.75, 0.9, -5.0), land = V(3.55, 0, -1.8), rest = V(3.35, 0, -1.3);
    g.scale.setScalar(1); g.rotation.set(0, 0, 0); g.position.copy(start); g.visible = true;
    sfx.whoosh();
    await anim(0.75, (e, k) => {
      g.position.lerpVectors(start, land, k);
      g.position.y = lerp(0.9, 0, k) + Math.sin(Math.PI * k) * 0.9;
      g.rotation.x = -k * Math.PI * 2;
    }, ease.lin);
    g.rotation.x = 0;
    sfx.thud(); L.shake(0.7);
    await anim(0.45, (e, k) => {
      g.position.lerpVectors(land, rest, k);
      g.position.y = Math.sin(Math.PI * k) * 0.2;
      g.rotation.y = -0.4 * k; g.rotation.x = -Math.sin(Math.PI * k) * 0.3;
    }, ease.lin);
    sfx.thud(); L.shake(0.3);
    ui.caption('Delivered with care. (It was thrown. You saw it. It was thrown.)');
    to(L.door.rotation, { y: 0 }, 0.7, ease.in).then(() => sfx.thud());
    await wait(0.6);
    L.setView('unbox');
    await waitTap('pkg');
    sfx.pop(); pk.tape.visible = false;
    to(pk.flapL.rotation, { z: 2.3 }, 0.45, ease.back);
    await to(pk.flapR.rotation, { z: -2.3 }, 0.45, ease.back);
    L.burstPeanuts(g.position.clone().add(V(0, 0.3, 0)));
    sfx.whoosh();
    const s = setSample(z);
    s.position.copy(g.position).y = 0.05;
    s.scale.setScalar(0.6);
    P.burst(12, () => ({ pos: g.position.clone().add(V(rs(0.15), 0.35, rs(0.12))), vel: V(rs(0.3), rnd(0.5, 1.4), rs(0.3)), life: rnd(0.8, 1.4), size: 0.06, size1: 0.02, color: 0xffe9a0, boost: 3, add: true, tex: 'spark' }));
    sfx.sparkle();
    await anim(1.1, (e) => { s.position.y = 0.05 + e * 0.95; s.rotation.y = e * Math.PI * 4; s.scale.setScalar(0.6 + 0.4 * e); }, ease.out);
    s.rotation.y = 0;
    ui.caption(el.intro);
    await wait(2.2);
    anim(0.45, (e) => g.scale.setScalar(Math.max(1 - e, 0.001)), ease.in).then(() => {
      g.visible = false;
      smoke(g.position.clone().add(V(0, 0.2, 0)), 6, 0.4, 0xd8c8a8, 0.5);
      sfx.pop();
    });
  }

  return { run, mix, deliver, placeSample, samplePos, bring, toHome };
}
