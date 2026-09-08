// NetHack: Descent modification, 2026-09-07. Distributed under dat/license.
import { DungeonRenderer } from './renderer.js';
import { DungeonAudio } from './audio.js';
import {AUDIO_DEFAULTS,soundPosition,soundArea} from './soundscape.js';
import {bindSpellChoices} from './spell-bindings.js';
import { GameUI } from './ui.js';
import {targetLoot} from './loot.js';
import {GameInput,COMMAND_KEYS} from './input.js';
import {PartyUI} from './party-ui.js';
import {PartyModels} from './player-models.js';
import {PARTY_COMMANDS} from './party-rules.js';
let party,networkMode='solo',pendingSolo=null;
let input,actionSequence=0,suppressUnlockMenu=false,defending=false,resumeOnEscapeUp=false;
const pendingActions=new Map();
import {CollisionWorld,integratePlayer,startJump,advanceJump,CELL} from './spatial.js';
let collision=new CollisionWorld(),body=null,motion=null,collisionSignature='';

const canvas=document.querySelector('#game');
let renderer;
try {renderer=new DungeonRenderer(canvas);} catch(error) {
  document.body.innerHTML='<main style="color:#e8dcc0;background:#151713;padding:4rem;font:20px Georgia">NetHack: Descent needs WebGL 2. Enable hardware acceleration in your browser and restart.<pre></pre></main>';
  document.querySelector('pre').textContent=error.message;throw error;
}
const audio=new DungeonAudio();
// The v0.7 launcher carries preferences from the previous local origin once.
const transferredSettings=new URLSearchParams(location.hash.slice(1)).get('descentSettings');
if(transferredSettings){
  try{const value=JSON.parse(transferredSettings);if(value&&typeof value==='object'&&!Array.isArray(value)&&!localStorage.getItem('descent.settings'))localStorage.setItem('descent.settings',JSON.stringify(value));}catch{}
  history.replaceState(null,'',location.pathname+location.search);
}
const stored=(()=>{try{return JSON.parse(localStorage.getItem('descent.settings'))||{};}catch{return {};}})();
const settings={...AUDIO_DEFAULTS,sensitivity:1,pulseTime:0.8,spellBindings:{},...stored};
let spellSettingsRequest=null,spellSettingsTimer=0,lastItemIntent=null;
let pendingJumpUntil=0;
let socket,world=null,playing=false,pendingPrompt=null,commands=[],connected=false,lastHp=null,lastPower=null,lastLevel=null,lastMessageCount=0;
let yaw=0,pitch=0,lastAction=0,lastStep=0,lastTime=performance.now(),movementTime=0;
let pose={x:4.5,y:7.5,yaw:0,pitch:0,crouch:false,moving:false,running:false};
const ui=new GameUI({
  onStart:character=>{audio.start();if(party.start(character))return;if(networkMode!=='solo'){networkMode='solo';pendingSolo=character;connect();}else send({type:'start',character});ui.setEngineStatus('Entering the Dungeons of Doom…',false);},
  onContinue:()=>{audio.start();send({type:'continue'});},
  onCommand:(key,itemKey,itemId)=>command(typeof key==='string'?key:key.key,itemKey,undefined,itemId),
  onKey:key=>answer({kind:'key',value:key}),
  onText:value=>answer({kind:pendingPrompt?.kind==='extcmd'?'extcmd':'text',value}),
  onMenu:selection=>{
    if(selection.cancelled){send({type:'cancel'});return;}
    answer({kind:'menu',value:selection.selected||[]});
  },
  onSettings:value=>{Object.assign(settings,value);localStorage.setItem('descent.settings',JSON.stringify(settings));audio.setSettings(settings);send({type:'settings',...settings});},
  onSound:kind=>audio.interface(kind),
  onSpellSettings:()=>{
    clearTimeout(spellSettingsTimer);spellSettingsRequest={started:false};send({type:'cancel'});
    if(world?.player.busy){spellSettingsRequest=null;ui.setSpellChoices([],'Wait until you can act, then refresh your spells.');return;}
    const request=spellSettingsRequest;request.id=action({key:'#showspells'});
    spellSettingsTimer=setTimeout(()=>{if(spellSettingsRequest===request){spellSettingsRequest=null;ui.setSpellChoices([],'No spell list was returned. You may not know any spells; refresh to check again.');}},4000);
  },
  onClose:options=>{spellSettingsRequest=null;clearTimeout(spellSettingsTimer);pendingPrompt=null;send({type:'cancel'});input?.clear();if(options?.escape)resumeOnEscapeUp=true;else capture();},
  onPanel:options=>{renderer.holdMap(false);if(!options?.aiming)unlock();else{setDefending(false);input?.clear();send({type:'release'});}},
  onFullscreen:()=>toggleFullscreen(),
  onEscape:()=>openGameMenu(),
  onNewRun:()=>{unlock();send({type:"new-run"});},
});
audio.setSettings(settings);
const partyModels=new PartyModels(renderer.scene);
party=new PartyUI({send,connect:()=>{networkMode='party';connect();},onNotice:text=>{ui.message(text);ui.setEngineStatus(text,true);},onMenu:()=>{unlock();ui.closePanels(false);},onRevive:()=>action({key:'#revive'}),onLeave:()=>{location.href=location.pathname;}});

function send(message){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}
function setDefending(value){if(defending!==!!value)audio.guard(!!value,!!world?.player.shield);defending=!!value;renderer.guard(defending);send({type:"defend",active:defending});}
function unlock(){setDefending(false);if(document.pointerLockElement){suppressUnlockMenu=true;document.exitPointerLock();}input?.clear();send({type:'release'});}
let captureRetry=0;
function capture(retry=false){
  if(!playing||party&&!party.panel.hidden||(ui.hasPanel&&!ui.panel?.aiming))return;
  clearTimeout(captureRetry);canvas.focus({preventScroll:true});
  canvas.requestPointerLock?.().catch?.(()=>{
    ui.setPointerLocked(false);
    // Windowed Chrome briefly rejects capture immediately after native Escape.
    // Retry only the player's resume/click request, while still in the game.
    if(retry!==true)captureRetry=setTimeout(()=>{if(document.hasFocus()&&!document.pointerLockElement&&playing&&!ui.hasPanel)capture(true);},1500);
    else ui.message('Click the dungeon view to resume mouse look.');
  });
}
function openGameMenu(){
  if(!playing)return;
  if(renderer.mapHeld){renderer.holdMap(false);return;}
  if(ui.panel){ui.closePanels();return;}
  pendingPrompt=null;send({type:'cancel'});ui.showSettings();
}
async function toggleFullscreen(){
  try {if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{ui.message('Fullscreen is unavailable here. Open the game window or press F11 in your browser.');}
}
function action(message){const id=`${clientId}:${++actionSequence}`;pendingActions.set(id,message);send({type:'action',id,...message});return id;}
const clientId=Math.random().toString(36).slice(2);
function answer(input){if(input.value==='Escape'){send({type:'cancel'});}else send({type:'answer',input,aim:aim()});pendingPrompt=null;ui.closePanels(false);capture();}
function direction(dx,dy){return ({'-1,-1':'y','0,-1':'k','1,-1':'u','-1,0':'h','1,0':'l','-1,1':'b','0,1':'j','1,1':'n'})[`${Math.sign(dx)},${Math.sign(dy)}`]||'.';}
function facing(){const dirs=[[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1]];return dirs[((Math.round(yaw/(Math.PI/4))%8)+8)%8];}
function aim(){return direction(...facing());}
function command(key,itemKey,targetCell,itemId) {
  if(!key||!playing||world?.player.busy)return;
  if(['e','q','r','w','W','T','P','R','d'].includes(key))lastItemIntent={key,time:audio.time};
  renderer.holdMap(false);
  if(key===','){const item=targetLoot(world?.floorObjects,body,yaw,collision);if(item){ui.closePanels(false);action({key:'.',pickup:item.id});capture();return;}}
  if(key==='i'||key==='#inventory'){unlock();ui.showInventory(world?.inventory||[]);return;}
  if(key==='#commands'||key==='#'){unlock();ui.showCommands(commands);return;}
  ui.closePanels(false);pendingPrompt=null;
  action({key:itemKey?key+itemKey:key,aim:aim(),targetCell,itemId});capture();
}
function nearbyDoor(open=false){
  if(!body)return null;
  for(let d=.15;d<2.1;d+=.1){const t=collision.at(body.x-Math.sin(yaw)*d,body.z-Math.cos(yaw)*d);if(t?.type===(open?'door_open':'door'))return t;if(['wall','stone','unknown','door'].includes(t?.type))return null;}
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
  if(defending||renderer.mapHeld||world?.player.busy||world?.player.downed||!playing||ui.hasPanel||!party.panel.hidden||!connected||[...pendingActions.values()].some(a=>a.melee))return;
  action({key:'.',melee:true,yaw});
}
function handleAction(name){
  if(name==='fullscreen'){toggleFullscreen();return;}
  if(name==='attack')attack();
  else if(name==='inventory')command('i');
  else if(name==='commands')command('#commands');
  else if(name==='interact')interact();
  else if(name==='closeDoor'){const door=nearbyDoor(true);if(door)command('c',null,{x:door.x,z:door.y});else ui.message('Face a nearby open door to close it.');}
  else if(name==='settings')openGameMenu();
  else if(name==='map'){setDefending(false);renderer.holdMap(!renderer.mapHeld,world,motion?.time||0);audio.interface('page');}
  else if(name==='jump'){if(!motion?.blocked&&!motion?.transition&&startJump(body)){pendingJumpUntil=performance.now()+500;audio.jump();send({type:'jump'});}}
  else if(COMMAND_KEYS[name])command(COMMAND_KEYS[name]);
}
input=new GameInput({context:()=>party&&!party.panel.hidden?'busy':ui.panel?'menu':world?.player.busy?'busy':playing?'game':'title',menu:e=>ui.handleKey(e),onAction:handleAction,onRelease:()=>send({type:'release'})});
canvas.tabIndex=-1;


function connect(){
  if(socket){socket.onclose=null;socket.close();}
  const current=socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}${networkMode==='party'?'/party':''}`);
  socket.addEventListener('open',()=>{connected=true;send({type:'settings',...settings});});
  socket.addEventListener('close',event=>{if(socket!==current)return;connected=false;pendingActions.clear();input.reset();party.disconnected();if(event.code===4001){playing=false;partyModels.clear();ui.setMode('title');ui.setEngineStatus('Your character was rejoined in another tab. Choose a new character here or rejoin to move it back.',true);return;}ui.message('Connection lost. Reconnecting to your expedition…');setTimeout(()=>{if(socket===current)connect();},1500);});
  socket.addEventListener('message',event=>{
    let data;try{data=JSON.parse(event.data);}catch{return;}
    if(socket!==current)return;
    if(data.type==='party-result'){playing=false;unlock();ui.closePanels(false);renderer.holdMap(false);}
    if(data.type==='party-roster')commands=PARTY_COMMANDS;
    if(party.handle(data))return;
    if(data.type==='hello'){
      if(data.multiplayer){commands=PARTY_COMMANDS;party.ready();ui.setEngineStatus('Joining your expedition…',true);return;}
      if(pendingSolo){send({type:'start',character:pendingSolo});pendingSolo=null;}
      commands=data.commands||[];ui.setEngineStatus(data.ready?`The dungeon awaits.${data.version?' · v'+data.version:''}`:'Native engine is building…',data.ready);
      document.querySelector('#continue-game').hidden=!data.canContinue&&!data.running;
      if(data.running){playing=true;ui.setMode('game');}
      return;
    }
    if(data.type==='action-status'){
      if(spellSettingsRequest&&spellSettingsRequest.id===data.id){if(data.status==='started')spellSettingsRequest.started=true;else if(['rejected','cancelled'].includes(data.status)){spellSettingsRequest=null;clearTimeout(spellSettingsTimer);ui.setSpellChoices([],data.reason||'Refresh when you can act.');}}
      if(data.status==='started'){const a=pendingActions.get(data.id);if(a?.melee){renderer.attack('melee');audio.attack('melee',world?.player.weapon);}pendingActions.delete(data.id);}
      else if(data.status==='rejected'||data.status==='cancelled'){pendingActions.delete(data.id);if(data.reason)ui.message(data.reason);}
      return;
    }
    if(data.type==='player-effect'){renderer.attack(data.kind);audio.attack(data.kind);return;}
    if(data.type==='item-picked-up'){audio.pickup(data.name);ui.toast(`Picked up ${data.name}`);return;}
    if(data.type==='actor-defeated'){creatureSound(data.actorId,'death');if(renderer.hitActor(data.actorId,true)){audio.impact();ui.confirmHit();}return;}
    if(data.type==='feedback'){
      for(const e of data.events||[]){
        if(e.kind==='actor-hit'){creatureSound(e.actorId,e.dead?'death':'hurt');if(renderer.hitActor(e.actorId,e.dead)){audio.impact();ui.confirmHit();}}
        if(e.kind==='player-hit'){audio.hit();renderer.attack('hit');ui.damage(e.amount);}
        if(e.kind==='pickup'){audio.pickup(e.name);ui.toast(`Picked up ${e.name}`);}
      }return;
    }
    if(data.type==='starting'){pendingActions.clear();playing=false;world=null;lastHp=null;lastPower=null;lastLevel=null;lastMessageCount=0;pitch=0;audio.airborne=false;audio.actorSounds.clear();ui.spellItems=[];ui.setMode('loading');return;}
    if(data.type==='motion'){
      if(!data.player||data.levelId!==lastLevel)return;
      if(!motion&&Number.isFinite(data.spawnYaw))yaw=data.spawnYaw;
      motion=data;partyModels.accept(data,party.id);const p=data.player;
      // A grounded packet already in flight before Space must not cancel the
      // local takeoff. Accept the first airborne acknowledgement, or a block.
      if(p.jumpOffset>0||p.jumpVelocity>0||data.blocked||data.transition)pendingJumpUntil=0;
      const predicted=body&&performance.now()<pendingJumpUntil?{jumpOffset:body.jumpOffset,jumpVelocity:body.jumpVelocity}:null;
      if(!body||Math.hypot(body.x-p.x,body.z-p.z)>.65||data.blocked||data.transition)body={...p};
      else {body.speedScale=p.speedScale??1;body.jumpOffset=p.jumpOffset||0;body.jumpVelocity=p.jumpVelocity||0;body.x+=(p.x-body.x)*.35;body.z+=(p.z-body.z)*.35;body.y=collision.support(body.x,body.z)??p.y;}
      if(predicted)Object.assign(body,predicted);
      renderer.setMotion(data);document.body.classList.toggle('floor-transition',data.transition&&!pendingPrompt);return;
    }
    if(data.type==='snapshot'){
      if(!data.player || !Number.isFinite(data.player.x))return;
      const before=world;world=normalize(data);const p=world.player;ui.setBusy(!!p.busy&&p.hp>0);
      if(data.multiplayer)commands=PARTY_COMMANDS;
      if(spellSettingsRequest?.started&&(world.messages||[]).slice(-2).some(m=>/don't know any spells right now/i.test(typeof m==='string'?m:m.text))){spellSettingsRequest=null;clearTimeout(spellSettingsTimer);ui.setSpellChoices([]);}
      if(before){
        if(p.level>before.player.level)audio.levelUp();
        if(before.levelId===world.levelId){
          const oldDoors=new Map(before.tiles.filter(t=>t.type.startsWith('door')).map(t=>[`${t.x},${t.y}`,t.type]));
          for(const tile of world.tiles)if(['door','door_open'].includes(tile.type)&&oldDoors.has(`${tile.x},${tile.y}`)&&oldDoors.get(`${tile.x},${tile.y}`)!==tile.type)audio.door(tile.type==='door_open',soundPosition({x:(tile.x+.5)*3,z:(tile.y+.5)*3},pose));
        }
        if(JSON.stringify(before.inventory?.filter(i=>i.equipped).map(i=>i.id))!==JSON.stringify(world.inventory?.filter(i=>i.equipped).map(i=>i.id)))audio.item('equip');
        if(lastItemIntent&&audio.time-lastItemIntent.time<15){
          const consumed=before.inventory?.some(i=>i.quantity>(world.inventory?.find(n=>n.id===i.id)?.quantity||0));
          if(consumed||p.busy&&!before.player.busy){const kind={q:'drink',e:'eat',r:'read',d:'drop'}[lastItemIntent.key];if(kind)audio.item(kind);lastItemIntent=null;}
        }
      }
      if(p.busy){input.clear();setDefending(false);renderer.holdMap(false);}
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
      if(!playing&&p.hp>0&&!party.result){playing=true;ui.setMode('game');ui.message('You descend into the Dungeons of Doom. Click the view to look around.');send({type:'settings',...settings});}
      if(p.hp<=0&&playing&&!p.downed){audio.playerDeath();playing=false;unlock();ui.showDeath(world.messages?.slice(-4).map(m=>typeof m==='string'?m:m.text).join('\n')||'Your expedition has ended.');}
      return;
    }
    if(data.type==='prompt'){
      if(spellSettingsRequest&&data.kind==='menu'&&/known spells/i.test(data.prompt||'')){
        spellSettingsRequest=null;clearTimeout(spellSettingsTimer);pendingPrompt=null;send({type:'cancel'});ui.setSpellChoices(data.items||[]);return;
      }
      pendingPrompt=data;const aiming=!!data.aiming&&['menu','key','yn'].includes(data.kind);if(!aiming)unlock();
      if(data.kind==='display')ui.showMenu({id:'document',title:'Dungeon chronicle',items:(data.prompt||'').split('\n').map((text,i)=>({id:i,text,selectable:false})),readOnly:true});
      else if(data.kind==='menu') {
        const spells=aiming&&/spell/i.test(data.prompt||'');
        if(spells)ui.spellItems=data.items||[];
        const items=spells?bindSpellChoices(data.items||[],settings.spellBindings):data.items||[];
        ui.showMenu({id:data.id||'engine',aiming,title:data.prompt||'Choose an action',items:items.map(i=>({...i,text:i.text??i.name})),multiple:data.how===2||data.multiple,readOnly:data.how===0});
      }
      else {
        const directional=/direction|where|position|pick a location/i.test(data.prompt||'');
        const choices=data.choices|| (directional?'hjklyubn.<>':(world?.inventory||[]).map(i=>({key:i.key,text:i.name})).concat([{key:'?',text:'Show valid choices'},{key:'*',text:'Show all items'},{key:'-',text:'None / bare hands'},{key:'\r',text:'Continue'}]));
        ui.showPrompt({aiming,text:data.prompt|| 'NetHack awaits your response.',choices,default:typeof data.default==='number'?String.fromCharCode(data.default):data.default,type:['text','extcmd'].includes(data.kind)?'text':'yn'});
      }
      return;
    }
    if(data.type==='actor-attack'){renderer.actorAttack(data.actorId,data.ranged);creatureSound(data.actorId,'attack');return;}
    if(data.type==='clearPrompt'){if(pendingPrompt){pendingPrompt=null;ui.closePanels(false);}return;}
    if(data.type==='document'){unlock();ui.showMenu({id:'document',title:data.title,items:(data.lines||[]).map((text,i)=>({id:i,text,selectable:false})),readOnly:true});}
    if(data.type==='commands')commands=data.commands.filter(c=>c.name!=='#'&&c.name!=='?').map(c=>({...c,key:c.key?String.fromCharCode(c.key):`#${c.name}`,category:commands.find(x=>x.name===c.name)?.category||'Journal & system'}));
    if(data.type==='notice'||data.type==='message')ui.message(data.text);
    if(data.type==='failure'){ui.setEngineStatus(data.text,false);ui.message(data.text);playing=false;ui.setMode('title');}
    if(data.type==='new-run-ready'){playing=false;world=null;body=null;motion=null;lastLevel=null;ui.closePanels(false);ui.setMode('title');ui.setEngineStatus('Ready for a new expedition',true);titleScene();return;}
    if(data.type==='ended'){
      playing=false;ui.setBusy(false);renderer.holdMap(false);unlock();
      const saved=data.saved || (data.snapshot?.messages||world?.messages||[]).some(m=>/^saving\.\.\./i.test(typeof m==='string'?m:m.text));
      ui.setEngineStatus('The dungeon awaits.',true);
      if(saved){titleScene();ui.setMode('title');ui.setEngineStatus('Expedition saved. Continue when you are ready.',true);document.querySelector('#continue-game').hidden=false;}
      else {audio.playerDeath();ui.showDeath((world?.messages||[]).slice(-5).map(m=>typeof m==='string'?m:m.text).join('\n')||'Your expedition has ended.');}
    }
  });
}
function creatureSound(id,kind){const e=renderer.monsters.get(`id:${id}`);if(e)audio.creature({...e.data,id,name:e.name},kind,soundPosition(e.group.position,pose,collision));}
function normalize(snapshot){
  const p=snapshot.player;
  const terrain={'door-closed':'door','door-open':'door_open','stairs-up':'stairs_up','stairs-down':'stairs_down','stone':'wall'};
  const hunger=p.conditions?.find(c=>/Hungry|Weak|Faint|Starv|Satiated/.test(c))||'Ready';
  return {...snapshot,player:{...p,hunger,turn:snapshot.turn,maxHp:p.maxHp??p.hpmax??p.maxhp??1,power:p.power??p.pw??0,maxPower:p.maxPower??p.pwmax??p.maxpower??1,level:p.level??p.experienceLevel??1,gold:p.gold??0,depth:p.depth??1,dungeon:p.dungeon||'Dungeons of Doom'},tiles:(snapshot.tiles||[]).map(t=>({...t,type:terrain[t.type]||t.type||'unknown'})),messages:snapshot.messages||[]};
}
function headingName(angle){return ['N','NW','W','SW','S','SE','E','NE'][((Math.round(angle/(Math.PI/4))%8)+8)%8];}

document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement===canvas;
  if(!locked){
    setDefending(false);input?.clear();send({type:'release'});
    // Browsers can consume Escape before JavaScript receives keydown.
    if(playing&&!ui.panel&&!suppressUnlockMenu)ui.showSettings();
  }
  suppressUnlockMenu=false;
  document.body.classList.toggle('mouse-captured',locked);ui.setPointerLocked(locked);
});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){yaw-=e.movementX*.0022*settings.sensitivity;pitch=Math.max(-1.15,Math.min(1.15,pitch-e.movementY*.0022*settings.sensitivity));}});
canvas.addEventListener('click',()=>{audio.start();if(document.pointerLockElement!==canvas)capture();});
canvas.addEventListener('mousedown',e=>{
  if(!playing||ui.hasPanel||renderer.mapHeld||world?.player.busy)return;
  if(e.button===0&&document.pointerLockElement===canvas)attack();
  if(e.button===2&&document.pointerLockElement===canvas){setDefending(true);}
});
window.addEventListener('keyup',e=>{if(e.code==='Escape'&&resumeOnEscapeUp){resumeOnEscapeUp=false;capture();}});
window.addEventListener('mouseup',e=>{if(e.button===2)setDefending(false);});
window.addEventListener('blur',()=>setDefending(false));
document.addEventListener('visibilitychange',()=>{if(document.hidden)setDefending(false);});
canvas.addEventListener('wheel',e=>{if(ui.panel?.aiming){const list=ui.$('.menu-list');if(list)list.scrollTop+=e.deltaY;e.preventDefault();}},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.querySelector('#mouse-capture').addEventListener('click',capture);
window.addEventListener('resize',()=>renderer.resize());
document.addEventListener('fullscreenchange',async()=>{
  renderer.resize();ui.setFullscreen(!!document.fullscreenElement);
  if(document.fullscreenElement){
    try{await navigator.keyboard?.lock?.(['Escape']);}
    catch{ui.message('Allow keyboard capture to keep Escape in the game. F10 exits fullscreen.');}
  }else navigator.keyboard?.unlock?.();
});

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
  if(connected&&playing&&!ui.hasPanel&&party.panel.hidden&&!world?.player.busy){
    if(input.is('turnLeft'))yaw+=dt*1.9;if(input.is('turnRight'))yaw-=dt*1.9;
    const movement={...input.motion(yaw),defend:defending};
    if(body&&!motion?.blocked&&!motion?.transition)integratePlayer(collision,body,movement,dt*(body.speedScale??1),[...(motion?.actors||[]),...(motion?.players||[]).filter(p=>p.id!==party.id&&p.connected&&p.levelId===motion.levelId)]);
    if(time-sendAt>33){send({type:'input',...movement});sendAt=time;}
  }
  const previousX=pose.x,previousY=pose.y;
  if(playing&&body){if(!world?.player.busy)advanceJump(body,dt);pose.x=body.x/CELL;pose.y=body.z/CELL;pose.elevation=body.y+(body.jumpOffset||0);}
  const travelled=Math.hypot(pose.x-previousX,pose.y-previousY)*CELL;
  const airborne=!!(body&&(body.jumpOffset>0||body.jumpVelocity>0));
  if(playing)audio.movement(airborne,collision.at(body?.x,body?.z)?.type);
  if(playing&&!airborne&&travelled>.001&&time-lastStep>(running?280:460)){audio.step(running,collision.at(body.x,body.z)?.type,crouch);lastStep=time;}
  pose={...pose,yaw:playing?yaw:Math.sin(time*.00007)*.14,pitch:playing?pitch:-.035,crouch,moving:playing&&travelled>.001,running};
  partyModels.update(dt);party.update(motion,body,collision);
  renderer.setPose(pose);renderer.update(dt);audio.ambient(dt,{playing,pose,torches:renderer.torches,area:soundArea(world),entities:renderer.monsters,collision,water:world?.tiles.some(t=>t.type==='fountain'&&Math.hypot(t.x-pose.x,t.y-pose.y)<4)});
  if(world&&time-movementTime>150){
    const p=world.player;
    const loot=targetLoot(world?.floorObjects,body,yaw,collision);
    const canInteract=!renderer.mapHeld&&!ui.hasPanel&&!p.busy;
    const sight=canInteract?renderer.sight():{target:null,enemies:[]};
    const door=canInteract&&!sight.target&&!loot?nearbyDoor():null;
    renderer.highlightActor(sight.target?.key);
    renderer.highlightPickup(canInteract&&!sight.target?loot?.id??null:null,door);
    const target=sight.target||(canInteract&&loot?{name:loot.name,kind:'On the ground'}:door?{name:door.type==='door_open'?'Open door':'Closed door',kind:'Within reach'}:null);
    ui.setAwareness({...sight,target});
    ui.update({...world,elapsed:motion?.time,player:{...world.player,x:pose.x-.5,y:pose.y-.5},yaw,heading:-yaw,pointerLocked:document.pointerLockElement===canvas});movementTime=time;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only diagnostics used by the end-to-end smoke test.
window.descent={get state(){return {playing,connected,player:world?.player,tiles:world?.tiles?.length,prompt:pendingPrompt?.kind,pose:{...pose},motion,collision:collision.stairs,party:party.id?{id:party.id,code:party.partyCode,models:partyModels.models.size,voiceEnabled:party.voice.enabled,voicePeers:[...party.voice.peers.values()].map(p=>p.pc.connectionState)}:null};},get renderer(){return renderer;},get audio(){return audio;},get voice(){return party.voice;}};
