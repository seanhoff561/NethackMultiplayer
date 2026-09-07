import {creatureProfile} from '../src/creatures.js';
// NetHack: Descent, 2026-09-07. Authoritative fixed-step spatial simulation.
import {CollisionWorld,integratePlayer,startJump,advanceJump,stairFinished,stairLocal,stairWorld,CELL,cellKey} from '../src/spatial.js';

export class SpatialSimulation {
  constructor(){this.world=new CollisionWorld();this.actors=new Map();this.player=null;this.input={};this.level=null;this.sequence=0;this.time=0;this.inputAt=-10;this.transition=false;this.projected=null;this.routes=new Map();}
  accept(snapshot) {
    const p=snapshot.player;if(!p)return;
    const changed=this.level!==snapshot.levelId;
    const signature=snapshot.tiles.map(t=>`${t.x},${t.y},${t.type}`).join(';');
    if(changed||signature!==this.signature){this.world.setTiles(snapshot.tiles);this.signature=signature;this.routes.clear();}
    if(changed){this.level=snapshot.levelId;this.player=this.world.spawn(p.x,p.y);this.actors.clear();this.transition=false;this.input={};this.projected=null;this.savedYaw=undefined;this.stairLatch=null;}
    // Teleports, traps and native movement commands can relocate the legacy anchor.
    if(this.projected&&snapshot.spatialSerial===this.sequence&&(p.x!==this.projected.x||p.y!==this.projected.z)) {
      this.player=this.world.spawn(p.x,p.y);this.projected=null;
    }
    this.blocked=p.immobile||p.hp<=0;
    this.nativePlayer={x:p.x,z:p.y};
    this.player.speedScale=p.speedScale??1;
    const present=new Set();
    for(const m of snapshot.actors||[]) {
      present.add(m.id);let actor=this.actors.get(m.id);
      if(!actor){actor={...this.world.spawn(m.x,m.y),id:m.id,radius:creatureProfile(m).radius};this.actors.set(m.id,actor);}
      // Preserve fractional placement; only magical relocation changes it abruptly.
      if(actor.projected&&Math.hypot(m.x-actor.projected.x,m.y-actor.projected.z)>2){actor.x=(m.x+.5)*CELL;actor.z=(m.y+.5)*CELL;actor.y=0;}
      actor.data=m;actor.radius=creatureProfile(m).radius;
    }
    for(const id of this.actors.keys())if(!present.has(id))this.actors.delete(id);
  }
  setInput(input){this.input={forward:Math.max(-1,Math.min(1,Number(input.forward)||0)),strafe:Math.max(-1,Math.min(1,Number(input.strafe)||0)),yaw:Number.isFinite(input.yaw)?input.yaw:0,run:!!input.run,crouch:!!input.crouch,defend:!!input.defend};this.inputAt=this.time;}
  jump(){return !this.blocked&&!this.transition&&startJump(this.player);}
  release(){this.input={yaw:this.input.yaw||0};}
  waypoint(actor,target) {
    const stair=this.world.stairAt(actor.x,actor.z)||this.world.stairAt(target.x,target.z);
    if(stair){
      const a=stairLocal(stair,actor.x,actor.z),b=stairLocal(stair,target.x,target.z);
      const aInside=Math.abs(a.x)<1.5&&Math.abs(a.z)<1.5,bInside=Math.abs(b.x)<1.5&&Math.abs(b.z)<1.5;
      if(!aInside&&bInside)return stairWorld(stair,-.72,1.3);
      if(aInside){
        if(a.x>0&&(!bInside||b.x<0)){if(a.z>-.96)return stairWorld(stair,.72,-1.04);return stairWorld(stair,-.72,-1.04);}
        if(a.x<0&&bInside&&b.x>0){if(a.z>-.96)return stairWorld(stair,-.72,-1.04);return stairWorld(stair,.72,-1.04);}
        if(!bInside)return stairWorld(stair,-.72,1.9);
        return target;
      }
    }
    if(this.world.lineClear(actor,target,actor.radius))return target;
    const sx=Math.floor(actor.x/CELL),sz=Math.floor(actor.z/CELL),tx=Math.floor(target.x/CELL),tz=Math.floor(target.z/CELL);
    const key=`${sx},${sz}:${tx},${tz}`;
    let path=this.routes.get(key);
    if(!path) {
      const start=cellKey(sx,sz),goal=cellKey(tx,tz),queue=[[sx,sz]],previous=new Map([[start,null]]);let found=false;
      for(let q=0;q<queue.length&&q<1800;q++) {
        const [x,z]=queue[q];if(cellKey(x,z)===goal){found=true;break;}
        for(const [dx,dz] of [[0,-1],[1,0],[0,1],[-1,0]]){
          const nx=x+dx,nz=z+dz,k=cellKey(nx,nz);
          if(!previous.has(k)&&this.world.walkable(nx,nz)){previous.set(k,cellKey(x,z));queue.push([nx,nz]);}
        }
      }
      path=[];if(found){let k=goal;while(k&&k!==start){const [x,z]=k.split(',').map(Number);path.unshift({x:(x+.5)*CELL,z:(z+.5)*CELL});k=previous.get(k);}}
      if(this.routes.size>1500)this.routes.clear();this.routes.set(key,path);
    }
    for(let i=path.length-1;i>=0;i--)if(this.world.lineClear(actor,path[i],actor.radius))return path[i];
    return path[0]||actor;
  }
  update(dt) {
    this.time+=dt;if(!this.player)return null;
    if(this.blocked){this.player.jumpOffset=0;this.player.jumpVelocity=0;}else advanceJump(this.player,dt);
    const bodies=[...this.actors.values()];
    if(!this.blocked&&!this.transition&&this.time-this.inputAt<.3)integratePlayer(this.world,this.player,this.input,dt*(this.player.speedScale??1),bodies);
    for(const a of bodies) {
      a.moving=false;
      const d=a.data;if(!d.canMove||d.sleeping||d.speed<=0||d.stationary)continue;
      const distance=Math.hypot(a.x-this.player.x,a.z-this.player.z);
      let target=null;
      if(d.tame) {
        const enemy=bodies.filter(b=>!b.data.peaceful&&b!==a&&Math.hypot(b.x-a.x,b.z-a.z)<6).sort((b,c)=>Math.hypot(b.x-a.x,b.z-a.z)-Math.hypot(c.x-a.x,c.z-a.z))[0];
        if(enemy&&Math.hypot(enemy.x-a.x,enemy.z-a.z)>1.1)target=enemy;
        else if(!enemy&&d.goalX&&Math.hypot(d.goalX-this.nativePlayer.x,d.goalZ-this.nativePlayer.z)>1)target={x:(d.goalX+.5)*CELL,z:(d.goalZ+.5)*CELL};
        else if(!enemy&&distance>1.7)target=this.player;
      }
      else if(!d.peaceful&&distance<36) {
        const detection=this.input.crouch?8:this.input.run?22:17;
        if(distance<detection&&this.world.lineClear(a,this.player,.04)) {a.alertUntil=this.time+12;a.lastKnown={x:this.player.x,z:this.player.z,y:this.player.y};}
        if(d.fleeing)target={x:a.x+(a.x-this.player.x),z:a.z+(a.z-this.player.z)};
        else if(distance>Math.max(1.12,a.radius+.38)&&a.alertUntil>this.time)target=a.lastKnown;
      } else if(d.peaceful&&!d.tame) {
        if(!a.wander||this.time>a.wanderAt){const angle=a.id*2.399+Math.floor(this.time/5)*1.7;a.wander={x:a.x+Math.cos(angle)*2,z:a.z+Math.sin(angle)*2};a.wanderAt=this.time+5;}
        target=a.wander;
      }
      if(!target)continue;
      const next=this.waypoint(a,target),dx=next.x-a.x,dz=next.z-a.z,len=Math.hypot(dx,dz);if(len<.05)continue;
      const speed=Math.min(8.5,d.speed/12*5.15)*(d.peaceful&&!d.tame?.4:1),step=Math.min(len,speed*dt);
      const before={x:a.x,z:a.z};this.world.move(a,dx/len*step,dz/len*step,[this.player,...bodies]);
      a.moving=Math.hypot(a.x-before.x,a.z-before.z)>.001;
      if(a.moving)a.yaw=Math.atan2(a.x-before.x,a.z-before.z);
    }
    if(this.stairLatch&&!stairFinished(this.stairLatch,this.player))this.stairLatch=null;
    if(!this.transition&&!this.blocked&&!this.stairLatch)for(const stair of this.world.stairs)if(stairFinished(stair,this.player)) {
      this.stairLatch=stair;this.transition=true;this.release();return stair.sign>0?'<':'>';
    }
    return null;
  }
  project(session,advance=false) {
    if(!this.player||(!session.ready&&!advance))return;
    const p=this.player;this.sequence++;this.projected={x:Math.floor(p.x/CELL),z:Math.floor(p.z/CELL)};
    if(!this.world.walkable(this.projected.x,this.projected.z)){
      const candidates=[];for(let x=this.projected.x-1;x<=this.projected.x+1;x++)for(let z=this.projected.z-1;z<=this.projected.z+1;z++)if(this.world.walkable(x,z))candidates.push({x,z});
      this.projected=candidates.sort((a,b)=>Math.hypot((a.x+.5)*CELL-p.x,(a.z+.5)*CELL-p.z)-Math.hypot((b.x+.5)*CELL-p.x,(b.z+.5)*CELL-p.z))[0]||this.nativePlayer;
    }
    session.write({kind:'defend',value:!this.blocked&&!this.transition&&this.time-this.inputAt<.3&&!!this.input.defend});
    session.write({kind:'position',value:[this.sequence,...this.level.split(':').map(Number),p.x,p.z,p.y+(p.jumpOffset||0),this.projected.x,this.projected.z]});
    for(const a of this.actors.values()){
      a.projected={x:Math.floor(a.x/CELL),z:Math.floor(a.z/CELL)};
      const inReach=Math.hypot(a.x-p.x,a.z-p.z)<1.85&&Math.abs(a.y-p.y)<1.5;
      session.write({kind:'actor',value:[a.id,a.x,a.z,a.y,inReach&&this.world.lineClear(a,p,.04)?1:0]});
    }
  }
  melee(aimYaw) {
    if(!this.player)return null;const yaw=aimYaw??this.input.yaw??0,p=this.player;
    return [...this.actors.values()].filter(a=>{
      const dx=a.x-p.x,dz=a.z-p.z,d=Math.hypot(dx,dz);
      return d<1.85&&Math.abs(a.y-p.y)<1.4&&(-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/Math.max(.001,d)>.55&&this.world.lineClear(p,a,.05);
    }).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]?.id??null;
  }
  packet(){return {type:'motion',levelId:this.level,time:this.time,spawnYaw:this.savedYaw,player:this.player?{...this.player}:null,actors:[...this.actors.values()].map(a=>({id:a.id,x:a.x,z:a.z,y:a.y,yaw:a.yaw,radius:a.radius,moving:!!a.moving,visible:a.data.visible})),transition:this.transition,blocked:this.blocked};}
  serialize(){return {levelId:this.level,time:this.time,player:this.player,actors:[...this.actors.values()].map(a=>({id:a.id,x:a.x,z:a.z,y:a.y})),yaw:this.input.yaw||0};}
  restore(saved){
    if(!saved||saved.levelId!==this.level||!saved.player||!Number.isFinite(saved.player.x)||!Number.isFinite(saved.player.z))return false;
    const p={...this.player,x:saved.player.x,z:saved.player.z,y:saved.player.y||0};
    if(!this.world.clear(p,p.x,p.z))return false;
    this.player=p;this.time=Number(saved.time)||0;this.savedYaw=Number(saved.yaw)||0;
    for(const position of saved.actors||[]){const actor=this.actors.get(position.id);if(actor&&Number.isFinite(position.x)&&Number.isFinite(position.z)){const candidate={...actor,...position};if(this.world.clear(candidate,candidate.x,candidate.z))Object.assign(actor,position);}}
    return true;
  }
}
