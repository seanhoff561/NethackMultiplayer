import {NativeSession} from './native-session.mjs';
import {cp,mkdir} from 'node:fs/promises';

// An isolated native process generates content. It never owns a party hero.
// Floors already exported are stored in the party save, not generated again.
export class PartyDungeon {
  constructor({executable,data,cwd}){Object.assign(this,{executable,data,cwd});this.queue=Promise.resolve();}
  setCharacter(character){if(!this.engine)this.character={...character};}
  async start(){
    if(this.engine)return;
    this.error=null;
    await mkdir(this.cwd,{recursive:true});await cp(this.data,this.cwd,{recursive:true});
    const c=this.character||{role:'Wizard',race:'human',gender:'male',alignment:'neutral'};
    const e=this.engine=new NativeSession({executable:this.executable,cwd:this.cwd,args:['-uwizard','-D','-p',c.role,'-r',c.race,'-g',c.gender,'-a',c.alignment],env:{NH_COOP_GENERATOR:'1'}});
    // Generator prompts are answered directly; there are no detached UI menus.
    e.present=request=>{
      if(request.kind==='text'&&this.destination!=null)e.write({kind:'text',value:String(this.destination)});
      else e.write({kind:'key',value:request.kind==='yn'?'y':32});
    };
    e.on('event',event=>{if(event.type==='campaign-floor-ready'){e.ready=true;e.exportedFloor=event.levelId;}});
    e.on('failure',error=>{this.error=error;});e.start();
    await this.until(()=>e.ready&&e.snapshot);
  }
  async until(predicate){const deadline=Date.now()+12000;while(!predicate()){if(this.error||this.engine.closed||Date.now()>deadline)throw Error(this.error||'Dungeon generation timed out: '+JSON.stringify({floor:this.engine.snapshot?.levelId,request:this.engine.request}));await new Promise(resolve=>setTimeout(resolve,15));}}
  floor(depth){
    const task=this.queue.then(async()=>{
      await this.start();const e=this.engine;
      if(typeof depth==='string'){
        if(!/^\d+:\d+$/.test(depth))throw Error('Invalid native floor identifier.');
        if(e.snapshot.levelId!==depth){e.write({kind:'campaign-floor',value:depth.split(':').map(Number)});await this.until(()=>e.exportedFloor===depth);}
      }else if(e.snapshot.player.depth!==depth){this.destination=depth;e.act({key:'#wizlevelport'});await this.until(()=>e.ready&&!e.replay&&e.snapshot.player.depth===depth);this.destination=null;}
      const snapshot=structuredClone(e.snapshot);
      // Keep the native dungeon topology and generator RNG with the party.
      // A later server restart must not create a different branch layout.
      e.act({key:'Sy'});await this.until(()=>e.closed);this.engine=null;
      return snapshot;
    });
    this.queue=task.catch(()=>{});return task;
  }
  stop(){this.engine?.stop();}
}
