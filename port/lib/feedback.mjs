// Detect actual native outcomes, never speculative clicks or animations.
export class FeedbackTracker {
  constructor(){this.previous=null;this.serial=0;}
  accept(snapshot){
    const before=this.previous;this.previous=snapshot;
    if(!before||before.levelId!==snapshot.levelId)return [];
    const events=[],push=e=>events.push({...e,id:++this.serial});
    const damage=before.player.hp-snapshot.player.hp;if(damage>0)push({kind:'player-hit',amount:damage});
    const oldActors=new Map((before.actors||[]).map(a=>[a.id,a]));
    for(const a of snapshot.actors||[]){const old=oldActors.get(a.id);if(old&&a.hp<old.hp)push({kind:'actor-hit',actorId:a.id,amount:old.hp-a.hp});oldActors.delete(a.id);}
    // Removal alone can also mean migration; the native death marker distinguishes it.
    for(const a of snapshot.defeated||[])push({kind:'actor-hit',actorId:a,dead:true});
    // Pickup is emitted by pick_obj() itself: inventory splits, polymorphs,
    // wishes and stack merges must never produce speculative pickup feedback.
    const doors=new Map(before.tiles.filter(t=>t.type.startsWith('door')).map(t=>[`${t.x},${t.y}`,t.type]));
    if(snapshot.tiles.some(t=>t.type==='door-open'&&doors.get(`${t.x},${t.y}`)==='door-closed'))push({kind:'door'});
    return events;
  }
}
