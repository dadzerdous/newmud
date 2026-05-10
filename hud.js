// ════════════════════════════════════════
// hud.js — HUD stats + hands + combat
// Single source of truth: _combatState
// ════════════════════════════════════════

let _hands       = { left: null, right: null };
let _wielding    = { left: false, right: false };
let _combatState = 'idle'; // idle | notice | approach | melee
let _atbTimers   = { left: null, right: null };

function getAtbSpeed(itemId) {
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
    if (data.mana    != null) setText('stat-mana',    `🔮${data.mana}`);
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

    // ATB — only runs in melee
    if (_combatState === 'melee') {
        if (_wielding.left  && _hands.left)  startAtb('left');
        if (_wielding.right && _hands.right) startAtb('right');
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
        if (_combatState !== 'melee' || !_wielding[side]) return;
        // Auto-fire
        window.sendText('attack ' + _hands[side]);
        el.classList.remove('atb-filling');
        el.classList.add('atb-ready');
        setTimeout(() => {
            el.classList.remove('atb-ready');
            if (_combatState === 'melee' && _wielding[side]) startAtb(side);
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

        const itemEmoji  = _hands[side] ? (def?.emoji ?? '❓') : (side === 'left' ? '✋' : '🤚');
        const skillEmoji = getSkillEmoji(side);
        const onCooldown = isSkillOnCooldown(side);

        // Build pill content: skill leads for left, trails for right
        if (skillEmoji) {
            const skillSpan = `<span style="font-size:13px;opacity:${onCooldown ? '0.25' : '1'}">${skillEmoji}</span>`;
            el.innerHTML = side === 'left'
                ? `${skillSpan}${itemEmoji}`
                : `${itemEmoji}${skillSpan}`;
        } else {
            el.textContent = itemEmoji;
        }

        el.dataset.held = _hands[side] ?? '';
        el.dataset.hand = side;
        el.classList.toggle('wielding',   !!_wielding[side]);
        el.classList.toggle('glow-shiny', def?.glowClass === 'shiny');
        // Gold glow when skill is ready
        el.classList.toggle('skill-ready', !!skillEmoji && !onCooldown);
    });
}

// Returns the skill emoji for a hand if skill is unlocked, else null
function getSkillEmoji(side) {
    const itemId = _hands[side];
    if (!itemId) return null;
    const def = window.worldItems?.[itemId];
    const skills = def?.skills;
    if (!skills?.length) return null;
    // Check weapon XP level to see if skill is unlocked
    const xp    = window._weaponXP?.[itemId] ?? 0;
    const level = weaponLevel(xp);
    const skill = skills.find(s => level >= (s.minLevel ?? 1));
    return skill?.emoji ?? null;
}

function isSkillOnCooldown(side) {
    const itemId = _hands[side];
    if (!itemId) return false;
    const cooldowns = window._skillCooldowns ?? {};
    const expires   = cooldowns[itemId] ?? 0;
    return Date.now() < expires;
}

function weaponLevel(xp) {
    if (xp >= 200) return 5;
    if (xp >= 120) return 4;
    if (xp >=  60) return 3;
    if (xp >=  20) return 2;
    return 1;
}

// ── RENDER BOTBAR ─────────────────────────────────────────
function renderBotbar() {
    // notice = narrative only — show normal botbar
    const inCombat  = _combatState === 'ranged' || _combatState === 'melee';
    const bagBtn    = document.getElementById('btn-bag');
    const quitBtn   = document.getElementById('btn-quit');
    const retreatBtn= document.getElementById('btn-retreat');

    if (inCombat) {
        bagBtn?.setAttribute('disabled', true);
        bagBtn?.classList.add('locked');
        quitBtn?.classList.add('hidden');
        retreatBtn?.classList.remove('hidden');
    } else {
        bagBtn?.removeAttribute('disabled');
        bagBtn?.classList.remove('locked');
        quitBtn?.classList.remove('hidden');
        retreatBtn?.classList.add('hidden');
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ── SKILL COOLDOWN — called from client.js on skill_cooldown packet ──
export function applySkillCooldown(itemId, durationMs) {
    if (!window._skillCooldowns) window._skillCooldowns = {};
    window._skillCooldowns[itemId] = Date.now() + durationMs;
    renderHands();
    // Re-render after cooldown expires
    setTimeout(() => renderHands(), durationMs + 50);
}

// ── WEAPON XP — called from client.js on weapon_xp packet ──
export function updateWeaponXP(weaponXP) {
    window._weaponXP = weaponXP;
    renderHands();
}
