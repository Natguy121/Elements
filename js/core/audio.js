// All sound is synthesised with WebAudio: no audio files.
// One-shots take a world position and fade with distance; loops (pouring, fizzing, flames) are
// noise beds whose volume the game sets every frame.

let ctx = null, master = null, lowpass = null, noiseBuf = null, volume = 0.8;
const listener = { x: 0, y: 1.6, z: 0 };
const loops = {};

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = volume;
    lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 20000;
    const comp = ctx.createDynamicsCompressor();
    master.connect(lowpass).connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const [name, o] of Object.entries(LOOPS)) {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf; src.loop = true; f.type = o.type; f.frequency.value = o.f; f.Q.value = o.q || 0.7; g.gain.value = 0;
      src.connect(f).connect(g).connect(master); src.start(0, Math.random());
      loops[name] = { g, f, base: o.f };
    }
  } catch (e) { ctx = null; }
}
const LOOPS = {
  pour: { type: 'bandpass', f: 1400, q: 0.8 }, fizz: { type: 'highpass', f: 5200 }, flame: { type: 'lowpass', f: 420 },
  burner: { type: 'bandpass', f: 900, q: 0.5 }, tap: { type: 'highpass', f: 2600 }, hum: { type: 'lowpass', f: 110 },
};
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }
export function setListener(p) { listener.x = p.x; listener.y = p.y; listener.z = p.z; }
// After a loud blast everything goes dull for a few seconds.
export function muffle(sec = 3) {
  if (!ctx) return;
  const t = ctx.currentTime;
  lowpass.frequency.cancelScheduledValues(t);
  lowpass.frequency.setValueAtTime(380, t);
  lowpass.frequency.exponentialRampToValueAtTime(20000, t + sec);
}
export function loopVol(name, vol, pitch = 1) {
  const l = loops[name];
  if (!l) return;
  l.g.gain.setTargetAtTime(Math.max(0, Math.min(0.5, vol)), ctx.currentTime, 0.06);
  l.f.frequency.setTargetAtTime(l.base * pitch, ctx.currentTime, 0.1);
}
function att(pos) {
  if (!pos) return 1;
  const d = Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z);
  return 1 / (1 + (d / 2.5) * (d / 2.5));
}
export const distGain = att;
function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone({ type = 'sine', f = 440, f2, dur = 0.2, vol = 0.25, delay = 0, attack = 0.005 }, k = 1) {
  if (!ctx || vol * k < 0.002) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + attack + dur);
  env(g, t, attack, vol * k, dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + attack + dur + 0.05);
}
function noise({ dur = 0.3, vol = 0.3, type = 'lowpass', f = 1000, f2, q = 0.8, delay = 0, attack = 0.005 }, k = 1) {
  if (!ctx || vol * k < 0.002) return;
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + attack + dur);
  env(g, t, attack, vol * k, dur);
  s.connect(fl).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + attack + dur + 0.05);
}
const S = {
  click: (k) => tone({ type: 'square', f: 900, f2: 500, dur: 0.05, vol: 0.1 }, k),
  ui: (k) => tone({ f: 620, f2: 880, dur: 0.07, vol: 0.12 }, k),
  grab: (k) => { noise({ dur: 0.06, vol: 0.12, type: 'bandpass', f: 900 }, k); },
  drop: (k) => noise({ dur: 0.05, vol: 0.08, type: 'bandpass', f: 500 }, k),
  ding: (k) => { tone({ f: 880, dur: 0.35, vol: 0.2 }, k); tone({ f: 1320, dur: 0.5, vol: 0.18, delay: 0.09 }, k); },
  discovery: (k) => { [523, 659, 784, 1047, 1319].forEach((f, i) => { tone({ type: 'triangle', f, dur: i === 4 ? 1.1 : 0.16, vol: 0.2, delay: i * 0.1 }, k); tone({ f: f * 2, dur: 0.3, vol: 0.05, delay: i * 0.1 }, k); }); },
  note: (k) => { tone({ f: 990, dur: 0.12, vol: 0.1 }, k); tone({ f: 1320, dur: 0.2, vol: 0.08, delay: 0.07 }, k); },
  thud: (k) => { tone({ f: 120, f2: 45, dur: 0.16, vol: 0.5 }, k); noise({ dur: 0.07, vol: 0.2, f: 500 }, k); },
  wood: (k) => { tone({ f: 210, f2: 120, dur: 0.08, vol: 0.35 }, k); noise({ dur: 0.05, vol: 0.2, type: 'bandpass', f: 1200 }, k); },
  metal: (k) => { [520, 1310, 2140, 3350].forEach((f, i) => tone({ f, f2: f * 0.995, dur: 0.5 - i * 0.08, vol: 0.12 - i * 0.02 }, k)); noise({ dur: 0.04, vol: 0.25, type: 'highpass', f: 3000 }, k); },
  heavy: (k) => { tone({ f: 70, f2: 32, dur: 0.4, vol: 0.8 }, k); [310, 790].forEach((f) => tone({ f, dur: 0.6, vol: 0.08 }, k)); noise({ dur: 0.12, vol: 0.35, f: 400 }, k); },
  clink: (k) => { tone({ f: 2600, dur: 0.09, vol: 0.12 }, k); tone({ f: 3900, dur: 0.06, vol: 0.06, delay: 0.01 }, k); },
  shatter: (k) => { noise({ dur: 0.4, vol: 0.5, type: 'highpass', f: 5000 }, k); [3100, 4200, 5300, 6700, 7900].forEach((f, i) => tone({ f, f2: f * 0.96, dur: 0.16 + i * 0.05, vol: 0.08, delay: i * 0.02 }, k)); },
  splash: (k) => { noise({ dur: 0.3, vol: 0.3, type: 'highpass', f: 1600, attack: 0.01 }, k); noise({ dur: 0.15, vol: 0.2, f: 700 }, k); },
  plop: (k) => { tone({ f: 300, f2: 700, dur: 0.07, vol: 0.2 }, k); noise({ dur: 0.1, vol: 0.12, type: 'highpass', f: 2000 }, k); },
  drip: (k) => tone({ f: 900, f2: 1700, dur: 0.04, vol: 0.08 }, k),
  pop: (k) => { noise({ dur: 0.05, vol: 0.5, type: 'bandpass', f: 1800, q: 1 }, k); tone({ f: 900, f2: 200, dur: 0.07, vol: 0.35 }, k); },
  bang: (k) => { noise({ dur: 0.5, vol: 0.9, f: 3000, f2: 120, attack: 0.002 }, k); tone({ f: 160, f2: 40, dur: 0.4, vol: 0.8, attack: 0.002 }, k); },
  boom: (k) => { noise({ dur: 1.6, vol: 1.0, f: 2600, f2: 50, attack: 0.003 }, k); tone({ f: 95, f2: 24, dur: 1.3, vol: 1.0, attack: 0.003 }, k); noise({ dur: 0.12, vol: 0.6, type: 'highpass', f: 3000 }, k); noise({ dur: 2.5, vol: 0.25, f: 180, delay: 0.3, attack: 0.4 }, k); },
  whoomp: (k) => { noise({ dur: 0.5, vol: 0.5, f: 300, f2: 900, attack: 0.08 }, k); tone({ f: 70, f2: 110, dur: 0.35, vol: 0.3, attack: 0.05 }, k); },
  spark: (k) => { noise({ dur: 0.03, vol: 0.3, type: 'highpass', f: 4000 }, k); tone({ type: 'square', f: 2400, dur: 0.02, vol: 0.08 }, k); },
  hiss: (k) => noise({ dur: 0.7, vol: 0.2, type: 'highpass', f: 4200, attack: 0.05 }, k),
  ouch: (k) => { tone({ type: 'sawtooth', f: 240, f2: 150, dur: 0.18, vol: 0.14, attack: 0.02 }, k); },
  cough: (k) => { [0, 0.22].forEach((d) => noise({ dur: 0.12, vol: 0.3, type: 'bandpass', f: 700, q: 1.5, delay: d, attack: 0.02 }, k)); },
  heal: (k) => { tone({ f: 660, f2: 990, dur: 0.4, vol: 0.08, attack: 0.1 }, k); },
  step: (k) => noise({ dur: 0.07, vol: 0.09, type: 'bandpass', f: 320 + Math.random() * 160, q: 1.2 }, k),
  land: (k) => { noise({ dur: 0.12, vol: 0.22, f: 380 }, k); tone({ f: 90, f2: 50, dur: 0.1, vol: 0.2 }, k); },
  swish: (k) => noise({ dur: 0.25, vol: 0.14, type: 'bandpass', f: 500, f2: 1800, q: 0.9, attack: 0.1 }, k),
  beep: (k) => tone({ type: 'square', f: 1760, dur: 0.06, vol: 0.06 }, k),
  chip: (k) => { tone({ type: 'triangle', f: 1900, f2: 1500, dur: 0.07, vol: 0.22 }, k); noise({ dur: 0.09, vol: 0.35, type: 'bandpass', f: 2600, q: 1.2 }, k); tone({ f: 140, f2: 70, dur: 0.08, vol: 0.25 }, k); },
  scoop: (k) => noise({ dur: 0.12, vol: 0.12, type: 'bandpass', f: 2400, q: 2 }, k),
  ext: (k) => noise({ dur: 0.5, vol: 0.4, type: 'highpass', f: 2200, attack: 0.03 }, k),
};
// play('shatter', position, loudness 0..1+)
export function play(name, pos, vol = 1) { const fn = S[name]; if (fn && ctx) fn(att(pos) * vol); }
