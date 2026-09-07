import test from 'node:test';
import assert from 'node:assert/strict';
import {voxelVolume,dressingPlan} from '../src/voxel.js';
import {DungeonAudio} from '../src/audio.js';
import {swingPose} from '../src/presentation.js';
import {Vector3,Euler} from 'three';
import {searchCommands} from '../src/ui.js';

test('command search ranks exact names ahead of incidental description matches',()=>{
  const commands=[{name:'Adjust',description:'Change inventory letters'},{name:'Inventory type'},{name:'Inventory'},{name:'Pray'}];
  assert.deepEqual(searchCommands(commands,' inventory ').map(c=>c.name),['Inventory','Inventory type','Adjust']);
  assert.equal(searchCommands(commands,'pray')[0].name,'Pray');assert.equal(searchCommands(commands,'no such command').length,0);
});

test('voxel volumes are closed with consistently wound exterior faces',()=>{
  for(const n of [4,6]){
    const {positions:p,normals,uvs}=voxelVolume(n),edges=new Map();
    assert.equal(normals.length,p.length);assert.equal(uvs.length,p.length*2/3);
    const key=v=>v.map(x=>Math.round(x*n*2)).join(',');
    for(let i=0;i<p.length;i+=9){
      const a=p.slice(i,i+3),b=p.slice(i+3,i+6),c=p.slice(i+6,i+9);
      const cross=new Vector3().subVectors(new Vector3(...b),new Vector3(...a)).cross(new Vector3().subVectors(new Vector3(...c),new Vector3(...a)));
      assert.ok(cross.dot(new Vector3(...normals.slice(i,i+3)))>0,'outward triangle winding');
      for(const [v,w] of [[a,b],[b,c],[c,a]]){const e=[key(v),key(w)].sort().join('|');edges.set(e,(edges.get(e)||0)+1);}
    }
    assert.ok(p.every(v=>Math.abs(v)<=.50001));assert.ok([...edges.values()].every(count=>count===2),'no holes or internal faces');
  }
});

test('procedural room dressing is stable, themed, wall anchored and clears stairs and doors',()=>{
  const tiles=[];for(let x=0;x<12;x++)for(let y=0;y<12;y++)tiles.push({x,y,type:x===0||y===0||x===11||y===11?'wall':'floor'});
  tiles.find(t=>t.x===1&&t.y===5).type='stairs_down';tiles.find(t=>t.x===10&&t.y===7).type='door';
  const original=structuredClone(tiles),plan=dressingPlan(tiles);
  assert.ok(plan.length>=4&&plan.length<14);assert.deepEqual(plan,dressingPlan([...tiles].reverse()));assert.deepEqual(tiles,original);
  assert.equal(new Set(plan.map(p=>p.theme)).size,1,'one room has one visual identity');
  for(const p of plan){
    if(!p.interior)assert.ok(Math.abs(Math.hypot(p.x-(p.cellX+.5)*3,p.z-(p.cellY+.5)*3)-1.48)<1e-8);
    assert.ok(tiles.filter(t=>/stairs|door/.test(t.type)).every(t=>Math.abs(t.x-p.cellX)+Math.abs(t.y-p.cellY)>1));
  }
});

test('footsteps, pickups and all ambient events avoid high pitched oscillators and noise',()=>{
  const audio=new DungeonAudio(),tones=[],noises=[];
  audio.context={currentTime:10,state:'running'};audio.airGain={gain:{setTargetAtTime(){}}};
  audio._tone=(...args)=>tones.push(args);audio._noise=(...args)=>noises.push(args);
  audio.step(true,'water');audio.pickup('gold sword');audio.ambient(40,{playing:true,water:true,pose:{x:1,y:1},torches:[{point:{x:3,z:3}}]});
  assert.ok(tones.length>=3);assert.ok(noises.length>=10);
  assert.ok(tones.every(t=>Math.max(t[2],t[3])<200));
  assert.ok(noises.every(n=>n[2]<=750&&n[3]!=='highpass'));
});

test('longsword tip travels down and into the scene through its impact',()=>{
  const tip=t=>{const p=swingPose(t);return new Vector3(0,1.72*.7*.92,0).applyEuler(new Euler(...p.slice(3))).add(new Vector3(...p.slice(0,3)));};
  const lifted=tip(.13),impact=tip(.28),follow=tip(.36);
  assert.ok(impact.y<lifted.y-.8);assert.ok(impact.z<lifted.z-1.2);assert.ok(follow.y<impact.y);
});
