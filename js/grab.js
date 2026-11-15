import * as THREE from 'three';

// Loose-object physics and the grab beam. Every prop in the lab is a "body": a sphere-ish
// thing with a velocity that can be picked up, carried, dropped, thrown, dunked and broken.
// This is deliberately simple (spheres against flat surfaces), not a general physics engine.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const FLOATS = { rubber: 1, balloon: 1, paper: 1, wood: 1 };

export function createGrab(L, hooks) {
  const { scene, camera } = L;
  const bodies = [];
  let held = null, holdDist = 1.0;
  const tmp = V(), tmp2 = V(), fwd = V();

  function add(obj, o = {}) {
    const b = {
      id: bodies.length, obj, r: o.r || 0.08, base: o.base || 0, kind: o.kind || 'misc', fragile: !!o.fragile,
      buoy: o.buoy || 0, pinned: !!o.pinned, onGrab: o.onGrab, noSync: !!o.noSync, name: o.name || o.kind || 'thing',
      v: V(), rest: true, kin: false, dead: 0, heat: 0, frozen: false, inWater: false, burnt: false,
      home: obj.position.clone(), homeRot: obj.rotation.clone(), cd: {}, remote: 0, rp: V(), air: 0,
    };
    obj.userData.body = b;
    bodies.push(b);
    return b;
  }
  function remove(b) { const i = bodies.indexOf(b); if (i >= 0) bodies[i] = { dead: 1e9, obj: b.obj, v: V(), cd: {}, gone: true, rest: true, r: 0, id: i }; if (held === b) held = null; }
  const centre = (b, out = tmp) => out.copy(b.obj.position).setY(b.obj.position.y - b.base + b.r);

  // highest surface under (x, z) that is not above `maxY`
  function support(x, z, maxY) {
    let top = 0;
    for (const s of L.surfaces) if (x > s[0] && x < s[1] && z > s[2] && z < s[3] && s[4] <= maxY && s[4] > top) top = s[4];
    return top;
  }
  function inTank(p) { const t = L.tank; return Math.abs(p.x - t.x) < 0.43 && Math.abs(p.z - t.z) < 0.18 && p.y < t.WS + 0.02 && p.y > t.WB - 0.05; }

  function constrain(b, prevY, dt, carried = false) {
    const p = b.obj.position;
    // room
    const lim = (v, a, c) => Math.max(a, Math.min(c, v));
    const nx = lim(p.x, -4.95 + b.r, 4.95 - b.r), nz = lim(p.z, -2.95 + b.r, 3.95 - b.r);
    if (nx !== p.x) { hit(b, Math.abs(b.v.x)); b.v.x *= -0.4; p.x = nx; }
    if (nz !== p.z) { hit(b, Math.abs(b.v.z)); b.v.z *= -0.4; p.z = nz; }
    if (p.y - b.base + b.r * 2 > 3.17) { p.y = 3.17 - b.r * 2 + b.base; if (b.v.y > 0) b.v.y = 0; }
    // solid furniture
    const by = p.y - b.base;
    for (const s of L.surfaces) {
      if (carried || !s[5] || by > s[4] - 0.04) continue;
      const r = b.r * 0.8;
      if (p.x > s[0] - r && p.x < s[1] + r && p.z > s[2] - r && p.z < s[3] + r) {
        const d = [p.x - (s[0] - r), (s[1] + r) - p.x, p.z - (s[2] - r), (s[3] + r) - p.z];
        const i = d.indexOf(Math.min(...d));
        if (i === 0) { p.x = s[0] - r; b.v.x *= -0.35; } else if (i === 1) { p.x = s[1] + r; b.v.x *= -0.35; }
        else if (i === 2) { p.z = s[2] - r; b.v.z *= -0.35; } else { p.z = s[3] + r; b.v.z *= -0.35; }
      }
    }
    // resting surface
    const top = support(p.x, p.z, prevY + 0.03);
    if (p.y - b.base < top) {
      const sp = -b.v.y;
      p.y = top + b.base;
      if (sp > 1.2) hit(b, sp);
      b.v.y = sp > 1.6 ? sp * 0.28 : 0;
      const f = Math.exp(-7 * dt);
      b.v.x *= f; b.v.z *= f;
      return true;
    }
    return false;
  }
  function hit(b, speed) { if (speed > 1) hooks.onImpact(b, speed); }

  function step(dt, t) {
    camera.getWorldDirection(fwd);
    for (const b of bodies) {
      if (b.gone) continue;
      if (b.dead > 0) {
        b.dead -= dt;
        if (b.dead <= 0) { b.obj.position.copy(b.home); b.obj.rotation.copy(b.homeRot); b.obj.scale.setScalar(1); b.obj.visible = true; b.v.set(0, 0, 0); b.rest = true; b.frozen = false; b.heat = 0; hooks.onRespawn(b); }
        continue;
      }
      if (b.kin) continue;
      const p = b.obj.position;
      if (b.remote > 0) { // carried by another player
        b.remote -= dt;
        p.lerp(b.rp, Math.min(1, dt * 12));
        if (b.remote <= 0) b.rest = false;
        continue;
      }
      if (b === held) {
        tmp2.copy(camera.position).addScaledVector(fwd, holdDist + b.r);
        tmp2.y = Math.max(tmp2.y, 0.05 + b.r);
        centre(b);
        b.v.subVectors(tmp2, tmp).multiplyScalar(13);
        if (b.v.length() > 9) b.v.setLength(9);
        const prevY = p.y - b.base;
        p.addScaledVector(b.v, dt);
        constrain(b, prevY + 0.7, dt, true); // carried things ride up onto tables instead of jamming against them
        b.obj.rotation.x *= 0.85; b.obj.rotation.z *= 0.85;
        zones(b);
        continue;
      }
      if (b.rest || b.pinned) continue;
      const wet = inTank(centre(b));
      if (wet && !b.inWater) hooks.onWater(b, Math.abs(b.v.y));
      b.inWater = wet;
      if (wet) {
        const t0 = L.tank;
        if (FLOATS[b.kind]) b.v.y += ((t0.WS - (p.y - b.base + b.r * 0.7)) * 60 - b.v.y * 6) * dt;
        else b.v.y += (-2.2 - b.v.y * 5) * dt;
        const f = Math.exp(-4 * dt); b.v.x *= f; b.v.z *= f;
      } else {
        b.v.y += (-9.8 + b.buoy) * dt;
        if (b.buoy) b.v.multiplyScalar(Math.exp(-1.6 * dt));
      }
      const prevY = p.y - b.base;
      p.addScaledVector(b.v, dt);
      const grounded = constrain(b, prevY, dt);
      // bump into other props
      const sp = b.v.length();
      if (sp > 0.4) {
        centre(b, tmp);
        for (const o of bodies) {
          if (o === b || o.gone || o.dead > 0 || o.kin || o === held) continue;
          centre(o, tmp2);
          const d = tmp.distanceTo(tmp2), min = (b.r + o.r) * 0.85;
          if (d < min && d > 0.001) {
            tmp2.sub(tmp).multiplyScalar(1 / d);
            p.addScaledVector(tmp2, -(min - d));
            if (sp > 2.5) { hit(b, sp); hit(o, sp * 0.8); }
            if (!o.pinned) { o.v.addScaledVector(tmp2, sp * 0.5); o.v.y += sp * 0.15; o.rest = false; }
            b.v.multiplyScalar(0.5);
            break;
          }
        }
      }
      if (!grounded && !wet && !b.buoy) { b.air += dt; b.obj.rotation.x += b.v.z * dt * 2.5; b.obj.rotation.z -= b.v.x * dt * 2.5; }
      else { b.air = 0; b.obj.rotation.x *= 0.8; b.obj.rotation.z *= 0.8; }
      if (wet && FLOATS[b.kind]) { b.obj.rotation.z = Math.sin(t * 1.7 + b.id) * 0.06; }
      else if (grounded && b.v.lengthSq() < 0.003) { b.v.set(0, 0, 0); b.rest = true; b.obj.rotation.x = 0; b.obj.rotation.z = 0; hooks.onSettle && hooks.onSettle(b); }
      if (sp > 0.3) zones(b);
    }
    drawBeam();
  }

  // Has a body wandered into a piece of equipment?
  function zones(b) {
    centre(b, tmp);
    for (const id in L.zones) {
      const zn = L.zones[id];
      if (tmp.distanceTo(zn.p) < zn.r + b.r * 0.5) {
        const now = performance.now();
        if ((b.cd[id] || 0) > now) continue;
        b.cd[id] = now + 2500;
        hooks.onZone(b, id);
      }
    }
  }

  // ----- grab beam: a string of glowing beads from the hand to the object -----
  const beadGeo = new THREE.SphereGeometry(0.012, 8, 6);
  function makeBeam(color = 0xfff2c8) {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 14; i++) g.add(new THREE.Mesh(beadGeo, m));
    g.visible = false;
    scene.add(g);
    return g;
  }
  const a = V(), c = V(), q = V();
  function setBeam(beam, from, to, t) {
    beam.visible = true;
    c.lerpVectors(from, to, 0.5); c.y -= 0.12 + from.distanceTo(to) * 0.08;
    beam.children.forEach((bead, i) => {
      const k = ((i + (t * 2.2) % 1) / beam.children.length);
      a.lerpVectors(from, c, k); q.lerpVectors(c, to, k); bead.position.lerpVectors(a, q, k);
      bead.scale.setScalar(0.6 + k * 1.3);
    });
  }
  const beam = makeBeam();
  const hand = V();
  let clock = 0;
  function drawBeam() {
    clock += 0.016;
    if (!held) { beam.visible = false; return; }
    hand.set(0.22, -0.26, -0.35).applyQuaternion(camera.quaternion).add(camera.position);
    setBeam(beam, hand, centre(held, tmp2), clock);
  }

  // ----- player actions -----
  const ray = new THREE.Raycaster();
  function pick(nx, ny) {
    ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
    let best = null, bd = 3.4;
    for (const b of bodies) {
      if (b.gone || b.dead > 0 || b.kin || b.remote > 0) continue;
      centre(b, tmp);
      const along = tmp2.subVectors(tmp, ray.ray.origin).dot(ray.ray.direction);
      if (along < 0.15 || along > bd) continue;
      const rr = b.r * 1.25 + 0.04;
      if (ray.ray.distanceSqToPoint(tmp) < rr * rr) { bd = along; best = b; }
    }
    return best;
  }
  function grab(b) {
    if (held) release();
    held = b; b.rest = false; b.pinned = false; b.inWater = false;
    if (b.onGrab) { b.onGrab(); b.onGrab = null; }
    holdDist = Math.max(0.75, Math.min(1.5, centre(b).distanceTo(camera.position) - b.r));
    hooks.onGrab(b);
  }
  function release(throwIt = false) {
    if (!held) return null;
    const b = held; held = null;
    b.rest = false;
    if (throwIt) { camera.getWorldDirection(fwd); b.v.copy(fwd).multiplyScalar(7.5); b.v.y += 1.6; }
    else if (b.v.length() > 5) b.v.setLength(5);
    hooks.onRelease(b, throwIt);
    return b;
  }
  // everything floating in the tank gets launched (sodium says hello)
  function kickTank(power) {
    for (const b of bodies) if (!b.gone && b.dead <= 0 && !b.kin && inTank(centre(b))) { b.rest = false; b.inWater = false; b.v.set((Math.random() - 0.5) * 1.5, power, 0.8 + Math.random()); }
  }
  function reset() { for (const b of bodies) { if (b.gone || b.noSync) continue; b.obj.position.copy(b.home); b.obj.rotation.copy(b.homeRot); b.v.set(0, 0, 0); b.rest = true; } }

  return {
    bodies, add, remove, step, pick, grab, release, kickTank, centre, makeBeam, setBeam, reset, inTank,
    get held() { return held; },
  };
}
