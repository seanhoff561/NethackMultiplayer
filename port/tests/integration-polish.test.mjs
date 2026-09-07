import test from 'node:test';
import assert from 'node:assert/strict';
import {SpatialSimulation} from '../lib/spatial-simulation.mjs';
import {branchStyle,dressingPlan} from '../src/voxel.js';
import {creatureProfile} from '../src/creatures.js';
import {itemProfile} from '../src/item-models.js';
const tiles=[];for(let x=0;x<15;x++)for(let y=0;y<15;y++)tiles.push({x,y,type:x===0||y===0||x===14||y===14?'wall':'floor'});
test('encumbrance scales walking and running, including zero; native movement speed drives pursuit',()=>{
  const distances=[];
  for(const scale of [1,.75,.5,.25,.125,0]){
    const s=new SpatialSimulation();s.accept({levelId:'a',tiles,player:{x:7,y:7,hp:20,speedScale:scale},actors:[]});const z=s.player.z;
    for(let i=0;i<60;i++){s.setInput({forward:1,run:true});s.update(1/60);}distances.push(z-s.player.z);
  }
  for(let i=0;i<distances.length;i++)assert.ok(Math.abs(distances[i]-5.15*[1,.75,.5,.25,.125,0][i])<1e-8);
  for(const speed of [6,12,18]){
    const s=new SpatialSimulation();s.accept({levelId:'a',tiles,player:{x:7,y:7,hp:20},actors:[{id:1,x:3,y:7,name:'orc',speed,canMove:true}]});const a=s.actors.get(1),x=a.x;
    for(let i=0;i<60;i++)s.update(1/60);
    assert.ok(Math.abs(a.x-x-Math.min(8.5,speed/12*5.15))<.01);
  }
});
test('boss collision occupies a hallway and humanoid silhouettes match the player',()=>{
  assert.ok(creatureProfile({name:'orc',size:2}).height>=1.8);
  assert.ok(creatureProfile({name:'gnome',size:1}).height>=1.5);
  const boss=creatureProfile({name:'Orcus',boss:true,size:3});assert.ok(boss.height>3&&boss.radius>1);
  assert.ok(creatureProfile({name:'kitten',size:0}).height<1);
});
test('branches have distinct palettes and dressing; Sokoban has no interior additions',()=>{
  const names=['Dungeons of Doom','Gnomish Mines','Sokoban','Gehennom','Astral Plane','Quest'];
  assert.equal(new Set(names.map(n=>branchStyle(n).wall)).size,names.length);
  for(const name of names){const plan=dressingPlan(tiles,name);assert.deepEqual(plan,dressingPlan([...tiles].reverse(),name));assert.ok(plan.length<25);}
  assert.ok(dressingPlan(tiles,'Gnomish Mines').some(p=>p.interior));
  assert.ok(dressingPlan(tiles,'Sokoban').every(p=>p.theme===5&&!p.interior));
});
test('item classification follows native classes and slots, not misleading words in names',()=>{
  assert.equal(itemProfile('golden potion','!').family,'potion');
  assert.equal(itemProfile('ring of protection from shape changers','=').family,'ring');
  assert.equal(itemProfile('hard shoes','[',{armorSlot:4}).slot,4);
  assert.equal(itemProfile('potion of healing','!',{appearance:'pink'}).key,itemProfile('pink potion','!',{appearance:'pink'}).key);
  assert.notEqual(itemProfile('pink potion','!',{appearance:'pink'}).key,itemProfile('blue potion','!',{appearance:'blue'}).key);
});
