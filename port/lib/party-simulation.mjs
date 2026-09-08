import {PartyCampaign} from './party-campaign.mjs';
import {visibleMapTiles,rememberMapTiles} from './party-cartography.mjs';
import {randomBytes,randomUUID} from 'node:crypto';
import {SpatialSimulation} from './spatial-simulation.mjs';
import {integratePlayer,advanceJump,startJump,stairFinished,CELL,canonical} from '../src/spatial.js';
import {meleeTarget} from '../src/melee.js';
import {lootPositions} from '../src/loot.js';
import {CLASSES,MAX_PLAYERS,partyScaling,PARTY_COMMANDS} from '../src/party-rules.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z,(a.y||0)-(b.y||0));
const cleanName=value=>String(value||'Adventurer').replace(/[^a-zA-Z0-9 _-]/g,'').trim().slice(0,24)||'Adventurer';
const symbols={weapon:')',armor:'[',potion:'!',food:'%',scroll:'?',wand:'/',ammo:')'};
export class PartySimulation {
  constructor({code,generator,send=()=>{},save=()=>{}}){
    Object.assign(this,{code,generator,send,save});this.players=new Map();this.floors=new Map();this.loading=new Map();this.time=0;this.nextId=100000;this.revision=0;this.log=[];this.hostId=null;
  }
  notify(text){this.log.push({id:++this.revision,text});this.log=this.log.slice(-40);this.broadcast({type:'notice',text});}
  broadcast(event,depth){for(const p of this.players.values())if(p.connected&&(depth===undefined||p.depth===depth))this.send(p.id,event);}
  item(name,kind,extra={}){return {id:this.nextId++,name,appearance:name,symbol:symbols[kind]||'(',kind,quantity:1,weight:10,...extra};}
  async floor(depth){
    if(this.floors.has(depth))return this.floors.get(depth);const existing=[...this.floors.values()].find(f=>f.nativeId===depth);if(existing)return existing;
    if(!this.loading.has(depth))this.loading.set(depth,(async()=>{
      const source=await this.generator.floor(depth),sim=new SpatialSimulation();
      const snapshot={...source,levelId:`party:${depth}`,player:{...source.player,hp:100,immobile:false,conditions:[]},tiles:source.tiles.map(t=>({...t,type:canonical(t.type),monster:null,object:null})),actors:source.actors.filter(a=>!a.tame).map(a=>({...a,id:this.nextId++,visible:true}))};
      for(const link of source.connections||[])if(link.kind==='portal'||link.kind==='drop'){const tile=snapshot.tiles.find(t=>t.x===link.x&&t.y===link.y);if(tile){tile.type='stairs_down';tile.trap=false;}}
      // Closed drawbridges use a shared operable gate in cooperative combat.
      for(const tile of snapshot.tiles)if(tile.drawbridge)tile.type='door';
      if(source.campaign?.invocation){const t=snapshot.tiles.find(t=>t.x===source.campaign.invocationX&&t.y===source.campaign.invocationY);if(t){t.campaignMarker=true;t.description='vibrating square';t.trap=false;}}
      sim.accept(snapshot);
      const floor={depth,nativeId:source.levelId,source:snapshot,sim,objects:source.floorObjects.map(o=>({...o,id:this.nextId++})),projectiles:[],scale:1};
      for(const a of sim.actors.values()){a.baseHp=Math.max(4,a.data.maxHp||a.data.hp);a.data.hp=a.baseHp;a.data.maxHp=a.baseHp;a.attackAt=0;}
      this.floors.set(depth,floor);this.campaign?.accept(floor);this.rescale();return floor;
    })().finally(()=>this.loading.delete(depth)));
    return this.loading.get(depth);
  }
  async join(character={},token){
    let p=[...this.players.values()].find(p=>token&&p.token===token);
    if(p){if(p.connected)throw Error('This character is already connected.');if(this.campaign?.state.planes&&!this.outcome){const ally=[...this.players.values()].find(x=>x.connected&&x.hp>0);if(ally&&p.depth!==ally.depth){p.depth=ally.depth;p.body=this.spawn(this.floors.get(ally.depth),'stairs_up');p.body.id=p.id;}}p.connected=true;p.disconnectedAt=null;this.hostId=this.hostId||p.id;this.rescale();return p;}
    if(this.outcome)throw Error('This expedition has ended. Create a new party to start a new game.');
    if(this.campaign?.state.planes)throw Error('This party has entered the final Planes. Only its existing characters can rejoin.');
    if(this.players.size>=MAX_PLAYERS)throw Error('This party is full (four adventurers). Reconnect with your original browser to reclaim your character.');
    // Reserve the seat before any asynchronous dungeon generation.
    const role=Object.hasOwn(CLASSES,character.role)?character.role:'Knight',stats=CLASSES[role];
    p={id:randomUUID(),token:randomBytes(24).toString('hex'),name:cleanName(character.name),role,race:['human','elf','dwarf','gnome','orc'].includes(character.race)?character.race:'human',gender:character.gender==='female'?'female':'male',alignment:['lawful','neutral','chaotic'].includes(character.alignment)?character.alignment:'lawful',connected:true,depth:1,hp:stats.hp,maxHp:stats.hp,power:stats.power,maxPower:stats.power,experience:0,level:1,gold:0,hunger:900,input:{},inputAt:-1,attackAt:-1,lastAction:-1,inventory:[],seen:new Set(),prompt:null,body:null};
    this.players.set(p.id,p);this.hostId=this.hostId||p.id;if(!this.campaign){this.campaign=new PartyCampaign(this,p);this.generator.setCharacter?.(this.campaign.state.owner);}
    try{
      const floor=await this.floor(1);p.body=this.spawn(floor,'stairs_up');p.body.id=p.id;
      p.inventory=[this.item(stats.weapon,'weapon',{equipped:true,damage:stats.damage}),this.item(`${role.toLowerCase()} armor`,'armor',{equipped:true,armor:stats.armor}),this.item('potion of healing','potion',{quantity:3}),this.item('food ration','food',{quantity:3}),this.item('dart','ammo',{quantity:20,damage:5})];
      if(['Wizard','Healer','Priest'].includes(role))p.inventory.push(this.item('wand of force','wand',{charges:8}));
      if(role==='Knight'||role==='Valkyrie')p.inventory.push(this.item('small shield','armor',{equipped:true,armor:2,armorSlot:1}));
      this.keys(p);this.survey(p);this.rescale();return p;
    }catch(error){this.players.delete(p.id);if(this.hostId===p.id)this.hostId=null;throw error;}
  }
  keys(p){p.inventory.forEach((item,i)=>item.key='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[i]);}
  survey(p){const f=this.floors.get(p.depth);if(!f||!p.body||p.hp<=0)return;rememberMapTiles(p,p.depth,visibleMapTiles(f.source.tiles,p.body),f.source.tiles);}
  personalMap(p){return {ownerId:p.id,ownerName:p.name,levelId:`party:${p.depth}`,elapsed:this.time,revision:p.cartography?.[p.depth]?.revision||0,tiles:Object.values(p.cartography?.[p.depth]?.tiles||{})};}
  spawn(floor,stair){
    const tiles=floor.source.tiles,entry=(typeof stair==='object'?stair:tiles.find(t=>t.type===stair))||tiles.find(t=>t.x===floor.source.player.x&&t.y===floor.source.player.y)||tiles.find(t=>t.type==='floor');
    const occupied=[...this.players.values()].filter(p=>p.depth===floor.depth&&p.body).map(p=>p.body);
    const candidates=[entry,...tiles.filter(t=>t.type==='floor').sort((a,b)=>Math.hypot(a.x-entry.x,a.y-entry.y)-Math.hypot(b.x-entry.x,b.y-entry.y))];
    for(const tile of candidates){const b=floor.sim.world.spawn(tile.x,tile.y);if(floor.sim.world.clear(b,b.x,b.z)&&occupied.every(o=>distance(b,o)>.7))return b;}
    return floor.sim.world.spawn(entry.x,entry.y);
  }
  disconnect(id){const p=this.players.get(id);if(!p)return;this.cancelRevive(p);p.connected=false;p.voiceEnabled=false;p.disconnectedAt=this.time;p.input={};p.prompt=null;if(this.hostId===id)this.hostId=[...this.players.values()].find(x=>x.connected)?.id||null;this.rescale();this.roster();this.save(this);}
  leave(id){const p=this.players.get(id);if(!p)return;if(this.campaign?.state.owner.id===id)this.campaign.state.owner.level=p.level;const f=this.floors.get(p.depth);if(f&&p.body)for(const item of p.inventory)f.objects.push({...item,equipped:false,x:Math.floor(p.body.x/CELL),y:Math.floor(p.body.z/CELL)});this.disconnect(id);this.players.delete(id);this.notify(`${p.name} left the party. Their equipment remains in the dungeon.`);this.checkWipe();this.roster();this.save(this);}
  rescale(){
    const count=Math.max(1,[...this.players.values()].filter(p=>p.connected).length),scale=partyScaling(count);
    for(const floor of this.floors.values()){
      floor.damageScale=scale.damage;
      for(const a of floor.sim.actors.values())if(!a.data.peaceful){const ratio=a.data.hp/Math.max(1,a.data.maxHp);a.data.maxHp=Math.ceil(a.baseHp*scale.health);a.data.hp=Math.max(1,Math.ceil(a.data.maxHp*ratio));}
      floor.scale=scale.health;
    }
  }
  publicPlayer(p){return {...p.body,id:p.id,name:p.name,role:p.role,race:p.race,gender:p.gender,location:this.floors.get(p.depth)?.source.player.dungeon,depthLabel:this.floors.get(p.depth)?.source.player.depth,connected:p.connected,voiceEnabled:!!p.voiceEnabled,levelId:`party:${p.depth}`,hp:p.hp,maxHp:p.maxHp,level:p.level,downed:p.hp<=0,revive:this.reviveState(p),yaw:p.input.yaw||0,moving:!!p.moving,crouch:!!p.input.crouch,defend:!!p.input.defend,attackAt:p.attackAt,weapon:p.inventory.find(i=>i.kind==='weapon'&&i.equipped)?.name||'bare hands'};}
  roster(){this.broadcast({type:'party-roster',code:this.code,hostId:this.hostId,players:[...this.players.values()].map(p=>this.publicPlayer(p)),commands:PARTY_COMMANDS});}
  snapshot(p){
    const f=this.floors.get(p.depth);if(!f||!p.body)return null;
    const b=p.body,armor=p.inventory.filter(i=>i.equipped&&i.symbol==='[').reduce((n,i)=>n+(i.armor||1),0);
    return {type:'snapshot',multiplayer:true,cartography:this.personalMap(p),revision:this.revision,levelId:`party:${p.depth}`,width:f.source.width,height:f.source.height,turn:Math.floor(this.time/.8),player:{...f.source.player,...p.body,x:Math.floor(b.x/CELL),y:Math.floor(b.z/CELL),name:p.name,role:p.role,race:p.race,hp:p.hp,downed:p.hp<=0,maxHp:p.maxHp,power:Math.floor(p.power),maxPower:p.maxPower,depth:f.source.player.depth,level:p.level,experience:p.experience,gold:p.gold,hunger:p.hunger,ac:10-armor,weapon:this.publicPlayer(p).weapon,shield:p.inventory.find(i=>i.equipped&&/shield/.test(i.name))?.name||'',conditions:p.hp<=0?['Downed — await revival']:p.hunger<200?['Hungry']:[],busy:false,immobile:p.hp<=0,blind:false,encumbrance:0,speedScale:1},inventory:p.inventory,tiles:f.source.tiles.map(t=>({...t,seen:p.seen.has(`${p.depth}:${t.x},${t.y}`),explored:p.seen.has(`${p.depth}:${t.x},${t.y}`)})),actors:[...f.sim.actors.values()].map(a=>({...a.data,x:Math.floor(a.x/CELL),y:Math.floor(a.z/CELL)})),floorObjects:f.objects,messages:this.log};
  }
  motion(p){const f=this.floors.get(p.depth);return {type:'motion',campaign:this.campaign?.packet(),revive:this.reviveState(p),levelId:`party:${p.depth}`,time:this.time,player:p.body,blocked:!!this.outcome||p.hp<=0||!!p.transition,transition:!!p.transition,players:[...this.players.values()].map(x=>this.publicPlayer(x)),actors:f?[...f.sim.actors.values()].map(a=>({id:a.id,x:a.x,z:a.z,y:a.y,yaw:a.yaw,moving:!!a.moving,visible:true})):[],projectiles:f?.projectiles.map(({id,x,y,z,kind})=>({id,x,y,z,kind}))||[]};}
  sync(p){this.survey(p);const s=this.snapshot(p);if(s){this.send(p.id,s);this.send(p.id,this.motion(p));if(this.outcome)this.send(p.id,{type:'party-result',...this.outcome});}}
  input(p,m){if(this.outcome)return;if(m.forward||m.strafe)this.cancelRevive(p);if(!p.body||p.hp<=0||p.transition)return;p.input={forward:Math.max(-1,Math.min(1,Number(m.forward)||0)),strafe:Math.max(-1,Math.min(1,Number(m.strafe)||0)),yaw:Number.isFinite(m.yaw)?m.yaw:0,run:!!m.run,crouch:!!m.crouch,defend:!!m.defend};p.inputAt=this.time;}
  async transition(p,key){
    if(this.outcome||p.transition||p.hp<=0)return;this.cancelRevive(p);
    const f=this.floors.get(p.depth),type=key==='>'?'stairs_down':'stairs_up';
    if(!f.source.tiles.some(t=>t.type===type&&Math.hypot((t.x+.5)*CELL-p.body.x,(t.y+.5)*CELL-p.body.z)<3))throw Error('Reach the stairs first.');
    const link=(f.source.connections||[]).filter(c=>c.up===(key==='<')&&Math.hypot((c.x+.5)*CELL-p.body.x,(c.y+.5)*CELL-p.body.z)<3).sort((a,b)=>Math.hypot((a.x+.5)*CELL-p.body.x,(a.y+.5)*CELL-p.body.z)-Math.hypot((b.x+.5)*CELL-p.body.x,(b.y+.5)*CELL-p.body.z))[0];
    if(f.source.connections&&!link)throw Error('There is no passage here.');
    const route=link?this.campaign.connection(p,link):{destination:Number(p.depth)+(key==='>'?1:-1)};
    if(!link&&(!Number.isFinite(route.destination)||route.destination<1))throw Error('Recover the Amulet of Yendor before leaving the dungeon.');
    const travelers=route.party?[...this.players.values()].filter(x=>x.connected):[p];
    if(route.party&&travelers.some(x=>x.depth!==p.depth||x.hp<=0||x.transition||distance(x.body,p.body)>8))throw Error('Gather every connected companion, alive and within eight metres, before entering the Planes.');
    for(const x of travelers){this.cancelRevive(x);x.transition=true;x.input={};this.send(x.id,this.motion(x));}
    try{
      const next=await this.floor(route.destination);if(this.outcome)return;
      if(route.planes)this.campaign.state.planes=true;
      const back=next.source.connections?.find(c=>c.to===f.nativeId&&c.kind==='stairs'),entry=back?{x:back.x,y:back.y}:next.source.connections?{x:next.source.player.x,y:next.source.player.y}:key==='>'?'stairs_up':'stairs_down';
      for(const x of travelers){x.depth=next.depth;x.body=this.spawn(next,entry);x.body.id=x.id;x.stairCooldown=this.time+2;x.prompt=null;this.send(x.id,{type:'clearPrompt'});}
      this.notify(`${p.name}${route.party?' and the party':''} reached ${next.source.player.dungeon}, depth ${next.source.player.depth}.`);
    }finally{for(const x of travelers){x.transition=false;this.sync(x);}this.roster();this.save(this);}
  }
  status(p,id,status,reason){this.send(p.id,{type:'action-status',id,status,reason});}
  async action(p,m){
    if(this.outcome)return this.status(p,m.id,'rejected','This expedition has ended. Start a new game.');if(m.key!=='#revive')this.cancelRevive(p);if(!p.body||p.transition)return this.status(p,m.id,'rejected','Wait for the stairs.');
    if(typeof m.id!=='string'||m.id.length>100)return;
    p.actions??=new Set();if(p.actions.has(m.id))return this.status(p,m.id,'rejected','This action was already processed.');p.actions.add(m.id);if(p.actions.size>256)p.actions.delete(p.actions.values().next().value);
    try{
      if(m.key==='S'){if(this.save(this)===false)throw Error('Party save failed. Check the server storage.');this.status(p,m.id,'started');this.send(p.id,{type:'notice',text:'Party saved. All characters, equipment and explored floors are stored on the server.'});return;}
      if(p.hp<=0)throw Error('You are downed. A nearby ally can revive you from the Party menu.');
      if(this.time-p.lastAction<.15)throw Error('Wait a moment between actions.');
      p.lastAction=this.time;
      if(m.melee){
        if(this.time-p.attackAt<.5)throw Error('Your weapon is still recovering.');
        p.attackAt=this.time;
        const f=this.floors.get(p.depth),id=meleeTarget(p.body,f.sim.actors.values(),Number.isFinite(m.yaw)?m.yaw:p.input.yaw||0,f.sim.world);
        if(id)this.hit(p,f.sim.actors.get(id),(p.inventory.find(i=>i.equipped&&i.kind==='weapon')?.damage||CLASSES[p.role].damage)+Math.floor(p.level/2));
      }else if(Number.isInteger(m.pickup))this.pickup(p,m.pickup);
      else if(m.key==='>'||m.key==='<'){this.status(p,m.id,'started');await this.transition(p,m.key);return;}
      else this.command(p,String(m.key||'.'),m);
      this.status(p,m.id,'started');this.syncFloor(p.depth);
    }catch(error){this.status(p,m.id,'rejected',error.message);}
  }
  syncFloor(depth){this.revision++;for(const p of this.players.values())if(p.connected&&p.depth===depth)this.sync(p);}
  pickup(p,id){
    const f=this.floors.get(p.depth),o=lootPositions(f.objects,f.sim.world).find(o=>o.id===id);
    if(!o||distance(p.body,{x:o.worldX,y:o.worldY,z:o.worldZ})>2.05||!f.sim.world.lineClear(p.body,{x:o.worldX,z:o.worldZ},.02))throw Error('That item is gone or out of reach.');
    if(/chest|large box|ice box/.test(o.name)){this.loot(p,o);return;}
    if(p.inventory.length>=52&&o.symbol!=='$')throw Error('Your inventory is full.');
    const item=f.objects.splice(f.objects.findIndex(i=>i.id===id),1)[0];
    if(item.symbol==='$')p.gold+=item.quantity;else {delete item.x;delete item.y;item.equipped=false;p.inventory.push(item);this.keys(p);}
    this.campaign?.acquired(item);this.send(p.id,{type:'item-picked-up',name:item.name});
  }
  prompt(p,key,items,title){p.prompt={key,ids:items.map(i=>i.id),depth:p.depth};this.send(p.id,{type:'prompt',kind:'menu',how:1,prompt:title,aiming:['Z','z','t','f'].includes(key),items:items.map(i=>({id:i.id,key:i.key,text:i.name,selectable:true}))});}
  answer(p,m){const request=p.prompt;p.prompt=null;this.send(p.id,{type:'clearPrompt'});const id=m.input?.value?.[0];if(!request||request.depth!==p.depth||!request.ids.includes(id))return;try{if(p.hp<=0||p.transition)throw Error('You cannot act right now.');if(this.time-(p.lastUse||-1)<.35)throw Error('Your action is still recovering.');this.command(p,request.key,{itemId:id,aim:m.aim});p.lastUse=this.time;this.syncFloor(p.depth);}catch(error){this.send(p.id,{type:'notice',text:error.message});}}
  command(p,key,m={}){
    if(this.outcome)throw Error('This expedition has ended. Start a new game.');
    if(key!=='#revive')this.cancelRevive(p);
    const f=this.floors.get(p.depth),verb=key.startsWith('#')?key:key[0];
    if(['o','c'].includes(verb)){
      const t=f.source.tiles.find(t=>t.x===m.targetCell?.x&&t.y===m.targetCell?.z);
      if(!t||Math.hypot((t.x+.5)*CELL-p.body.x,(t.y+.5)*CELL-p.body.z)>3.7||!['door','door_open'].includes(t.type))throw Error('Face a nearby door.');
      if(verb==='c'&&[...this.players.values()].some(x=>x.depth===p.depth&&x.body&&Math.hypot(x.body.x-(t.x+.5)*CELL,x.body.z-(t.y+.5)*CELL)<1.5))throw Error('Someone is in the doorway.');
      t.type=verb==='o'?'door_open':'door';f.sim.world.setTiles(f.source.tiles);f.sim.routes.clear();return;
    }
    if(verb==='#chat'){this.campaign.chat(p);return;}if(verb==='#invoke'){this.campaign.invoke(p);return;}
    if(verb==='#revive'){
      const ally=[...this.players.values()].find(x=>x!==p&&x.depth===p.depth&&x.hp<=0&&x.connected&&distance(p.body,x.body)<2.2&&f.sim.world.lineClear(p.body,x.body,.02));
      if(p.revive){this.cancelRevive(p);return;}
      if(!ally)throw Error('Stand within two metres of a fallen ally.');
      p.input={yaw:p.input.yaw||0};p.revive={targetId:ally.id,startedAt:this.time,origin:{...p.body}};return;
    }
    if(verb==='#showspells'||verb==='Z'){
      if(verb==='#showspells'||m.itemId===undefined){this.prompt(p,'Z',[{id:-1,key:'a',name:CLASSES[p.role].spell}],'Known spells — 6 power');return;}
      this.cast(p,m.aim);return;
    }
    if(verb==='#offer'&&this.campaign?.offer(p))return;
    if(verb==='#pray'||verb==='#offer'){
      if(!f.source.tiles.some(t=>t.type==='altar'&&Math.hypot((t.x+.5)*CELL-p.body.x,(t.y+.5)*CELL-p.body.z)<2))throw Error('Stand beside an altar.');
      if(verb==='#offer'){const corpse=f.objects.find(o=>/corpse/.test(o.name)&&Math.hypot((o.x+.5)*CELL-p.body.x,(o.y+.5)*CELL-p.body.z)<2);if(!corpse)throw Error('Drop a corpse onto the altar first.');f.objects.splice(f.objects.indexOf(corpse),1);}
      else if(this.time<(p.prayAt||0))throw Error('Your deity asks you to wait.');
      p.prayAt=this.time+60;p.hp=p.maxHp;p.power=p.maxPower;this.notify(`${p.name} is restored by the altar.`);return;
    }
    if(verb==='s'){for(const t of visibleMapTiles(f.source.tiles,p.body,7)){if(t.secretDoor){t.type='door';t.secretDoor=false;}if(t.secretCorridor){t.type='corridor';t.secretCorridor=false;}}f.sim.world.setTiles(f.source.tiles);f.sim.routes.clear();this.survey(p);return;}
    if(verb==='#dig'){
      if(!p.inventory.some(i=>/pick-axe|mattock|wand of digging/.test(i.name)))throw Error('Carry a pick-axe, mattock or wand of digging.');
      if(this.time<(p.digAt||0))throw Error('Your digging tool is still recovering.');
      const yaw=p.input.yaw||0,cell=m.targetCell||{x:Math.floor((p.body.x-Math.sin(yaw)*CELL)/CELL),z:Math.floor((p.body.z-Math.cos(yaw)*CELL)/CELL)},t=f.source.tiles.find(t=>t.x===cell.x&&t.y===cell.z);
      if(!t||Math.hypot((t.x+.5)*CELL-p.body.x,(t.y+.5)*CELL-p.body.z)>4.5||!['stone','wall','door','bars'].includes(t.type))throw Error('Face nearby rock, a door or bars to dig.');
      if(t.diggable===false&&!t.secretDoor)throw Error('This wall resists digging. Search for a passage.');
      t.type='corridor';t.secretDoor=false;t.secretCorridor=false;p.digAt=this.time+1.5;f.sim.world.setTiles(f.source.tiles);f.sim.routes.clear();return;
    }
    if(verb==='x'){const weapons=p.inventory.filter(i=>i.symbol===')');if(weapons.length<2)throw Error('You need another weapon.');const at=weapons.findIndex(i=>i.equipped);weapons.forEach(i=>i.equipped=false);weapons[(at+1)%weapons.length].equipped=true;return;}
    if(verb===','||verb==='#loot'){const o=lootPositions(f.objects,f.sim.world).find(o=>distance(p.body,{x:o.worldX,y:o.worldY,z:o.worldZ})<2);if(!o)throw Error('No item is within reach.');this.pickup(p,o.id);return;}
    if(verb==='.')return;
    const allowed={w:')',W:'[',T:'[',d:null,q:'!',e:'%',r:'?',z:'/',a:'(',f:')',t:null};
    if(!Object.hasOwn(allowed,verb))throw Error('That native command is unavailable in cooperative mode. Use the cooperative command list.');
    const valid=p.inventory.filter(i=>!allowed[verb]||i.symbol===allowed[verb]);
    const item=Number.isInteger(m.itemId)?valid.find(i=>i.id===m.itemId):key.length===2?valid.find(i=>i.key===key[1]):null;
    if(m.itemId!==undefined&&!item)throw Error('That item is no longer in your inventory.');
    if(!item){if(!valid.length)throw Error('You have no suitable item.');this.prompt(p,verb,valid,'Choose an item');return;}
    if(item.campaignItem&&!['d','w','W','T','a','t'].includes(verb))throw Error('This campaign artifact cannot be consumed or fired as ammunition. Use its campaign action in the Party menu.');
    if(verb==='d'){p.inventory.splice(p.inventory.indexOf(item),1);f.objects.push({...item,equipped:false,x:Math.floor(p.body.x/CELL),y:Math.floor(p.body.z/CELL)});}
    if(verb==='w'){p.inventory.filter(i=>i.symbol===')').forEach(i=>i.equipped=false);item.equipped=true;item.kind='weapon';}
    if(verb==='W'){p.inventory.filter(i=>i.symbol==='['&&(i.armorSlot||0)===(item.armorSlot||0)).forEach(i=>i.equipped=false);item.equipped=true;}
    if(verb==='T')item.equipped=false;
    if(verb==='q'){p.hp=Math.min(p.maxHp,p.hp+20);this.consume(p,item);}
    if(verb==='e'){p.hunger=Math.min(1200,p.hunger+400);p.hp=Math.min(p.maxHp,p.hp+4);this.consume(p,item);}
    if(verb==='r'){p.power=p.maxPower;this.command(p,'s');this.consume(p,item);}
    if(verb==='a'){if(/pick-axe|mattock/.test(item.name))this.command(p,'#dig',m);else if(/chest|box|bag/.test(item.name)){p.inventory.push(this.item('potion of healing','potion'));this.consume(p,item);}else {this.command(p,'s');this.send(p.id,{type:'notice',text:'You survey the area with your tool.'});}}
    if(['f','t','z'].includes(verb)){
      if(verb==='z'){if((item.charges??8)<=0)throw Error('The wand has no charges left.');item.charges=(item.charges??8)-1;}else this.consume(p,item);
      this.projectile(p,verb==='z'?'spell':'arrow',item.damage||7,m.aim,verb==='t'?{...item,quantity:1,equipped:false}:null);
    }
    this.keys(p);
  }
  consume(p,item){if(--item.quantity<=0)p.inventory.splice(p.inventory.indexOf(item),1);this.keys(p);}
  loot(p,item){const f=this.floors.get(p.depth);if(item.opened)throw Error('The container is empty.');const original=f.objects.find(o=>o.id===item.id);original.opened=true;for(const o of [this.item('potion of healing','potion'),this.item('food ration','food')])f.objects.push({...o,x:item.x,y:item.y});this.notify(`${p.name} opened ${item.name}.`);}
  cast(p,aim){
    if(p.power<6)throw Error('You need 6 power.');if(this.time-(p.castAt??-10)<1)throw Error('Your spell is recovering.');p.power-=6;p.castAt=this.time;p.attackAt=this.time;
    const spell=CLASSES[p.role].spell,f=this.floors.get(p.depth);
    if(/Healing|Rally/.test(spell)){for(const ally of this.players.values())if(ally.connected&&ally.depth===p.depth&&ally.hp>0&&distance(p.body,ally.body)<7)ally.hp=Math.min(ally.maxHp,ally.hp+14+p.level);}
    else if(/War cry|Flash|Entangle/.test(spell)){for(const a of f.sim.actors.values())if(distance(p.body,a)<7&&f.sim.world.lineClear(p.body,a,.02)){a.stunnedUntil=this.time+4;if(spell==='War cry')this.hit(p,a,8+p.level);}}
    else if(spell==='Survey')this.command(p,'s');
    else if(spell==='Shadow step')p.invulnerableUntil=this.time+4;
    else this.projectile(p,'spell',12+p.level*2,aim);
    this.send(p.id,{type:'player-effect',kind:'spell'});
  }
  projectile(p,kind,damage,aim,drop){const dirs={k:0,y:Math.PI/4,h:Math.PI/2,b:Math.PI*3/4,j:Math.PI,n:-Math.PI*3/4,l:-Math.PI/2,u:-Math.PI/4};const yaw=dirs[aim]??p.input.yaw??0;this.floors.get(p.depth).projectiles.push({id:this.nextId++,owner:p.id,x:p.body.x,y:p.body.y+.9,z:p.body.z,dx:-Math.sin(yaw),dz:-Math.cos(yaw),life:1.8,damage,kind,drop});p.attackAt=this.time;}
  hit(p,a,damage){
    if(!a||a.data.hp<=0)return;a.data.peaceful=false;a.data.tame=false;a.data.sleeping=false;a.alertUntil=this.time+12;a.data.hp=Math.max(0,a.data.hp-damage);
    this.broadcast({type:'feedback',events:[{kind:'actor-hit',actorId:a.id,dead:a.data.hp<=0}]},p.depth);
    if(a.data.hp<=0){
      if(a.data.name===this.campaign?.state.native?.questNemesis)this.campaign.state.nemesisDefeated=true;
      const f=this.floors.get(p.depth);f.sim.actors.delete(a.id);for(const item of a.data.loot||[])f.objects.push({...item,id:this.nextId++,equipped:false,x:Math.floor(a.x/CELL),y:Math.floor(a.z/CELL)});
      f.objects.push(this.item(`${a.data.name||'creature'} corpse`,'food',{x:Math.floor(a.x/CELL),y:Math.floor(a.z/CELL)}));
      for(const ally of this.players.values())if(ally.connected&&ally.depth===p.depth&&ally.hp>0){ally.experience+=Math.max(5,(a.data.level||1)*6);if(ally.experience>=20*ally.level*ally.level){ally.level++;ally.maxHp+=6;ally.hp=Math.min(ally.maxHp,ally.hp+10);ally.maxPower+=3;}}
    }
  }
  hurt(p,damage){if(this.outcome)return;if(this.time<(p.invulnerableUntil||0)||p.hp<=0)return;this.cancelRevive(p);p.hp=Math.max(0,p.hp-damage);this.send(p.id,{type:'feedback',events:[{kind:'player-hit',amount:damage}]});if(!p.hp){p.input={};p.prompt=null;this.send(p.id,{type:'clearPrompt'});this.notify(`${p.name} is down! Stand nearby and choose Revive ally in the Party menu.`);}}
  cancelRevive(p){if(p)p.revive=null;}
  reviveState(p){return p.revive?{targetId:p.revive.targetId,progress:Math.min(1,(this.time-p.revive.startedAt)/10),remaining:Math.max(0,10-this.time+p.revive.startedAt)}:null;}
  updateRevives(){
    for(const p of this.players.values())if(p.revive){
      const ally=this.players.get(p.revive.targetId),f=this.floors.get(p.depth);
      if(this.outcome||!p.connected||p.hp<=0||!ally?.connected||ally.hp>0||p.depth!==ally.depth||p.transition||distance(p.body,p.revive.origin)>.12||distance(p.body,ally.body)>2.2||!f.sim.world.lineClear(p.body,ally.body,.02)){this.cancelRevive(p);continue;}
      if(this.time-p.revive.startedAt>=10){ally.hp=Math.ceil(ally.maxHp*.35);ally.invulnerableUntil=this.time+3;this.cancelRevive(p);this.notify(`${p.name} revived ${ally.name}.`);this.syncFloor(p.depth);}
    }
  }
  finish(status,text){
    if(this.outcome)return;this.outcome={status,text,time:this.time};
    for(const p of this.players.values()){p.input={};p.prompt=null;p.revive=null;p.transition=false;}
    this.notify(text);this.broadcast({type:'party-result',...this.outcome});this.save(this);
  }
  checkWipe(){const members=[...this.players.values()].filter(p=>p.body);if(members.length&&members.every(p=>p.hp<=0))this.finish('defeat','The entire party has fallen. This expedition is over. Create a new party to begin again.');}
  tick(dt){
    if(this.outcome||![...this.players.values()].some(p=>p.connected&&p.body))return;this.time+=dt;
    for(const f of this.floors.values()){
      const players=[...this.players.values()].filter(p=>p.connected&&p.depth===f.depth&&p.body&&!p.transition),alive=players.filter(p=>p.hp>0),bodies=players.map(p=>p.body),actors=[...f.sim.actors.values()];
      if(!players.length)continue;
      for(const p of players){
        p.moving=false;if(p.hp<=0)continue;
        if(this.time-p.inputAt>.3)p.input={yaw:p.input.yaw||0};
        advanceJump(p.body,dt);const old={...p.body};integratePlayer(f.sim.world,p.body,p.input,dt,[...actors,...bodies.filter(b=>b!==p.body)]);p.moving=distance(old,p.body)>.001;
        if(this.time>(p.stairCooldown||0))for(const stair of f.sim.world.stairs)if(stairFinished(stair,p.body)){p.stairCooldown=this.time+3;this.transition(p,stair.sign>0?'<':'>').catch(e=>this.send(p.id,{type:'notice',text:e.message}));break;}
        p.power=Math.min(p.maxPower,p.power+dt*.35);p.hunger=Math.max(0,p.hunger-dt*.6);
        if(!this.campaign?.state.invoked&&!p.invocationNoticed&&f.source.tiles.some(t=>t.campaignMarker&&Math.hypot((t.x+.5)*CELL-p.body.x,(t.y+.5)*CELL-p.body.z)<5)){p.invocationNoticed=true;this.send(p.id,{type:'notice',text:'The ground vibrates beneath you. Gather the three invocation tools here and choose Perform invocation in Party.'});}
        const tile=f.sim.world.at(p.body.x,p.body.z);if(tile?.type==='lava'&&this.time>(p.hazardAt||0)){p.hazardAt=this.time+1;this.hurt(p,8);}
        if(tile?.type==='trap'&&this.time>(p.hazardAt||0)&&!p.body.jumpOffset){p.hazardAt=this.time+3;this.hurt(p,4);}
        if(!p.hunger&&this.time>(p.starveAt||0)){p.starveAt=this.time+5;this.hurt(p,1);}
        if(Math.floor(this.time*4)!==p.sightTick){p.sightTick=Math.floor(this.time*4);this.survey(p);}
      }
      for(const a of actors){
        a.moving=false;if(!alive.length||a.data.sleeping||!a.data.canMove||this.time<(a.stunnedUntil||0))continue;
        const p=alive.reduce((best,p)=>!best||distance(p.body,a)<distance(best.body,a)?p:best,null),range=distance(a,p.body);
        if(a.data.peaceful&&!a.data.tame)continue;
        if(range<18&&f.sim.world.lineClear(a,p.body,.04)){a.alertUntil=this.time+12;a.lastKnown={...p.body};}
        if(!a.data.stationary&&range>(a.data.tame?2:1.25)&&range<36&&(a.data.tame||a.alertUntil>this.time)){
          const target=f.sim.waypoint(a,a.data.tame?p.body:a.lastKnown||p.body),dx=target.x-a.x,dz=target.z-a.z,length=Math.hypot(dx,dz);
          if(length>.05){const step=Math.min(length,Math.min(8.5,(a.data.speed||12)/12*4.2)*dt),old={...a};f.sim.world.move(a,dx/length*step,dz/length*step,[...actors,...bodies]);a.moving=distance(a,old)>.001;a.yaw=Math.atan2(dx,dz);}
        }
        if(!a.data.peaceful&&range<1.85+(a.radius||.3)*.4&&Math.abs(a.y-p.body.y)<1.8&&f.sim.world.lineClear(a,p.body,.04)&&this.time>a.attackAt){
          a.attackAt=this.time+.9;const armor=p.inventory.filter(i=>i.equipped&&i.symbol==='[').reduce((n,i)=>n+(i.armor||1),0),guard=p.input.defend?3:0;
          this.hurt(p,Math.max(1,Math.round((2+(a.data.level||1))*f.damageScale-armor*.35-guard)));this.broadcast({type:'actor-attack',actorId:a.id},f.depth);
        }
      }
      for(const shot of [...f.projectiles]){
        shot.life-=dt;const old={x:shot.x,z:shot.z},next={x:shot.x+shot.dx*16*dt,z:shot.z+shot.dz*16*dt};
        if(!f.sim.world.lineClear(old,next,.04))shot.life=0;else {shot.x=next.x;shot.z=next.z;}
        const target=actors.find(a=>distance({x:shot.x,y:shot.y-.9,z:shot.z},a)<(a.radius||.4)+.3);
        if(target&&shot.life>0){const owner=this.players.get(shot.owner);if(owner)this.hit(owner,target,shot.damage);shot.life=0;}
        if(shot.life<=0){f.projectiles.splice(f.projectiles.indexOf(shot),1);if(shot.drop)f.objects.push({...shot.drop,id:this.nextId++,x:Math.floor(shot.x/CELL),y:Math.floor(shot.z/CELL)});}
      }
    }
    this.checkWipe();if(!this.outcome)this.updateRevives();
  }
  serialize(){return {version:1,code:this.code,outcome:this.outcome||null,campaign:this.campaign?.state,time:this.time,nextId:this.nextId,revision:this.revision,log:this.log,hostId:this.hostId,players:[...this.players.values()].map(({actions,...p})=>({...p,connected:false,voiceEnabled:false,input:{},prompt:null,revive:null,transition:false,seen:[...p.seen]})),floors:[...this.floors.values()].map(f=>({depth:f.depth,nativeId:f.nativeId,source:f.source,objects:f.objects,projectiles:f.projectiles,actors:[...f.sim.actors.values()]}))};}
  restore(data){
    if(data.version!==1||data.code!==this.code)throw Error('Unsupported party save.');if(!data.campaign)throw Error('This older party save predates shared campaigns. Create a new party to play the ascension campaign.');Object.assign(this,{time:data.time,nextId:data.nextId,revision:data.revision,log:data.log,outcome:data.outcome||null});
    if(data.campaign){this.campaign=new PartyCampaign(this,data.campaign.owner);this.campaign.state=data.campaign;this.generator.setCharacter?.(data.campaign.owner);}
    this.players=new Map(data.players.map(p=>[p.id,{...p,body:{...p.body,id:p.id},connected:false,input:{},seen:new Set(p.seen)}]));
    for(const f of data.floors){const sim=new SpatialSimulation();sim.accept(f.source);sim.actors=new Map(f.actors.filter(a=>!a.data.tame).map(a=>[a.id,a]));this.floors.set(f.depth,{...f,sim,projectiles:f.projectiles||[]});}
    // Older saves already contain a private exploration set for each hero.
    // Upgrade only those recorded cells, never the whole generated dungeon.
    for(const p of this.players.values())if(!p.cartography)for(const f of this.floors.values())rememberMapTiles(p,f.depth,f.source.tiles.filter(t=>p.seen.has(`${f.depth}:${t.x},${t.y}`)),f.source.tiles);
    this.rescale();
  }
}
