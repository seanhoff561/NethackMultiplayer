export const AUDIO_DEFAULTS=Object.freeze({volume:.55,effectsVolume:.8,ambienceVolume:.65,musicVolume:.42,musicEnabled:true});
// Original, slow modal phrases. Pitches stay in the cello/low-woodwind range.
export const SCORES={
  dungeon:{name:'Beneath the Stone',root:38,tempo:52,chords:[0,5,3,7],melody:[12,7,10,5,7,3,2,7],color:580},
  mines:{name:'Veins of the Mountain',root:36,tempo:60,chords:[0,3,5,0],melody:[7,12,10,7,3,5,7,2],color:680},
  sokoban:{name:'The Silent Mechanism',root:41,tempo:64,chords:[0,5,7,3],melody:[12,14,7,10,5,7,3,7],color:800},
  infernal:{name:'Ash and Iron',root:33,tempo:48,chords:[0,1,5,0],melody:[7,1,7,8,5,1,3,0],color:420},
  astral:{name:'Beyond the Veil',root:43,tempo:46,chords:[0,5,3,7],melody:[12,7,14,10,7,12,5,7],color:850},
  fortress:{name:'The Fallen Crown',root:38,tempo:56,chords:[0,7,5,3],melody:[7,12,10,7,5,7,3,2],color:640},
  quest:{name:'An Oath Remembered',root:40,tempo:54,chords:[0,3,7,5],melody:[12,7,10,14,12,5,3,7],color:720},
  tower:{name:'The Hollow Spire',root:35,tempo:46,chords:[0,5,1,7],melody:[12,7,8,3,7,1,5,0],color:490},
  water:{name:'Drowned Halls',root:39,tempo:48,chords:[0,5,3,0],melody:[7,12,14,10,5,7,3,2],color:530},
};
export function scoreFor(area=''){
  const name=area.toLowerCase();
  if(/plane of earth/.test(name))return 'mines';if(/plane of fire/.test(name))return 'infernal';
  if(/water|juiblex/.test(name))return 'water';
  if(/vlad|tower/.test(name))return 'tower';
  if(/mine/.test(name))return 'mines';if(/sokoban/.test(name))return 'sokoban';
  if(/gehennom|hell|sanctum/.test(name))return 'infernal';if(/plane|astral/.test(name))return 'astral';
  if(/quest|home|locate|goal/.test(name))return 'quest';if(/fort|castle|ludios/.test(name))return 'fortress';return 'dungeon';
}
export function soundArea(snapshot){
  const name=snapshot?.player?.dungeon||'';
  // Fixed sublevels in dat/dungeon.lua; branch IDs themselves are not assumed.
  if(/elemental planes/i.test(name)){const level=Number(String(snapshot.levelId).split(':')[1]);return ['','Astral Plane','Plane of Water','Plane of Fire','Plane of Air','Plane of Earth'][level]||name;}
  return name;
}
export function creatureVoice(actor={}){
  const name=(actor.name||'').toLowerCase(),symbol=actor.symbol||'';
  if(/ghost|wraith|shade|vampire|lich|zombie|skeleton/.test(name))return {kind:'undead',pitch:68,weight:.7,floating:/ghost|wraith|shade/.test(name)};
  if(/dragon|demon|balrog|devil|minotaur|giant|troll/.test(name)||actor.boss)return {kind:'large',pitch:44,weight:1.4,floating:/dragon/.test(name)&&actor.flying};
  if(/bat|bird|raven|floating|sphere|vortex|elemental|jellyfish/.test(name))return {kind:'air',pitch:110,weight:.2,floating:true};
  if(/ant|spider|beetle|centipede|scorpion|worm|snake|slime|blob|jelly|pudding/.test(name)||'asw'.includes(symbol)&&symbol)return {kind:'crawler',pitch:80,weight:.3,floating:false};
  if(/dog|cat|kitten|wolf|jackal|tiger|horse|pony|bear|rat|lion|unicorn/.test(name))return {kind:'beast',pitch:90,weight:.65,floating:false};
  return {kind:'humanoid',pitch:82,weight:1,floating:false};
}
export function soundPosition(point,listener={},collision){
  const dx=point.x-(listener.x||0)*3,dz=point.z-(listener.y||0)*3,distance=Math.hypot(dx,dz,(point.y||0)-(listener.elevation||0));
  if(distance>20)return {distance,pan:0,gain:0,occluded:false};
  const clear=!collision||collision.lineClear({x:(listener.x||0)*3,z:(listener.y||0)*3},point,.01);
  return {distance,pan:(Math.cos(listener.yaw||0)*dx-Math.sin(listener.yaw||0)*dz)/Math.max(1,distance),gain:distance>20?0:(clear?1:.16)/(1+distance*distance*.045),occluded:!clear};
}
