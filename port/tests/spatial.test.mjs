import test from 'node:test';
import assert from 'node:assert/strict';
import {CollisionWorld,integratePlayer,stairWorld,stairFinished,FLOOR_HEIGHT,mergeSurfaces} from '../src/spatial.js';
import {SpatialSimulation} from '../lib/spatial-simulation.mjs';
const room=()=>Array.from({length:49},(_,i)=>({x:i%7,y:Math.floor(i/7),type:i%7===0||i%7===6||i<7||i>=42?'wall':'floor'}));
test('free fractional movement, normalized diagonal speed and walk/run/crouch',()=>{
  const w=new CollisionWorld(room()),p=w.spawn(3,3),q={...p},start={...p};
  integratePlayer(w,p,{forward:1,yaw:.173},.1);assert.ok(p.x!==start.x);assert.ok(p.z!==start.z);assert.ok(Math.abs(Math.hypot(p.x-start.x,p.z-start.z)-.31)<1e-6);
  integratePlayer(w,q,{forward:1,strafe:1},.1);assert.ok(Math.abs(Math.hypot(q.x-start.x,q.z-start.z)-.31)<1e-6);
  const run={...start},crouch={...start};integratePlayer(w,run,{forward:1,run:true},.1);integratePlayer(w,crouch,{forward:1,crouch:true},.1);
  assert.ok(start.z-run.z>start.z-p.z);assert.ok(start.z-crouch.z<start.z-p.z);
});
test('swept collision cannot tunnel through walls, slides and respects actor bodies',()=>{
  const w=new CollisionWorld(room()),p=w.spawn(3,3);w.move(p,100,2);assert.ok(p.x<=17.721);assert.ok(p.z>12);
  const a={id:8,x:10.5,z:9.5,y:0,radius:.3},q=w.spawn(3,3);w.move(q,0,-4,[a]);assert.ok(q.z>=10.08-1e-6);
});
test('doors collide as door slabs with space before them; opening allows passage',()=>{
  const tiles=room();tiles.find(t=>t.x===3&&t.y===3).type='door';const w=new CollisionWorld(tiles),p=w.spawn(2,3);
  w.move(p,4,0);assert.ok(p.x<10.12);assert.ok(p.x>9);
  tiles.find(t=>t.x===3&&t.y===3).type='door_open';w.setTiles(tiles);w.move(p,4,0);assert.ok(p.x>12);
});
for(const sign of [1,-1])test(`${sign>0?'ascending':'descending'} physical stairs traverse a whole floor and are reversible`,()=>{
  const tiles=room();tiles.find(t=>t.x===3&&t.y===3).type=sign>0?'stairs_up':'stairs_down';const w=new CollisionWorld(tiles),s=w.stairs[0];
  const p={id:'player',...stairWorld(s,-.72,1.48),y:sign*.02,radius:.28};
  const go=(x,z)=>{const target=stairWorld(s,x,z);w.move(p,target.x-p.x,target.z-p.z);assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<.09,JSON.stringify({p,target}));};
  go(-.72,-1.02);assert.ok(Math.abs(p.y-sign*FLOOR_HEIGHT/2)<.01);
  go(.72,-1.02);go(.72,1.3);assert.ok(stairFinished(s,p));assert.ok(Math.abs(p.y)>3.9);
  go(.72,-1.02);go(-.72,-1.02);go(-.72,1.48);assert.ok(Math.abs(p.y)<.03);
  // The central wall prevents crossing between flights at incompatible heights.
  go(-.72,.4);const target=stairWorld(s,.72,.4);w.move(p,target.x-p.x,target.z-p.z);assert.ok(Math.hypot(p.x-target.x,p.z-target.z)>.8);
});
test('floor geometry merges rooms into surfaces instead of map-cell meshes',()=>{
  assert.deepEqual(mergeSurfaces(room(),t=>t.type==='floor'),[{x:3,z:3,w:15,h:15}]);
});
test('monster locomotion advances between native pulses and continues with no player input',()=>{
  const sim=new SpatialSimulation();sim.accept({levelId:'0:1',tiles:room(),player:{x:4,y:3,hp:20},actors:[{id:1,x:2,y:3,speed:12,canMove:true,visible:true}]});
  const a=sim.actors.get(1),x=a.x;for(let i=0;i<12;i++)sim.update(1/60);
  assert.ok(a.x>x+.3);assert.ok(a.x<x+1.1);assert.notEqual(a.x%3,1.5);
});
test('stairwell divider blocks visibility and attacks between flights',()=>{
  const tiles=room();tiles.find(t=>t.x===3&&t.y===3).type='stairs_down';const w=new CollisionWorld(tiles),s=w.stairs[0];
  assert.equal(w.lineClear(stairWorld(s,-.72,.7),stairWorld(s,.72,.7),.04),false);
  assert.equal(w.lineClear(stairWorld(s,-.72,-1.03),stairWorld(s,.72,-1.03),.04),true);
});
test('legacy doorway anchors never pull physical bodies to a cell center',()=>{
  const tiles=room();tiles.find(t=>t.x===3&&t.y===3).type='door';const sim=new SpatialSimulation();sim.accept({levelId:'0:1',tiles,player:{x:2,y:3,hp:20},actors:[]});
  sim.world.move(sim.player,2.4,0);const before={...sim.player},writes=[];
  sim.project({ready:true,write:input=>writes.push(input)});
  assert.equal(sim.projected.x,2);assert.ok(sim.player.x>9,'body can enter the doorway approach');
  sim.accept({levelId:'0:1',spatialSerial:sim.sequence,tiles,player:{x:2,y:3,hp:20},actors:[]});
  assert.equal(sim.player.x,before.x);assert.equal(writes.find(w=>w.kind==='position').value[3],before.x);
});


test('altar steps climb and descend from every side, support drops and keep native altar anchors',async()=>{
  const {lootPositions}=await import('../src/loot.js');
  const tiles=room();tiles.find(t=>t.x===3&&t.y===3).type='altar';const w=new CollisionWorld(tiles);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const p={id:'player',x:10.5+dx*1.6,z:10.5+dz*1.6,y:0,radius:.28};
    w.move(p,-dx*1.6,-dz*1.6);assert.ok(Math.abs(p.y-.72)<1e-8);assert.ok(Math.hypot(p.x-10.5,p.z-10.5)<1e-8);
    assert.deepEqual([Math.floor(p.x/3),Math.floor(p.z/3)],[3,3]);
    w.move(p,dx*1.6,dz*1.6);assert.equal(p.y,0);
  }
  assert.equal(w.spawn(3,3).y,.72);
  const objects=lootPositions([{id:1,x:3,y:3,name:'lizard corpse'},{id:2,x:3,y:3,name:'dagger'},{id:3,x:3,y:3,name:'gold'}],w);
  for(const item of objects){assert.equal(item.worldY,.72);assert.equal(Math.floor(item.worldX/3),3);assert.equal(Math.floor(item.worldZ/3),3);}
  assert.ok(Math.hypot(objects[1].worldX-objects[0].worldX,objects[1].worldZ-objects[0].worldZ)>.25);
  const sim=new SpatialSimulation();sim.accept({levelId:'0:1',tiles,player:{x:3,y:3,hp:10},actors:[]});
  assert.ok(sim.restore({levelId:'0:1',player:{x:10.5,z:10.5,y:0}}));assert.equal(sim.player.y,.72);
});
