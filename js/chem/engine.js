import { SUB, RX, stateAt } from './db.js';

// The reaction engine. Given a mixture and its surroundings it advances every reaction whose
// conditions are met, by real stoichiometry, and reports what happened. It knows nothing about
// graphics or physics. All reactions and constants come from /data.

const DEF_Q10 = 2, REF_T = 25;

// env: { open, air (0..1 access to the room's oxygen), ignition (a flame or spark is touching it),
//        areaCm2 (open surface), stir (multiplier), sealed }
export function stepMixture(mix, dt, env = {}) {
  const events = [];
  const air = env.open === false ? 0 : (env.air ?? 1);
  for (const rx of RX) {
    if (rx.phase === 'gas') continue;
    const cond = rx.conditions || {};
    const latched = rx.sustain && mix.burning[rx.id];
    let lim = Infinity, needsAir = false, ok = true, surf = 1;
    for (const inp of rx.inputs) {
      if (inp.from === 'air') { needsAir = true; continue; }
      const n = mix.n[inp.id] || 0;
      if (n <= 1e-9) { ok = false; break; }
      lim = Math.min(lim, n / inp.mol);
      const s = SUB[inp.id];
      if (s.state === 's') { // judged by how it was added: a melted lump is still a lump
        const sf = mix.surfOf(inp.id);
        if (cond.minSurf && sf < cond.minSurf) { ok = false; break; }
        if (rx.rate.surface) surf = Math.min(surf, sf);
      }
    }
    if (!ok || !(lim > 0)) { if (latched) delete mix.burning[rx.id]; continue; }
    if (needsAir && air <= 0) { if (latched) delete mix.burning[rx.id]; continue; }
    if (rx.requires && !rx.requires.every((r) => (mix.n[r.id] || 0) > (r.minMol || 1e-6))) continue;
    if (cond.maxTemp !== undefined && mix.T > cond.maxTemp) continue;
    if (!latched) {
      if (cond.minTemp !== undefined && mix.T < cond.minTemp) continue;
      if (cond.ignition && !env.ignition) continue;
    }
    let k = rx.rate.k;
    const q10 = rx.rate.q10 ?? DEF_Q10;
    if (q10 !== 1) k *= Math.max(0.02, Math.min(60, Math.pow(q10, (mix.T - (rx.rate.refT ?? REF_T)) / 10)));
    k *= surf * (env.stir || 1);
    if (needsAir) k *= air;
    if (rx.catalysts) {
      for (const c of rx.catalysts) {
        const n = mix.n[c.id] || 0;
        if (n <= 0) continue;
        if (c.perGram) { const per100 = n * SUB[c.id].M / Math.max(mix.grams('water') / 100, 0.05); k *= 1 + c.boost * Math.min(1, per100); }
        else k *= c.boost;
      }
    }
    let extent;
    if (rx.rate.perArea) extent = Math.min(lim, k * (env.areaCm2 || 10) * dt);
    else extent = lim * (1 - Math.exp(-k * dt));
    if (!(extent > 1e-12)) continue;

    for (const inp of rx.inputs) if (inp.from !== 'air') mix.remove(inp.id, inp.mol * extent);
    const emit = {};
    for (const out of rx.outputs) {
      const s = SUB[out.id], mol = out.mol * extent;
      if (stateAt(s, Math.max(mix.T, 20)) === 'g' && !env.sealed) emit[out.id] = (emit[out.id] || 0) + mol;
      else if (rx.sustain && needsAir && s.id === 'water') emit.water = (emit.water || 0) + mol; // flames give steam, not liquid
      else mix.add(out.id, mol, mix.T, s.state === 's' ? (rx.productSurf ?? 1) : undefined);
    }
    const heat = -rx.enthalpy_kJ * 1000 * extent;
    mix.addHeat(heat * (rx.heatFrac ?? 1));
    if (rx.sustain) mix.burning[rx.id] = true;
    events.push({ rx, extent, rate: extent / dt, heat, emit });
  }
  return events;
}

// Boiling: a volatile liquid cannot get hotter than its boiling point. Extra heat turns it to vapour.
export function stepBoil(mix, dt) {
  const emit = {};
  const vol = mix.ids().map((id) => SUB[id]).filter((s) => s.hvap && s.bp !== null && s.state === 'l').sort((a, b) => a.bp - b.bp);
  for (const s of vol) {
    if (mix.T <= s.bp) break;
    const C = mix.heatCap(), excess = C * (mix.T - s.bp);
    const mol = Math.min(mix.n[s.id], excess / (s.hvap * 1000));
    if (mol <= 0) continue;
    mix.remove(s.id, mol);
    mix.T -= (mol * s.hvap * 1000) / C;
    emit[s.id] = mol;
  }
  return emit;
}

// A flammable gas cloud meets a flame. Returns { burnt: mol of fuel, kJ, products } or null.
export function burnGas(n, fuelId) {
  const rx = RX.find((r) => r.phase === 'gas' && r.inputs[0].id === fuelId);
  if (!rx) return null;
  const fuel = n[fuelId] || 0;
  if (fuel <= 0) return null;
  const extent = fuel / rx.inputs[0].mol;
  const products = {};
  for (const o of rx.outputs) products[o.id] = o.mol * extent;
  return { rx, burnt: fuel, kJ: -rx.enthalpy_kJ * extent, products };
}

// Things worth noting about a mixture even when nothing reacts.
export function observe(mix) {
  const out = [];
  const a = mix.analyse();
  const has = (k) => a.layers.some((l) => l.key === k && l.vol > 0.002);
  if (has('aq') && has('org')) out.push('obs_oil_water');
  const waterG = mix.grams('water');
  if (waterG > 5) {
    for (const id in mix.n) {
      const s = SUB[id];
      if (s.state !== 's' || !s.sol || mix.isChunk(id)) continue;
      const d = mix.dissolvedMol(id);
      if (d * s.M > 0.5) out.push('obs_dissolve');
      if (s.sol >= 5 && (mix.n[id] - d) * s.M > 1) out.push('obs_saturated');
    }
    if (mix.n.indicator && a.pH !== null) out.push(a.pH < 5 ? 'obs_acid' : a.pH > 9 ? 'obs_base' : a.pH > 6 && a.pH < 8 ? 'obs_neutral' : null);
    if (mix.n.phph && a.pH !== null && a.pH > 8.6) out.push('obs_phph');
    if (mix.n.cabbage && a.pH !== null && (a.pH < 3 || a.pH > 11)) out.push('obs_cabbage');
    const st = mix.grams('starch');
    if (st > 10 && st / waterG > 1.1 && st / waterG < 2.8) out.push('obs_oobleck');
  }
  if (a.liquid > 0.005 && a.chunks.length) {
    out.push('obs_floats');
    if (has('metal') && a.chunks.some((c) => c.floatOn === 'metal' && c.density > 5)) out.push('obs_mercury_float');
    if (a.chunks.some((c) => c.id === 'gold')) out.push('obs_inert');
  }
  for (const id in mix.n) { const s = SUB[id]; if (s.state === 's' && s.mp !== null && mix.T > s.mp && mix.n[id] * s.M > 0.2) { out.push('obs_molten'); break; } }
  return out.filter(Boolean);
}

export const isOxideOrAsh = (id) => ['mgo', 'al2o3', 'cuo', 'fe2o3', 'fes'].includes(id);
