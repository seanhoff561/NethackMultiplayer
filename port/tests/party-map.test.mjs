import test from 'node:test';
import assert from 'node:assert/strict';
import {PartySimulation} from '../lib/party-simulation.mjs';
import {visibleMapTiles} from '../lib/party-cartography.mjs';
import {mapRecord,mapBounds} from '../src/parchment.js';

const terrain=depth=>({levelId:`0:${depth}`,width:16,height:10,player:{x:3,y:4,depth,dungeon:'Dungeons of Doom'},actors:[],floorObjects:[],tiles:Array.from({length:160},(_,i)=>{const x=i%16,y=Math.floor(i/16);return {x,y,type:x===0||x===15||y===0||y===9||x===8?(x===8&&y===4?'door-closed':'wall'):x===3&&y===3?'stairs-down':'floor',char:' ',seen:true,explored:true};})});
const setup=()=>new PartySimulation({code:'ABCDEF12',generator:{floor:async depth=>terrain(depth)}});
function place(p,x,y){Object.assign(p.body,{x:(x+.5)*3,z:(y+.5)*3,y:0});}
const has=(map,x,y)=>map.tiles.some(t=>t.x===x&&t.y===y);

test('each player maps their own room, including walls and doors, without copying generator glyphs',async()=>{
  const r=setup(),a=await r.join({name:'Alice'}),b=await r.join({name:'Bob'});
  for(const p of [a,b]){p.cartography={};p.seen.clear();}place(a,6,4);place(b,10,4);r.survey(a);r.survey(b);
  const left=r.personalMap(a),right=r.personalMap(b);assert.ok(has(left,8,4),'closed door is recorded');assert.ok(has(left,8,3),'walls are recorded');assert.equal(has(left,9,4),false,'closed door hides the room beyond');assert.equal(has(right,7,4),false);
  assert.equal(left.ownerId,a.id);assert.equal(right.ownerId,b.id);assert.equal(left.ownerName,'Alice');assert.equal(left.tiles.find(t=>t.x===8&&t.y===4).char,'+');assert.ok(left.tiles.some(t=>t.char==='.'));
  assert.notDeepEqual(left.tiles,right.tiles);assert.equal(r.snapshot(a).cartography.ownerName,'Alice');assert.equal(r.snapshot(b).cartography.ownerName,'Bob');
});

test('unseen door changes stay out of a personal map until observed; search cannot reveal behind walls',async()=>{
  const r=setup(),a=await r.join({});place(a,6,4);r.survey(a);const f=r.floors.get(1),door=f.source.tiles.find(t=>t.x===8&&t.y===4);assert.equal(r.personalMap(a).tiles.find(t=>t.x===8&&t.y===4).char,'+');
  place(a,2,4);door.type='door_open';r.survey(a);assert.equal(r.personalMap(a).tiles.find(t=>t.x===8&&t.y===4).char,'+','distant mutations are not broadcast onto the map');
  place(a,6,4);r.survey(a);assert.equal(r.personalMap(a).tiles.find(t=>t.x===8&&t.y===4).char,"'");assert.ok(has(r.personalMap(a),9,4));
  door.type='door';const hidden=f.source.tiles.find(t=>t.x===9&&t.y===4);hidden.type='wall';hidden.secretDoor=true;place(a,7,4);r.command(a,'s');assert.equal(hidden.secretDoor,true);
});

test('map memory is independent per floor and survives saving, reconnecting and legacy migration',async()=>{
  const r=setup(),a=await r.join({name:'Alice'}),b=await r.join({name:'Bob'});place(a,6,4);r.survey(a);const first=structuredClone(r.personalMap(a));
  await r.floor(2);a.depth=2;place(a,10,4);r.survey(a);assert.equal(has(r.personalMap(a),6,4),false);assert.equal(r.personalMap(b).levelId,'party:1');
  const save=JSON.parse(JSON.stringify(r.serialize())),restored=setup();restored.restore(save);const resumed=await restored.join({},a.token);assert.deepEqual(restored.personalMap(resumed),r.personalMap(a));resumed.depth=1;assert.deepEqual(restored.personalMap(resumed).tiles,first.tiles);
  for(const p of save.players)delete p.cartography;const legacy=setup();legacy.restore(save);assert.equal(legacy.personalMap(legacy.players.get(b.id)).ownerName,'Bob');assert.equal(has(legacy.personalMap(legacy.players.get(b.id)),10,4),false,'legacy migration only restores that character’s discovered cells');
});

test('map rays do not reveal through diagonal solid corners',()=>{
  const tiles=[{x:1,y:1,type:'floor'},{x:2,y:1,type:'wall'},{x:1,y:2,type:'wall'},{x:2,y:2,type:'floor'}];const visible=visibleMapTiles(tiles,{x:4.5,z:4.5});assert.ok(visible.some(t=>t.x===2&&t.y===1));assert.equal(visible.some(t=>t.x===2&&t.y===2),false);
});

test('party parchment uses only personal terrain, correct owner and floor dimensions',async()=>{
  const r=setup(),a=await r.join({name:'Alice'}),snapshot=r.snapshot(a),record=mapRecord(snapshot,12);assert.equal(record.ownerName,'Alice');assert.equal(record.width,16);assert.equal(record.height,10);assert.ok(record.tiles.some(t=>t.char==='>'),'stairs remain legible despite blank native glyphs');
  assert.equal(record.tiles.length,snapshot.cartography.tiles.length);assert.ok(record.tiles.length<snapshot.tiles.length);snapshot.cartography.tiles[0].char='X';assert.notEqual(record.tiles[0].char,'X','drawing retains its own record');
});

test('personal parchment fits discovered terrain and expands to include distant exploration',()=>{
  const record={ownerId:'Alice',width:80,height:21,player:{x:60,y:12},tiles:[{x:57,y:10},{x:63,y:14}]};const near=mapBounds(record);assert.equal(near.width,24);assert.equal(near.height,12);assert.ok(near.x<=57&&near.x+near.width>63);assert.ok(near.y<=10&&near.y+near.height>14);
  record.tiles.push({x:2,y:2});const wide=mapBounds(record);assert.ok(wide.width>near.width);assert.ok(wide.x<=2&&wide.x+wide.width>63);delete record.ownerId;assert.deepEqual(mapBounds(record),{x:0,y:0,width:80,height:21});
});

test('motion packets carry a changed personal map immediately, then omit unchanged map data',async()=>{
  const r=setup(),p=await r.join({name:'Alice'});p.mapRevisionSent=-1;const first=r.motion(p);assert.ok(first.cartography?.ownerId===p.id);const stable=r.motion(p);assert.equal(stable.cartography,undefined);
  place(p,10,4);const moved=r.motion(p);assert.ok(moved.cartography,'movement changes exploration without waiting for a full snapshot');assert.ok(moved.cartography.revision>first.cartography.revision);assert.equal(moved.cartography.ownerName,'Alice');const again=r.motion(p);assert.equal(again.cartography,undefined);
});
