// ════════════════════════════════════════
// auth.js — Login / create modal + themes
// ════════════════════════════════════════

const RACE_PRONOUNS = {
  goblin: ['they','it'],
  human:  ['he','she','they','it'],
  elf:    ['he','she'],
};

let _onCreate = null;
let _onLogin  = null;
let _mode     = 'create';
let _race     = null;
let _pronoun  = null;

export function bindAuth(onCreate, onLogin) {
  _onCreate = onCreate;
  _onLogin  = onLogin;
}

export function showAuth(mode) {
  _mode    = mode;
  _race    = null;
  _pronoun = null;

  document.getElementById('modal-title').textContent =
    mode === 'create' ? 'Create a Being' : 'Login';

  document.getElementById('a-name').value       = '';
  document.getElementById('a-pass').value       = '';
  document.getElementById('a-err').textContent  = '';

  document.querySelectorAll('.choice').forEach(b => b.classList.remove('on'));

  document.getElementById('race-label').style.display      = '';
  document.getElementById('race-choices').style.display    = '';
  document.getElementById('pronoun-label').style.display   = '';
  document.getElementById('pronoun-choices').style.display = '';

  document.querySelectorAll('[data-val]').forEach(b => {
    if (b.closest('#pronoun-choices')) b.style.display = '';
  });

  document.getElementById('welcome').classList.add('hidden');
  document.getElementById('overlay').classList.remove('hidden');
 — race:${_race} pronoun:${_pronoun}`);
}

export function hideAuth() {
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('welcome').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
}

export function applyTheme(race) {
  const map  = { goblin:'goblin', elf:'elven', human:'human' };
  const link = document.getElementById('theme-css');
  if (link) link.href = `themes/${map[race] ?? 'default'}.css`;
}

// ── RACE ─────────────────────────────────────────────────
document.querySelectorAll('#race-choices .choice').forEach(btn => {
  btn.addEventListener('click', () => {
    _race = btn.dataset.val;
    document.querySelectorAll('#race-choices .choice').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    const allowed = RACE_PRONOUNS[_race] ?? [];
    _pronoun = null;
    document.querySelectorAll('#pronoun-choices .choice').forEach(b => {
      const show = allowed.includes(b.dataset.val);
      b.style.display = show ? '' : 'none';
      if (!show) b.classList.remove('on');
    });
  });
});

// ── PRONOUN ───────────────────────────────────────────────
document.querySelectorAll('#pronoun-choices .choice').forEach(btn => {
  btn.addEventListener('click', () => {
    _pronoun = btn.dataset.val;
    document.querySelectorAll('#pronoun-choices .choice').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
  });
});

// ── CONFIRM ───────────────────────────────────────────────
function doConfirm() {
  const name = document.getElementById('a-name').value.trim();
  const pass = document.getElementById('a-pass').value.trim();
  const err  = document.getElementById('a-err');

  err.style.cssText = 'color:#ff4040;font-size:13px;text-align:center;padding:4px;';
  err.textContent   = '';

  if (name.length < 3)  { err.textContent = `Name too short (${name.length} chars, need 3)`; return; }
  if (pass.length < 4)  { err.textContent = `Password too short (${pass.length} chars, need 4)`; return; }
  if (!_race)           { err.textContent = 'Pick a race first'; return; }
  if (!_pronoun)        { err.textContent = 'Pick pronouns first'; return; }

  if (_mode === 'create') {
    _onCreate?.(name, pass, _race, _pronoun);
  } else {
    _onLogin?.(`${name.toLowerCase()}@${_race}.${_pronoun}`, pass);
  }
}

document.getElementById('a-confirm').addEventListener('click', doConfirm);

['a-name','a-pass'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') doConfirm();
  });
});

// ── CANCEL ────────────────────────────────────────────────
document.getElementById('a-cancel').addEventListener('click', () => {
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('welcome').classList.remove('hidden');
});
