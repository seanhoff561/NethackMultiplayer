// NetHack: Descent modification, 2026-09-07. Distributed under dat/license.
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync,readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
import {WebSocketServer,WebSocket} from 'ws';
import {NativeSession} from './lib/native-session.mjs';
import {RealtimeClock} from './lib/realtime.mjs';
import {readCommands,directionKey} from './lib/commands.mjs';
import {ActionQueue,resolveInventoryAction} from './lib/action-queue.mjs';
import {FeedbackTracker} from './lib/feedback.mjs';
import {lootPositions} from './src/loot.js';
import {SpatialSimulation} from './lib/spatial-simulation.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const repository=path.dirname(root);
const port=Number(process.env.PORT)||5175;
const production=existsSync(path.join(root,'dist-polished/index.html')) && !process.argv.includes('--dev');
const siteRoot=production?path.join(root,'dist-polished'):root;
const executable=process.env.NETHACK_ENGINE || path.join(root,'engine/bin/nethack-engine-polished.exe');
const runtime=process.env.NETHACK_RUNTIME || path.join(root,'engine/runtime-polished');
const commands=readCommands(path.join(repository,'src/cmd.c'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.map':'application/json'};
const metadataFile=path.join(runtime,'descent-session.json');
let session=null,clock=null,lastSnapshot=null,lastCharacter=null,lastPrompt=null,awaitingTurn=null,worldInterval=800;
let spatial=new SpatialSimulation(),motionTicks=0,transitionAt=0,lastMeleeAt=0,actions=null,feedback=new FeedbackTracker();
if(existsSync(metadataFile)){try{lastCharacter=JSON.parse(readFileSync(metadataFile,'utf8'));}catch{}}
const canContinue=()=>!!lastCharacter&&existsSync(path.join(runtime,lastCharacter.name+'.NetHack-saved-game'));
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/api/status')return json(res,{ready:existsSync(executable),running:!!session&&!session.closed,canContinue:canContinue(),production});
  if(url.pathname==='/api/commands')return json(res,commands);
  let file;
  if(url.pathname==='/vendor/three.js') file=path.join(root,'node_modules/three/build/three.module.js');
  else if(url.pathname==='/vendor/three.core.js') file=path.join(root,'node_modules/three/build/three.core.js');
  else if(url.pathname==='/vendor/addons/environments/RoomEnvironment.js')file=path.join(root,'node_modules/three/examples/jsm/environments/RoomEnvironment.js');
  else if(url.pathname==='/LICENSE.txt')file=path.join(repository,'dat/license');
  else if(url.pathname==='/lib/commands.mjs') {
    // Browser uses only the two pure directional helpers.
    res.writeHead(200,{'Content-Type':'text/javascript'});
    return res.end(readFileSync(path.join(root,'lib/commands.mjs'),'utf8').split('export function directionKey')[1].replace(/^/,'export function directionKey'));
  } else {
    let decoded;try{decoded=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end('Bad URL');}
    if(decoded!=='/' && !/^\/(src\/|game\.js|style\.css|index\.html)/.test(decoded)){res.writeHead(404);return res.end('Not found');}
    file=path.resolve(siteRoot,`.${decoded==='/'?'/index.html':decoded}`);
    if(!file.startsWith(siteRoot+path.sep)){res.writeHead(403);return res.end('Forbidden');}
  }
  try {const data=readFileSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
});
function json(res,data){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
const wss=new WebSocketServer({server,maxPayload:32768,verifyClient:({origin,req})=>!origin||origin===`http://${req.headers.host}`});
function broadcast(event){const data=JSON.stringify(event);for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN)ws.send(data);}
function notice(text){broadcast({type:'notice',text});}
function start(character={},resume=false){
  if(session&&!session.closed){notice('Your expedition is already running.');if(lastSnapshot)broadcast(lastSnapshot);return;}
  if(!existsSync(executable)){broadcast({type:'failure',text:'The native engine is not built yet. Run port\\engine\\build.ps1, then launch again.'});return;}
  const roles=['Archeologist','Barbarian','Caveman','Healer','Knight','Monk','Priest','Ranger','Rogue','Samurai','Tourist','Valkyrie','Wizard'];
  const races=['human','elf','dwarf','gnome','orc'];
  character=resume&&lastCharacter?lastCharacter:character;
  const config={name:String(character.name||'Adventurer').replace(/[^a-zA-Z0-9 _-]/g,'').trim().slice(0,24)||'Adventurer',role:roles.find(r=>r.toLowerCase()===String(character.role).toLowerCase())||'Valkyrie',race:races.includes(character.race)?character.race:'human',gender:['male','female'].includes(character.gender)?character.gender:'female',alignment:['lawful','neutral','chaotic'].includes(character.alignment)?character.alignment:'lawful'};
  lastCharacter=config;mkdirSync(runtime,{recursive:true});writeFileSync(metadataFile,JSON.stringify(config));
  for(const file of readdirSync(path.join(root,'engine/data'))) {
    const dest=path.join(runtime,file);
    if(!existsSync(dest))copyFileSync(path.join(root,'engine/data',file),dest);
  }
  // genl_prag stops at a non-option name argument, so identity must come last.
  const args=['-p',config.role,'-r',config.race,'-g',config.gender,'-a',config.alignment,'-u',config.name];
  session=new NativeSession({executable,cwd:runtime,args,env:{NH_TURN_MS:String(worldInterval)}});
  const spatialFile=path.join(runtime,config.name+'.descent-spatial.json');
  let restoredSpatial=null;
  if(existsSync(path.join(runtime,config.name+'.NetHack-saved-game'))&&existsSync(spatialFile)){try{restoredSpatial=JSON.parse(readFileSync(spatialFile,'utf8'));}catch{}}
  lastPrompt=null;lastSnapshot=null;spatial=new SpatialSimulation();
  clock=new RealtimeClock({act:action=>{
    spatial.project(session);
    if(action.targetCell)action.aim=directionKey(action.targetCell.x-spatial.projected.x,action.targetCell.z-spatial.projected.z);
    if(action.spatialMelee)action.melee=spatial.melee()||0;
    awaitingTurn=session.snapshot?.actionSerial;session.act(action);
  },canAct:()=>session.ready&&!session.closed,interval:worldInterval});
  feedback=new FeedbackTracker();
  actions=new ActionQueue({ready:()=>session.ready&&!session.closed&&!session.virtualPrompt,notify:(a,status,reason)=>broadcast({type:'action-status',id:a.id,status,reason}),validate:a=>{
    const invalid=resolveInventoryAction(a,lastSnapshot);if(invalid)return invalid;
    if(a.pickup!==undefined){
      const item=lootPositions(lastSnapshot?.floorObjects,spatial.world).find(i=>i.id===a.pickup);
      if(!item||Math.abs(item.worldY-spatial.player.y)>1.5||Math.hypot(item.worldX-spatial.player.x,item.worldZ-spatial.player.z)>2.05||!spatial.world.lineClear(spatial.player,{x:item.worldX,z:item.worldZ},.02)){
        return 'That item is out of reach.';
      }
    }
    return null;
  },execute:a=>{
    spatial.project(session);
    if(a.targetCell)a.aim=directionKey(a.targetCell.x-spatial.projected.x,a.targetCell.z-spatial.projected.z);
    if(a.spatialMelee)a.melee=spatial.melee(a.yaw)||0;
    awaitingTurn=session.snapshot?.actionSerial;session.act(a);
  }});
  session.on('ready',()=>{
    // Bumping a wall or using a free informational command cannot stop time.
    const previous=awaitingTurn;awaitingTurn=null;actions?.update();
    if(previous!==null&&session.ready&&session.snapshot?.actionSerial<=previous)session.act({key:'.',idle:true});
  });
  session.on('snapshot',snapshot=>{
    spatial.accept(snapshot);
    if(restoredSpatial){spatial.restore(restoredSpatial);restoredSpatial=null;}
    const events=feedback.accept(snapshot);if(events.length)broadcast({type:'feedback',events});
    lastSnapshot=snapshot;broadcast(snapshot);
    broadcast(spatial.packet());
    if(snapshot.player?.hp>0&&!clock.active)clock.start();
  });
  session.on('prompt',request=>{lastPrompt=request;broadcast({type:'prompt',...request,type:'prompt'});});
  session.on('clearPrompt',()=>{lastPrompt=null;broadcast({type:'clearPrompt'});});
  session.on('notice',notice);
  session.on('diagnostic',text=>{console.log('[engine]',text.trim().slice(0,1200));});
  session.on('event',event=>{if(event.type!=='ended')broadcast(event);});
  session.on('failure',text=>{clock.stop();broadcast({type:'failure',text});});
  session.on('ended',event=>{
    clock.stop();lastPrompt=null;const saved=existsSync(path.join(runtime,config.name+'.NetHack-saved-game'));
    if(saved)writeFileSync(spatialFile,JSON.stringify(spatial.serialize()));
    broadcast({type:'ended',...event,saved});
  });
  broadcast({type:'starting',character:config});session.start();
}
wss.on('connection',ws=>{
  ws.send(JSON.stringify({type:'hello',ready:existsSync(executable),running:!!session&&!session.closed,canContinue:canContinue(),commands}));
  if(session&&!session.closed&&lastSnapshot){ws.send(JSON.stringify(lastSnapshot));ws.send(JSON.stringify(spatial.packet()));}
  if(session&&!session.closed&&lastPrompt)ws.send(JSON.stringify({...lastPrompt,type:'prompt'}));
  ws.on('message',raw=>{
    let message;try{message=JSON.parse(raw.toString());}catch{return;}
    if(message.type==='start')return start(message.character);
    if(message.type==='continue')return start({},true);
    if(message.type==='settings'){worldInterval=Math.max(250,Math.min(3000,(Number(message.pulseTime)||.8)*1000));if(clock)clock.setInterval(worldInterval);if(session&&!session.closed)session.write({kind:'pace',value:worldInterval});return;}
    if(!session||session.closed)return;
    if(message.type==='input'){spatial.setInput(message);return;}
    if(message.type==='action') {
      const action={id:typeof message.id==='string'?message.id.slice(0,100):null,key:String(message.key||'.').slice(0,100),aim:typeof message.aim==='string'?message.aim.slice(0,1):null,spatialMelee:!!message.melee,yaw:Number.isFinite(message.yaw)?message.yaw:spatial.input.yaw,targetCell:message.targetCell&&Number.isFinite(message.targetCell.x)&&Number.isFinite(message.targetCell.z)?message.targetCell:null};
      if(Number.isInteger(message.pickup))action.pickup=message.pickup;
      if(Number.isInteger(message.itemId))action.itemId=message.itemId;
      if(action.key==='S'){clock.clearQueue();actions.clear('Saving expedition.');}
      actions.enqueue(action);
    }
    if(message.type==='release')spatial.release();
    if(message.type==='answer')session.answer(message.input||{kind:'key',value:27});
    if(message.type==='cancel'){actions.clear();session.cancel();}
  });
  ws.on('close',()=>spatial.release());
});
let lastTick=performance.now(),accumulator=0;
const tick=setInterval(()=>{
  const now=performance.now();accumulator+=Math.min(.1,(now-lastTick)/1000);lastTick=now;
  if(!session||session.closed||!spatial.player){accumulator=0;return;}
  while(accumulator>=1/60){
    const stairs=spatial.update(1/60);accumulator-=1/60;
    if(stairs){transitionAt=now;clock.enqueue({key:stairs});}
  }
  // Refused stairs (burden, missing pet, surface exit) must remain reversible.
  if(spatial.transition&&now-transitionAt>3500){spatial.transition=false;}
  if(++motionTicks%6===0)spatial.project(session);
  if(motionTicks%2===0)broadcast(spatial.packet());
  actions?.update();clock?.update();
},1000/60);
server.listen(port,'127.0.0.1',()=>console.log(`NetHack: Descent is running at http://127.0.0.1:${port}\nEngine: ${executable}\nRenderer: ${production?'production':'development'}`));
process.on('SIGINT',()=>{clearInterval(tick);session?.stop();wss.close();server.close();process.exit(0);});
