// ════════════════════════════════════════
// client.js — WebSocket + routing
// ════════════════════════════════════════

import { renderRoom, log, clearRoom, restoreDiscovered, setTotalDiscoverable } from './render.js';
import { updateHUD, setHeld }             from './hud.js';
import { hideAuth, applyTheme, bindAuth } from './auth.js';
import { MockSocket }                     from './mock.js';

const WS_URL  = 'wss://muddygob-server-1.onrender.com';

// ┌─────────────────────────────────────────────────────┐
// │  MOCK MODE — true = offline dev, false = real server│
// └─────────────────────────────────────────────────────┘
const USE_MOCK = false;

let ws         = null;
let selfName   = null;
let manualExit = false;

// ── CONNECT ──────────────────────────────────────────────
export function connect() {
  ws = USE_MOCK ? new MockSocket() : new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    setConn('● online');
    const tok = localStorage.getItem('mg_token');
    if (tok) send({ type: 'resume', token: tok });
  });

  ws.addEventListener('close', () => {
    setConn('○ offline');
    if (!manualExit) setTimeout(connect, 2500);
  });

  ws.addEventListener('error', () => setConn('✕ error'));

  ws.addEventListener('message', ({ data: raw }) => {
    if (raw === 'manual_exit') {
      manualExit = true;
      localStorage.removeItem('mg_token');
      setTimeout(() => location.reload(), 400);
      return;
    }
    if (raw === 'pong') return;

    let pkt;
    try { pkt = JSON.parse(raw); }
    catch { log(raw, 'll-sys'); return; }

    route(pkt);
  });
}

// ── SEND ─────────────────────────────────────────────────
export function send(obj)   { ws?.readyState === 1 && ws.send(JSON.stringify(obj)); }
export function sendText(t) { ws?.readyState === 1 && ws.send(t); }

window.sendText = sendText;

// ── ROUTE ─────────────────────────────────────────────────
function route(pkt) {
  switch (pkt.type) {

    case 'session_token':
      localStorage.setItem('mg_token', pkt.token);
      break;

    case 'player_state':
      hideAuth();
      selfName = pkt.player?.name;
      if (pkt.player?.race) applyTheme(pkt.player.race);
      updateHUD(pkt.player);
      break;

    case 'stats':
      updateHUD(pkt);
      break;

    case 'held':
      setHeld(pkt.item);
      break;

    case 'discovered':
      // Restore persisted discoveries on login/resume
      if (Array.isArray(pkt.items)) restoreDiscovered(pkt.items);
      break;

    case 'room':
      hideAuth();
      clearRoom();
      window._room = pkt;
      if (pkt.totalDiscoverable) setTotalDiscoverable(pkt.totalDiscoverable);
      renderRoom(pkt, selfName);
      break;

    case 'system':
      log(pkt.msg, 'll-sys');
      break;

    case 'chat': {
      const cls = { say:'ll-say', yell:'ll-yell', tell:'ll-tell', emote:'ll-emote' }[pkt.mode] ?? 'll-sys';
      const msg = pkt.mode === 'emote'
        ? `${pkt.name} ${pkt.text}`
        : `${pkt.name}: "${pkt.text}"`;
      log(msg, cls);
      break;
    }

    case 'players_online': {
      const el = document.getElementById('hud-conn');
      if (el) el.textContent = `● ${pkt.count} online`;
      break;
    }

    default:
      console.warn('unknown packet', pkt);
  }
}

// ── AUTH CALLBACKS ────────────────────────────────────────
bindAuth(
  (name, pass, race, pronoun) => send({ type:'create_account', name, password:pass, race, pronoun }),
  (loginId, pass)             => send({ type:'try_login', login:loginId, password:pass })
);

function setConn(txt) {
  const el = document.getElementById('hud-conn');
  if (el) el.textContent = txt;
}
