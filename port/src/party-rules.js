// Cooperative rules are shared for presentation; only the server applies them.
export const MAX_PLAYERS = 4;
export const VOICE_RANGE = 18;
export const CLASSES = Object.freeze({
  Archeologist:{color:0x91755a,trim:0xc4aa7b,hat:'brim',weapon:'bullwhip',hp:30,power:16,damage:6,armor:1,spell:'Survey'},
  Barbarian:{color:0x76504a,trim:0xafa292,hat:'horns',weapon:'battle-axe',hp:46,power:8,damage:11,armor:2,spell:'War cry'},
  Caveman:{color:0x746550,trim:0xab9475,hat:'fur',weapon:'club',hp:42,power:10,damage:9,armor:2,spell:'Stone bolt'},
  Healer:{color:0x708773,trim:0xc7cab2,hat:'cap',weapon:'quarterstaff',hp:30,power:32,damage:5,armor:1,spell:'Healing circle'},
  Knight:{color:0x6e7890,trim:0xc2b18b,hat:'helm',weapon:'long sword',hp:42,power:14,damage:8,armor:4,spell:'Rally'},
  Monk:{color:0x9a7455,trim:0xc0a078,hat:'band',weapon:'bare hands',hp:36,power:24,damage:8,armor:2,spell:'Healing circle'},
  Priest:{color:0xaaa796,trim:0xab91b9,hat:'mitre',weapon:'mace',hp:32,power:30,damage:6,armor:2,spell:'Healing circle'},
  Ranger:{color:0x526c5b,trim:0x9e997b,hat:'hood',weapon:'short sword',hp:34,power:18,damage:7,armor:2,spell:'Entangle'},
  Rogue:{color:0x504d66,trim:0x9d8497,hat:'hood',weapon:'dagger',hp:32,power:18,damage:8,armor:1,spell:'Shadow step'},
  Samurai:{color:0x794b54,trim:0xb8a585,hat:'kabuto',weapon:'katana',hp:40,power:14,damage:9,armor:3,spell:'War cry'},
  Tourist:{color:0x8a778b,trim:0xbeb296,hat:'brim',weapon:'dagger',hp:30,power:20,damage:6,armor:1,spell:'Flash'},
  Valkyrie:{color:0x647c8b,trim:0xccc7b0,hat:'wings',weapon:'long sword',hp:44,power:16,damage:9,armor:3,spell:'Frost bolt'},
  Wizard:{color:0x625781,trim:0xb9a4cb,hat:'point',weapon:'quarterstaff',hp:28,power:38,damage:5,armor:1,spell:'Force bolt'},
});
export const partyScaling = count => ({health:1 + .65*(Math.max(1,Math.min(4,count))-1),damage:1 + .18*(Math.max(1,Math.min(4,count))-1)});
export function voiceGain(local,remote,world){
  if(!local||!remote||local.levelId!==remote.levelId||remote.connected===false)return 0;
  const distance=Math.hypot(local.x-remote.x,local.z-remote.z,(local.y||0)-(remote.y||0));
  return Math.max(0,1-distance/VOICE_RANGE)**2*(world&&!world.lineClear(local,remote,.02)?.22:1);
}
export const PARTY_COMMANDS = [
  ['i','Inventory','Inspect your equipment'],['w','Wield','Equip a weapon'],['W','Wear','Equip armor'],['T','Take off','Remove armor'],['d','Drop','Share an item with your party'],
  [',','Pick up','Take a nearby item'],['q','Drink','Drink a healing potion'],['e','Eat','Eat food'],['r','Read','Read a scroll'],['a','Apply','Use a tool or open a container'],
  ['Z','Cast','Use your class ability'],['z','Zap','Fire a wand'],['f','Fire','Fire ammunition'],['t','Throw','Throw an item'],['x','Swap','Swap weapons'],
  ['s','Search','Reveal nearby traps and secret passages'],['#pray','Pray','Recover beside an altar'],['#offer','Offer','Sacrifice a corpse at an altar'],['#loot','Loot','Open a nearby container'],
  ['#revive','Revive ally','Spend 10 uninterrupted seconds reviving a companion within two metres'],['#chat','Quest leader','Speak on behalf of the world creator'],['#invoke','Invocation','Use the three invocation tools at the vibrating square'],['>','Descend','Use a nearby down staircase or portal'],['<','Ascend','Use a nearby up staircase'],
  ['S','Save party','Save everyone and every explored floor'],['#showspells','Known spells','Review your class ability'],['.','Wait','Stand still'],
].map(([key,name,description])=>({key,name,description,category:'Cooperative expedition'}));
