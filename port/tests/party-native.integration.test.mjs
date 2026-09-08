import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {PartyDungeon} from '../lib/party-dungeon.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('native party generator exports the connected campaign, artifacts and all five Planes',{timeout:120000},async()=>{
  await mkdir(path.join(root,'test-results'),{recursive:true});const cwd=await mkdtemp(path.join(root,'test-results/party-native-'));
  const generator=new PartyDungeon({executable:path.join(root,'engine/bin/nethack-engine-coop-v08.exe'),data:path.join(root,'engine/data'),cwd});
  generator.setCharacter({role:'Knight',race:'human',gender:'male',alignment:'lawful'});
  try{
    const one=await generator.floor(1);assert.ok(one.tiles.length>100);assert.equal(one.campaign.questLeader,'King Arthur');assert.ok(one.connections.length);assert.equal(one.actors.some(a=>a.tame),false,'native generator creates no starting pet');
    const two=await generator.floor('0:2');assert.equal(two.player.depth,2);assert.notDeepEqual(one.tiles,two.tiles);
    const goal=await generator.floor(one.campaign.questGoal);assert.ok(goal.actors.some(a=>a.name===one.campaign.questNemesis));
    assert.ok(goal.actors.flatMap(a=>a.loot).some(i=>i.campaignItem==='bell'));assert.ok([...goal.floorObjects,...goal.actors.flatMap(a=>a.loot)].some(i=>i.campaignItem==='questArtifact'));
    const visited=new Map([[one.levelId,one],[two.levelId,two],[goal.levelId,goal]]),queue=[one,two,goal];
    for(let cursor=0;cursor<queue.length;cursor++)for(const link of queue[cursor].connections){
      if(link.to==='0:0'||visited.has(link.to))continue;
      assert.match(link.to,/^\d+:\d+$/);const floor=await generator.floor(link.to);visited.set(link.to,floor);queue.push(floor);assert.ok(queue.length<200);
    }
    assert.ok(visited.has(one.campaign.questStart),'quest leader reachable through the native branch graph');
    const items=[...visited.values()].flatMap(f=>[...f.floorObjects,...f.actors.flatMap(a=>a.loot)]);
    for(const tag of ['bell','questArtifact','candelabrum','book'])assert.ok(items.some(i=>i.campaignItem===tag),`${tag} reachable in the native dungeon graph`);
    assert.ok([...visited.values()].some(f=>f.campaign.invocation),'vibrating square reachable');
    assert.ok([...visited.values()].some(f=>f.connections.some(c=>c.kind==='drop'&&c.to.split(':')[0]!==f.levelId.split(':')[0])),'Castle trapdoor reaches Gehennom');
    const sanctum=await generator.floor(one.campaign.sanctum);assert.ok(sanctum.actors.flatMap(a=>a.loot).some(i=>i.campaignItem==='amulet'));
    let plane=await generator.floor(one.campaign.earth),planes=1;assert.ok(plane.connections.some(c=>c.kind==='portal'));
    assert.ok(plane.actors.flatMap(a=>a.loot).some(i=>/pick-axe|wand of digging/.test(i.name)),'Earth supplies excavation tools');
    while(plane.levelId!==one.campaign.astral){plane=await generator.floor(plane.connections.find(c=>c.kind==='portal').to);planes++;assert.ok(planes<=5);}
    assert.equal(planes,5);assert.equal(new Set(plane.tiles.filter(t=>t.type==='altar').map(t=>t.altarAlignment)).size,3);
  }finally{generator.stop();}
});
