import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NativeSession} from '../lib/native-session.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const until=async(fn,label)=>{const end=Date.now()+7000;while(!fn()){if(Date.now()>end)throw Error(label);await new Promise(r=>setTimeout(r,10));}};

test('native floor piles are nonmodal, individually retrievable, and emit actual pickup events',{timeout:20000},async()=>{
  await mkdir(path.join(root,'test-results'),{recursive:true});const cwd=await mkdtemp(path.join(root,'test-results/loot-native-'));await cp(path.join(root,'engine/data'),cwd,{recursive:true});
  const engine=new NativeSession({executable:process.env.NETHACK_ENGINE||path.join(root,'engine/bin/nethack-engine-polished-v05.exe'),cwd,args:['-p','Wizard','-r','human','-g','male','-a','neutral','-u','LootQA']});
  const events=[],prompts=[],diagnostics=[];engine.on('event',e=>events.push(e));engine.on('prompt',p=>prompts.push(p));engine.on('diagnostic',m=>diagnostics.push(m));engine.start();
  try{
    await until(()=>engine.ready&&engine.snapshot,'startup');
    const items=engine.snapshot.inventory.filter(i=>!i.equipped&&/scroll|spellbook/.test(i.name)).slice(0,2);assert.equal(items.length,2);
    for(const item of items){engine.act({key:`d${item.key}`});await until(()=>engine.ready&&!engine.replay,`drop ${item.name}`);assert.ok(engine.snapshot.floorObjects.some(o=>o.id===item.id));}
    assert.equal(events.filter(e=>e.type==='item-picked-up').length,0,'dropping never sounds like pickup');
    engine.act({key:':'});await until(()=>engine.ready,'inspect pile');
    assert.equal(engine.virtualPrompt,null,'looking at a pile does not create a modal document');
    assert.ok(!prompts.some(p=>p.kind==='display'&&/that are here/.test(p.prompt)));
    engine.act({key:'.',pickup:items[1].id});await until(()=>engine.ready,'targeted pickup');
    assert.ok(engine.snapshot.inventory.some(i=>i.id===items[1].id));assert.ok(engine.snapshot.floorObjects.some(i=>i.id===items[0].id));
    assert.equal(events.filter(e=>e.type==='item-picked-up').length,1);
    engine.act({key:'.',pickup:items[1].id});await until(()=>engine.ready,'duplicate pickup');
    assert.equal(events.filter(e=>e.type==='item-picked-up').length,1,'missing item does not produce another sound');
    assert.ok(engine.snapshot.actors.every(a=>Number.isFinite(a.hp)&&a.maxHp>=a.hp));
    const throwable=engine.snapshot.inventory.find(i=>i.id===items[1].id);
    engine.act({key:`t${throwable.key}`,aim:'k'});await until(()=>engine.ready&&!engine.replay,'actual throw');
    assert.ok(events.some(e=>e.type==='player-effect'&&e.kind==='ranged'),'projectile feedback comes from native throw, not selection');
    assert.deepEqual(diagnostics,[]);
  }finally{engine.stop();}
});
