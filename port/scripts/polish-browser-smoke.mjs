import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
await mkdir('test-results',{recursive:true});
const runtime=await mkdtemp(path.resolve('test-results/polish-browser-')),port=5183;
const server=spawn(process.execPath,['server.mjs',...(process.argv.includes('--dev')?['--dev']:[])],{env:{...process.env,PORT:String(port),NETHACK_RUNTIME:runtime},windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='',browser;server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
const results=[];
try{
  for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/status`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{
    window.__received=[];window.__sent=[];const Native=window.WebSocket;
    window.WebSocket=class extends Native{
      constructor(...args){super(...args);window.__socket=this;this.addEventListener('message',e=>{if(window.__fixture&&e.isTrusted){e.stopImmediatePropagation();return;}window.__received.push(JSON.parse(e.data));if(window.__received.length>900)window.__received.shift();});}
      send(data){window.__sent.push(JSON.parse(data));if(window.__sent.length>900)window.__sent.shift();return super.send(data);}
    };
    const Audio=window.AudioContext;window.AudioContext=class extends Audio{constructor(...a){super(...a);window.__audio=this;}};
  });
  await page.goto(`http://127.0.0.1:${port}`);await page.locator('#enter-dungeon:not([disabled])').waitFor();
  await page.locator('.title-links [data-action="fullscreen"]').click();await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.keyboard.press('F10');await page.waitForFunction(()=>!document.fullscreenElement);results.push('True fullscreen enters by button and exits with F10');
  await page.locator('#character-name').fill('PolishQA');await page.locator('#character-role').selectOption('Wizard');await page.locator('#enter-dungeon').click();
  await page.waitForFunction(()=>window.descent?.state.playing&&window.descent.state.motion);await page.waitForTimeout(400);
  assert.equal(await page.locator('#minimap,.minimap-wrap,#dungeon-map').count(),0);
  assert.equal(await page.evaluate(()=>window.__audio.state),'running');
  await page.locator('#game').click();
  await page.waitForFunction(()=>!!document.pointerLockElement);
  await page.evaluate(()=>document.exitPointerLock());await page.locator('.settings-panel').waitFor();
  assert.equal(await page.evaluate(()=>!!document.pointerLockElement),false);
  const menuTurn=await page.evaluate(()=>window.descent.state.player.turn);await page.waitForTimeout(1000);
  assert.ok(await page.evaluate(()=>window.descent.state.player.turn)>menuTurn,'Escape menu keeps the dungeon alive');
  await page.screenshot({path:'test-results/dark-menu.png'});
  await page.locator('[data-settings-section=controls]').click();await page.getByText('Select the displayed choice; they never move your character',{exact:true}).waitFor();
  await page.screenshot({path:'test-results/dark-controls.png'});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.game-panel').count(),0);await page.keyboard.press('Escape');
  await page.locator('[data-settings-section=guide]').click();await page.getByRole('heading',{name:'Entering commands',exact:true}).waitFor();
  await page.locator('.settings-panel [data-action=commands]').click();await page.locator('#command-search').fill('inventory');await page.keyboard.press('Enter');await page.locator('.inventory-panel').waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.locator('.game-panel').count(),0);
  await page.waitForFunction(()=>!!document.pointerLockElement);await page.keyboard.press('Escape');await page.locator('.settings-panel').waitFor();
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.game-panel'));
  results.push('Escape and browser pointer unlock open one live menu; controls, guide, command search and resume work');
  await page.keyboard.down('w');await page.keyboard.down('d');await page.waitForTimeout(120);await page.keyboard.up('d');await page.waitForTimeout(90);
  assert.equal(await page.evaluate(()=>window.__sent.filter(e=>e.type==='input').at(-1).forward),1);
  assert.equal(await page.evaluate(()=>window.__sent.filter(e=>e.type==='input').at(-1).strafe),0);await page.keyboard.up('w');
  await page.keyboard.press('i');await page.locator('.inventory-panel').waitFor();
  assert.equal(await page.locator('[data-inventory-action="d"]').isDisabled(),true);
  const turn=await page.evaluate(()=>window.descent.state.player.turn);await page.waitForTimeout(1000);assert.ok(await page.evaluate(()=>window.descent.state.player.turn)>turn);
  await page.keyboard.down('w');await page.keyboard.press('Escape');await page.waitForTimeout(130);
  assert.equal(await page.evaluate(()=>(window.__sent.filter(e=>e.type==='input'||e.type==='release').at(-1).forward||0)),0,'held inventory letter cannot start walking after close');
  await page.keyboard.up('w');results.push('Movement releases per key; inventory remains live and held accelerators cannot leak');
  // Windowed Chrome requires a fresh click after its native Escape cooldown.
  if(!await page.evaluate(()=>!!document.pointerLockElement)){await page.waitForTimeout(1600);await page.locator('#game').click();await page.waitForFunction(()=>!!document.pointerLockElement);}
  const prior=await page.evaluate(()=>window.__sent.filter(e=>e.type==='action'&&e.melee).length);
  await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
  assert.equal(await page.evaluate(()=>window.__sent.filter(e=>e.type==='action'&&e.melee).length),prior+1);
  await page.mouse.click(720,450);await page.waitForTimeout(80);await page.mouse.click(720,450);await page.waitForTimeout(700);
  const attacks=await page.evaluate(()=>window.__sent.filter(e=>e.type==='action'&&e.melee).slice(-3).map(e=>e.id));
  const started=await page.evaluate(()=>window.__received.filter(e=>e.type==='action-status'&&e.status==='started').map(e=>e.id));
  for(const id of attacks)assert.equal(started.filter(i=>i===id).length,1);results.push('Repeated held attack is ignored; rapid distinct attacks execute once each with acknowledgment');
  const dropItems=await page.evaluate(()=>window.descent.renderer.snapshot.inventory.filter(i=>!i.equipped&&/scroll|spellbook/.test(i.name)).slice(0,2));
  for(const item of dropItems){
    await page.keyboard.press('i');await page.locator('.inventory-panel').waitFor();await page.keyboard.press(item.key);
    assert.equal(await page.locator(`[data-item-key="${item.key}"]`).getAttribute('class'),'inventory-item selected');
    await page.locator('[data-inventory-action="d"]').click();await page.waitForFunction(id=>window.descent.renderer.snapshot.floorObjects.some(o=>o.id===id),item.id);
  }
  assert.equal(await page.locator('.menu-panel').count(),0);
  const floor=await page.evaluate(ids=>ids.map(id=>{const p=window.descent.renderer.pickups.get(`object:${id}`)?.group.position;return p?{x:p.x,y:p.y,z:p.z}:null;}),dropItems.map(i=>i.id));
  assert.ok(floor.every(Boolean));assert.ok(Math.hypot(floor[0].x-floor[1].x,floor[0].z-floor[1].z)>.3);
  const nearest=await page.evaluate(items=>{
    const r=window.descent.renderer,p=window.descent.state.pose;
    const sorted=items.map(i=>{const o=r.pickups.get(`object:${i.id}`).group.position;return {id:i.id,x:o.x,z:o.z,d:Math.hypot(o.x-p.x*3,o.z-p.y*3)};}).sort((a,b)=>a.d-b.d);
    const target=sorted[0],desired=Math.atan2(-(target.x-p.x*3),-(target.z-p.y*3));
    const delta=Math.atan2(Math.sin(desired-p.yaw),Math.cos(desired-p.yaw));
    document.dispatchEvent(new MouseEvent('mousemove',{movementX:-delta/.0022}));return target;
  },dropItems);
  if(nearest.d<2.05){
    await page.keyboard.press('e');await page.waitForFunction(()=>window.__received.some(e=>e.type==='item-picked-up'));
    assert.equal(await page.locator('.menu-panel').count(),0);results.push('Separate dropped objects can be picked up directly without a pile dialog');
  }else throw Error(`Dropped object is not within reach: ${nearest.d}`);
  await page.waitForTimeout(700);await page.screenshot({path:'test-results/polish-game.png'});
  await page.keyboard.press('z');await page.locator('.prompt-panel,.menu-panel').waitFor();await page.keyboard.press('Escape');
  results.push('Z opens wand selection independently from F spell selection');
  // Isolated presentation fixture: native gameplay above, controlled geometry below.
  await page.evaluate(()=>{window.__fixture=true;window.requestAnimationFrame=()=>0;});await page.waitForTimeout(80);
  await page.keyboard.press('i');
  const tracked=await page.evaluate(()=>window.descent.renderer.snapshot.inventory[0]);
  await page.keyboard.press(tracked.key);
  await page.evaluate(id=>{
    const s=structuredClone(window.descent.renderer.snapshot);s.type='snapshot';s.inventory.find(i=>i.id===id).key='Y';
    window.__socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(s)}));
  },tracked.id);
  assert.equal(await page.locator('.inventory-item.selected').getAttribute('data-item-key'),'Y','selection follows live object identity');
  await page.evaluate(id=>{
    const s=structuredClone(window.descent.renderer.snapshot);s.type='snapshot';s.inventory=s.inventory.filter(i=>i.id!==id);
    window.__socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(s)}));
  },tracked.id);
  assert.equal(await page.locator('.inventory-item.selected').count(),0);assert.equal(await page.locator('[data-inventory-action="d"]').isDisabled(),true);
  await page.keyboard.press('Escape');results.push('Live inventory fixture: letter reassignment preserves selection; disappearing items clear it');
  await page.evaluate(()=>{
    const r=window.descent.renderer,tiles=[];
    for(let x=0;x<9;x++)for(let y=0;y<10;y++)tiles.push({x,y,type:x===0||x===8||y===0||y===9?'wall':'floor'});
    tiles.find(t=>t.x===2&&t.y===3).type='stairs_down';tiles.find(t=>t.x===6&&t.y===3).type='stairs_up';
    const snap={levelId:'presentation-fixture',tiles,player:{x:4,y:7,weapon:'long sword',shield:'small shield'},inventory:[],actors:[{id:8001,x:4,y:4,name:'orc',symbol:'o',color:2},{id:8002,x:5,y:4,name:'orc',symbol:'o',color:2}],floorObjects:[{id:31,x:4,y:6,name:'potion',symbol:'!'},{id:32,x:4,y:6,name:'scroll',symbol:'?'},{id:33,x:4,y:6,name:'long sword',symbol:')'}]};
    r.setWorld(snap);r.setPose({x:4.5,y:7.5,yaw:0,pitch:-.12,elevation:0,moving:false});for(let i=0;i<60;i++)r.update(1/60);
    document.querySelector('#mouse-capture').hidden=true;document.querySelector('#message-log')?.classList.add('quiet');
  });
  const geometry=await page.evaluate(()=>{
    const r=window.descent.renderer,counts={slabs:0,walls:0};r.world.traverse(o=>{if(o.name==='stair-unused-lane-slab')counts.slabs++;if(o.name==='stair-unused-lane-wall')counts.walls++;});
    const base=r.motes.geometry.attributes.position.array.slice();r.setPose({x:4.6,y:7.5,yaw:.05});r.update(.016);
    return {...counts,dustFixed:base.every((v,i)=>v===r.motes.geometry.attributes.position.array[i])&&r.motes.position.length()===0,drawCalls:r.renderer.info.render.calls};
  });
  assert.equal(geometry.slabs,4);assert.equal(geometry.walls,4);assert.equal(geometry.dustFixed,true);
  await page.screenshot({path:'test-results/polish-presentation.png'});
  const flash=await page.evaluate(()=>{
    const r=window.descent.renderer,other=r.monsters.get('id:8002');let original;other.group.traverse(o=>{if(!original&&o.material?.isMeshStandardMaterial)original=o.material;});
    const before=original.color.getHex();r.hitActor(8001);r.update(.03);
    return {isolated:original.color.getHex()===before,flashed:r.monsters.get('id:8001').flashMaterials.some(m=>m.emissive.r>.5)};
  });assert.deepEqual(flash,{isolated:true,flashed:true});
  await page.screenshot({path:'test-results/polish-hit.png'});
  await page.evaluate(()=>{const r=window.descent.renderer;r.attack('melee');r.update(.24);});await page.screenshot({path:'test-results/polish-slash.png'});
  await page.evaluate(()=>window.__socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'feedback',events:[{kind:'player-hit',amount:3}]})})));
  assert.ok(await page.evaluate(()=>document.querySelector('#damage-flash').getAnimations().length)>0);await page.screenshot({path:'test-results/polish-damage.png'});
  results.push('Presentation fixture: stair caps, fixed dust, isolated enemy flash, full slash, and player damage overlay');
  assert.deepEqual(errors,[]);await writeFile('test-results/polish-browser-results.json',JSON.stringify({results,geometry,errors,output},null,2));
  console.log(JSON.stringify({results,geometry,errors},null,2));
}catch(error){console.error(output);throw error;}finally{await browser?.close();server.kill();}
