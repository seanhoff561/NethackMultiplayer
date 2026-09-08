const range=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z,(a.y||0)-(b.y||0));
export class PartyCampaign {
  constructor(room,owner){this.room=room;this.state={owner:{id:owner.id,name:owner.name,role:owner.role,race:owner.race,gender:owner.gender,alignment:owner.alignment||'lawful'},questAccepted:false,questComplete:false,invoked:false,amuletRecovered:false,planes:false};}
  get stateLabel(){const s=this.state;return s.planes?'Reach the Astral Plane and offer the Amulet at your world creator’s aligned altar.':s.amuletRecovered?'Carry the Amulet back to the surface and enter the Elemental Planes.':s.invoked?'Defeat the high priest in Moloch’s Sanctum and recover the Amulet of Yendor.':s.questComplete?'Recover the Candelabrum and Book, then perform the invocation at the vibrating square.':s.questAccepted?`Defeat ${s.native?.questNemesis||'the quest nemesis'} and return the quest artifact to ${s.native?.questLeader||'the leader'}.`:`Find ${s.native?.questLeader||'your quest leader'} and begin ${s.owner.name}’s ${s.owner.role} quest (level 14).`;}
  packet(){return {...this.state,objective:this.stateLabel};}
  accept(floor){if(floor.source.campaign)this.state.native={...this.state.native,...floor.source.campaign};}
  items(){const items=[];for(const p of this.room.players.values())for(const item of p.inventory)items.push({item,player:p});return items;}
  nearbyItems(p){return this.items().filter(({player})=>player.connected&&player.depth===p.depth&&range(player.body,p.body)<8);}
  acquired(item){if(item.campaignItem==='amulet'&&!this.state.amuletRecovered){this.state.amuletRecovered=true;this.room.notify('The party has recovered the Amulet of Yendor. Return to the surface together!');}}
  chat(p){
    const r=this.room,f=r.floors.get(p.depth),s=this.state;
    const leader=[...f.sim.actors.values()].find(a=>a.data.name===s.native?.questLeader&&range(a,p.body)<3.5&&f.sim.world.lineClear(a,p.body,.02));
    if(!leader)throw Error('Stand beside your world creator’s quest leader.');
    const owner=r.players.get(s.owner.id),level=owner?.level||s.owner.level||1;
    if(!s.questAccepted){if(level<14)throw Error(`${s.owner.name} must reach level 14 before the quest leader will assign the quest.`);s.questAccepted=true;r.notify(`${s.native.questLeader} entrusts ${s.owner.name}’s quest to the party: defeat ${s.native.questNemesis} and recover ${s.native.questArtifact}.`);}
    else if(!s.questComplete){if(!this.nearbyItems(p).some(({item})=>item.campaignItem==='questArtifact'))throw Error('Bring the quest artifact back to your leader.');s.questComplete=true;r.notify('The quest leader recognizes your victory. The party keeps the artifact and the Bell of Opening.');}
    else r.send(p.id,{type:'notice',text:'Your quest is complete. Seek the invocation tools and the Amulet of Yendor.'});
    r.save(r);
  }
  connection(p,connection){
    const f=this.room.floors.get(p.depth),s=this.state;
    if(f.nativeId===s.native?.questStart&&connection.to!==f.nativeId&&connection.kind!=='portal'&&!connection.up&&!s.questAccepted)throw Error('Speak with the quest leader before descending into the quest.');
    if(connection.to===s.native?.sanctum&&!s.invoked)throw Error('Perform the invocation at the vibrating square first.');
    if(connection.to==='0:0'){
      if(!s.amuletRecovered||!p.inventory.some(i=>i.campaignItem==='amulet'))throw Error('The Amulet bearer must bring the Amulet of Yendor to the surface.');
      return {destination:s.native.earth,party:true,planes:true};
    }
    return {destination:connection.to};
  }
  invoke(p){
    const r=this.room,f=r.floors.get(p.depth),meta=f.source.campaign,s=this.state;
    if(s.invoked)throw Error('The Sanctum passage is already open.');
    if(!meta?.invocation||Math.hypot(p.body.x-(meta.invocationX+.5)*3,p.body.z-(meta.invocationY+.5)*3)>2)throw Error('Stand on the vibrating square to perform the invocation.');
    if(!s.questComplete)throw Error('Complete the world creator’s quest before the invocation.');
    const items=this.nearbyItems(p),missing=['bell','candelabrum','book'].filter(tag=>!items.some(({item})=>item.campaignItem===tag));
    if(missing.length)throw Error('Gather the Bell of Opening, Candelabrum of Invocation and Book of the Dead within eight metres.');
    s.invoked=true;
    const tile=f.source.tiles.find(t=>t.x===meta.invocationX&&t.y===meta.invocationY);tile.type='stairs_down';f.source.connections.push({x:tile.x,y:tile.y,up:false,kind:'stairs',to:meta.sanctum});f.sim.world.setTiles(f.source.tiles);f.sim.routes.clear();
    r.notify('The Bell rings, the Candelabrum burns, and the Book opens the way to Moloch’s Sanctum.');r.save(r);
  }
  offer(p){
    const r=this.room,s=this.state,f=r.floors.get(p.depth);
    if(f.nativeId!==s.native?.astral)return false;
    const amulet=p.inventory.find(i=>i.campaignItem==='amulet');if(!amulet)throw Error('The character carrying the real Amulet of Yendor must make the final offering.');
    const align={lawful:1,neutral:0,chaotic:-1}[s.owner.alignment],altar=f.source.tiles.find(t=>t.type==='altar'&&Math.hypot((t.x+.5)*3-p.body.x,(t.y+.5)*3-p.body.z)<2);
    if(!altar)throw Error('Stand on an Astral altar to offer the Amulet.');
    if(altar.altarAlignment!==align)throw Error(`This altar is not aligned with ${s.owner.name}. Find the ${s.owner.alignment} altar.`);
    if(!s.planes||!s.invoked||!s.questComplete||!s.amuletRecovered)throw Error('The party has not completed the ascension path.');
    p.inventory.splice(p.inventory.indexOf(amulet),1);r.keys(p);s.ascended=true;
    r.finish('victory',`${p.name} offers the Amulet of Yendor for ${s.owner.name}’s expedition. The entire party ascends!`);return true;
  }
}
