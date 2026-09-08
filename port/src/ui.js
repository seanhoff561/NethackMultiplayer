// NetHack: Descent, 2026-09-07. Distributed under dat/license.
import {experienceLabel} from './awareness.js';
import {AUDIO_DEFAULTS} from './soundscape.js';
import {SPELL_LETTERS,spellName,spellDetails,spellChoices,bindSpellChoices,rebindSpell} from './spell-bindings.js';

const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const capital = value => String(value || '').replace(/^./, c => c.toUpperCase());
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function searchCommands(commands,filter){
  const query=filter.toLowerCase().trim();if(!query)return commands;
  const score=c=>{const name=c.name.toLowerCase();return name===query?0:name.startsWith(query)?1:name.includes(query)?2:3;};
  return commands.filter(c=>`${c.name} ${c.description||''} ${c.category||''} ${c.key||''}`.toLowerCase().includes(query)).sort((a,b)=>score(a)-score(b));
}
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
    this.settings = { ...AUDIO_DEFAULTS, sensitivity: 1, pulseTime: .8,spellBindings:{} };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('descent.settings') || '{}')); } catch { /* Storage may be unavailable. */ }
    this.renderShell();
    this.bind();
    this.refreshRole();
    this.setMode('title');
  }

  get hasPanel() { return this.mode !== 'playing' && this.mode !== 'game' && this.mode !== 'play' || Boolean(this.panel); }

  renderShell() {
    this.root.innerHTML = `
      <div id="damage-flash" class="damage-flash" aria-hidden="true"></div><div id="hit-confirm" class="hit-confirm" aria-hidden="true">×</div>
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
        <footer class="title-bottom"><div class="title-controls"><span><kbd>W A S D</kbd> Move</span><span><kbd>SHIFT</kbd> Run</span><span><kbd>CTRL</kbd> Crouch</span><span><kbd>TAB</kbd> Commands</span><span><i class="mouse-icon"></i> Look & attack</span></div><div class="title-links"><button type="button" data-action="fullscreen">Fullscreen</button><span>·</span><button type="button" data-action="help">How to play</button><span>·</span><button type="button" data-action="settings">Settings</button></div></footer>
      </section>
      <section class="game-hud" aria-label="Game status" hidden>
        <div class="hud-top-left player-status" aria-label="Character status">
          <div class="status-heading"><b id="player-name">Adventurer</b><span id="level-xp">Lv 1 · 0 / 20 XP</span></div>
          <div class="vital-bars"><div class="vital-row"><span class="vital-label">HEALTH</span><div class="bar hp-bar"><div id="hp-fill"></div></div><span class="vital-value" id="hp-value">—</span></div><div class="vital-row"><span class="vital-label">POWER</span><div class="bar power-bar"><div id="power-fill"></div></div><span class="vital-value" id="power-value">—</span></div></div>
          <div class="status-details"><span id="hunger-value">Ready</span><span id="weight-value">Unburdened</span><span><b id="gold-value">0</b> gold</span></div><div id="hud-conditions"></div>
        </div>
        <div class="compass" aria-label="Facing direction"><span class="compass-side" id="compass-left">W</span><i></i><span class="compass-center" id="compass-heading">N</span><i></i><span class="compass-side" id="compass-right">E</span><b>▼</b></div>
        <div class="crosshair" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></div>
        <div id="hunger-alert" class="hunger-alert" role="status" hidden><b id="hunger-alert-text">Weak from hunger</b><span><kbd>G</kbd> Eat</span></div>
        <div class="message-log" id="message-log" role="log" aria-live="polite" aria-relevant="additions"></div>
        <aside id="awareness" class="awareness" aria-label="Surroundings" hidden>
          <div id="focus-readout" hidden><span class="awareness-heading" id="focus-kind">Looking at</span><b id="focus-name"></b></div>
          <div id="enemies-readout" hidden><span class="awareness-heading" id="enemies-heading">Enemies in sight</span><ul id="visible-enemies"></ul></div>
        </aside>
        <button class="mouse-capture" id="mouse-capture" type="button" hidden>Click to look around <span>TAB commands · ESC menu</span></button>
      </section>
      <div class="panel-layer" id="panel-layer" hidden></div>
      <div class="time-skip" id="time-skip" aria-hidden="true"></div>
    `;
    this.$ = selector => this.root.querySelector(selector);

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
      if(e.target.closest('[data-item-id],[data-inventory-action],[data-settings-section]'))this.callbacks.onSound?.('select');
      const command = e.target.closest('[data-command]');
      if (command) { this.callbacks.onCommand?.(command.dataset.command); return; }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'commands') this.callbacks.onCommand?.('#commands');
      if (action === 'fullscreen') this.callbacks.onFullscreen?.();
      if (action === 'settings') this.showSettings();
      if(action==='new-run')this.showNewRun();
      if(action==='confirm-new-run'){this.callbacks.onNewRun?.();this.openPanel('settings','Saving your expedition','<p class="settings-intro">Preparing character creation…</p>',{centered:true,noClose:true});}
      if(action==='back-settings')this.showSettings();
      if (action === 'resume') this.closePanels();
      const section=e.target.closest('[data-settings-section]')?.dataset.settingsSection;if(section)this.showSettings(section);
      if (action === 'help') this.showHelp();
      if (action === 'map') this.showMap();
      if (action === 'close') this.cancelPanel();
    });

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
    if(this.panel?.type==='inventory'){
      const items=snapshot.inventory||[],signature=JSON.stringify(items.map(i=>[i.id,i.key,i.name,i.quantity,i.equipped]));
      if(signature!==this.panel.inventorySignature){
        const id=this.panel.selectedId,scroll=this.$('.inventory-list').scrollTop;
        this.showInventory(items);
        if(id!==undefined)this.$(`[data-item-id="${id}"]`)?.click();
        this.$('.inventory-list').scrollTop=scroll;
      }
    }
    const p = snapshot.player || {};
    const set = (selector, value) => { if (value !== undefined && value !== null) {const node=this.$(selector);if(node)node.textContent = value;} };
    set('#player-name', p.name);
    set('#player-class', `${p.role || 'Adventurer'} · Level ${p.level ?? 1}`);
    set('#location-name', p.dungeon || snapshot.dungeon || 'Dungeons of Doom');
    set('#location-detail', `Depth ${p.depth ?? snapshot.depth ?? 1}${snapshot.elapsed !== undefined ? ` · ${Math.floor(snapshot.elapsed/60)}:${String(Math.floor(snapshot.elapsed%60)).padStart(2,'0')} survived` : ''}`);
    set('#armor-value', p.ac);
    set('#gold-value', Number(p.gold || 0).toLocaleString());
    const hunger = typeof p.hunger==='string'&&p.hunger?p.hunger:'Ready';
    const hungerStage=/weak|faint|starv/i.test(hunger)?hunger.toLowerCase():'';
    if(hungerStage!==this.hungerStage){
      this.hungerStage=hungerStage;clearTimeout(this.hungerTimer);const alert=this.$('#hunger-alert');alert.hidden=!hungerStage;
      if(hungerStage){this.$('#hunger-alert-text').textContent=/faint|starv/.test(hungerStage)?'You are starving':'Weak from hunger';this.hungerTimer=setTimeout(()=>alert.hidden=true,7500);}
    }
    set('#level-xp',`Lv ${p.level||1} · ${experienceLabel(p.level||1,p.experience||0)}`);
    this.$('#level-xp').title=p.level>=30?'Maximum experience level':'Current total XP / total XP required for the next level';
    set('#weight-value',['Unburdened','Burdened','Stressed','Strained','Overtaxed','Overloaded'][p.encumbrance||0]);
    set('#hunger-value', capital(hunger));
    set('#hud-conditions',p.conditions?.filter(c=>! /Hungry|Weak|Faint|Starv|Satiated|Burdened|Stressed|Strained|Overtaxed|Overloaded/.test(c)).map(c=>c==='Trapped'?'Trapped — hold WASD to struggle':c).join(' · ')||'');
    this.$('#hunger-value')?.classList.toggle('warning', /hungry|weak|faint|starv|burden|stress/i.test(String(hunger)));
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
    if (this.panel?.type === 'map') this.drawMap(snapshot, this.$('#large-map'));
  }

  setHeading(radians) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = ((Math.round(radians / (Math.PI / 4)) % 8) + 8) % 8;
    this.$('#compass-heading').textContent = directions[index];
    this.$('#compass-left').textContent = directions[(index + 6) % 8];
    this.$('#compass-right').textContent = directions[(index + 2) % 8];
  }

  setInteraction() {}
  setAwareness({target=null,enemies=[]}={}) {
    this.$('#awareness').hidden=!target&&!enemies.length;
    this.$('#focus-readout').hidden=!target;
    this.$('#focus-name').textContent=target?.name||'';
    this.$('#focus-kind').textContent=target?.kind||'Looking at';
    this.$('#enemies-readout').hidden=!enemies.length;
    this.$('#enemies-heading').textContent=`Enemies in sight · ${enemies.length}`;
    const grouped=new Map();
    for(const enemy of enemies)grouped.set(enemy.name,(grouped.get(enemy.name)||0)+1);
    const signature=JSON.stringify([...grouped]);
    if(signature!==this.enemySignature){
      this.enemySignature=signature;
      this.$('#visible-enemies').innerHTML=[...grouped].map(([name,count])=>`<li>${esc(capital(name))}${count>1?` <span>×${count}</span>`:''}</li>`).join('');
    }
  }
  setBusy(active){this.$('#time-skip').classList.toggle('active',!!active);this.root.classList.toggle('time-passing',!!active);}
  setPointerLocked(){this.$('#mouse-capture').hidden=true;}

  message(text) {
    if (!text) return;
    this.log.push(String(text));
    this.log = this.log.slice(-80);
    this.renderMessages();
  }

  toast(text){this.message(text);}
  damage(){const el=this.$('#damage-flash');el.getAnimations().forEach(a=>a.cancel());el.animate([{opacity:.8},{opacity:.25,offset:.3},{opacity:0}],{duration:650,easing:'ease-out'});}
  confirmHit(){}
  setFullscreen(active){this.$('#fullscreen-toggle')?.setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');}
  renderMessages() {
    const log=this.$('#message-log');log.classList.remove('quiet');clearTimeout(this.messageTimer);this.messageTimer=setTimeout(()=>log.classList.add('quiet'),6500);
    this.$('#message-log').innerHTML = this.log.slice(-2).map((m, i, list) => `<div class="log-entry ${i === list.length - 1 ? 'latest' : ''}">${esc(m)}</div>`).join('');
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
    if(this.panel?.type!==type)this.callbacks.onSound?.('open');
    this.callbacks.onPanel?.(options);
    if (!options.aiming && document.pointerLockElement) document.exitPointerLock();
    this.panel = { type, ...options };
    const layer = this.$('#panel-layer');
    layer.hidden = false;
    layer.className = `panel-layer ${options.centered ? 'centered' : ''} ${type}-layer ${options.aiming?'aiming-layer':''}`;
    layer.innerHTML = `<section class="game-panel ${type}-panel" role="dialog" aria-modal="false" aria-labelledby="panel-title"><header class="panel-header"><div><div class="panel-overline">${options.overline || 'ADVENTURER’S COMPANION'}</div><h2 id="panel-title">${esc(title)}</h2></div>${options.noClose ? '' : `<button class="close-button" data-action="close" title="Close (Esc)" aria-label="Close">${icon('cross')}</button>`}</header>${['playing', 'play', 'game'].includes(this.mode) ? '<div class="panel-live"><span></span> The world remains live. Stay aware of your surroundings.</div>' : ''}<div class="panel-content">${body}</div></section>`;
    this.$('#mouse-capture').hidden = true;
    return layer;
  }

  closePanels(notify = true, escape = false) {
    if(this.panel)this.callbacks.onSound?.('close');
    this.panel = null;
    this.$('#panel-layer').hidden = true;
    this.$('#panel-layer').innerHTML = '';
    if (notify) this.callbacks.onClose?.({escape});
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
    }).join('')}</div><div class="panel-footer"><span>${menu.aiming?'Aim with the mouse · press a letter · wheel to scroll':menu.multiple ? 'Choose any number of items.' : 'Select an item or type its letter.'}</span>${menu.multiple ? '<button class="primary-button compact" id="menu-confirm">Confirm selection <kbd>↵</kbd></button>' : '<kbd>ESC to close</kbd>'}</div>`;
    this.openPanel('menu', menu.title || 'Choose an action', body, { menu, selected, aiming:!!menu.aiming });
    this.$('#panel-layer').querySelectorAll('[data-menu-index]').forEach(button => button.addEventListener('click', () => this.selectMenuItem(Number(button.dataset.menuIndex))));
    this.$('#menu-confirm')?.addEventListener('click', () => this.submitMenu());
  }

  selectMenuItem(index) {
    const panel = this.panel;
    if (panel?.type !== 'menu') return;
    const item = panel.menu.items[index];
    if (!item || panel.menu.readOnly || item.selectable === false) return;
    this.callbacks.onSound?.('select');
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
    this.openPanel('prompt', isText ? 'A word in the dark' : 'Your decision', body, { prompt, centered: isText, aiming:!!prompt.aiming, overline: 'THE DUNGEON ASKS' });
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
    const body = `<div class="inventory-summary"><span>${items.length} possessions</span><span>${Number(this.snapshot?.player?.gold || 0).toLocaleString()} gold pieces</span></div><div class="inventory-list">${items.length ? [...groups].map(([category, list]) => `<div class="menu-section">${esc(capital(category))}</div>${list.map(item => `<button class="inventory-item" data-item-id="${esc(item.id??'')}" data-item-key="${esc(item.key || item.letter || '')}"><kbd>${esc(item.key || item.letter || '·')}</kbd><span>${esc(item.text || item.name || '')}</span>${item.equipped || /being worn|weapon in hand|wielded/i.test(item.text || '') ? '<b class="equipped-label">EQUIPPED</b>' : ''}${item.quantity > 1 ? `<small>×${item.quantity}</small>` : ''}</button>`).join('')}`).join('') : '<p class="empty-state">Your pack is empty.</p>'}</div><div class="inventory-tools"><button disabled data-inventory-action="w">Wield</button><button disabled data-inventory-action="W">Wear</button><button disabled data-inventory-action="a">Apply</button><button disabled data-inventory-action="q">Drink</button><button disabled data-inventory-action="e">Eat</button><button disabled data-inventory-action="r">Read</button><button disabled data-inventory-action="d">Drop</button></div><div class="panel-footer"><span id="inventory-instruction">Select an item, then choose an action.</span><kbd>ESC to close</kbd></div>`;
    this.openPanel('inventory', 'Your possessions', body, { selectedKey: null,inventorySignature:JSON.stringify(items.map(i=>[i.id,i.key,i.name,i.quantity,i.equipped])) });
    this.$('#panel-layer').querySelectorAll('[data-item-key]').forEach(button => button.addEventListener('click', () => {
      this.$('#panel-layer').querySelectorAll('.inventory-item.selected').forEach(b => b.classList.remove('selected'));
      this.$('#panel-layer').querySelectorAll('[data-inventory-action]').forEach(b=>b.disabled=false);
      button.classList.add('selected'); this.panel.selectedKey = button.dataset.itemKey;this.panel.selectedId=Number(button.dataset.itemId);
      this.$('#inventory-instruction').textContent = button.querySelector('span').textContent;
    }));
    this.$('#panel-layer').querySelectorAll('[data-inventory-action]').forEach(button => button.addEventListener('click', () => { const key = this.panel.selectedKey,id=this.panel.selectedId; this.closePanels(false); this.callbacks.onCommand?.(button.dataset.inventoryAction, key,id); }));
  }

  showCommands(commands = DEFAULT_COMMANDS) {
    const normalized = commands.map(c => typeof c === 'string' ? { key: `#${c}`, name: capital(c), category: 'NetHack commands' } : { ...c, name: capital(c.name || c.text || c.key) }).sort((a,b)=>(a.category||'').localeCompare(b.category||'')||a.name.localeCompare(b.name));
    const body = `<div class="command-search-wrap">${icon('eye')}<input id="command-search" placeholder="Search commands, items, or actions…" autocomplete="off" aria-label="Search commands"><kbd>/</kbd></div><div class="command-list" id="command-list"></div><div class="panel-footer"><span>Every action has consequences.</span><kbd>ESC to close</kbd></div>`;
    this.openPanel('commands', 'Choose your next move', body, { commands: normalized, overline: 'THE ADVENTURER’S REPERTOIRE' });
    const render = filter => {
      const filtered = searchCommands(normalized,filter);
      let category = null;
      this.$('#command-list').innerHTML = filtered.length ? filtered.map(c => {
        const header = c.category !== category ? `<div class="menu-section">${esc(c.category || 'Commands')}</div>` : '';
        category = c.category;
        return `${header}<button class="command-item" data-palette-key="${esc(c.key)}">${icon(c.icon || 'scroll')}<span><strong>${esc(c.name)}</strong><small>${esc(c.description || '')}</small></span><kbd>Select</kbd></button>`;
      }).join('') : '<p class="empty-state">No matching commands. Try “spell”, “door”, or “armor”.</p>';
      this.$('#command-list').querySelectorAll('[data-palette-key]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.paletteKey; this.closePanels(false); this.callbacks.onCommand?.(key); }));
    };
    render('');
    this.$('#command-search').addEventListener('input', e => render(e.target.value));
    requestAnimationFrame(() => this.$('#command-search')?.focus());
  }

  setSpellChoices(items=[],status=''){
    this.spellItems=spellChoices(items);this.spellStatus=status;this.spellsLoading=false;
    if(this.panel?.type==='settings'&&this.panel.section==='spells')this.showSettings('spells',false);
  }

  showSettings(section='settings',refresh=true) {
    const playing=['playing','play','game'].includes(this.mode);
    const rows=[
      ['W A S D','Walk'],['MOUSE','Look'],['SHIFT / CTRL','Run / crouch'],['LEFT CLICK','Attack'],
      ['E','Pick up objects / loot chests and boxes'],['L','Close the open door you face'],['G','Eat'],['I / ALT','Inventory — select an item, then an action'],
      ['TAB','Search and select any NetHack command'],['SPACE','Jump'],['M','Hold map · look down to read'],['F','Choose a spell by letter while aiming'],['HOLD RIGHT CLICK','Defend with your shield or weapon'],['Z','Zap a wand'],
      ['C / T','Fire ammunition / throw an item'],['Q / R','Drink a potion / read'],['X','Swap weapons'],
      ['K / P / V','Kick / pray / search'],['1 / 2 / 3','Wield / cast / zap'],['4 / 5 / 6','Drink / apply / eat'],
      ['ARROW KEYS','Walk forward/back and turn'],['F10','Toggle fullscreen'],['ESC','Close the current menu; otherwise open settings'],
      ['MENU LETTERS','Select the displayed choice; they never move your character'],
    ];
    const controls=`<div class="help-controls">${rows.map(([key,text])=>`<div><kbd>${key}</kbd><span>${text}</span></div>`).join('')}</div>`;
    const settings=`<div class="setting-row"><div><strong>Fullscreen</strong><small>F10 exits fullscreen. Escape opens this menu.</small></div><button class="text-button" data-action="fullscreen">Toggle · F10</button></div>${[
      ['volume','Master volume','Overall sound level; softened highs and controlled dynamics.',0,1,.05],
      ['effectsVolume','Effects volume','Movement, monsters, combat and inventory.',0,1,.05],
      ['ambienceVolume','Ambience volume','Air, water, embers and distant stone.',0,1,.05],
      ['musicVolume','Music volume','Original, slow dungeon themes that change with the area.',0,1,.05],
      ['sensitivity','Look sensitivity','How quickly the camera follows your mouse.',.1,2,.05],
      ['pulseTime','Dungeon tempo','Pace of hunger, recovery and creature attacks.',.3,2,.1],
    ].map(([key,label,description,min,max,step])=>`<label class="setting-row"><div><strong>${label}</strong><small>${description}</small></div><output id="setting-value-${key}">${key==='pulseTime'?Number(this.settings[key]).toFixed(1)+'s':Math.round(this.settings[key]*100)+'%'}</output><input type="range" data-setting="${key}" value="${this.settings[key]}" min="${min}" max="${max}" step="${step}" aria-label="${label}"></label>`).join('')}<label class="setting-row"><div><strong>Area music</strong><small>Fade music in or out while keeping the dungeon sounds.</small></div><input id="music-enabled" type="checkbox" role="switch" ${this.settings.musicEnabled?'checked':''} aria-label="Area music"></label><button class="text-button" id="settings-reset">Reset settings</button>`;
    if(section==='spells'&&refresh&&playing)this.spellsLoading=true;
    const spellRows=spellChoices(bindSpellChoices(this.spellItems||[],this.settings.spellBindings));
    const spells=`<div class="field-guide"><p>Press <kbd>F</kbd> to aim a spell, then its letter below. Letters apply only inside spell selection. Assigning an occupied letter swaps the two spells. Uppercase letters use Shift.</p></div><p id="spell-binding-status" role="status">${this.spellsLoading?'Reading your known spells…':esc(this.spellStatus||(!playing?'Enter a dungeon to view your known spells.':spellRows.length?'Changes are saved automatically.':'You do not know any spells yet.'))}</p><div class="spell-bindings">${spellRows.map((item,index)=>`<label class="setting-row"><div><strong>${esc(capital(spellName(item)))}</strong><small>${esc(spellDetails(item))}</small></div><select data-spell-index="${index}" aria-label="Letter for ${esc(spellName(item))}">${[...SPELL_LETTERS].map(key=>`<option value="${key}" ${key===item.key?'selected':''}>${key}</option>`).join('')}</select></label>`).join('')}</div>${playing?'<button class="text-button" data-settings-section="spells">Refresh known spells</button>':''}<button class="text-button" id="spell-bindings-reset">Restore native letters</button>`;
    const guide=`<div class="field-guide">
      <article><h3>Entering commands</h3><p>Press <kbd>Tab</kbd>, type a command name such as <b>engrave</b>, <b>pray</b>, <b>wear</b> or <b>save</b>, then click the result or press <kbd>Enter</kbd>. The complete NetHack command list is searchable here.</p><p>When the game asks for an item or a choice, click it or press its displayed letter. Press <kbd>Escape</kbd> to cancel the choice and return to this menu.</p></article>
      <article><h3>Your first descent</h3><p>Find the Amulet of Yendor and carry it back to the surface. Use <kbd>WASD</kbd> to explore, aim with the mouse, and <kbd>E</kbd> to open doors, take nearby objects, or loot chests and boxes. Press <kbd>L</kbd> to close the open door you face. Walk into the left side of a stairwell, turn on its landing, and follow the return flight.</p></article>
      <article><h3>Travel and time</h3><p>Space jumps. M raises a parchment map; look down to read it and press M again to put it away. The sketch records explored symbols, dungeon depth and the time it was opened. Walk up altar steps before dropping offerings. Use Tab → offer to sacrifice a suitable corpse on the altar. Eating, dressing, sleep and paralysis fade to black while their native turns pass. Enemies and hunger still advance.</p></article><article><h3>Weapons, items and magic</h3><p>Press <kbd>I</kbd> or <kbd>Alt</kbd>, select an item, then choose Wield, Wear, Apply, Drink, Eat, Read or Drop. Attack with <kbd>Left click</kbd>. Hold <kbd>Right click</kbd> to defend: a weapon adds 1 armor point; a shield adds its native armor bonus again while raised. <kbd>F</kbd> selects spells; <kbd>Z</kbd> zaps wands; <kbd>G</kbd> selects food to eat. Directional effects use your facing direction. Item properties, charges, armor and resistances follow NetHack's rules.</p></article>
      <article><h3>A living dungeon</h3><p>Menus never pause the world. Creatures keep moving; hunger and recovery continue. Retreat somewhere safer before reading or organizing equipment. When caught in a pit, web or bear trap, hold a movement key to struggle free. Attempts take time and use native escape rules; waiting alone does not free you. Carrying too much slows walking and running; overloaded characters cannot move. Most foes can keep pace with a sprint. Red creatures have taken damage; red screen edges mean you have been hurt.</p></article>
      <article><h3>Keep your expedition</h3><p>Use <b>Save expedition</b> below, or <kbd>Tab</kbd> → Save, and confirm Yes. Continue restores the native save and your position. Closing the window alone does not save or stop the dungeon.</p></article>
    </div>`;
    const nav=`<nav class="expedition-tabs" aria-label="Expedition menu">${[['settings','Settings'],['spells','Spell letters'],['controls','All controls'],['guide','Field guide']].map(([key,label])=>`<button data-settings-section="${key}" aria-current="${key===section?'page':'false'}">${label}</button>`).join('')}</nav>`;
    const intro=`<div class="command-discovery"><div><strong>Every command is within reach.</strong><p><kbd>Tab</kbd> → type its name → <kbd>Enter</kbd></p></div>${playing?'<button data-action="commands" class="text-button">Open commands →</button>':''}</div>`;
    const footer=playing?'<div class="expedition-footer"><div><button data-command="S" class="text-button">Save expedition</button><button data-action="new-run" class="text-button">New run</button></div><button data-action="resume" class="primary-button">Return to dungeon <kbd>ESC</kbd></button></div>':'';
    this.openPanel('settings',playing?'Expedition':'Prepare your descent',nav+intro+(section==='spells'?spells:section==='controls'?controls:section==='guide'?guide:settings)+footer,{centered:true,section,overline:'SETTINGS · CONTROLS · GUIDE'});
    const save=()=>{try{localStorage.setItem('descent.settings',JSON.stringify(this.settings));}catch{}this.callbacks.onSettings?.({...this.settings});};
    this.$('#music-enabled')?.addEventListener('change',e=>{this.settings.musicEnabled=e.target.checked;save();});
    this.$('#panel-layer').querySelectorAll('[data-spell-index]').forEach(select=>select.addEventListener('change',()=>{
      const name=spellName(spellRows[Number(select.dataset.spellIndex)]);
      this.settings.spellBindings=rebindSpell(this.spellItems,this.settings.spellBindings,name,select.value);save();this.callbacks.onSound?.('select');
      this.spellStatus=`${capital(name)} is now ${select.value}. Any conflicting spell was swapped.`;this.showSettings('spells',false);this.$(`[data-spell-index="${select.dataset.spellIndex}"]`)?.focus();
    }));
    this.$('#spell-bindings-reset')?.addEventListener('click',()=>{this.settings.spellBindings={};save();this.spellStatus='Native spell letters restored.';this.showSettings('spells',false);});
    if(section==='spells'&&refresh&&playing)this.callbacks.onSpellSettings?.();
    this.$('#panel-layer').querySelectorAll('[data-setting]').forEach(input=>input.addEventListener('input',()=>{
      const key=input.dataset.setting;this.settings[key]=Number(input.value);
      this.$(`#setting-value-${key}`).textContent=key==='pulseTime'?Number(input.value).toFixed(1)+'s':Math.round(input.value*100)+'%';
      try{localStorage.setItem('descent.settings',JSON.stringify(this.settings));}catch{}
      this.callbacks.onSettings?.({...this.settings});
    }));
    this.$('#settings-reset')?.addEventListener('click',()=>{this.settings={...AUDIO_DEFAULTS,sensitivity:1,pulseTime:.8,spellBindings:{}};save();this.showSettings();});
  }

  showNewRun(){
    this.openPanel('settings','Begin a new expedition?',`<div class="field-guide"><p>Your current expedition will be saved before character creation. Starting again with the same name archives that save.</p></div><div class="expedition-footer"><button class="text-button" data-action="back-settings">Back</button><button class="primary-button" data-action="confirm-new-run">Save and start a new run</button></div>`,{centered:true,section:'new-run'});
  }
  showHelp(){this.showSettings('guide');}

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
    if (panel.aiming)e.preventDefault();
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if(panel.type!=='death')this.closePanels(true,true); return; }
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
    } else if(panel.type==='inventory'){const item=[...this.$('#panel-layer').querySelectorAll('[data-item-key]')].find(b=>b.dataset.itemKey===e.key);if(item){e.preventDefault();item.click();}}
    else if (panel.type === 'commands' && e.key === '/') { e.preventDefault(); this.$('#command-search').focus(); }
  }

  destroy() { window.removeEventListener('keydown', this.keyHandler, true); this.root.innerHTML = ''; }
}
