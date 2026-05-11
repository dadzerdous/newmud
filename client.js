// ════════════════════════════════════════
// client.js — WebSocket + routing
// ════════════════════════════════════════

import { renderRoom, log, clearRoom, restoreDiscovered, setTotalDiscoverable, setRoomEventCounts, showInventory, startTargeting, openCombatPanel, closeCombatPanel, logCombat } from './render.js';
import { updateHUD, setHeld, setHands, updateCombatState, handleCombatPacket } from './hud.js';
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
      window._playerAcc = pkt.player;
      if (pkt.player?.race) applyTheme(pkt.player.race);
      updateHUD(pkt.player);
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
      setRoomEventCounts(pkt.totalEvents, pkt.eventsTriggered);
      renderRoom(pkt, selfName);
      break;

    case 'wielding':
      // Update hand wielding state from server
      if (window._syncWielding) window._syncWielding(pkt.wielding);
      break;

    case 'combat':
      handleCombatPacket(pkt);
      document.getElementById('stat-npc-hp')?.classList.toggle('hidden', !pkt.stage);
      // Open combat panel when entering ranged stage
      if (pkt.stage === 'ranged' && window._prevCombatStage !== 'ranged' && window._prevCombatStage !== 'melee') {
        openCombatPanel(pkt.npcId);
      }
      // Mark combat as ended
      if (pkt.stage === 'idle' && window._prevCombatStage && window._prevCombatStage !== 'idle') {
        closeCombatPanel();
      }
      window._prevCombatStage = pkt.stage;
      break;

    case 'system': {
      const msgType = pkt.msgType;
      const cls = msgType === 'hit-left'   ? 'll-hit-player'
                : msgType === 'hit-right'  ? 'll-hit-player'
                : msgType === 'hit-player' ? 'll-hit-player'
                : msgType === 'hit-enemy'  ? 'll-hit-enemy'
                : msgType === 'hit'        ? 'll-hit'
                : msgType === 'miss'       ? 'll-miss'
                : msgType === 'event'      ? 'll-event'
                : msgType === 'action'     ? 'll-action'
                : 'll-sys';

      // Route hit/miss to combat panel instead of main log
      const isCombatMsg = ['hit-player','hit-right','hit-left','hit-enemy','hit','miss'].includes(msgType);
      if (isCombatMsg) {
        const side = (msgType === 'hit-enemy') ? 'enemy' : 'player';
        logCombat(pkt.msg, side, msgType);
        // Also add separator to main log? No — keep main log clean
        break;
      }

      log(pkt.msg, cls);
      break;
    }

    case 'inventory':
      if (pkt.items) window.worldItems = { ...window.worldItems, ...pkt.items };
      showInventory(pkt);
      break;

    case 'quest_state':
      window._questState = pkt.quests;
      if (window._onQuestState) window._onQuestState(pkt.quests);
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
