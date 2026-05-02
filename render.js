// ════════════════════════════════════════
// render.js
// ════════════════════════════════════════

const DANGER = new Set(['steal','attack','kill','kick','destroy','stab']);

// ── STATE ────────────────────────────────────────────────
let _objects       = {};  // id → object def for current room
let _disc          = {};  // roomId → Set of discovered ids (persists across room changes)
let _currentRoomId = null;
let _activeCtx     = null;
let _totalDiscoverable = 0;

// ── RENDER ROOM ──────────────────────────────────────────
export function renderRoom(data, selfName) {
  _currentRoomId = data.id ?? data.title;

  // Ensure a Set exists for this room
  if (!_disc[_currentRoomId]) _disc[_currentRoomId] = new Set();

  // Build object lookup for this room
  _objects = {};
  const currentIds = new Set();
  (data.objects || []).forEach(o => {
    const id = o.id ?? o.name;
    _objects[id] = o;
    currentIds.add(id);
  });

  // Title
  document.getElementById('room-title').textContent = data.title ?? '';

  // Description — make undiscovered object names tappable,
  // keep discovered names tappable but styled differently
  renderDesc(data.desc, data.objects || []);

  // Rebuild discovered chips for this room
  rebuildChips(currentIds);

  // Discovery counter
  _totalDiscoverable = data.totalDiscoverable ?? 0;
  updateDiscoveryCounter();

  // Movement
  setZones(data.exits || []);

  // Players
  const others = (data.players || []).filter(n => n !== selfName);
  if (others.length) {
    log(others.join(', ') + (others.length === 1 ? ' is' : ' are') + ' here.', 'll-sys');
  }
}

// ── DESCRIPTION ──────────────────────────────────────────
function renderDesc(desc, objects) {
  const el = document.getElementById('room-desc');

  // Join desc array — but DON'T run regex on injected roomText that
  // may already contain item names. Process each line separately.
  const lines = Array.isArray(desc) ? desc : [desc ?? ''];
  const discovered = _disc[_currentRoomId];

  let html = lines.map(line => {
    let text = line;

    objects.forEach(obj => {
      const id    = obj.id ?? obj.name;
      const label = obj.name;
      const re    = new RegExp(`\\b(${esc(label)})\\b`, 'gi');

      if (discovered?.has(id)) {
        // Already discovered — still tappable but styled as known
        text = text.replace(re,
          `<span class="tap known" data-id="${id}" onclick="window.__tap(this)">${label}</span>`
        );
      } else {
        // Not yet discovered — tappable
        text = text.replace(re,
          `<span class="tap" data-id="${id}" onclick="window.__tap(this)">${label}</span>`
        );
      }
    });

    return text;
  }).join(' ');

  el.innerHTML = html;
}

// ── TAP WORD ─────────────────────────────────────────────
window.__tap = function(el) {
  const id  = el.dataset.id;
  const obj = _objects[id];
  if (!obj) return;

  // Mark as discovered
  if (!_disc[_currentRoomId]) _disc[_currentRoomId] = new Set();
  if (!_disc[_currentRoomId].has(id)) {
    _disc[_currentRoomId].add(id);
    window.sendText('discover ' + id);
    addChip(id, obj);
    updateDiscoveryCounter();
  }

  // Style the word as known
  el.classList.add('known');

  openCtx(id);
};

// ── DISCOVERED CHIPS ─────────────────────────────────────
function rebuildChips(currentIds) {
  const row     = document.getElementById('disc-chips');
  const section = document.getElementById('discovered');
  const discovered = _disc[_currentRoomId];

  row.innerHTML = '';

  if (!discovered || discovered.size === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  discovered.forEach(id => {
    const obj = _objects[id];
    if (!obj) return; // object not in this room's object list at all
    const chip = makeChip(id, obj, currentIds.has(id));
    row.appendChild(chip);
  });
}

function addChip(id, obj) {
  const row     = document.getElementById('disc-chips');
  const section = document.getElementById('discovered');

  // Don't double-add
  if (document.querySelector(`.dchip[data-id="${id}"]`)) return;

  section.classList.remove('hidden');
  const chip = makeChip(id, obj, true); // newly discovered = present
  row.appendChild(chip);
}

function makeChip(id, obj, isPresent) {
  const chip = document.createElement('span');
  chip.className = 'dchip' + (isPresent ? '' : ' absent');
  chip.dataset.id = id;
  chip.textContent = (obj.emoji ? obj.emoji + ' ' : '') + obj.name;
  chip.addEventListener('click', e => {
    e.stopPropagation();
    _activeCtx === id ? closeCtx() : openCtx(id);
  });
  return chip;
}

// ── CONTEXT ACTIONS ──────────────────────────────────────
function openCtx(id) {
  _activeCtx = id;
  const obj  = _objects[id];
  const actions = obj?.actions ?? ['look'];

  document.querySelectorAll('.dchip').forEach(c =>
    c.classList.toggle('active', c.dataset.id === id)
  );

  document.getElementById('ctx-who').textContent = obj?.name ?? id;

  const btns = document.getElementById('ctx-btns');
  btns.innerHTML = '';

  actions.forEach(action => {
    const b = makeActionBtn(action, () => {
      window.sendText(action + ' ' + (obj?.name ?? id).toLowerCase());
    });
    btns.appendChild(b);
  });

  document.getElementById('ctx').classList.remove('hidden');
}

// ── HAND CONTEXT ─────────────────────────────────────────
export function openHandCtx(itemId) {
  if (!itemId) return;

  const def  = window.worldItems?.[itemId];
  const name = def?.name ?? itemId;

  document.querySelectorAll('.dchip').forEach(c => c.classList.remove('active'));
  _activeCtx = '__hand__';

  document.getElementById('ctx-who').textContent = (def?.emoji ? def.emoji + ' ' : '') + name;

  const btns = document.getElementById('ctx-btns');
  btns.innerHTML = '';

  ['look','use','throw','store','drop'].forEach(action => {
    const b = makeActionBtn(action, () => {
      window.sendText(action + ' ' + name.toLowerCase());
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

// ── ACTION BUTTON FACTORY ────────────────────────────────
function makeActionBtn(action, onClick) {
  const danger = DANGER.has(action);
  const b = document.createElement('button');
  b.style.cssText = (danger
    ? 'background:#180808;border:1px solid rgba(255,80,80,0.4);color:#ff7060;'
    : 'background:#14122000;border:1px solid rgba(150,120,255,0.38);color:#b8a8f0;'
  ) + 'font-family:Georgia,serif;font-size:12px;padding:5px 13px;border-radius:14px;cursor:pointer;opacity:1;visibility:visible;display:inline-block;line-height:1.4;';
  b.textContent = action;
  b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return b;
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

// ── CLEAR (on room change) ───────────────────────────────
export function clearRoom() {
  _objects   = {};
  _activeCtx = null;
  // _disc is intentionally NOT cleared — persists per room

  document.getElementById('room-title').textContent = '';
  document.getElementById('room-desc').innerHTML    = '';
  document.getElementById('ctx-btns').innerHTML     = '';
  document.getElementById('log').innerHTML          = '';
  document.getElementById('disc-chips').innerHTML   = '';
  document.getElementById('ctx').classList.add('hidden');
  document.getElementById('discovered').classList.add('hidden');
}

// ── MOVEMENT ZONES ───────────────────────────────────────
function setZones(exits) {
  window.updateDpad?.(exits);
}

// ── DISCOVERY COUNTER ────────────────────────────────────
function updateDiscoveryCounter() {
  const found = _disc[_currentRoomId]?.size ?? 0;
  const label = document.getElementById('discovered-label');
  if (label) {
    label.textContent = _totalDiscoverable > 0
      ? `Discovered  ${found}/${_totalDiscoverable}`
      : `Discovered`;
  }
}

// ── RESTORE DISCOVERIES (on login/resume) ────────────────
export function restoreDiscovered(ids) {
  // ids is a flat array from server — we don't know which room
  // so we store them as pending to be applied on next room render
  // For now just mark them on current room if we have one
  if (!_currentRoomId) return;
  if (!_disc[_currentRoomId]) _disc[_currentRoomId] = new Set();
  ids.forEach(id => _disc[_currentRoomId].add(id));
}

export function setTotalDiscoverable(n) {
  _totalDiscoverable = n;
  updateDiscoveryCounter();
}

// ── INVENTORY ITEM CLICKS ────────────────────────────────
document.getElementById('log').addEventListener('click', e => {
  const obj = e.target.closest('.obj');
  if (!obj) return;
  e.stopPropagation();

  const name    = obj.dataset.name;
  const actions = JSON.parse(obj.dataset.actions || '[]');
  if (!name || !actions.length) return;

  _activeCtx = '__inv__';
  document.querySelectorAll('.dchip').forEach(c => c.classList.remove('active'));
  document.getElementById('ctx-who').textContent = name;

  const btns = document.getElementById('ctx-btns');
  btns.innerHTML = '';
  actions.forEach(action => {
    const b = makeActionBtn(action, () => {
      window.sendText(action + ' ' + name.toLowerCase());
      closeCtx();
    });
    btns.appendChild(b);
  });

  document.getElementById('ctx').classList.remove('hidden');
});

// ── UTIL ─────────────────────────────────────────────────
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
