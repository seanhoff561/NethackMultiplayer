// A short reliable input buffer, independent of native rule ticks and render frames.
export class ActionQueue {
  constructor({ready,execute,validate=()=>null,notify=()=>{},now=()=>performance.now(),cooldown=540}){Object.assign(this,{ready,execute,validate,notify,now,cooldown});this.queue=[];this.recent=new Set();this.nextAttack=0;}
  enqueue(action){
    if(action.id&&this.recent.has(action.id))return false;
    if(action.id){this.recent.add(action.id);if(this.recent.size>512)this.recent.delete(this.recent.values().next().value);}
    if(this.queue.length>=8){this.notify(action,'rejected','Action buffer is full.');return false;}
    // At most one extra swing is buffered; held attacks do not build a long tail.
    if(action.spatialMelee&&this.queue.some(a=>a.spatialMelee)){this.notify(action,'rejected','Attack already buffered.');return false;}
    this.queue.push(action);this.notify(action,'queued');this.update();return true;
  }
  update(){
    if(!this.queue.length||!this.ready())return false;
    const action=this.queue[0],now=this.now();if(action.spatialMelee&&now<this.nextAttack)return false;
    this.queue.shift();const reason=this.validate(action);if(reason){this.notify(action,'rejected',reason);return false;}
    if(action.spatialMelee)this.nextAttack=now+this.cooldown;
    this.notify(action,'started');this.execute(action);return true;
  }
  clear(reason='Cancelled'){for(const action of this.queue)this.notify(action,'cancelled',reason);this.queue=[];}
}

export function resolveInventoryAction(action,snapshot){
  if(action.itemId===undefined)return null;
  const item=snapshot?.inventory?.find(i=>i.id===action.itemId);
  if(!item)return 'That item is no longer in your inventory.';
  if(!/^[wWaqerd]/.test(action.key))return 'Choose an inventory action again.';
  action.key=action.key[0]+item.key;return null;
}
