// ════════════════════════════════════════
// mock.js — Stateful offline server
//
// Behaves like the real server:
// - Taking an item removes it from the room
//   and sends back an updated room packet
// - Dropping puts it back in the room
// - Can't take something you already hold
// - Can't take something not in the room
// - Inventory tracks what you carry
// ════════════════════════════════════════

// ── ROOM TEMPLATES (never mutated) ───────────────────────
const ROOM_DEFS = {
  market: {
    title: 'The Rotting Market',
    desc:  'Mildewed stalls sag under the weight of unsold things. A merchant watches you from beneath a hood. In the corner, a barrel leaks something dark. On the ground, a rock sits half-buried in mud.',
    objectDefs: [
      { id:'merchant', name:'merchant', emoji:'🧙', takeable:false, actions:['look','talk','trade','steal'] },
      { id:'barrel',   name:'barrel',   emoji:'🛢', takeable:false, actions:['look','open','smell','kick']  },
      { id:'rock',     name:'rock',     emoji:'🪨', takeable:true,  actions:['look','take','throw']          },
    ],
    exits: ['north','west'],
    players: [],
  },
  alley: {
    title: 'The Stinking Alley',
    desc:  'Narrow walls press in on either side. A cat watches you from a window ledge. Something drips from above.',
    objectDefs: [
      { id:'cat',    name:'cat',    emoji:'🐈', takeable:false, actions:['look','pet','shoo']      },
      { id:'puddle', name:'puddle', emoji:'💧', takeable:false, actions:['look','avoid','step in'] },
    ],
    exits: ['east'],
    players: ['Morg'],
  },
  tavern: {
    title: 'The Gutter & Flagon',
    desc:  'Smoke hangs low over rough-cut tables. A barkeep polishes a glass with a rag that makes it dirtier. Someone is asleep in the corner.',
    objectDefs: [
      { id:'barkeep', name:'barkeep', emoji:'🍺', takeable:false, actions:['look','talk','order'] },
      { id:'sleeper', name:'sleeper', emoji:'💤', takeable:false, actions:['look','wake','rob']   },
    ],
    exits: ['south'],
    players: [],
  },
};

const ROOM_MAP = {
  market: { north:'tavern', west:'alley'   },
  alley:  { east:'market'                  },
  tavern: { south:'market'                 },
};

const LOOK_TEXT = {
  merchant: 'The merchant has hollow eyes that track your every move.',
  barrel:   'Old and cracked. Something dark seeps from a split in the wood.',
  rock:     'A smooth river rock. Heavy enough to hurt someone.',
  cat:      'The cat blinks slowly. It has seen things.',
  puddle:   'You do not want to know what is in that puddle.',
  barkeep:  'The barkeep does not look up.',
  sleeper:  'They are breathing. Barely.',
};

const TALK_TEXT = {
  merchant: 'Merchant: "Coin first. Words after."',
  barkeep:  'Barkeep: "We\'ve got what we\'ve got."',
  cat:      'The cat says nothing. Obviously.',
};

// ── MOCK WEBSOCKET ────────────────────────────────────────
export class MockSocket extends EventTarget {
  constructor() {
    super();
    this.readyState = 0;

    // Mutable world state per room — which object ids are currently there
    this._roomObjects = {};
    Object.entries(ROOM_DEFS).forEach(([id, def]) => {
      this._roomObjects[id] = new Set(def.objectDefs.map(o => o.id));
    });

    this._currentRoom = 'market';
    this._player      = null;
    this._inventory   = new Map(); // id → objectDef
    this._held        = null;      // id of currently held item

    setTimeout(() => {
      this.readyState = 1;
      this._emit({ type:'players_online', count:3 });
      this.dispatchEvent(new Event('open'));
    }, 400);
  }

  send(raw) {
    let pkt = null;
    try { pkt = JSON.parse(raw); } catch { /**/ }
    if (pkt) this._handleJSON(pkt);
    else     this._handleCmd(raw.trim());
  }

  close() { this.readyState = 3; }

  // ── JSON PACKETS ─────────────────────────────────────────
  _handleJSON(pkt) {
    if (pkt.type === 'resume') {
      this._player = { name:'Greth', race:'goblin', pronoun:'they' };
      setTimeout(() => {
        this._emit({ type:'session_token', token:'mock_token' });
        this._emit({ type:'player_state',  player:this._player });
        this._emit({ type:'stats', level:3, energy:82, stamina:65 });
        this._sendRoom();
      }, 200);
      return;
    }

    if (pkt.type === 'create_account' || pkt.type === 'try_login') {
      this._player = {
        name:    pkt.name    ?? pkt.login?.split('@')[0]                ?? 'Stranger',
        race:    pkt.race    ?? pkt.login?.split('@')[1]?.split('.')[0] ?? 'goblin',
        pronoun: pkt.pronoun ?? pkt.login?.split('.')[1]                ?? 'they',
      };
      setTimeout(() => {
        this._emit({ type:'session_token', token:'mock_token' });
        this._emit({ type:'player_state',  player:this._player });
        this._emit({ type:'stats', level:1, energy:100, stamina:100 });
        this._sendRoom();
      }, 300);
    }
  }

  // ── TEXT COMMANDS ─────────────────────────────────────────
  _handleCmd(cmd) {
    const [verb, ...rest] = cmd.toLowerCase().split(' ');
    const target = rest.join(' ').trim();

    switch (verb) {
      case 'north': case 'south': case 'east': case 'west':
        this._move(verb); break;

      case 'look':
        if (!target) this._sendRoom();
        else this._sys(LOOK_TEXT[target] ?? `You examine the ${target}.`);
        break;

      case 'talk':
        this._sys(TALK_TEXT[target] ?? `The ${target} has nothing to say.`);
        break;

      case 'store': this._store(target); break;
      case 'take':  this._take(target);  break;
      case 'drop':  this._drop(target);  break;
      case 'throw': this._throw(target); break;

      case 'open':
        this._sys(`You open the ${target}. Something unpleasant is inside.`); break;
      case 'smell':
        this._sys(`You smell the ${target}. You regret it immediately.`); break;
      case 'kick':
        this._sys(`You kick the ${target}. Nothing improves.`); break;
      case 'steal':
        this._sys(`You attempt to steal from the ${target}. Their eyes narrow.`); break;
      case 'trade':
        this._sys(`The ${target} glances at your hands and looks away.`); break;
      case 'pet':
        this._sys(`You pet the ${target}. It tolerates this.`); break;

      case 'inv': case 'inventory':
        this._showInv(); break;
      case 'hands':
        this._showHands(); break;

      case 'say': case 'yell': case 'tell': case 'emote':
        this._emit({ type:'chat', mode:verb, name:this._player?.name ?? 'You', text:target });
        break;

      case 'quit':
        this._sys('You step into the darkness...');
        setTimeout(() => {
          this.readyState = 3;
          this.dispatchEvent(new MessageEvent('message', { data:'manual_exit' }));
        }, 600);
        break;

      default:
        this._sys(`You try to "${verb}" but nothing happens.`);
    }
  }

  // ── STORE (hand → bag, frees hand) ───────────────────────
  _store(target) {
    const id  = this._resolveInv(target);
    const obj = id ? this._inventory.get(id) : null;

    if (!obj) {
      this._sys(`You aren't holding a ${target}.`);
      return;
    }
    if (this._held !== id) {
      this._sys(`The ${target} is already in your bag.`);
      return;
    }

    // Free the hand, item stays in inventory
    this._held = null;
    this._sys(`You tuck the ${obj.name} away.`);
    this._emit({ type:'held', item: null });
  }

  // ── TAKE ──────────────────────────────────────────────────
  _take(target) {
    const obj = this._findInRoom(target);

    if (!obj) {
      this._sys(`There is no ${target} here.`);
      return;
    }
    if (!obj.takeable) {
      this._sys(`You can't take the ${target}.`);
      return;
    }
    if (this._held) {
      const heldName = this._inventory.get(this._held)?.name ?? this._held;
      this._sys(`Your hand already holds the ${heldName}. Drop it first.`);
      return;
    }

    // Remove from room, add to inventory
    this._roomObjects[this._currentRoom].delete(obj.id);
    this._inventory.set(obj.id, obj);
    this._held = obj.id;

    this._sys(`You pick up the ${obj.name}.`);
    this._emit({ type:'held', item:obj.id });
    setTimeout(() => this._sendRoom(), 80);
  }

  // ── DROP ──────────────────────────────────────────────────
  _drop(target) {
    const id  = this._resolveInv(target);
    const obj = id ? this._inventory.get(id) : null;

    if (!obj) {
      this._sys(`You aren't carrying a ${target}.`);
      return;
    }

    this._inventory.delete(id);
    if (this._held === id) this._held = null;
    this._roomObjects[this._currentRoom].add(id);

    this._sys(`You drop the ${obj.name}.`);
    this._emit({ type:'held', item:this._held });
    setTimeout(() => this._sendRoom(), 80);
  }

  // ── THROW ─────────────────────────────────────────────────
  _throw(target) {
    const id  = this._resolveInv(target);
    const obj = id ? this._inventory.get(id) : null;

    if (!obj) {
      if (this._findInRoom(target)) {
        this._sys(`Pick up the ${target} first.`);
      } else {
        this._sys(`You aren't carrying a ${target}.`);
      }
      return;
    }

    this._inventory.delete(id);
    if (this._held === id) this._held = null;

    this._sys(`You hurl the ${obj.name}. It vanishes into the dark.`);
    this._emit({ type:'held', item:this._held });
  }

  // ── MOVE ─────────────────────────────────────────────────
  _move(dir) {
    const next = ROOM_MAP[this._currentRoom]?.[dir];
    if (!next) {
      this._sys(`You can't go ${dir} from here.`);
      return;
    }
    this._sys(`You head ${dir}...`);
    this._currentRoom = next;
    setTimeout(() => this._sendRoom(), 250);
  }

  // ── INV / HANDS ──────────────────────────────────────────
  _showInv() {
    if (!this._inventory.size) { this._sys('You carry nothing.'); return; }
    const list = [...this._inventory.values()].map(o => `${o.emoji} ${o.name}`).join(', ');
    this._sys(`You carry: ${list}.`);
  }

  _showHands() {
    if (!this._held) { this._sys('Your hands are empty.'); return; }
    const o = this._inventory.get(this._held);
    this._sys(`Holding: ${o?.emoji ?? ''} ${o?.name ?? this._held}.`);
  }

  // ── BUILD + SEND ROOM ─────────────────────────────────────
  // Always built fresh from current state — same shape as real server
  _sendRoom() {
    const id   = this._currentRoom;
    const def  = ROOM_DEFS[id];
    const here = this._roomObjects[id];

    const objects = def.objectDefs
      .filter(o => here.has(o.id))
      .map(o => ({ id:o.id, name:o.name, emoji:o.emoji, actions:o.actions }));

    this._emit({
      type:    'room',
      title:   def.title,
      desc:    def.desc,
      objects,
      exits:   def.exits   ?? [],
      players: def.players ?? [],
    });
  }

  // ── HELPERS ───────────────────────────────────────────────
  _findInRoom(name) {
    const def  = ROOM_DEFS[this._currentRoom];
    const here = this._roomObjects[this._currentRoom];
    return def.objectDefs.find(o => here.has(o.id) && o.name === name) ?? null;
  }

  _resolveInv(name) {
    for (const [id, obj] of this._inventory) {
      if (obj.name === name || id === name) return id;
    }
    return null;
  }

  _sys(msg) { this._emit({ type:'system', msg }); }

  _emit(data) {
    this.dispatchEvent(new MessageEvent('message', { data:JSON.stringify(data) }));
  }
}
