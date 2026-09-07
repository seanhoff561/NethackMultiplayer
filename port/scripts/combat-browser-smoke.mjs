import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
await mkdir('test-results',{recursive:true});const runtime=await mkdtemp(path.resolve('test-results/combat-browser-')),port=5187;
const server=spawn(process.execPath,['server.mjs',...(process.argv.includes('--dev')?['--dev']:[])],{env:{...process.env,PORT:String(port),NETHACK_RUNTIME:runtime},windowsHide:true,stdio:'pipe'});
let output='',browser;server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
try{
  for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/status`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const WS=window.WebSocket;window.__sent=[];window.WebSocket=class extends WS{send(s){window.__sent.push(JSON.parse(s));super.send(s);}};});
  await page.goto(`http://127.0.0.1:${port}`);await page.locator('#enter-dungeon:not([disabled])').waitFor();
  await page.locator('.title-links [data-action=fullscreen]').click();await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.locator('#character-name').fill('CombatQA');await page.locator('#character-role').selectOption('Valkyrie');await page.locator('#enter-dungeon').click();
  await page.waitForFunction(()=>window.descent?.state.playing&&window.descent.state.motion);await page.locator('#mouse-capture').click();
  await page.keyboard.press('Escape');await page.locator('.settings-panel').waitFor();
  assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true,'Escape opens menu without leaving fullscreen');
  await page.screenshot({path:'test-results/combat-settings.png'});await page.locator('[data-action=resume]').click();
  assert.equal(await page.locator('.hud-actions,#fullscreen-toggle').count(),0);
  await page.keyboard.press('Space');await page.waitForFunction(()=>window.__sent.some(e=>e.type==='action'&&e.key==='Z'));
  assert.equal(await page.evaluate(()=>window.__sent.filter(e=>e.type==='action').at(-1).key),'Z');
  assert.equal(await page.evaluate(()=>window.__sent.some(e=>e.melee)),false);
  await page.keyboard.press('Escape');await page.locator('[data-action=resume]').click();
  const ac=await page.evaluate(()=>window.descent.state.player.ac);
  await page.mouse.down({button:'right'});await page.waitForFunction(()=>window.descent.state.player.guardBonus===4);
  assert.equal(await page.evaluate(()=>window.descent.state.player.ac),ac-4);assert.equal(await page.locator('.game-panel').count(),0);
  await page.screenshot({path:'test-results/combat-shield.png'});
  await page.keyboard.press('Escape');await page.locator('.settings-panel').waitFor();await page.waitForFunction(()=>window.descent.state.player.guardBonus===0);await page.mouse.up({button:'right'});
  // New run saves first, returns to creation, and archives a same-name save.
  await page.locator('[data-action=new-run]').click();await page.locator('[data-action=confirm-new-run]').click();
  await page.waitForFunction(()=>!window.descent.state.playing&&!document.querySelector('.game-panel'));
  assert.ok((await readdir(runtime)).some(n=>n==='CombatQA.NetHack-saved-game'));
  await page.locator('#character-role').selectOption('Wizard');await page.locator('#enter-dungeon').click();
  await page.waitForFunction(()=>window.descent.state.playing&&window.descent.state.player.role==='Wizard');
  assert.ok((await readdir(path.join(runtime,'archive'))).length===1);
  await page.keyboard.press('Space');await page.locator('.menu-panel,.prompt-panel').waitFor();
  await page.keyboard.press('F10');await page.waitForFunction(()=>!document.fullscreenElement);
  assert.deepEqual(errors,[]);
  const results=['Escape retains fullscreen; F10 exits','Space casts, never melees','Right mouse adds native shield AC; opening a menu releases guard','Corner icons removed','New run saves and archives the old same-name expedition'];
  await writeFile('test-results/combat-browser-results.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}catch(e){console.error(output);throw e;}finally{await browser?.close();server.kill();}
