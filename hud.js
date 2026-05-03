// ════════════════════════════════════════
// hud.js — HUD stats + hands display
// ════════════════════════════════════════

let _hands = { left: null, right: null };

export function updateHUD(data) {
  if (!data) return;

  if (data.name || data.race || data.pronoun) {
    const el = document.getElementById('hud-name');
    if (el) el.textContent = `${data.name}@${data.race}.${data.pronoun}`;
    document.getElementById('game')?.classList.remove('hidden');
  }

  if (data.level   != null) setText('stat-level',  `Lv ${data.level}`);
  if (data.energy  != null) setText('stat-energy',  `⚡${data.energy}`);
  if (data.stamina != null) setText('stat-stamina', `💪${data.stamina}`);
}

export function setHands(hands) {
  _hands = hands ?? { left: null, right: null };
  renderHands();
}

// Legacy — called by old held packet
export function setHeld(id) {
  _hands.left = id ?? null;
  renderHands();
}

function renderHands() {
  const leftEl  = document.getElementById('hand-l');
  const rightEl = document.getElementById('hand-r');

  if (leftEl) {
    const def = window.worldItems?.[_hands.left];
    leftEl.textContent   = _hands.left  ? (def?.emoji ?? '❓') : '✋';
    leftEl.dataset.held  = _hands.left  ?? '';
    leftEl.dataset.hand  = 'left';
  }

  if (rightEl) {
    const def = window.worldItems?.[_hands.right];
    rightEl.textContent  = _hands.right ? (def?.emoji ?? '❓') : '🤚';
    rightEl.dataset.held = _hands.right ?? '';
    rightEl.dataset.hand = 'right';
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
