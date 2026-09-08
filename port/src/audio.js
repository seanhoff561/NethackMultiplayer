/** Procedural dungeon soundscape. Nothing is fetched and audio starts on user input. */
import {AUDIO_DEFAULTS,SCORES,scoreFor,creatureVoice,soundPosition} from './soundscape.js';
export class DungeonAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = true;
    this.lastStep = 0;
    this.nextDrip = 0;
    this.time = 0;
    this.nextCreak=8;this.nextEmber=0;
    Object.assign(this,AUDIO_DEFAULTS);this.voices=new Set();this.actorSounds=new Map();this.events=[];this.cooldowns=new Map();this.airborne=false;this.bus='effects';this.area='dungeon';
  }

  async start() {
    if (!this.enabled) return;
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * .46;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 5;
      // Two gentle low-pass stages keep incidental effects from producing
      // the piercing hiss/chirps of the previous procedural soundscape.
      const soften=this.context.createBiquadFilter(),rolloff=this.context.createBiquadFilter();
      for(const filter of [soften,rolloff]){filter.type='lowpass';filter.frequency.value=1700;filter.Q.value=.55;}
      this.master.connect(soften);soften.connect(rolloff);rolloff.connect(compressor);
      compressor.connect(this.context.destination);

      this.reverb = this.context.createConvolver();
      const length = Math.floor(this.context.sampleRate * 2.5);
      const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.6) * 0.35;
        }
      }
      this.reverb.buffer = impulse;
      const wet = this.context.createGain();this.wet=wet;
      wet.gain.value = 0.25;
      this.reverb.connect(wet);
      wet.connect(this.master);
      this.buses={};
      for(const name of ['effects','ambience','music','interface','footsteps']){
        const bus=this.context.createGain();this.buses[name]=bus;
        bus.connect(name==='footsteps'||name==='interface'?this.buses.effects:this.master);
        if(!['footsteps','interface'].includes(name))bus.connect(this.reverb);
      }
      this.setSettings(this);

      // A quiet synthesized air bed with a smoothed loop seam.
      const airBuffer = this.context.createBuffer(1, this.context.sampleRate * 4, this.context.sampleRate);
      const air = airBuffer.getChannelData(0);
      let value = 0;
      for (let i = 0; i < air.length; i++) {
        value = (value + (Math.random() * 2 - 1) * 0.02) / 1.02;
        air[i] = value;
      }
      const seam=Math.floor(this.context.sampleRate*.25),last=air.length-1;
      for(let i=0;i<seam;i++){const t=i/(seam-1);air[last-seam+1+i]=air[last-seam+1+i]*(1-t)+air[0]*t;}
      this.air = this.context.createBufferSource();
      this.air.buffer = airBuffer;
      this.air.loop = true;
      const airFilter = this.context.createBiquadFilter();
      airFilter.type = 'lowpass';
      airFilter.frequency.value = 310;
      const airGain = this.context.createGain();this.airGain=airGain;
      airGain.gain.value = 0;
      this.air.connect(airFilter);
      airFilter.connect(airGain);
      airGain.connect(this.buses.ambience);
      this.air.start();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  _tone(start, duration, from, to, volume, type = 'sine', wet = true, pan = 0) {
    if (!this.context || !this.enabled || this.context.state !== 'running' || this.voices.size>=100) return;
    const at = this.context.currentTime + start;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    const route=this._route(gain,pan,wet);
    this._track(oscillator,[gain,...route]);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  _noise(duration, volume, frequency, type = 'lowpass', start = 0, pan = 0) {
    if (!this.context || !this.enabled || this.context.state !== 'running' || this.voices.size>=100) return;
    const length = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.min(1,i/(this.context.sampleRate*.008)) * Math.pow(1 - i / length, 2);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = type;
    filter.frequency.value = frequency;
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    const route=this._route(gain,pan,true);
    this._track(source,[filter,gain,...route]);
    source.start(this.context.currentTime + start);
  }

  _route(gain,pan,wet){
    const panner=this.context.createStereoPanner();panner.pan.value=Math.max(-1,Math.min(1,pan));
    gain.connect(panner);panner.connect(this.buses[this.bus]||this.buses.effects);return [panner];
  }
  _track(source,nodes,bus=this.bus){
    const voice={source,nodes,bus};this.voices.add(voice);
    source.onended=()=>{source.disconnect();nodes.forEach(n=>n.disconnect());this.voices.delete(voice);};
  }
  _in(bus,fn){const previous=this.bus;this.bus=bus;try{return fn();}finally{this.bus=previous;}}
  _event(name,interval=.06){
    if(!this.context||!this.enabled||this.context.state!=='running')return false;
    const now=this.context.currentTime;if(now-(this.cooldowns.get(name)??-100)<interval)return false;
    if(this.cooldowns.size>250)for(const [key,time] of this.cooldowns)if(now-time>60)this.cooldowns.delete(key);
    this.cooldowns.set(name,now);this.events.push({name,time:now});if(this.events.length>80)this.events.shift();return true;
  }

  step(running = false, terrain = 'floor', crouch = false) {
    if (!this.context || this.airborne) return;
    const now = this.context.currentTime;
    if (now - this.lastStep < (running ? 0.22 : 0.33)) return;
    this.lastStep = now;
    this._event('footstep',0);
    return this._in('footsteps',()=>{
    const volume=crouch?.45:1,pan=(this.footSide=!this.footSide)?.12:-.12;
    this._noise(0.12, (running ? 0.28 : 0.18)*volume, 380 + Math.random() * 160,'lowpass',0,pan);
    if(terrain==='water')this._noise(.25,.22*volume,650,'lowpass',.02,pan);
    this._tone(0, 0.13, 76 + Math.random() * 20, 43, (running ? 0.27 : 0.17)*volume, 'sine',true,pan);
    this._noise(.12,.027*volume,480,'lowpass',.04,pan);
    });
  }

  attack(kind = 'melee',weapon='') {
    if(!this._event('attack',.12))return;
    if (/spell|cast|magic|fire|frost|heal/.test(kind)) return this.spell(kind);
    if (/ranged|fire|bow|throw/.test(kind)) {
      this._noise(0.12, 0.19, 900, 'lowpass');
      this._tone(0, 0.13, 250, 80, 0.16, 'triangle');
      return;
    }
    const heavy=/axe|hammer|mace|club|sword.*two|two.handed/.test(weapon),light=/dagger|knife|bare hands/.test(weapon);
    this._noise(heavy?.32:light?.16:.24,.26,heavy?580:light?720:850,'lowpass',.1,-.18);
    this._noise(.16,.12,620,'lowpass',.22,.25);
    this._tone(.11,.19,230,70,.04,'triangle',false);
  }

  impact(){
    if(!this._event('impact',.09))return;
    this._noise(.1,.36,750,'lowpass');this._noise(.075,.11,850,'lowpass');
    this._tone(0,.16,135,50,.24,'sine');this._noise(.12,.04,620,'bandpass',.03);
  }

  hit() {
    if(!this._event('hurt',.18))return;
    this._noise(0.16, 0.48, 1200);
    this._tone(0, 0.17, 150, 44, 0.43, 'triangle');
    this._noise(.26,.055,510,'lowpass');
  }

  spell(kind = 'magic') {
    if(!this._event('spell',.3))return;
    const base=/heal/.test(kind)?130:90;
    this._noise(.7,.17,850,'lowpass');
    for(let i=0;i<3;i++)this._tone(i*.06,.65,base*(1+i*.25),base*(2+i*.3),.025,'sine');
  }

  pickup(name = '') {
    if(!this._event('pickup',.07))return;
    this._noise(.2,.13,570,'lowpass');
    this._tone(0,.12,115,65,.055,'sine',false);
    if(/gold|coin|zorkmid|sword|shield/.test(name))this._noise(.085,.07,750,'bandpass',.065);
  }

  door(open=true,spatial={gain:1,pan:0}) {
    if(!this._event('door',.12)||!spatial.gain)return;
    const volume=spatial.gain,pan=spatial.pan||0;
    this._noise(open?.55:.22,.2*volume,330,'lowpass',0,pan);
    this._tone(0,.4,open?82:65,42,.08*volume,'triangle',true,pan);
    this._noise(.14,.17*volume,560,'lowpass',open?.4:.12,pan);
  }

  jump(){
    this.airborne=true;
    for(const v of this.voices)if(v.bus==='footsteps'){try{const now=this.context.currentTime,gain=v.nodes?.find(n=>n.gain)?.gain;gain?.cancelAndHoldAtTime(now);gain?.linearRampToValueAtTime(0,now+.02);v.source.stop(now+.025);}catch{}}
    if(!this._event('jump',.25))return;
    this._noise(.19,.2,480);this._tone(0,.18,86,53,.1,'sine');
    this._noise(.3,.045,600,'lowpass',.06);
  }
  movement(airborne,terrain='floor'){
    if(this.airborne&&!airborne)this.land(terrain);
    this.airborne=airborne;
  }
  land(terrain='floor'){
    if(!this._event('land',.28))return;
    this.lastStep=this.context.currentTime+.12;
    this._noise(.26,.28,terrain==='water'?650:370);this._tone(0,.24,92,37,.25);
    this._noise(.18,.07,540,'lowpass',.08);
  }
  interface(kind='open'){
    if(!this._event(`ui-${kind}`,kind==='select'?.06:.15))return;
    this._in('interface',()=>{
      this._noise(kind==='open'?.22:.13,.075,kind==='select'?460:650);
      this._tone(0,.08,kind==='close'?75:105,55,.035,'sine',false);
    });
  }
  guard(raised,shield=false){
    if(!this._event('guard',.15))return;
    this._noise(.16,raised?.09:.045,shield?530:410);this._tone(0,.11,shield?128:90,63,.025,'triangle');
  }
  levelUp(){
    if(!this._event('level-up',1))return;
    [130.81,155.56,196,261.63].forEach((note,i)=>this._note(this.context.currentTime+i*.2,1.7,note,.07,'effects',null,.12));
    this._noise(.8,.055,520);
  }
  playerDeath(){
    if(!this._event('player-death',2))return;
    this._noise(1.3,.2,260);this._tone(0,1.8,75,29,.22);this._tone(.3,1.6,110,41,.07);
  }
  item(kind='equip'){
    if(!this._event(`item-${kind}`,.15))return;
    if(kind==='drink'){this._noise(.33,.12,440);this._noise(.18,.09,330,'bandpass',.2);}
    else if(kind==='eat'){this._noise(.2,.09,350);this._noise(.17,.07,430,'lowpass',.22);}
    else if(kind==='read')this.interface('page');
    else {this._noise(.25,.12,620);this._tone(.05,.14,145,83,.035,'triangle');}
  }
  creature(actor,action='idle',spatial={gain:1,pan:0}){
    if(!actor||!spatial.gain||action==='step'&&creatureVoice(actor).floating||!this._event(`creature-${actor.id}-${action}`,action==='death'?3:action==='step'?.15:.5))return;
    const v=creatureVoice(actor),pan=spatial.pan||0,gain=spatial.gain,pitch=v.pitch*(.94+Math.random()*.12);
    if(action==='step'){
      if(v.floating)return;
      this._noise(.1,.12*v.weight*gain,320,'lowpass',0,pan);
      this._tone(0,.13,65*v.weight+20,34,.085*v.weight*gain,'sine',true,pan);return;
    }
    const death=action==='death',attack=action==='attack',duration=death?.75:attack?.34:.6,volume=(death?.19:attack?.15:.055)*gain;
    this._noise(duration,volume,v.kind==='undead'?400:v.kind==='crawler'?600:280,'bandpass',0,pan);
    if(v.kind!=='crawler'&&v.kind!=='air'){
      this._tone(0,duration,pitch,death?pitch*.48:pitch*.82,volume*.65,'triangle',true,pan);
      this._tone(.025,duration*.85,pitch*1.5,pitch*(death?.65:1.3),volume*.2,'sine',true,pan);
    }
    if(death&&!v.floating){this._noise(.28,.2*gain,300,'lowpass',.32,pan);this._tone(.32,.24,70,32,.11*gain,'sine',true,pan);}
    if(attack)this._noise(.19,.1*gain,650,'lowpass',.12,pan);
  }

  _note(at,duration,frequency,volume,bus='music',layer=null,attack=.7){
    if(!this.context||this.context.state!=='running'||this.voices.size>90)return;
    const c=this.context,osc=c.createOscillator(),overtone=c.createOscillator(),gain=c.createGain(),harmonic=c.createGain(),filter=c.createBiquadFilter();
    const melody=bus==='music'&&duration<4,mallet=melody&&['mines','sokoban'].includes(this.area);
    if(mallet){duration*=.65;attack=.045;}
    osc.type=bus==='music'&&this.area==='fortress'?'triangle':'sine';osc.frequency.value=frequency;overtone.type='triangle';overtone.frequency.value=frequency*(mallet&&this.area==='mines'?2.76:2);overtone.detune.value=2.5;harmonic.gain.value=mallet?.19:.14;
    filter.type='lowpass';filter.frequency.value=SCORES[this.area].color;filter.Q.value=.45;
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+Math.min(attack,duration*.25));
    gain.gain.exponentialRampToValueAtTime(volume*.65,at+duration*.6);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(filter);overtone.connect(harmonic);harmonic.connect(filter);filter.connect(gain);gain.connect(layer||this.buses[bus]);
    this._track(osc,[gain,filter,harmonic],bus);this._track(overtone,[],bus);
    osc.start(at);overtone.start(at);osc.stop(at+duration+.02);overtone.stop(at+duration+.02);
  }
  _music(playing,area){
    if(!this.buses)return;
    const c=this.context,now=c.currentTime,next=scoreFor(area);
    this.buses.music.gain.setTargetAtTime(playing&&this.musicEnabled?this.musicVolume:0,now,playing&&this.musicEnabled?.7:.18);
    if(!playing||!this.musicEnabled){if(this.musicLayer)this._stopMusic();this.nextBar=now;return;}
    if(next!==this.area||!this.musicLayer){
      if(this.musicLayer){const old=this.musicLayer;old.gain.cancelScheduledValues(now);old.gain.setTargetAtTime(0,now,.8);this.retiredLayers??=[];this.retiredLayers.push({node:old,until:now+12});}
      this.area=next;this.musicLayer=c.createGain();this.musicLayer.gain.setValueAtTime(.0001,now);this.musicLayer.gain.linearRampToValueAtTime(1,now+4);this.musicLayer.connect(this.buses.music);this.bar=0;this.nextBar=now+.1;
      this._event(`music-${next}`,0);
    }
    this.retiredLayers=(this.retiredLayers||[]).filter(l=>{if(now<l.until)return true;l.node.disconnect();return false;});
    if(now<(this.nextBar??now)-.2)return;
    const score=SCORES[this.area],beat=60/score.tempo,at=Math.max(now+.04,this.nextBar||0),root=score.root+score.chords[this.bar%4],hz=n=>440*2**((n-69)/12);
    this._note(at,beat*8.6,hz(root),.13,'music',this.musicLayer,1.5);
    for(const interval of [7,15])this._note(at+.12,beat*8,hz(root+interval),.052,'music',this.musicLayer,1.2);
    for(let i=0;i<4;i++)this._note(at+(i*2+.5)*beat,beat*2.2,hz(score.root+score.melody[(this.bar*4+i)%8]),.065,'music',this.musicLayer,.18);
    this.bar++;this.nextBar=at+beat*8;
  }

  actors(dt,entities,listener,collision){
    if(!this.context||!entities)return;
    this.actorTick=(this.actorTick||0)+dt;if(this.actorTick<.08)return;this.actorTick%=.08;
    const audible=[];
    for(const [key,e] of entities){
      if(e.deathAt)continue;
      const point=e.group.position,spatial=soundPosition(point,listener,collision),previous=this.actorSounds.get(key);
      const state=previous||{x:point.x,z:point.z,stride:0,nextVoice:this.time+4+Math.random()*14};
      const distance=Math.hypot(point.x-state.x,point.z-state.z);state.x=point.x;state.z=point.z;
      if(distance<1)state.stride+=distance;
      this.actorSounds.set(key,state);
      if(spatial.distance<16&&spatial.gain>.025)audible.push({e,spatial,state});
    }
    for(const key of this.actorSounds.keys())if(!entities.has(key))this.actorSounds.delete(key);
    audible.sort((a,b)=>a.spatial.distance-b.spatial.distance);
    audible.slice(0,4).forEach(({e,spatial,state})=>{
      const actor={...e.data,name:e.name};
      if(state.stride>.85){state.stride%=.85;this.creature(actor,'step',spatial);}
      if(this.time>state.nextVoice){state.nextVoice=this.time+10+Math.random()*20;if(!actor.sleeping)this.creature(actor,'idle',spatial);}
    });
  }

  ambient(dt = .016,{playing=false,pose={},torches=[],water=false,area='',entities,collision}={}){
    this.time+=dt;if(!this.context||!this.enabled||this.context.state!=='running')return;
    this._music(playing,area);if(playing)this.actors(dt,entities,pose,collision);
    return this._in('ambience',()=>this._ambience(playing,pose,torches,water));
  }
  _ambience(playing,pose,torches,water){
    const now=this.context.currentTime;
    this.airGain.gain.setTargetAtTime(playing?.2:.025,now,1.5);
    if(!playing)return;
    if(this.time>this.nextDrip){
      this.nextDrip=this.time+(water?1.5:4)+Math.random()*(water?4:10);
      const pan=Math.random()*1.6-.8,volume=water?.032:.018;
      this._noise(.1,volume,430,'lowpass',0,pan);
      this._noise(.18,volume*.4,650,'bandpass',.16,pan*.7);
    }
    if(this.time>this.nextCreak){
      this.nextCreak=this.time+15+Math.random()*22;
      const pan=Math.random()*1.7-.85;
      this._noise(1.5,.025,220,'bandpass',0,pan);
      this._tone(0,1.4,49+Math.random()*13,37,.018,'sine',true,pan);
      this._noise(.7,.013,180,'bandpass',.3,pan);
    }
    if(this.time>this.nextEmber){
      this.nextEmber=this.time+.35+Math.random()*.9;
      let nearest=null,distance=Infinity;
      for(const torch of torches){const d=Math.hypot(torch.point.x-(pose.x||0)*3,torch.point.z-(pose.y||0)*3);if(d<distance){distance=d;nearest=torch;}}
      if(nearest&&distance<9){
        const dx=nearest.point.x-pose.x*3,dz=nearest.point.z-pose.y*3;
        const pan=(Math.cos(pose.yaw||0)*dx-Math.sin(pose.yaw||0)*dz)/Math.max(1,distance);
        this._noise(.08+Math.random()*.07,.025/(1+distance*.5),360+Math.random()*220,'lowpass',0,pan);
      }
    }
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master) this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, value)) * 0.46, this.context.currentTime, 0.1);
  }
  setSettings(settings){
    for(const key of ['effectsVolume','ambienceVolume','musicVolume'])if(Number.isFinite(Number(settings[key])))this[key]=Math.max(0,Math.min(1,Number(settings[key])));
    this.musicEnabled=settings.musicEnabled!==false;this.setVolume(settings.volume??this.volume);
    if(this.buses){const now=this.context.currentTime;this.buses.effects.gain.setTargetAtTime(this.effectsVolume,now,.08);this.buses.ambience.gain.setTargetAtTime(this.ambienceVolume,now,.2);this.buses.music.gain.setTargetAtTime(this.musicEnabled?this.musicVolume:0,now,.3);}
  }
  _stopMusic(){
    const now=this.context.currentTime;
    for(const v of this.voices)if(v.bus==='music'){try{v.source.stop(now+.6);}catch{}}
    for(const old of this.retiredLayers||[])old.node.disconnect();this.retiredLayers=[];
    if(this.musicLayer){this.musicLayer.gain.cancelScheduledValues(now);this.musicLayer.gain.setTargetAtTime(0,now,.1);this.retiredLayers.push({node:this.musicLayer,until:now+1});this.musicLayer=null;}
  }

  dispose() {
    if (this.air) this.air.stop();
    for(const v of this.voices){try{v.source.stop();}catch{}}
    if (this.context) this.context.close();
    this.context = null;
  }
}
