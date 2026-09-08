import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
await mkdir('test-results',{recursive:true});const runtime=await mkdtemp(path.resolve('test-results/audio-browser-')),port=5189;
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),NETHACK_RUNTIME:runtime},windowsHide:true,stdio:'pipe'});
let output='',browser;server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
try{
  for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/status`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.addInitScript(()=>{const WS=window.WebSocket;window.__sent=[];window.__received=[];window.WebSocket=class extends WS{constructor(...args){super(...args);window.__socket=this;this.addEventListener('message',e=>window.__received.push(JSON.parse(e.data)));}send(m){window.__sent.push(JSON.parse(m));super.send(m);}};});
  await page.goto(`http://127.0.0.1:${port}`);await page.locator('#enter-dungeon:not([disabled])').waitFor();
  await page.locator('#character-name').fill('SoundQA');await page.locator('#character-role').selectOption('Wizard');await page.locator('#enter-dungeon').click();
  await page.waitForFunction(()=>window.descent?.state.playing&&window.descent.state.motion);await page.locator('#game').click();await page.waitForFunction(()=>!!document.pointerLockElement);
  await page.keyboard.down('w');await page.waitForTimeout(180);await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.descent.audio.events.some(e=>e.name==='jump'));await page.waitForFunction(()=>window.descent.audio.events.some(e=>e.name==='land'));await page.keyboard.up('w');
  const jump=await page.evaluate(()=>window.descent.audio.events.filter(e=>['jump','land','footstep'].includes(e.name)));
  const takeoff=jump.find(e=>e.name==='jump').time,landing=jump.find(e=>e.name==='land').time;
  assert.ok(landing-takeoff>.35);assert.equal(jump.filter(e=>e.name==='footstep'&&e.time>takeoff&&e.time<landing).length,0);
  // A pre-jump grounded packet arrives after the local Space event, before the
  // server can acknowledge takeoff. It must not produce an early landing.
  await page.waitForTimeout(350);
  const secondJump=await page.evaluate(()=>{
    const stale=structuredClone(window.__received.filter(e=>e.type==='motion').at(-1));stale.player.jumpOffset=0;stale.player.jumpVelocity=0;
    const start=window.descent.audio.context.currentTime;
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));
    window.__socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(stale)}));
    window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true}));return start;
  });
  await page.waitForFunction(start=>window.descent.audio.events.some(e=>e.name==='land'&&e.time>start),secondJump);
  assert.ok(await page.evaluate(start=>window.descent.audio.events.find(e=>e.name==='land'&&e.time>start).time-start,secondJump)>.35);
  await page.keyboard.press('Escape');await page.locator('[data-settings-section=spells]').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-spell-index]').length>=2);
  const first=page.locator('[data-spell-index="0"]'),second=page.locator('[data-spell-index="1"]');
  const names=await page.locator('.spell-bindings strong').allTextContents();assert.ok(names[0].toLowerCase().includes('force bolt'));
  await first.selectOption('q');await second.selectOption('q');assert.notEqual(await first.inputValue(),'q');assert.equal(await second.inputValue(),'q');
  await first.selectOption('q');assert.equal(await first.inputValue(),'q');assert.notEqual(await second.inputValue(),'q');
  await page.screenshot({path:'test-results/spell-letter-settings.png'});
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('descent.settings')));assert.equal(stored.spellBindings['force bolt'],'q');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!!document.pointerLockElement);await page.keyboard.press('f');await page.locator('.aiming-layer .menu-panel').waitFor();
  const entry=page.locator('.menu-item').filter({hasText:'force bolt'});assert.equal(await entry.locator('kbd').textContent(),'q');assert.ok(await page.evaluate(()=>!!document.pointerLockElement));
  const nativeId=await page.evaluate(()=>window.__received.filter(e=>e.type==='prompt'&&e.kind==='menu'&&e.aiming).at(-1).items.find(i=>i.text.includes('force bolt')).id);
  await page.keyboard.press('q');await page.waitForFunction(()=>!document.querySelector('.game-panel'));
  assert.equal(Number(await page.evaluate(()=>window.__sent.filter(e=>e.type==='answer').at(-1).input.value[0])),Number(nativeId));
  await page.keyboard.press('Escape');await page.locator('#music-enabled').uncheck();
  await page.waitForTimeout(1700);assert.ok(await page.evaluate(()=>window.descent.audio.buses.music.gain.value)<.02);
  const oldEffects=await page.evaluate(()=>window.descent.audio.buses.effects.gain.value);assert.ok(oldEffects>.5);
  await page.locator('#music-enabled').check();await page.waitForTimeout(1100);assert.ok(await page.evaluate(()=>window.descent.audio.buses.music.gain.value)>.2);
  await page.screenshot({path:'test-results/audio-settings.png'});
  // Exercise the actual Web Audio graph and changing scores without moving the
  // isolated character between native branches. Record a short audible sample.
  const audioQA=await page.evaluate(async()=>{
    const a=window.descent.audio,c=a.context,analyser=c.createAnalyser();analyser.fftSize=2048;a.master.connect(analyser);
    const capture=c.createMediaStreamDestination();a.master.connect(capture);const recorder=new MediaRecorder(capture.stream),chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
    const original=a.ambient.bind(a);a.ambient=()=>{};const areas=['Gnomish Mines','Sokoban','Gehennom','Astral Plane','Fort Ludios','The Quest',"Vlad's Tower",'Plane of Water','Dungeons of Doom'];
    const themes=[];for(const area of areas){a.ambient=original;a.ambient(.1,{playing:true,area});a.ambient=()=>{};themes.push(a.area);await new Promise(r=>setTimeout(r,120));}
    a.jump();a.movement(false);a.door();a.pickup('gold coins');a.interface();a.levelUp();
    for(const [id,name] of ['hill orc','wolf','ghost','dragon'].entries()){a.creature({id,name},'attack',{gain:.4,pan:(id-1.5)*.4});a.creature({id,name},'death',{gain:.3,pan:(id-1.5)*.4});}
    let peak=0,rms=0;const samples=new Float32Array(2048);
    for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,50));analyser.getFloatTimeDomainData(samples);peak=Math.max(peak,...samples.map(Math.abs));rms+=Math.sqrt(samples.reduce((sum,n)=>sum+n*n,0)/samples.length);}
    const done=new Promise(r=>recorder.onstop=r);recorder.stop();await done;
    const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());const base64=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
    a.master.disconnect(analyser);a.master.disconnect(capture);a.ambient=original;
    return {themes,peak,rms:rms/60,voices:a.voices.size,sample:base64};
  });
  assert.equal(new Set(audioQA.themes).size,9);assert.ok(audioQA.peak>0&&audioQA.peak<.95);assert.ok(audioQA.rms>.0001);assert.ok(audioQA.voices<=100);
  await writeFile('test-results/audio-overhaul.webm',Buffer.from(audioQA.sample,'base64'));delete audioQA.sample;
  assert.deepEqual(errors,[]);const result={jump,names,audio:audioQA,errors};await writeFile('test-results/audio-browser-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){console.error(output);throw error;}finally{await browser?.close();server.kill();}
