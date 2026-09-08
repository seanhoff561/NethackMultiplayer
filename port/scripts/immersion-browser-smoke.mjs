import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
await mkdir('test-results',{recursive:true});const runtime=await mkdtemp(path.resolve('test-results/immersion-browser-')),port=5188;
const server=spawn(process.execPath,['server.mjs',...(process.argv.includes('--dev')?['--dev']:[])],{env:{...process.env,PORT:String(port),NETHACK_RUNTIME:runtime},windowsHide:true,stdio:'pipe'});
let output='',browser;server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
try{
  for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/status`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
  await page.addInitScript(()=>{const WS=window.WebSocket;window.__sent=[];window.__busy=[];window.__maxFade=0;window.WebSocket=class extends WS{constructor(...args){super(...args);window.__socket=this;this.addEventListener('message',e=>{const s=JSON.parse(e.data);if(s.type==='snapshot'&&s.player.busy)window.__busy.push(s.turn);});}send(s){window.__sent.push(JSON.parse(s));super.send(s);}};const track=()=>{const el=document.querySelector('#time-skip');if(el)window.__maxFade=Math.max(window.__maxFade,Number(getComputedStyle(el).opacity));requestAnimationFrame(track);};requestAnimationFrame(track);});
  await page.goto(`http://127.0.0.1:${port}`);await page.locator('#enter-dungeon:not([disabled])').waitFor();
  await page.locator('.title-links [data-action=fullscreen]').click();
  await page.locator('#character-name').fill('ImmersionQA');await page.locator('#character-role').selectOption('Knight');await page.locator('#enter-dungeon').click();
  await page.waitForFunction(()=>window.descent?.state.playing&&window.descent.state.motion);await page.locator('#game').click();
  await page.waitForFunction(()=>!!document.pointerLockElement);
  assert.equal(await page.locator('#interaction-hint,#toast,#location-name,#location-detail,.hud-bottom').count(),0);
  assert.ok((await page.locator('.player-status').boundingBox()).y<50);
  assert.match(await page.locator('#level-xp').textContent(),/Lv 1 · \d+ \/ 20 XP/);
  await page.keyboard.press('Space');await page.waitForFunction(()=>window.descent.state.motion.player.jumpOffset>.1);await page.waitForFunction(()=>window.descent.state.motion.player.jumpOffset===0);
  assert.ok(await page.evaluate(()=>window.__sent.some(e=>e.type==='jump')));assert.equal(await page.evaluate(()=>window.__sent.some(e=>e.type==='action'&&e.key==='Z')),false);
  await page.keyboard.press('m');await page.waitForFunction(()=>window.descent.renderer.mapHeld);
  await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementY:440})));await page.waitForTimeout(400);
  const record=await page.evaluate(()=>window.descent.renderer.mapRecord);assert.ok(record.tiles.length>0);assert.ok(record.tiles.length<1659);
  await page.screenshot({path:'test-results/held-parchment.png'});await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>window.descent.renderer.mapRecord.time),record.time);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.descent.renderer.mapHeld),false);assert.equal(await page.locator('.game-panel').count(),0);
  await page.keyboard.press('i');await page.locator('.inventory-panel').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.game-panel').count(),0);await page.waitForFunction(()=>!!document.pointerLockElement);
  // Actual armor occupation, not a presentation fixture.
  const armor=await page.evaluate(()=>window.descent.renderer.snapshot.inventory.find(i=>i.armorSlot===0&&i.equipped));
  await page.keyboard.press('Tab');await page.locator('#command-search').fill('takeoff');await page.keyboard.press('Enter');await page.locator('.menu-panel').waitFor();
  assert.equal(await page.locator('.prompt-panel').count(),0);await page.keyboard.press(armor.key);await page.waitForFunction(()=>window.__busy.length>1);await page.waitForFunction(()=>!window.descent.state.player.busy);
  assert.ok(await page.evaluate(()=>window.__maxFade)>.95);await page.waitForTimeout(320);
  // Pickups highlight their own materials and log feedback outside the center.
  await page.keyboard.press('i');await page.locator(`[data-item-key="${armor.key}"]`).click();await page.locator('[data-inventory-action=d]').click();
  await page.waitForFunction(id=>window.descent.renderer.snapshot.floorObjects.some(i=>i.id===id),armor.id);
  await page.evaluate(id=>{const o=window.descent.renderer.pickups.get(`object:${id}`).group.position,p=window.descent.state.pose;const desired=Math.atan2(-(o.x-p.x*3),-(o.z-p.y*3)),delta=Math.atan2(Math.sin(desired-p.yaw),Math.cos(desired-p.yaw));const tilt=Math.atan2(o.y+.3-window.descent.renderer.camera.position.y,Math.hypot(o.x-p.x*3,o.z-p.y*3));document.dispatchEvent(new MouseEvent('mousemove',{movementX:-delta/.0022,movementY:(p.pitch-tilt)/.0022}));},armor.id);
  await page.waitForFunction(id=>window.descent.renderer.highlightKey===`object:${id}`,armor.id);
  assert.equal(await page.locator('#focus-name').textContent(),await page.evaluate(id=>window.descent.renderer.snapshot.floorObjects.find(i=>i.id===id).name,armor.id));
  assert.equal(await page.locator('#focus-kind').textContent(),'On the ground');
  assert.ok((await page.locator('#awareness').boundingBox()).x>1000);
  await page.screenshot({path:'test-results/immersion-hud.png'});
  await page.keyboard.press('e');await page.waitForFunction(id=>window.descent.renderer.snapshot.inventory.some(i=>i.id===id),armor.id);assert.equal(await page.locator('#toast,#interaction-hint').count(),0);
  await page.keyboard.press('Escape');await page.locator('[data-action=new-run]').click();await page.locator('[data-action=confirm-new-run]').click();await page.waitForFunction(()=>!window.descent.state.playing&&!document.querySelector('.game-panel'));
  await page.locator('#character-role').selectOption('Wizard');await page.locator('#enter-dungeon').click();await page.waitForFunction(()=>window.descent.state.playing&&window.descent.state.player.role==='Wizard');await page.locator('#game').click();
  await page.keyboard.press('f');await page.locator('.aiming-layer .menu-panel').waitFor();assert.ok(await page.evaluate(()=>!!document.pointerLockElement));
  await page.screenshot({path:'test-results/aiming-spells.png'});const yaw=await page.evaluate(()=>window.descent.state.pose.yaw);await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:500})));await page.waitForTimeout(80);assert.notEqual(await page.evaluate(()=>window.descent.state.pose.yaw),yaw);
  const spellKey=await page.locator('.menu-item kbd').first().textContent();await page.keyboard.press(spellKey);await page.waitForFunction(()=>!document.querySelector('.game-panel'));assert.ok(await page.evaluate(()=>!!document.pointerLockElement));
  await page.keyboard.press('t');await page.locator('.aiming-layer .menu-panel').waitFor();assert.ok(await page.evaluate(()=>!!document.pointerLockElement));await page.screenshot({path:'test-results/aiming-throw.png'});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.game-panel').count(),0);assert.ok(await page.evaluate(()=>!!document.pointerLockElement));
  const doorHighlight=await page.evaluate(()=>{const r=window.descent.renderer,entry=r.doorTargets.entries().next().value;if(!entry)return false;const [x,y]=entry[0].split(',').map(Number);r.highlightPickup(null,{x,y});let lit=false;entry[1].traverse(m=>{if(m.userData.highlightOriginal)lit=true;});r.highlightPickup(null);return lit;});assert.ok(doorHighlight);
  // A controlled presentation scene exercises the real renderer -> HUD path.
  // Native gameplay and inventory above are tested against the isolated engine.
  await page.evaluate(()=>{
    const r=window.descent.renderer,p=window.descent.state.pose,x=Math.floor(p.x),y=Math.floor(p.y),tiles=[];
    for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++)tiles.push({x:x+dx,y:y+dy,type:Math.abs(dx)===5||Math.abs(dy)===5?'wall':'floor'});
    const actors=[{id:900001,name:'hill orc',symbol:'o',x,y,size:2},{id:900002,name:'hill orc',symbol:'o',x,y,size:2},{id:900003,name:'large dog',symbol:'d',x,y,tame:true}];
    r.setWorld({...r.snapshot,levelId:'awareness-presentation',tiles,actors,floorObjects:[]});
    actors.forEach((a,i)=>{const e=r.monsters.get(`id:${a.id}`);e.group.position.set(p.x*3+[0,2.4,-2.4][i],p.elevation||0,p.y*3-[4,5.5,5.5][i]);e.target.copy(e.group.position);});
    r.setWorld=()=>{};r.setMotion=()=>{};
    document.dispatchEvent(new MouseEvent('mousemove',{movementX:p.yaw/.0022,movementY:(p.pitch+.13)/.0022}));
  });
  await page.waitForFunction(()=>document.querySelector('#focus-name').textContent==='hill orc');
  assert.equal(await page.locator('#focus-kind').textContent(),'Enemy');
  assert.equal(await page.locator('#enemies-heading').textContent(),'Enemies in sight · 2');
  assert.equal(await page.locator('#visible-enemies li').count(),1);assert.equal(await page.locator('#visible-enemies').textContent(),'Hill orc ×2');
  await page.screenshot({path:'test-results/awareness-hud.png'});
  const awareness=await page.evaluate(()=>{
    const r=window.descent.renderer,start=performance.now();for(let i=0;i<10;i++)r.sight();const sightMs=(performance.now()-start)/10;
    r.hitActor(900001);r.update(.03);const e=r.monsters.get('id:900001'),red=e.flashMaterials.some(m=>m.emissive.r>m.emissive.b*2);
    r.highlightActor(null);r.update(.35);const restored=e.flashMaterials.every(m=>m.emissive.equals(m.userData.baseEmissive)&&m.color.equals(m.userData.baseColor));
    return {sightMs,red,restored};
  });assert.ok(awareness.red);assert.ok(awareness.restored);
  await page.keyboard.press('m');await page.waitForFunction(()=>document.querySelector('#awareness').hidden);await page.keyboard.press('Escape');
  console.log('Awareness presentation:',JSON.stringify(awareness));
  assert.deepEqual(errors,[]);const results={jump:true,map:record,blackoutTurns:await page.evaluate(()=>window.__busy),maxFade:await page.evaluate(()=>window.__maxFade),highlight:true,aiming:true,errors};
  await writeFile('test-results/immersion-browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({...results,map:{level:record.level,tiles:record.tiles.length,time:record.time}},null,2));
}catch(e){console.error(output);throw e;}finally{await browser?.close();server.kill();}
