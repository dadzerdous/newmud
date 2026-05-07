// ════════════════════════════════════════
// hud.js — HUD stats + hands + combat
// ════════════════════════════════════════

let _hands    = { left: null, right: null };
let _wielding = { left: false, right: false };
let _inCombat = false;
let _combatStage = null;  // 'notice' | 'approach' | 'melee' | null
let _atbTimers = { left: null, right: null };
let _atbReady  = { left: false, right: false };

// ATB fill intervals (ms) per item — fallback 2500
function getAtbSpeed(itemId) {
    const def = window.worldItems?.[itemId];
    return def?.atbSpeed ?? 2500;
}

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

export function setHands(hands) {
    _hands = hands ?? { left: null, right: null };
    if (!_hands.left)  { _wielding.left  = false; stopAtb('left'); }
    if (!_hands.right) { _wielding.right = false; stopAtb('right'); }
    renderHands();
}

export function setHeld(id) {
    _hands.left = id ?? null;
    renderHands();
}

// ── COMBAT STATE ─────────────────────────────────────────
export function updateCombatState(hasCombatants, inCombat, stage) {
    // Only update from room packet if not currently in combat
    // (combat packet is authoritative once fighting starts)
    if (!_inCombat) {
        _combatStage = stage ?? null;
    }
    renderHands();
    renderCombatBar(hasCombatants ?? false);
}

// Called by client.js when combat packet arrives
export function handleCombatPacket(pkt) {
    _combatStage = pkt.stage;           // null = combat over
    _inCombat    = !!pkt.stage;

    renderHands();
    renderCombatBar(true);

    // Start ATB when melee begins
    if (pkt.stage === 'melee') {
        if (_wielding.left  && _hands.left)  startAtb('left');
        if (_wielding.right && _hands.right) startAtb('right');
    } else {
        stopAtb('left');
        stopAtb('right');
    }

    // Update HP display
    if (pkt.playerHp != null) setText('stat-hp', `❤️${pkt.playerHp}`);
    if (pkt.npcId && pkt.npcHp != null) {
        setText('stat-npc-hp', `💀${pkt.npcHp}`);
    }
}

// ── ATB ──────────────────────────────────────────────────
function startAtb(side) {
    stopAtb(side);
    _atbReady[side] = false;
    const el = document.getElementById(`hand-${side[0]}`);
    if (!el) return;

    const speed = getAtbSpeed(_hands[side]);
    el.classList.remove('atb-ready');
    el.classList.add('atb-filling');

    // CSS animation drives the fill — we just set duration
    el.style.setProperty('--atb-duration', `${speed}ms`);
    el.style.animationPlayState = 'running';

    _atbTimers[side] = setTimeout(() => {
        // Auto-fire attack, then restart ATB loop
        const item = _hands[side];
        if (item && _wielding[side] && _combatStage === 'melee') {
            window.sendText('attack ' + item);
            // Restart ATB after a brief flash
            el.classList.remove('atb-filling');
            el.classList.add('atb-ready');
            setTimeout(() => {
                el.classList.remove('atb-ready');
                startAtb(side);
            }, 300);
        } else {
            _atbReady[side] = true;
            el.classList.remove('atb-filling');
            el.classList.add('atb-ready');
        }
    }, speed);
}

function stopAtb(side) {
    if (_atbTimers[side]) { clearTimeout(_atbTimers[side]); _atbTimers[side] = null; }
    _atbReady[side] = false;
    const el = document.getElementById(`hand-${side[0]}`);
    if (el) {
        el.classList.remove('atb-filling', 'atb-ready');
        el.style.animationPlayState = '';
    }
}

export function isAtbReady(side) { return _atbReady[side]; }

// ── WIELD ────────────────────────────────────────────────
export function toggleWield(hand) {
    if (!_hands[hand]) return;
    _wielding[hand] = !_wielding[hand];
    renderHands();
    renderCombatBar(true);
    window.sendText(_wielding[hand] ? `engage ${_hands[hand]}` : `disengage ${_hands[hand]}`);
}

// ── RENDER ───────────────────────────────────────────────
function renderHands() {
    ['left', 'right'].forEach(side => {
        const el  = document.getElementById(`hand-${side[0]}`);
        const def = window.worldItems?.[_hands[side]];
        if (!el) return;
        el.textContent = _hands[side] ? (def?.emoji ?? '❓') : (side === 'left' ? '✋' : '🤚');
        el.dataset.held = _hands[side] ?? '';
        el.dataset.hand = side;
        el.classList.toggle('wielding',   !!_wielding[side]);
        el.classList.toggle('glow-shiny', def?.glowClass === 'shiny');
    });
}

function renderCombatBar(hasCombatants) {
    const inCombat  = _inCombat || !!_combatStage;
    const bar       = document.getElementById('botbar');
    const bagBtn    = document.getElementById('btn-bag');
    const quitBtn   = document.getElementById('btn-quit');
    const retreatBtn= document.getElementById('btn-retreat');
    const skillL    = document.getElementById('skill-l');
    const skillR    = document.getElementById('skill-r');

    if (!bar) return;

    if (inCombat) {
        // Transform botbar for combat
        bagBtn?.classList.add('locked');
        bagBtn && (bagBtn.disabled = true);
        quitBtn?.classList.add('hidden');
        retreatBtn?.classList.remove('hidden');
        skillL?.classList.remove('hidden');
        skillR?.classList.remove('hidden');

        // Update skill buttons per wielded item
        ['left', 'right'].forEach(side => {
            const btn   = side === 'left' ? skillL : skillR;
            if (!btn) return;
            const item  = _hands[side];
            const def   = item ? window.worldItems?.[item] : null;
            const skill = def?.skills?.[0]; // first unlocked skill
            if (_wielding[side] && skill) {
                btn.textContent = skill.emoji ?? skill.label ?? '⚔️';
                btn.classList.remove('dim');
                btn.dataset.skill = skill.label;
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

        // Engage buttons hidden in combat
        document.getElementById('wield-l')?.classList.add('hidden');
        document.getElementById('wield-r')?.classList.add('hidden');

    } else {
        // Normal mode
        bagBtn?.classList.remove('locked');
        bagBtn && (bagBtn.disabled = false);
        quitBtn?.classList.remove('hidden');
        retreatBtn?.classList.add('hidden');
        skillL?.classList.add('hidden');
        skillR?.classList.add('hidden');

        // Show engage buttons if combatants in room
        renderEngageButtons(hasCombatants);
    }
}

function renderEngageButtons(hasCombatants) {
    ['left', 'right'].forEach(side => {
        const btn  = document.getElementById(`wield-${side[0]}`);
        const item = _hands[side];
        const def  = item ? window.worldItems?.[item] : null;
        const wieldable = def?.wieldable ?? (def?.category === 'weapon');
        if (!btn) return;
        if (hasCombatants && item && wieldable) {
            btn.textContent = 'engage';
            btn.classList.remove('flee', 'hidden');
        } else {
            btn.classList.add('hidden');
        }
    });
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// Sync wielding state from server packet
window._syncWielding = function(wielding) {
    _wielding.left  = !!(wielding && _hands.left  && wielding[_hands.left]);
    _wielding.right = !!(wielding && _hands.right && wielding[_hands.right]);
    renderHands();
    renderCombatBar(true);
    // Restart ATB for newly wielded items if in melee
    if (_combatStage === 'melee') {
        if (_wielding.left  && _hands.left)  startAtb('left');
        if (_wielding.right && _hands.right) startAtb('right');
    }
};
