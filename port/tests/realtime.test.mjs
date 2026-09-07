import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeClock } from '../lib/realtime.mjs';
import { readCommands,directionKey,headingDirection } from '../lib/commands.mjs';
import { fileURLToPath } from 'node:url';

test('idle pulses advance the engine independently of overlays',()=>{
  let time=0; const actions=[]; const clock=new RealtimeClock({act:a=>actions.push(a),canAct:()=>true,now:()=>time,interval:800});
  clock.start(); time=799; assert.equal(clock.update(),false);
  time=800; assert.equal(clock.update(),true); assert.equal(actions[0].key,'.');
  time=1600; clock.update(); assert.equal(actions.length,2);
});
test('blocked engine does not accumulate catch-up actions',()=>{
  let time=0,ready=false; const actions=[]; const clock=new RealtimeClock({act:a=>actions.push(a),canAct:()=>ready,now:()=>time});
  clock.start(); time=30000; clock.update(); assert.equal(actions.length,0);
  ready=true; clock.update(); clock.update(); assert.equal(actions.length,1);
});
test('save can supersede queued commands and command queue remains bounded',()=>{
  const clock=new RealtimeClock({act:()=>{},canAct:()=>true});
  for(let i=0;i<8;i++)assert.equal(clock.enqueue({key:'e'}),true);
  assert.equal(clock.enqueue({key:'e'}),false);clock.clearQueue();clock.enqueue({key:'S'});assert.deepEqual(clock.queue,[{key:'S'}]);
});
test('legacy directional commands retain native eight-way selection',()=>{
  assert.deepEqual(headingDirection(0),[0,-1]); assert.deepEqual(headingDirection(Math.PI/2),[-1,0]);
  assert.equal(directionKey(...headingDirection(-Math.PI/2)),'l'); assert.equal(directionKey(-1,1),'b');
});
test('command palette is extracted from actual NetHack command registry',()=>{
  const commands=readCommands(fileURLToPath(new URL('../../src/cmd.c',import.meta.url)));
  assert.ok(commands.length>90,`Found ${commands.length} commands`);
  for(const name of ['cast','wield','engrave','dip','pray','invoke','offer','save','optionsfull']) assert.ok(commands.some(c=>c.name===name),name);
  assert.ok(!commands.some(c=>c.name.startsWith('wiz')));
  assert.equal(commands.find(c=>c.name==='kick').key,'\x04');
});
