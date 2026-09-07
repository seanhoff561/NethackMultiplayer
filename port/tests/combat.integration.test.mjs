import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NativeSession} from '../lib/native-session.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const until=async(fn,label)=>{const end=Date.now()+7000;while(!fn()){if(Date.now()>end)throw Error(label);await new Promise(r=>setTimeout(r,10));}};
test('native defend changes real AC, follows equipment and clears without stacking',{timeout:25000},async()=>{
  await mkdir(path.join(root,'test-results'),{recursive:true});const cwd=await mkdtemp(path.join(root,'test-results/guard-native-'));await cp(path.join(root,'engine/data'),cwd,{recursive:true});
  const engine=new NativeSession({executable:process.env.NETHACK_ENGINE||path.join(root,'engine/bin/nethack-engine-polished-v06.exe'),cwd,args:['-p','Valkyrie','-r','human','-g','female','-a','lawful','-u','GuardQA']});engine.start();
  const act=async key=>{engine.act({key});await until(()=>engine.ready&&!engine.replay,'action '+key);};
  try{
    await until(()=>engine.ready&&engine.snapshot,'startup');const base=engine.snapshot.player.ac;
    for(let i=0;i<3;i++){engine.write({kind:'defend',value:true});await act('.');assert.equal(engine.snapshot.player.ac,base-4);assert.equal(engine.snapshot.player.guardBonus,4);}
    engine.write({kind:'defend',value:false});await act('.');assert.equal(engine.snapshot.player.ac,base);
    const shield=engine.snapshot.inventory.find(i=>i.armorSlot===1&&i.equipped);assert.ok(shield);
    await act('T'+shield.key);const noShield=engine.snapshot.player.ac;
    engine.write({kind:'defend',value:true});await act('.');assert.equal(engine.snapshot.player.ac,noShield-1);
    await act('w-');assert.equal(engine.snapshot.player.guardBonus,0);assert.equal(engine.snapshot.player.ac,noShield);
    assert.ok(engine.snapshot.inventory.every(i=>i.appearance&&Number.isInteger(i.modelId)));
  }finally{engine.stop();}
});

test('wished weight in discovery mode affects native encumbrance and spatial speed',{timeout:25000},async()=>{
  const cwd=await mkdtemp(path.join(root,'test-results/burden-native-'));await cp(path.join(root,'engine/data'),cwd,{recursive:true});
  const engine=new NativeSession({executable:process.env.NETHACK_ENGINE||path.join(root,'engine/bin/nethack-engine-polished-v06.exe'),cwd,args:['-D','-p','Wizard','-r','human','-g','male','-a','neutral','-u','BurdenQA']});
  engine.on('prompt',p=>{if(!engine.snapshot)queueMicrotask(()=>engine.answer({kind:'key',value:'y'}));});engine.start();
  try{
    await until(()=>engine.ready&&engine.snapshot,'startup');
    const wand=engine.snapshot.inventory.find(i=>/wand of wishing/.test(i.name));assert.ok(wand);
    engine.act({key:'z'+wand.key});await until(()=>engine.virtualPrompt&&engine.ready,'wish prompt');
    engine.answer({kind:'text',value:'50 cursed loadstones'});await until(()=>engine.ready&&!engine.replay,'wish');
    const p=engine.snapshot.player;assert.ok(p.encumbrance>=1,JSON.stringify({p,items:engine.snapshot.inventory}));
    assert.ok(p.speedScale<1);assert.ok(p.conditions.some(c=>/Burdened|Stressed|Strained|Overtaxed|Overloaded/.test(c)));
  }finally{engine.stop();}
});
