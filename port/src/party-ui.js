import {PartyVoice} from './party-voice.js';

const make=(tag,className,text)=>Object.assign(document.createElement(tag),{className,textContent:text||''});
export class PartyUI {
  constructor({send,connect,onNotice,onMenu,onRevive,onLeave}){
    Object.assign(this,{send,connect,onNotice,onMenu,onRevive,onLeave});this.players=[];this.voice=new PartyVoice({send,onStatus:text=>{this.voiceStatus.textContent=text;},onMeter:value=>{if(this.micMeter)this.micMeter.value=value;}});
    const form=document.querySelector('#character-form'),row=make('div','party-start');
    row.innerHTML='<label class="field-label" for="expedition-mode">EXPEDITION</label><select id="expedition-mode"><option value="solo">Solo expedition</option><option value="create">Create a party · up to 4 players</option><option value="join">Join a party</option></select><label id="party-code-field" hidden><span class="field-label">PARTY CODE</span><input id="party-code" maxlength="8" autocomplete="off" placeholder="8-character code" spellcheck="false"></label>';
    form.querySelector('#enter-dungeon').before(row);this.mode=row.querySelector('select');this.code=row.querySelector('input');this.mode.addEventListener('change',()=>{row.querySelector('#party-code-field').hidden=this.mode.value!=='join';});
    const stored=this.saved();if(stored){const resume=make('button','continue-button','Rejoin saved party');resume.type='button';resume.id='rejoin-party';row.append(resume);resume.onclick=()=>this.start(null,true);}
    this.hud=make('aside','party-hud');this.hud.hidden=true;this.hud.setAttribute('aria-label','Party and proximity voice');
    this.header=make('button','party-open','Party');this.header.onclick=()=>{this.onMenu();this.showMenu();};this.hud.append(this.header);
    this.speakers=make('div','party-speakers');this.speakers.setAttribute('aria-label','Nearby players speaking');this.hud.append(this.speakers);document.querySelector('.game-hud').append(this.hud);
    this.reviveHud=make('div','party-revive-progress');this.reviveHud.hidden=true;this.reviveHud.innerHTML='<span></span><progress max="1" value="0"></progress><button>Cancel revival</button>';this.reviveHud.querySelector('button').onclick=()=>send({type:'revive-cancel'});document.body.append(this.reviveHud);
    this.resultPanel=make('section','party-result');this.resultPanel.hidden=true;this.resultPanel.innerHTML='<span class="overline">EXPEDITION COMPLETE</span><h1></h1><p></p><button class="primary-button">New expedition</button>';this.resultPanel.querySelector('button').onclick=()=>send({type:'party-leave'});document.body.append(this.resultPanel);
    this.panel=make('section','party-panel');this.panel.hidden=true;this.panel.setAttribute('role','dialog');this.panel.setAttribute('aria-label','Party');
    this.panel.innerHTML='<div class="party-panel-head"><div><span class="overline">THE EXPEDITION</span><h2>Your companions</h2></div><button id="party-close" aria-label="Close party menu">×</button></div><p id="party-invite"></p><button id="party-copy">Copy invitation</button><div id="party-members"></div><div class="party-voice-controls"><button id="voice-enable">Enable proximity voice</button><button id="voice-mute" disabled>Mute microphone</button><button id="voice-deafen" disabled>Deafen</button><label><input type="checkbox" id="voice-ptt" checked> Hold B to talk</label><p id="voice-status">Microphone is off. Voices fade with distance and are muffled by walls.</p></div><div class="party-actions"><button id="party-revive">Revive nearby ally</button><button id="party-save">Save party</button><button id="party-leave">Leave party</button></div>';
    document.body.append(this.panel);this.voiceStatus=this.panel.querySelector('#voice-status');
    const micControls=make('div','party-microphone');micControls.innerHTML='<label for="voice-device">Microphone</label><select id="voice-device"><option value="">System default microphone</option></select><label for="voice-volume">Microphone volume <output id="voice-volume-label"></output></label><input id="voice-volume" type="range" min="0" max="200" step="1"><div class="party-mic-test"><button id="voice-test">Test microphone</button><meter id="voice-meter" min="0" max="1" low="0.03" high="0.85" optimum="0.4" aria-label="Microphone input level"></meter></div>';
    this.voiceStatus.before(micControls);this.micMeter=micControls.querySelector('meter');this.micDevice=micControls.querySelector('select');this.micDevice.value=this.voice.deviceId;
    const volume=micControls.querySelector('#voice-volume'),volumeLabel=micControls.querySelector('output');volume.value=Math.round(this.voice.volume*100);volumeLabel.textContent=volume.value+'%';volume.oninput=()=>{this.voice.setVolume(Number(volume.value)/100);volumeLabel.textContent=volume.value+'%';};
    this.micDevice.onchange=async()=>{this.micDevice.disabled=true;try{await this.voice.selectDevice(this.micDevice.value);this.voiceStatus.textContent='Microphone selected.';}catch(e){this.micDevice.value=this.voice.deviceId;this.voiceStatus.textContent='Unable to use that microphone: '+e.message;}finally{this.micDevice.disabled=false;}};
    micControls.querySelector('#voice-test').onclick=async()=>{const b=micControls.querySelector('#voice-test');b.disabled=true;try{await this.voice.testMicrophone(!this.voice.testing);await this.refreshDevices();}catch(e){this.voiceStatus.textContent=e.message;}finally{b.textContent=this.voice.testing?'Stop microphone test':'Test microphone';b.disabled=false;}};
    navigator.mediaDevices?.addEventListener('devicechange',()=>this.refreshDevices());
    this.objective=make('p','party-objective');this.panel.querySelector('#party-members').before(this.objective);
    for(const [label,key] of [['Speak to quest leader','#chat'],['Perform invocation','#invoke'],['Offer Amulet / sacrifice','#offer']]){const b=make('button','',label);b.onclick=()=>{this.hideMenu();this.send({type:'action',id:crypto.randomUUID(),key});};this.panel.querySelector('.party-actions').append(b);}
    const button=(id,fn)=>this.panel.querySelector(id).onclick=fn;
    button('#party-close',()=>this.hideMenu());button('#party-copy',async()=>{try{await navigator.clipboard.writeText(`${location.origin}/?party=${this.partyCode}`);this.onNotice('Party invitation copied. On another computer, use the host’s network address.');}catch{this.onNotice(`Share ${location.origin}/?party=${this.partyCode}`);}});
    button('#voice-enable',async()=>{const b=this.panel.querySelector('#voice-enable');b.disabled=true;try{if(this.voice.enabled){this.voice.disable();b.textContent='Enable proximity voice';this.voiceStatus.textContent='Microphone is off.';}else {await this.voice.enable();b.textContent=this.voice.enabled?'Disable voice':'Enable proximity voice';await this.refreshDevices();}this.panel.querySelector('#voice-test').textContent='Test microphone';this.panel.querySelector('#voice-mute').disabled=!this.voice.enabled;this.panel.querySelector('#voice-deafen').disabled=!this.voice.enabled;}catch(e){this.voiceStatus.textContent=e.message;}finally{b.disabled=false;}});
    button('#voice-mute',()=>{this.voice.muted=!this.voice.muted;this.voice.transmit();this.panel.querySelector('#voice-mute').textContent=this.voice.muted?'Unmute microphone':'Mute microphone';});
    button('#voice-deafen',()=>{this.voice.deafened=!this.voice.deafened;this.panel.querySelector('#voice-deafen').textContent=this.voice.deafened?'Undeafen':'Deafen';});
    this.panel.querySelector('#voice-ptt').onchange=e=>{this.voice.pushToTalk=e.target.checked;this.voice.transmit();this.voiceStatus.textContent=e.target.checked?'Voice ready · hold B to talk':'Open microphone · use Mute to stop transmitting';};
    button('#party-revive',()=>{this.hideMenu();this.onRevive();});button('#party-save',()=>send({type:'action',id:crypto.randomUUID(),key:'S'}));button('#party-leave',()=>send({type:'party-leave'}));
    document.addEventListener('keydown',e=>{if(e.code==='KeyB'&&this.id&&!e.target.matches('input,textarea,select')){this.voice.press(true);e.preventDefault();}if(e.code==='Escape'&&!this.panel.hidden){e.stopImmediatePropagation();e.preventDefault();this.hideMenu();}},true);
    document.addEventListener('keyup',e=>{if(e.code==='KeyB')this.voice.press(false);},true);window.addEventListener('blur',()=>this.voice.press(false));document.addEventListener('visibilitychange',()=>{if(document.hidden)this.voice.press(false);});
    const invitation=new URLSearchParams(location.search).get('party');if(invitation){this.mode.value='join';this.code.value=invitation;row.querySelector('#party-code-field').hidden=false;}
  }
  saved(){try{return JSON.parse(sessionStorage.getItem('descent.party')||localStorage.getItem('descent.party.recent')||'null');}catch{return null;}}
  start(character,resume=false){
    const stored=resume?this.saved():null;
    if(!resume&&this.mode.value==='solo')return false;
    this.pending=stored?{type:'party-join',...stored}:{type:this.mode.value==='create'?'party-create':'party-join',code:this.code.value.trim().toUpperCase(),character};
    this.connect();return true;
  }
  ready(){if(this.pending){this.send(this.pending);this.pending=null;}else {const saved=this.saved();if(saved)this.send({type:'party-join',...saved});}}
  handle(data){
    if(data.type==='party-result'){this.result=data;this.hideMenu();this.reviveHud.hidden=true;this.resultPanel.hidden=false;this.resultPanel.querySelector('h1').textContent=data.status==='victory'?'You ascend together.':'The party has fallen.';this.resultPanel.querySelector('p').textContent=data.text;return true;}
    if(data.type==='party-joined'){this.id=data.id;this.partyCode=data.code;try{const saved=JSON.stringify({code:data.code,token:data.token});sessionStorage.setItem('descent.party',saved);localStorage.setItem('descent.party.recent',saved);}catch{}this.voice.configure(data.id,data.iceServers);this.hud.hidden=false;this.header.textContent=`Party ${data.code} · menu`;this.panel.querySelector('#party-invite').textContent=`Invite friends to this server with code ${data.code}. Up to four adventurers.`;return true;}
    if(data.type==='party-roster'){this.players=data.players;this.voice.roster(this.players);this.renderMembers(data.hostId);return true;}
    if(data.type==='voice-signal'){this.voice.signal(data.from,data.signal||{});return true;}
    if(data.type==='party-error'){this.onNotice(data.text);return true;}
    if(data.type==='party-left'){this.voice.disable();sessionStorage.removeItem('descent.party');localStorage.removeItem('descent.party.recent');this.id=null;this.hud.hidden=true;this.panel.hidden=true;this.onLeave();return true;}
    return false;
  }
  renderMembers(hostId){
    const root=this.panel.querySelector('#party-members');root.replaceChildren();
    for(const p of this.players){const row=make('div','party-member');row.append(make('b','',p.name+(p.id===hostId?' · leader':'')),make('span','',`${p.role} · ${p.connected?(p.location||'Dungeon')+' · '+(p.depthLabel??p.levelId.split(':').at(-1)):'Disconnected · seat reserved'}`));if(!p.connected&&hostId===this.id){const release=make('button','','Release seat');release.title='Remove this disconnected character and leave their equipment on the floor';release.onclick=()=>this.send({type:'party-release-seat',playerId:p.id});row.append(release);}else if(p.id!==this.id){const mute=make('button','',this.voice.peers.get(p.id)?.muted?'Unmute':'Mute');mute.onclick=()=>{const peer=this.voice.peers.get(p.id);if(peer){peer.muted=!peer.muted;mute.textContent=peer.muted?'Unmute':'Mute';}};row.append(mute);}root.append(row);}
  }
  async refreshDevices(){try{const devices=await this.voice.devices();this.micDevice.replaceChildren(new Option('System default microphone',''),...devices.map((d,i)=>new Option(d.label||`Microphone ${i+1}`,d.deviceId)));if(this.voice.deviceId&&!devices.some(d=>d.deviceId===this.voice.deviceId))this.micDevice.append(new Option('Previously selected microphone (unavailable)',this.voice.deviceId));this.micDevice.value=this.voice.deviceId;}catch{}}
  showMenu(){this.panel.hidden=false;this.panel.querySelector('#party-close').focus();this.refreshDevices();}
  hideMenu(){this.panel.hidden=true;if(this.voice.testing){this.voice.testMicrophone(false);this.panel.querySelector('#voice-test').textContent='Test microphone';}}
  update(packet,body,world){
    if(!this.id||!packet)return;
    if(packet.campaign)this.objective.textContent=`${packet.campaign.owner.name}’s ${packet.campaign.owner.role} campaign · ${packet.campaign.objective}`;
    const revive=packet.revive;this.reviveHud.hidden=!revive||!!this.result;
    if(revive){const target=packet.players?.find(p=>p.id===revive.targetId);this.reviveHud.querySelector('span').textContent=`Reviving ${target?.name||'companion'} · ${Math.ceil(revive.remaining)}s — stay still`;this.reviveHud.querySelector('progress').value=revive.progress;}
    this.players=packet.players||this.players;this.voice.players=this.players;
    const local={...this.players.find(p=>p.id===this.id),...body,levelId:packet.levelId},talking=this.voice.update(local,world),signature=talking.join(':');
    if(signature!==this.speakerSignature){this.speakerSignature=signature;this.speakers.replaceChildren();for(const id of talking){const p=this.players.find(p=>p.id===id);if(p)this.speakers.append(make('div','party-speaker',`▮▮▮  ${p.name}${id===this.id?' (you)':''}`));}}
  }
  disconnected(){this.voice.disable();this.speakers.replaceChildren();this.panel.querySelector('#voice-enable').textContent='Enable proximity voice';this.voiceStatus.textContent='Connection lost. Re-enable voice after reconnecting.';}
}
