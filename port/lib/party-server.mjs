import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync,renameSync,readFileSync} from 'node:fs';
import {PartyDungeon} from './party-dungeon.mjs';
import {PartySimulation} from './party-simulation.mjs';
import {startJump} from '../src/spatial.js';

export class PartyServer {
  constructor({root,runtime,executable,iceServers=[]}){Object.assign(this,{root,runtime,executable,iceServers});this.rooms=new Map();this.connections=new Map();this.tickCount=0;}
  send(ws,event){if(ws?.readyState===1&&ws.bufferedAmount<2_000_000)ws.send(JSON.stringify(event));else if(ws?.bufferedAmount>=2_000_000)ws.close(1013,'Connection is too slow; reconnect to resync.');}
  save(room){
    const folder=path.join(this.runtime,'parties');mkdirSync(folder,{recursive:true});const file=path.join(folder,room.code+'.json'),temp=file+'.tmp';
    try{writeFileSync(temp,JSON.stringify(room.serialize()));renameSync(temp,file);return true;}catch(error){room.broadcast({type:'notice',text:'Party save failed: '+error.message});return false;}
  }
  room(code,create){
    if(this.rooms.has(code))return this.rooms.get(code);
    const saveFile=path.join(this.runtime,'parties',code+'.json');
    if(!create&&!existsSync(saveFile))throw Error('No party has that code on this server.');
    if(this.rooms.size>=8)for(const [id,room] of this.rooms){if(!room.loading.size&&![...room.players.values()].some(p=>p.connected)&&this.save(room)){room.generator.stop?.();this.rooms.delete(id);if(this.rooms.size<8)break;}}
    if(this.rooms.size>=8)throw Error('This server has reached its party limit.');
    const room=new PartySimulation({code,generator:new PartyDungeon({executable:process.env.NETHACK_COOP_ENGINE||path.join(this.root,'engine/bin/nethack-engine-coop-v08.exe'),data:path.join(this.root,'engine/data'),cwd:path.join(this.runtime,'party-generators',code)}),send:(id,event)=>this.send(this.connections.get(id),event),save:r=>this.save(r)});
    if(existsSync(saveFile))room.restore(JSON.parse(readFileSync(saveFile,'utf8')));this.rooms.set(code,room);return room;
  }
  async handle(ws,m){
    if(m.type==='party-create'||m.type==='party-join'){
      if(ws.partyJoining||ws.party)return true;ws.partyJoining=true;ws.gameMode='party';
      try{
        const create=m.type==='party-create',code=create?randomBytes(4).toString('hex').toUpperCase():String(m.code||'').toUpperCase();
        if(!/^[A-F0-9]{8}$/.test(code))throw Error('Enter the eight-character party code.');
        const room=this.room(code,create);
        const previous=[...room.players.values()].find(p=>m.token&&p.token===m.token&&p.connected);
        if(previous){const old=this.connections.get(previous.id);if(old){old.party=null;old.close(4001,'Character reclaimed by its reconnect credential.');this.connections.delete(previous.id);}room.disconnect(previous.id);}
        const p=await room.join(m.character,m.token);
        if(ws.readyState!==1){room.disconnect(p.id);return true;}
        ws.party={room,id:p.id};this.connections.set(p.id,ws);
        this.send(ws,{type:'party-joined',code,id:p.id,token:p.token,iceServers:this.iceServers});room.roster();room.sync(p);room.notify(`${p.name} ${m.token?'returned to':'joined'} the expedition.`);this.save(room);
      }catch(error){this.send(ws,{type:'party-error',text:error.message});}finally{ws.partyJoining=false;}
      return true;
    }
    if(!ws.party)return false;
    const {room,id}=ws.party,p=room.players.get(id);if(!p)return true;
    if(m.type==='party-leave'){room.leave(id);this.connections.delete(id);ws.party=null;this.send(ws,{type:'party-left'});return true;}
    if(m.type==='party-release-seat'){const target=room.players.get(m.playerId);if(id===room.hostId&&target&&!target.connected)room.leave(target.id);return true;}
    if(m.type==='voice-state'){p.voiceEnabled=!!m.enabled;room.roster();}
    else if(m.type==='voice-signal'){
      const target=room.players.get(m.to);
      if(p.voiceEnabled&&target?.voiceEnabled&&target.connected&&target.id!==id&&JSON.stringify(m.signal||{}).length<16000)this.send(this.connections.get(target.id),{type:'voice-signal',from:id,signal:m.signal});
    }
    else if(m.type==='input')room.input(p,m);
    else if(m.type==='jump'&&p.hp>0&&!p.transition&&!room.outcome){room.cancelRevive(p);startJump(p.body);}
    else if(m.type==='release')p.input={yaw:p.input.yaw||0};
    else if(m.type==='defend'){if(m.active)room.cancelRevive(p);p.input.defend=!!m.active;p.inputAt=room.time;}
    else if(m.type==='revive-cancel')room.cancelRevive(p);
    else if(m.type==='action')await room.action(p,m);
    else if(m.type==='answer')room.answer(p,m);
    else if(m.type==='cancel'){p.prompt=null;this.send(ws,{type:'clearPrompt'});}
    else if(m.type==='new-run')this.send(ws,{type:'notice',text:'Use Party → Leave party to start a different character. Your party is saved automatically.'});
    return true;
  }
  disconnect(ws){if(ws.party){const {room,id}=ws.party;this.connections.delete(id);room.disconnect(id);ws.party=null;}}
  tick(dt){
    this.tickCount++;
    for(const room of this.rooms.values()){
      room.tick(dt);
      for(const p of room.players.values())if(p.connected&&p.body){if(this.tickCount%2===0)this.send(this.connections.get(p.id),room.motion(p));if(this.tickCount%30===0)this.send(this.connections.get(p.id),room.snapshot(p));}
      if(this.tickCount%1800===0&&[...room.players.values()].some(p=>p.connected))this.save(room);
    }
  }
  close(){for(const room of this.rooms.values()){this.save(room);room.generator.stop();}}
}
