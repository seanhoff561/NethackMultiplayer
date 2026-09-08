import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {experienceLabel,readSight} from '../src/awareness.js';

test('XP shows cumulative native thresholds, including both formula changes and the cap',()=>{
  assert.equal(experienceLabel(1,19),'19 / 20 XP');
  assert.equal(experienceLabel(2,20),'20 / 40 XP');
  assert.equal(experienceLabel(9,2560),'2,560 / 5,120 XP');
  assert.equal(experienceLabel(10,5120),'5,120 / 10,000 XP');
  assert.equal(experienceLabel(19,2560000),'2,560,000 / 5,120,000 XP');
  assert.equal(experienceLabel(20,5120000),'5,120,000 / 10,000,000 XP');
  assert.equal(experienceLabel(29,90000000),'90,000,000 / 100,000,000 XP');
  assert.equal(experienceLabel(30,100000000),'100,000,000 XP · MAX');
});

function fixture(){
  const camera=new THREE.PerspectiveCamera(70,1.6,.05,100);camera.position.set(0,1.6,0);
  const r={camera,world:new THREE.Group(),items:new THREE.Group(),creatures:new THREE.Group(),monsters:new Map(),snapshot:{player:{}},scene:{fog:{density:.043}}};
  r.actor=(key,x,z,data={})=>{
    const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial());mesh.position.y=1;group.add(mesh);group.position.set(x,0,z);r.creatures.add(group);
    r.monsters.set(key,{group,name:key,data});return group;
  };
  r.wall=()=>{const wall=new THREE.Mesh(new THREE.BoxGeometry(6,4,.5),new THREE.MeshStandardMaterial());wall.position.set(0,2,-3);r.world.add(wall);return wall;};
  return r;
}

test('sight uses camera direction, native concealment and fog; peaceful targets remain identifiable',()=>{
  const r=fixture();r.actor('orc',0,-6);r.actor('behind',0,6);r.actor('offscreen',15,-6);r.actor('fog',0,-40);
  r.actor('invisible',-2,-6,{visible:false}).visible=false;r.actor('dead',2,-6,{hp:0});r.actor('dog',-3,-6,{tame:true});r.actor('shopkeeper',3,-6,{peaceful:true});
  assert.deepEqual(readSight(r).enemies.map(e=>e.name),['orc']);assert.equal(readSight(r).target.name,'orc');
  r.camera.lookAt(-3,1.6,-6);assert.equal(readSight(r).target.kind,'Companion');
  r.camera.lookAt(3,1.6,-6);assert.equal(readSight(r).target.kind,'Peaceful');
  r.snapshot.player.blind=true;assert.deepEqual(readSight(r),{target:null,enemies:[]});
});

test('walls, doors, scenery and nearer actors occlude sight; partial cover still permits recognition',()=>{
  const r=fixture();r.actor('orc',0,-6);const wall=r.wall();
  assert.deepEqual(readSight(r),{target:null,enemies:[]});
  wall.visible=false;assert.equal(readSight(r).target.name,'orc');
  wall.visible=true;wall.scale.y=.2;wall.position.y=.4;assert.equal(readSight(r).enemies.length,1);
  wall.scale.y=1;wall.position.y=2;r.items.add(wall);assert.equal(readSight(r).enemies.length,0);
  wall.visible=false;r.actor('troll',0,-3);assert.deepEqual(readSight(r).enemies.map(e=>e.name),['troll']);
  r.monsters.get('troll').deathAt=1;r.monsters.get('troll').group.visible=false;assert.equal(readSight(r).target.name,'orc');
});

test('turning and moving an enemy clears focus and the sight list without a native tile update',()=>{
  const r=fixture(),orc=r.actor('orc',0,-6);assert.equal(readSight(r).target.name,'orc');
  r.camera.rotation.y=Math.PI;assert.deepEqual(readSight(r),{target:null,enemies:[]});
  orc.position.z=6;assert.equal(readSight(r).target.name,'orc');
});

test('torch glow sprites do not hide creatures or break camera ray tests',()=>{
  const r=fixture();r.actor('orc',0,-6);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,opacity:.75}));glow.position.set(0,1.6,-3);glow.scale.setScalar(3);r.world.add(glow);
  assert.equal(readSight(r).target.name,'orc');assert.equal(readSight(r).enemies.length,1);
});
