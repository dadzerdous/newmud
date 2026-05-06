// ════════════════════════════════════════
// hud.js — HUD stats + hands display
// ════════════════════════════════════════

let _hands   = { left: null, right: null };
let _wielding = { left: false, right: false };
let _inCombat = false;

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
  // Un-wield any hand that's now empty
  if (!_hands.left)  _wielding.left  = false;
  if (!_hands.right) _wielding.right = false;
  renderHands();
}

// Called by room packet — show wield buttons only if combatants present
export function updateCombatState(hasCombatants, inCombat) {
  _inCombat = inCombat ?? false;
  renderWieldButtons(hasCombatants ?? false);
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
    leftEl.classList.toggle('wielding', _wielding.left);
  }

  if (rightEl) {
    const def = window.worldItems?.[_hands.right];
    rightEl.textContent  = _hands.right ? (def?.emoji ?? '❓') : '🤚';
    rightEl.dataset.held = _hands.right ?? '';
    rightEl.dataset.hand = 'right';
    rightEl.classList.toggle('wielding', _wielding.right);
  }
}

function renderWieldButtons(hasCombatants) {
  ['left', 'right'].forEach(side => {
    const btn  = document.getElementById(`wield-${side[0]}`);
    const item = _hands[side];
    const def  = item ? window.worldItems?.[item] : null;
    const wieldable = def?.wieldable ?? (def?.category === 'weapon');

    if (!btn) return;

    if (_inCombat) {
      // In combat — show flee on whichever side is wielding
      if (_wielding[side]) {
        btn.textContent = 'flee';
        btn.classList.add('flee');
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    } else if (hasCombatants && item && wieldable) {
      // Enemy present, not in combat yet — show wield
      btn.textContent = 'wield';
      btn.classList.remove('flee', 'hidden');
    } else {
      btn.classList.add('hidden');
    }
  });
}

// Called from main.js click handlers
export function toggleWield(hand) {
  if (!_hands[hand]) return;
  _wielding[hand] = !_wielding[hand];
  renderHands();
  renderWieldButtons(true); // stay visible while toggling
  // Tell server
  window.sendText(_wielding[hand] ? `wield ${_hands[hand]}` : `unwield ${_hands[hand]}`);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
