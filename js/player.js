import * as THREE from 'three';
import { G_PLAYER, G_STATIC, G_PROP } from './physics/world.js';
import { play } from './core/audio.js';

// First-person body: a rolling sphere for collisions, a camera on top, stamina, health,
// head bob, breathing, lean, crouch, camera sag under load and shake from blasts.

const R = 0.3, EYE = 1.62, EYE_CROUCH = 1.02;

export function createPlayer(phys, camera, settings) {
  const { CANNON } = phys;
  const body = new CANNON.Body({ mass: 75, material: phys.mats.matPlayer, fixedRotation: true, collisionFilterGroup: G_PLAYER, collisionFilterMask: G_STATIC | G_PROP });
  body.addShape(new CANNON.Sphere(R));
  body.position.set(0, R + 0.02, 3.2);
  body.linearDamping = 0;
  body.allowSleep = false;
  phys.world.addBody(body);

  const p = {
    body, yaw: 0, pitch: -0.05, eye: EYE, lean: 0, onGround: true, crouch: false,
    stamina: 1, health: 100, bob: 0, trauma: 0, sag: 0, strain: 0, carryMass: 0, speed: 0, air: 0,
    dead: false, blur: 0, flash: 0, lastHurt: 0, stepT: 0, frozen: false,
    pos: new THREE.Vector3(), dir: new THREE.Vector3(), camVel: new THREE.Vector3(),
  };
  const wish = new THREE.Vector3(), prevCam = new THREE.Vector3(), tmp = new THREE.Vector3();
  let t = 0, shakeSeed = 0;

  p.look = (dx, dy) => {
    const s = 0.0022 * settings.sens;
    p.yaw -= dx * s;
    p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch - dy * s));
  };

  p.update = (dt, input) => {
    t += dt;
    const k = input.keys;
    let f = 0, s = 0;
    if (!p.frozen && !p.dead) {
      f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - input.st.moveZ;
      s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + input.st.moveX;
    }
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    // ground check: short ray under the sphere
    const bp = body.position;
    const hit = phys.raycast(bp.x, bp.y, bp.z, bp.x, bp.y - R - 0.07, bp.z, G_STATIC | G_PROP);
    const wasGround = p.onGround;
    p.onGround = !!hit && body.velocity.y < 2.5;
    if (p.onGround && !wasGround && p.air > 0.25) { play('land', null, Math.min(1, p.air * 1.5)); p.trauma = Math.max(p.trauma, Math.min(0.25, p.air * 0.2)); }
    p.air = p.onGround ? 0 : p.air + dt;

    p.crouch = !p.dead && (k.has('ControlLeft') || k.has('KeyC'));
    const moving = len > 0.1;
    const sprint = !p.crouch && moving && f > 0 && k.has('ShiftLeft') && p.stamina > 0.05;
    const load = 1 / (1 + p.carryMass / 22);
    let speed = (p.crouch ? 1.5 : sprint ? 5.0 : 3.0) * (0.35 + 0.65 * load) * (p.health < 35 ? 0.75 : 1);
    if (sprint) p.stamina = Math.max(0, p.stamina - dt * (0.1 + p.carryMass * 0.012));
    else if (p.strain < 0.55) p.stamina = Math.min(1, p.stamina + dt * (moving ? 0.07 : 0.14));

    const sn = Math.sin(p.yaw), cs = Math.cos(p.yaw);
    wish.set((-sn * f + cs * s) * speed, 0, (-cs * f - sn * s) * speed);
    const acc = p.onGround ? 38 : 7, v = body.velocity;
    const dvx = wish.x - v.x, dvz = wish.z - v.z, dl = Math.hypot(dvx, dvz), step = acc * dt;
    if (dl > 0.0001) { const m = Math.min(1, step / dl); v.x += dvx * m; v.z += dvz * m; }
    if (p.onGround && (k.has('Space')) && !p.dead && !p.frozen && p.jumpCd <= 0) {
      v.y = 4.4 * (0.45 + 0.55 * load);
      p.jumpCd = 0.35; p.stamina = Math.max(0, p.stamina - 0.04);
    }
    p.jumpCd = Math.max(0, (p.jumpCd || 0) - dt);
    p.speed = Math.hypot(v.x, v.z);

    // footsteps + head bob
    if (p.onGround && p.speed > 0.6) {
      p.bob += dt * p.speed * 2.1;
      p.stepT -= dt * p.speed;
      if (p.stepT <= 0) { p.stepT = 1.9; play('step', null, p.crouch ? 0.4 : 0.8 + p.carryMass * 0.02); }
    }
    const targetLean = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') && !input.inspectHeld ? 0 : 0);
    p.lean += ((p.leanInput || 0) - p.lean) * Math.min(1, dt * 9);
    p.eye += ((p.crouch ? EYE_CROUCH : EYE) - p.eye) * Math.min(1, dt * 10);
    p.sag += (p.strain * 0.07 - p.sag) * Math.min(1, dt * 5);
    p.trauma = Math.max(0, p.trauma - dt * 0.9);
    p.blur = Math.max(0, p.blur - dt * 0.25);
    p.flash = Math.max(0, p.flash - dt * 0.5);
    void targetLean;
  };

  p.applyCamera = (dt) => {
    const bp = body.position;
    const bobAmt = settings.bob ? Math.min(1, p.speed / 3) : 0;
    const sn = Math.sin(p.yaw), cs = Math.cos(p.yaw);
    const side = p.lean * 0.38 + Math.sin(p.bob) * 0.018 * bobAmt;
    prevCam.copy(camera.position);
    camera.position.set(
      bp.x + cs * side,
      bp.y - R + p.eye + Math.abs(Math.sin(p.bob)) * -0.035 * bobAmt + Math.sin(t * 1.25) * 0.0035 - Math.abs(p.lean) * 0.05,
      bp.z - sn * side,
    );
    let pitch = p.pitch - p.sag + Math.sin(t * 1.25 + 1) * 0.0025;
    let yaw = p.yaw, roll = -p.lean * 0.16 + Math.sin(p.bob) * 0.006 * bobAmt;
    const shake = settings.shake ? p.trauma * p.trauma : 0;
    if (shake > 0.0005) {
      shakeSeed += dt * 38;
      pitch += Math.sin(shakeSeed * 1.3) * 0.05 * shake; yaw += Math.sin(shakeSeed * 1.7 + 2) * 0.05 * shake; roll += Math.sin(shakeSeed * 2.1 + 4) * 0.05 * shake;
    }
    if (p.strain > 0.75) { const a = (p.strain - 0.75) * 0.02; pitch += Math.sin(t * 31) * a; yaw += Math.sin(t * 27 + 1) * a; }
    camera.rotation.set(pitch, yaw, roll, 'YXZ');
    p.pos.copy(camera.position);
    camera.getWorldDirection(p.dir);
    if (dt > 0) p.camVel.copy(camera.position).sub(prevCam).multiplyScalar(1 / dt);
  };

  p.hurt = (amount, why, now) => {
    if (p.dead || amount <= 0) return;
    p.health = Math.max(0, p.health - amount);
    if (now - p.lastHurt > 0.5) { play('ouch'); p.lastHurt = now; }
    p.onHurt && p.onHurt(amount, why);
    if (p.health <= 0) { p.dead = true; p.onDown && p.onDown(why); }
  };
  p.teleport = (x, y, z) => { body.position.set(x, y, z); body.velocity.set(0, 0, 0); };
  p.feet = () => tmp.set(body.position.x, body.position.y - R, body.position.z);
  return p;
}
