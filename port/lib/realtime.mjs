// NetHack: Descent modification, 2026-09-07. Distributed under dat/license.
// Native rule timers and queued commands. Locomotion has an independent 60 Hz simulation.
export class RealtimeClock {
  constructor({ act, canAct, now=()=>performance.now(), interval=800 }) {
    this.act=act; this.canAct=canAct; this.now=now; this.interval=interval;
    this.queue=[]; this.active=false; this.last=0; this.pulses=0;
  }
  start() { this.active=true; this.last=this.now(); }
  stop() { this.active=false; this.queue=[]; }
  setInterval(ms) { this.interval=Math.max(250,Math.min(3000,Number(ms)||800)); }
  enqueue(action) {
    if (this.queue.length >= 8) return false;
    this.queue.push(action); return true;
  }
  clearQueue() { this.queue=[]; }
  update() {
    if (!this.active || !this.canAct()) return false;
    const now=this.now();
    if (now-this.last < this.interval) return false;
    this.last=now; this.pulses++;
    this.act(this.queue.shift() || {key:'.',idle:true});
    return true;
  }
}
