import * as THREE from 'three';
import { G_STATIC, G_PROP, G_PLAYER, G_HELD } from './world.js';

// The grab. A held object is never locked to the camera: every physics step a spring-damper
// pulls the point you grabbed toward a spot in front of you, with a limit on how hard you can pull.
// Light things follow briskly and swing; heavy things lag, sag and wear you out; anything can be
// knocked loose. Several players pulling the same object simply add their forces.

export const STRENGTH = 250; // newtons one player can apply

export function createGrab(phys, player, camera, hooks) {
  const { CANNON } = phys;
  let h = null; // current hold
  const tq = new THREE.Quaternion(), yawQ = new THREE.Quaternion(), pourQ = new THREE.Quaternion(), bq = new THREE.Quaternion(), qe = new THREE.Quaternion();
  const right = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), fwdV = new THREE.Vector3();
  const p = new CANNON.Vec3(), r = new CANNON.Vec3(), v = new CANNON.Vec3(), F = new CANNON.Vec3(), tau = new CANNON.Vec3(), w = new CANNON.Vec3();

  // Bodies whose collisions with loose objects were switched off. Switching them back on while two
  // things overlap makes the solver fling them apart, so wait until the body is clear.
  const ghosts = new Set();
  function settleGhosts() {
    for (const g of ghosts) {
      if (!g.world) { ghosts.delete(g); continue; }
      if (h && h.item.body === g && g.collisionFilterMask === G_STATIC && h.pour > 0.05) { ghosts.delete(g); continue; }
      g.updateAABB();
      let clear = true;
      for (const o of phys.world.bodies) {
        if (o === g || o.mass === 0 || !(o.collisionFilterGroup & (G_PROP | G_HELD))) continue;
        if (g.aabb.overlaps(o.aabb)) { clear = false; break; }
      }
      if (clear) { g.collisionFilterMask = g.item && g.item.held ? G_STATIC | G_PROP | G_HELD : G_STATIC | G_PROP | G_PLAYER | G_HELD; ghosts.delete(g); }
    }
  }
  function start(item, worldPoint, tool = 'hand') {
    if (h) release();
    const b = item.body;
    b.wakeUp();
    const local = new CANNON.Vec3();
    if (item.kind === 'vessel' || tool === 'tongs') local.set(0, 0, 0); // carry containers by the middle so they stay level
    else b.pointToLocalFrame(new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z), local);
    const dist = tool === 'tongs' ? 0.75 : Math.max(0.8, Math.min(2.2, camera.position.distanceTo(worldPoint)));
    yawQ.setFromAxisAngle(UP, player.yaw);
    const qRel = new THREE.Quaternion();
    if (item.kind === 'vessel') qRel.identity(); // containers right themselves in your hand
    else qRel.copy(yawQ).invert().multiply(bq.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w));
    h = {
      item, local, dist, qRel, tool, pour: 0, user: new THREE.Quaternion(), target: new THREE.Vector3(), tVel: new THREE.Vector3(), prevT: null,
      strain: 0, stuck: 0, placing: null, force: 0, t: 0, x0: worldPoint.x, y0: worldPoint.y, z0: worldPoint.z,
    };
    b.collisionFilterGroup = G_HELD;
    b.collisionFilterMask = G_STATIC | G_PROP | G_HELD;
    b.angularDamping = 0.5;
    item.held = true;
    b.addEventListener('collide', onHit);
    hooks.onGrab && hooks.onGrab(item, tool);
    return h;
  }
  function onHit(e) {
    if (!h || h.t < 0.4) return;
    const sp = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (sp > 5 && e.body.mass > 0.5) { hooks.onKnock && hooks.onKnock(h.item); release(false, true); }
  }
  function release(throwIt = true, knocked = false) {
    if (!h) return null;
    const { item } = h, b = item.body;
    b.removeEventListener('collide', onHit);
    b.angularDamping = 0.12;
    item.held = false;
    if (throwIt && !h.placing) {
      // a flick of the wrist: the faster the hand was moving, the further it goes; mass fights back
      const add = v3.copy(h.tVel).multiplyScalar(0.75 / (1 + b.mass / 3));
      if (add.length() > 7) add.setLength(7);
      b.velocity.x += add.x; b.velocity.y += add.y; b.velocity.z += add.z;
    }
    if (h.placing) { b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); }
    const it = item;
    setTimeout(() => { if (!it.held && !it.dead) { it.body.collisionFilterGroup = G_PROP; ghosts.add(it.body); } }, 350);
    const was = h; h = null;
    player.carryMass = 0; player.strain = 0;
    hooks.onRelease && hooks.onRelease(item, was, knocked);
    return item;
  }

  // called once per rendered frame
  function update(dt, input) {
    settleGhosts();
    if (!h) return;
    const b = h.item.body;
    if (h.item.dead) { h.item.held = false; h = null; player.carryMass = 0; player.strain = 0; return; }
    h.t += dt;
    if (h.tool !== 'tongs') h.dist = Math.max(0.7, Math.min(3, h.dist - input.st.wheel * 0.18));
    yawQ.setFromAxisAngle(UP, player.yaw);
    if (h.placing) {
      h.placing.t += dt;
      const pl = h.placing;
      h.target.set(pl.x, Math.max(pl.y, pl.y0 - pl.t * 0.7), pl.z);
      tq.copy(yawQ);
      const bp = b.position;
      // let go only once it is resting (or clearly cannot get lower), never from a height
      if ((Math.abs(bp.y - pl.y) < 0.012 && b.velocity.length() < 0.2) || (pl.t > 4 && bp.y - pl.y < 0.06) || pl.t > 7) release(false);
      else h.tq = tq.clone();
      return;
    }
    // pouring: right mouse tips the container away from you
    const wantPour = input.st.rmb && h.item.kind === 'vessel';
    // right button tips it quickly until something comes out, then only creeps further, so you can
    // hold a steady stream; let go and it rights itself
    const fl = h.item.flowing || 0;
    let rate = !wantPour ? -1.85 : fl <= 0 ? 1.35 : fl > 0.05 ? 0 : 0.16;
    // get it over the target first, then tip: never start a pour while the bottle is still travelling
    if (wantPour && h.item.kind === 'vessel' && (h.err || 0) > 0.045 && h.pour > 0.12) rate = Math.min(rate, 0);
    h.pour = Math.max(0, Math.min(2.5, h.pour + rate * dt));
    // while pouring, hold the container by its mouth so the mouth stays exactly where you aim
    if (h.item.kind === 'vessel' && h.tool === 'hand') h.local.y = h.item.halfH * Math.min(1, h.pour / 0.45);
    if (input.down('KeyR')) { // rotate the held thing with the mouse
      qe.setFromAxisAngle(UP, input.st.lookX * 0.006); h.user.premultiply(qe);
      right.set(1, 0, 0); qe.setFromAxisAngle(right, input.st.lookY * 0.006); h.user.premultiply(qe);
    }
    v3.copy(player.dir);
    // the hold point stops in front of benches, walls and the floor, so looking down while carrying a
    // bottle does not ram it into the bench
    let dHold = h.dist;
    { const o = player.pos, reachR = Math.min(h.item.pickR || 0.05, 0.3);
      const hit = phys.raycast(o.x, o.y, o.z, o.x + v3.x * (h.dist + reachR), o.y + v3.y * (h.dist + reachR), o.z + v3.z * (h.dist + reachR), G_STATIC);
      if (hit) dHold = Math.max(0.35, Math.min(h.dist, hit.distance - reachR - 0.02)); }
    h.target.copy(player.pos).addScaledVector(v3, dHold);
    { const o = h.target, hit = phys.raycast(o.x, o.y + 0.3, o.z, o.x, o.y - 1, o.z, G_STATIC);
      if (hit) h.target.y = Math.max(h.target.y, hit.hitPointWorld.y + (h.item.halfH || 0.05) + 0.015); }
    // pour where you look: while tipping a container, bring its lip over the thing under the crosshair
    h.aim = null;
    const pouring = h.item.kind === 'vessel' && (h.pour > 0.05 || h.item.flowing > 0) && h.tool === 'hand';
    // mid-pour the container in your hand does not shove loose objects about (it still hits benches and walls)
    if (pouring) b.collisionFilterMask = G_STATIC;
    else if (b.collisionFilterMask === G_STATIC) ghosts.add(b); // turned back on only once it is clear (see below)
    if (pouring) {
      const o = player.pos, far = 2.6;
      const hit = phys.raycast(o.x, o.y, o.z, o.x + v3.x * far, o.y + v3.y * far, o.z + v3.z * far, G_STATIC | G_PROP);
      if (hit && hit.body !== b) {
        const t = hit.body.item;
        const ap = t && t.kind === 'vessel' ? { x: t.base.x + t.up.x * t.def.H, y: t.base.y + t.up.y * t.def.H, z: t.base.z + t.up.z * t.def.H } : hit.hitPointWorld;
        const fx = -Math.cos(player.yaw), fz = Math.sin(player.yaw), rise = 0.11; // the direction it pours: to your left
        const lead = (h.item.exitV || 0.15) * Math.sqrt(2 * rise / 9.81) * Math.max(0, -Math.min(0, h.item.up.y) + 0.6);
        h.aim = true;
        // while it is still mostly upright its base hangs below the mouth, so keep it high until tipped
        const clear = Math.max(0, Math.max(Math.cos(Math.min(h.pour, 1.57)), h.item.up.y)) * (h.item.def.H + 0.02); // lift before righting
        h.target.set(ap.x - fx * lead, ap.y + rise + clear, ap.z - fz * lead);
      }
    }
    // pick-up: lift it clear of its neighbours first, then swing it over to you
    if (h.t < 0.5 && !h.aim) {
      const kx = Math.min(1, Math.max(0, (h.t - 0.12) / 0.3)), lift = 0.18 * Math.min(1, h.t / 0.15);
      h.target.x = h.x0 + (h.target.x - h.x0) * kx; h.target.z = h.z0 + (h.target.z - h.z0) * kx;
      h.target.y = Math.max(h.target.y, h.y0 + lift);
    }
    h.target.y -= h.strain * h.strain * 0.14; // heavy things hang low
    h.target.y = Math.max(h.target.y, 0.04);
    if (h.prevT) { v3.copy(h.target).sub(h.prevT).multiplyScalar(1 / Math.max(dt, 0.001)); if (h.pour > 0.05) v3.set(0, 0, 0); h.tVel.lerp(v3, Math.min(1, dt * 12)); }
    else h.prevT = new THREE.Vector3();
    h.prevT.copy(h.target);
    // tip it to the left, the way you pour from the side: the stream and the receiver stay in view
    fwdV.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    pourQ.setFromAxisAngle(fwdV, -h.pour);
    tq.copy(pourQ).multiply(yawQ).multiply(h.user).multiply(h.qRel);
    h.tq = h.tq || new THREE.Quaternion(); h.tq.copy(tq);

    // tiredness and stuck checks
    player.carryMass = b.mass;
    player.strain += (h.strain - player.strain) * Math.min(1, dt * 6);
    if (h.strain > 0.5) player.stamina = Math.max(0, player.stamina - dt * (h.strain - 0.45) * 0.22);
    b.pointToWorldFrame(h.local, p);
    const err = Math.hypot(h.target.x - p.x, h.target.y - p.y, h.target.z - p.z);
    h.err = err;
    h.stuck = err > 2.4 ? h.stuck + dt : 0;
    if (h.stuck > 0.5) { hooks.onSlip && hooks.onSlip(h.item, 'It slipped out of reach.'); release(false); }
    else if (player.stamina <= 0 && h.strain > 0.5) { hooks.onSlip && hooks.onSlip(h.item, 'Your grip gave out.'); release(false); }
  }

  // called every physics substep
  phys.onPreStep((dt) => {
    if (!h || !h.tq) return;
    const b = h.item.body, m = b.mass;
    b.wakeUp();
    b.pointToWorldFrame(h.local, p);
    p.vsub(b.position, r);
    b.angularVelocity.cross(r, v); v.vadd(b.velocity, v);
    const wn = h.placing ? 9 : 15, kp = m * wn * wn, kd = 2 * m * wn * 0.85;
    // a leash: you can only lead a heavy thing by so much, so it drags behind instead of flying out of your hands
    let ex = h.target.x - p.x, ey = h.target.y - p.y, ez = h.target.z - p.z;
    const el = Math.hypot(ex, ey, ez);
    if (el > 0.9) { const k = 0.9 / el; ex *= k; ey *= k; ez *= k; }
    // spring-damper written as "chase the hand at a speed proportional to the gap", with the chase
    // speed capped: the thing still lags and swings, but lifting a jar off a crowded shelf does not
    // fire it through its neighbours. Throws use the hand's own speed when you let go.
    const vmax = h.placing ? 0.8 : 2.2 + 2.4 / (1 + m / 1.5), ratio = kp / kd; // light things keep up with you, heavy ones drag
    let vx = ex * ratio, vy = ey * ratio, vz = ez * ratio;
    const vl = Math.hypot(vx, vy, vz);
    if (vl > vmax) { const k = vmax / vl; vx *= k; vy *= k; vz *= k; }
    F.set(kd * (vx - v.x), kd * (vy - v.y), kd * (vz - v.z));
    const max = STRENGTH * (h.item.helpers ? 1 + h.item.helpers : 1);
    // holding it up counts against your strength too, but is applied at the centre of mass so a
    // container held by its mouth does not hang like a pendulum and refuse to tip
    const lift = Math.min(m * 9.81, max), budget = Math.sqrt(Math.max(0, max * max - lift * lift)), len = F.length();
    if (len > budget) F.scale(budget / Math.max(len, 1e-6), F);
    // pull at the centre of mass (an off-centre pull on a light, long bottle can spin it at hundreds of
    // rad/s in one step), plus a small capped twist so heavy things grabbed off-centre still swing
    b.force.x += F.x; b.force.y += F.y + lift; b.force.z += F.z;
    if (h.item.kind !== 'vessel') {
      r.cross(F, tau);
      const tcap = 0.3 + m * 0.6, tl = tau.length();
      if (tl > tcap) tau.scale(tcap / tl, tau);
      b.torque.vadd(tau, b.torque);
    }
    const used = Math.hypot(Math.min(len, budget), lift);
    h.strain += (Math.min(1, used / max) - h.strain) * 0.08;
    h.force = used;
    // turn it toward the orientation you are asking for. A hand steers the spin rate rather than
    // pushing an undamped spring: aim for a turn rate proportional to the error (capped), and close the
    // gap quickly on light things and slowly on heavy ones. This cannot wind up and fling a bottle.
    bq.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    qe.copy(h.tq).multiply(bq.invert());
    if (qe.w < 0) { qe.x = -qe.x; qe.y = -qe.y; qe.z = -qe.z; qe.w = -qe.w; }
    const ang = 2 * Math.acos(Math.min(1, qe.w)), s = Math.sqrt(Math.max(1e-12, 1 - qe.w * qe.w));
    const wSpeed = Math.min(ang * 9, 7), kx = s > 1e-6 ? wSpeed / s : 0;
    const follow = Math.min(1, dt * 30 / (1 + m / 8));
    w.copy(b.angularVelocity);
    b.angularVelocity.set(w.x + (qe.x * kx - w.x) * follow, w.y + (qe.y * kx - w.y) * follow, w.z + (qe.z * kx - w.z) * follow);
    // whatever knocks it about, a gripped object never spins or flies faster than a hand allows
    const wl = b.angularVelocity.length(); if (wl > 12) b.angularVelocity.scale(12 / wl, b.angularVelocity);
    const ll = b.velocity.length(); if (ll > 7) b.velocity.scale(7 / ll, b.velocity);
  });

  // X: set it down gently on the bench or floor beneath it. If it would overhang an edge or land on
  // something already standing there, look for a clear spot on the same surface nearby.
  function surfaceAt(x, z, fromY) { const hit = phys.raycast(x, fromY, z, x, fromY - 2.5, z, G_STATIC); return hit ? hit.hitPointWorld.y : null; }
  function place() {
    if (!h || h.placing) return;
    const b = h.item.body, bp = b.position, R = Math.min(0.2, (h.item.pickR || 0.05) * 0.85), from = bp.y + 0.05;
    let top = null;
    for (const [ox, oz] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]]) { const y = surfaceAt(bp.x + ox, bp.z + oz, from); if (y !== null && (top === null || y > top)) top = y; }
    if (top === null) return;
    const ok = (x, z) => {
      for (const [ox, oz] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]]) { const y = surfaceAt(x + ox, z + oz, from); if (y === null || Math.abs(y - top) > 0.02) return false; }
      for (const o of phys.world.bodies) if (o !== b && o.mass > 0 && (o.collisionFilterGroup & G_PROP) && o.position.y > top && o.position.y < top + 0.5 && Math.hypot(o.position.x - x, o.position.z - z) < R + (o.item ? Math.min(o.item.pickR || 0.05, 0.25) * 0.8 : 0.05)) return false;
      return true;
    };
    const tx = player.pos.x - bp.x, tz = player.pos.z - bp.z, tl = Math.hypot(tx, tz) || 1, ux = tx / tl, uz = tz / tl;
    const step = R * 2 + 0.03, dirs = [[0, 0], [ux, uz], [-uz, ux], [uz, -ux], [-ux, -uz]];
    let spot = null;
    for (let k = 0; k <= 3 && !spot; k++) for (const [dx, dz] of dirs) { if (k === 0 && (dx || dz)) continue; if (k > 0 && !dx && !dz) continue; const x = bp.x + dx * step * k, z = bp.z + dz * step * k; if (ok(x, z)) { spot = [x, z]; break; } }
    if (!spot) spot = [bp.x, bp.z];
    h.local.set(0, 0, 0);
    h.placing = { x: spot[0], y: top + (h.item.halfH || 0.05) + 0.004, y0: bp.y, z: spot[1], t: 0 };
    h.pour = 0;
  }

  return { start, release, update, place, get hold() { return h; }, get item() { return h ? h.item : null; } };
}
