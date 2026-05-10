// ════════════════════════════════════════
// client.js — WebSocket + routing
// ════════════════════════════════════════

import { renderRoom, log, clearRoom, restoreDiscovered, setTotalDiscoverable, showInventory, startTargeting } from './render.js';
import { updateHUD, setHeld, setHands, updateCombatState, handleCombatPacket, resetCombatState, applySkillCooldown, updateWeaponXP } from './hud.js';
import { hideAuth, applyTheme, bindAuth } from './auth.js';
import { MockSocket }                     from './mock.js';

const WS_URL  = 'wss://muddygob-server-1.onrender.com';

// Load item definitions for emoji/name lookup
fetch('./items.json').then(r => r.json()).then(d => { window.worldItems = d; }).catch(() => {});

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

    case 'skill_cooldown':
      applySkillCooldown(pkt.itemId, pkt.durationMs);
      break;

    case 'weapon_xp':
      updateWeaponXP(pkt.weaponXP);
      break;

    case 'stats':
      updateHUD(pkt);
      break;

    case 'held':
      setHeld(pkt.item);
      break;

    case 'hands':
      setHands(pkt.hands);
      break;

    case 'discovered':
      // Per-room format: { perRoom: { roomId: [itemIds] } }
      if (pkt.perRoom) restoreDiscovered(pkt.perRoom);
      break;

    case 'room':
      hideAuth();
      clearRoom();
      window._room = pkt;
      if (pkt.totalDiscoverable) setTotalDiscoverable(pkt.totalDiscoverable);
      renderRoom(pkt, selfName);
      // If server sends a room with no active combat, reset the combat UI
      // (handles moving rooms during notice, or after death respawn)
      if (!pkt.combatStage || pkt.combatStage === 'idle' || pkt.combatStage === 'notice') {
          resetCombatState();
      }
      break;

    case 'wielding':
      // Update hand wielding state from server
      if (window._syncWielding) window._syncWielding(pkt.wielding);
      break;

    case 'combat':
      handleCombatPacket(pkt);
      document.getElementById('stat-npc-hp')?.classList.toggle('hidden', !pkt.stage);
      break;

    case 'system': {
      const cls = pkt.msgType === 'hit-player' ? 'll-hit-player'
                : pkt.msgType === 'hit-enemy'  ? 'll-hit-enemy'
                : pkt.msgType === 'hit-left'   ? 'll-hit-player' // legacy
                : pkt.msgType === 'hit-right'  ? 'll-hit-player' // legacy
                : pkt.msgType === 'hit'        ? 'll-hit'
                : pkt.msgType === 'miss'       ? 'll-miss'
                : pkt.msgType === 'event'      ? 'll-event'
                : pkt.msgType === 'action'     ? 'll-action'
                : 'll-sys';
      if (['hit-player','hit-enemy','hit-left','hit-right','hit','miss'].includes(pkt.msgType)) {
        const el = document.getElementById('log');
        if (el) { const hr = document.createElement('div'); hr.className = 'll-sep'; el.appendChild(hr); }
      }
      log(pkt.msg, cls);
      break;
    }

    case 'inventory':
      // Update worldItems with server's item data
      if (pkt.items) window.worldItems = { ...window.worldItems, ...pkt.items };
      showInventory(pkt);
      break;

    case 'target_prompt':
      startTargeting(pkt);
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
