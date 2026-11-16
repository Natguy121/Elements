import * as THREE from 'three';
import { SUB, DISC, stateAt } from '../chem/db.js';
import { stepMixture, stepBoil, observe, burnGas } from '../chem/engine.js';
import { play } from '../core/audio.js';
import { G_STATIC } from '../physics/world.js';

// Runs the chemistry 20 times a second on everything that holds matter, moves heat around,
// and turns the engine's dry reports ("0.002 mol reacted, 700 J released") into flames, fizzing,
// fumes, bangs and discoveries.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TICK = 0.05, SIGMA = 5.67e-8;

export function createSim(G) {
  const progress = { rx: {}, sub: {} };
  let acc = 0, obsT = 0;
  const p1 = V(), p2 = V();
  const lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 9, 2); G.scene.add(l); return l; });
  const levels = { fizz: 0, flame: 0, pour: 0 };
  let glare = 0;

  function* holders() {
    for (const it of G.matter.items) if (it.mix) yield it;
    for (const pd of G.matter.puddles) yield pd;
  }
  const reach = (h) => (h.kind === 'vessel' ? h.def.maxR : h.kind === 'puddle' ? Math.min(h.r, 0.08) : h.pickR || 0.02);

  function tick() {
    // fixed heat sources (burner, lighter) plus anything that is on fire right now
    const src = G.sources;
    src.length = 0;
    G.fixtureSources(src);
    for (const h of holders()) if (h.fx && h.fx.flame && h.fx.flame.t > 0) src.push({ pos: G.matter.topOf(h, V()), r: 0.05 + 0.07 * h.fx.flame.size, T: 1100, k: 0.04, flame: true, owner: h });
    levels.fizz *= 0.6; levels.flame *= 0.6;

    for (const h of [...holders()]) {
      const mix = h.mix;
      if (h.dead) continue;
      if (mix.isEmpty()) { if (h.kind === 'lump') G.matter.remove(h); continue; }
      const base = G.matter.posOf(h, p1), top = G.matter.topOf(h, p2), rr = reach(h);
      let ignition = false;
      const C = mix.heatCap();
      for (const s of src) {
        if (s.owner === h) continue;
        const d1 = base.distanceTo(s.pos), d2 = top.distanceTo(s.pos);
        if (Math.min(d1, d2) > s.r + rr) continue;
        if (s.flame) ignition = true;
        mix.T += (s.T - mix.T) * (1 - Math.exp(-s.k * TICK / Math.max(C, 0.05)));
      }
      for (const pl of G.plates) {
        if (pl.T <= 25 || base.x < pl.x0 || base.x > pl.x1 || base.z < pl.z0 || base.z > pl.z1 || Math.abs(base.y - pl.y) > 0.03) continue;
        mix.T += (pl.T - mix.T) * (1 - Math.exp(-pl.k * TICK / Math.max(C, 0.05)));
      }
      const T0 = mix.T;
      const env = { open: true, air: h.air ?? 1, ignition, areaCm2: h.kind === 'vessel' ? Math.PI * h.def.rimR * h.def.rimR * 1e4 : h.kind === 'puddle' ? Math.PI * h.r * h.r * 1e4 : 4 };
      const events = stepMixture(mix, TICK, env);
      const boil = stepBoil(mix, TICK);
      // lose heat to the room: convection always, radiation once it glows
      const C2 = Math.max(mix.heatCap(), 0.05);
      let area, kA;
      if (h.kind === 'vessel') { area = 2 * Math.PI * h.def.maxR * h.def.H; kA = 0.3; }
      else if (h.kind === 'puddle') { area = Math.PI * h.r * h.r; kA = 0.6 + area * 40; }
      else { const vol = h.body.mass / 2500; area = 4.84 * Math.pow(Math.max(vol, 1e-9), 2 / 3); kA = 0.004 + area * 14; }
      mix.T = 20 + (mix.T - 20) * Math.exp(-kA * TICK / C2);
      if (mix.T > 250) { const Tk = mix.T + 273; const dT = 0.8 * SIGMA * area * (Tk ** 4 - 293 ** 4) * TICK / C2; mix.T -= Math.min(dT, (mix.T - 20) * 0.5); }
      if (mix.T > 3300) mix.T = 3300;

      if (events.length || boil.water || boil.ethanol || Math.abs(mix.T - T0) > 0.5) { h.dirty = true; }
      if (events.length) { h.changed = G.time; handle(h, events, top); }
      for (const id in boil) {
        G.gas.puff(top, { [id]: boil[id] }, SUB[id].bp, { vy: 0.4 });
        h.changed = G.time;
        if (id === 'water') {
          G.hooks.discover('obs_boil');
          if (h.kind === 'vessel' && Math.random() < 0.5) bubbles(h, 2, 0.8);
          levels.fizz = Math.max(levels.fizz, 0.25 * G.dist(top));
          if (!mix.n.water && mix.ids().some((i) => SUB[i].state === 's' && SUB[i].sol >= 5)) G.hooks.discover('obs_crystals');
        }
      }
      // fuses on things that are about to go bang
      if (h.fuse) {
        h.fuse.t -= TICK;
        if (h.fuse.t <= 0) { blow(h, h.fuse); h.fuse = null; h.fuseCd = 4; }
      }
      if (h.fuseCd > 0) h.fuseCd -= TICK;
      if (h.fx) { for (const k in h.fx) if (h.fx[k].t !== undefined) h.fx[k].t -= TICK; }
      if (h.lit > 0) h.lit -= TICK;

      if (h.kind === 'lump') {
        const s = SUB[h.sub];
        if (s.look === 'metal' && mix.T > 560) G.hooks.discover('obs_redhot');
        if (!h.held && mix.n[h.sub] && stateAt(s, mix.T) === 'l' && s.state === 's') melt(h);
        else if (h.body.mass < 2e-6) G.matter.remove(h);
      }
    }
    // observations: look at anything that changed recently
    obsT -= TICK;
    if (obsT <= 0) {
      obsT = 0.8;
      for (const h of holders()) {
        if (!h.changed || G.time - h.changed > 4 || h.kind === 'lump' || h.supply) continue;
        if (G.time - h.changed < 1.2) continue;
        for (const id of observe(h.mix)) G.hooks.discover(id, h);
        if (h.kind === 'vessel' && h.mix.ids().length >= 5 && !(h.fx && h.fx.busy && h.fx.busy.t > 0)) G.hooks.discover('mystery', h);
      }
    }
  }

  function melt(h) {
    const b = h.body.position;
    const hit = G.phys.raycast(b.x, b.y, b.z, b.x, b.y - 0.5, b.z, G_STATIC);
    if (!hit) return;
    G.hooks.discover('obs_molten');
    const pd = G.matter.spill(h.mix, hit.hitPointWorld.x, hit.hitPointWorld.y, hit.hitPointWorld.z);
    if (pd) { pd.pieceMol[h.sub] = h.mix.n[h.sub]; pd.mix.surf[h.sub] = 0.6; }
    G.matter.remove(h);
  }

  function handle(h, events, top) {
    h.fx = h.fx || {};
    const liquid = h.an && h.an.liquid > 0.002;
    for (const e of events) {
      const rx = e.rx;
      h.fx.busy = { t: 1.5 };
      // discoveries
      progress.rx[rx.id] = (progress.rx[rx.id] || 0) + e.extent;
      if (progress.rx[rx.id] >= (rx.discoverAt ?? 2e-4)) G.hooks.discover(rx.discovery, h, rx);
      for (const o of rx.outputs) {
        if (!DISC['sub_' + o.id]) continue;
        progress.sub[o.id] = (progress.sub[o.id] || 0) + o.mol * e.extent;
        if (progress.sub[o.id] >= 2e-4) G.hooks.discover('sub_' + o.id, h, rx);
      }
      if (!h.logged) h.logged = {};
      if (!h.logged[rx.id]) { h.logged[rx.id] = true; G.hooks.log(h, rx); }

      let gasLit = false;
      for (const f of rx.effects || []) {
        const strength = Math.min(1, e.rate / (f.min ? f.min * 6 : 0.002));
        if (f.min && e.rate < f.min) continue;
        switch (f.fx) {
          case 'fizz':
            levels.fizz = Math.max(levels.fizz, (0.12 + 0.3 * strength) * f.amount * G.dist(top));
            if (liquid) bubbles(h, Math.ceil(strength * 3 * f.amount), 1);
            break;
          case 'foam':
            if (h.kind === 'vessel') { let gas = 0; for (const id in e.emit) gas += e.emit[id]; h.foam = Math.min(h.def.cap * 1.6, h.foam + gas * 24.5 * 0.22 * f.amount); }
            break;
          case 'skitter': h.skitter = 0.4; break;
          case 'flame': h.fx.flame = { color: f.color, size: f.size * (0.6 + 0.4 * strength) * (h.kind === 'lump' ? Math.min(1.6, 0.5 + h.pickR * 28) : 1), t: 0.25 }; levels.flame = Math.max(levels.flame, 0.3 * f.size * G.dist(top)); break;
          case 'light': h.fx.light = { color: f.color, power: f.power * (0.5 + 0.5 * strength), t: 0.2 }; break;
          case 'glare': h.fx.glare = { power: f.power, t: 0.2 }; break;
          case 'smoke': if (Math.random() < 0.5 * f.amount) G.P.emit({ pos: top.clone(), vel: V((Math.random() - 0.5) * 0.15, 0.35 + Math.random() * 0.4, (Math.random() - 0.5) * 0.15), life: 2 + Math.random() * 1.5, size: 0.05, size1: 0.45, color: f.color, alpha: 0.4, tex: 'smoke', spin: Math.random() - 0.5 }); break;
          case 'sparks': if (Math.random() < 0.6) G.P.emit({ pos: top.clone(), vel: V((Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 1.6), gravity: 6, life: 0.4 + Math.random() * 0.6, size: 0.022, color: f.color, boost: 4, add: true, tex: 'spark' }); break;
          case 'ignite_gas':
            if (h.lit > 0 || Math.random() < f.perSec * TICK * Math.min(1, e.rate / 0.0015)) {
              if (!(h.lit > 0)) { play('whoomp', top, 0.7); }
              h.lit = 0.5; gasLit = true;
              const res = burnGas({ [f.gas]: e.emit[f.gas] || 0 }, f.gas);
              if (res) { h.mix.addHeat(res.kJ * 1000 * 0.1); G.gas.puff(top, res.products, 250, { vy: 0.6 }); G.hooks.discover(res.rx.discovery); }
              h.fx.flame = { color: f.flame, size: 0.7, t: 0.25 }; levels.flame = Math.max(levels.flame, 0.25 * G.dist(top));
              delete e.emit[f.gas];
            }
            break;
          case 'explode': {
            const fuel = rx.inputs[0].id, grams = h.mix.isChunk(fuel) ? Math.min(h.mix.grams(fuel), (h.pieceMol && h.pieceMol[fuel] ? h.pieceMol[fuel] * SUB[fuel].M * 2 : 99)) : 0;
            if (!h.fuse && !(h.fuseCd > 0) && grams > f.chunkOver_g) h.fuse = { t: f.delay[0] + Math.random() * (f.delay[1] - f.delay[0]), rx, f };
            break;
          }
          default: break;
        }
      }
      void gasLit;
      for (const id in e.emit) G.gas.puff(top, { [id]: e.emit[id] }, Math.max(20, Math.min(h.mix.T, 400)));
    }
  }

  // the "large piece of sodium" moment: what is left reacts all at once
  function blow(h, fuse) {
    const { rx, f } = fuse, fuel = rx.inputs[0].id;
    let lim = Infinity;
    for (const i of rx.inputs) if (i.from !== 'air') lim = Math.min(lim, (h.mix.n[i.id] || 0) / i.mol);
    const grams = (h.mix.n[fuel] || 0) * SUB[fuel].M;
    if (!(lim > 0) || grams < 0.4) return;
    let kJ = f.kJ_per_g * grams;
    for (const i of rx.inputs) if (i.from !== 'air') h.mix.remove(i.id, i.mol * lim);
    for (const o of rx.outputs) {
      if (SUB[o.id].state === 'g') { const res = burnGas({ [o.id]: o.mol * lim }, o.id); if (res) kJ += res.kJ * 0.5; }
      else h.mix.add(o.id, o.mol * lim, h.mix.T, 1);
    }
    h.dirty = true; h.changed = G.time;
    const pos = G.matter.topOf(h, V());
    const flame = (rx.effects.find((x) => x.flame) || {}).flame || '#ffb020';
    if (h.kind === 'vessel') {
      if (h.def.mat !== 'ceramic' && kJ > 6) { G.gas.explode(pos, kJ, { color: flame }); if (!h.dead) G.matter.shatter(h); return; }
      const out = h.mix.split(0.35);
      for (let i = 0; i < 8; i++) G.matter.emitParcel(out.split(1 / (8 - i)), pos, V((Math.random() - 0.5) * 2.2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2.2), { src: h });
    }
    G.gas.explode(pos, kJ, { color: flame, keep: h });
  }

  function bubbles(h, n, k) {
    const P = G.P;
    if (h.kind === 'vessel') {
      const d = h.def, hTop = Math.min(d.H, d.heightFor(Math.min(h.an.total, d.cap)));
      for (let i = 0; i < n; i++) {
        const y = d.inner[0][1] + Math.random() * Math.max(0.004, hTop - d.inner[0][1]) * 0.8, a = Math.random() * 6.28, r = Math.random() * d.rAt(y) * 0.75;
        const pos = V(Math.cos(a) * r, y, Math.sin(a) * r).applyQuaternion(h.group.quaternion).add(h.base);
        P.emit({ pos, vel: V(0, 0.12 + Math.random() * 0.1, 0), life: Math.min(0.6, (hTop - y) / 0.16 + 0.08), size: 0.003 + Math.random() * 0.004 * k, tex: 'bubble', alpha: 0.9 });
      }
    } else if (h.kind === 'puddle') {
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = Math.random() * h.r * 0.8; P.emit({ pos: V(h.x + Math.cos(a) * r, h.y + 0.004, h.z + Math.sin(a) * r), vel: V(0, 0.02, 0), life: 0.25, size: 0.004 + Math.random() * 0.006, tex: 'bubble', alpha: 0.9 }); }
    }
  }

  // every rendered frame: flames, their light, and how blinding they are
  function visuals(dt) {
    const P = G.P, cam = G.player.pos, dir = G.player.dir;
    let li = 0; glare = 0;
    for (const h of holders()) {
      const fx = h.fx;
      if (!fx) continue;
      if (fx.flame && fx.flame.t > 0) {
        const top = G.matter.topOf(h, p2), s = fx.flame.size, n = Math.random() < 0.5 + s ? 1 + (s > 0.8 ? 1 : 0) : 0;
        const spread = h.kind === 'vessel' ? h.def.rimR * 0.6 : h.kind === 'puddle' ? Math.min(h.r, 0.1) * 0.7 : 0.012 * s;
        for (let i = 0; i < n; i++) P.emit({ pos: V(top.x + (Math.random() - 0.5) * spread * 2, top.y + 0.01, top.z + (Math.random() - 0.5) * spread * 2), vel: V((Math.random() - 0.5) * 0.12, (0.5 + Math.random() * 0.6) * (0.4 + s * 0.6), (Math.random() - 0.5) * 0.12), life: 0.22 + Math.random() * 0.25, size: 0.07 * s + 0.02, size1: 0.012, color: fx.flame.color, boost: 2.3, add: true, tex: 'flame' });
        if (!fx.light || fx.light.t <= 0) fx.light = { color: fx.flame.color, power: 3 * s, t: 0.1, auto: true };
      }
      if (fx.light && fx.light.t > 0 && li < lights.length) {
        const top = G.matter.topOf(h, p2), l = lights[li++];
        l.position.set(top.x, top.y + 0.06, top.z); l.color.set(fx.light.color); l.intensity = fx.light.power * (0.8 + Math.random() * 0.4);
        if (fx.glare && fx.glare.t > 0) {
          const dx = top.x - cam.x, dy = top.y - cam.y, dz = top.z - cam.z, d = Math.hypot(dx, dy, dz) || 1;
          const facing = Math.max(0, (dx * dir.x + dy * dir.y + dz * dir.z) / d);
          glare = Math.max(glare, fx.glare.power * Math.pow(facing, 8) * Math.min(1, 0.7 / (d * d + 0.15)));
        }
      }
    }
    for (; li < lights.length; li++) lights[li].intensity = 0;
  }

  function update(dt) {
    acc += Math.min(dt, 0.2);
    let n = 0;
    while (acc >= TICK && n++ < 4) { tick(); acc -= TICK; }
    visuals(dt);
  }
  return { update, levels, progress, get glare() { return glare; }, TICK };
}
