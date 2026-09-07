// NetHack: Descent modification, 2026-09-07. Distributed under dat/license.
import { DungeonRenderer } from './renderer.js';
import { DungeonAudio } from './audio.js';
import { GameUI } from './ui.js';

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
let keys=new Set(),yaw=0,pitch=0,lastAction=0,lastStep=0,lastTime=performance.now(),movementTime=0;
let pose={x:4.5,y:7.5,yaw:0,pitch:0,crouch:false,moving:false,running:false};
let target={x:pose.x,y:pose.y};
const ui=new GameUI({
  onStart:character=>{audio.start();send({type:'start',character});ui.setEngineStatus('Entering the Dungeons of Doom…',false);},
  onContinue:()=>{audio.start();send({type:'continue'});},
  onCommand:(key,itemKey)=>command(typeof key==='string'?key:key.key,itemKey),
  onKey:key=>answer({kind:'key',value:key}),
  onText:value=>answer({kind:pendingPrompt?.kind==='extcmd'?'extcmd':'text',value}),
  onMenu:selection=>{
    if(selection.cancelled){send({type:'cancel'});return;}
    answer({kind:'menu',value:selection.selected||[]});
  },
  onSettings:value=>{Object.assign(settings,value);localStorage.setItem('descent.settings',JSON.stringify(settings));audio.setVolume?.(settings.volume);send({type:'settings',...settings});},
  onClose:()=>{pendingPrompt=null;send({type:'cancel'});keys.clear();},
});
audio.setVolume?.(settings.volume);

function send(message){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}
function unlock(){if(document.pointerLockElement)document.exitPointerLock();keys.clear();send({type:'release'});}
function capture(){if(playing&&!ui.hasPanel)canvas.requestPointerLock?.().catch?.(()=>{});}
function answer(input){if(input.value==='Escape'){send({type:'cancel'});}else send({type:'answer',input});pendingPrompt=null;ui.closePanels(false);}
function direction(dx,dy){return ({'-1,-1':'y','0,-1':'k','1,-1':'u','-1,0':'h','1,0':'l','-1,1':'b','0,1':'j','1,1':'n'})[`${Math.sign(dx)},${Math.sign(dy)}`]||'.';}
function facing(){const dirs=[[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1]];return dirs[((Math.round(yaw/(Math.PI/4))%8)+8)%8];}
function aim(){return direction(...facing());}
function command(key,itemKey) {
  if(!key||!playing)return;
  if(key==='i'||key==='#inventory'){unlock();ui.showInventory(world?.inventory||[]);return;}
  if(key==='#commands'||key==='#'){unlock();ui.showCommands(commands);return;}
  ui.closePanels(false);pendingPrompt=null;
  send({type:'action',key:itemKey?key+itemKey:key,aim:aim()});
  if(key==='f'||key==='t'){renderer.attack('ranged');audio.attack();}
}
function interact(){
  const [dx,dy]=facing(),p=world?.player;if(!p)return;
  const ahead=world.tiles.find(t=>t.x===p.x+dx&&t.y===p.y+dy);
  const here=world.tiles.find(t=>t.x===p.x&&t.y===p.y);
  if(ahead?.type==='door')command('o');
  else if(here?.type==='stairs_down')command('>');
  else if(here?.type==='stairs_up')command('<');
  else if(here?.object)command(',');
  else if(ahead?.monster)command('#chat');
  else command(',');
}
function attack(){if(!playing||ui.hasPanel)return;const now=performance.now();if(now-lastAction<250)return;lastAction=now;send({type:'action',key:`F${aim()}`});renderer.attack('melee');audio.attack();}

function connect(){
  socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);
  socket.addEventListener('open',()=>{connected=true;send({type:'settings',...settings});});
  socket.addEventListener('close',()=>{connected=false;ui.message('Connection lost. Reconnecting to your expedition…');setTimeout(connect,1500);});
  socket.addEventListener('message',event=>{
    let data;try{data=JSON.parse(event.data);}catch{return;}
    if(data.type==='hello'){
      commands=data.commands||[];ui.setEngineStatus(data.ready?'The dungeon awaits.':'Native engine is building…',data.ready);
      document.querySelector('#continue-game').hidden=!data.canContinue&&!data.running;
      if(data.running){playing=true;ui.setMode('game');}
      return;
    }
    if(data.type==='starting'){playing=false;world=null;lastHp=null;lastPower=null;lastLevel=null;lastMessageCount=0;ui.setMode('loading');return;}
    if(data.type==='snapshot'){
      if(!data.player || !Number.isFinite(data.player.x))return;
      world=normalize(data);const p=world.player;
      const level=world.levelId||`${p.dungeon}:${p.depth}`;
      if(lastLevel!==level || Math.hypot(target.x-p.x-.5,target.y-p.y-.5)>5){
        pose.x=p.x+.5;pose.y=p.y+.5;
        if(lastLevel===null){
          // Face the most open nearby direction upon entering the dungeon.
          let best=-1,bestYaw=0;
          for(let i=0;i<8;i++){const a=i*Math.PI/4,dx=Math.round(-Math.sin(a)),dy=Math.round(-Math.cos(a));let score=0;
            for(let n=1;n<=7;n++){const t=world.tiles.find(t=>t.x===p.x+dx*n&&t.y===p.y+dy*n);if(!t||['wall','unknown','door'].includes(t.type))break;score++;}
            if(score>best){best=score;bestYaw=a;}}
          yaw=bestYaw;
        }
      }
      lastLevel=level;target={x:p.x+.5,y:p.y+.5};
      if(lastHp!==null&&p.hp<lastHp){audio.hit();renderer.attack('hit');document.body.classList.remove('damage');void document.body.offsetWidth;document.body.classList.add('damage');}
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

window.addEventListener('keydown',event=>{
  if(event.target.matches('input,textarea,select')||!playing)return;
  if(ui.hasPanel)return;
  const code=event.code;keys.add(code);
  if(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ControlLeft','ControlRight','ShiftLeft','ShiftRight'].includes(code))event.preventDefault();
  if(event.repeat)return;
  if(code==='KeyI'){unlock();ui.showInventory(world?.inventory||[]);}
  else if(code==='Tab'||code==='KeyC'||event.key==='#'){unlock();ui.showCommands(commands);}
  else if(code==='KeyE')interact();
  else if(code==='Space')attack();
  else if(code==='KeyF')command('f');
  else if(code==='KeyZ')command(event.shiftKey?'z':'Z');
  else if(code==='KeyQ')command('q');
  else if(code==='KeyR')command('r');
  else if(code==='KeyX')command('x');
  else if(code==='KeyG')command(',');
  else if(code==='KeyT')command('t');
  else if(code==='KeyK')command('\x04');
  else if(code==='KeyP')command('#pray');
  else if(code==='KeyV')command('s');
  else if(event.key==='>'||event.key==='<')command(event.key);
  else if(code==='Digit1')command('w');
  else if(code==='Digit2')command('Z');
  else if(code==='Digit3')command('z');
  else if(code==='Digit4')command('q');
  else if(code==='Digit5')command('a');
  else if(code==='Digit6')command('e');
});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code))send({type:'release'});});
window.addEventListener('blur',()=>{keys.clear();send({type:'release'});});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement){keys.clear();send({type:'release'});}document.body.classList.toggle('mouse-captured',!!document.pointerLockElement);ui.setPointerLocked(!!document.pointerLockElement);});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){yaw-=e.movementX*.0022*settings.sensitivity;pitch=Math.max(-1.15,Math.min(1.15,pitch-e.movementY*.0022*settings.sensitivity));}});
canvas.addEventListener('click',()=>{audio.start();if(document.pointerLockElement!==canvas)capture();});
canvas.addEventListener('mousedown',e=>{
  if(!playing||ui.hasPanel)return;
  if(e.button===0&&document.pointerLockElement===canvas)attack();
  if(e.button===2){command('Z');}
});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.querySelector('#mouse-capture').addEventListener('click',capture);
window.addEventListener('resize',()=>renderer.resize());

// A decorative title backdrop. Play uses only maps supplied by the native engine.
function titleScene(){
  const tiles=[];
  for(let y=0;y<13;y++)for(let x=0;x<13;x++)tiles.push({x,y,type:x===0||y===0||x===12||y===12?'wall':'floor',description:'stone chamber'});
  for(let y=2;y<11;y++)for(const x of [2,10])if(y%3===2)tiles.find(t=>t.x===x&&t.y===y).type='wall';
  tiles.find(t=>t.x===6&&t.y===0).type='door';
  renderer.setWorld({width:13,height:13,levelId:'title',tiles,player:{x:6,y:9},inventory:[]});
  pose.x=6.5;pose.y=9.5;target={x:6.5,y:9.5};
}
titleScene();connect();
let sendAt=0;
function frame(time){
  const dt=Math.min((time-lastTime)/1000,.06);lastTime=time;
  const running=keys.has('ShiftLeft')||keys.has('ShiftRight'),crouch=keys.has('ControlLeft')||keys.has('ControlRight');
  let moving=false;
  if(playing&&!ui.hasPanel){
    if(keys.has('ArrowLeft'))yaw+=dt*1.9;if(keys.has('ArrowRight'))yaw-=dt*1.9;
    const f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
    const side=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
    moving=!!(f||side);
    if(moving&&time-sendAt>100){
      const dx=-Math.sin(yaw)*f+Math.cos(yaw)*side,dy=-Math.cos(yaw)*f-Math.sin(yaw)*side;
      const angle=Math.atan2(-dx,-dy);const dirs=[[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1]];
      const dir=dirs[((Math.round(angle/(Math.PI/4))%8)+8)%8];
      send({type:'action',key:direction(...dir),movement:true,running,crouching:crouch});sendAt=time;
    }
  }
  const distance=Math.hypot(target.x-pose.x,target.y-pose.y);
  if(distance>.001){const speed=1/(settings.pulseTime*(running?.58:crouch?1.5:1));const step=Math.min(1,dt*Math.max(speed,distance*4)/distance);pose.x+=(target.x-pose.x)*step;pose.y+=(target.y-pose.y)*step;}
  if(playing&&distance>.03&&time-lastStep>(running?280:460)){audio.step();lastStep=time;}
  pose={...pose,yaw:playing?yaw:Math.sin(time*.00007)*.14,pitch:playing?pitch:-.035,crouch,moving:playing&&distance>.015,running};
  renderer.setPose(pose);renderer.update(dt);audio.ambient(dt);
  if(world&&time-movementTime>150){
    const [dx,dy]=facing(),p=world.player;
    const ahead=world.tiles.find(t=>t.x===p.x+dx&&t.y===p.y+dy),here=world.tiles.find(t=>t.x===p.x&&t.y===p.y);
    let interaction=ahead?.type==='door'?'Open door':here?.type==='stairs_down'?'Descend the stairs':here?.type==='stairs_up'?'Ascend the stairs':here?.object?`Pick up ${here.object.name}`:ahead?.monster?`${ahead.monster.name}${ahead.monster.tame?' · companion':ahead.monster.peaceful?' · peaceful':''}`:'';
    ui.update({...world,yaw,heading:-yaw,interaction,pointerLocked:document.pointerLockElement===canvas});movementTime=time;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only diagnostics used by the end-to-end smoke test.
window.descent={get state(){return {playing,connected,player:world?.player,tiles:world?.tiles?.length,prompt:pendingPrompt?.kind,pose:{...pose}};},get renderer(){return renderer;}};
