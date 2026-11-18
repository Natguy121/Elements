import * as THREE from 'three';
import '../vendor/peerjs.min.js';
import { SUB } from './chem/db.js';

// Multiplayer over WebRTC (PeerJS). One player hosts: their game is the real one, and it sends
// everyone else a snapshot of the world about 15 times a second. Guests send their position and
// whatever they are holding. A short room code is the host's PeerJS id.
//
// Items share a network id (it.nid). The host decides what exists; guests ask for anything they
// are missing and drop anything the host no longer has.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREFIX = 'rlab-v1-';
const r3 = (v) => Math.round(v * 1000) / 1000, r4 = (v) => Math.round(v * 10000) / 10000;
const COLORS = [0xffd400, 0x6fc3ff, 0x58e08f, 0xff7a59, 0xc78bff, 0xff5fa2, 0x9be7ff, 0xffb03a];

export function createNet(G, d) {
  const { matter, grab, player, hud, scene } = d;
  let peer = null, role = null, code = '', status = '';
  const conns = new Map(); // host: peer id -> { conn, name, color, pose, hold }
  let hostConn = null, myId = '', myName = 'Chemist ' + (10 + Math.floor(Math.random() * 90));
  const byNid = new Map();
  const fresh = new Set(); // items created since the last tick (sent once they are filled and placed)
  let applying = false;
  const lastHash = new Map();
  let snapT = 0, idsT = 0, poseT = 0;
  const avatars = new Map();

  const setStatus = (s) => { status = s; d.onStatus && d.onStatus(); };
  const opts = () => (window.__peerOpts ? { ...window.__peerOpts } : {});

  // ---------- item bookkeeping ----------
  G.hooks.added = (it) => { byNid.set(it.nid, it); if (!applying && role) fresh.add(it); };
  G.hooks.removed = (it) => {
    if (byNid.get(it.nid) === it) byNid.delete(it.nid);
    fresh.delete(it); lastHash.delete(it.nid);
    if (applying || !role) return;
    if (role === 'host') broadcast({ t: 'gone', nid: it.nid });
    else if (it.netCrushed) send({ t: 'gone', nid: it.nid });
  };
  const hashMix = (m) => { let h = Math.round(m.T * 2); for (const k in m.n) h = (h * 31 + k.length * 7 + Math.round(m.n[k] * 1e5)) | 0; return h; };
  const mixOf = (it) => ({ n: { ...it.mix.n }, surf: { ...it.mix.surf }, T: Math.round(it.mix.T * 10) / 10, b: Object.keys(it.mix.burning) });
  function setMix(it, m) {
    it.mix.n = { ...m.n }; it.mix.surf = { ...(m.surf || {}) }; it.mix.T = m.T;
    it.mix.burning = {}; for (const k of m.b || []) it.mix.burning[k] = true;
    it.dirty = true; lastHash.set(it.nid, hashMix(it.mix));
  }
  const pose = (it) => { const b = it.body; return [r3(b.position.x), r3(b.position.y), r3(b.position.z), r4(b.quaternion.x), r4(b.quaternion.y), r4(b.quaternion.z), r4(b.quaternion.w), r3(b.velocity.x), r3(b.velocity.y), r3(b.velocity.z)]; };
  function setPose(it, p) {
    const b = it.body;
    b.position.set(p[0], p[1], p[2]); b.quaternion.set(p[3], p[4], p[5], p[6]); b.velocity.set(p[7], p[8], p[9]);
    if (Math.abs(p[7]) + Math.abs(p[8]) + Math.abs(p[9]) > 0.01) b.wakeUp(); else { b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); }
  }
  function describe(it) {
    return { nid: it.nid, s: it.spawn, mix: it.mix ? mixOf(it) : null, pm: it.pieceMol, ps: it.pieceShape, matId: it.matId, store: it.store, kitchen: it.kitchen, info: it.info && it.info.id, name: it.name, p: pose(it) };
  }
  function create(desc) {
    if (byNid.has(desc.nid)) return byNid.get(desc.nid);
    const s = desc.s;
    if (!s) return null;
    applying = true;
    let it;
    try {
      if (s.f === 'v') it = matter.makeVessel(s.type, s.o || {});
      else if (s.f === 'l') it = matter.makeLump(s.id, s.mol, { ...(s.o || {}) });
      else it = matter.makeProp(s.type);
    } finally { applying = false; }
    byNid.delete(it.nid);
    it.nid = desc.nid; byNid.set(it.nid, it);
    if (desc.mix && it.mix) setMix(it, desc.mix);
    if (desc.pm) it.pieceMol = { ...desc.pm };
    if (desc.ps) it.pieceShape = { ...desc.ps };
    if (desc.matId) it.matId = desc.matId;
    if (desc.store) it.store = desc.store;
    if (desc.kitchen) it.kitchen = desc.kitchen;
    if (desc.info && SUB[desc.info]) it.info = SUB[desc.info];
    if (desc.name) it.name = desc.name;
    setPose(it, desc.p);
    matter.sync(it);
    return it;
  }
  function drop(nid) { const it = byNid.get(nid); if (!it) return; applying = true; try { if (grab.item === it) grab.release(false); matter.remove(it); } finally { applying = false; } }

  // ---------- fixtures: burners, taps, hot plate and doors ----------
  const doors = () => [d.lab.door, d.lab.annexDoor, ...(d.story.world ? d.story.world.doors : [])];
  const fixState = () => ({ b: d.lab.burners.map((b) => !!b.on), tap: !!G.tap.on, plate: d.lab.plate.set, doors: doors().map((x) => x.open) });
  function applyFix(f) {
    d.lab.burners.forEach((b, i) => { b.on = f.b[i]; b.fl.visible = f.b[i]; });
    G.tap.on = f.tap; d.lab.tap.on = f.tap;
    d.lab.plate.set = f.plate;
    doors().forEach((x, i) => { if (f.doors[i] !== undefined && x.open !== f.doors[i]) x.set(f.doors[i]); });
  }

  // ---------- players you can see ----------
  function nameTag(text, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(11,15,18,0.8)'; g.fillRect(0, 8, 256, 48);
    g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 8, 6, 48);
    g.font = '600 28px IBM Plex Sans, sans-serif'; g.fillStyle = '#e9eeee'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 131, 33);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(0.8, 0.2, 1); sp.renderOrder = 10;
    return sp;
  }
  function avatar(id, name, color) {
    let a = avatars.get(id);
    if (a && a.name === name) return a;
    if (a) scene.remove(a.g);
    const g = new THREE.Group();
    const coat = new THREE.MeshStandardMaterial({ color: 0xe8ecec, roughness: 0.8 }), col = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.85, 6, 12), coat); body.position.y = -0.95; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd9a77e, roughness: 0.7 })); head.position.y = -0.05; head.castShadow = true; g.add(head);
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.06), col); goggles.position.set(0, -0.02, -0.13); g.add(goggles);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.1, 16), col); band.position.y = -0.62; g.add(band);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.45, 4, 8), coat); arm.position.set(0.3, -0.75, -0.15); arm.rotation.x = 1.0; g.add(arm);
    const tag = nameTag(name, color); tag.position.y = 0.32; g.add(tag);
    scene.add(g);
    a = { g, name, arm, target: V(), yaw: 0, seen: G.time };
    avatars.set(id, a);
    return a;
  }
  function showPlayers(list) {
    const keep = new Set();
    for (const p of list) {
      if (p.id === myId) continue;
      keep.add(p.id);
      const a = avatar(p.id, p.name, p.color);
      a.target.set(p.p[0], p.p[1], p.p[2]); a.yaw = p.yaw; a.holding = !!p.hold; a.seen = G.time;
    }
    for (const [id, a] of avatars) if (!keep.has(id)) { scene.remove(a.g); avatars.delete(id); }
  }

  // ---------- sending ----------
  function send(m) { if (hostConn && hostConn.open) hostConn.send(m); }
  function broadcast(m, except) { for (const [id, c] of conns) if (id !== except && c.conn.open && c.ready) c.conn.send(m); }
  const players = () => {
    const list = [{ id: myId, name: myName, color: COLORS[0], p: [r3(player.pos.x), r3(player.pos.y), r3(player.pos.z)], yaw: r3(player.yaw), hold: grab.item ? grab.item.nid : null }];
    for (const [id, c] of conns) if (c.pose && c.ready) list.push({ id, name: c.name, color: c.color, p: c.pose.p, yaw: c.pose.yaw, hold: c.pose.hold });
    return list;
  };
  function welcome(c) {
    c.conn.send({ t: 'welcome', you: c.id, mode: d.mode(), items: d.mode() ? [...matter.items].filter((it) => !it.dead).map(describe) : [], fix: fixState() });
    c.ready = true;
  }

  // ---------- host ----------
  function onHostMessage(c, m) {
    if (m.t === 'hello') { c.name = String(m.name || 'Chemist').slice(0, 20); welcome(c); hud.toast('Multiplayer', c.name + ' joined.'); play(); return; }
    if (m.t === 'pose') {
      c.pose = m;
      if (m.held) {
        const it = byNid.get(m.held.nid);
        if (it && !it.dead) { setPose(it, m.held.p); it.netHeld = G.time + 0.5; if (grab.item === it) grab.release(false); if (m.held.mix && it.mix) setMix(it, m.held.mix); }
      }
      return;
    }
    if (m.t === 'mix') { const it = byNid.get(m.nid); if (it && it.mix) setMix(it, m.mix); return; }
    if (m.t === 'spawn') { const it = create(m.d); if (it) fresh.add(it); return; } // shared with everyone else next tick
    if (m.t === 'gone') { const it = byNid.get(m.nid); if (it) { matter.remove(it); } return; }
    if (m.t === 'need') { for (const nid of m.nids) { const it = byNid.get(nid); if (it && !it.dead) c.conn.send({ t: 'spawn', d: describe(it) }); } return; }
    if (m.t === 'use') { const f = G.fixtures[m.i]; if (f && !(f.off && f.off())) f.use(); return; }
    if (m.t === 'chat') { const text = clean(m.text); if (!text) return; d.onChat && d.onChat(c.name, text, c.color); broadcast({ t: 'chat', from: c.name, color: c.color, text }, c.id); return; }
  }
  function host() {
    if (peer) return;
    role = 'host'; myId = 'host';
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    setStatus('Opening room...');
    peer = new window.Peer(PREFIX + code, opts());
    peer.on('open', () => setStatus('Hosting'));
    peer.on('call', answerCall);
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') { peer.destroy(); peer = null; role = null; host(); return; }
      setStatus('Error: ' + (e.type || e.message));
    });
    peer.on('connection', (conn) => {
      const n = conns.size + 1;
      const c = { id: conn.peer, conn, name: 'Chemist', color: COLORS[n % COLORS.length], ready: false };
      conns.set(conn.peer, c);
      conn.on('data', (m) => onHostMessage(c, m));
      conn.on('close', () => { conns.delete(conn.peer); hud.toast('Multiplayer', c.name + ' left.'); d.onStatus && d.onStatus(); });
      conn.on('error', () => {});
    });
  }
  function hostTick(dt) {
    snapT -= dt; idsT -= dt;
    if (snapT > 0 || !conns.size) { if (!conns.size) { fresh.clear(); if (avatars.size) showPlayers([]); } return; }
    snapT = 1 / 15;
    const full = idsT <= 0;
    for (const it of fresh) if (!it.dead) broadcast({ t: 'spawn', d: describe(it) });
    fresh.clear();
    const items = [], mixes = [], held = {};
    for (const it of matter.items) {
      if (it.dead) continue;
      const b = it.body;
      if (full || b.sleepState !== 2 || it.held || it.netHeld > G.time) items.push([it.nid, ...pose(it)]);
      if (it.mix) { const h = hashMix(it.mix); if (lastHash.get(it.nid) !== h) { lastHash.set(it.nid, h); mixes.push([it.nid, mixOf(it)]); } }
    }
    if (grab.item) held[grab.item.nid] = myName;
    for (const [, c] of conns) if (c.pose && c.pose.hold) held[c.pose.hold] = c.name;
    const snap = { t: 'snap', pl: players(), items, mixes, held, fix: fixState() };
    if (full) { idsT = 2; snap.ids = [...matter.items].filter((it) => !it.dead).map((it) => it.nid); }
    broadcast(snap);
    showPlayers(snap.pl);
  }

  // ---------- guest ----------
  function join(raw) {
    const c = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 4) { setStatus('Type the 5-letter code from the host.'); return; }
    if (peer) leave();
    role = 'guest'; code = c;
    setStatus('Connecting...');
    peer = new window.Peer(opts());
    peer.on('call', answerCall);
    peer.on('open', (id) => {
      myId = id; G.netPrefix = id.slice(0, 6) + '-';
      hostConn = peer.connect(PREFIX + c, { reliable: true });
      hostConn.on('open', () => { setStatus('Connected. Waiting for the host...'); hostConn.send({ t: 'hello', name: myName }); });
      hostConn.on('data', onGuestMessage);
      hostConn.on('close', () => { hud.toast('Multiplayer', 'Disconnected from the host.'); leave(); d.onLeft && d.onLeft(); });
    });
    peer.on('error', (e) => { setStatus(e.type === 'peer-unavailable' ? 'No game with that code. Check it and try again.' : 'Error: ' + (e.type || e.message)); if (e.type === 'peer-unavailable') leave(true); });
  }
  let heldBy = {};
  function onGuestMessage(m) {
    if (window.__netDebug && m.t !== 'snap') window.__netDebug.push(m.t + ' ' + (m.d ? m.d.nid : ''));
    if (m.t === 'welcome' || m.t === 'mode') {
      if (m.you) myId = m.you;
      if (!m.mode) { setStatus('Connected. The host is on the title screen.'); return; }
      applying = true;
      try { d.enterAsGuest(m.mode); } finally { applying = false; }
      byNid.clear(); for (const it of matter.items) byNid.set(it.nid, it);
      for (const desc of m.items) create(desc);
      applyFix(m.fix);
      setStatus('Playing');
      return;
    }
    if (m.t === 'chat') { d.onChat && d.onChat(m.from, clean(m.text), m.color); return; }
    if (!d.mode()) return;
    if (m.t === 'spawn') { try { create(m.d); } catch (e) { console.error('spawn failed', e); } return; }
    if (m.t === 'gone') { drop(m.nid); return; }
    if (m.t === 'snap') {
      const mine = grab.item && grab.item.nid;
      for (const e of m.items) { if (e[0] === mine) continue; const it = byNid.get(e[0]); if (it && !it.dead) setPose(it, e.slice(1)); }
      for (const [nid, mx] of m.mixes) { if (nid === mine) continue; const it = byNid.get(nid); if (it && it.mix) setMix(it, mx); }
      heldBy = m.held || {};
      for (const nid in heldBy) { const it = byNid.get(nid); if (it && nid !== mine) it.netHeld = G.time + 0.4; }
      applyFix(m.fix);
      showPlayers(m.pl);
      if (m.ids) {
        const have = new Set(m.ids), need = m.ids.filter((nid) => !byNid.has(nid));
        if (need.length) send({ t: 'need', nids: need.slice(0, 60) });
        for (const it of [...matter.items]) if (!have.has(it.nid) && it !== grab.item && !(it.born > G.time - 3)) drop(it.nid);
      }
    }
  }
  function guestTick(dt) {
    for (const it of fresh) if (!it.dead) { it.born = G.time; send({ t: 'spawn', d: describe(it) }); }
    fresh.clear();
    poseT -= dt;
    if (poseT > 0) return;
    poseT = 1 / 20;
    const it = grab.item;
    const m = { t: 'pose', p: [r3(player.pos.x), r3(player.pos.y), r3(player.pos.z)], yaw: r3(player.yaw), hold: it ? it.nid : null };
    if (it) { m.held = { nid: it.nid, p: pose(it) }; if (it.mix) { const h = hashMix(it.mix); if (lastHash.get(it.nid) !== h) { lastHash.set(it.nid, h); m.held.mix = mixOf(it); } } }
    send(m);
    // what you are pouring into or scooping from changes on your screen first
    if (G.time - (G.netTouch || -9) < 1 && d.target()) {
      const t = d.target();
      if (t && t.mix && t !== it) { const h = hashMix(t.mix); if (lastHash.get(t.nid) !== h) { lastHash.set(t.nid, h); send({ t: 'mix', nid: t.nid, mix: mixOf(t) }); } }
    }
  }

  // ---------- text chat ----------
  const clean = (t) => String(t || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
  function say(text) {
    text = clean(text);
    if (!text || !role) return false;
    d.onChat && d.onChat(myName + ' (you)', text, COLORS[0]);
    if (role === 'host') broadcast({ t: 'chat', from: myName, color: COLORS[0], text });
    else send({ t: 'chat', text });
    return true;
  }

  // ---------- voice: every player with a microphone on calls every other player ----------
  let mic = null, callT = 0;
  const calls = new Map(), voices = new Map(); // peer id -> outgoing call / incoming audio
  function others() {
    if (role === 'host') return [...conns.keys()];
    if (role === 'guest') return [PREFIX + code, ...[...avatars.keys()].filter((id) => id !== 'host' && id !== myId)];
    return [];
  }
  function answerCall(call) {
    call.answer(); // listen only: they hear us through our own call to them
    call.on('stream', (stream) => {
      let a = voices.get(call.peer);
      if (!a) { a = new Audio(); a.autoplay = true; voices.set(call.peer, a); }
      a.srcObject = stream; a.play().catch(() => {});
    });
    const end = () => { const a = voices.get(call.peer); if (a) { a.srcObject = null; voices.delete(call.peer); } };
    call.on('close', end); call.on('error', end);
  }
  function callAll() {
    if (!mic || !peer) return;
    for (const id of others()) {
      if (calls.has(id)) continue;
      const call = peer.call(id, mic);
      if (!call) continue;
      calls.set(id, call);
      const end = () => calls.delete(id);
      call.on('close', end); call.on('error', end);
    }
  }
  async function setMic(on) {
    if (on && !mic) {
      if (!role) { hud.toast('Voice', 'Join or host a game first.'); return false; }
      try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
      catch (e) { hud.toast('Voice', 'No microphone here (or it was blocked). You can still type: press Enter to chat.'); mic = null; return false; }
      callAll();
      hud.toast('Voice', 'Microphone on. Everyone in the game can hear you. Press V to mute.');
    } else if (!on && mic) {
      for (const t of mic.getTracks()) t.stop();
      mic = null;
      for (const c of calls.values()) try { c.close(); } catch (e) { /* closing anyway */ }
      calls.clear();
      hud.toast('Voice', 'Microphone off.');
    }
    return !!mic;
  }
  // voices are louder when the speaker stands near you
  function voiceUpdate(dt) {
    callT -= dt;
    if (callT <= 0) { callT = 2; callAll(); }
    for (const [pid, a] of voices) {
      const av = avatars.get(pid === PREFIX + code ? 'host' : pid);
      const dist = av ? av.g.position.distanceTo(player.pos) : 5;
      a.volume = Math.max(0.15, Math.min(1, 1.25 - dist / 25));
    }
  }

  // ---------- shared ----------
  function update(dt) {
    if (role) voiceUpdate(dt);
    if (role === 'host' && d.mode()) hostTick(dt);
    else if (role === 'guest' && hostConn && hostConn.open && d.mode()) guestTick(dt);
    for (const [, a] of avatars) {
      a.g.position.lerp(a.target, Math.min(1, dt * 12));
      let dy = a.yaw - a.g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.g.rotation.y += dy * Math.min(1, dt * 12);
      a.arm.rotation.x = a.holding ? 1.3 : 0.15;
      a.g.visible = d.mode() !== null;
    }
  }
  function play() { d.onStatus && d.onStatus(); }
  function modeChanged(mode) {
    if (role !== 'host') return;
    fresh.clear(); lastHash.clear();
    for (const [, c] of conns) if (c.ready) c.conn.send({ t: 'mode', mode, items: mode ? [...matter.items].filter((it) => !it.dead).map(describe) : [], fix: fixState() });
  }
  function leave(keepStatus) {
    setMic(false);
    for (const a of voices.values()) a.srcObject = null;
    voices.clear();
    for (const [, c] of conns) try { c.conn.close(); } catch (e) { /* closing anyway */ }
    conns.clear();
    if (hostConn) try { hostConn.close(); } catch (e) { /* closing anyway */ }
    hostConn = null;
    if (peer) try { peer.destroy(); } catch (e) { /* closing anyway */ }
    peer = null;
    const was = role;
    role = null; code = ''; G.netPrefix = '';
    for (const [, a] of avatars) scene.remove(a.g); avatars.clear();
    fresh.clear(); lastHash.clear();
    if (!keepStatus) setStatus(was ? 'Left the game.' : '');
  }
  // the guest asks the host to flip a switch, and sees the result in the next snapshot
  function useFixture(f) {
    if (role !== 'guest' || f.name === 'Kitchen tap') return false;
    const i = G.fixtures.indexOf(f);
    if (i < 0) return false;
    send({ t: 'use', i });
    return true;
  }
  const otherHolds = (it) => it && it.netHeld > G.time;

  return {
    host, join, leave, update, modeChanged, useFixture, otherHolds, say, setMic,
    get micOn() { return !!mic; },
    get hearing() { return [...voices.values()].filter((a) => a.srcObject && a.srcObject.getAudioTracks().some((t) => t.readyState === 'live')).length; },
    get role() { return role; }, get code() { return code; }, get status() { return status; },
    get count() { return role === 'host' ? conns.size + 1 : role === 'guest' ? avatars.size + 1 : 0; },
    get guest() { return role === 'guest'; },
    setName(n) { myName = String(n || '').trim().slice(0, 20) || myName; },
    get name() { return myName; },
  };
}
