import {voiceGain} from './party-rules.js';

// Three peer links at most. Signaling is routed only inside the server-owned room.
// Follows the WebRTC perfect-negotiation pattern, including glare and queued ICE.
export class PartyVoice {
  constructor({send,onStatus=()=>{},onMeter=()=>{}}){Object.assign(this,{send,onStatus,onMeter});this.peers=new Map();this.enabled=false;this.pushToTalk=true;this.pressed=false;this.muted=false;this.deafened=false;this.players=[];this.generation=0;this.inputGeneration=0;this.volume=1;this.deviceId='';this.testing=false;try{const saved=JSON.parse(localStorage.getItem('descent.microphone')||'{}');this.deviceId=saved.deviceId||'';this.volume=Math.max(0,Math.min(2,Number(saved.volume??1)));}catch{}}
  configure(id,iceServers){this.id=id;this.iceServers=iceServers;}
  saveSettings(){try{localStorage.setItem('descent.microphone',JSON.stringify({deviceId:this.deviceId,volume:this.volume}));}catch{}}
  async devices(){return (await navigator.mediaDevices?.enumerateDevices()||[]).filter(d=>d.kind==='audioinput');}
  async prepareInput(deviceId=this.deviceId){
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Voice requires HTTPS on network addresses. Ask the host for the secure game URL.');
    const generation=this.generation,inputGeneration=++this.inputGeneration;
    const raw=await navigator.mediaDevices.getUserMedia({audio:{...(deviceId?{deviceId:{exact:deviceId}}:{}),echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false});
    if(generation!==this.generation||inputGeneration!==this.inputGeneration){raw.getTracks().forEach(t=>t.stop());return false;}
    if(!this.context){this.context=new AudioContext();this.inputGain=this.context.createGain();this.analyser=this.context.createAnalyser();this.analyser.fftSize=512;this.destination=this.context.createMediaStreamDestination();this.monitor=this.context.createGain();this.monitor.gain.value=0;this.inputGain.connect(this.analyser);this.inputGain.connect(this.destination);this.inputGain.connect(this.monitor);this.monitor.connect(this.context.destination);this.stream=this.destination.stream;}
    await this.context.resume();
    if(generation!==this.generation||inputGeneration!==this.inputGeneration){raw.getTracks().forEach(t=>t.stop());return false;}
    this.local?.disconnect();this.raw?.getTracks().forEach(t=>t.stop());this.raw=raw;this.local=this.context.createMediaStreamSource(raw);this.local.connect(this.inputGain);this.deviceId=deviceId;this.setVolume(this.volume);this.transmit();
    raw.getAudioTracks()[0].onended=()=>this.onStatus('Microphone disconnected. Choose another microphone in Party options.');
    cancelAnimationFrame(this.meterFrame);const meter=()=>{this.onMeter(Math.min(1,this.energy(this.analyser)*5));this.meterFrame=requestAnimationFrame(meter);};meter();return true;
  }
  async selectDevice(deviceId){if(this.context){if(!await this.prepareInput(deviceId))return;}else this.deviceId=deviceId;this.saveSettings();}
  setVolume(volume){this.volume=Math.max(0,Math.min(2,Number(volume)||0));if(this.inputGain)this.inputGain.gain.setTargetAtTime(this.volume,this.context.currentTime,.02);this.saveSettings();}
  async testMicrophone(active){
    if(active&&!this.context&&!await this.prepareInput())return;
    this.testing=active;this.pressed=false;this.transmit();
    if(this.monitor)this.monitor.gain.setTargetAtTime(active?1:0,this.context.currentTime,.02);
    this.onStatus(active?'Microphone test: listen to yourself and watch the meter. Use headphones. Your test is not sent to the party.':this.enabled?'Voice ready · microphone test stopped.':'Microphone is off.');
    if(!active&&!this.enabled)this.disable();
  }
  async enable(){
    if(this.enabled)return;
    if(!this.context&&!await this.prepareInput())return;
    this.testing=false;this.monitor.gain.value=0;this.enabled=true;this.transmit();this.send({type:'voice-state',enabled:true});this.roster(this.players);this.onStatus(this.pushToTalk?'Voice ready · hold B to talk':'Voice ready · open microphone');
  }
  transmit(){for(const track of this.stream?.getAudioTracks()||[])track.enabled=this.enabled&&!this.testing&&!this.muted&&(!this.pushToTalk||this.pressed);}
  press(value){this.pressed=value;this.transmit();}
  roster(players){this.players=players;const ids=new Set(players.filter(p=>p.id!==this.id&&p.connected&&p.voiceEnabled).map(p=>p.id));for(const id of this.peers.keys())if(!ids.has(id))this.remove(id);if(this.enabled)for(const id of ids)this.peer(id);}
  peer(id){
    if(this.peers.has(id))return this.peers.get(id);
    const pc=new RTCPeerConnection({iceServers:this.iceServers||[]}),peer={pc,polite:this.id.localeCompare(id)>0,makingOffer:false,ignoreOffer:false,settingAnswer:false,candidates:[],level:0,muted:false};this.peers.set(id,peer);
    pc.onicecandidate=({candidate})=>{if(candidate)this.send({type:'voice-signal',to:id,signal:{candidate:candidate.toJSON()}});};
    pc.onnegotiationneeded=async()=>{if(peer.polite)return;try{peer.makingOffer=true;await pc.setLocalDescription();this.send({type:'voice-signal',to:id,signal:{description:pc.localDescription.toJSON()}});}catch(error){if(pc.signalingState!=='closed')this.onStatus('Voice negotiation failed: '+error.message);}finally{peer.makingOffer=false;}};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'){this.onStatus('Voice connection failed. Check the host’s TURN configuration or re-enable voice.');pc.restartIce();}};
    pc.ontrack=({track,streams})=>{
      peer.source?.disconnect();peer.gain?.disconnect();peer.panner?.disconnect();peer.analyser?.disconnect();peer.audio?.pause();
      const stream=streams[0]||new MediaStream([track]);peer.source=this.context.createMediaStreamSource(stream);peer.analyser=this.context.createAnalyser();peer.analyser.fftSize=512;peer.gain=this.context.createGain();peer.gain.gain.value=0;peer.panner=this.context.createStereoPanner();
      // Chromium starts remote audio playout through a media element. Its muted
      // output avoids a second audible path; Web Audio owns spatial attenuation.
      peer.audio=new Audio();peer.audio.autoplay=true;peer.audio.muted=true;peer.audio.srcObject=stream;peer.audio.play().catch(()=>this.onStatus('Click Enable voice to allow audio playback.'));
      peer.source.connect(peer.analyser);peer.analyser.connect(peer.gain);peer.gain.connect(peer.panner);peer.panner.connect(this.context.destination);
    };
    for(const track of this.stream.getTracks())pc.addTrack(track,this.stream);
    return peer;
  }
  async signal(from,signal){
    if(!this.enabled||!this.players.some(p=>p.id===from&&p.connected))return;
    const peer=this.peer(from),pc=peer.pc;
    try{
      if(signal.description){
        const d=signal.description;if(!['offer','answer'].includes(d.type))return;
        const ready=!peer.makingOffer&&(pc.signalingState==='stable'||peer.settingAnswer),collision=d.type==='offer'&&!ready;
        peer.ignoreOffer=!peer.polite&&collision;if(peer.ignoreOffer)return;
        peer.settingAnswer=d.type==='answer';await pc.setRemoteDescription(d);peer.settingAnswer=false;
        for(const candidate of peer.candidates.splice(0))await pc.addIceCandidate(candidate);
        if(d.type==='offer'){await pc.setLocalDescription();this.send({type:'voice-signal',to:from,signal:{description:pc.localDescription.toJSON()}});}
      }else if(signal.candidate&&!peer.ignoreOffer){if(pc.remoteDescription)await pc.addIceCandidate(signal.candidate);else if(peer.candidates.length<100)peer.candidates.push(signal.candidate);}
    }catch(error){if(!peer.ignoreOffer&&pc.signalingState!=='closed')this.onStatus('Voice connection: '+error.message);}
  }
  energy(analyser){if(!analyser)return 0;const values=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(values);return Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length);}
  update(local,world){
    if(!this.enabled)return [];const talking=[];
    if(this.stream.getAudioTracks().some(t=>t.enabled)&&this.energy(this.analyser)>.008)talking.push(this.id);
    for(const [id,peer] of this.peers){
      const remote=this.players.find(p=>p.id===id),gain=this.deafened||peer.muted?0:voiceGain(local,remote,world);
      if(peer.gain)peer.gain.gain.setTargetAtTime(gain,this.context.currentTime,.08);
      if(remote&&local&&peer.panner){const dx=remote.x-local.x,dz=remote.z-local.z;peer.panner.pan.setTargetAtTime(Math.max(-1,Math.min(1,(dx*Math.cos(local.yaw||0)-dz*Math.sin(local.yaw||0))/Math.max(1,Math.hypot(dx,dz)))),this.context.currentTime,.08);}
      if(gain>.002&&this.energy(peer.analyser)>.008){peer.talkingUntil=performance.now()+200;}
      if(gain>.002&&peer.talkingUntil>performance.now())talking.push(id);
    }
    return talking;
  }
  remove(id){const peer=this.peers.get(id);if(!peer)return;peer.pc.close();peer.audio?.pause();if(peer.audio)peer.audio.srcObject=null;peer.source?.disconnect();peer.analyser?.disconnect();peer.gain?.disconnect();peer.panner?.disconnect();this.peers.delete(id);}
  disable(){this.generation++;this.inputGeneration++;this.enabled=false;this.testing=false;this.pressed=false;this.send({type:'voice-state',enabled:false});for(const id of [...this.peers.keys()])this.remove(id);cancelAnimationFrame(this.meterFrame);this.onMeter(0);this.raw?.getTracks().forEach(t=>t.stop());this.raw=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.local?.disconnect();this.analyser?.disconnect();this.inputGain?.disconnect();this.monitor?.disconnect();this.context?.close().catch(()=>{});this.context=null;}
}
