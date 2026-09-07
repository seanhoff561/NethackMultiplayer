// NetHack: Descent modification, 2026-09-07. Distributed under dat/license.
import { DungeonRenderer } from './renderer.js';
import { DungeonAudio } from './audio.js';
import { GameUI } from './ui.js';
import {targetLoot} from './loot.js';
import {GameInput,COMMAND_KEYS} from './input.js';
let input,actionSequence=0;
const pendingActions=new Map();
import {CollisionWorld,integratePlayer,CELL} from './spatial.js';
let collision=new CollisionWorld(),body=null,motion=null,collisionSignature='';

const canvas=document.querySelector('#game');
let renderer;
try {renderer=new DungeonRenderer(canvas);} catch(error) {
  document.body.innerHTML='<main style="color:#e8dcc0;background:#151713;padding:4rem;font:20px Georgia">NetHack: Descent needs WebGL 2. Enable hardware acceleration in your browser and restart.<pre></pre></main>';
  document.querySelector('pre').textContent=error.message;throw error;
}
const audio=new DungeonAudio();
const stored=(()=>{try{return JSON.parse(localStorage.getItem('descent.settings'))||{};}catch{return {};}})();
const settings={volume:0.55,sensitivity:1,pulseTime:0.8,...stored};
let socket,world=null,playing=false,pendingPrompt=null,commands=[],connected=false,lastHp=null,lastPower=null,lastLevel=null,lastMessageCount=0;
let yaw=0,pitch=0,lastAction=0,lastStep=0,lastTime=performance.now(),movementTime=0;
let pose={x:4.5,y:7.5,yaw:0,pitch:0,crouch:false,moving:false,running:false};
const ui=new GameUI({
  onStart:character=>{audio.start();send({type:'start',character});ui.setEngineStatus('Entering the Dungeons of Doom…',false);},
  onContinue:()=>{audio.start();send({type:'continue'});},
  onCommand:(key,itemKey,itemId)=>command(typeof key==='string'?key:key.key,itemKey,undefined,itemId),
  onKey:key=>answer({kind:'key',value:key}),
  onText:value=>answer({kind:pendingPrompt?.kind==='extcmd'?'extcmd':'text',value}),
  onMenu:selection=>{
    if(selection.cancelled){send({type:'cancel'});return;}
    answer({kind:'menu',value:selection.selected||[]});
  },
  onSettings:value=>{Object.assign(settings,value);localStorage.setItem('descent.settings',JSON.stringify(settings));audio.setVolume?.(settings.volume);send({type:'settings',...settings});},
  onClose:()=>{pendingPrompt=null;send({type:'cancel'});input?.clear();capture();},
  onPanel:()=>unlock(),
  onFullscreen:()=>toggleFullscreen(),
});
audio.setVolume?.(settings.volume);

function send(message){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}
function unlock(){if(document.pointerLockElement)document.exitPointerLock();input?.clear();send({type:'release'});}
function capture(){if(playing&&!ui.hasPanel){canvas.focus({preventScroll:true});canvas.requestPointerLock?.().catch?.(()=>ui.setPointerLocked(false));}}
async function toggleFullscreen(){
  try {if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{ui.message('Fullscreen is unavailable here. Open the game window or press F11 in your browser.');}
}
function action(message){const id=`${clientId}:${++actionSequence}`;pendingActions.set(id,message);send({type:'action',id,...message});}
const clientId=Math.random().toString(36).slice(2);
function answer(input){if(input.value==='Escape'){send({type:'cancel'});}else send({type:'answer',input});pendingPrompt=null;ui.closePanels(false);capture();}
function direction(dx,dy){return ({'-1,-1':'y','0,-1':'k','1,-1':'u','-1,0':'h','1,0':'l','-1,1':'b','0,1':'j','1,1':'n'})[`${Math.sign(dx)},${Math.sign(dy)}`]||'.';}
function facing(){const dirs=[[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1]];return dirs[((Math.round(yaw/(Math.PI/4))%8)+8)%8];}
function aim(){return direction(...facing());}
function command(key,itemKey,targetCell,itemId) {
  if(!key||!playing)return;
  if(key===','){const item=targetLoot(world?.floorObjects,body,yaw,collision);if(item){ui.closePanels(false);action({key:'.',pickup:item.id});capture();return;}}
  if(key==='i'||key==='#inventory'){unlock();ui.showInventory(world?.inventory||[]);return;}
  if(key==='#commands'||key==='#'){unlock();ui.showCommands(commands);return;}
  ui.closePanels(false);pendingPrompt=null;
  action({key:itemKey?key+itemKey:key,aim:aim(),targetCell,itemId});capture();
}
function nearbyDoor(){
  if(!body)return null;
  for(let d=.15;d<2.1;d+=.1){const t=collision.at(body.x-Math.sin(yaw)*d,body.z-Math.cos(yaw)*d);if(t?.type==='door')return t;}
  return null;
}
function interact(){
  const loot=targetLoot(world?.floorObjects,body,yaw,collision);if(loot){command(',');return;}
  const door=nearbyDoor();if(door){command('o',null,{x:door.x,z:door.y});return;}

  const [dx,dy]=facing(),p=body?{x:Math.floor(body.x/CELL),y:Math.floor(body.z/CELL)}:world?.player;if(!p)return;
  const ahead=world.tiles.find(t=>t.x===p.x+dx&&t.y===p.y+dy);
  const here=world.tiles.find(t=>t.x===p.x&&t.y===p.y);
  if(ahead?.type==='door')command('o');
  else if(here?.type==='stairs_down'||here?.type==='stairs_up')ui.message('Walk into the left flight, turn at the landing, and follow the stairs to the next floor.');
  else if(here?.object)command(',');
  else if(ahead?.monster)command('#chat');
  else command(',');
}
function attack(){
  if(!playing||ui.hasPanel||!connected||[...pendingActions.values()].some(a=>a.melee))return;
  action({key:'.',melee:true,yaw});
}
function handleAction(name){
  if(name==='fullscreen'){toggleFullscreen();return;}
  if(name==='attack')attack();
  else if(name==='inventory')command('i');
  else if(name==='commands')command('#commands');
  else if(name==='interact')interact();
  else if(name==='release')unlock();
  else if(COMMAND_KEYS[name])command(COMMAND_KEYS[name]);
}
input=new GameInput({context:()=>ui.panel?'menu':playing?'game':'title',menu:e=>ui.handleKey(e),onAction:handleAction,onRelease:()=>send({type:'release'})});
canvas.tabIndex=-1;


function connect(){
  socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);
  socket.addEventListener('open',()=>{connected=true;send({type:'settings',...settings});});
  socket.addEventListener('close',()=>{connected=false;pendingActions.clear();input.reset();ui.message('Connection lost. Reconnecting to your expedition…');setTimeout(connect,1500);});
  socket.addEventListener('message',event=>{
    let data;try{data=JSON.parse(event.data);}catch{return;}
    if(data.type==='hello'){
      commands=data.commands||[];ui.setEngineStatus(data.ready?'The dungeon awaits.':'Native engine is building…',data.ready);
      document.querySelector('#continue-game').hidden=!data.canContinue&&!data.running;
      if(data.running){playing=true;ui.setMode('game');}
      return;
    }
    if(data.type==='action-status'){
      if(data.status==='started'){const a=pendingActions.get(data.id);if(a?.melee){renderer.attack('melee');audio.attack();}pendingActions.delete(data.id);}
      else if(data.status==='rejected'||data.status==='cancelled'){pendingActions.delete(data.id);if(data.reason)ui.message(data.reason);}
      return;
    }
    if(data.type==='player-effect'){renderer.attack(data.kind);audio.attack(data.kind);return;}
    if(data.type==='item-picked-up'){audio.pickup(data.name);ui.toast(`Picked up ${data.name}`);return;}
    if(data.type==='actor-defeated'){if(renderer.hitActor(data.actorId,true)){audio.impact();ui.confirmHit();}return;}
    if(data.type==='feedback'){
      for(const e of data.events||[]){
        if(e.kind==='actor-hit'){if(renderer.hitActor(e.actorId,e.dead)){audio.impact();ui.confirmHit();}}
        if(e.kind==='player-hit'){audio.hit();renderer.attack('hit');ui.damage(e.amount);}
        if(e.kind==='pickup'){audio.pickup(e.name);ui.toast(`Picked up ${e.name}`);}
        if(e.kind==='door')audio.door();
      }return;
    }
    if(data.type==='starting'){pendingActions.clear();playing=false;world=null;lastHp=null;lastPower=null;lastLevel=null;lastMessageCount=0;ui.setMode('loading');return;}
    if(data.type==='motion'){
      if(!data.player||data.levelId!==lastLevel)return;
      if(!motion&&Number.isFinite(data.spawnYaw))yaw=data.spawnYaw;
      motion=data;const p=data.player;
      if(!body||Math.hypot(body.x-p.x,body.z-p.z)>.65||data.blocked||data.transition)body={...p};
      else {body.x+=(p.x-body.x)*.35;body.z+=(p.z-body.z)*.35;body.y=collision.support(body.x,body.z)??p.y;}
      renderer.setMotion(data);document.body.classList.toggle('floor-transition',data.transition&&!pendingPrompt);return;
    }
    if(data.type==='snapshot'){
      if(!data.player || !Number.isFinite(data.player.x))return;
      world=normalize(data);const p=world.player;
      const level=world.levelId||`${p.dungeon}:${p.depth}`;
      const signature=level+world.tiles.map(t=>`${t.x},${t.y},${t.type}`).join(';');
      if(signature!==collisionSignature){collision.setTiles(world.tiles);collisionSignature=signature;}
      if(lastLevel!==level){
        body=collision.spawn(p.x,p.y);motion=null;
        pose.x=p.x+.5;pose.y=p.y+.5;
        if(lastLevel===null){
          // Face the most open nearby direction upon entering the dungeon.
          let best=-1,bestYaw=0;
          for(let i=0;i<8;i++){const a=i*Math.PI/4,dx=Math.round(-Math.sin(a)),dy=Math.round(-Math.cos(a));let score=0;
            for(let n=1;n<=7;n++){const t=world.tiles.find(t=>t.x===p.x+dx*n&&t.y===p.y+dy*n);if(!t||['wall','unknown','door'].includes(t.type))break;score++;}
            if(score>best){best=score;bestYaw=a;}}
          const entry=collision.stairs.find(s=>s.cellX===p.x&&s.cellZ===p.y);
          yaw=entry?entry.angle+Math.PI:bestYaw;
        }
      }
      if(lastLevel!==null&&lastLevel!==level){const entry=collision.stairs.find(s=>s.cellX===p.x&&s.cellZ===p.y);if(entry)yaw=entry.angle+Math.PI;}
      lastLevel=level;

      if(lastPower!==null&&p.power<lastPower){renderer.attack('spell');audio.spell();}lastPower=p.power;
      lastHp=p.hp;renderer.setWorld(world);ui.update({...world,heading:-yaw,yaw});
      if(!playing&&p.hp>0){playing=true;ui.setMode('game');ui.message('You descend into the Dungeons of Doom. Click the view to look around.');send({type:'settings',...settings});}
      if(p.hp<=0&&playing){playing=false;unlock();ui.showDeath(world.messages?.slice(-4).map(m=>typeof m==='string'?m:m.text).join('\n')||'Your expedition has ended.');}
      return;
    }
    if(data.type==='prompt'){
      pendingPrompt=data;unlock();
      if(data.kind==='display')ui.showMenu({id:'document',title:'Dungeon chronicle',items:(data.prompt||'').split('\n').map((text,i)=>({id:i,text,selectable:false})),readOnly:true});
      else if(data.kind==='menu') ui.showMenu({id:data.id||'engine',title:data.prompt||'Choose an action',items:(data.items||[]).map(i=>({...i,text:i.text??i.name})),multiple:data.how===2||data.multiple,readOnly:data.how===0});
      else {
        const directional=/direction|where|position|pick a location/i.test(data.prompt||'');
        const choices=data.choices|| (directional?'hjklyubn.<>':(world?.inventory||[]).map(i=>({key:i.key,text:i.name})).concat([{key:'?',text:'Show valid choices'},{key:'*',text:'Show all items'},{key:'-',text:'None / bare hands'},{key:'\r',text:'Continue'}]));
        ui.showPrompt({text:data.prompt|| 'NetHack awaits your response.',choices,default:typeof data.default==='number'?String.fromCharCode(data.default):data.default,type:['text','extcmd'].includes(data.kind)?'text':'yn'});
      }
      return;
    }
    if(data.type==='clearPrompt'){if(pendingPrompt){pendingPrompt=null;ui.closePanels(false);}return;}
    if(data.type==='document'){unlock();ui.showMenu({id:'document',title:data.title,items:(data.lines||[]).map((text,i)=>({id:i,text,selectable:false})),readOnly:true});}
    if(data.type==='commands')commands=data.commands.filter(c=>c.name!=='#'&&c.name!=='?').map(c=>({...c,key:c.key?String.fromCharCode(c.key):`#${c.name}`,category:commands.find(x=>x.name===c.name)?.category||'Journal & system'}));
    if(data.type==='notice'||data.type==='message')ui.message(data.text);
    if(data.type==='failure'){ui.setEngineStatus(data.text,false);ui.message(data.text);playing=false;ui.setMode('title');}
    if(data.type==='ended'){
      playing=false;unlock();
      const saved=data.saved || (data.snapshot?.messages||world?.messages||[]).some(m=>/^saving\.\.\./i.test(typeof m==='string'?m:m.text));
      ui.setEngineStatus('The dungeon awaits.',true);
      if(saved){titleScene();ui.setMode('title');ui.setEngineStatus('Expedition saved. Continue when you are ready.',true);document.querySelector('#continue-game').hidden=false;}
      else ui.showDeath((world?.messages||[]).slice(-5).map(m=>typeof m==='string'?m:m.text).join('\n')||'Your expedition has ended.');
    }
  });
}
function normalize(snapshot){
  const p=snapshot.player;
  const terrain={'door-closed':'door','door-open':'door_open','stairs-up':'stairs_up','stairs-down':'stairs_down','stone':'wall'};
  const hunger=p.conditions?.find(c=>/Hungry|Weak|Faint|Starv|Satiated/.test(c))||'Ready';
  return {...snapshot,player:{...p,hunger,turn:snapshot.turn,maxHp:p.maxHp??p.hpmax??p.maxhp??1,power:p.power??p.pw??0,maxPower:p.maxPower??p.pwmax??p.maxpower??1,level:p.level??p.experienceLevel??1,gold:p.gold??0,depth:p.depth??1,dungeon:p.dungeon||'Dungeons of Doom'},tiles:(snapshot.tiles||[]).map(t=>({...t,type:terrain[t.type]||t.type||'unknown'})),messages:snapshot.messages||[]};
}
function headingName(angle){return ['N','NW','W','SW','S','SE','E','NE'][((Math.round(angle/(Math.PI/4))%8)+8)%8];}

document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement){input?.clear();send({type:'release'});}document.body.classList.toggle('mouse-captured',!!document.pointerLockElement);ui.setPointerLocked(!!document.pointerLockElement);});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){yaw-=e.movementX*.0022*settings.sensitivity;pitch=Math.max(-1.15,Math.min(1.15,pitch-e.movementY*.0022*settings.sensitivity));}});
canvas.addEventListener('click',()=>{audio.start();if(document.pointerLockElement!==canvas)capture();});
canvas.addEventListener('mousedown',e=>{
  if(!playing||ui.hasPanel)return;
  if(e.button===0&&document.pointerLockElement===canvas)attack();
  if(e.button===2&&document.pointerLockElement===canvas){command('Z');}
});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.querySelector('#mouse-capture').addEventListener('click',capture);
window.addEventListener('resize',()=>renderer.resize());
document.addEventListener('fullscreenchange',()=>{renderer.resize();ui.setFullscreen(!!document.fullscreenElement);});

// A decorative title backdrop. Play uses only maps supplied by the native engine.
function titleScene(){
  const tiles=[];
  for(let y=0;y<13;y++)for(let x=0;x<13;x++)tiles.push({x,y,type:x===0||y===0||x===12||y===12?'wall':'floor',description:'stone chamber'});
  for(let y=2;y<11;y++)for(const x of [2,10])if(y%3===2)tiles.find(t=>t.x===x&&t.y===y).type='wall';
  tiles.find(t=>t.x===6&&t.y===0).type='door';
  renderer.setWorld({width:13,height:13,levelId:'title',tiles,player:{x:6,y:9},inventory:[]});
  pose.x=6.5;pose.y=9.5;pose.elevation=0;
}
titleScene();connect();
let sendAt=0;
function frame(time){
  const dt=Math.min((time-lastTime)/1000,.06);lastTime=time;
  const running=input.is('run'),crouch=input.is('crouch');
  if(playing&&!ui.hasPanel){
    if(input.is('turnLeft'))yaw+=dt*1.9;if(input.is('turnRight'))yaw-=dt*1.9;
    const movement=input.motion(yaw);
    if(body&&!motion?.blocked&&!motion?.transition)integratePlayer(collision,body,movement,dt*(body.speedScale||1),motion?.actors||[]);
    if(time-sendAt>33){send({type:'input',...movement});sendAt=time;}
  }
  const previousX=pose.x,previousY=pose.y;
  if(playing&&body){pose.x=body.x/CELL;pose.y=body.z/CELL;pose.elevation=body.y;}
  const travelled=Math.hypot(pose.x-previousX,pose.y-previousY)*CELL;
  if(playing&&travelled>.001&&time-lastStep>(running?280:460)){audio.step(running,collision.at(body.x,body.z)?.type,crouch);lastStep=time;}
  pose={...pose,yaw:playing?yaw:Math.sin(time*.00007)*.14,pitch:playing?pitch:-.035,crouch,moving:playing&&travelled>.001,running};
  renderer.setPose(pose);renderer.update(dt);audio.ambient(dt,{playing,pose,torches:renderer.torches,water:world?.tiles.some(t=>t.type==='fountain'&&Math.hypot(t.x-pose.x,t.y-pose.y)<4)});
  if(world&&time-movementTime>150){
    const [dx,dy]=facing(),p=world.player;
    const ahead=world.tiles.find(t=>t.x===p.x+dx&&t.y===p.y+dy),here=world.tiles.find(t=>t.x===p.x&&t.y===p.y);
    const loot=targetLoot(world?.floorObjects,body,yaw,collision);
    let interaction=loot?`Take ${loot.name}`:nearbyDoor()?'Open door':here?.type==='stairs_down'?'Walk down the stairwell':here?.type==='stairs_up'?'Walk up the stairwell':here?.object?`Pick up ${here.object.name}`:ahead?.monster?`${ahead.monster.name}${ahead.monster.tame?' · companion':ahead.monster.peaceful?' · peaceful':''}`:'';
    ui.update({...world,elapsed:motion?.time,player:{...world.player,x:pose.x-.5,y:pose.y-.5},yaw,heading:-yaw,interaction,pointerLocked:document.pointerLockElement===canvas});movementTime=time;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only diagnostics used by the end-to-end smoke test.
window.descent={get state(){return {playing,connected,player:world?.player,tiles:world?.tiles?.length,prompt:pendingPrompt?.kind,pose:{...pose},motion,collision:collision.stairs};},get renderer(){return renderer;}};
