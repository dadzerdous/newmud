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
    window._hands = _hands; // expose for combat panel headers
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
        if (leftShouldFire && !_atbTimers.left) startAtb('left');
        if (rightShouldFire && !_atbTimers.right) {
            const rightSpeed = getAtbSpeed(_hands.right);
            if (!_atbTimers['_atbStagger']) {
                _atbTimers['_atbStagger'] = setTimeout(() => {
                    _atbTimers['_atbStagger'] = null;
                    if (_combatState === 'melee' && !_atbTimers.right) startAtb('right');
                }, Math.floor(rightSpeed / 2));
            }
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
    if (side === 'right' && _atbTimers['_atbStagger']) {
        clearTimeout(_atbTimers['_atbStagger']);
        _atbTimers['_atbStagger'] = null;
    }
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
    const inCombat = _combatState === 'ranged' || _combatState === 'melee';

    ['left', 'right'].forEach(side => {
        const el  = document.getElementById(`hand-${side[0]}`);
        const def = window.worldItems?.[_hands[side]];
        if (!el) return;

        const itemEmoji = _hands[side] ? (def?.emoji ?? '❓') : (side === 'left' ? '✋' : '🤚');

        // Out of combat: show skill emoji on pill if skill available
        if (!inCombat) {
            const skill = getSkillForSide(side);
            if (skill) {
                el.innerHTML = side === 'left'
                    ? `<span style="font-size:13px">${skill.emoji}</span>${itemEmoji}`
                    : `${itemEmoji}<span style="font-size:13px">${skill.emoji}</span>`;
            } else {
                el.textContent = itemEmoji;
            }
        } else {
            // In combat: weapon pill is clean, skill has its own pill
            el.textContent = itemEmoji;
        }

        el.dataset.held = _hands[side] ?? '';
        el.dataset.hand = side;
        el.classList.toggle('wielding',   !!_wielding[side]);
        el.classList.toggle('glow-shiny', def?.glowClass === 'shiny');
    });

    renderSkillPills();
}

// ── RENDER SKILL PILLS ────────────────────────────────────
function renderSkillPills() {
    const inCombat = _combatState === 'ranged' || _combatState === 'melee';

    ['left', 'right'].forEach(side => {
        const btn    = document.getElementById(`skill-${side[0]}`);
        if (!btn) return;

        const itemId = _hands[side];
        const def    = itemId ? window.worldItems?.[itemId] : null;
        const skills = def?.skills ?? [];

        if (!inCombat || !skills.length) {
            // Out of combat or no skills — hide pill entirely
            btn.classList.add('hidden');
            btn.classList.remove('ready', 'charging', 'no-skill');
            return;
        }

        // Check if skill is unlocked at current weapon level
        const xp    = window._weaponXP?.[itemId] ?? 0;
        const level = weaponLevel(xp);
        const skill = skills.find(s => level >= (s.minLevel ?? 1));

        if (!skill) {
            // Has skills but not unlocked yet — show dimmed placeholder
            btn.classList.remove('hidden', 'ready', 'charging');
            btn.classList.add('no-skill');
            btn.textContent = '·';
            return;
        }

        // Skill exists — check cooldown
        const cds     = window._skillCooldowns ?? {};
        const expires = cds[itemId] ?? 0;
        const onCD    = Date.now() < expires;

        btn.classList.remove('hidden', 'no-skill');
        btn.textContent = skill.emoji;
        btn.dataset.itemId  = itemId;
        btn.dataset.skillId = skill.id;

        if (onCD) {
            btn.classList.add('charging');
            btn.classList.remove('ready');
        } else {
            btn.classList.add('ready');
            btn.classList.remove('charging');
        }
    });
}

// Returns skill def for a hand if unlocked, else null
function getSkillForSide(side) {
    const itemId = _hands[side];
    if (!itemId) return null;
    const def    = window.worldItems?.[itemId];
    const skills = def?.skills;
    if (!skills?.length) return null;
    const xp    = window._weaponXP?.[itemId] ?? 0;
    const level = weaponLevel(xp);
    return skills.find(s => level >= (s.minLevel ?? 1)) ?? null;
}

function isSkillOnCooldown(side) {
    const itemId = _hands[side];
    if (!itemId) return false;
    return Date.now() < (window._skillCooldowns?.[itemId] ?? 0);
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

    renderSkillPills();
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ── RESET COMBAT STATE — called from client.js on room packet ──
export function resetCombatState() {
    _combatState = 'idle';
    stopAtb('left');
    stopAtb('right');
    renderHands();
    renderBotbar();
}

// ── SKILL COOLDOWN — called from client.js on skill_cooldown packet ──
export function applySkillCooldown(itemId, durationMs) {
    if (!window._skillCooldowns) window._skillCooldowns = {};
    window._skillCooldowns[itemId] = Date.now() + durationMs;

    // Animate skill pill: charging class triggers dim→undim over cooldown duration
    ['left','right'].forEach(side => {
        if (_hands[side] !== itemId) return;
        const btn = document.getElementById(`skill-${side[0]}`);
        if (!btn) return;
        btn.classList.remove('ready');
        btn.classList.add('charging');
        btn.style.setProperty('--skill-duration', `${durationMs}ms`);
    });

    // Re-render when cooldown expires
    setTimeout(() => renderSkillPills(), durationMs + 50);
}

// ── WEAPON XP — called from client.js on weapon_xp packet ──
export function updateWeaponXP(weaponXP) {
    window._weaponXP = weaponXP;
    renderHands();
}
