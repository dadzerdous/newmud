// ===============================================
// core/room.js
// ===============================================
console.log("🟣 core/room.js LOADED — v1.25 (roomDesc) 🟣");

const Sessions = require("./sessions");
const Accounts  = require("./accounts");
const World     = require("./world");

// ── RESET TIMERS ─────────────────────────────────────────
const resetTimers  = {};   // roomId → setTimeout handle
const decayTimers  = {};   // roomId → setTimeout handle
const resetVotes   = {};   // roomId → Set of loginIds

const DEFAULT_RESET_MS = 5 * 60 * 1000;   // 5 min
const DEFAULT_DECAY_MS = 10 * 60 * 1000;  // 10 min

function scheduleReset(roomId) {
    const room = World.rooms[roomId];
    if (!room || room.noReset) return;

    const ms = (room.resetTime ?? 300) * 1000;

    if (resetTimers[roomId]) clearTimeout(resetTimers[roomId]);
    resetTimers[roomId] = setTimeout(() => {
        // Only reset if still empty
        const occupied = [...Sessions.sessions.values()]
            .some(s => s.room === roomId && s.state === 'ready');
        if (!occupied) resetRoom(roomId, null);
    }, ms);
}

function cancelReset(roomId) {
    if (resetTimers[roomId]) {
        clearTimeout(resetTimers[roomId]);
        delete resetTimers[roomId];
    }
    delete resetVotes[roomId];
}

function scheduleItemDecay(roomId) {
    const room = World.rooms[roomId];
    if (!room) return;
    const ms = (room.itemDecayTime ?? 600) * 1000;

    if (decayTimers[roomId]) clearTimeout(decayTimers[roomId]);
    decayTimers[roomId] = setTimeout(() => {
        if (!room.items) return;
        const before = room.items.length;
        room.items = room.items.filter(i => i.originRoom === roomId || !i.droppedAt);
        if (room.items.length !== before) {
            console.log(`[DECAY] ${roomId}: removed ${before - room.items.length} foreign items`);
        }
    }, ms);
}

function resetRoom(roomId, triggerSocket) {
    const room = World.rooms[roomId];
    if (!room) return;

    console.log(`[RESET] ${roomId}`);

    // Remove all non-native (foreign dropped) items
    if (room.items) {
        room.items = room.items.filter(i => i.originRoom === roomId);
    }

    // Re-spawn ambient items up to max
    const { ensureAmbientItems } = require('./itemSpawner');
    if (room.items) room.items = room.items.filter(i => !i.originRoom || i.originRoom === roomId);
    ensureAmbientItems(room);

    // Reset NPC state (future combat)
    if (room.npcs) {
        room.npcs.forEach(npc => { npc.state = 'idle'; });
    }

    // Notify players in room
    const playersHere = [...Sessions.sessions.entries()]
        .filter(([,s]) => s.room === roomId && s.state === 'ready');

    playersHere.forEach(([sock, s]) => {
        const acc  = Accounts.data[s.loginId];
        const race = acc?.race ?? 'human';
        const msg  = room.resetMsgByRace?.[race]
            || room.resetMsg
            || 'The area settles. Something has shifted.';
        Sessions.sendSystem(sock, msg);
        sendRoom(sock, roomId);
    });

    delete resetTimers[roomId];
    delete resetVotes[roomId];
}

// ── RESET VOTE ────────────────────────────────────────────
function handleResetVote(socket, sess) {
    const roomId = sess.room;
    const room   = World.rooms[roomId];
    if (!room || room.noReset) return;

    const playersHere = [...Sessions.sessions.entries()]
        .filter(([,s]) => s.room === roomId && s.state === 'ready');

    if (!resetVotes[roomId]) resetVotes[roomId] = new Set();
    resetVotes[roomId].add(sess.loginId);

    const voteCount   = resetVotes[roomId].size;
    const playerCount = playersHere.length;

    if (voteCount >= playerCount) {
        // All agree — reset now
        Sessions.broadcastToRoomExcept(roomId, 'The room resets...', socket);
        Sessions.sendSystem(socket, 'The room resets...');
        resetRoom(roomId, socket);
    } else {
        Sessions.sendSystem(socket,
            `Reset vote: ${voteCount}/${playerCount}. Waiting for others.`);
        Sessions.broadcastToRoomExcept(roomId,
            `${Accounts.data[sess.loginId]?.name ?? 'Someone'} votes to reset the room (${voteCount}/${playerCount}).`,
            socket);
    }
}

function handleResetCancel(socket, sess) {
    const roomId = sess.room;
    if (resetVotes[roomId]) {
        resetVotes[roomId].delete(sess.loginId);
        if (resetVotes[roomId].size === 0) delete resetVotes[roomId];
    }
    Sessions.sendSystem(socket, 'Reset vote withdrawn.');
}

function oppositeDirection(dir) {
    return { north:"south", south:"north", east:"west", west:"east" }[dir] || "somewhere";
}

function getRoom(roomId) {
    return World.rooms[roomId];
}

function sendRoom(socket, id) {
    const sess = Sessions.get(socket);
    if (!sess) { console.log("❌ sendRoom: no session"); return; }

    console.log("[SEND ROOM]", id, "state:", sess.state);

    const acc  = Accounts.data[sess.loginId];
    const race = acc?.race;
    const room = World.rooms[id];

    if (!room) {
        console.error("[ROOM ERROR] Missing room:", id);
        Sessions.sendSystem(socket, "The world frays… you are pulled back.");
        const fallback = acc?.lastRoom && World.rooms[acc.lastRoom]
            ? acc.lastRoom : Object.keys(World.rooms)[0];
        sess.room = fallback;
        return sendRoom(socket, fallback);
    }

    // Block entry to instance rooms if player doesn't belong
    if (room.instance) {
        const completed = acc?.instancesCompleted ?? [];
        const inInstance = !completed.includes(room.instance);
        if (!inInstance) {
            Sessions.sendSystem(socket, "You have already been through this place.");
            const fallback = Object.keys(World.rooms).find(r => !World.rooms[r].instance) ?? id;
            sess.room = fallback;
            return sendRoom(socket, fallback);
        }
    }

    // Spawn ambient items
    const { ensureAmbientItems } = require("./itemSpawner");
    ensureAmbientItems(room);

    // Players in room
    const playersHere = [];
    for (const [sock, s] of Sessions.sessions.entries()) {
        if (s.room === id && s.state === "ready") {
            const a = Accounts.data[s.loginId];
            if (a) playersHere.push(a.name);
        }
    }

    // Base description (atmospheric text only)
    let desc = Array.isArray(room.text)
        ? [...room.text]
        : ["You see nothing special."];

    // Per-player discovery for this room
    const playerDisc = (acc?.discovered && !Array.isArray(acc.discovered))
        ? (acc.discovered[id] || [])
        : [];
    // Global known: only World.items (takeable items), not scenery
    const globalKnown = new Set();
    if (acc?.discovered && !Array.isArray(acc.discovered)) {
        for (const [roomId, roomDiscs] of Object.entries(acc.discovered)) {
            if (roomId === id) continue; // skip current room — use playerDisc
            for (const itemId of roomDiscs) {
                if (World.items[itemId]) globalKnown.add(itemId); // items only
            }
        }
    }
    const discSet = new Set([...playerDisc, ...globalKnown]);

    // Build object list + append each object's roomDesc to description
    const objectList = [];
    const seenIds    = new Set();

    // ---------- SCENERY + NPCs ----------
    if (room.objects) {
        for (const [key, obj] of Object.entries(room.objects)) {
            if (seenIds.has(key)) continue;
            seenIds.add(key);

            const isHidden = obj.state === 'hidden';

            // Hidden NPCs count toward total but don't inject roomDesc
            if (!isHidden) {
                const roomDesc = (obj.roomDescByRace && race && obj.roomDescByRace[race])
                    || obj.roomDesc
                    || null;
                if (roomDesc) desc.push(roomDesc);
            }

            objectList.push({
                id:         key,
                name:       obj.name || key,   // use explicit name if set
                type:       obj.type || "scenery",
                emoji:      isHidden ? "" : (obj.emoji || ""),
                actions:    isHidden ? [] : (obj.actions || ["look"]),
                discovered: discSet.has(key),
                hidden:     isHidden,
                combatant:  obj.combatant || false,
                lookText:
                    (obj.lookTextByRace && race && obj.lookTextByRace[race]) ||
                    (obj.textByRace && race && obj.textByRace[race]) ||
                    obj.text || obj.lookText || null,
            });
        }
    }

    // ---------- AMBIENT ITEMS ----------
    if (room.items) {
        for (const inst of room.items) {
            const def = World.items[inst.defId];
            if (!def) continue;
            if (seenIds.has(inst.defId)) continue;
            seenIds.add(inst.defId);

            const isNative = !inst.originRoom || inst.originRoom === id;

            // roomDesc for native items, droppedText for foreign
            if (isNative) {
                // Check ambient config first, then item def, then generate fallback
                const roomDesc = room.ambient?.[inst.defId]?.roomText
                    || (def.roomDescByRace && race && def.roomDescByRace[race])
                    || def.roomDesc
                    || (def.spawnedTextByRace && race && def.spawnedTextByRace[race])
                    || def.spawnedText
                    || def.roomText
                    || `A ${def.name || inst.defId} lies here.`;
                desc.push(roomDesc);
            } else {
                // Foreign item dropped here — use droppedTextByRace, droppedText, or fallback
                const droppedText = (def.droppedTextByRace && race && def.droppedTextByRace[race])
                    || def.droppedText
                    || `A ${def.name || inst.defId} lies here, left by someone passing through.`;
                desc.push(droppedText);
            }

            objectList.push({
                id:         inst.defId,
                name:       def.name || inst.defId,
                type:       "item",
                emoji:      def.emoji || "",
                actions:    def.baseActions || ["look","take"],
                // Only count as discovered if native to this room
                discovered: isNative ? discSet.has(inst.defId) : false,
                native:     isNative,
                lookText:
                    (def.textByRace && race && def.textByRace[race]) ||
                    def.text || null,
            });
        }
    }

    // totalDiscoverable — use hardcoded value if defined, else calculate
    const totalDiscoverable = room.totalDiscoverable ?? (() => {
        let count = 0;
        if (room.objects) count += Object.keys(room.objects).length;
        if (room.ambient) count += Object.keys(room.ambient).length;
        return count;
    })();

    // Build combatants list — visible NPCs with combatant:true
    const combatants = objectList.filter(o =>
        o.type === 'npc' && o.combatant && !o.hidden
    ).map(o => ({ id: o.id, name: o.name }));

    try {
        const payload = {
            type:             "room",
            id,
            title:            room.title || "Somewhere",
            desc,
            exits:            Object.keys(room.exits || {}),
            background:       room.background || null,
            players:          playersHere,
            objects:          objectList,
            totalDiscoverable,
            combatants,
            combatStage:      sess.combatState?.stage ?? 'idle',
            // Event tracking
            totalEvents:      room.totalEvents ?? 0,
            eventsTriggered:  acc?.eventsTriggered?.[id] ?? 0,
        };

        console.log("📦 ROOM PAYLOAD:", {
            id, title: payload.title,
            desc: payload.desc.length,
            objects: payload.objects.length,
            exits: payload.exits,
        });

        socket.send(JSON.stringify(payload));
        console.log("✅ ROOM SENT:", id);
    } catch (err) {
        console.error("🔥 sendRoom() failed:", err);
    }
}

function handleMove(socket, sess, cmd, arg) {
    const dir = normalizeDirection(cmd, arg);
    if (!dir) return Sessions.sendSystem(socket, "Move where?");
    if (sess.energy <= 0) return Sessions.sendSystem(socket, "You are too exhausted to move.");

    sess.energy = Math.max(0, sess.energy - 3);
    const acc = Accounts.data[sess.loginId];
    acc.energy = sess.energy;
    Accounts.save();

    socket.send(JSON.stringify({ type:"stats", energy:sess.energy }));

    const room = getRoom(sess.room);
    if (!room?.exits?.[dir]) return Sessions.sendSystem(socket, "You cannot go that way.");

    const actor  = acc?.name || "Someone";
    const oldRoom = sess.room;
    const newRoom = room.exits[dir];

    Sessions.broadcastToRoomExcept(oldRoom, `${actor} leaves ${dir}.`, socket);
    sess.room    = newRoom;
    acc.lastRoom = newRoom;
    Accounts.save();
    Sessions.broadcastToRoomExcept(newRoom, `${actor} enters from ${oppositeDirection(dir)}.`, socket);

    // Reset scheduling — cancel for room being entered, schedule for room being left
    // (only schedule if no players remain)
    const stillInOld = [...Sessions.sessions.values()]
        .some(s => s.room === oldRoom && s.state === 'ready');
    if (!stillInOld) scheduleReset(oldRoom);
    cancelReset(newRoom);

    // Schedule item decay for old room
    scheduleItemDecay(oldRoom);

    sendRoom(socket, newRoom);
}

function normalizeDirection(cmd, arg) {
    const map = { n:"north",north:"north",s:"south",south:"south",e:"east",east:"east",w:"west",west:"west" };
    return map[cmd] || map[arg] || null;
}

module.exports = { sendRoom, handleMove, oppositeDirection, getRoom, handleResetVote, handleResetCancel, resetRoom, scheduleReset };
