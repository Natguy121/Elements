import * as THREE from 'three';

// ---------- tiny tween engine (driven from the render loop) ----------
const tweens = new Set();
export const ease = {
  lin: (k) => k,
  in: (k) => k * k,
  out: (k) => 1 - (1 - k) * (1 - k),
  io: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  back: (k) => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2),
  bounce: (k) => {
    const n = 7.5625, d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  },
};

export function anim(dur, fn, e = ease.io) {
  return new Promise((res) => tweens.add({ t: 0, dur: Math.max(dur, 0.0001), fn, e, res }));
}
export const wait = (s) => anim(s, () => {});
export function to(obj, props, dur, e) {
  const from = {};
  for (const k in props) from[k] = obj[k];
  return anim(dur, (v) => { for (const k in props) obj[k] = from[k] + (props[k] - from[k]) * v; }, e);
}
// Move along a hop: straight line plus a sine bump of `height`.
export function arc(obj, target, dur, height = 0.3, e = ease.io) {
  const a = obj.position.clone(), b = target.clone();
  return anim(dur, (v) => {
    obj.position.lerpVectors(a, b, v);
    obj.position.y += Math.sin(Math.PI * v) * height;
  }, e);
}
export function updateTweens(dt) {
  for (const tw of [...tweens]) {
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.e(k), k);
    if (k >= 1) { tweens.delete(tw); tw.res(); }
  }
}

// ---------- pooled sprite particles ----------
export class Particles {
  constructor(scene, textures, count = 280) {
    this.tex = textures;
    this.pool = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow, transparent: true, depthWrite: false }));
      s.visible = false;
      s.renderOrder = 5;
      scene.add(s);
      this.pool.push({ s, life: 0, max: 1, v: new THREE.Vector3(), g: 0, drag: 0, s0: 1, s1: 1, a: 1, spin: 0 });
    }
    this.next = 0;
  }
  emit(o) {
    let p = null;
    for (let i = 0; i < this.pool.length; i++) {
      const c = this.pool[(this.next + i) % this.pool.length];
      if (c.life <= 0) { p = c; this.next = (this.next + i + 1) % this.pool.length; break; }
    }
    if (!p) { p = this.pool[this.next]; this.next = (this.next + 1) % this.pool.length; }
    p.life = p.max = o.life || 1;
    p.v.copy(o.vel || ZERO);
    p.g = o.gravity || 0;
    p.drag = o.drag || 0;
    p.s0 = o.size || 0.1;
    p.s1 = o.size1 === undefined ? p.s0 : o.size1;
    p.a = o.alpha === undefined ? 1 : o.alpha;
    p.spin = o.spin || 0;
    const m = p.s.material;
    m.map = this.tex[o.tex || 'glow'];
    m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.color.set(o.color === undefined ? 0xffffff : o.color);
    if (o.boost) m.color.multiplyScalar(o.boost);
    m.opacity = 0;
    m.rotation = Math.random() * 6.28;
    p.s.position.copy(o.pos);
    p.s.scale.setScalar(p.s0);
    p.s.visible = true;
  }
  burst(n, fn) { for (let i = 0; i < n; i++) this.emit(fn(i)); }
  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.v.y -= p.g * dt;
      if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.s.position.addScaledVector(p.v, dt);
      const k = 1 - p.life / p.max;
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * k);
      p.s.material.opacity = p.a * Math.min(1, k * 8) * Math.min(1, (1 - k) * 2.2);
      p.s.material.rotation += p.spin * dt;
    }
  }
}
const ZERO = new THREE.Vector3();

export const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const rs = (a = 1) => (Math.random() * 2 - 1) * a;
export function rv(spread = 1, up = 0) {
  return new THREE.Vector3(rs(spread), rs(spread) + up, rs(spread));
}
