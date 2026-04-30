// ════════════════════════════════════════
// main.js — Entry point
// ════════════════════════════════════════

import { connect, sendText } from './client.js';
import { showAuth }          from './auth.js';
import { closeCtx, log }     from './render.js';

// ── ITEMS ─────────────────────────────────────────────────
fetch('items.json')
  .then(r => r.json())
  .then(d => { window.worldItems = d; })
  .catch(() => { window.worldItems = {}; });

// ── WELCOME BUTTONS ───────────────────────────────────────
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

// ── MOVEMENT ZONES ────────────────────────────────────────
document.querySelectorAll('.mzone').forEach(z => {
  z.addEventListener('click', () => {
    const dir = z.dataset.dir;
    if (dir) sendText(dir);
  });
});

// Arrow keys (keyboard users / desktop)
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

// ── HANDS ─────────────────────────────────────────────────
document.getElementById('hand-l').addEventListener('click', () => sendText('hands'));
document.getElementById('hand-r').addEventListener('click', () => sendText('hands'));

// ── CLOSE CTX ON LOG TAP ─────────────────────────────────
document.getElementById('log').addEventListener('click', closeCtx);

// ── GO ────────────────────────────────────────────────────
connect();
