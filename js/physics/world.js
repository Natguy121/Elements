import * as CANNON from 'cannon-es';

// Thin wrapper around cannon-es: one world, fixed small steps, collision groups and helpers.
export const G_STATIC = 1, G_PROP = 2, G_PLAYER = 4, G_HELD = 8;

export function createPhysics() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 14;
  world.defaultContactMaterial.friction = 0.5;
  world.defaultContactMaterial.restitution = 0.05;
  world.defaultContactMaterial.contactEquationStiffness = 5e7;
  world.defaultContactMaterial.contactEquationRelaxation = 4;

  const matPlayer = new CANNON.Material('player');
  const matGround = new CANNON.Material('ground');
  const matGlass = new CANNON.Material('glass');
  const matMetal = new CANNON.Material('metal');
  world.addContactMaterial(new CANNON.ContactMaterial(matPlayer, matGround, { friction: 0, restitution: 0 }));
  for (const m of [matGlass, matMetal]) world.addContactMaterial(new CANNON.ContactMaterial(matPlayer, m, { friction: 0, restitution: 0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matGlass, matGround, { friction: 0.35, restitution: 0.12 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matGlass, matGlass, { friction: 0.25, restitution: 0.15 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matMetal, matGround, { friction: 0.45, restitution: 0.1 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matMetal, matMetal, { friction: 0.35, restitution: 0.15 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matMetal, matGlass, { friction: 0.3, restitution: 0.12 }));

  const statics = [];
  function staticBox(cx, cy, cz, w, h, d, tag) {
    const b = new CANNON.Body({ mass: 0, material: matGround, collisionFilterGroup: G_STATIC, collisionFilterMask: G_PROP | G_PLAYER | G_HELD });
    b.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    b.position.set(cx, cy, cz);
    b.tag = tag || 'static';
    world.addBody(b);
    statics.push(b);
    return b;
  }
  function dynamicBody(shape, mass, pos, material) {
    const b = new CANNON.Body({ mass, material: material || matGround, collisionFilterGroup: G_PROP, collisionFilterMask: G_STATIC | G_PROP | G_PLAYER | G_HELD });
    b.addShape(shape);
    b.position.copy(pos);
    b.linearDamping = 0.02; b.angularDamping = 0.12;
    b.sleepSpeedLimit = 0.12; b.sleepTimeLimit = 0.6;
    world.addBody(b);
    return b;
  }
  const rayRes = new CANNON.RaycastResult();
  const from = new CANNON.Vec3(), to = new CANNON.Vec3();
  // closest hit along a segment; mask chooses what counts
  function raycast(ax, ay, az, bx, by, bz, mask = G_STATIC | G_PROP | G_HELD) {
    from.set(ax, ay, az); to.set(bx, by, bz);
    rayRes.reset();
    world.raycastClosest(from, to, { collisionFilterMask: mask, skipBackfaces: true }, rayRes);
    return rayRes.hasHit ? rayRes : null;
  }
  const pre = [];
  world.addEventListener('preStep', () => { for (const f of pre) f(STEP); });
  const STEP = 1 / 120;
  function step(dt) { world.step(STEP, dt, 5); }
  return { CANNON, world, step, STEP, staticBox, dynamicBody, raycast, onPreStep: (f) => pre.push(f), mats: { matPlayer, matGround, matGlass, matMetal }, statics };
}
