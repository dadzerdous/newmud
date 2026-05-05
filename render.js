// ════════════════════════════════════════
// render.js
// ════════════════════════════════════════

const DANGER = new Set(['steal','attack','kill','kick','destroy','stab']);

// ── STATE ────────────────────────────────────────────────
let _objects           = {};  // id → object def for current room
let _currentRoomId     = null;
let _activeCtx         = null;
let _totalDiscoverable = 0;

// ── RENDER ROOM ──────────────────────────────────────────
export function renderRoom(data, selfName) {
  _currentRoomId = data.id ?? data.title;

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

  // Description
  renderDesc(data, data.objects || []);

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
function renderDesc(data, objects) {
  const el = document.getElementById('room-desc');

  const lines = Array.isArray(data.desc) ? data.desc : [data.desc ?? ''];
  let html = lines.join(' ');

  objects.forEach(obj => {
    const id    = obj.id ?? obj.name;
    const label = obj.name;
    if (!label) return;

    const cls = obj.discovered ? 'tap known' : 'tap';
    const re  = new RegExp(`\\b(${esc(label)})\\b`, 'gi');

    if (re.test(html)) {
      // Name found in description — wrap it
      html = html.replace(new RegExp(`\\b(${esc(label)})\\b`, 'gi'),
        `<span class="${cls}" data-id="${id}" onclick="window.__tap(this)">$1</span>`
      );
    } else {
      // Name not in description — append as standalone tappable
      html += ` <span class="${cls}" data-id="${id}" onclick="window.__tap(this)">${obj.emoji ? obj.emoji + ' ' : ''}${label}</span>`;
    }
  });

  el.innerHTML = html;
}

// ── TAP WORD ─────────────────────────────────────────────
window.__tap = function(el) {
  const id  = el.dataset.id;
  const obj = _objects[id];
  if (!obj) return;

  // Non-native (dropped from another room) — just open ctx, never discover
  if (obj.native === false) {
    el.className = 'tap known';
    openCtx(id);
    return;
  }

  // Mark as discovered for native items
  if (!obj.discovered) {
    obj.discovered = true;
    el.className = 'tap known';
    window.sendText('discover ' + id);
    addChip(id, obj);
    updateDiscoveryCounter();
  } else {
    el.className = 'tap known';
  }

  openCtx(id);
};

// ── DISCOVERED CHIPS ─────────────────────────────────────
function rebuildChips(currentIds) {
  const row     = document.getElementById('disc-chips');
  const section = document.getElementById('discovered');

  row.innerHTML = '';

  const discovered = Object.values(_objects).filter(o => o.discovered && o.native !== false);

  if (discovered.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  discovered.forEach(obj => {
    const id   = obj.id ?? obj.name;
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
      if (action === 'throw') {
        // Throw needs a target — server will prompt
        window.sendText('throw ' + name.toLowerCase());
      } else {
        window.sendText(action + ' ' + name.toLowerCase());
      }
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
    : 'background:#1e1a30;border:1px solid rgba(150,120,255,0.38);color:#b8a8f0;'
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
  // _disc no longer needed — server sends discovered flag per object

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
  const found = Object.values(_objects).filter(o => o.discovered && o.native !== false).length;
  const label = document.getElementById('discovered-label');
  if (label) {
    label.textContent = _totalDiscoverable > 0
      ? `Discovered  ${found}/${_totalDiscoverable}`
      : `Discovered`;
  }
}

// ── RESTORE DISCOVERIES ──────────────────────────────────
// No longer needed — server sends discovered:true on each object
// Kept as a no-op so client.js import doesn't break
export function restoreDiscovered() {}

export function setTotalDiscoverable(n) {
  _totalDiscoverable = n;
  updateDiscoveryCounter();
}

// ── INVENTORY ITEM CLICKS ────────────────────────────────
document.getElementById('log').addEventListener('click', e => {
  const obj = e.target.closest('.obj');

  // Clicked neutral area — close ctx
  if (!obj) {
    closeCtx();
    return;
  }

  const name    = obj.dataset.name;
  const actions = (obj.dataset.actions || '').split('|').filter(Boolean);
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

// ── INVENTORY DISPLAY ────────────────────────────────────
export function showInventory(pkt) {
  const { hands, bag, items: defs } = pkt;
  const logEl = document.getElementById('log');
  if (!logEl) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'll ll-sys';

  const title = document.createElement('div');
  title.textContent = 'You are carrying:';
  title.style.marginBottom = '4px';
  wrapper.appendChild(title);

  function makeRow(itemId, label, actions) {
    const def   = defs?.[itemId] || {};
    const emoji = def.emoji || '';
    const row   = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';

    const name = document.createElement('span');
    name.style.cssText = 'color:#f0c060;cursor:pointer;';
    name.textContent = (emoji ? emoji + ' ' : '') + itemId + ' ';

    const sub = document.createElement('em');
    sub.style.cssText = 'color:#5a5070;font-size:11px;';
    sub.textContent = label;

    row.appendChild(name);
    row.appendChild(sub);

    // Click the row to open ctx
    row.addEventListener('click', e => {
      e.stopPropagation();
      _activeCtx = '__inv__';
      document.querySelectorAll('.dchip').forEach(c => c.classList.remove('active'));
      document.getElementById('ctx-who').textContent = itemId;

      const btns = document.getElementById('ctx-btns');
      btns.innerHTML = '';
      actions.forEach(action => {
        const b = makeActionBtn(action, () => {
          window.sendText(action + ' ' + itemId.toLowerCase());
          closeCtx();
        });
        btns.appendChild(b);
      });

      document.getElementById('ctx').classList.remove('hidden');
    });

    return row;
  }

  if (hands.left)  wrapper.appendChild(makeRow(hands.left,  '(left hand)', ['look','drop','store']));
  if (hands.right) wrapper.appendChild(makeRow(hands.right, '(right hand)', ['look','drop','store']));
  bag.forEach(itemId => wrapper.appendChild(makeRow(itemId, '(bag)', ['look','retrieve','drop'])));

  if (!hands.left && !hands.right && bag.length === 0) {
    wrapper.textContent = 'You are carrying nothing.';
  }

  logEl.appendChild(wrapper);
  logEl.scrollTop = logEl.scrollHeight;
}

// ── TARGETING MODE ───────────────────────────────────────
// Called when server asks player to pick a target
let _targeting = null;

export function startTargeting(pkt) {
  _targeting = pkt; // { action, item, msg }

  // Show prompt in log
  log(`${pkt.msg} (tap something in the room)`, 'll-sys');

  // Highlight all tappable elements
  document.querySelectorAll('.tap, .dchip').forEach(el => {
    el.classList.add('targeting');
  });
}

function stopTargeting() {
  _targeting = null;
  document.querySelectorAll('.targeting').forEach(el => {
    el.classList.remove('targeting');
  });
}

// Override __tap to handle targeting mode
const _originalTap = window.__tap;
window.__tap = function(el) {
  if (_targeting) {
    const id = el.dataset.id;
    window.sendText(`${_targeting.action} ${_targeting.item} ${id}`);
    stopTargeting();
    return;
  }
  _originalTap(el);
};
