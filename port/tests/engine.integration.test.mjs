import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NativeSession} from '../lib/native-session.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const exe=path.join(root,'engine/bin/nethack-engine-polished.exe');
const until=async(predicate,label,timeout=10000)=>{const end=Date.now()+timeout;while(!predicate()){if(Date.now()>end)throw new Error(`Timed out: ${label}`);await new Promise(r=>setTimeout(r,10));}};

test('actual NetHack character, live menu turns, equipment, and save/restore',{skip:!existsSync(exe),timeout:30000},async()=>{
  await mkdir(path.join(root,'test-results'),{recursive:true});
  const cwd=await mkdtemp(path.join(root,'test-results/native-'));
  await cp(path.join(root,'engine/data'),cwd,{recursive:true});
  const args=['-p','Wizard','-r','human','-g','male','-a','neutral','-u','EngineQA'];
  let engine=new NativeSession({executable:exe,cwd,args,env:{NH_TURN_MS:'250'}});
  const diagnostics=[];
  const setup=s=>{s.on('diagnostic',d=>diagnostics.push(d));s.on('failure',e=>diagnostics.push(e));s.on('prompt',p=>{if(!s.snapshot&&p.kind==='display')s.answer({kind:'key',value:32});});s.start();};
  setup(engine);
  try {
    await until(()=>engine.ready&&engine.snapshot,'startup');
    assert.equal(engine.snapshot.player.name,'EngineQA');assert.equal(engine.snapshot.player.role,'Wizard');assert.equal(engine.snapshot.player.race,'human');
    assert.ok(engine.snapshot.tiles.length>20);assert.ok(engine.snapshot.inventory.length>5);
    engine.act({key:'i'});await until(()=>engine.virtualPrompt&&engine.ready,'inventory detachment');
    const before=engine.snapshot.actionSerial;
    for(let i=0;i<3;i++){engine.act({key:'.',idle:true});await until(()=>engine.ready,'idle pulse');}
    assert.ok(engine.snapshot.actionSerial>=before+3,`actions ${before} -> ${engine.snapshot.actionSerial}: ${JSON.stringify({request:engine.request,messages:engine.snapshot.messages})}`);assert.ok(engine.virtualPrompt,'inventory remains visible while turns advance');engine.cancel();
    engine.act({key:'Z',aim:'k'});await until(()=>engine.virtualPrompt&&engine.ready,'spell selection');
    assert.equal(engine.virtualPrompt.request.kind,'menu');
    const spellMenu=engine.virtualPrompt.request;
    assert.ok(spellMenu.items.some(i=>/force bolt/.test(i.text)),'native spell repertoire available');
    const spellTurn=engine.snapshot.turn;
    engine.act({key:'.',idle:true});await until(()=>engine.ready,'spell menu idle');assert.ok(engine.snapshot.turn>spellTurn);
    const bolt=spellMenu.items.find(i=>/force bolt/.test(i.text));
    engine.answer({kind:'menu',value:[bolt.id]});await until(()=>engine.ready&&!engine.replay,'cast spell');
    // Failure chance and effects are resolved by NetHack; the action still spends time.
    if(engine.virtualPrompt)engine.cancel();
    assert.ok(engine.snapshot.turn>=spellTurn+1);
    engine.act({key:'w-'});await until(()=>engine.ready&&!engine.replay,'unwield');
    assert.equal(engine.snapshot.player.weapon,'bare hands');
    engine.act({key:'S'});await until(()=>engine.virtualPrompt&&engine.ready,'save confirmation');
    engine.answer({kind:'key',value:'y'});await until(()=>engine.closed,'save exit');
    assert.ok((await readdir(cwd)).some(f=>f.includes('saved-game')));
    const savedTurn=engine.snapshot.turn;
    engine=new NativeSession({executable:exe,cwd,args});setup(engine);
    await until(()=>engine.ready&&engine.snapshot,'restore');
    assert.equal(engine.snapshot.player.name,'EngineQA');assert.equal(engine.snapshot.player.weapon,'bare hands');
    assert.ok(engine.snapshot.turn>=savedTurn);
    assert.deepEqual(diagnostics,[]);
  }finally{engine.stop();}
});
