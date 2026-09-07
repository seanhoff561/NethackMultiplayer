// One owner for physical inputs. Native menu accelerators exist only in menu context.
export const BINDINGS = Object.freeze({
  KeyW:'forward',KeyS:'back',KeyA:'left',KeyD:'right',
  ArrowUp:'forward',ArrowDown:'back',ArrowLeft:'turnLeft',ArrowRight:'turnRight',
  ShiftLeft:'run',ShiftRight:'run',ControlLeft:'crouch',ControlRight:'crouch',
  KeyI:'inventory',Tab:'commands',KeyE:'interact',Space:'jump',KeyM:'map',
  KeyF:'cast',KeyC:'fire',KeyT:'throw',KeyZ:'cast',KeyB:'wand',KeyQ:'quaff',KeyR:'read',
  KeyX:'swap',KeyG:'pickup',KeyK:'kick',KeyP:'pray',KeyV:'search',
  Digit1:'wield',Digit2:'cast',Digit3:'wand',Digit4:'quaff',Digit5:'apply',Digit6:'eat',
  F10:'fullscreen',Escape:'settings',
});
export const COMMAND_KEYS={fire:'f',throw:'t',cast:'Z',wand:'z',quaff:'q',read:'r',swap:'x',pickup:',',kick:'\x04',pray:'#pray',search:'s',wield:'w',apply:'a',eat:'e'};
const continuous=new Set(['forward','back','left','right','turnLeft','turnRight','run','crouch']);
export class GameInput {
  constructor({target=window,context,menu,onAction,onRelease}={}) {
    this.context=context;this.menu=menu;this.onAction=onAction;this.onRelease=onRelease;
    this.held=new Set();this.active=new Map();this.target=target;
    this.down=e=>this.keyDown(e);this.up=e=>this.keyUp(e);this.blur=()=>this.reset();
    this.visibility=()=>{if(target.document?.hidden)this.reset();};
    target.addEventListener('keydown',this.down,true);target.addEventListener('keyup',this.up,true);target.addEventListener('blur',this.blur);
    target.document?.addEventListener('visibilitychange',this.visibility);
  }
  keyDown(e) {
    const fresh=!this.held.has(e.code);this.held.add(e.code);
    const state=this.context();
    if(e.code==='F10'&&fresh&&!e.repeat){e.preventDefault();e.stopImmediatePropagation();this.onAction('fullscreen');return;}
    if(state==='menu'){
      this.clear();
      // Ignore held accelerators after a panel changes, while allowing text editing.
      if((!fresh||e.repeat)&&!['INPUT','TEXTAREA'].includes(e.target?.tagName)){e.preventDefault();e.stopImmediatePropagation();return;}
      this.menu(e);return;
    }
    if(state!=='game'||e.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
    const action=BINDINGS[e.code];if(!action||e.altKey||e.metaKey)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(!fresh||e.repeat)return;
    if(continuous.has(action))this.active.set(e.code,action);
    else this.onAction(action);
  }
  keyUp(e){this.held.delete(e.code);this.active.delete(e.code);}
  is(action){return action==='run'||action==='crouch'?[...this.held].some(code=>BINDINGS[code]===action):[...this.active.values()].includes(action);}
  motion(yaw){return {forward:Number(this.is('forward'))-Number(this.is('back')),strafe:Number(this.is('right'))-Number(this.is('left')),run:this.is('run'),crouch:this.is('crouch'),yaw};}
  clear(){if(this.active.size){this.active.clear();this.onRelease?.();}}
  reset(){this.active.clear();this.held.clear();this.onRelease?.();}
  dispose(){this.target.removeEventListener('keydown',this.down,true);this.target.removeEventListener('keyup',this.up,true);this.target.removeEventListener('blur',this.blur);this.target.document?.removeEventListener('visibilitychange',this.visibility);}
}
