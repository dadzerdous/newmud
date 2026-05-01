// ════════════════════════════════════════
// render.js
// ════════════════════════════════════════

const DANGER = new Set(['steal','attack','kill','kick','destroy','stab']);

// State
let _objects   = {};  // id → { emoji, name, actions }
let _disc      = {};  // id → true (discovered)
let _activeCtx = null;

// ── RENDER ROOM ──────────────────────────────────────────
export function renderRoom(data, selfName) {
  // Store objects for lookup
  _objects = {};
  (data.objects || []).forEach(o => { _objects[o.id ?? o.name] = o; });

  // Title
  document.getElementById('room-title').textContent = data.title ?? '';

  // Description — make object names tappable
  renderDesc(data.desc, data.objects || []);

  // Movement zones
  setZones(data.exits || []);

  // Players
  const others = (data.players || []).filter(n => n !== selfName);
  if (others.length) log(others.join(', ') + (others.length === 1 ? ' is' : ' are') + ' here.', 'll-sys');
}

function renderDesc(desc, objects) {
  const el = document.getElementById('room-desc');
  let text = Array.isArray(desc) ? desc.join(' ') : (desc ?? '');

  objects.forEach(obj => {
    const id    = obj.id ?? obj.name;
    const label = obj.name;
    const re    = new RegExp(`\\b(${esc(label)})\\b`, 'gi');

    if (_disc[id]) {
      // Already discovered — just dim the word, no tap
      text = text.replace(re, `<span class="tap used">$1</span>`);
    } else {
      text = text.replace(re,
        `<span class="tap" data-id="${id}" onclick="window.__tap(this)">${label}</span>`
      );
    }
  });

  el.innerHTML = text;
}

// Called from inline onclick — avoids module boundary issues
window.__tap = function(el) {
  const id  = el.dataset.id;
  const obj = _objects[id];
  if (!obj) return;

  el.classList.add('used');
  el.onclick = null;

  // Tell server to persist this discovery
  window.sendText('discover ' + id);

  addDiscovered(id, obj);
  openCtx(id);
};

// ── DISCOVERED ───────────────────────────────────────────
function addDiscovered(id, obj) {
  if (_disc[id]) return;
  _disc[id] = true;

  const section = document.getElementById('discovered');
  const row     = document.getElementById('disc-chips');

  section.classList.remove('hidden');

  const chip = document.createElement('span');
  chip.className  = 'dchip';
  chip.dataset.id = id;
  chip.textContent = (obj.emoji ? obj.emoji + ' ' : '') + obj.name;
  chip.addEventListener('click', e => {
    e.stopPropagation();
    _activeCtx === id ? closeCtx() : openCtx(id);
  });
  row.appendChild(chip);
}

// ── CONTEXT ACTIONS ──────────────────────────────────────
function openCtx(id) {
  _activeCtx = id;
  const obj  = _objects[id];
  const actions = obj?.actions ?? ['look'];

  // Highlight chip
  document.querySelectorAll('.dchip').forEach(c =>
    c.classList.toggle('active', c.dataset.id === id)
  );

  document.getElementById('ctx-who').textContent = obj?.name ?? id;

  const btns = document.getElementById('ctx-btns');
  btns.innerHTML = '';

  actions.forEach(action => {
    const danger = DANGER.has(action);
    const b = document.createElement('button');

    // Fully inline — nothing can override these
    b.style.cssText = (danger
      ? 'background:#180808;border:1px solid rgba(255,80,80,0.4);color:#ff7060;'
      : 'background:#14122000;border:1px solid rgba(150,120,255,0.38);color:#b8a8f0;'
    ) + 'font-family:Georgia,serif;font-size:12px;padding:5px 13px;border-radius:14px;cursor:pointer;opacity:1;visibility:visible;display:inline-block;line-height:1.4;';

    b.textContent = action;
    b.addEventListener('click', e => {
      e.stopPropagation();
      // Send command — context stays open so player can do multiple actions
      window.sendText(action + ' ' + (obj?.name ?? id).toLowerCase());
    });
    btns.appendChild(b);
  });

  document.getElementById('ctx').classList.remove('hidden');
}

// ── HAND CONTEXT ─────────────────────────────────────────
// Called when player taps their held item
export function openHandCtx(itemId) {
  if (!itemId) return;

  const def  = window.worldItems?.[itemId];
  const name = def?.name ?? itemId;
  const actions = ['look', 'use', 'throw', 'store', 'drop'];

  // Deselect any room chips
  document.querySelectorAll('.dchip').forEach(c => c.classList.remove('active'));
  _activeCtx = '__hand__';

  document.getElementById('ctx-who').textContent = (def?.emoji ? def.emoji + ' ' : '') + name;

  const btns = document.getElementById('ctx-btns');
  btns.innerHTML = '';

  actions.forEach(action => {
    const danger = DANGER.has(action);
    const b = document.createElement('button');
    b.style.cssText = (danger
      ? 'background:#180808;border:1px solid rgba(255,80,80,0.4);color:#ff7060;'
      : 'background:#14122000;border:1px solid rgba(150,120,255,0.38);color:#b8a8f0;'
    ) + 'font-family:Georgia,serif;font-size:12px;padding:5px 13px;border-radius:14px;cursor:pointer;opacity:1;visibility:visible;display:inline-block;line-height:1.4;';

    b.textContent = action;
    b.addEventListener('click', e => {
      e.stopPropagation();
      if (action === 'store') {
        // Store: move from hand to bag — server handles, just send command
        window.sendText('store ' + name.toLowerCase());
      } else {
        window.sendText(action + ' ' + name.toLowerCase());
      }
      // Close ctx after action on hand item
      closeCtx();
    });
    btns.appendChild(b);
  });

  document.getElementById('ctx').classList.remove('hidden');
}

export function closeCtx() {
  _activeCtx = null;
  document.querySelectorAll('.dchip').forEach(c => c.classList.remove('active'));
  document.getElementById('ctx').classList.add('hidden');
  document.getElementById('ctx-btns').innerHTML = '';
}

// ── LOG ──────────────────────────────────────────────────
export function log(msg, cls) {
  const el = document.getElementById('log');
  if (!el) return;
  const d = document.createElement('div');
  d.className = 'll ' + (cls ?? 'll-sys');
  d.innerHTML = msg;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

// ── CLEAR (called on new room) ───────────────────────────
export function clearRoom() {
  _objects   = {};
  _disc      = {};
  _activeCtx = null;

  document.getElementById('room-title').textContent = '';
  document.getElementById('room-desc').innerHTML    = '';
  document.getElementById('disc-chips').innerHTML   = '';
  document.getElementById('ctx-btns').innerHTML     = '';
  document.getElementById('log').innerHTML          = '';
  document.getElementById('discovered').classList.add('hidden');
  document.getElementById('ctx').classList.add('hidden');
}

// ── MOVEMENT ZONES ───────────────────────────────────────
function setZones(exits) {
  window.updateDpad?.(exits);
}

// ── UTIL ─────────────────────────────────────────────────
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ── RESTORE DISCOVERIES (on login/resume) ────────────────
// Called by client.js when server sends { type:'discovered', items:[...] }
export function restoreDiscovered(ids) {
  ids.forEach(id => {
    if (_disc[id]) return; // already shown
    // We may not have the object def yet (room not loaded),
    // so store a placeholder and add the chip when the room loads
    _disc[id] = true;
  });
}
