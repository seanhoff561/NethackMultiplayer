import test from 'node:test';
import assert from 'node:assert/strict';
import {PartySimulation} from '../lib/party-simulation.mjs';
import {CLASSES,partyScaling,voiceGain} from '../src/party-rules.js';
import {lootPositions} from '../src/loot.js';

export function fixture(depth=1){return {width:20,height:20,levelId:`0:${depth}`,player:{x:5,y:5,depth,hp:20,dungeon:'Dungeons of Doom'},inventory:[],tiles:Array.from({length:400},(_,i)=>({x:i%20,y:Math.floor(i/20),type:i===42?'stairs_up':i===357?'stairs_down':'floor'})),actors:[{id:1,x:10,y:10,hp:12,maxHp:12,level:1,name:'goblin',symbol:'o',canMove:true,speed:12,visible:true,peaceful:false}],floorObjects:[{id:4,x:5,y:5,name:'potion of healing',symbol:'!',quantity:1}]};}
function room(){const events=[];return {events,room:new PartySimulation({code:'ABCDEF12',generator:{floor:async depth=>fixture(depth)},send:(id,event)=>events.push({recipient:id,...structuredClone(event)})})};}
test('four independent heroes, capped concurrent joins, unique inventories, reserved reconnect',async()=>{
  const {room:r}=room();const players=await Promise.all(['Knight','Wizard','Healer','Rogue'].map(role=>r.join({name:role,role})));
  await assert.rejects(r.join({}),/full/);assert.equal(r.players.size,4);assert.equal(new Set(players.flatMap(p=>p.inventory.map(i=>i.id))).size,players.reduce((n,p)=>n+p.inventory.length,0));
  assert.equal(r.floors.get(1).sim.actors.values().next().value.data.maxHp,Math.ceil(12*2.95));
  assert.equal(new Set(players.map(p=>r.publicPlayer(p).id)).size,4,'wire identity must not be overwritten by the legacy body id');
  const p=players[1],old={...p.body};r.input(p,{forward:1,yaw:0});for(let i=0;i<8;i++)r.tick(1/60);assert.notEqual(p.body.z,old.z);assert.equal(players[0].input.forward,undefined);
  r.disconnect(p.id);const inventory=p.inventory;r.tick(.4);const stationary={...p.body};r.tick(.1);assert.deepEqual(p.body,stationary);
  const resumed=await r.join({},p.token);assert.equal(resumed.id,p.id);assert.equal(resumed.inventory,inventory);await assert.rejects(r.join({},p.token),/already connected/);
});
test('pickup races cannot duplicate objects, prompts and equipped inventory belong to each hero',async()=>{
  const {room:r,events}=room(),a=await r.join({role:'Knight'}),b=await r.join({role:'Wizard'}),f=r.floors.get(1),o=lootPositions(f.objects,f.sim.world)[0];
  a.body={...a.body,x:o.worldX,z:o.worldZ,y:o.worldY};b.body={...a.body};
  await Promise.all([r.action(a,{id:'a',pickup:o.id}),r.action(b,{id:'b',pickup:o.id})]);
  assert.equal(a.inventory.filter(i=>i.id===o.id).length,1);assert.equal(b.inventory.filter(i=>i.id===o.id).length,0);assert.equal(f.objects.length,0);
  assert.ok(events.some(e=>e.recipient===b.id&&e.status==='rejected'));
  r.command(a,'q');assert.ok(a.prompt);assert.equal(b.prompt,null);
  r.answer(b,{input:{value:[a.inventory.find(i=>i.symbol==='!').id]}});assert.ok(a.prompt);
  const own=a.inventory.find(i=>i.id===o.id);r.time+=1;r.command(a,'d',{itemId:own.id});assert.equal(f.objects.length,1);assert.equal(b.inventory.some(i=>i.id===own.id),false);
});
test('replay protection, reach checks, enemy targeting and persistent floor mutations',async()=>{
  const {room:r}=room(),a=await r.join({}),b=await r.join({role:'Healer'}),f=r.floors.get(1),enemy=[...f.sim.actors.values()][0];
  a.body={...a.body,x:30,z:30,y:0};b.body={...b.body,x:enemy.x,z:enemy.z-1.4,y:0};b.invulnerableUntil=0;
  const hp=b.hp;r.tick(.1);assert.ok(b.hp<hp,'enemy attacks the nearby second player');assert.equal(a.hp,a.maxHp);
  enemy.data.canMove=false;r.time+=1;a.body={...a.body,x:enemy.x,z:enemy.z+1.6,y:0};await r.action(a,{id:'once',melee:true,yaw:0});const remaining=enemy.data.hp;
  r.time+=1;await r.action(a,{id:'once',melee:true,yaw:0});assert.equal(enemy.data.hp,remaining,'duplicate action cannot hit twice');
  assert.throws(()=>r.pickup(a,f.objects[0].id),/reach/);
  const stair=f.source.tiles.find(t=>t.type==='stairs_down');a.body=f.sim.world.spawn(stair.x,stair.y);await r.transition(a,'>');assert.equal(a.depth,2);assert.equal(b.depth,1);
  const saved=r.serialize(),restored=room().room;restored.restore(saved);assert.deepEqual(restored.serialize().floors,saved.floors);assert.equal(restored.players.get(a.id).depth,2);assert.equal(restored.players.get(b.id).connected,false);
});
test('scaling preserves damage, voice is silent across floors and beyond range',async()=>{
  const {room:r}=room(),a=await r.join({}),f=r.floors.get(1),enemy=[...f.sim.actors.values()][0];enemy.data.hp=6;await r.join({});assert.equal(enemy.data.hp,10);assert.deepEqual(partyScaling(4),{health:2.95,damage:1.54});
  const here={x:0,z:0,levelId:'party:1'},near={x:2,z:0,levelId:'party:1'};
  assert.ok(voiceGain(here,near)>voiceGain(here,{...near,x:12}));assert.equal(voiceGain(here,{...near,x:19}),0);assert.equal(voiceGain(here,{...near,levelId:'party:2'}),0);
  assert.ok(voiceGain(here,near,{lineClear:()=>false})<voiceGain(here,near));assert.equal(Object.keys(CLASSES).length,13);
});
test('downed allies revive, all floors continue ticking, party wipe recovers',async()=>{
  const {room:r}=room(),a=await r.join({role:'Knight'}),b=await r.join({role:'Healer'});b.body={...a.body,x:a.body.x+.8};r.hurt(b,100);assert.equal(b.hp,0);r.command(a,'#revive');assert.ok(b.hp>0);
  r.time+=5;r.hurt(a,100);r.hurt(b,100);r.tick(.1);r.tick(5.1);assert.ok(a.hp>0&&b.hp>0);
});
test('projectiles persist in party saves and hero bodies keep distinct collision IDs',async()=>{
  const {room:r}=room(),a=await r.join({}),b=await r.join({});assert.notEqual(a.body.id,b.body.id);
  r.projectile(a,'arrow',5,'k',r.item('dart','ammo'));const saved=r.serialize(),restored=room().room;restored.restore(saved);assert.deepEqual(restored.floors.get(1).projectiles,saved.floors[0].projectiles);
  const ids=restored.motion(restored.players.get(a.id)).players.map(p=>p.id);assert.equal(new Set(ids).size,2);
});
