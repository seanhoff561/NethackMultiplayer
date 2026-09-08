import test from 'node:test';
import assert from 'node:assert/strict';
import {PartySimulation} from '../lib/party-simulation.mjs';
import {lootPositions} from '../src/loot.js';

const metadata={questLeader:'King Arthur',questNemesis:'Ixoth',questArtifact:'The Magic Mirror of Merlin',questStart:'3:1',questGoal:'3:2',sanctum:'1:10',earth:'4:1',astral:'4:5'};
const item=tag=>({id:10,quantity:1,name:tag,symbol:'(',campaignItem:tag});
const actor=(name,x,y,loot=[],peaceful=false)=>({id:1,name,x,y,hp:20,maxHp:20,level:5,canMove:true,speed:12,peaceful,loot});
function floor(id,links=[],extra={}){
  const tiles=Array.from({length:144},(_,i)=>({x:i%12,y:Math.floor(i/12),type:'floor'}));
  for(const link of links)Object.assign(tiles[link.y*12+link.x],{type:link.up?'stairs-up':'stairs-down'});
  return {levelId:id,width:12,height:12,player:{x:5,y:5,hp:100,depth:Number(id.split(':')[1]),dungeon:id.startsWith('4:')?'Elemental Planes':'Dungeons of Doom'},tiles,connections:links,campaign:{...metadata},actors:[],floorObjects:[],...extra};
}
const link=(to,x,y,up=false,kind='stairs')=>({to,x,y,up,kind});
function setup(){
  const graph=new Map([
    ['0:1',floor('0:1',[link('0:0',2,2,true),link('3:1',9,9,false,'portal'),link('1:9',2,9)])],
    ['3:1',floor('3:1',[link('0:1',2,2,false,'portal'),link('3:2',9,9)],{actors:[actor('King Arthur',5,5,[],true)]})],
    ['3:2',floor('3:2',[link('3:1',2,2,true)],{actors:[actor('Ixoth',5,5,[item('bell'),item('questArtifact')])]})],
    ['1:9',floor('1:9',[link('0:1',2,2,true)],{campaign:{...metadata,invocation:true,invocationX:5,invocationY:5},floorObjects:[{...item('candelabrum'),x:5,y:5},{...item('book'),id:11,x:5,y:5}]})],
    ['1:10',floor('1:10',[link('1:9',2,2,true)],{actors:[actor('high priest',5,5,[item('amulet')])]})],
    ...[1,2,3,4].map(n=>[`4:${n}`,floor(`4:${n}`,[link(`4:${n+1}`,9,9,false,'portal')])]),
    ['4:5',floor('4:5')],
  ]);
  Object.assign(graph.get('4:5').tiles[65],{type:'altar',altarAlignment:1});Object.assign(graph.get('4:5').tiles[68],{type:'altar',altarAlignment:-1});
  const events=[],r=new PartySimulation({code:'ABCDEF12',generator:{floor:async id=>structuredClone(graph.get(id===1?'0:1':id))},send:(id,e)=>events.push({recipient:id,...structuredClone(e)})});return {r,events};
}
function stand(p,x,y){Object.assign(p.body,{x:(x+.5)*3,z:(y+.5)*3,y:0});}
async function travel(r,p,to){const f=r.floors.get(p.depth),c=f.source.connections.find(c=>c.to===to);assert.ok(c,`passage to ${to}`);stand(p,c.x,c.y);await r.transition(p,c.up?'<':'>');}
function collect(r,p,tag){const f=r.floors.get(p.depth),o=lootPositions(f.objects,f.sim.world).find(i=>i.campaignItem===tag);assert.ok(o,`${tag} exists on floor`);Object.assign(p.body,{x:o.worldX,z:o.worldZ,y:o.worldY});r.pickup(p,o.id);}

test('creator-owned quest through invocation, real Amulet, five Planes and shared ascension',async()=>{
  const {r,events}=setup(),owner=await r.join({name:'Founder',role:'Knight',alignment:'lawful'}),guest=await r.join({name:'Guest',role:'Wizard',alignment:'chaotic'});
  await travel(r,owner,'3:1');stand(owner,5,4);assert.throws(()=>r.command(owner,'#chat'),/14/);await assert.rejects(travel(r,owner,'3:2'),/quest leader/);
  owner.level=14;stand(owner,5,4);r.command(owner,'#chat');await travel(r,guest,'3:1');r.disconnect(owner.id);assert.equal(r.hostId,guest.id);assert.equal(r.campaign.state.owner.id,owner.id);assert.equal(r.campaign.state.owner.role,'Knight');
  await travel(r,guest,'3:2');const nemesis=[...r.floors.get(guest.depth).sim.actors.values()][0];r.hit(guest,nemesis,1000);collect(r,guest,'bell');collect(r,guest,'questArtifact');await travel(r,guest,'3:1');stand(guest,5,4);r.command(guest,'#chat');assert.ok(r.campaign.state.questComplete);
  const saved=r.serialize(),restored=setup().r;restored.restore(saved);assert.deepEqual(restored.campaign.state,r.campaign.state);
  await travel(r,guest,'0:1');await travel(r,guest,'1:9');stand(guest,5,5);assert.throws(()=>r.command(guest,'#invoke'),/Gather/);collect(r,guest,'book');collect(r,guest,'candelabrum');stand(guest,5,5);r.command(guest,'#invoke');assert.ok(r.campaign.state.invoked);
  await travel(r,guest,'1:10');r.hit(guest,[...r.floors.get(guest.depth).sim.actors.values()][0],1000);collect(r,guest,'amulet');await travel(r,guest,'1:9');await travel(r,guest,'0:1');await travel(r,guest,'0:0');assert.equal(guest.depth,'4:1');
  await r.join({},owner.token);assert.equal(owner.depth,guest.depth,'returning companion catches up to final Planes');await assert.rejects(r.join({}),/final Planes/);
  for(let n=2;n<=5;n++){await travel(r,guest,`4:${n}`);await travel(r,owner,`4:${n}`);}
  stand(guest,8,5);assert.throws(()=>r.command(guest,'#offer'),/lawful altar/);assert.ok(guest.inventory.some(i=>i.campaignItem==='amulet'));
  stand(guest,5,5);r.command(guest,'#offer');assert.equal(r.outcome.status,'victory');assert.equal(events.filter(e=>e.type==='party-result').length,2);assert.ok(r.campaign.state.ascended);assert.equal(guest.inventory.some(i=>i.campaignItem==='amulet'),false);
  const ended=setup().r;ended.restore(r.serialize());assert.equal(ended.outcome.status,'victory');assert.throws(()=>ended.command(ended.players.get(guest.id),'#offer'),/ended/);
});

test('the Sanctum and surface gates are authoritative and require nearby living companions',async()=>{
  const {r}=setup(),a=await r.join({}),b=await r.join({});assert.throws(()=>r.campaign.connection(a,link(metadata.sanctum,0,0)),/invocation/);await assert.rejects(travel(r,a,'0:0'),/Amulet/);
  a.inventory.push(item('amulet'));r.campaign.acquired(a.inventory.at(-1));stand(b,11,11);await assert.rejects(travel(r,a,'0:0'),/Gather/);assert.equal(a.depth,1);assert.equal(r.campaign.state.planes,false);
});

test('search reveals secret passages and excavation mutates shared terrain and saves',async()=>{
  const {r}=setup(),p=await r.join({}),f=r.floors.get(1);stand(p,5,5);const secret=f.source.tiles[66];Object.assign(secret,{type:'wall',secretDoor:true,diggable:false});r.command(p,'s');assert.equal(secret.type,'door');assert.equal(secret.secretDoor,false);
  const rock=f.source.tiles[53];Object.assign(rock,{type:'stone',diggable:true});assert.throws(()=>r.command(p,'#dig',{targetCell:{x:5,z:4}}),/pick-axe/);p.inventory.push(r.item('pick-axe','tool'));r.command(p,'#dig',{targetCell:{x:5,z:4}});assert.equal(rock.type,'corridor');assert.equal(r.serialize().floors[0].source.tiles[53].type,'corridor');
});

test('quest weapons cannot be destroyed by the generic ammunition action',async()=>{
  const {r}=setup(),p=await r.join({}),bow={...item('questArtifact'),id:900,symbol:')',name:'The Longbow of Diana'};p.inventory.push(bow);assert.throws(()=>r.command(p,'f',{itemId:bow.id}),/cannot be consumed/);assert.ok(p.inventory.includes(bow));assert.equal(bow.quantity,1);
});
