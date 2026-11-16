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
  const right = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3();
  const p = new CANNON.Vec3(), r = new CANNON.Vec3(), v = new CANNON.Vec3(), F = new CANNON.Vec3(), tau = new CANNON.Vec3(), w = new CANNON.Vec3();

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
      strain: 0, stuck: 0, placing: null, force: 0, t: 0,
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
    setTimeout(() => { if (!it.held && !it.dead) { it.body.collisionFilterGroup = G_PROP; it.body.collisionFilterMask = G_STATIC | G_PROP | G_PLAYER | G_HELD; } }, 350);
    const was = h; h = null;
    player.carryMass = 0; player.strain = 0;
    hooks.onRelease && hooks.onRelease(item, was, knocked);
    return item;
  }

  // called once per rendered frame
  function update(dt, input) {
    if (!h) return;
    const b = h.item.body;
    if (h.item.dead) { h.item.held = false; h = null; player.carryMass = 0; player.strain = 0; return; }
    h.t += dt;
    if (h.tool !== 'tongs') h.dist = Math.max(0.7, Math.min(3, h.dist - input.st.wheel * 0.18));
    yawQ.setFromAxisAngle(UP, player.yaw);
    if (h.placing) {
      h.placing.t += dt;
      const pl = h.placing;
      h.target.set(pl.x, pl.y + Math.max(0, 0.25 - pl.t * 0.5), pl.z);
      tq.copy(yawQ);
      const bp = b.position;
      if ((Math.abs(bp.y - pl.y) < 0.012 && b.velocity.length() < 0.2) || pl.t > 1.6) release(false);
      else h.tq = tq.clone();
      return;
    }
    // pouring: right mouse tips the container away from you
    const wantPour = input.st.rmb && h.item.kind === 'vessel';
    h.pour += ((wantPour ? 1 : -1.6) * 1.15) * dt;
    h.pour = Math.max(0, Math.min(2.5, h.pour));
    // while pouring, hold the container by its mouth so the mouth stays exactly where you aim
    if (h.item.kind === 'vessel' && h.tool === 'hand') h.local.y = h.item.halfH * Math.min(1, h.pour / 0.45);
    if (input.down('KeyR')) { // rotate the held thing with the mouse
      qe.setFromAxisAngle(UP, input.st.lookX * 0.006); h.user.premultiply(qe);
      right.set(1, 0, 0); qe.setFromAxisAngle(right, input.st.lookY * 0.006); h.user.premultiply(qe);
    }
    v3.copy(player.dir);
    h.target.copy(player.pos).addScaledVector(v3, h.dist);
    h.target.y -= h.strain * h.strain * 0.14; // heavy things hang low
    h.target.y = Math.max(h.target.y, 0.04);
    if (h.prevT) { v3.copy(h.target).sub(h.prevT).multiplyScalar(1 / Math.max(dt, 0.001)); h.tVel.lerp(v3, Math.min(1, dt * 12)); }
    else h.prevT = new THREE.Vector3();
    h.prevT.copy(h.target);
    right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    pourQ.setFromAxisAngle(right, -h.pour);
    tq.copy(pourQ).multiply(yawQ).multiply(h.user).multiply(h.qRel);
    h.tq = h.tq || new THREE.Quaternion(); h.tq.copy(tq);

    // tiredness and stuck checks
    player.carryMass = b.mass;
    player.strain += (h.strain - player.strain) * Math.min(1, dt * 6);
    if (h.strain > 0.5) player.stamina = Math.max(0, player.stamina - dt * (h.strain - 0.45) * 0.22);
    b.pointToWorldFrame(h.local, p);
    const err = Math.hypot(h.target.x - p.x, h.target.y - p.y, h.target.z - p.z);
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
    F.set(kp * ex - kd * v.x, kp * ey - kd * v.y + m * 9.81, kp * ez - kd * v.z);
    const max = STRENGTH * (h.item.helpers ? 1 + h.item.helpers : 1), len = F.length();
    if (len > max) F.scale(max / len, F);
    b.applyForce(F, r);
    h.strain += (Math.min(1, len / max) - h.strain) * 0.08;
    h.force = Math.min(len, max);
    // turn it toward the orientation you are asking for
    bq.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    qe.copy(h.tq).multiply(bq.invert());
    if (qe.w < 0) { qe.x = -qe.x; qe.y = -qe.y; qe.z = -qe.z; qe.w = -qe.w; }
    const ang = 2 * Math.acos(Math.min(1, qe.w)), s = Math.sqrt(Math.max(1e-9, 1 - qe.w * qe.w));
    const I = Math.max(b.inertia.x, b.inertia.y, b.inertia.z, 1e-5), wo = 16;
    const k1 = I * wo * wo * ang / s, k2 = 2 * I * wo;
    w.copy(b.angularVelocity);
    tau.set(qe.x * k1 - w.x * k2, qe.y * k1 - w.y * k2, qe.z * k1 - w.z * k2);
    const tmax = max * 0.3, tl = tau.length();
    if (tl > tmax) tau.scale(tmax / tl, tau);
    b.torque.vadd(tau, b.torque);
  });

  // X: lower the thing straight down onto whatever is under it and let go without a bump
  function place() {
    if (!h || h.placing) return;
    const b = h.item.body, bp = b.position;
    const hit = phys.raycast(bp.x, bp.y, bp.z, bp.x, bp.y - 2.5, bp.z, G_STATIC | G_PROP);
    if (!hit) return;
    h.local.set(0, 0, 0);
    h.placing = { x: bp.x, y: hit.hitPointWorld.y + (h.item.halfH || 0.05) + 0.004, z: bp.z, t: 0 };
    h.pour = 0;
  }

  return { start, release, update, place, get hold() { return h; }, get item() { return h ? h.item : null; } };
}
