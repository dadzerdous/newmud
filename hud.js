// ════════════════════════════════════════
// hud.js — HUD stats + hand display
// ════════════════════════════════════════

let _held = null;

export function updateHUD(data) {
  if (!data) return;

  if (data.name || data.race || data.pronoun) {
    const name = data.name ?? '';
    const race = data.race ?? '';
    const pron = data.pronoun ?? '';
    const el   = document.getElementById('hud-name');
    if (el) el.textContent = `${name}@${race}.${pron}`;
    document.getElementById('game')?.classList.remove('hidden');
  }

  if (data.level   != null) setText('stat-level',   `Lv ${data.level}`);
  if (data.energy  != null) setText('stat-energy',  `⚡${data.energy}`);
  if (data.stamina != null) setText('stat-stamina',  `💪${data.stamina}`);
}

export function setHeld(id) {
  _held = id ?? null;
  const el  = document.getElementById('hand-l');
  if (!el) return;

  if (!_held) {
    el.textContent    = '✋';
    el.dataset.held   = '';
    return;
  }

  const def         = window.worldItems?.[_held];
  el.textContent    = def?.emoji ?? '❓';
  el.dataset.held   = _held;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
