// ════════════════════════════════════════
// render.js
// ════════════════════════════════════════

const DANGER = new Set(['steal','attack','kill','kick','destroy','stab']);

// ── STATE ────────────────────────────────────────────────
let _objects           = {};  // id → object def for current room
let _currentRoomId     = null;
let _activeCtx         = null;
let _totalDiscoverable = 0;
let _playersInRoom     = new Set(); // names of other players currently here

// ── RENDER ROOM ──────────────────────────────────────────
export function renderRoom(data, selfName) {
  const isNewRoom = data.id !== _currentRoomId;
  _currentRoomId = data.id ?? data.title;

  // Only clear log when actually changing rooms
  if (isNewRoom) {
    document.getElementById('log').innerHTML = '';
  }

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
  window._onRoomChange?.();

  // Track players in room for name highlighting in log
  _playersInRoom = new Set((data.players || []));

  // Description
  renderDesc(data, data.objects || []);

  // Rebuild discovered chips for this room
  rebuildChips(currentIds);

  // Discovery counter
  _totalDiscoverable = data.totalDiscoverable ?? 0;
  updateDiscoveryCounter();

  // Movement
  setZones(data.exits || []);

  // Players — only announce on fresh room entry, not on same-room refreshes
  if (isNewRoom) {
    const others = (data.players || []).filter(n => n !== selfName);
    if (others.length) {
      const names = others.map(n =>
        `<span class="player-name" data-name="${n}" style="color:var(--accent2);cursor:pointer;border-bottom:1px dotted rgba(192,170,255,0.4);">${n}</span>`
      ).join(', ');
      const verb = others.length === 1 ? ' is' : ' are';
      log(names + verb + ' here.', 'll-sys');
    }
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
    if (obj.hidden) return;  // hidden NPCs — count in total but not tappable yet
    if (!obj.actions || obj.actions.length === 0) return;  // no actions = not interactive

    const cls = obj.discovered ? 'tap known' : 'tap';

    // Try full name first, then individual words (handles "Fake Coin" → finds "shiny" won't work,
    // but finds "Coin" will). Also handles "glint" matching "glints".
    const labelWords = label.split(/\s+/).filter(w => w.length > 2);
    const searchWords = [label, ...labelWords];
    let matchWord = null;
    for (const w of searchWords) {
      if (new RegExp(`${esc(w)}\\w*`, 'i').test(html)) { matchWord = w; break; }
    }

    if (matchWord) {
      let replaced = false;
      html = html.replace(new RegExp(`(${esc(matchWord)}\\w*)`, 'gi'), (match) => {
        if (replaced) return match;
        replaced = true;
        return `<span class="${cls}" data-id="${id}" onclick="window.__tap(this)">${match}</span>`;
      });
    } else {
      // Nothing in desc matches — append as tappable word (no naked unlabelled text)
      html += ` <span class="${cls}" data-id="${id}" onclick="window.__tap(this)">${label}</span>`;
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

  discovered.forEach(obj => {
    const id   = obj.id ?? obj.name;
    // Discovered chips never dim — permanent like a checklist
    const chip = makeChip(id, obj, true);
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
    // If in targeting mode, use this chip as the target
    if (_targeting) {
      window.sendText(`${_targeting.action} ${_targeting.item} ${id}`);
      stopTargeting();
      return;
    }
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
export function openHandCtx(itemId, otherHandItem) {
  if (!itemId) return;

  const def  = window.worldItems?.[itemId];
  const name = def?.name ?? itemId;

  document.querySelectorAll('.dchip').forEach(c => c.classList.remove('active'));
  _activeCtx = '__hand__';

  document.getElementById('ctx-who').textContent = (def?.emoji ? def.emoji + ' ' : '') + name;

  const btns = document.getElementById('ctx-btns');
  btns.innerHTML = '';

  const sendId = itemId.toLowerCase().replace(/\s+/g, '_');

  let handActions = def?.actions?.hand
    ? [...def.actions.hand]
    : ['look', 'use', 'throw', 'store', 'drop'];

  if (otherHandItem) {
    handActions = handActions.map(a =>
      typeof a === 'string' && a !== 'look' && a !== 'throw' && a !== 'store' && a !== 'drop'
        ? 'combine' : a
    );
  }

  // Inject skill at front if available
  const skills = def?.skills ?? [];
  if (skills.length) {
    const xp    = window._weaponXP?.[itemId] ?? 0;
    const level = xp >= 200 ? 5 : xp >= 120 ? 4 : xp >= 60 ? 3 : xp >= 20 ? 2 : 1;
    const skill = skills.find(s => level >= (s.minLevel ?? 1));
    if (skill) {
      const ready = Date.now() >= (window._skillCooldowns?.[itemId] ?? 0);
      handActions.unshift({ type: 'skill', label: `${skill.emoji} ${skill.label}`, skillId: skill.id, ready });
    }
  }

  handActions.forEach(action => {
    if (typeof action === 'object' && action.type === 'skill') {
      const b = makeActionBtn(action.label, () => {
        if (action.ready) window.sendText(`skill ${sendId} ${action.skillId}`);
        closeCtx();
      });
      if (!action.ready) b.style.opacity = '0.4';
      btns.appendChild(b);
      return;
    }
    const b = makeActionBtn(action, () => {
      if (action === 'throw')        window.sendText('throw ' + sendId);
      else if (action === 'combine') window.sendText('use ' + sendId);
      else if (action === 'look' || action === 'store' || action === 'drop')
                                     window.sendText(action + ' ' + sendId);
      else                           window.sendText('use ' + sendId);
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
  let html = msg;
  if (!msg.includes('<span') && _playersInRoom.size) {
    _playersInRoom.forEach(name => {
      if (!name) return;
      const re = new RegExp(`\\b(${name})\\b`, 'g');
      html = html.replace(re,
        `<span class="player-name" data-name="${name}" style="color:var(--accent2);cursor:pointer;border-bottom:1px dotted rgba(192,170,255,0.4);">$1</span>`
      );
    });
  }
  d.innerHTML = html;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

// ── CLEAR (on room change) ───────────────────────────────
export function clearRoom() {
  _objects   = {};
  _activeCtx = null;

  document.getElementById('room-title').textContent = '';
  document.getElementById('room-desc').innerHTML    = '';
  document.getElementById('ctx-btns').innerHTML     = '';
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
  const found   = Object.values(_objects).filter(o => o.discovered && o.native !== false).length;
  const label   = document.getElementById('discovered-label');
  const section = document.getElementById('discovered');
  if (_totalDiscoverable > 0) {
    if (label)   label.textContent = `Discovered  ${found}/${_totalDiscoverable}`;
    if (section) section.classList.remove('hidden');
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
  // Player name click
  const playerEl = e.target.closest('.player-name');
  if (playerEl) {
    e.stopPropagation();
    const name = playerEl.dataset.name;
    _activeCtx = '__player__';
    document.querySelectorAll('.dchip').forEach(c => c.classList.remove('active'));
    document.getElementById('ctx-who').textContent = '👤 ' + name;
    const btns = document.getElementById('ctx-btns');
    btns.innerHTML = '';
    const playerActions = [
      { label: 'tell',   cmd: () => { window.sendText('tell ' + name + ' '); } },
      { label: 'friend', cmd: () => { window.sendText('friend ' + name); closeCtx(); } },
      { label: 'group',  cmd: () => { window.sendText('invite ' + name); closeCtx(); } },
      { label: 'inspect',cmd: () => { window.sendText('inspect ' + name); closeCtx(); } },
    ];
    playerActions.forEach(({ label, cmd }) => {
      const b = makeActionBtn(label, cmd);
      btns.appendChild(b);
    });
    document.getElementById('ctx').classList.remove('hidden');
    return;
  }

  // Check for inv row click (the row div or the label span inside it)
  const obj = e.target.closest('.obj') || 
    (e.target.closest('.ll-sys')?.querySelector('.obj'));

  // Clicked neutral area — close ctx
  if (!obj) {
    closeCtx();
    return;
  }

  const name    = obj.dataset.name;
  const actions = (obj.dataset.actions || '').split('|').filter(Boolean);
  if (!name || !actions.length) {
    closeCtx();
    return;
  }

  e.stopPropagation();
  _activeCtx = '__inv__';
  document.querySelectorAll('.dchip').forEach(c => c.classList.remove('active'));

  const def         = window.worldItems?.[name] || {};
  const displayName = (def.emoji ? def.emoji + ' ' : '') + (def.name || name);
  document.getElementById('ctx-who').textContent = displayName;

  const btns = document.getElementById('ctx-btns');
  btns.innerHTML = '';
  actions.forEach(action => {
    const b = makeActionBtn(action, () => {
      window.sendText(action + ' ' + name);
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
      const sendId = itemId.toLowerCase().replace(/\s+/g, '_');
      actions.forEach(action => {
        const b = makeActionBtn(action, () => {
          window.sendText(action + ' ' + sendId);
          closeCtx();
        });
        btns.appendChild(b);
      });

      document.getElementById('ctx').classList.remove('hidden');
    });

    return row;
  }

  if (hands.left)  wrapper.appendChild(makeRow(hands.left,  '(left hand)',  defs?.[hands.left]?.actions?.hand      || ['look','drop','store']));
  if (hands.right) wrapper.appendChild(makeRow(hands.right, '(right hand)', defs?.[hands.right]?.actions?.hand     || ['look','drop','store']));
  bag.forEach(itemId => wrapper.appendChild(makeRow(itemId, '(bag)', defs?.[itemId]?.actions?.inventory || ['look','retrieve','drop'])));

  if (!hands.left && !hands.right && bag.length === 0) {
    wrapper.textContent = 'You are carrying nothing.';
  }

  logEl.appendChild(wrapper);
  logEl.scrollTop = logEl.scrollHeight;
}

// ── ITEM DETAIL CARD — rendered in log on look ────────────
export function renderItemDetail(pkt) {
  const el = document.getElementById('log');
  if (!el) return;
  const { itemId, def, flavour, weaponXP } = pkt;
  if (!def) return;
  const xp    = weaponXP ?? 0;
  const level = xp >= 200 ? 5 : xp >= 120 ? 4 : xp >= 60 ? 3 : xp >= 20 ? 2 : 1;
  const nextThresh = [0,20,60,120,200,999][level] ?? 999;
  const prevThresh = [0,0,20,60,120,200][level] ?? 0;
  const pct = level >= 5 ? 100 : Math.round(((xp - prevThresh) / (nextThresh - prevThresh)) * 100);
  const skills = def.skills ?? [];
  const skillRows = skills.map(s => {
    const unlocked = level >= (s.minLevel ?? 1);
    return unlocked
      ? `<div class="idc-skill"><span class="idc-skill-emoji">${s.emoji}</span><div class="idc-skill-body"><div class="idc-skill-name">${s.label}</div><div class="idc-skill-desc">${s.description}</div><div class="idc-skill-cost">🔮 ${s.manaCost} mana · ${s.cooldownMs/1000}s cooldown</div></div></div>`
      : `<div class="idc-skill locked"><span class="idc-skill-emoji" style="opacity:0.2">${s.emoji}</span><div class="idc-skill-body"><div class="idc-skill-name">${s.label}</div></div><div class="idc-lock">Lv ${s.minLevel}</div></div>`;
  }).join('');
  const xpBar = xp > 0 ? `<div class="idc-xp-label">${xp}xp · Lv${level}${level < 5 ? ' → ' + nextThresh + 'xp' : ' (max)'}</div><div class="idc-xp-bar"><div class="idc-xp-fill" style="width:${pct}%"></div></div>` : '';
  const card = document.createElement('div');
  card.className = 'll idc-card';
  card.innerHTML = `
    <div class="idc-header"><span class="idc-emoji">${def.emoji ?? ''}</span><div class="idc-title">${def.name ?? itemId}</div><div class="idc-cat">${def.category ?? ''}</div></div>
    ${flavour ? `<div class="idc-flavour">${flavour}</div>` : ''}
    ${xpBar}
    <div class="idc-stats">
      <div class="idc-stat"><div class="idc-stat-l">type</div><div class="idc-stat-v">${def.category ?? '—'}</div></div>
      <div class="idc-stat"><div class="idc-stat-l">slot</div><div class="idc-stat-v">${def.slot ?? '—'}</div></div>
      <div class="idc-stat"><div class="idc-stat-l">damage</div><div class="idc-stat-v">${def.baseDamage ?? (def.damage?.[0]?.amount ?? '—')}</div></div>
      <div class="idc-stat"><div class="idc-stat-l">dmg type</div><div class="idc-stat-v">${def.damage?.[0]?.type ?? '—'}</div></div>
    </div>
    ${skills.length ? `<div class="idc-skills-title">skills</div>${skillRows}` : ''}
  `;
  el.appendChild(card);
  el.scrollTop = el.scrollHeight;
}

// ── INVENTORY PANEL ──────────────────────────────────────
let _invData     = null;
let _invOpen     = false;
let _invSelected = null;
const PAGE_SIZE  = 5;

export function showInventory(pkt) {
  _invData = pkt;
  if (_invOpen) _renderInvPanel();
  else _openInvPanel();
}

export function toggleInventory() {
  if (_invOpen) _closeInvPanel();
  else if (_invData) _openInvPanel();
}

function _openInvPanel() {
  _invOpen     = true;
  _invSelected = null;
  _ensurePanel();
  _renderInvPanel();
  document.getElementById('inv-panel')?.classList.remove('hidden');
  document.getElementById('btn-bag')?.classList.add('active');
}

function _closeInvPanel() {
  _invOpen     = false;
  _invSelected = null;
  document.getElementById('inv-panel')?.classList.add('hidden');
  document.getElementById('btn-bag')?.classList.remove('active');
}

function _ensurePanel() {
  if (document.getElementById('inv-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'inv-panel';
  panel.className = 'hidden';
  panel.innerHTML = `
    <div id="inv-header">
      <span id="inv-title">Inventory</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span id="inv-page-label"></span>
        <button id="inv-close">✕</button>
      </div>
    </div>
    <div id="inv-action-bar" class="hidden"></div>
    <div id="inv-scroll-wrap"><div id="inv-scroll-track"></div></div>
    <div id="inv-dots"></div>
  `;
  const south = document.getElementById('dir-south');
  south?.parentNode?.insertBefore(panel, south);
  document.getElementById('inv-close').addEventListener('click', () => _closeInvPanel());
}

function _renderInvPanel() {
  const pkt = _invData;
  if (!pkt) return;
  const { hands, bag, items: defs } = pkt;

  const allItems = [];
  if (hands.left)  allItems.push({ id: hands.left,  side: 'L', loc: 'hand' });
  if (hands.right) allItems.push({ id: hands.right, side: 'R', loc: 'hand' });
  bag.forEach(id  => allItems.push({ id, side: null, loc: 'bag' }));

  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const pageLabel  = document.getElementById('inv-page-label');
  if (pageLabel) pageLabel.textContent = totalPages > 1 ? `1 / ${totalPages}` : '';

  const track = document.getElementById('inv-scroll-track');
  if (!track) return;
  track.innerHTML = '';

  for (let p = 0; p < totalPages; p++) {
    const page      = document.createElement('div');
    page.className  = 'inv-page';
    const pageItems = allItems.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);

    pageItems.forEach(item => {
      const def        = defs?.[item.id] || {};
      const isSelected = _invSelected === item.id;
      const slot       = document.createElement('div');
      slot.className   = 'inv-slot'
        + (item.side          ? ' hand-item' : '')
        + (def.glowClass === 'shiny' ? ' shiny' : '')
        + (isSelected         ? ' selected'  : '');
      slot.dataset.itemId = item.id;
      slot.innerHTML = `
        ${item.side ? `<span class="hand-badge">${item.side}</span>` : ''}
        <span class="inv-emoji">${def.emoji || '❓'}</span>
        <span class="inv-name">${def.name || item.id}</span>
      `;
      slot.addEventListener('click', () => {
        if (_invSelected === item.id) {
          _invSelected = null;
          _renderActionBar(null, null, null, null);
        } else {
          _invSelected = item.id;
          _renderActionBar(item.id, item.loc, item.side, def);
        }
        _renderInvPanel();
      });
      page.appendChild(slot);
    });

    // Empty slots to pad row
    for (let e = 0; e < PAGE_SIZE - pageItems.length; e++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot empty';
      slot.innerHTML = `<span class="inv-emoji">·</span>`;
      page.appendChild(slot);
    }
    track.appendChild(page);
  }

  // Page dots
  const dots = document.getElementById('inv-dots');
  if (dots) {
    dots.innerHTML = '';
    if (totalPages > 1) {
      for (let p = 0; p < totalPages; p++) {
        const d = document.createElement('div');
        d.className = 'inv-dot' + (p === 0 ? ' active' : '');
        dots.appendChild(d);
      }
      const wrap = document.getElementById('inv-scroll-wrap');
      if (wrap) {
        wrap.onscroll = () => {
          const cur = Math.round(wrap.scrollLeft / wrap.clientWidth);
          dots.querySelectorAll('.inv-dot').forEach((d, i) => d.classList.toggle('active', i === cur));
          if (pageLabel) pageLabel.textContent = `${cur + 1} / ${totalPages}`;
        };
      }
    }
  }

  // Set page widths for snap scrolling
  requestAnimationFrame(() => {
    const wrap = document.getElementById('inv-scroll-wrap');
    if (!wrap) return;
    document.querySelectorAll('.inv-page').forEach(p => { p.style.width = wrap.clientWidth + 'px'; });
  });

  // Re-render action bar if something selected
  if (_invSelected) {
    const found = allItems.find(i => i.id === _invSelected);
    if (found) _renderActionBar(found.id, found.loc, found.side, defs?.[found.id]);
  }
}

function _renderActionBar(itemId, loc, side, def) {
  const bar = document.getElementById('inv-action-bar');
  if (!bar) return;
  if (!itemId) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  const xp    = window._weaponXP?.[itemId] ?? 0;
  const level = xp >= 200 ? 5 : xp >= 120 ? 4 : xp >= 60 ? 3 : xp >= 20 ? 2 : 1;
  const sideLbl = side ? `${side} hand` : 'bag';
  const xpStr   = xp > 0 ? ` · Lv${level} · ${xp}xp` : '';
  const subText = `${sideLbl}${xpStr}${def?.category ? ' · ' + def.category : ''}`;
  const sendId  = itemId.toLowerCase().replace(/\s+/g, '_');
  const actions = loc === 'hand'
    ? (def?.actions?.hand      || ['look','store','drop'])
    : (def?.actions?.inventory || ['look','retrieve','drop']);
  const skills     = def?.skills ?? [];
  const skill      = skills.find(s => level >= (s.minLevel ?? 1));
  const skillReady = skill && Date.now() >= (window._skillCooldowns?.[itemId] ?? 0);
  let btnsHtml = '';
  if (skill) btnsHtml += `<button class="inv-action-btn skill${skillReady ? '' : ' dim'}" data-cmd="skill ${sendId} ${skill.id}">${skill.emoji} ${skill.label}</button>`;
  actions.forEach(a => {
    btnsHtml += `<button class="inv-action-btn${a === 'drop' ? ' danger' : ''}" data-cmd="${a} ${sendId}">${a}</button>`;
  });
  bar.innerHTML = `
    <div class="inv-action-who">${def?.emoji ?? '❓'} ${def?.name ?? itemId} <span class="inv-action-sub">${subText}</span></div>
    <div class="inv-action-btns">${btnsHtml}</div>
  `;
  bar.querySelectorAll('.inv-action-btn').forEach(btn => {
    btn.addEventListener('click', () => { window.sendText(btn.dataset.cmd); _closeInvPanel(); });
  });
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
