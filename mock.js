// ════════════════════════════════════════
// mock.js — Offline dev server simulator
// Replaces the real WebSocket with a fake
// one that responds like the real server.
// ════════════════════════════════════════

const ROOMS = {
  market: {
    type: 'room',
    title: 'The Rotting Market',
    desc: 'Mildewed stalls sag under the weight of unsold things. A merchant watches you from beneath a hood. In the corner, a barrel leaks something dark. On the ground, a rock sits half-buried in mud.',
    objects: [
      { id: 'merchant', name: 'merchant', emoji: '🧙', actions: ['look', 'talk', 'trade', 'steal'] },
      { id: 'barrel',   name: 'barrel',   emoji: '🛢', actions: ['look', 'open', 'smell', 'kick']  },
      { id: 'rock',     name: 'rock',     emoji: '🪨', actions: ['look', 'take', 'throw']           },
    ],
    exits: ['north', 'west'],
    players: [],
  },
  alley: {
    type: 'room',
    title: 'The Stinking Alley',
    desc: 'Narrow walls press in on either side. A cat watches you from a window ledge. Something drips from above.',
    objects: [
      { id: 'cat',    name: 'cat',    emoji: '🐈', actions: ['look', 'pet', 'shoo']         },
      { id: 'puddle', name: 'puddle', emoji: '💧', actions: ['look', 'avoid', 'step in']    },
    ],
    exits: ['south', 'east'],
    players: ['Morg'],
  },
  tavern: {
    type: 'room',
    title: 'The Gutter & Flagon',
    desc: 'Smoke hangs low over rough-cut tables. A barkeep polishes a glass with a rag that makes it dirtier. Someone is asleep in the corner.',
    objects: [
      { id: 'barkeep', name: 'barkeep', emoji: '🍺', actions: ['look', 'talk', 'order']     },
      { id: 'sleeper', name: 'sleeper', emoji: '💤', actions: ['look', 'wake', 'rob']        },
    ],
    exits: ['east'],
    players: [],
  },
};

const ROOM_MAP = {
  market: { north: 'tavern', west: 'alley' },
  alley:  { south: 'market', east: 'market' },
  tavern: { east: 'market' },
};

const LOOK_RESPONSES = {
  merchant: 'The merchant has hollow eyes that track your every move. Their wares are covered by a cloth.',
  barrel:   'The barrel is old and cracked. Something dark and viscous seeps from a split in the wood.',
  rock:     'A smooth river rock. Heavy enough to hurt someone.',
  cat:      'The cat blinks slowly. It has seen things.',
  puddle:   'You do not want to know what is in that puddle.',
  barkeep:  'The barkeep does not look up.',
  sleeper:  'They are breathing. Barely.',
};

const TALK_RESPONSES = {
  merchant: 'Merchant: "Coin first. Words after."',
  barkeep:  'Barkeep: "We\'ve got what we\'ve got. Don\'t ask questions."',
  cat:      'The cat says nothing. Obviously.',
};

// ── MOCK WEBSOCKET ────────────────────────────────────────
export class MockSocket extends EventTarget {
  constructor() {
    super();
    this.readyState = 0; // CONNECTING
    this._currentRoom = 'market';
    this._player = null;

    // Simulate connection delay
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this._emit({ type: 'players_online', count: 3 });
      this.dispatchEvent(new Event('open'));
    }, 400);
  }

  send(raw) {
    // Parse JSON or treat as text command
    let pkt = null;
    try { pkt = JSON.parse(raw); } catch { /* text command */ }

    if (pkt) {
      this._handleJSON(pkt);
    } else {
      this._handleCmd(raw.trim());
    }
  }

  _handleJSON(pkt) {
    switch (pkt.type) {
      case 'resume':
        // Simulate a token resume — send player state + room
        setTimeout(() => {
          this._player = { name: 'Greth', race: 'goblin', pronoun: 'they' };
          this._emit({ type: 'session_token', token: 'mock_token' });
          this._emit({ type: 'player_state', player: this._player });
          this._emit({ type: 'stats', level: 3, energy: 82, stamina: 65 });
          this._sendRoom();
        }, 200);
        break;

      case 'create_account':
      case 'try_login':
        this._player = {
          name:    pkt.name ?? pkt.login?.split('@')[0] ?? 'Stranger',
          race:    pkt.race ?? pkt.login?.split('@')[1]?.split('.')[0] ?? 'goblin',
          pronoun: pkt.pronoun ?? pkt.login?.split('.')[1] ?? 'they',
        };
        setTimeout(() => {
          this._emit({ type: 'session_token', token: 'mock_token' });
          this._emit({ type: 'player_state', player: this._player });
          this._emit({ type: 'stats', level: 1, energy: 100, stamina: 100 });
          this._sendRoom();
        }, 300);
        break;
    }
  }

  _handleCmd(cmd) {
    const [verb, ...rest] = cmd.toLowerCase().split(' ');
    const target = rest.join(' ');

    switch (verb) {
      // Movement
      case 'north': case 'south': case 'east': case 'west':
        this._move(verb); break;

      // Look
      case 'look':
        if (!target) {
          this._sendRoom();
        } else {
          const msg = LOOK_RESPONSES[target] ?? `You examine the ${target} closely.`;
          this._emit({ type: 'system', msg });
        }
        break;

      // Talk
      case 'talk':
        this._emit({ type: 'system', msg: TALK_RESPONSES[target] ?? `The ${target} has nothing to say.` });
        break;

      // Take
      case 'take':
        this._emit({ type: 'system', msg: `You pick up the ${target}.` });
        this._emit({ type: 'held', item: target });
        break;

      // Drop
      case 'drop':
        this._emit({ type: 'system', msg: `You drop the ${target}.` });
        this._emit({ type: 'held', item: null });
        break;

      // Throw
      case 'throw':
        this._emit({ type: 'system', msg: `You hurl the ${target} across the room. It clatters off a wall.` });
        break;

      // Trade
      case 'trade':
        this._emit({ type: 'system', msg: `The ${target} looks at your empty hands and says nothing.` });
        break;

      // Steal
      case 'steal':
        this._emit({ type: 'system', msg: `You attempt to steal from the ${target}. Their eyes narrow.` });
        break;

      // Open
      case 'open':
        this._emit({ type: 'system', msg: `You open the ${target}. Something unpleasant is inside.` });
        break;

      // Smell
      case 'smell':
        this._emit({ type: 'system', msg: `You smell the ${target}. You regret it immediately.` });
        break;

      // Kick
      case 'kick':
        this._emit({ type: 'system', msg: `You kick the ${target}. It doesn't improve anything.` });
        break;

      // Inv
      case 'inv': case 'inventory':
        this._emit({ type: 'system', msg: 'You are carrying: nothing. As usual.' });
        break;

      // Hands
      case 'hands':
        this._emit({ type: 'system', msg: 'Your hands are empty.' });
        break;

      // Chat modes
      case 'say': case 'yell': case 'tell': case 'emote':
        this._emit({
          type: 'chat',
          mode: verb,
          name: this._player?.name ?? 'You',
          text: target,
        });
        break;

      // Quit
      case 'quit':
        this._emit({ type: 'system', msg: 'You step into the darkness...' });
        setTimeout(() => {
          this.readyState = 3;
          this.dispatchEvent(new MessageEvent('message', { data: 'manual_exit' }));
        }, 600);
        break;

      default:
        this._emit({ type: 'system', msg: `You try to "${verb}" but nothing happens.` });
    }
  }

  _move(dir) {
    const exits = ROOM_MAP[this._currentRoom] ?? {};
    const next  = exits[dir];
    if (!next) {
      this._emit({ type: 'system', msg: `You can't go ${dir} from here.` });
      return;
    }
    this._currentRoom = next;
    this._emit({ type: 'system', msg: `You head ${dir}...` });
    setTimeout(() => this._sendRoom(), 250);
  }

  _sendRoom() {
    const room = ROOMS[this._currentRoom];
    if (room) this._emit({ ...room });
  }

  _emit(data) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  // Satisfy WebSocket interface
  close() { this.readyState = 3; }
  addEventListener(type, fn) { super.addEventListener(type, fn); }
}
