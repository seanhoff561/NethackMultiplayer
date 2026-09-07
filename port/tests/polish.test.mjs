import test from 'node:test';
import assert from 'node:assert/strict';
import {GameInput,BINDINGS} from '../src/input.js';
import {ActionQueue,resolveInventoryAction} from '../lib/action-queue.mjs';
import {FeedbackTracker} from '../lib/feedback.mjs';
import {lootPositions,targetLoot} from '../src/loot.js';
import {CollisionWorld} from '../src/spatial.js';
import {swingPose} from '../src/presentation.js';

function fixture(){
  let context='game';const actions=[],menus=[],releases=[];
  const target={addEventListener(){},removeEventListener(){}};
  const input=new GameInput({target,context:()=>context,menu:e=>menus.push(e.code),onAction:a=>actions.push(a),onRelease:()=>releases.push(true)});
  const down=(code,extra={})=>{const event={code,key:code.replace('Key','').toLowerCase(),repeat:false,target:{tagName:'CANVAS'},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};input.keyDown(event);return event;};
  return {input,actions,menus,releases,down,up:code=>input.keyUp({code}),context:value=>context=value};
}
test('releasing one movement key preserves every other held direction and modifier',()=>{
  const f=fixture();f.down('KeyW');f.down('KeyD');f.down('ShiftLeft');f.up('KeyD');
  assert.deepEqual(f.input.motion(1),{forward:1,strafe:0,run:true,crouch:false,yaw:1});
  f.down('ShiftRight');f.up('ShiftLeft');assert.equal(f.input.is('run'),true);
  f.input.reset();assert.equal(f.input.motion(0).forward,0);assert.equal(f.input.is('run'),false);
});
test('menu accelerators and key repeat never leak into movement or duplicate commands',()=>{
  const f=fixture();f.down('KeyI');f.context('menu');f.down('KeyW');f.input.clear();
  f.context('game');f.down('KeyW',{repeat:true});assert.equal(f.input.is('forward'),false);
  f.up('KeyW');f.down('KeyW');assert.equal(f.input.is('forward'),true);
  f.down('Space');f.down('Space',{repeat:true});assert.deepEqual(f.actions,['inventory','attack']);
  f.context('menu');f.down('KeyB');f.down('KeyB',{repeat:true});assert.deepEqual(f.menus,['KeyW','KeyB']);
});
test('each physical binding dispatches only one action; Space cannot click a focused UI button',()=>{
  for(const [code,action] of Object.entries(BINDINGS)){
    const f=fixture();const e=f.down(code,{target:{tagName:'BUTTON'}});
    assert.ok(e.prevented&&e.stopped,code);assert.ok(f.actions.length<=1,code);
    if(f.actions.length)assert.equal(f.actions[0],action);
  }
  const f=fixture();f.context('menu');f.down('F10');assert.deepEqual(f.actions,['fullscreen']);assert.deepEqual(f.menus,[]);
});
test('typing, focus loss and menus release movement without swallowing text',()=>{
  const f=fixture();f.down('KeyW');f.context('menu');f.down('KeyQ');assert.equal(f.input.is('forward'),false);
  f.down('KeyQ',{repeat:true,target:{tagName:'INPUT'}});assert.deepEqual(f.menus,['KeyQ','KeyQ']);
  f.input.reset();f.context('game');f.down('KeyW');assert.equal(f.input.is('forward'),true);
});
test('held stance modifiers survive menu transitions, while movement requires a fresh press',()=>{
  const f=fixture();f.down('KeyW');f.down('ControlLeft');f.context('menu');f.input.clear();
  assert.equal(f.input.is('crouch'),true);assert.equal(f.input.is('forward'),false);
  f.context('game');f.up('KeyW');f.down('KeyW');assert.equal(f.input.motion(0).crouch,true);
  f.up('ControlLeft');assert.equal(f.input.is('crouch'),false);f.input.reset();assert.equal(f.input.is('forward'),false);
});
test('busy engine buffers one attack, acknowledges execution, deduplicates and respects cooldown',()=>{
  let ready=false,time=0;const executed=[],statuses=[];
  const q=new ActionQueue({ready:()=>ready,now:()=>time,execute:a=>executed.push(a.id),notify:(a,s)=>statuses.push([a.id,s])});
  assert.equal(q.enqueue({id:'a',spatialMelee:true}),true);assert.equal(q.enqueue({id:'a',spatialMelee:true}),false);
  assert.equal(q.enqueue({id:'b',spatialMelee:true}),false);assert.deepEqual(executed,[]);
  ready=true;q.update();assert.deepEqual(executed,['a']);
  q.enqueue({id:'c',spatialMelee:true});time=539;q.update();assert.deepEqual(executed,['a']);time=540;q.update();assert.deepEqual(executed,['a','c']);
  assert.deepEqual(statuses.filter(s=>s[1]==='started'),[['a','started'],['c','started']]);
});
test('action queue is bounded and cancelled actions cannot execute later',()=>{
  const q=new ActionQueue({ready:()=>false,execute:()=>assert.fail()});
  for(let i=0;i<8;i++)assert.ok(q.enqueue({id:String(i),key:'q'}));assert.equal(q.enqueue({id:'extra',key:'q'}),false);
  q.clear();assert.equal(q.queue.length,0);
});
test('feedback follows real HP changes and door state, with no phantom damage or pickup',()=>{
  const tracker=new FeedbackTracker();const s={levelId:'1',player:{hp:20},actors:[{id:1,hp:12}],inventory:[],tiles:[{x:1,y:1,type:'door-closed'}]};
  assert.deepEqual(tracker.accept(s),[]);
  const next=structuredClone(s);next.player.hp=17;next.actors[0].hp=8;next.tiles[0].type='door-open';next.inventory=[{id:2,name:'wished sword'}];
  assert.deepEqual(tracker.accept(next).map(e=>e.kind),['player-hit','actor-hit','door']);assert.deepEqual(tracker.accept(next),[]);
  assert.deepEqual(tracker.accept({...next,actors:[]}),[],'migration is not a kill');
  assert.deepEqual(tracker.accept({...s,levelId:'2'}),[],'new floor does not flash');
});
test('floor pile objects have distinct positions and interaction cannot reach through stone',()=>{
  const items=[{id:3,x:2,y:2},{id:1,x:2,y:2},{id:2,x:2,y:2}];
  const positions=lootPositions(items);assert.deepEqual(positions,lootPositions([...items].reverse()));
  for(const a of positions)for(const b of positions)if(a.id!==b.id)assert.ok(Math.hypot(a.worldX-b.worldX,a.worldZ-b.worldZ)>.5);
  const tiles=[];for(let x=0;x<5;x++)for(let y=0;y<5;y++)tiles.push({x,y,type:'floor'});
  const world=new CollisionWorld(tiles),body={x:7.5,z:8.7};assert.ok(targetLoot(items,body,0,world));
  assert.equal(targetLoot(items,{x:1,z:1},0,world),null);
  world.setTiles(tiles.map(t=>t.x===2&&t.y===2?{...t,type:'wall'}:t));assert.equal(targetLoot(items,body,0,world),null);
});
test('slash cuts down and forward, thrust extends, both settle without a jump',()=>{
  const rest=swingPose(0);assert.ok(swingPose(.13)[3]>.35);assert.ok(swingPose(.28)[3]<-1.5);assert.ok(swingPose(.36)[1]<rest[1]);assert.ok(swingPose(.28)[2]<rest[2]);assert.ok(swingPose(.25,'spear')[2]<-1.5);
  assert.deepEqual(swingPose(.54),rest);assert.deepEqual(swingPose(100),rest);
  assert.ok(Math.max(...swingPose(.5399).map((v,i)=>Math.abs(v-rest[i])))<.001);
});

test('queued inventory actions follow object identity if letters change and reject stolen items',()=>{
  const inventory=[{id:9,key:'d',name:'potion'}],action={key:'qa',itemId:9};
  assert.equal(resolveInventoryAction(action,{inventory}),null);assert.equal(action.key,'qd');
  assert.match(resolveInventoryAction(action,{inventory:[]}),/no longer/);
  const statuses=[],q=new ActionQueue({ready:()=>true,execute:()=>assert.fail('stale item executed'),validate:a=>resolveInventoryAction(a,{inventory:[]}),notify:(a,s)=>statuses.push(s)});
  q.enqueue(action);assert.deepEqual(statuses,['queued','rejected']);
});
