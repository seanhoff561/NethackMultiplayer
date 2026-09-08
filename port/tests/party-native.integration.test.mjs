import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {PartyDungeon} from '../lib/party-dungeon.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('native party generator exports multiple real floors without sharing a hero',{timeout:40000},async()=>{
  await mkdir(path.join(root,'test-results'),{recursive:true});const cwd=await mkdtemp(path.join(root,'test-results/party-native-'));
  const generator=new PartyDungeon({executable:path.join(root,'engine/bin/nethack-engine-coop-v08.exe'),data:path.join(root,'engine/data'),cwd});
  generator.setCharacter({role:'Knight',race:'human',gender:'male',alignment:'lawful'});
  try{
    const one=await generator.floor(1);assert.ok(one.tiles.length>100);assert.equal(one.campaign.questLeader,'King Arthur');assert.ok(one.connections.length);
    const two=await generator.floor('0:2');assert.equal(two.player.depth,2);assert.notDeepEqual(one.tiles,two.tiles);
    const goal=await generator.floor(one.campaign.questGoal);assert.ok(goal.actors.some(a=>a.name===one.campaign.questNemesis));
    assert.ok(goal.actors.flatMap(a=>a.loot).some(i=>i.campaignItem==='bell'));assert.ok(goal.actors.flatMap(a=>a.loot).some(i=>i.campaignItem==='questArtifact'));
    const sanctum=await generator.floor(one.campaign.sanctum);assert.ok(sanctum.actors.flatMap(a=>a.loot).some(i=>i.campaignItem==='amulet'));
    const earth=await generator.floor(one.campaign.earth);assert.ok(earth.connections.some(c=>c.kind==='portal'));
    const astral=await generator.floor(one.campaign.astral);assert.equal(new Set(astral.tiles.filter(t=>t.type==='altar').map(t=>t.altarAlignment)).size,3);
  }finally{generator.stop();}
});
