import test from 'node:test';
import assert from 'node:assert/strict';
import {mapRecord} from '../src/parchment.js';
import {startJump,advanceJump,CollisionWorld,integratePlayer} from '../src/spatial.js';
import {NativeSession} from '../lib/native-session.mjs';
import {cp,mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
test('a parchment records only discovered native glyphs and freezes its timestamp',()=>{
  const s={turn:77,player:{x:4,y:5,depth:3,dungeon:'Gnomish Mines'},tiles:[{x:1,y:2,seen:true,char:'>'},{x:8,y:9,seen:false,char:'$'}]};
  const record=mapRecord(s,3661);s.tiles[0].char='X';s.player.x=8;
  assert.equal(record.time,'1:01:01');assert.deepEqual(record.tiles,[{x:1,y:2,char:'>'}]);assert.equal(record.player.x,4);
});
test('jump has a single ballistic arc, lands on floor support, and does not bypass walls',()=>{
  const tiles=[];for(let y=0;y<5;y++)for(let x=1;x<6;x++)tiles.push({x,y,type:x===3?'wall':'floor'});
  const world=new CollisionWorld(tiles),body={x:8.6,z:7.5,y:0,radius:.28,speedScale:1};
  assert.ok(startJump(body));let peak=0;
  for(let i=0;i<90;i++){advanceJump(body,1/120);peak=Math.max(peak,body.jumpOffset);integratePlayer(world,body,{strafe:1,yaw:0},1/120);if(i===20)assert.equal(startJump(body),false);}
  assert.ok(peak>.5&&peak<.7);assert.equal(body.jumpOffset,0);assert.ok(body.x<9);
});
test('aim is updated when selecting a live spell or throw choice',()=>{
  const s=new NativeSession({executable:'unused',cwd:'.'});s.inputs=[];s.write=i=>s.inputs.push(i);
  s.accept({type:'request',kind:'command'});s.act({key:'t',aim:'k'});
  const menu={type:'request',kind:'menu',prompt:'Throw what?',items:[{id:1,key:'a',text:'dagger'}]};
  s.accept(menu);s.accept({type:'request',kind:'command'});s.answer({kind:'menu',value:[1]},'h');s.accept(menu);
  s.accept({type:'request',kind:'yn',prompt:'In what direction?',choices:'hjklyubn'});
  assert.equal(s.inputs.at(-1).value,'h');
});
test('native armor removal opens valid choices and passes every busy turn at accelerated pace',{timeout:15000},async()=>{
  const root=fileURLToPath(new URL('..',import.meta.url));await mkdir(path.join(root,'test-results'),{recursive:true});
  const cwd=await mkdtemp(path.join(root,'test-results/immersion-native-'));await cp(path.join(root,'engine/data'),cwd,{recursive:true});
  const e=new NativeSession({executable:process.env.NETHACK_ENGINE||path.join(root,'engine/bin/nethack-engine-polished-v06.exe'),cwd,args:['-p','Knight','-r','human','-g','male','-a','lawful','-u','BusyQA']});
  const until=async(f)=>{const end=Date.now()+7000;while(!f()){if(Date.now()>end)throw Error('Native wait timed out');await new Promise(r=>setTimeout(r,10));}};
  const busy=[];e.on('snapshot',s=>{if(s.player.busy)busy.push(s.turn);});e.start();
  try{await until(()=>e.ready&&e.snapshot);const armor=e.snapshot.inventory.find(i=>i.armorSlot===0&&i.equipped);assert.ok(armor);
    e.act({key:'T'});await until(()=>e.ready&&e.virtualPrompt);assert.equal(e.virtualPrompt.request.kind,'menu');
    const choice=e.virtualPrompt.request.items.find(i=>i.key===armor.key);assert.ok(choice);
    const turn=e.snapshot.turn,start=Date.now();e.answer({kind:'menu',value:[choice.id]});await until(()=>e.ready&&!e.replay);
    assert.ok(busy.length>=2);assert.ok(e.snapshot.turn>turn);assert.equal(e.snapshot.player.busy,false);assert.ok(Date.now()-start<2000);assert.ok(!e.snapshot.inventory.find(i=>i.id===armor.id).equipped);
  }finally{e.stop();}
});

test('native eating and paralysis both publish busy intervals and complete their real turns',{timeout:20000},async()=>{
  const root=fileURLToPath(new URL('..',import.meta.url)),cwd=await mkdtemp(path.join(root,'test-results/busy-states-'));await cp(path.join(root,'engine/data'),cwd,{recursive:true});
  const e=new NativeSession({executable:process.env.NETHACK_ENGINE||path.join(root,'engine/bin/nethack-engine-polished-v06.exe'),cwd,args:['-D','-p','Wizard','-r','human','-g','male','-a','neutral','-u','StatesQA']});
  const until=async(f)=>{const end=Date.now()+7000;while(!f()){if(Date.now()>end)throw Error('Busy state wait timed out');await new Promise(r=>setTimeout(r,10));}};
  let wishing=null;const present=e.present.bind(e);e.present=request=>{if(wishing&&request.kind==='text'){e.write({kind:'text',value:wishing});wishing=null;}else present(request);};
  let busy=0,advance=0;e.on('snapshot',s=>{if(s.player.busy)busy++;});e.on('advance',()=>advance++);
  e.on('prompt',p=>{if(!e.snapshot)queueMicrotask(()=>e.answer({kind:'key',value:'y'}));});e.start();
  try{await until(()=>e.ready&&e.snapshot);const wand=e.snapshot.inventory.find(i=>/wand of wishing/.test(i.name));assert.ok(wand);
    for(const [name,command] of [['uncursed potion of paralysis','q'],['uncursed food ration','e']]){
      const ids=new Set(e.snapshot.inventory.map(i=>i.id));wishing=name;e.act({key:'z'+wand.key});await until(()=>e.ready&&!e.replay&&!wishing);
      const obj=e.snapshot.inventory.find(i=>!ids.has(i.id));assert.ok(obj);busy=0;advance=0;const turn=e.snapshot.turn;
      e.act({key:command+obj.key});await until(()=>e.ready&&!e.replay);assert.ok(busy>0,JSON.stringify({name,obj,p:e.snapshot.player,prompt:e.virtualPrompt?.request,messages:e.snapshot.messages}));assert.ok(advance>0,name);assert.ok(e.snapshot.turn>turn);assert.equal(e.snapshot.player.busy,false);
    }
  }finally{e.stop();}
});
