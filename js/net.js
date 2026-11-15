// Multiplayer over the hosting page's live "room" (everyone who has the game open right now).
// Outside a host that provides one, this resolves to null and the game is single-player.
// Everything received is untrusted input from another player: numbers only, clamped.

const num = (v, lo, hi, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

export async function createNet(on) {
  let room = null;
  try { room = await (window.claude && window.claude.use ? window.claude.use('room') : null); } catch (e) { room = null; }
  if (!room) return null;
  const fail = () => {};
  room.onPeers((ch) => {
    const list = [];
    for (const p of ch.peers) {
      if (p.sameTab || p.kind !== 'viewer') continue;
      const s = p.presence || {};
      if (!s.in) continue;
      list.push({
        id: p.peer, x: num(s.x, -5, 5), z: num(s.z, -3, 4), yaw: num(s.yaw, -1e4, 1e4), pitch: num(s.pitch, -1.3, 1.3),
        hold: Number.isInteger(s.h) ? s.h : -1, hx: num(s.hx, -5, 5), hy: num(s.hy, 0, 3.2), hz: num(s.hz, -3, 4), hue: num(s.c, 0, 1, 0.12),
      });
    }
    on.peers(list);
  }, fail);
  room.on('obj', (m) => {
    if (m.sameTab || !m.data || typeof m.data !== 'object') return;
    const d = m.data;
    if (!Number.isInteger(d.id) || !Array.isArray(d.p) || !Array.isArray(d.v)) return;
    on.obj(d.id, [num(d.p[0], -5, 5), num(d.p[1], 0, 3.2), num(d.p[2], -3, 4)], [num(d.v[0], -12, 12), num(d.v[1], -12, 12), num(d.v[2], -12, 12)]);
  }, fail);
  room.on('fx', (m) => {
    if (m.sameTab || !m.data || typeof m.data !== 'object') return;
    on.fx(String(m.data.st || '').slice(0, 12), num(m.data.z, 1, 118, 1) | 0);
  }, fail);
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    presence(s) { room.presence(s).catch(fail); },
    leave() { room.presence({ in: 0 }).catch(fail); },
    obj(id, p, v) { room.emit('obj', { id, p: [r2(p.x), r2(p.y), r2(p.z)], v: [r2(v.x), r2(v.y), r2(v.z)] }).catch(fail); },
    fx(st, z) { room.emit('fx', { st, z }).catch(fail); },
    count: () => room.peers().filter((p) => !p.sameTab && p.presence && p.presence.in).length,
  };
}
