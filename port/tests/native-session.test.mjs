import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeSession,encodeInput} from '../lib/native-session.mjs';
function harness(){const s=new NativeSession({executable:'unused',cwd:'.'});s.inputs=[];s.write=i=>s.inputs.push(i);s.accept({type:'request',kind:'command'});return s;}
const menu={type:'request',kind:'menu',prompt:'What do you want to wield?',items:[{id:1,key:'a',text:'a dagger',selectable:true}],how:1};
test('live inventory choice detaches and permits idle simulation before replay',()=>{
  const s=harness();s.act({key:'w'});s.accept(menu);
  assert.deepEqual(s.inputs.at(-1),{kind:'menu',value:[]});
  s.accept({type:'request',kind:'command'});assert.equal(s.ready,true);assert.ok(s.virtualPrompt);
  s.act({key:'.',idle:true});s.accept({type:'request',kind:'command'});assert.ok(s.virtualPrompt);
  s.answer({kind:'menu',value:[1]});assert.equal(s.inputs.at(-1).value,'w');
  s.accept(menu);assert.deepEqual(s.inputs.at(-1),{kind:'menu',value:[1]});
  s.accept({type:'request',kind:'command'});assert.equal(s.ready,true);assert.equal(s.virtualPrompt,null);
});
test('stale menu cannot apply an old selection after world state changes',()=>{
  const s=harness();const notices=[];s.on('notice',x=>notices.push(x));
  s.act({key:'w'});s.accept(menu);s.accept({type:'request',kind:'command'});s.answer({kind:'menu',value:[1]});
  s.accept({...menu,items:[{id:1,key:'a',text:'a cursed dagger',selectable:true}]});
  assert.equal(notices.length,1);assert.equal(s.inputs.at(-1).value.length,0);
  assert.equal(s.virtualPrompt.transaction.steps.length,1);
});
test('answers during cancellation are deferred until engine is ready',()=>{
  const s=harness();s.act({key:'w'});s.accept(menu);s.answer({kind:'menu',value:[1]});
  assert.ok(s.pendingAnswer);s.accept({type:'request',kind:'command'});assert.equal(s.pendingAnswer,null);assert.equal(s.inputs.at(-1).value,'w');
});
test('wire encoding preserves control keys but forbids injected input lines',()=>{
  assert.equal(encodeInput({kind:'key',value:'\x04'}),'k 4\n');
  assert.equal(encodeInput({kind:'text',value:'hello\nk 121'}),'t hello k 121\n');
  assert.equal(encodeInput({kind:'menu',value:[1,4]}),'m 1,4\n');
});

test('cancelling or answering a busy command never queues input for its future prompt',()=>{
  const s=harness();s.act({key:'.',idle:true});const count=s.inputs.length;
  s.cancel();assert.equal(s.inputs.length,count);assert.equal(s.answer({kind:'key',value:'y'}),false);
  assert.equal(s.inputs.length,count);s.accept({type:'request',kind:'command'});
  s.act({key:'Sy'});s.accept({type:'request',kind:'yn',prompt:'Really save?',choices:'yn',default:110});
  assert.deepEqual(s.inputs.at(-1),{kind:'key',value:'y'});assert.equal(s.detaching,false);
});
