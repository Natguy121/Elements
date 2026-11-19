// Shapes and physical properties of every container and loose prop.
// Profiles are [radius, height] pairs in metres, measured on the outside, from the base up.

export const VESSELS = {
  beaker250: { name: 'Beaker, 250 mL', prof: [[0.030, 0], [0.034, 0.004], [0.034, 0.092], [0.0365, 0.096]], mass: 0.105, breakV: 2.7, spout: 0.02 },
  beaker600: { name: 'Beaker, 600 mL', prof: [[0.041, 0], [0.045, 0.005], [0.045, 0.121], [0.048, 0.125]], mass: 0.19, breakV: 2.6, spout: 0.024 },
  flask250: { name: 'Erlenmeyer flask', prof: [[0.040, 0], [0.043, 0.005], [0.041, 0.03], [0.0175, 0.105], [0.0175, 0.134], [0.02, 0.14]], mass: 0.11, breakV: 2.6, spout: 0.014, air: 0.35 },
  cylinder100: { name: 'Measuring cylinder', prof: [[0.03, 0], [0.03, 0.006], [0.0155, 0.01], [0.0155, 0.2], [0.0175, 0.204]], mass: 0.09, breakV: 2.3, spout: 0.01, air: 0.5 },
  crucible: { name: 'Crucible', prof: [[0.015, 0], [0.021, 0.006], [0.027, 0.04], [0.028, 0.042]], mat: 'ceramic', mass: 0.05, breakV: 3.8, spout: 0.02 },
  dish: { name: 'Evaporating dish', prof: [[0.012, 0], [0.034, 0.01], [0.046, 0.028], [0.047, 0.03]], mat: 'ceramic', mass: 0.08, breakV: 3.4, spout: 0.03 },
  jar: { name: 'Jar', prof: [[0.036, 0], [0.039, 0.005], [0.039, 0.095], [0.034, 0.104], [0.034, 0.112]], mass: 0.2, breakV: 3.1, label: 1, spout: 0.03 },
  bottle: { name: 'Bottle', prof: [[0.036, 0], [0.039, 0.005], [0.039, 0.122], [0.014, 0.155], [0.014, 0.185]], mass: 0.26, breakV: 3.1, label: 1, spout: 0.012, air: 0.25 },
  storejar: { name: 'Storage jar', prof: [[0.05, 0], [0.054, 0.006], [0.054, 0.15], [0.05, 0.162], [0.05, 0.172]], mass: 0.38, breakV: 3.3, label: 1, spout: 0.05 },
  bucket: { name: 'Bucket', prof: [[0.095, 0], [0.1, 0.006], [0.125, 0.24], [0.128, 0.245]], mat: 'plastic', mass: 0.45, breakV: 99, spout: 0.08 },
  dropper: { name: 'Dropper bottle', prof: [[0.015, 0], [0.017, 0.003], [0.017, 0.05], [0.0055, 0.062], [0.0055, 0.076]], mass: 0.03, breakV: 3.2, label: 1, spout: 0.0025, air: 0.2 },
};
for (const d of Object.values(VESSELS)) {
  const wall = d.mat === 'ceramic' ? 0.003 : 0.0022;
  d.H = d.prof[d.prof.length - 1][1];
  d.rimR = d.prof[d.prof.length - 1][0] - wall;
  d.maxR = Math.max(...d.prof.map((p) => p[0]));
  // inside surface, used for the liquid mesh and the volume table
  d.inner = d.prof.map(([r, y], i) => [Math.max(0.001, r - wall), i === 0 ? wall + 0.001 : y]);
  d.inner[1][1] = Math.max(d.inner[1][1], wall + 0.002);
  d.rAt = (y) => {
    const p = d.inner;
    if (y <= p[0][1]) return p[0][0];
    for (let i = 1; i < p.length; i++) if (y <= p[i][1]) { const k = (y - p[i - 1][1]) / Math.max(1e-6, p[i][1] - p[i - 1][1]); return p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k; }
    return p[p.length - 1][0];
  };
  // volume (litres) below each of 40 heights, for turning "how much" into "how high"
  d.ys = []; d.vols = [];
  let v = 0;
  const y0 = d.inner[0][1], N = 40;
  for (let i = 0; i <= N; i++) {
    const y = y0 + (d.H - y0) * (i / N);
    if (i > 0) { const ya = d.ys[i - 1], ra = d.rAt(ya), rb = d.rAt(y); v += Math.PI / 3 * (y - ya) * (ra * ra + ra * rb + rb * rb) * 1000; }
    d.ys.push(y); d.vols.push(v);
  }
  d.cap = v;
  d.heightFor = (L) => {
    if (L <= 0) return y0;
    if (L >= d.cap) return d.H;
    let i = 1;
    while (d.vols[i] < L) i++;
    return d.ys[i - 1] + (d.ys[i] - d.ys[i - 1]) * (L - d.vols[i - 1]) / (d.vols[i] - d.vols[i - 1]);
  };
  d.heatC = d.mass * (d.mat === 'ceramic' ? 900 : 840); // J/K
}

export const PROPS = {
  crate: { name: 'Wooden crate', shape: 'box', size: [0.42, 0.36, 0.42], mass: 6, sound: 'wood', look: 'wood' },
  crateS: { name: 'Small crate', shape: 'box', size: [0.28, 0.24, 0.28], mass: 2.5, sound: 'wood', look: 'wood' },
  gascyl: { name: 'Nitrogen cylinder (full)', shape: 'cyl', size: [0.115, 1.3], mass: 58, sound: 'heavy', look: 'cylinder', fact: 'A full size-50 cylinder weighs about as much as a person. This is a two-person lift.' },
  barrel: { name: 'Steel drum (water)', shape: 'cyl', size: [0.29, 0.88], mass: 92, sound: 'heavy', look: 'barrel', fact: 'A 200 litre drum, part full. Nobody carries this alone.' },
  thread: { name: 'Crystal thread', shape: 'box', size: [0.14, 0.012, 0.012], mass: 0.006, sound: 'wood', look: 'thread', fact: 'A cotton thread on a pencil. Lay the pencil across the top of a beaker of hot, saturated solution: as it cools, crystals grow on the thread.' },
  lighter: { name: 'Gas lighter', shape: 'box', size: [0.03, 0.2, 0.03], mass: 0.09, sound: 'metal', look: 'lighter', fact: 'Hold it and use the secondary action to make a flame.' },
};

// Glow of a hot object, by temperature (black-body, simplified). Returns [r, g, b, strength].
export function heatGlow(T) {
  if (T < 480) return null;
  const k = Math.min(1, (T - 480) / 900);
  return [1, 0.08 + 0.85 * k * k, 0.01 + 0.7 * k * k * k, 0.25 + k * 3.2];
}
