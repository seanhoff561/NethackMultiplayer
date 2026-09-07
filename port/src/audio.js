/** Procedural dungeon soundscape. Nothing is fetched and audio starts on user input. */
export class DungeonAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = true;
    this.lastStep = 0;
    this.nextDrip = 0;
    this.time = 0;
    this.nextCreak=8;this.nextEmber=0;
    this.volume = .55;
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
      this.master.connect(compressor);
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

      // A filtered, very quiet underground air bed; never a looping sample.
      const airBuffer = this.context.createBuffer(1, this.context.sampleRate * 4, this.context.sampleRate);
      const air = airBuffer.getChannelData(0);
      let value = 0;
      for (let i = 0; i < air.length; i++) {
        value = (value + (Math.random() * 2 - 1) * 0.02) / 1.02;
        air[i] = value;
      }
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
      airGain.connect(this.master);
      this.air.start();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  _tone(start, duration, from, to, volume, type = 'sine', wet = true, pan = 0) {
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
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
    this._route(gain,pan,wet);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  _noise(duration, volume, frequency, type = 'lowpass', start = 0, pan = 0) {
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
    const length = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = type;
    filter.frequency.value = frequency;
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    this._route(gain,pan,true);
    source.start(this.context.currentTime + start);
  }

  _route(gain,pan,wet){
    const panner=this.context.createStereoPanner();panner.pan.value=Math.max(-1,Math.min(1,pan));
    gain.connect(panner);panner.connect(this.master);if(wet)panner.connect(this.reverb);
  }

  step(running = false, terrain = 'floor', crouch = false) {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (now - this.lastStep < (running ? 0.22 : 0.33)) return;
    this.lastStep = now;
    const volume=crouch?.45:1,pan=(this.footSide=!this.footSide)?.12:-.12;
    this._noise(0.12, (running ? 0.28 : 0.18)*volume, 510 + Math.random() * 250,'lowpass',0,pan);
    if(terrain==='water')this._noise(.25,.22*volume,1700,'bandpass',.02,pan);
    this._tone(0, 0.13, 100 + Math.random() * 35, 43, (running ? 0.27 : 0.17)*volume, 'sine',true,pan);
    this._noise(0.08, 0.035*volume, 3100, 'highpass', 0.045,pan);
  }

  attack(kind = 'melee') {
    if (/spell|cast|magic|fire|frost|heal/.test(kind)) return this.spell(kind);
    if (/ranged|fire|bow|throw/.test(kind)) {
      this._noise(0.12, 0.28, 2700, 'bandpass');
      this._tone(0, 0.13, 250, 80, 0.16, 'triangle');
      return;
    }
    this._noise(.21,.3,1850,'bandpass',.11,-.18);
    this._noise(.13,.12,900,'bandpass',.22,.25);
    this._tone(.11,.19,230,70,.04,'triangle',false);
  }

  impact(){
    this._noise(.1,.36,750,'lowpass');this._noise(.055,.17,2900,'highpass');
    this._tone(0,.16,135,50,.24,'sine');this._tone(.015,.22,1850,1300,.025,'sine');
  }

  hit() {
    this._noise(0.16, 0.48, 1200);
    this._tone(0, 0.17, 150, 44, 0.43, 'triangle');
    this._tone(0, 0.26, 670, 310, 0.05, 'sine');
  }

  spell(kind = 'magic') {
    const base = /heal/.test(kind) ? 430 : /fire/.test(kind) ? 170 : 270;
    this._noise(0.72, 0.22, 2200, 'bandpass');
    for (let i = 0; i < 4; i++) {
      this._tone(i * 0.055, 0.7, base * (1 + i * 0.5), base * (2.8 + i * 0.4), 0.07, 'sine');
    }
  }

  pickup(name = '') {
    this._noise(.16,.1,1150,'bandpass');
    if(/gold|coin|zorkmid|sword|shield/.test(name))for(let i=0;i<3;i++)this._tone(i*.04,.18,1800+i*390,1650+i*390,.027,'sine',true,(i-1)*.2);
    this._tone(0, 0.2, 740, 880, 0.07, 'sine');
    this._tone(0.08, 0.28, 1110, 1180, 0.055, 'sine');
  }

  door() {
    this._noise(0.6, 0.2, 460, 'bandpass');
    this._tone(0, 0.35, 170, 100, 0.055, 'sawtooth');
  }

  ambient(dt = .016,{playing=false,pose={},torches=[],water=false}={}){
    this.time+=dt;if(!this.context||!this.enabled||this.context.state!=='running')return;
    const now=this.context.currentTime;
    this.airGain.gain.setTargetAtTime(playing?.2:.025,now,1.5);
    if(!playing)return;
    if(this.time>this.nextDrip){
      this.nextDrip=this.time+(water?1.5:4)+Math.random()*(water?4:10);
      const pan=Math.random()*1.6-.8,volume=water?.032:.016,frequency=1450+Math.random()*600;
      this._tone(0,.12,frequency,510,volume,'sine',true,pan);
      this._tone(.18,.19,frequency*.8,450,volume*.3,'sine',true,pan*.7);
      this._noise(.1,volume*.6,2800,'bandpass',.03,pan);
    }
    if(this.time>this.nextCreak){
      this.nextCreak=this.time+15+Math.random()*22;
      const pan=Math.random()*1.7-.85;
      this._noise(1.5,.025,220,'bandpass',0,pan);
      this._tone(0,1.4,49+Math.random()*13,37,.018,'sine',true,pan);
      this._tone(.3,.7,185,116,.006,'triangle',true,pan);
    }
    if(this.time>this.nextEmber){
      this.nextEmber=this.time+.35+Math.random()*.9;
      let nearest=null,distance=Infinity;
      for(const torch of torches){const d=Math.hypot(torch.point.x-(pose.x||0)*3,torch.point.z-(pose.y||0)*3);if(d<distance){distance=d;nearest=torch;}}
      if(nearest&&distance<9){
        const dx=nearest.point.x-pose.x*3,dz=nearest.point.z-pose.y*3;
        const pan=(Math.cos(pose.yaw||0)*dx-Math.sin(pose.yaw||0)*dz)/Math.max(1,distance);
        this._noise(.04+Math.random()*.055,.055/(1+distance*.4),1800+Math.random()*2000,'highpass',0,pan);
      }
    }
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master) this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, value)) * 0.46, this.context.currentTime, 0.1);
  }

  dispose() {
    if (this.air) this.air.stop();
    if (this.context) this.context.close();
    this.context = null;
  }
}
