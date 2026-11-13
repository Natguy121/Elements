// All sound is synthesised with WebAudio, so there are no audio files to load.

let ctx = null, master = null, noiseBuf = null, muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.7;
}

function envelope(g, t, attack, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
}

function tone({ type = 'sine', f = 440, f2, dur = 0.2, vol = 0.25, delay = 0, attack = 0.006 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + attack + dur);
  envelope(g, t, attack, vol, dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + attack + dur + 0.05);
}

function noise({ dur = 0.3, vol = 0.3, type = 'lowpass', f = 1000, f2, q = 0.8, delay = 0, attack = 0.005 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + attack + dur);
  envelope(g, t, attack, vol, dur);
  s.connect(fl).connect(g).connect(master);
  s.start(t, Math.random()); s.stop(t + attack + dur + 0.05);
}

export const sfx = {
  click() { tone({ type: 'square', f: 900, f2: 500, dur: 0.05, vol: 0.12 }); },
  tap() { tone({ type: 'sine', f: 520, f2: 760, dur: 0.07, vol: 0.14 }); },
  ding() { tone({ f: 880, dur: 0.35, vol: 0.22 }); tone({ f: 1320, dur: 0.5, vol: 0.2, delay: 0.09 }); },
  fanfare() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
      tone({ type: 'triangle', f, dur: i === 6 ? 0.9 : 0.16, vol: 0.24, delay: i * 0.11 });
      tone({ type: 'square', f: f / 2, dur: 0.12, vol: 0.06, delay: i * 0.11 });
    });
  },
  boom() {
    noise({ dur: 1.3, vol: 0.9, f: 2400, f2: 60, attack: 0.004 });
    tone({ f: 110, f2: 28, dur: 1.0, vol: 0.9, attack: 0.004 });
    noise({ dur: 0.12, vol: 0.5, type: 'highpass', f: 3000 });
  },
  pop() { noise({ dur: 0.07, vol: 0.5, type: 'bandpass', f: 1800, q: 1 }); tone({ f: 400, f2: 90, dur: 0.08, vol: 0.3 }); },
  hiss(d = 1.5, vol = 0.22) { noise({ dur: d, vol, type: 'highpass', f: 4200, attack: 0.08 }); },
  roar(d = 2) { noise({ dur: d, vol: 0.55, type: 'lowpass', f: 500, f2: 900, attack: 0.25 }); noise({ dur: d, vol: 0.15, type: 'bandpass', f: 2500, attack: 0.3 }); },
  buzz(d = 2.5) {
    tone({ type: 'sawtooth', f: 100, dur: d, vol: 0.09, attack: 0.03 });
    tone({ type: 'square', f: 200.5, dur: d, vol: 0.04, attack: 0.03 });
    noise({ dur: d, vol: 0.05, type: 'bandpass', f: 6000, q: 3, attack: 0.03 });
  },
  zap() { noise({ dur: 0.18, vol: 0.4, type: 'bandpass', f: 3500, f2: 800, q: 2 }); tone({ type: 'sawtooth', f: 1400, f2: 90, dur: 0.16, vol: 0.2 }); },
  fizzle() { noise({ dur: 0.35, vol: 0.12, type: 'bandpass', f: 2500, f2: 300, q: 2 }); },
  inflate(d = 1.4) {
    noise({ dur: d, vol: 0.22, type: 'bandpass', f: 500, f2: 1900, q: 1.5, attack: 0.05 });
    tone({ type: 'triangle', f: 240, f2: 620, dur: d, vol: 0.07, attack: 0.05 });
    tone({ type: 'sine', f: 1300, f2: 1750, dur: 0.12, vol: 0.08, delay: d - 0.1 });
  },
  inhale() { noise({ dur: 0.7, vol: 0.25, type: 'bandpass', f: 700, f2: 2600, q: 1.2, attack: 0.3 }); },
  thud() { tone({ f: 130, f2: 40, dur: 0.22, vol: 0.7 }); noise({ dur: 0.1, vol: 0.3, f: 500 }); },
  knock() { [0, 0.16, 0.32].forEach((d) => { tone({ f: 190, f2: 120, dur: 0.07, vol: 0.5, delay: d }); noise({ dur: 0.04, vol: 0.2, f: 900, delay: d }); }); },
  creak() {
    tone({ type: 'sawtooth', f: 240, f2: 420, dur: 0.5, vol: 0.05, attack: 0.1 });
    tone({ type: 'sawtooth', f: 430, f2: 300, dur: 0.5, vol: 0.05, attack: 0.1, delay: 0.45 });
  },
  whoosh() { noise({ dur: 0.55, vol: 0.4, type: 'bandpass', f: 300, f2: 2200, q: 0.9, attack: 0.2 }); },
  splash() { noise({ dur: 0.5, vol: 0.45, type: 'highpass', f: 1400, attack: 0.01 }); noise({ dur: 0.25, vol: 0.3, f: 600 }); },
  bubbles(d = 2.5) {
    const n = Math.floor(d * 11);
    for (let i = 0; i < n; i++) { const f = 300 + Math.random() * 600; tone({ f, f2: f * 1.9, dur: 0.06, vol: 0.12, delay: (i / n) * d + Math.random() * 0.05 }); }
  },
  // Gibberish speech. pitch 1 = normal voice, 2.3 = helium, 0.7 = villain.
  voice(pitch = 1, syllables = 9) {
    if (!ctx) return;
    for (let i = 0; i < syllables; i++) {
      const t = ctx.currentTime + i * 0.13 + (i % 3 === 2 ? 0.05 : 0);
      const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth';
      const base = 150 * pitch * (0.85 + Math.random() * 0.45);
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * (0.9 + Math.random() * 0.3), t + 0.1);
      fl.type = 'bandpass'; fl.Q.value = 3.5;
      fl.frequency.setValueAtTime((600 + Math.random() * 900) * Math.sqrt(pitch), t);
      envelope(g, t, 0.015, 0.4, 0.09);
      o.connect(fl).connect(g).connect(master);
      o.start(t); o.stop(t + 0.16);
    }
  },
  slurp() { noise({ dur: 0.3, vol: 0.3, type: 'bandpass', f: 500, f2: 2400, q: 4, attack: 0.1 }); tone({ f: 300, f2: 700, dur: 0.25, vol: 0.1 }); },
  trombone() {
    [311, 293, 277, 220].forEach((f, i) => tone({ type: 'sawtooth', f, f2: i === 3 ? 196 : f * 0.985, dur: i === 3 ? 0.7 : 0.26, vol: 0.1, delay: i * 0.32, attack: 0.04 }));
  },
  cricket() { for (let i = 0; i < 6; i++) tone({ type: 'sine', f: 4300, dur: 0.035, vol: 0.07, delay: 0.3 + (i % 3) * 0.07 + Math.floor(i / 3) * 0.55 }); },
  scratch() { noise({ dur: 0.35, vol: 0.4, type: 'bandpass', f: 3000, f2: 300, q: 6 }); },
  stink() { tone({ type: 'sawtooth', f: 95, f2: 60, dur: 0.5, vol: 0.2, attack: 0.03 }); tone({ type: 'square', f: 70, f2: 48, dur: 0.35, vol: 0.1, delay: 0.12 }); },
  alarm() { for (let i = 0; i < 4; i++) tone({ type: 'square', f: 880, dur: 0.14, vol: 0.09, delay: i * 0.3 }); },
  squeak() { tone({ type: 'sine', f: 1500, f2: 2300, dur: 0.09, vol: 0.2 }); tone({ type: 'sine', f: 2300, f2: 1400, dur: 0.12, vol: 0.2, delay: 0.1 }); },
  sparkle() { [1568, 2093, 2637].forEach((f, i) => tone({ f, dur: 0.25, vol: 0.1, delay: i * 0.06 })); },
};
