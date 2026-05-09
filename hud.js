// ════════════════════════════════════════
// hud.js — HUD stats + hands + combat
// Single source of truth: _combatState
// ════════════════════════════════════════

let _hands       = { left: null, right: null };
let _wielding    = { left: false, right: false };
let _combatState = 'idle'; // idle | notice | approach | melee
let _atbTimers   = { left: null, right: null };

function getAtbSpeed(itemId) {
    if (!itemId) return 4000; // unarmed — slower than any weapon
    return window.worldItems?.[itemId]?.atbSpeed ?? 2500;
}

// ── HUD ──────────────────────────────────────────────────
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
    if (data.hp      != null) setText('stat-hp',      `❤️${data.hp}`);
}

// ── HANDS ────────────────────────────────────────────────
export function setHands(hands) {
    _hands = hands ?? { left: null, right: null };
    if (!_hands.left)  { _wielding.left  = false; stopAtb('left');  }
    if (!_hands.right) { _wielding.right = false; stopAtb('right'); }
    renderHands();
    renderBotbar();
}

export function setHeld(id) {
    _hands.left = id ?? null;
    renderHands();
}

// ── COMBAT STATE ─────────────────────────────────────────
// Called from client.js on every 'combat' packet
export function handleCombatPacket(pkt) {
    const prev = _combatState;
    _combatState = pkt.stage ?? 'idle';

    if (pkt.playerHp != null) setText('stat-hp', `❤️${pkt.playerHp}`);

    renderHands();
    renderBotbar();

    // ATB — runs in melee for wielded weapons AND empty hands (unarmed)
    if (_combatState === 'melee') {
        const leftShouldFire  = _wielding.left  || !_hands.left;
        const rightShouldFire = _wielding.right || !_hands.right;
        if (leftShouldFire)  startAtb('left');
        if (rightShouldFire) {
            // Stagger right hand by half its ATB speed so hands don't fire together
            const rightSpeed = getAtbSpeed(_hands.right);
            setTimeout(() => {
                if (_combatState === 'melee') startAtb('right');
            }, Math.floor(rightSpeed / 2));
        }
    } else {
        stopAtb('left');
        stopAtb('right');
    }
}

// Called from client.js on 'room' packet — only updates hasCombatants hint
export function updateCombatState(hasCombatants) {
    // Don't override active combat stage from room packets
    renderBotbar();
}

// ── ATB ──────────────────────────────────────────────────
function startAtb(side) {
    stopAtb(side);
    const el    = document.getElementById(`hand-${side[0]}`);
    const speed = getAtbSpeed(_hands[side]);
    if (!el) return;

    el.classList.remove('atb-ready');
    el.classList.add('atb-filling');
    el.style.setProperty('--atb-duration', `${speed}ms`);

    _atbTimers[side] = setTimeout(() => {
        const isUnarmed = !_hands[side];
        if (_combatState !== 'melee') return;
        if (!isUnarmed && !_wielding[side]) return;
        // Fire attack — send item id, or 'unarmed-left'/'unarmed-right' if empty hand
        const attackArg = _hands[side] || `unarmed-${side}`;
        window.sendText('attack ' + attackArg);
        el.classList.remove('atb-filling');
        el.classList.add('atb-ready');
        setTimeout(() => {
            el.classList.remove('atb-ready');
            const shouldContinue = _combatState === 'melee' && (_wielding[side] || !_hands[side]);
            if (shouldContinue) startAtb(side);
        }, 300);
    }, speed);
}

function stopAtb(side) {
    if (_atbTimers[side]) { clearTimeout(_atbTimers[side]); _atbTimers[side] = null; }
    const el = document.getElementById(`hand-${side[0]}`);
    if (el) el.classList.remove('atb-filling', 'atb-ready');
}

// ── WIELD ────────────────────────────────────────────────
export function toggleWield(hand) {
    if (!_hands[hand]) return;
    _wielding[hand] = !_wielding[hand];
    renderHands();
    renderBotbar();
    window.sendText(_wielding[hand] ? `wield ${_hands[hand]}` : `unwield ${_hands[hand]}`);
}

// Sync from server 'wielding' packet
window._syncWielding = function(wielding) {
    _wielding.left  = !!(wielding?.[_hands.left]);
    _wielding.right = !!(wielding?.[_hands.right]);
    renderHands();
    renderBotbar();
    if (_combatState === 'melee') {
        if (_wielding.left  && _hands.left)  startAtb('left');
        if (_wielding.right && _hands.right) startAtb('right');
    }
};

// ── RENDER HANDS ─────────────────────────────────────────
function renderHands() {
    ['left', 'right'].forEach(side => {
        const el  = document.getElementById(`hand-${side[0]}`);
        const def = window.worldItems?.[_hands[side]];
        if (!el) return;
        el.textContent  = _hands[side] ? (def?.emoji ?? '❓') : (side === 'left' ? '✋' : '🤚');
        el.dataset.held = _hands[side] ?? '';
        el.dataset.hand = side;
        el.classList.toggle('wielding',   !!_wielding[side]);
        el.classList.toggle('glow-shiny', def?.glowClass === 'shiny');
    });
}

// ── RENDER BOTBAR ─────────────────────────────────────────
function renderBotbar() {
    const inCombat = _combatState !== 'idle';
    const bagBtn    = document.getElementById('btn-bag');
    const quitBtn   = document.getElementById('btn-quit');
    const retreatBtn= document.getElementById('btn-retreat');
    const skillL    = document.getElementById('skill-l');
    const skillR    = document.getElementById('skill-r');

    if (inCombat) {
        bagBtn?.setAttribute('disabled', true);
        bagBtn?.classList.add('locked');
        quitBtn?.classList.add('hidden');
        retreatBtn?.classList.remove('hidden');
        skillL?.classList.remove('hidden');
        skillR?.classList.remove('hidden');

        // Skill slots — show item emoji or locked placeholder
        ['left', 'right'].forEach(side => {
            const btn = side === 'left' ? skillL : skillR;
            if (!btn) return;
            const item = _hands[side];
            const def  = item ? window.worldItems?.[item] : null;
            const skill = def?.skills?.[0];
            if (_wielding[side] && skill) {
                btn.textContent = skill.emoji ?? '⚔️';
                btn.classList.remove('dim');
                btn.dataset.skill = skill.label ?? '';
                btn.dataset.item  = item;
            } else if (_wielding[side] && item) {
                btn.textContent = def?.emoji ?? '⚔️';
                btn.classList.add('dim');
                btn.dataset.skill = '';
            } else {
                btn.textContent = '·';
                btn.classList.add('dim');
                btn.dataset.skill = '';
            }
        });

    } else {
        bagBtn?.removeAttribute('disabled');
        bagBtn?.classList.remove('locked');
        quitBtn?.classList.remove('hidden');
        retreatBtn?.classList.add('hidden');
        skillL?.classList.add('hidden');
        skillR?.classList.add('hidden');
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
