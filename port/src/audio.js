/** Procedural dungeon soundscape. Nothing is fetched and audio starts on user input. */
export class DungeonAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = true;
    this.lastStep = 0;
    this.nextDrip = 0;
    this.time = 0;
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
      const wet = this.context.createGain();
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
      const airGain = this.context.createGain();
      airGain.gain.value = 0.12;
      this.air.connect(airFilter);
      airFilter.connect(airGain);
      airGain.connect(this.master);
      this.air.start();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  _tone(start, duration, from, to, volume, type = 'sine', wet = true) {
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
    gain.connect(this.master);
    if (wet) gain.connect(this.reverb);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  _noise(duration, volume, frequency, type = 'lowpass', start = 0) {
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
    gain.connect(this.master);
    gain.connect(this.reverb);
    source.start(this.context.currentTime + start);
  }

  step(running = false) {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (now - this.lastStep < (running ? 0.22 : 0.33)) return;
    this.lastStep = now;
    this._noise(0.12, running ? 0.28 : 0.18, 510 + Math.random() * 250);
    this._tone(0, 0.13, 100 + Math.random() * 35, 43, running ? 0.27 : 0.17, 'sine');
    this._noise(0.08, 0.035, 3100, 'highpass', 0.045);
  }

  attack(kind = 'melee') {
    if (/spell|cast|magic|fire|frost|heal/.test(kind)) return this.spell(kind);
    if (/ranged|fire|bow|throw/.test(kind)) {
      this._noise(0.12, 0.28, 2700, 'bandpass');
      this._tone(0, 0.13, 250, 80, 0.16, 'triangle');
      return;
    }
    this._noise(0.27, 0.32, 1600, 'bandpass');
    this._tone(0.015, 0.16, 280, 95, 0.065, 'triangle', false);
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

  pickup() {
    this._tone(0, 0.2, 740, 880, 0.07, 'sine');
    this._tone(0.08, 0.28, 1110, 1180, 0.055, 'sine');
  }

  door() {
    this._noise(0.6, 0.2, 460, 'bandpass');
    this._tone(0, 0.35, 170, 100, 0.055, 'sawtooth');
  }

  ambient(dt = 0.016) {
    this.time += dt;
    if (this.time < this.nextDrip) return;
    this.nextDrip = this.time + 5 + Math.random() * 11;
    this._tone(0, 0.13, 1450 + Math.random() * 300, 540, 0.015, 'sine');
    this._tone(0.2, 0.1, 1100, 470, 0.005, 'sine');
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
