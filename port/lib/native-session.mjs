// NetHack: Descent modification, 2026-09-07. Distributed under dat/license.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

export function encodeInput(input) {
  const clean=v=>String(v??'').replace(/[\r\n]/g,' ').slice(0,1024);
  if(input.kind==='menu') return `m ${(input.value||[]).map(Number).filter(Number.isFinite).join(',')}\n`;
  if(input.kind==='text') return `t ${clean(input.value)}\n`;
  if(input.kind==='extcmd') return `x ${clean(input.value)}\n`;
  if(input.kind==='pace')return `p ${Math.max(250,Math.min(3000,Number(input.value)||800))}\n`;
  if(input.kind==='position'||input.kind==='actor')return `${input.kind==='position'?'v':'n'} ${(input.value||[]).map(Number).filter(Number.isFinite).join(' ')}\n`;
  if(input.kind==='melee')return `a ${Number(input.value)||0}\n`;
  return `k ${typeof input.value==='number'?input.value:String(input.value||'\x1b').charCodeAt(0)}\n`;
}
export function cancelInput(request) {
  if(request.kind==='menu') return {kind:'menu',value:[]};
  if(request.kind==='text') return {kind:'text',value:'\x1b'};
  if(request.kind==='extcmd') return {kind:'extcmd',value:''};
  if(request.kind==='yn' && request.choices) {
    if(request.choices.includes('q'))return {kind:'key',value:'q'};
    if(request.choices.includes('n'))return {kind:'key',value:'n'};
  }
  return {kind:'key',value:27};
}
function fingerprint(r) {
  return JSON.stringify([r.kind,r.prompt||'',r.choices||'',r.items?.filter(i=>i.selectable!==false).map(i=>[i.id,i.key,i.text])]);
}

export class NativeSession extends EventEmitter {
  constructor({executable,cwd,args=[],env={}}) {
    super(); this.executable=executable;this.cwd=cwd;this.args=args;this.env=env;
    this.child=null;this.ready=false;this.request=null;this.snapshot=null;this.transaction=null;this.virtualPrompt=null;
    this.replay=null;this.replayIndex=1;this.detaching=false;this.cancelCount=0;this.closed=false;this.generation=0;this.pendingAnswer=null;
  }
  start() {
    this.child=spawn(this.executable,this.args,{cwd:this.cwd,env:{...process.env,...this.env},windowsHide:true,stdio:['pipe','pipe','pipe']});
    const lines=createInterface({input:this.child.stdout});
    lines.on('line',line=>{
      try {const event=JSON.parse(line);this.accept(event);} catch {if(line.trim())this.emit('diagnostic',line);}
    });
    this.child.stderr.on('data',data=>this.emit('diagnostic',String(data)));
    this.child.on('error',error=>this.emit('failure',error.message));
    this.child.on('exit',(code)=>{this.closed=true;this.ready=false;this.emit('ended',{code,snapshot:this.snapshot});});
  }
  write(input) {if(this.child && !this.closed)this.child.stdin.write(encodeInput(input));}
  accept(event) {
    if(event.type==='snapshot') {
      this.snapshot=event;
      // Replay only traverses prompts; avoid flooding the log with repeated questions.
      if(!this.replay && !this.detaching)this.emit('snapshot',event);
      return;
    }
    if(event.type!=='request') {this.emit('event',event);return;}
    this.request=event; this.ready=event.kind==='command';
    if(this.detaching) {
      if(this.ready) {this.detaching=false;this.cancelCount=0;this.flushAnswer();this.emit('ready');return;}
      if(++this.cancelCount>16) {this.detaching=false;this.virtualPrompt=null;this.emit('notice','This engine prompt requires an answer before play can continue.');this.emit('prompt',event);return;}
      this.write(cancelInput(event));return;
    }
    if(this.replay) {
      if(this.replay.length) {
        const step=this.replay.shift();
        if(step.expected && step.expected!==fingerprint(event)) {
          if(this.transaction)this.transaction.steps=this.transaction.steps.slice(0,this.replayIndex);
          this.replay=null;this.virtualPrompt=null;
          this.emit('notice','The situation changed while the menu was open. Review the updated choice.');
          this.present(event);return;
        }
        this.replayIndex++;this.ready=false;this.write(step.input);return;
      }
      this.replay=null;
    }
    if(this.ready) {
      this.transaction=null;
      if(!this.virtualPrompt)this.emit('clearPrompt');
      if(this.snapshot)this.emit('snapshot',this.snapshot);
      this.flushAnswer();this.emit('ready');return;
    }
    this.present(event);
  }
  present(request) {
    if(this.transaction?.aim && /direction|where do you want to/i.test(request.prompt||'') && ['key','yn'].includes(request.kind)) {
      const input={kind:'key',value:this.transaction.aim};
      this.transaction.steps.push({expected:fingerprint(request),input});
      this.write(input);return;
    }
    this.emit('prompt',request);
    if(this.transaction) {
      this.virtualPrompt={request,transaction:structuredClone(this.transaction)};
      this.detaching=true;this.cancelCount=0;
      this.write(cancelInput(request));
    }
  }
  act(action) {
    if(!this.ready || this.closed)return false;
    if(!action.idle) {this.virtualPrompt=null;this.emit('clearPrompt');}
    const key=action.key || '.';
    const initial=action.melee!==undefined?{kind:'melee',value:action.melee}:{kind:'key',value:key.startsWith('#')?'#':key};
    const steps=[{input:initial}];
    if(key.startsWith('#')&&key.length>1)steps.push({input:{kind:'extcmd',value:key.slice(1).trim()}});
    else for(const char of key.slice(1))steps.push({input:{kind:'key',value:char}});
    this.transaction=action.idle?null:{steps:[...steps],aim:action.aim};
    this.replay=steps.slice(1);this.replayIndex=1;this.ready=false;this.write(initial);return true;
  }
  answer(input) {
    if(this.virtualPrompt) {
      if(!this.ready){this.pendingAnswer=input;return true;}
      const {request,transaction}=this.virtualPrompt;
      const answer={expected:fingerprint(request),input};
      transaction.steps.push(answer);this.transaction=transaction;this.virtualPrompt=null;
      this.replay=transaction.steps.slice(1);this.replayIndex=1;this.ready=false;
      this.emit('clearPrompt');this.write(transaction.steps[0].input);return true;
    }
    if(this.request&&!this.ready) {this.write(input);return true;}
    return false;
  }
  cancel() {
    this.pendingAnswer=null;
    if(this.virtualPrompt) {this.virtualPrompt=null;this.transaction=null;this.emit('clearPrompt');return;}
    if(this.request&&!this.ready)this.write(cancelInput(this.request));
  }
  flushAnswer() {if(this.pendingAnswer&&this.ready){const input=this.pendingAnswer;this.pendingAnswer=null;this.answer(input);}}
  stop() {this.child?.kill();this.closed=true;}
}
