import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
await mkdir('test-results',{recursive:true});
const runtime=await mkdtemp(path.resolve('test-results/spatial-browser-'));
const port=5182;
const server=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NETHACK_RUNTIME:runtime},windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
let browser;
try{
  for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/status`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${port}`);await page.waitForTimeout(1000);
  await page.locator('#character-name').fill('SpatialQA');await page.locator('#character-role').selectOption('Valkyrie');await page.locator('#enter-dungeon').click();
  await page.waitForFunction(()=>window.descent?.state.playing&&window.descent.state.motion,{},{timeout:15000});
  await page.waitForTimeout(500);
  console.log('Initial',JSON.stringify(await page.evaluate(()=>window.descent.state)));
  await page.screenshot({path:'test-results/spatial-game.png'});
  await page.locator('#mouse-capture').click();
  const before=await page.evaluate(()=>window.descent.state.pose);
  await page.keyboard.down('w');await page.waitForTimeout(130);await page.keyboard.up('w');
  const after=await page.evaluate(()=>window.descent.state.pose);
  const travelled=Math.hypot(after.x-before.x,after.y-before.y)*3;
  assert.ok(travelled>.035&&travelled<1.2,`fractional movement in 130ms: ${travelled}`);
  await page.keyboard.down('Control');await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.descent.state.pose.crouch),true);await page.keyboard.up('Control');
  await page.keyboard.press('i');const turn=await page.evaluate(()=>window.descent.state.player.turn);
  const actors=await page.evaluate(()=>window.descent.state.motion.actors);
  await page.waitForTimeout(1800);assert.ok(await page.evaluate(()=>window.descent.state.player.turn)>turn);
  const actorsAfter=await page.evaluate(()=>window.descent.state.motion.actors);
  console.log('Fractional movement metres',travelled,'actor movement',actors.map(a=>({id:a.id,delta:Math.hypot((actorsAfter.find(b=>b.id===a.id)?.x??a.x)-a.x,(actorsAfter.find(b=>b.id===a.id)?.z??a.z)-a.z)})));
  await page.screenshot({path:'test-results/spatial-inventory.png'});
  await page.keyboard.press('Escape');
  const savedPose=await page.evaluate(()=>window.descent.state.motion.player);
  await page.keyboard.press('Tab');await page.locator('#command-search').fill('save');await page.locator('[data-palette-key="S"]').click();
  await page.locator('[data-choice="y"]').waitFor({timeout:8000});await page.locator('[data-choice="y"]').click();
  await page.waitForFunction(()=>!window.descent.state.playing);await page.locator('#continue-game').click();
  await page.waitForFunction(()=>window.descent.state.playing&&window.descent.state.motion);await page.waitForTimeout(300);
  const resumed=await page.evaluate(()=>window.descent.state.motion.player);
  assert.ok(Math.hypot(savedPose.x-resumed.x,savedPose.z-resumed.z)<.05,'save/continue retains fractional placement');
  // Render the actual native stairwell from eye level and from its turning landing.
  await page.keyboard.press('Escape');
  const stair=await page.evaluate(()=>window.descent.state.collision.find(s=>s.sign<0)||window.descent.state.collision[0]);
  if(stair){
    await page.evaluate(s=>{
      const r=window.descent.renderer;r.setPose({x:(s.x-.72*Math.cos(s.angle)+1.4*Math.sin(s.angle))/3,y:(s.z+.72*Math.sin(s.angle)+1.4*Math.cos(s.angle))/3,elevation:0,yaw:s.angle,pitch:-.28});r.update(.016);
    },stair);
    // Freeze RAF only for this geometry inspection; gameplay assertions ran above.
    await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.waitForTimeout(100);
    await page.evaluate(s=>{const r=window.descent.renderer;r.setPose({x:(s.x-.72*Math.cos(s.angle)+1.4*Math.sin(s.angle))/3,y:(s.z+.72*Math.sin(s.angle)+1.4*Math.cos(s.angle))/3,elevation:0,yaw:s.angle,pitch:-.88});r.update(.016);document.querySelector('#mouse-capture').hidden=true;},stair);
    await page.screenshot({path:'test-results/spatial-stairs.png'});
  }
  assert.deepEqual(errors,[]);await writeFile('test-results/spatial-browser-errors.json',JSON.stringify({errors,output,travelled},null,2));
  console.log('Spatial browser checks passed.');
}finally{await browser?.close();server.kill();}
