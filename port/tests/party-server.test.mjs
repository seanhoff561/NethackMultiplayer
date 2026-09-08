import test from 'node:test';
import assert from 'node:assert/strict';
import {PartyServer} from '../lib/party-server.mjs';
import {PartySimulation} from '../lib/party-simulation.mjs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const socket=()=>({readyState:1,bufferedAmount:0,messages:[],send(data){this.messages.push(JSON.parse(data));},close(code){this.readyState=3;this.closeCode=code;}});
const fixture=()=>({width:10,height:10,player:{x:3,y:3,depth:1,hp:20},levelId:'0:1',tiles:Array.from({length:100},(_,i)=>({x:i%10,y:Math.floor(i/10),type:'floor'})),actors:[],floorObjects:[]});
function setup(){const server=new PartyServer({});server.save=()=>true;const r=new PartySimulation({code:'ABCDEF12',generator:{floor:async()=>fixture()},send:(id,event)=>server.send(server.connections.get(id),event)});server.rooms.set(r.code,r);return {server,r};}
test('transport enforces four seats and isolates inventory and voice routing',async()=>{
  const {server:s,r}=setup(),sockets=Array.from({length:5},socket);
  await Promise.all(sockets.map((ws,i)=>s.handle(ws,{type:'party-join',code:r.code,character:{name:'Player'+i}})));
  assert.equal(sockets.filter(ws=>ws.party).length,4);assert.ok(sockets[4].messages.some(m=>m.type==='party-error'&&/full/.test(m.text)));
  const [a,b]=sockets,joined=a.messages.find(m=>m.type==='party-joined');
  assert.ok(!b.messages.some(m=>JSON.stringify(m).includes(joined.token)),'secret credential is never broadcast');
  assert.ok(b.messages.filter(m=>m.type==='snapshot').every(m=>m.player.name==='Player1'));
  await s.handle(a,{type:'voice-state',enabled:true});await s.handle(b,{type:'voice-state',enabled:true});
  await s.handle(a,{type:'voice-signal',to:b.party.id,from:'forged',signal:{candidate:{candidate:'test'}}});
  assert.equal(b.messages.at(-1).from,a.party.id,'signaling sender is server-owned');
  const count=b.messages.length;await s.handle(a,{type:'voice-signal',to:'other-room',signal:{}});assert.equal(b.messages.length,count);
  s.disconnect(a);assert.equal(r.hostId,b.party.id);assert.equal(r.players.get(joined.id).connected,false);
});
test('reconnect credential takes over a stale socket without duplicate heroes or a late-close race',async()=>{
  const {server:s,r}=setup(),old=socket(),next=socket();await s.handle(old,{type:'party-join',code:r.code,character:{name:'Owner'}});const joined=old.messages.find(m=>m.type==='party-joined');
  await s.handle(next,{type:'party-join',code:r.code,token:joined.token});assert.equal(old.closeCode,4001);assert.equal(old.party,null);assert.equal(next.party.id,joined.id);assert.equal(r.players.size,1);
  s.disconnect(old);assert.equal(s.connections.get(joined.id),next);assert.equal(r.players.get(joined.id).connected,true);
});
test('only the leader can release a disconnected seat and equipment remains in the world',async()=>{
  const {server:s,r}=setup(),a=socket(),b=socket(),c=socket();for(const ws of [a,b,c])await s.handle(ws,{type:'party-join',code:r.code});const id=c.party.id;const items=r.players.get(id).inventory.length;s.disconnect(c);
  await s.handle(b,{type:'party-release-seat',playerId:id});assert.ok(r.players.has(id));
  await s.handle(a,{type:'party-release-seat',playerId:id});assert.equal(r.players.has(id),false);assert.equal(r.floors.get(1).objects.length,items);
});

test('completed or disconnected rooms can be unloaded so repeated wipes do not exhaust party slots',async()=>{
  const runtime=await mkdtemp(path.join(tmpdir(),'descent-party-capacity-')),s=new PartyServer({root:runtime,runtime});let stopped=0,saved=0;s.save=()=>{saved++;return true;};
  for(let n=0;n<8;n++)s.rooms.set(String(n),{loading:new Map(),players:new Map(),generator:{stop(){stopped++;}}});
  const fresh=s.room('ABCDEF12',true);assert.equal(fresh.code,'ABCDEF12');assert.equal(s.rooms.size,8);assert.equal(stopped,1);assert.equal(saved,1);
});
