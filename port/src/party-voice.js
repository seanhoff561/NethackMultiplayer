import {voiceGain} from './party-rules.js';

// Three peer links at most. Signaling is routed only inside the server-owned room.
// Follows the WebRTC perfect-negotiation pattern, including glare and queued ICE.
export class PartyVoice {
  constructor({send,onStatus=()=>{}}){Object.assign(this,{send,onStatus});this.peers=new Map();this.enabled=false;this.pushToTalk=true;this.pressed=false;this.muted=false;this.deafened=false;this.players=[];this.generation=0;}
  configure(id,iceServers){this.id=id;this.iceServers=iceServers;}
  async enable(){
    if(this.enabled)return;
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Voice requires HTTPS on network addresses. Ask the host for the secure game URL.');
    const generation=this.generation;
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
    this.stream=stream;this.context=new AudioContext();await this.context.resume();this.local=this.context.createMediaStreamSource(stream);this.analyser=this.context.createAnalyser();this.analyser.fftSize=512;this.local.connect(this.analyser);this.enabled=true;this.transmit();this.send({type:'voice-state',enabled:true});this.roster(this.players);this.onStatus('Voice ready · hold B to talk');
  }
  transmit(){for(const track of this.stream?.getAudioTracks()||[])track.enabled=this.enabled&&!this.muted&&(!this.pushToTalk||this.pressed);}
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
  disable(){this.generation++;this.enabled=false;this.pressed=false;this.send({type:'voice-state',enabled:false});for(const id of [...this.peers.keys()])this.remove(id);this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.local?.disconnect();this.analyser?.disconnect();this.context?.close().catch(()=>{});this.context=null;}
}
