// NetHack: Descent modification, 2026-09-07. Distributed under dat/license.
// One authoritative engine action per wall-clock pulse. Display state never pauses this clock.
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
    // A held movement key must not leave a long queue after it is released.
    if (action.movement) this.queue=this.queue.filter(x=>!x.movement);
    this.queue.push(action); return true;
  }
  clearMovement() { this.queue=this.queue.filter(x=>!x.movement); }
  update() {
    if (!this.active || !this.canAct()) return false;
    const now=this.now();
    const next=this.queue[0];
    const interval=next?.running ? this.interval*0.58 : next?.crouching ? this.interval*1.5 : this.interval;
    if (now-this.last < interval) return false;
    this.last=now; this.pulses++;
    this.act(this.queue.shift() || {key:'.',idle:true});
    return true;
  }
}
