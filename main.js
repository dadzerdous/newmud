// ════════════════════════════════════════
// main.js — Entry point
// ════════════════════════════════════════

import { connect, sendText } from './client.js';
import { showAuth }          from './auth.js';
import { closeCtx, openHandCtx, togglePlayerChip } from './render.js';
import { toggleWield } from './hud.js';

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

// ── DIRECTION BUTTONS ─────────────────────────────────────
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
document.getElementById('btn-bag').addEventListener('click', () => {
  const panel = document.getElementById('inv-panel');
  if (panel && !panel.classList.contains('hidden')) {
    import('./render.js').then(m => m.toggleInventory?.());
  } else {
    sendText('inv');
  }
});
document.getElementById('btn-retreat').addEventListener('click', () => sendText('retreat'));
document.getElementById('btn-quit').addEventListener('click', () => {
  localStorage.removeItem('mg_token');
  sendText('quit');
});

// ── HUD CLICKS ────────────────────────────────────────────
document.getElementById('hud-conn').addEventListener('click', () => sendText('who'));
document.getElementById('hud-conn').style.cssText += ';cursor:pointer;padding:8px 6px;margin:-8px -6px;touch-action:manipulation;';
document.getElementById('hud-name').addEventListener('click', () => {
  togglePlayerChip(window._playerAcc);
});
document.getElementById('hud-name').style.cursor = 'pointer';

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

// ── WIELD BUTTONS ─────────────────────────────────────────
document.getElementById('wield-l')?.addEventListener('click', () => {
  const btn = document.getElementById('wield-l');
  if (btn.textContent === 'flee') sendText('flee');
  else toggleWield('left');
});
document.getElementById('wield-r')?.addEventListener('click', () => {
  const btn = document.getElementById('wield-r');
  if (btn.textContent === 'flee') sendText('flee');
  else toggleWield('right');
});

// ── ROOM TITLE → RESET VOTE ───────────────────────────────
let _resetVotePending = false;

document.getElementById('room-title')?.addEventListener('click', () => {
  const btn = document.getElementById('reset-btn');
  if (!btn) return;
  // Toggle hourglass on/off
  if (btn.style.display === 'none') {
    btn.style.display = '';
  } else if (!_resetVotePending) {
    // Only hide if vote not pending — don't hide mid-vote
    btn.style.display = 'none';
  }
});

document.getElementById('reset-btn')?.addEventListener('click', e => {
  e.stopPropagation();
  const btn = document.getElementById('reset-btn');
  if (_resetVotePending) {
    _resetVotePending = false;
    btn.style.display = 'none';
    sendText('resetcancel');
  } else {
    _resetVotePending = true;
    btn.textContent   = '⌛';
    sendText('resetvote');
  }
});

window._onRoomChange = function() {
  _resetVotePending = false;
  const btn = document.getElementById('reset-btn');
  if (btn) { btn.style.display = 'none'; btn.textContent = '⏳'; }
};

// ── DPAD ──────────────────────────────────────────────────
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
