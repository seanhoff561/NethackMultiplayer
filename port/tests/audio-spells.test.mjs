import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSpellChoices,rebindSpell,spellName,SPELL_LETTERS} from '../src/spell-bindings.js';
import {SCORES,scoreFor,soundArea,creatureVoice,soundPosition} from '../src/soundscape.js';
import {DungeonAudio} from '../src/audio.js';
const spells=[{id:2,key:'a',text:'force bolt            1   attack        0% 100%'},{id:3,key:'b',text:'healing\t1\thealing\t0%\t100%'}];
test('spell bindings swap collisions while preserving native identifiers and full menu text',()=>{
  const bindings=rebindSpell(spells,{},'force bolt','b'),mapped=bindSpellChoices(spells,bindings);
  assert.equal(spellName(spells[0]),'force bolt');assert.equal(spellName(spells[1]),'healing');
  assert.deepEqual(mapped.map(i=>[i.id,i.key]),[[2,'b'],[3,'a']]);assert.equal(mapped[0].text,spells[0].text);
  const shifted=rebindSpell(spells,bindings,'force bolt','Q');assert.equal(bindSpellChoices(spells,shifted)[0].key,'Q');
  assert.deepEqual(rebindSpell(spells,shifted,'force bolt','Escape'),shifted);
});
test('new spells, duplicate stored preferences and native reorderings cannot duplicate accelerators',()=>{
  const all=[...SPELL_LETTERS].map((key,i)=>({id:i+2,key,text:`spell-${i}\t1\tattack\t0%`}));
  const keys=bindSpellChoices(all,{'spell-0':'Z','spell-1':'Z','spell-2':'a'}).map(i=>i.key);
  assert.equal(new Set(keys).size,52);assert.equal(keys[0],'Z');assert.ok(keys[51]);
  const reordered=[{...spells[1],key:'a',id:2},{...spells[0],key:'b',id:3}];
  assert.equal(bindSpellChoices(reordered,{'force bolt':'q'})[1].key,'q');
});
test('jumps cut active footstep sources, emit no airborne footsteps and land only once',()=>{
  const a=new DungeonAudio(),played=[];a.context={state:'running',currentTime:10};a._tone=(...x)=>played.push(x);a._noise=(...x)=>played.push(x);
  let stopped=0;a.voices.add({bus:'footsteps',source:{stop(){stopped++;}}});a.step(true);a.jump();assert.equal(stopped,1);
  const count=played.length;a.context.currentTime+=.4;a.step(true);assert.equal(played.length,count);
  a.movement(false);a.movement(false);assert.equal(a.events.filter(e=>e.name==='land').length,1);
  a.context.currentTime+=.7;a.step();assert.equal(a.events.filter(e=>e.name==='footstep').length,2);
});
test('spatial sounds attenuate with distance and walls and pan with the listener',()=>{
  const near=soundPosition({x:3,z:0},{}),far=soundPosition({x:18,z:0},{}),wall=soundPosition({x:3,z:0},{},{lineClear:()=>false});
  assert.ok(near.pan>0);assert.ok(soundPosition({x:3,z:0},{yaw:Math.PI}).pan<0);assert.ok(far.gain<near.gain);assert.ok(wall.gain<near.gain*.2);assert.equal(soundPosition({x:30,z:0},{}).gain,0);
  soundPosition({x:90,z:0},{},{lineClear:()=>{throw Error('Distant sounds must be culled before wall tracing');}});
  assert.ok(creatureVoice({name:'ghost'}).floating);assert.notEqual(creatureVoice({name:'wolf'}).kind,creatureVoice({name:'hill orc'}).kind);
});
test('every area has a distinct composed phrase with restrained music and creature pitches',()=>{
  const areas=['Dungeons of Doom','Gnomish Mines','Sokoban','Gehennom','Astral Plane','Fort Ludios','The Quest',"Vlad's Tower",'Plane of Water'];
  assert.equal(new Set(areas.map(scoreFor)).size,9);
  assert.equal(scoreFor(soundArea({player:{dungeon:'The Elemental Planes'},levelId:'7:2'})),'water');
  assert.equal(scoreFor(soundArea({player:{dungeon:'The Elemental Planes'},levelId:'7:3'})),'infernal');
  for(const score of Object.values(SCORES)){assert.equal(score.melody.length,8);assert.ok(score.tempo<=64);assert.ok(Math.max(...score.melody)+score.root<60);}
  const a=new DungeonAudio(),tones=[],noises=[];a.context={state:'running',currentTime:10};a._tone=(...x)=>tones.push(x);a._noise=(...x)=>noises.push(x);
  for(const [id,name] of ['wolf','hill orc','ghost','minotaur','dragon','spider','bat'].entries())for(const action of ['attack','death','idle'])a.creature({id,name},action);
  assert.ok(tones.every(t=>t[2]<=180&&t[3]<=180));assert.ok(noises.every(n=>n[2]<=650));
});
