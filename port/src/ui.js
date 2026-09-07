// NetHack: Descent, 2026-09-07. Distributed under dat/license.

const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const capital = value => String(value || '').replace(/^./, c => c.toUpperCase());
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const icons = {
  sword: '<path d="m7 17 10-10 2-4-4 2L5 15m1-3 6 6m-4-2-5 5m0-4 4 4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6Z"/><path d="M12 6v11"/>',
  spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
  bag: '<path d="M6 7h12l2 14H4ZM9 7V5a3 3 0 0 1 6 0v2M8 12h8"/>',
  scroll: '<path d="M6 4h13v13M6 4a3 3 0 0 0-3 3v2h4V7a3 3 0 0 0-1-3Zm1 5v11h11a3 3 0 0 0 3-3H10M10 8h5m-5 4h5"/>',
  potion: '<path d="M9 3h6m-5 0v6l-5 8c-1 2 0 4 3 4h8c3 0 4-2 3-4l-5-8V3M7 15h10"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16m6-14v16"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  hand: '<path d="M8 12V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v9-5a2 2 0 0 1 4 0v9c0 4-3 6-6 6h-2c-2 0-4-1-5-3l-4-6c-1-2 1-3 2-2l3 2"/>',
  gear: '<circle cx="12" cy="12" r="4"/><path d="m9 2-1 3-3 1-2 3 2 3-2 3 2 3 3 1 1 3h6l1-3 3-1 2-3-2-3 2-3-2-3-3-1-1-3Z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  cross: '<path d="m6 6 12 12M6 18 18 6"/>',
  chevron: '<path d="m8 5 7 7-7 7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.spark}</svg>`;

const ROLES = [
  { name: 'Archeologist', code: 'Arc', races: ['human', 'dwarf', 'gnome'], alignments: ['lawful', 'neutral'], detail: 'A scholar of buried things. Your pick-axe, touchstone, and knowledge will open paths that strength alone cannot.' },
  { name: 'Barbarian', code: 'Bar', races: ['human', 'orc'], alignments: ['neutral', 'chaotic'], detail: 'A fearless warrior from the wilds. Heavy steel, formidable strength, and resistance to poison carry you into the dark.' },
  { name: 'Caveman', code: 'Cav', races: ['human', 'dwarf', 'gnome'], alignments: ['lawful', 'neutral'], detail: 'A survivor of an older world. Trust your club, your sling, and the companion who walks beside you.' },
  { name: 'Healer', code: 'Hea', races: ['human', 'gnome'], alignments: ['neutral'], detail: 'A wandering physician. Medicine, restorative magic, and a practiced touch are your defense against the unknown.' },
  { name: 'Knight', code: 'Kni', races: ['human'], alignments: ['lawful'], detail: 'A gallant of Camelot. Armor, a lance, a long sword, and your faithful steed await a quest worthy of your oath.' },
  { name: 'Monk', code: 'Mon', races: ['human'], alignments: ['lawful', 'neutral', 'chaotic'], detail: 'A disciplined student of the Way. Unarmed combat and growing inner power reward a life of restraint.' },
  { name: 'Priest', code: 'Pri', races: ['human', 'elf'], alignments: ['lawful', 'neutral', 'chaotic'], detail: 'A servant of the divine. Read the blessings and curses of the world, and call upon the power of your deity.' },
  { name: 'Ranger', code: 'Ran', races: ['human', 'elf', 'gnome', 'orc'], alignments: ['neutral', 'chaotic'], detail: 'A patient hunter. Your bow, keen senses, and trusted companion turn distance into your greatest advantage.' },
  { name: 'Rogue', code: 'Rog', races: ['human', 'orc'], alignments: ['chaotic'], detail: 'A creature of shadow and opportunity. Daggers, stealth, and a well-placed lock pick keep the odds in your favor.' },
  { name: 'Samurai', code: 'Sam', races: ['human'], alignments: ['lawful'], detail: 'A warrior bound by honor. Master the katana and yumi as you follow the path from ronin to legend.' },
  { name: 'Tourist', code: 'Tou', races: ['human'], alignments: ['neutral'], detail: 'A traveler far from home. A camera, a credit card, and more resourcefulness than anyone expects may yet see you through.' },
  { name: 'Valkyrie', code: 'Val', races: ['human', 'dwarf'], alignments: ['lawful', 'neutral'], genders: ['female'], detail: 'A shield-maiden of the north. A spear, a sturdy shield, and resistance to cold make you a formidable survivor.' },
  { name: 'Wizard', code: 'Wiz', races: ['human', 'elf', 'gnome', 'orc'], alignments: ['neutral', 'chaotic'], detail: 'An apprentice of the arcane. Spellbooks, a wand, and a curious familiar are the first tools of a much greater power.' },
];
const RACE_ALIGNMENT = { human: ['lawful', 'neutral', 'chaotic'], elf: ['chaotic'], dwarf: ['lawful'], gnome: ['neutral'], orc: ['chaotic'] };

export const DEFAULT_COMMANDS = [
  ['i', 'Inventory', 'Inspect your possessions', 'Equipment', 'bag'],
  ['w', 'Wield a weapon', 'Choose your main-hand weapon', 'Equipment', 'sword'],
  ['x', 'Swap weapons', 'Exchange primary and secondary weapons', 'Equipment', 'sword'],
  ['W', 'Wear armor', 'Put on armor or equip a shield', 'Equipment', 'shield'],
  ['T', 'Take off armor', 'Remove an equipped piece of armor', 'Equipment', 'shield'],
  ['P', 'Put on an accessory', 'Equip a ring or amulet', 'Equipment', 'spark'],
  ['R', 'Remove an accessory', 'Take off a ring or amulet', 'Equipment', 'spark'],
  ['Q', 'Quiver ammunition', 'Select arrows, bolts, or missiles', 'Equipment', 'sword'],
  ['Z', 'Cast a spell', 'Choose a spell from your repertoire', 'Magic & items', 'spark'],
  ['z', 'Zap a wand', 'Release the power of a wand', 'Magic & items', 'spark'],
  ['q', 'Drink a potion', 'Quaff a potion or drink from a fountain', 'Magic & items', 'potion'],
  ['r', 'Read', 'Read a scroll or study a spellbook', 'Magic & items', 'scroll'],
  ['e', 'Eat', 'Eat food or something else edible', 'Magic & items', 'hand'],
  ['a', 'Apply a tool', 'Use a tool from your inventory', 'Magic & items', 'hand'],
  ['t', 'Throw an item', 'Throw a selected object', 'Combat', 'sword'],
  ['f', 'Fire ammunition', 'Shoot or throw from your quiver', 'Combat', 'sword'],
  ['\u0004', 'Kick', 'Kick a monster, door, or object', 'Combat', 'sword'],
  [',', 'Pick up', 'Collect objects at your feet', 'Exploration', 'hand'],
  ['d', 'Drop an item', 'Leave an object on the floor', 'Exploration', 'bag'],
  ['D', 'Drop several items', 'Choose multiple items to leave behind', 'Exploration', 'bag'],
  ['o', 'Open a door', 'Open a door in a chosen direction', 'Exploration', 'hand'],
  ['c', 'Close a door', 'Close an open door', 'Exploration', 'hand'],
  ['s', 'Search', 'Search for traps and concealed doors', 'Exploration', 'eye'],
  ['>', 'Descend', 'Take the stairs down', 'Exploration', 'map'],
  ['<', 'Ascend', 'Take the stairs up', 'Exploration', 'map'],
  [':', 'Look here', 'Examine the square beneath you', 'Exploration', 'eye'],
  [';', 'Look around', 'Inspect something in the dungeon', 'Exploration', 'eye'],
  ['.', 'Wait', 'Spend a moment where you stand', 'Exploration', 'eye'],
  ['#loot', 'Loot a container', 'Open and search a container', 'Interactions', 'bag'],
  ['#chat', 'Talk', 'Speak to someone nearby', 'Interactions', 'scroll'],
  ['#pray', 'Pray', 'Ask your deity for assistance', 'Interactions', 'spark'],
  ['#offer', 'Offer a sacrifice', 'Make an offering at an altar', 'Interactions', 'spark'],
  ['#dip', 'Dip an object', 'Dip an object in a potion or pool', 'Interactions', 'potion'],
  ['#rub', 'Rub an object', 'Rub a lamp or a stone', 'Interactions', 'hand'],
  ['#engrave', 'Engrave', 'Write a message on the floor', 'Interactions', 'scroll'],
  ['#untrap', 'Untrap', 'Attempt to disarm a trap', 'Interactions', 'hand'],
  ['#force', 'Force a lock', 'Try to force open a locked container', 'Interactions', 'sword'],
  ['#enhance', 'Enhance skills', 'Review and improve your weapon skills', 'Character', 'sword'],
  ['#conduct', 'Conduct', 'Review your voluntary challenges', 'Character', 'scroll'],
  ['#attributes', 'Attributes', 'Inspect your character and alignment', 'Character', 'scroll'],
  ['#', 'All NetHack commands', 'Access the complete native command list', 'System', 'scroll'],
  ['S', 'Save game', 'Save your expedition through NetHack', 'System', 'scroll'],
  ['?', 'NetHack help', 'Read the original game documentation', 'System', 'scroll'],
].map(([key, name, description, category, glyph]) => ({ key, name, description, category, icon: glyph }));

export class GameUI {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.root = document.getElementById('ui') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'ui' }));
    this.mode = 'title';
    this.panel = null;
    this.snapshot = null;
    this.log = [];
    this.engineReady = false;
    this.settings = { volume: 0.8, sensitivity: 0.8, pulseTime: 0.8 };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('descent.settings') || '{}')); } catch { /* Storage may be unavailable. */ }
    this.renderShell();
    this.bind();
    this.refreshRole();
    this.setMode('title');
  }

  get hasPanel() { return this.mode !== 'playing' && this.mode !== 'game' && this.mode !== 'play' || Boolean(this.panel); }

  renderShell() {
    this.root.innerHTML = `
      <div class="screen-grain" aria-hidden="true"></div>
      <div class="screen-vignette" aria-hidden="true"></div>
      <section class="title-screen" aria-label="New expedition">
        <header class="title-top"><a class="brand" href="#" aria-label="NetHack Descent"><span class="brand-mark">N</span><span>NETHACK<span class="brand-caption">A descent into the Dungeons of Doom</span></span></a><span class="edition">FIRST PERSON <span> / </span> REAL TIME</span></header>
        <div class="title-body">
          <div class="title-intro"><div class="overline"><span class="small-rule"></span> THE DUNGEON REMEMBERS</div><h1>DESCENT<span class="title-dot">.</span></h1><div class="title-ornament"><span></span><b>◇</b><span></span></div><p class="title-copy">Some enter for fortune.<br>Some enter for glory.<br><em>Few return.</em></p><p class="title-subcopy">The legendary labyrinth, seen through your own eyes.<br>Every choice matters. The world never waits.</p><div class="title-meta"><span>13 paths to follow</span><i>·</i><span>One Amulet of Yendor</span></div></div>
          <form class="character-sheet" id="character-form">
            <div class="sheet-number">I <span>/</span> THE ADVENTURER</div><h2>Who enters the dark?</h2>
            <label class="field-label" for="character-name">YOUR NAME</label><input id="character-name" name="name" maxlength="24" value="Adventurer" autocomplete="off" spellcheck="false" required>
            <div class="field-label role-label"><label for="character-role">YOUR CALLING</label><span id="role-count">05 / 13</span></div><select id="character-role" name="role">${ROLES.map(r => `<option value="${r.name}" ${r.name === 'Knight' ? 'selected' : ''}>${r.name}</option>`).join('')}</select>
            <p class="role-description" id="role-description"></p>
            <div class="character-traits"><label><span class="field-label">ANCESTRY</span><select id="character-race" name="race"></select></label><label><span class="field-label">GENDER</span><select id="character-gender" name="gender"></select></label><label><span class="field-label">ALIGNMENT</span><select id="character-alignment" name="alignment"></select></label></div>
            <button class="primary-button enter-button" type="submit" id="enter-dungeon"><span>Enter the dungeon</span>${icon('arrow')}</button>
            <button class="continue-button" type="button" id="continue-game">Continue expedition ${icon('chevron')}</button>
            <div class="engine-status" id="engine-status"><span class="status-dot"></span><span>Preparing the dungeon…</span></div>
          </form>
        </div>
        <footer class="title-bottom"><div class="title-controls"><span><kbd>W A S D</kbd> Move</span><span><kbd>SHIFT</kbd> Run</span><span><kbd>CTRL</kbd> Crouch</span><span><i class="mouse-icon"></i> Look & attack</span></div><div class="title-links"><button type="button" data-action="help">How to play</button><span>·</span><button type="button" data-action="settings">Settings</button></div></footer>
      </section>
      <section class="game-hud" aria-label="Game status" hidden>
        <div class="hud-top-left"><div class="location-overline">DUNGEONS OF DOOM</div><div class="location-name" id="location-name">The dungeon</div><div class="location-detail" id="location-detail">Depth 1</div></div>
        <div class="compass" aria-label="Facing direction"><span class="compass-side" id="compass-left">W</span><i></i><span class="compass-center" id="compass-heading">N</span><i></i><span class="compass-side" id="compass-right">E</span><b>▼</b></div>
        <div class="minimap-wrap"><div class="minimap-heading"><span>SURROUNDINGS</span><button data-action="map" title="Show dungeon map" aria-label="Show dungeon map">${icon('map')}</button></div><canvas id="minimap" width="220" height="132" aria-label="Explored dungeon map"></canvas><div class="map-legend"><span><i class="map-player"></i> YOU</span><span><i class="map-stairs"></i> STAIRS</span></div></div>
        <div class="crosshair" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></div>
        <div id="interaction-hint" class="interaction-hint" hidden></div>
        <div class="live-indicator"><span></span> WORLD IS LIVE</div>
        <div class="message-log" id="message-log" role="log" aria-live="polite" aria-relevant="additions"></div>
        <div class="hud-bottom">
          <div class="player-identity"><div class="player-sigil">${icon('shield')}</div><div><div class="player-name" id="player-name">Adventurer</div><div class="player-class" id="player-class">Knight <span>·</span> Level 1</div></div></div>
          <div class="vital-bars"><div class="vital-row"><span class="vital-label">VITALITY</span><div class="bar hp-bar"><div id="hp-fill"></div></div><span class="vital-value" id="hp-value">— / —</span></div><div class="vital-row"><span class="vital-label">POWER</span><div class="bar power-bar"><div id="power-fill"></div></div><span class="vital-value" id="power-value">— / —</span></div></div>
          <div class="player-stats"><div><span>ARMOR</span><b id="armor-value">—</b></div><div><span>GOLD</span><b id="gold-value">0</b></div><div class="condition-stat"><span>CONDITION</span><b id="hunger-value">Ready</b></div></div>
          <div class="hud-actions"><button data-command="i" title="Inventory (I)">${icon('bag')}<kbd>I</kbd></button><button data-action="commands" title="All commands (Tab)">${icon('scroll')}<kbd>TAB</kbd></button><button data-action="settings" title="Settings">${icon('gear')}</button></div>
        </div>
        <nav class="quickslots" aria-label="Quick actions"><button data-command="w" title="Wield a weapon"><kbd>1</kbd>${icon('sword')}<span>Weapon</span></button><button data-command="Z" title="Cast a spell"><kbd>2</kbd>${icon('spark')}<span>Spells</span></button><button data-command="z" title="Zap a wand"><kbd>3</kbd>${icon('spark')}<span>Wands</span></button><button data-command="q" title="Drink a potion"><kbd>4</kbd>${icon('potion')}<span>Potions</span></button><button data-command="a" title="Apply a tool"><kbd>5</kbd>${icon('hand')}<span>Tools</span></button></nav>
        <div class="hud-control-hint"><span><kbd>E</kbd> Interact</span><span><kbd>F</kbd> Fire</span><span><kbd>TAB</kbd> Commands</span></div>
        <button class="mouse-capture" id="mouse-capture" type="button" hidden>Click to look around <span>ESC releases the mouse</span></button>
      </section>
      <div class="panel-layer" id="panel-layer" hidden></div>
      <div class="toast" id="toast" role="status" hidden></div>
    `;
    this.$ = selector => this.root.querySelector(selector);
    this.mapContext = this.$('#minimap').getContext('2d');
  }

  bind() {
    this.$('#character-form').addEventListener('submit', e => {
      e.preventDefault();
      if (!this.engineReady) return;
      const form = new FormData(e.currentTarget);
      const character = Object.fromEntries(form.entries());
      character.name = character.name.trim() || 'Adventurer';
      this.callbacks.onStart?.(character);
    });
    this.$('#character-role').addEventListener('change', () => this.refreshRole());
    this.$('#character-race').addEventListener('change', () => this.refreshAlignment());
    this.$('#continue-game').addEventListener('click', () => { if (this.engineReady) this.callbacks.onContinue?.(); });
    this.$('.brand').addEventListener('click', e => e.preventDefault());
    this.root.addEventListener('click', e => {
      const command = e.target.closest('[data-command]');
      if (command) { this.callbacks.onCommand?.(command.dataset.command); return; }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'commands') this.callbacks.onCommand?.('#commands');
      if (action === 'settings') this.showSettings();
      if (action === 'help') this.showHelp();
      if (action === 'map') this.showMap();
      if (action === 'close') this.cancelPanel();
    });
    this.keyHandler = e => this.handleKey(e);
    window.addEventListener('keydown', this.keyHandler, true);
    this.$('#mouse-capture').addEventListener('click', () => this.callbacks.onClose?.());
  }

  refreshRole() {
    const role = ROLES.find(r => r.name === this.$('#character-role').value) || ROLES[4];
    this.$('#role-description').textContent = role.detail;
    this.$('#role-count').textContent = `${String(ROLES.indexOf(role) + 1).padStart(2, '0')} / 13`;
    this.fillSelect('#character-race', role.races);
    this.fillSelect('#character-gender', role.genders || ['male', 'female']);
    this.refreshAlignment();
  }

  refreshAlignment() {
    const role = ROLES.find(r => r.name === this.$('#character-role').value) || ROLES[4];
    const race = this.$('#character-race').value;
    this.fillSelect('#character-alignment', role.alignments.filter(a => (RACE_ALIGNMENT[race] || []).includes(a)));
  }

  fillSelect(selector, options) {
    const select = this.$(selector), previous = select.value;
    select.innerHTML = options.map(o => `<option value="${esc(o)}">${esc(capital(o))}</option>`).join('');
    if (options.includes(previous)) select.value = previous;
  }

  setMode(mode) {
    this.mode = mode;
    const playing = ['playing', 'game', 'play', 'dead'].includes(mode);
    this.root.dataset.mode = playing ? 'playing' : 'title';
    this.$('.title-screen').hidden = playing;
    this.$('.game-hud').hidden = !playing;
    if (mode === 'loading') {
      this.$('#enter-dungeon').disabled = true;
      this.$('#enter-dungeon').querySelector('span').textContent = 'Descending…';
    } else {
      this.$('#enter-dungeon').disabled = !this.engineReady;
      this.$('#enter-dungeon').querySelector('span').textContent = 'Enter the dungeon';
    }
    if (mode === 'title') this.closePanels(false);
  }

  setEngineStatus(text, ready = false) {
    this.engineReady = Boolean(ready);
    const status = this.$('#engine-status');
    status.querySelector('span:last-child').textContent = text;
    status.classList.toggle('ready', this.engineReady);
    this.$('#enter-dungeon').disabled = !ready;
    this.$('#continue-game').disabled = !ready;
  }

  update(snapshot = {}) {
    this.snapshot = snapshot;
    const p = snapshot.player || {};
    const set = (selector, value) => { if (value !== undefined && value !== null) this.$(selector).textContent = value; };
    set('#player-name', p.name);
    set('#player-class', `${p.role || 'Adventurer'} · Level ${p.level ?? 1}`);
    set('#location-name', p.dungeon || snapshot.dungeon || 'Dungeons of Doom');
    set('#location-detail', `Depth ${p.depth ?? snapshot.depth ?? 1}${p.turn !== undefined ? ` · ${p.turn} moments survived` : ''}`);
    set('#armor-value', p.ac);
    set('#gold-value', Number(p.gold || 0).toLocaleString());
    const hunger = p.conditions?.length ? p.conditions.slice(0,2).join(' · ') : p.hunger === undefined || p.hunger === '' ? 'Ready' : p.hunger;
    set('#hunger-value', capital(hunger));
    this.$('#hunger-value').classList.toggle('warning', /hungry|weak|faint|starv|burden|stress/i.test(String(hunger)));
    for (const [field, maxField, prefix] of [['hp', 'maxHp', 'hp'], ['power', 'maxPower', 'power']]) {
      const current = Number(p[field] || 0), max = Number(p[maxField] || 0);
      set(`#${prefix}-value`, `${current} / ${max}`);
      this.$(`#${prefix}-fill`).style.width = `${max > 0 ? clamp(current / max * 100, 0, 100) : 0}%`;
    }
    this.root.classList.toggle('low-health', Number(p.hp) > 0 && Number(p.hp) / Number(p.maxHp) <= .25);
    if (Array.isArray(snapshot.messages)) {
      const messages = snapshot.messages.map(m => typeof m === 'string' ? m : m.text || m.message || '').filter(Boolean);
      const tail = messages.slice(-5);
      if (JSON.stringify(tail) !== this.lastMessages) {
        this.lastMessages = JSON.stringify(tail);
        this.log = messages.slice(-80);
        this.renderMessages();
      }
    }
    const heading = snapshot.heading ?? p.heading;
    if (typeof heading === 'number') this.setHeading(heading);
    if (snapshot.interaction !== undefined) this.setInteraction(snapshot.interaction);
    if (snapshot.pointerLocked !== undefined) this.setPointerLocked(snapshot.pointerLocked);
    this.drawMap(snapshot);
    if (this.panel?.type === 'map') this.drawMap(snapshot, this.$('#large-map'));
  }

  setHeading(radians) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = ((Math.round(radians / (Math.PI / 4)) % 8) + 8) % 8;
    this.$('#compass-heading').textContent = directions[index];
    this.$('#compass-left').textContent = directions[(index + 6) % 8];
    this.$('#compass-right').textContent = directions[(index + 2) % 8];
  }

  setInteraction(text, key = 'E') {
    const hint = this.$('#interaction-hint');
    hint.hidden = !text;
    hint.innerHTML = text ? `<kbd>${esc(key)}</kbd><span>${esc(text)}</span>` : '';
  }

  setPointerLocked(locked) { this.$('#mouse-capture').hidden = locked || Boolean(this.panel) || !['playing', 'game', 'play'].includes(this.mode); }

  message(text) {
    if (!text) return;
    this.log.push(String(text));
    this.log = this.log.slice(-80);
    this.renderMessages();
  }

  renderMessages() {
    this.$('#message-log').innerHTML = this.log.slice(-5).map((m, i, list) => `<div class="log-entry ${i === list.length - 1 ? 'latest' : ''}">${esc(m)}</div>`).join('');
  }

  drawMap(snapshot = this.snapshot, canvas = this.$('#minimap')) {
    if (!canvas || !snapshot) return;
    const ctx = canvas.getContext('2d');
    const tiles = snapshot.tiles || snapshot.map || [];
    const width = snapshot.width || (Array.isArray(tiles[0]) ? tiles[0].length : 80);
    const height = snapshot.height || (Array.isArray(tiles[0]) ? tiles.length : 21);
    const local = canvas.id === 'minimap';
    const viewWidth=local?28:width,viewHeight=local?17:height;
    const cell = Math.min((canvas.width - 14) / viewWidth, (canvas.height - 14) / viewHeight);
    const ox = (canvas.width - viewWidth * cell) / 2-(local?Math.max(0,Math.min(width-viewWidth,(snapshot.player?.x||0)-viewWidth/2))*cell:0);
    const oy = (canvas.height - viewHeight * cell) / 2-(local?Math.max(0,Math.min(height-viewHeight,(snapshot.player?.y||0)-viewHeight/2))*cell:0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(12,15,13,.32)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const flat = Array.isArray(tiles[0]) ? tiles.flat() : tiles;
    flat.forEach((tile, i) => {
      if (!tile) return;
      const t = typeof tile === 'string' ? { char: tile } : tile;
      if (t.seen === false || t.explored === false) return;
      const x = t.x ?? i % width, y = t.y ?? Math.floor(i / width);
      const ch = t.char || t.ch || t.symbol || '';
      const type = t.type || t.kind || '';
      if (ch === ' ' && !type) return;
      let color = '#3d4440';
      if (/wall|stone/.test(type) || '|-┐└┘┌─│'.includes(ch) && ch) color = '#62665b';
      if (/floor|room|corridor/.test(type) || ch === '.' || ch === '#') color = '#3d4440';
      if (/door/.test(type) || ch === '+') color = '#9f7b49';
      if (/stair/.test(type) || ch === '<' || ch === '>') color = '#d6c28b';
      if (/water|pool/.test(type) || ch === '}') color = '#52757c';
      if (t.monster || /monster/.test(type)) color = t.monster?.tame || t.monster?.peaceful || t.pet || t.peaceful ? '#8da687' : '#ae655a';
      ctx.fillStyle = color;
      ctx.fillRect(ox + x * cell, oy + y * cell, Math.max(1, cell - .35), Math.max(1, cell - .35));
    });
    const p = snapshot.player || {};
    if (p.x !== undefined && p.y !== undefined) {
      const px = ox + (p.x + .5) * cell, py = oy + (p.y + .5) * cell;
      ctx.save(); ctx.translate(px, py); ctx.rotate(snapshot.heading ?? p.heading ?? 0);
      ctx.fillStyle = '#f6dca2'; ctx.shadowColor = '#e8c57a'; ctx.shadowBlur = 7;
      const r = Math.max(3.5, cell * .7);
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * .65, r * .75); ctx.lineTo(0, r * .4); ctx.lineTo(-r * .65, r * .75); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }

  openPanel(type, title, body, options = {}) {
    if (document.pointerLockElement) document.exitPointerLock();
    this.panel = { type, ...options };
    const layer = this.$('#panel-layer');
    layer.hidden = false;
    layer.className = `panel-layer ${options.centered ? 'centered' : ''} ${type}-layer`;
    layer.innerHTML = `<section class="game-panel ${type}-panel" role="dialog" aria-modal="false" aria-labelledby="panel-title"><header class="panel-header"><div><div class="panel-overline">${options.overline || 'ADVENTURER’S COMPANION'}</div><h2 id="panel-title">${esc(title)}</h2></div>${options.noClose ? '' : `<button class="close-button" data-action="close" title="Close (Esc)" aria-label="Close">${icon('cross')}</button>`}</header>${['playing', 'play', 'game'].includes(this.mode) ? '<div class="panel-live"><span></span> The world remains live. Stay aware of your surroundings.</div>' : ''}<div class="panel-content">${body}</div></section>`;
    this.$('#mouse-capture').hidden = true;
    return layer;
  }

  closePanels(notify = true) {
    this.panel = null;
    this.$('#panel-layer').hidden = true;
    this.$('#panel-layer').innerHTML = '';
    if (notify) this.callbacks.onClose?.();
  }

  cancelPanel() {
    const panel = this.panel;
    this.closePanels(false);
    if (panel?.type === 'menu') this.callbacks.onMenu?.({ id: panel.menu.id, selected: [], keys: [], cancelled: true });
    else if (panel?.type === 'prompt') this.callbacks.onKey?.('Escape');
    else this.callbacks.onClose?.();
  }

  showMenu(menu) {
    if (!menu) return this.closePanels(false);
    const selected = new Set((menu.items || []).filter(i => i.selected).map(i => String(i.id ?? i.key)));
    const items = menu.items || [];
    const body = `<div class="menu-list">${items.map((item, i) => {
      const selectable = !menu.readOnly && item.selectable !== false && (item.key !== undefined && item.key !== '' && item.key !== null || item.id !== undefined && item.id !== null && item.id !== 0);
      const id = String(item.id ?? item.key);
      return selectable ? `<button class="menu-item ${selected.has(id) ? 'selected' : ''}" data-menu-index="${i}"><kbd>${esc(item.key || '·')}</kbd><span>${esc(item.text || item.name || '')}</span>${menu.multiple ? '<b class="selection-mark">✓</b>' : icon('chevron')}</button>` : `<div class="menu-section">${esc(item.text || item.name || '')}</div>`;
    }).join('')}</div><div class="panel-footer"><span>${menu.multiple ? 'Choose any number of items.' : 'Select an item or type its letter.'}</span>${menu.multiple ? '<button class="primary-button compact" id="menu-confirm">Confirm selection <kbd>↵</kbd></button>' : '<kbd>ESC to close</kbd>'}</div>`;
    this.openPanel('menu', menu.title || 'Choose an action', body, { menu, selected });
    this.$('#panel-layer').querySelectorAll('[data-menu-index]').forEach(button => button.addEventListener('click', () => this.selectMenuItem(Number(button.dataset.menuIndex))));
    this.$('#menu-confirm')?.addEventListener('click', () => this.submitMenu());
  }

  selectMenuItem(index) {
    const panel = this.panel;
    if (panel?.type !== 'menu') return;
    const item = panel.menu.items[index];
    if (!item || panel.menu.readOnly || item.selectable === false) return;
    const id = String(item.id ?? item.key);
    if (panel.menu.multiple) {
      if (panel.selected.has(id)) panel.selected.delete(id); else panel.selected.add(id);
      this.$(`[data-menu-index="${index}"]`)?.classList.toggle('selected', panel.selected.has(id));
    } else {
      panel.selected = new Set([id]);
      this.submitMenu();
    }
  }

  submitMenu() {
    const panel = this.panel;
    if (panel?.type !== 'menu') return;
    const picked = panel.menu.items.filter(i => panel.selected.has(String(i.id ?? i.key)));
    const result = { id: panel.menu.id, selected: picked.map(i => i.id ?? i.key), keys: picked.map(i => i.key), cancelled: false };
    this.closePanels(false);
    this.callbacks.onMenu?.(result);
  }

  showPrompt(prompt) {
    if (!prompt) return this.closePanels(false);
    const isText = prompt.type === 'text';
    const choices = Array.isArray(prompt.choices) ? prompt.choices : String(prompt.choices || 'yn').split('');
    const body = isText ? `<form id="prompt-form"><label class="prompt-label" for="prompt-input">${esc(prompt.text)}</label><input id="prompt-input" maxlength="255" autocomplete="off" value="${esc(prompt.default || '')}"><div class="panel-footer"><span><kbd>ESC</kbd> Cancel</span><button type="submit" class="primary-button compact">Continue ${icon('arrow')}</button></div></form>` : `<p class="prompt-text">${esc(prompt.text)}</p><div class="prompt-choices">${choices.filter(c => c !== ' ').map(choice => { const key = typeof choice === 'string' ? choice : choice.key; const name = typeof choice === 'object' ? choice.text || choice.label : ({ y: 'Yes', n: 'No', q: 'Cancel', a: 'All' }[choice] || choice); return `<button class="choice-button ${key === prompt.default ? 'default' : ''}" data-choice="${esc(key)}"><span>${esc(name)}</span><kbd>${esc(key)}</kbd></button>`; }).join('')}</div>`;
    this.openPanel('prompt', isText ? 'A word in the dark' : 'Your decision', body, { prompt, centered: true, overline: 'THE DUNGEON ASKS' });
    this.$('#prompt-form')?.addEventListener('submit', e => { e.preventDefault(); const value = this.$('#prompt-input').value; this.closePanels(false); this.callbacks.onText?.(value); });
    this.$('#panel-layer').querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.choice; this.closePanels(false); this.callbacks.onKey?.(key); }));
    if (isText) requestAnimationFrame(() => { this.$('#prompt-input')?.focus(); this.$('#prompt-input')?.select(); });
  }

  showInventory(items = []) {
    if (items.items) items = items.items;
    const groups = new Map();
    for (const item of items) {
      const category = item.category || item.type || 'Possessions';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(item);
    }
    const body = `<div class="inventory-summary"><span>${items.length} possessions</span><span>${Number(this.snapshot?.player?.gold || 0).toLocaleString()} gold pieces</span></div><div class="inventory-list">${items.length ? [...groups].map(([category, list]) => `<div class="menu-section">${esc(capital(category))}</div>${list.map(item => `<button class="inventory-item" data-item-key="${esc(item.key || item.letter || '')}"><kbd>${esc(item.key || item.letter || '·')}</kbd><span>${esc(item.text || item.name || '')}</span>${item.equipped || /being worn|weapon in hand|wielded/i.test(item.text || '') ? '<b class="equipped-label">EQUIPPED</b>' : ''}${item.quantity > 1 ? `<small>×${item.quantity}</small>` : ''}</button>`).join('')}`).join('') : '<p class="empty-state">Your pack is empty.</p>'}</div><div class="inventory-tools"><button data-inventory-action="w">Wield</button><button data-inventory-action="W">Wear</button><button data-inventory-action="a">Apply</button><button data-inventory-action="q">Drink</button><button data-inventory-action="e">Eat</button><button data-inventory-action="r">Read</button><button data-inventory-action="d">Drop</button></div><div class="panel-footer"><span id="inventory-instruction">Select an item, then choose an action.</span><kbd>ESC to close</kbd></div>`;
    this.openPanel('inventory', 'Your possessions', body, { selectedKey: null });
    this.$('#panel-layer').querySelectorAll('[data-item-key]').forEach(button => button.addEventListener('click', () => {
      this.$('#panel-layer').querySelectorAll('.inventory-item.selected').forEach(b => b.classList.remove('selected'));
      button.classList.add('selected'); this.panel.selectedKey = button.dataset.itemKey;
      this.$('#inventory-instruction').textContent = button.querySelector('span').textContent;
    }));
    this.$('#panel-layer').querySelectorAll('[data-inventory-action]').forEach(button => button.addEventListener('click', () => { const key = this.panel.selectedKey; this.closePanels(false); this.callbacks.onCommand?.(button.dataset.inventoryAction, key); }));
  }

  showCommands(commands = DEFAULT_COMMANDS) {
    const normalized = commands.map(c => typeof c === 'string' ? { key: `#${c}`, name: capital(c), category: 'NetHack commands' } : { ...c, name: capital(c.name || c.text || c.key) }).sort((a,b)=>(a.category||'').localeCompare(b.category||'')||a.name.localeCompare(b.name));
    const body = `<div class="command-search-wrap">${icon('eye')}<input id="command-search" placeholder="Search commands, items, or actions…" autocomplete="off" aria-label="Search commands"><kbd>/</kbd></div><div class="command-list" id="command-list"></div><div class="panel-footer"><span>Every action has consequences.</span><kbd>ESC to close</kbd></div>`;
    this.openPanel('commands', 'Choose your next move', body, { commands: normalized, overline: 'THE ADVENTURER’S REPERTOIRE' });
    const render = filter => {
      const query = filter.toLowerCase().trim();
      const filtered = normalized.filter(c => `${c.name} ${c.description || ''} ${c.category || ''} ${c.key || ''}`.toLowerCase().includes(query));
      let category = null;
      this.$('#command-list').innerHTML = filtered.length ? filtered.map(c => {
        const header = c.category !== category ? `<div class="menu-section">${esc(c.category || 'Commands')}</div>` : '';
        category = c.category;
        return `${header}<button class="command-item" data-palette-key="${esc(c.key)}">${icon(c.icon || 'scroll')}<span><strong>${esc(c.name)}</strong><small>${esc(c.description || '')}</small></span><kbd>${esc(c.key === '\u0004' ? 'CTRL D' : c.key)}</kbd></button>`;
      }).join('') : '<p class="empty-state">No matching commands. Try “spell”, “door”, or “armor”.</p>';
      this.$('#command-list').querySelectorAll('[data-palette-key]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.paletteKey; this.closePanels(false); this.callbacks.onCommand?.(key); }));
    };
    render('');
    this.$('#command-search').addEventListener('input', e => render(e.target.value));
    requestAnimationFrame(() => this.$('#command-search')?.focus());
  }

  showSettings() {
    const body = `<div class="settings-intro">Make the dungeon your own.</div>${[
      ['volume', 'Sound volume', 'The sounds of the dungeon.', 0, 1, .05],
      ['sensitivity', 'Look sensitivity', 'How quickly the camera follows your mouse.', .1, 2, .05],
      ['pulseTime', 'World rhythm', 'Seconds between world updates. Lower is faster.', .3, 2, .1],
    ].map(([key, label, description, min, max, step]) => `<label class="setting-row"><div><strong>${label}</strong><small>${description}</small></div><output id="setting-value-${key}">${key === 'pulseTime' ? Number(this.settings[key]).toFixed(1) + 's' : Math.round(this.settings[key] * 100) + '%'}</output><input type="range" data-setting="${key}" value="${this.settings[key]}" min="${min}" max="${max}" step="${step}" aria-label="${label}"></label>`).join('')}<div class="panel-footer"><span>Settings are saved on this device.</span><button class="text-button" id="settings-reset">Reset defaults</button></div>`;
    this.openPanel('settings', 'In your hands', body, { centered: this.mode === 'title', overline: 'SETTINGS' });
    this.$('#panel-layer').querySelectorAll('[data-setting]').forEach(input => input.addEventListener('input', () => {
      const key = input.dataset.setting; this.settings[key] = Number(input.value);
      this.$(`#setting-value-${key}`).textContent = key === 'pulseTime' ? Number(input.value).toFixed(1) + 's' : Math.round(input.value * 100) + '%';
      try { localStorage.setItem('descent.settings', JSON.stringify(this.settings)); } catch { /* Optional persistence. */ }
      this.callbacks.onSettings?.({ ...this.settings });
    }));
    this.$('#settings-reset').addEventListener('click', () => { this.settings = { volume: .8, sensitivity: .8, pulseTime: .8 }; try { localStorage.setItem('descent.settings', JSON.stringify(this.settings)); } catch { /* Optional persistence. */ } this.callbacks.onSettings?.({ ...this.settings }); this.showSettings(); });
  }

  showHelp() {
    const rows = [
      ['W A S D', 'Walk forward, left, backward, and right'], ['MOUSE', 'Look around'], ['SHIFT', 'Run'], ['CTRL', 'Crouch'], ['LEFT CLICK', 'Attack with your wielded weapon'], ['RIGHT CLICK', 'Choose and cast a spell'], ['E', 'Interact with what is in front of you'], ['F', 'Fire quivered ammunition'], ['I', 'Open inventory'], ['1 – 5', 'Weapon, spells, wands, potions, and tools'], ['TAB', 'Search all commands'], ['ESC', 'Release the mouse or close a panel'],
    ];
    this.openPanel('help', 'Before you descend', `<p class="help-intro">Find the Amulet of Yendor and return to the surface. The dungeon is full of tools, secrets, and creatures with their own intentions.</p><div class="help-controls">${rows.map(([key, action]) => `<div><kbd>${key}</kbd><span>${action}</span></div>`).join('')}</div><div class="help-note"><span class="status-dot"></span><p><strong>The world never pauses.</strong> Monsters can move and attack while you browse your inventory, choose a spell, or read a menu. Find a safe place before making a long decision.</p></div><p class="help-native">Use <strong>Tab → All NetHack commands</strong> for the full repertoire, including prayers, offerings, engraving, riding, naming, and other original interactions. Native menus accept their displayed letter keys.</p>`, { centered: true, overline: 'A FEW WORDS OF GUIDANCE' });
  }

  showMap() {
    this.openPanel('map', 'A record of your descent', `<div class="large-map-wrap"><canvas id="large-map" width="720" height="390" aria-label="Explored dungeon map"></canvas></div><div class="panel-footer"><span>Only what you have discovered is shown.</span><kbd>ESC to close</kbd></div>`, { centered: true, overline: this.snapshot?.player?.dungeon || 'DUNGEONS OF DOOM' });
    this.drawMap(this.snapshot, this.$('#large-map'));
  }

  showDeath(text) {
    this.setMode('dead');
    this.openPanel('death', 'The dungeon remembers.', `<div class="death-symbol">◇</div><p class="death-text">${esc(text || 'Your journey has come to an end.')}</p><div class="death-stats"><div><span>ADVENTURER</span><b>${esc(this.snapshot?.player?.name || 'Adventurer')}</b></div><div><span>DEPTH REACHED</span><b>${esc(this.snapshot?.player?.depth || 1)}</b></div><div><span>GOLD CARRIED</span><b>${esc(this.snapshot?.player?.gold || 0)}</b></div></div><button id="new-journey" class="primary-button">Another soul. Another descent. ${icon('arrow')}</button>`, { centered: true, noClose: true, overline: 'HERE ENDS YOUR EXPEDITION' });
    this.$('#new-journey').addEventListener('click', () => { this.closePanels(false); this.setMode('title'); this.callbacks.onClose?.(); });
  }

  handleKey(e) {
    const panel = this.panel;
    if (!panel) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (panel.type !== 'death') this.cancelPanel(); return; }
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
      // Preserve input editing while preventing global movement/command handlers.
      if (e.key !== 'Enter') e.stopPropagation();
      if (e.key === 'Enter' && panel.type === 'commands') {
        e.preventDefault(); e.stopImmediatePropagation(); this.$('[data-palette-key]')?.click();
      }
      if (panel.type === 'prompt') e.stopPropagation();
      return;
    }
    e.stopImmediatePropagation();
    if (panel.type === 'menu') {
      if (e.key === 'Enter' && panel.menu.multiple) { e.preventDefault(); this.submitMenu(); return; }
      if (e.key === 'Enter' && panel.menu.items.every(i => !i.key)) { e.preventDefault(); this.cancelPanel(); return; }
      const index = panel.menu.items.findIndex(item => String(item.key) === e.key);
      if (index >= 0) { e.preventDefault(); this.selectMenuItem(index); }
    } else if (panel.type === 'prompt') {
      const choices = Array.isArray(panel.prompt.choices) ? panel.prompt.choices.map(c => typeof c === 'string' ? c : c.key) : String(panel.prompt.choices || 'yn').split('');
      const key = e.key === 'Enter' && panel.prompt.default ? panel.prompt.default : e.key;
      if (choices.includes(key)) { e.preventDefault(); this.closePanels(false); this.callbacks.onKey?.(key); }
    } else if (panel.type === 'commands' && e.key === '/') { e.preventDefault(); this.$('#command-search').focus(); }
  }

  destroy() { window.removeEventListener('keydown', this.keyHandler, true); this.root.innerHTML = ''; }
}
