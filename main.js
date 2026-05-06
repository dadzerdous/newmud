// ════════════════════════════════════════
// main.js — Entry point
// ════════════════════════════════════════

import { connect, sendText } from './client.js';
import { showAuth }          from './auth.js';
import { closeCtx, openHandCtx } from './render.js';

// ── ITEMS ─────────────────────────────────────────────────
fetch('items.json')
  .then(r => r.json())
  .then(d => { window.worldItems = d; })
  .catch(() => { window.worldItems = {}; });

// ── WELCOME ───────────────────────────────────────────────
document.getElementById('btn-new').addEventListener('click',   () => showAuth('create'));
document.getElementById('btn-login').addEventListener('click', () => showAuth('login'));

// ── CHAT ──────────────────────────────────────────────────
const chatIn   = document.getElementById('chat-in');
const chatSend = document.getElementById('chat-send');
const chatMode = document.getElementById('chat-mode');

function doSend() {
  const text = chatIn.value.trim();
  if (!text) return;
  const mode = chatMode.value;
  sendText(mode === 'emote' ? `emote ${text}` : `${mode} ${text}`);
  chatIn.value = '';
}

chatSend.addEventListener('click', doSend);
chatIn.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });

// ── DIRECTION BUTTONS — all four the same ─────────────────
document.querySelectorAll('.dir-btn').forEach(el => {
  el.addEventListener('click', () => {
    if (el.classList.contains('dim')) return;
    const dir = el.dataset.dir;
    if (dir) sendText(dir);
  });
});

// ── KEYBOARD ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (document.activeElement === chatIn) return;
  const dirs = { ArrowUp:'north', ArrowDown:'south', ArrowLeft:'west', ArrowRight:'east' };
  if (dirs[e.key]) { e.preventDefault(); sendText(dirs[e.key]); }
});

// ── BOTTOM BAR ────────────────────────────────────────────
document.getElementById('btn-bag').addEventListener('click',  () => sendText('inv'));
document.getElementById('btn-quit').addEventListener('click', () => {
  localStorage.removeItem('mg_token');
  sendText('quit');
});

document.getElementById('hand-l').addEventListener('click', () => {
  const el    = document.getElementById('hand-l');
  const held  = el.dataset.held;
  const other = document.getElementById('hand-r').dataset.held;
  if (held) openHandCtx(held, other || null);
  else sendText('hands');
});
document.getElementById('hand-r').addEventListener('click', () => {
  const el    = document.getElementById('hand-r');
  const held  = el.dataset.held;
  const other = document.getElementById('hand-l').dataset.held;
  if (held) openHandCtx(held, other || null);
  else sendText('hands');
});

// ── CLOSE CTX ON LOG TAP ─────────────────────────────────
document.getElementById('log').addEventListener('click', closeCtx);

// ── UPDATE DIRECTION BUTTONS ──────────────────────────────
// Called by render.js after each room load
window.updateDpad = function(exits) {
  ['north','south','east','west'].forEach(dir => {
    const btn = document.getElementById('dir-' + dir);
    if (!btn) return;
    if (exits.includes(dir)) {
      btn.classList.add('avail');
      btn.classList.remove('dim');
    } else {
      btn.classList.add('dim');
      btn.classList.remove('avail');
    }
  });
};

// ── CONNECT ───────────────────────────────────────────────
connect();
