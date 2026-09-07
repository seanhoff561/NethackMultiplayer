import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NativeSession} from '../lib/native-session.mjs';
import {SpatialSimulation} from '../lib/spatial-simulation.mjs';
import {stairWorld} from '../src/spatial.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const until=async(fn,label)=>{const end=Date.now()+10000;while(!fn()){if(Date.now()>end)throw Error(label);await new Promise(r=>setTimeout(r,10));}};
test('native spatial anchors spend no movement turns; physical stair endpoint changes the real dungeon floor',{timeout:25000},async()=>{
  await mkdir(path.join(root,'test-results'),{recursive:true});const cwd=await mkdtemp(path.join(root,'test-results/spatial-native-'));await cp(path.join(root,'engine/data'),cwd,{recursive:true});
  const engine=new NativeSession({executable:process.env.NETHACK_ENGINE||path.join(root,'engine/bin/nethack-engine-polished-v05.exe'),cwd,args:['-p','Wizard','-r','human','-g','male','-a','neutral','-u','StairQA']});
  const sim=new SpatialSimulation(),diagnostics=[];engine.on('diagnostic',m=>diagnostics.push(m));engine.on('snapshot',s=>sim.accept(s));engine.start();
  try {
    await until(()=>engine.ready&&engine.snapshot,'native startup');
    assert.equal(engine.snapshot.tiles.length,79*21,'full geometry is available before exploration');
    assert.ok(engine.snapshot.tiles.some(t=>!t.seen),'unexplored geometry keeps its map discovery flag');
    const stair=sim.world.stairs.find(s=>s.sign<0);assert.ok(stair,'generated floor has a descending stairwell');
    // Fixture placement uses the same position protocol as continuous gameplay.
    sim.player=sim.world.spawn(stair.cellX,stair.cellZ);sim.project(engine);
    await until(()=>engine.snapshot.spatialSerial===sim.sequence,'position acknowledgement');
    const originalTurn=engine.snapshot.turn;
    for(const [x,z] of [[-.72,1.45],[-.72,-1.02],[.72,-1.02],[.72,1.3]]) {
      const target=stairWorld(stair,x,z);sim.world.move(sim.player,target.x-sim.player.x,target.z-sim.player.z);
      assert.ok(Math.hypot(target.x-sim.player.x,target.z-sim.player.z)<.1,'walked actual collision geometry');
    }
    assert.ok(sim.player.y<-3.9,'camera footing reached the lower floor');
    sim.project(engine);engine.act({key:'i'});await until(()=>engine.ready&&engine.virtualPrompt,'native inventory');
    assert.equal(engine.snapshot.turn,originalTurn,'walking changes no turn counter');engine.cancel();
    const oldLevel=sim.level,command=sim.update(0);assert.equal(command,'>');
    sim.project(engine);engine.act({key:command});
    // NetHack may require leaving a distant companion behind.
    for(let i=0;i<30&&sim.level===oldLevel;i++) {
      await new Promise(r=>setTimeout(r,30));
      if(engine.virtualPrompt&&engine.ready)engine.answer({kind:'key',value:'y'});
    }
    await until(()=>engine.ready&&sim.level!==oldLevel,'walked stairs load native level 2');
    assert.equal(engine.snapshot.player.depth,2);assert.equal(sim.transition,false);assert.ok(Math.abs(sim.player.y)<.1);
    assert.deepEqual(diagnostics,[]);
  }finally{engine.stop();}
});
