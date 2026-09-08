import test from 'node:test';
import assert from 'node:assert/strict';
import {SpatialSimulation} from '../lib/spatial-simulation.mjs';
import {RealtimeClock} from '../lib/realtime.mjs';
import {NativeSession} from '../lib/native-session.mjs';
import {cp,mkdir,mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const snapshot=(extra={})=>({levelId:'0:1',tiles:Array.from({length:49},(_,i)=>({x:i%7,y:Math.floor(i/7),type:'floor'})),player:{x:3,y:3,hp:20,immobile:true,conditions:['Trapped'],...extra},actors:[]});
test('trapped movement struggles at the world cadence without translating the body or retaining released input',()=>{
  const sim=new SpatialSimulation();sim.accept(snapshot());const before={...sim.player};
  let now=0;const actions=[],clock=new RealtimeClock({now:()=>now,interval:800,canAct:()=>true,act:()=>actions.push(sim.idleAction())});clock.start();
  for(let i=0;i<120;i++){sim.setInput({forward:1,yaw:0});sim.update(1/60);now=(i+1)*1000/60;clock.update();}
  assert.deepEqual(actions,[{key:'k'},{key:'k'}]);assert.equal(sim.player.x,before.x);assert.equal(sim.player.z,before.z);
  sim.setInput({forward:1,strafe:1,yaw:Math.PI/2});assert.equal(sim.idleAction().key,'y');
  sim.setInput({strafe:1,yaw:0});assert.equal(sim.idleAction().key,'l');
  sim.setInput({forward:-1,yaw:0});assert.equal(sim.idleAction().key,'j');
  sim.release();assert.deepEqual(sim.idleAction(),{key:'.',idle:true});
  sim.setInput({forward:1});sim.update(.31);assert.equal(sim.idleAction().idle,true);
  for(const extra of [{conditions:[],immobile:false},{busy:true},{hp:0},{encumbrance:5},{conditions:['Trapped','Swallowed']}]){sim.accept(snapshot(extra));sim.setInput({forward:1});assert.equal(sim.idleAction().idle,true,JSON.stringify(extra));}
  sim.accept(snapshot({conditions:[],immobile:false}));sim.setInput({forward:1});sim.update(.1);assert.ok(sim.player.z<before.z,'free movement resumes after escape');
});

test('real native pits, webs and bear traps release after held movement; waiting alone cannot escape',{timeout:25000},async()=>{
  const root=fileURLToPath(new URL('..',import.meta.url));await mkdir(path.join(root,'test-results'),{recursive:true});const cwd=await mkdtemp(path.join(root,'test-results/traps-native-'));await cp(path.join(root,'engine/data'),cwd,{recursive:true});
  const e=new NativeSession({executable:process.env.NETHACK_ENGINE||path.join(root,'engine/bin/nethack-engine-polished-v06.exe'),cwd,args:['-D','-p','Valkyrie','-r','human','-g','female','-a','lawful','-u','wizard']});
  const until=async f=>{const end=Date.now()+4000;while(!f()){if(Date.now()>end)throw Error(JSON.stringify({prompt:e.virtualPrompt?.request,messages:e.snapshot?.messages.slice(-8)}));await new Promise(r=>setTimeout(r,5));}};
  let wish=null;const present=e.present.bind(e);e.present=p=>{if(wish&&p.kind==='text'){e.write({kind:'text',value:wish});wish=null;}else present(p);};
  const sim=new SpatialSimulation();e.on('snapshot',s=>sim.accept(s));e.start();
  const act=async a=>{e.act(a);await until(()=>e.ready&&!e.replay);assert.ok(e.snapshot.player.hp>0);};
  const place=async tile=>{sim.player=sim.world.spawn(tile.x,tile.y);sim.project(e);await act({key:'.',idle:true});};
  try{
    await until(()=>e.ready&&e.snapshot);
    // Isolated wizard fixture: put native creatures away from the test room.
    for(const a of sim.actors.values()){a.x=225;a.z=60;}
    const cells=[...sim.world.tiles.values()].filter(t=>t.type==='floor'&&[[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dz])=>sim.world.walkable(t.x+dx,t.y+dz)));
    assert.ok(cells.length>=7);
    for(const [i,trap] of ['pit','web','bear trap'].entries()){
      const cell=cells[i*3];await place(cell);wish=trap==='bear trap'?'trapped bear trap':trap;await act({key:'#wizwish'});assert.equal(wish,null);
      assert.ok(!e.snapshot.messages.at(-1).text.includes('failed'),e.snapshot.messages.at(-1).text);
      for(let attempt=0;attempt<12&&!e.snapshot.player.conditions.includes('Trapped');attempt++){
        await place({x:cell.x+1,y:cell.y});await place(cell);
      }
      assert.ok(e.snapshot.player.conditions.includes('Trapped'),JSON.stringify({trap,p:e.snapshot.player,m:e.snapshot.messages.slice(-15)}));assert.equal(sim.blocked,true);
      const stuck={...sim.player},turn=e.snapshot.turn;
      sim.release();for(let j=0;j<3;j++)await act(sim.idleAction());
      assert.ok(e.snapshot.player.conditions.includes('Trapped'),'waiting stays trapped: '+trap);
      let attempts=0;
      while(e.snapshot.player.conditions.includes('Trapped')&&attempts++<80){sim.setInput({forward:1,strafe:1,yaw:0});sim.project(e);await act(sim.idleAction());}
      assert.ok(attempts<=80,'held input escapes '+trap);assert.equal(sim.blocked,false,trap);assert.ok(e.snapshot.turn>turn);
      assert.equal(sim.idleAction().idle,true,'no native walking after escape');
      assert.deepEqual({x:sim.player.x,z:sim.player.z},{x:stuck.x,z:stuck.z},'struggling does not teleport the body');
    }
  }finally{e.stop();}
});
