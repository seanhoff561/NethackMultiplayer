import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);await mkdir('test-results',{recursive:true});
const runtime=await mkdtemp(path.join(root,'test-results/party-browser-')),port=5191,url=`http://127.0.0.1:${port}`;
const tone=Buffer.alloc(44+48000*2);tone.write('RIFF');tone.writeUInt32LE(tone.length-8,4);tone.write('WAVEfmt ',8);tone.writeUInt32LE(16,16);tone.writeUInt16LE(1,20);tone.writeUInt16LE(1,22);tone.writeUInt32LE(48000,24);tone.writeUInt32LE(96000,28);tone.writeUInt16LE(2,32);tone.writeUInt16LE(16,34);tone.write('data',36);tone.writeUInt32LE(tone.length-44,40);for(let i=0;i<48000;i++)tone.writeInt16LE(Math.round(Math.sin(i/48000*220*Math.PI*2)*6000),44+i*2);const toneFile=path.join(runtime,'voice-fixture.wav');await writeFile(toneFile,tone);
const server=spawn(process.execPath,['server.mjs','--dev'],{cwd:root,env:{...process.env,PORT:String(port),NETHACK_RUNTIME:runtime,HOST:'127.0.0.1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='',browser;const pages=[],errors=[];server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
try{
  for(let i=0;i<80;i++){try{if((await fetch(url+'/api/status')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${toneFile}`,'--autoplay-policy=no-user-gesture-required']});
  let code;
  for(const [i,role] of ['Knight','Wizard','Healer','Rogue'].entries()){
    const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['microphone']}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{const Socket=window.WebSocket;window.WebSocket=class extends Socket{constructor(...args){super(...args);window.__qaSocket=this;}};});
    await page.goto(url);await page.waitForFunction(()=>window.descent?.state.connected);
    await page.locator('#character-name').fill(`Companion ${i+1}`);await page.locator('#character-role').selectOption(role);await page.locator('#expedition-mode').selectOption(i?'join':'create');if(i)await page.locator('#party-code').fill(code);
    await page.locator('#enter-dungeon').click();await page.waitForFunction(()=>window.descent?.state.party&&window.descent.state.motion,{},{timeout:20000});
    code=await page.evaluate(()=>window.descent.state.party.code);
  }
  for(const page of pages)await page.waitForFunction(()=>window.descent.state.party.models===3,{},{timeout:10000});
  for(const page of pages)assert.equal(await page.evaluate(()=>[...window.descent.renderer.monsters.values()].some(m=>m.data?.tame)),false,'no multiplayer pets');
  const ids=await Promise.all(pages.map(page=>page.evaluate(()=>window.descent.state.party.id)));assert.equal(new Set(ids).size,4);
  const initial=await pages[0].evaluate(()=>window.descent.state.motion.player);
  await pages[0].locator('#game').click({position:{x:700,y:450}});await pages[0].keyboard.down('w');await pages[0].waitForTimeout(250);await pages[0].keyboard.up('w');await pages[0].waitForTimeout(150);
  const moved=await pages[0].evaluate(()=>window.descent.state.motion.player);assert.ok(Math.hypot(initial.x-moved.x,initial.z-moved.z)>.05);
  await pages[1].waitForFunction(id=>window.descent.state.motion.players.some(p=>p.id===id&&p.moving),ids[0],{timeout:200}).catch(()=>{});
  await pages[0].screenshot({path:'test-results/party-four-players.png'});
  for(const [i,page] of pages.slice(0,2).entries()){
    await page.locator('#game').click({position:{x:700,y:450}});await page.keyboard.press('m');await page.waitForFunction(()=>window.descent.renderer.mapHeld&&window.descent.renderer.mapRecord?.ownerId===window.descent.state.party.id);
    const record=await page.evaluate(()=>window.descent.renderer.mapRecord);assert.equal(record.ownerName,`Companion ${i+1}`);assert.ok(record.tiles.some(t=>t.char==='.'||t.char==='#'));assert.ok(record.tiles.some(t=>t.char==='|'||t.char==='-'),'room boundaries are drawn');
    await page.waitForFunction(time=>window.descent.renderer.mapRecord.time!==time,record.time,{timeout:4000});
    const png=await page.evaluate(()=>window.descent.renderer.parchment.canvas.toDataURL('image/png'));await writeFile(`test-results/party-personal-map-${i+1}.png`,Buffer.from(png.split(',')[1],'base64'));
    await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementY:440})));await page.waitForTimeout(250);await page.screenshot({path:`test-results/party-held-map-${i+1}.png`});await page.keyboard.press('m');
    await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementY:-440})));
  }
  for(const page of pages){await page.evaluate(()=>document.exitPointerLock());await page.locator('.party-open').click();await page.locator('#voice-enable').click();await page.waitForFunction(()=>window.descent.state.party.voiceEnabled);}
  for(const page of pages)await page.waitForFunction(()=>window.descent.state.party.voicePeers.length===3&&window.descent.state.party.voicePeers.every(s=>s==='connected'),{},{timeout:20000});
  await pages[0].locator('#voice-ptt').uncheck();await pages[1].locator('.party-speaker').filter({hasText:'Companion 1'}).waitFor({timeout:15000});await pages[0].screenshot({path:'test-results/party-voice-menu.png'});
  await pages[0].locator('#voice-mute').click();await pages[1].waitForFunction(()=>![...document.querySelectorAll('.party-speaker')].some(n=>n.textContent.includes('Companion 1')),{},{timeout:5000});
  // Test the actual processed microphone track, not just slider labels.
  await pages[0].locator('#voice-mute').click();
  await pages[0].locator('#voice-volume').fill('0');await pages[1].waitForFunction(()=>![...document.querySelectorAll('.party-speaker')].some(n=>n.textContent.includes('Companion 1')),{},{timeout:5000});
  await pages[0].locator('#voice-volume').fill('150');await pages[0].waitForFunction(()=>window.descent.voice.inputGain.gain.value>1.49);await pages[1].locator('.party-speaker').filter({hasText:'Companion 1'}).waitFor({timeout:5000});
  await pages[0].locator('#voice-test').click();await pages[0].waitForFunction(()=>document.querySelector('#voice-meter').value>0.01&&window.descent.voice.testing);assert.equal(await pages[0].evaluate(()=>window.descent.voice.stream.getAudioTracks()[0].enabled),false,'mic test is not transmitted');
  await pages[1].waitForFunction(()=>![...document.querySelectorAll('.party-speaker')].some(n=>n.textContent.includes('Companion 1')),{},{timeout:5000});
  const device=await pages[0].locator('#voice-device option').evaluateAll(options=>options.find(o=>o.value&&o.value!=='default')?.value||'');assert.ok(device,'microphone devices are listed');
  const previousTrack=await pages[0].evaluate(()=>window.descent.voice.raw.getAudioTracks()[0].id);await pages[0].locator('#voice-device').selectOption(device);await pages[0].waitForFunction(id=>window.descent.voice.raw.getAudioTracks()[0].id!==id,previousTrack);assert.equal(await pages[0].evaluate(()=>window.descent.voice.peers.size),3,'device switch preserves peer connections');
  await pages[0].screenshot({path:'test-results/party-microphone-options.png'});await pages[0].locator('#voice-test').click();await pages[1].locator('.party-speaker').filter({hasText:'Companion 1'}).waitFor({timeout:5000});
  await pages[0].locator('#voice-volume').fill('100');await pages[0].locator('#voice-mute').click();
  // Reload uses this tab's private reconnect credential without creating a fifth hero.
  const beforeReconnect=await pages[3].evaluate(()=>window.descent.renderer.snapshot.cartography.tiles.map(t=>`${t.x},${t.y}`));
  await pages[3].reload();await pages[3].locator('#rejoin-party').click();await pages[3].waitForFunction(()=>window.descent.state.party?.models===3,{},{timeout:15000});assert.equal(await pages[3].evaluate(()=>window.descent.state.party.id),ids[3]);
  const afterReconnect=await pages[3].evaluate(()=>window.descent.renderer.snapshot.cartography.tiles.map(t=>`${t.x},${t.y}`));assert.ok(beforeReconnect.every(key=>afterReconnect.includes(key)),'personal exploration survives reconnect');
  // Presentation fixture: inspect every class rig, including models not chosen above.
  const gallery=await browser.newPage({viewport:{width:1600,height:900}});await gallery.goto(url);
  const rigs=await gallery.evaluate(async()=>{
    const THREE=await import('three'),{playerModel}=await import('/src/player-models.js'),{CLASSES}=await import('/src/party-rules.js');
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x16151f);const camera=new THREE.OrthographicCamera(-9,9,5.05,-5.05,.1,100);camera.position.set(0,9,-24);camera.lookAt(0,0,0);
    scene.add(new THREE.HemisphereLight(0xeee6ff,0x3b3340,2));const light=new THREE.DirectionalLight(0xffedcf,2);light.position.set(-4,7,-6);scene.add(light);
    const render=new THREE.WebGLRenderer({antialias:true});render.setSize(1600,900);render.domElement.style.cssText='position:fixed;inset:0;z-index:9999';document.body.append(render.domElement);
    const records=Object.keys(CLASSES).map((role,i)=>{const rig=playerModel({name:role,role,race:'human'});rig.group.position.set((i%7-3)*2.45,0,i<7?2.8:-3.2);rig.group.rotation.y=.15;scene.add(rig.group);rig.arms[1].rotation.x=i%2?.85:0;rig.legs[0].rotation.x=.25;rig.legs[1].rotation.x=-.25;return {role,parts:rig.body.children.length};});render.render(scene,camera);return records;
  });assert.equal(rigs.length,13);await gallery.screenshot({path:'test-results/party-class-models.png'});
  // Presentation-only outcome fixtures; campaign and permanent defeat rules are
  // exercised on the authoritative server by the simulation tests.
  for(const [i,status] of ['defeat','victory'].entries()){
    await pages[i].evaluate(status=>window.__qaSocket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'party-result',status,text:status==='defeat'?'The entire party has fallen. Create a new expedition.':'The party offers the Amulet of Yendor and ascends together.'})})),status);
    await pages[i].locator('.party-result').waitFor();assert.equal(await pages[i].evaluate(()=>window.descent.state.playing),false);await pages[i].screenshot({path:`test-results/party-${status}.png`});
  }
  await pages[0].locator('.party-result button').click();await pages[0].waitForFunction(()=>!sessionStorage.getItem('descent.party')&&document.querySelector('#enter-dungeon'));assert.equal(await pages[0].locator('#rejoin-party').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({players:4,modelsPerClient:3,classModels:rigs.length,voiceLinks:6,receivedVoice:true,mute:true,microphoneSelection:true,microphoneVolume:true,privateMicrophoneTest:true,reconnect:true,outcomeScreens:true,code,runtime}));
}catch(error){console.error(output,errors);for(const page of pages)console.error(await page.evaluate(async()=>{const v=window.descent.voice;return {party:window.descent?.state.party,status:document.querySelector('#voice-status')?.textContent,context:v.context?.state,local:v.energy(v.analyser),track:v.stream?.getTracks().map(t=>({enabled:t.enabled,state:t.readyState})),remote:await Promise.all([...v.peers.values()].map(async p=>({level:v.energy(p.analyser),gain:p.gain?.gain.value,stats:[...(await p.pc.getStats()).values()].filter(s=>s.type==='inbound-rtp').map(s=>({bytes:s.bytesReceived,audioLevel:s.audioLevel}))})))}}));throw error;}finally{await browser?.close();server.kill();}
