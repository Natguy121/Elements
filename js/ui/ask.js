import { createAssistant } from '../assistant.js';
import { play } from '../core/audio.js';

// The chat window for the offline Lab Assistant (T).
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

export function createAsk(onClose) {
  let A = null;
  const log = $('askLog');
  function say(who, html, extra = '') {
    const el = document.createElement('div');
    el.className = 'msg ' + who;
    el.innerHTML = html + extra;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }
  function chips(qs) { return qs && qs.length ? `<div class="chips">${qs.map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''; }
  function ask(q) {
    q = String(q || '').trim();
    if (!q) return;
    say('me', esc(q));
    const r = A.ask(q);
    say('bot', fmt(r.a), (r.via ? `<span class="via">${esc(r.via)}</span>` : '') + chips(r.related));
    play('note', null, 0.4);
  }
  function open() {
    if (!A) {
      A = createAssistant();
      $('askCount').textContent = A.count.toLocaleString() + ' questions stored · offline · version 5';
      say('bot', 'Hi, I am the Lab Assistant. I work offline and know this game\'s chemistry: ask what two things make, how to make something, where to find a material, or how to use a tool.', chips(A.suggestions));
    }
    $('ask').hidden = false;
    setTimeout(() => $('askInput').focus(), 30);
  }
  function close() { $('ask').hidden = true; $('askInput').blur(); onClose(); }
  $('askForm').onsubmit = (e) => { e.preventDefault(); const v = $('askInput').value; $('askInput').value = ''; ask(v); };
  $('askInput').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); };
  $('askInput').onkeyup = (e) => e.stopPropagation();
  log.onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q); };
  $('askClose').onclick = close;
  return { open, close, get isOpen() { return !$('ask').hidden; }, ask: (q) => { if (!A) open(); ask(q); return log.lastChild.textContent; } };
}
