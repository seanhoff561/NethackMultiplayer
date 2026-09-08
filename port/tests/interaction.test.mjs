import test from 'node:test';
import assert from 'node:assert/strict';
import {meleeTarget} from '../src/melee.js';
import {GameInput} from '../src/input.js';
import {NativeSession} from '../lib/native-session.mjs';
import {cp,mkdir,mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

test('Alt opens inventory once and L closes doors without hijacking Alt combinations',()=>{
  const actions=[],target={addEventListener(){},removeEventListener(){}};
  const input=new GameInput({target,context:()=> 'game',onAction:a=>actions.push(a)});
  const event=(code,altKey=false)=>({code,altKey,target:{},preventDefault(){},stopImmediatePropagation(){}});
  input.keyDown(event('AltLeft',true));input.keyDown(event('AltLeft',true));input.keyUp(event('AltLeft',true));
  input.keyDown(event('KeyL'));input.keyDown(event('KeyF',true));
  assert.deepEqual(actions,['inventory','closeDoor']);
});
test('generous melee aim accepts small and large bodies, picks one target and respects walls',()=>{
  const p={x:0,z:0,y:0},world={lineClear:()=>true};
  const rat={id:1,x:1.35,z:-1.55,y:0,radius:.2},giant={id:2,x:0,z:-3.1,y:0,radius:1.08};
  assert.equal(meleeTarget(p,[rat],0,world),1);assert.equal(meleeTarget(p,[giant],0,world),2);
  const center={id:3,x:0,z:-1.5,y:0,radius:.42};assert.equal(meleeTarget(p,[rat,giant,center],0,world),3);
  assert.equal(meleeTarget(p,[center],Math.PI,world),null);
  assert.equal(meleeTarget(p,[center],0,{lineClear:()=>false}),null);
  assert.equal(meleeTarget(p,[{...center,y:3}],0,world),null);
});
test('targeting a native chest loots it, preserves its floor identity and respects locks',{timeout:25000},async()=>{
  const root=fileURLToPath(new URL('..',import.meta.url));await mkdir(path.join(root,'test-results'),{recursive:true});const cwd=await mkdtemp(path.join(root,'test-results/container-native-'));await cp(path.join(root,'engine/data'),cwd,{recursive:true});
  const e=new NativeSession({executable:process.env.NETHACK_ENGINE||path.join(root,'engine/bin/nethack-engine-polished-v06.exe'),cwd,args:['-D','-p','Wizard','-r','human','-g','male','-a','neutral','-u','ContainerQA']});
  const until=async fn=>{const end=Date.now()+6000;while(!fn()){if(Date.now()>end)throw Error(JSON.stringify({prompt:e.virtualPrompt?.request,messages:e.snapshot?.messages}));await new Promise(r=>setTimeout(r,10));}};
  e.on('prompt',p=>{if(!e.snapshot)queueMicrotask(()=>e.answer({kind:'key',value:'y'}));});e.start();
  let wishing=null;const present=e.present.bind(e);e.present=r=>{if(wishing&&r.kind==='text'){e.write({kind:'text',value:wishing});wishing=null;}else present(r);};
  try{
    await until(()=>e.ready&&e.snapshot);const hero=e.snapshot.player;e.write({kind:'position',value:[1,...e.snapshot.levelId.split(':').map(Number),(hero.x+.5)*3,(hero.y+.5)*3,0,hero.x,hero.y]});for(const actor of e.snapshot.actors)e.write({kind:'actor',value:[actor.id,300,300,0,0]});const wand=e.snapshot.inventory.find(i=>/wand of wishing/.test(i.name));
    for(const locked of [false,true]){
      const ids=new Set(e.snapshot.inventory.map(i=>i.id));wishing=`uncursed ${locked?'empty locked untrapped large box':'empty unlocked untrapped chest'}`;e.act({key:'z'+wand.key});await until(()=>e.ready&&!e.replay&&!wishing);
      const box=e.snapshot.inventory.find(i=>!ids.has(i.id));assert.ok(box);
      e.act({key:'d'+box.key});await until(()=>e.ready&&!e.replay);assert.ok(e.snapshot.floorObjects.some(i=>i.id===box.id));
      e.act({pickup:box.id});await until(()=>e.ready&&!e.replay);
      assert.ok(!e.snapshot.inventory.some(i=>i.id===box.id),'container is not carried');assert.ok(e.snapshot.floorObjects.some(i=>i.id===box.id));
      if(!locked){
        assert.ok(e.virtualPrompt,'unlocked container opens the native loot choices');
        const choose=async key=>{const prompt=e.virtualPrompt.request,item=prompt.items?.find(i=>i.key===key);e.answer(item?{kind:'menu',value:[item.id]}:{kind:'key',value:key});await until(()=>e.ready&&!e.replay);};
        const scroll=e.snapshot.inventory.find(i=>/scroll/.test(i.name)&&i.quantity===1);assert.ok(scroll);
        await choose('i');if(/type of objects/.test(e.virtualPrompt?.request.prompt))await choose('a');await choose(scroll.key);assert.ok(!e.snapshot.inventory.some(i=>i.id===scroll.id),JSON.stringify({prompt:e.virtualPrompt?.request,scroll,messages:e.snapshot.messages.slice(-6)}));
        if(e.virtualPrompt)e.cancel();
        e.act({pickup:box.id});await until(()=>e.ready&&!e.replay);await choose('o');if(/type of objects/.test(e.virtualPrompt?.request.prompt))await choose('a');
        const choice=e.virtualPrompt.request.items.find(i=>i.selectable!==false&&i.text.includes('scroll'));assert.ok(choice);e.answer({kind:'menu',value:[choice.id]});await until(()=>e.ready&&!e.replay);
        assert.ok(e.snapshot.inventory.some(i=>i.id===scroll.id),JSON.stringify({prompt:e.virtualPrompt?.request,scroll,inventory:e.snapshot.inventory,messages:e.snapshot.messages.slice(-5)}));
        assert.ok(e.snapshot.floorObjects.some(i=>i.id===box.id));
        if(e.virtualPrompt)e.cancel();await until(()=>e.ready);
      }
      else assert.ok(e.snapshot.messages.some(m=>/is locked|turns out to be locked/i.test(m.text)),'native lock remains in force');
      if(e.virtualPrompt)e.cancel();
    }
  }finally{e.stop();}
});
