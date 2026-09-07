// Controlled presentation fixtures; native gameplay is covered by the other suites.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
await mkdir('test-results',{recursive:true});
const runtime=await mkdtemp(path.resolve('test-results/dark-browser-')),port=5186;
const server=spawn(process.execPath,['server.mjs',...(process.argv.includes('--dev')?['--dev']:[])],{env:{...process.env,PORT:String(port),NETHACK_RUNTIME:runtime},windowsHide:true,stdio:'pipe'});
let browser,output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
try{
  for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/status`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${port}`);await page.waitForFunction(()=>window.descent?.renderer);
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;document.querySelector('#ui').hidden=true;});await page.waitForTimeout(100);
  await page.evaluate(()=>{
    const r=window.descent.renderer,tiles=[];
    for(let x=0;x<8;x++)for(let y=0;y<8;y++)tiles.push({x,y,type:x===0||y===0||x===7||y===7?'wall':'floor'});
    r.setWorld({levelId:'dark-fixture',tiles,player:{weapon:'long sword',shield:'small shield'},inventory:[],actors:[{id:1,x:4,y:3,name:'orc',symbol:'o',color:2}],floorObjects:[]});
    r.setPose({x:3.5,y:4,yaw:0,pitch:-.06,elevation:0,moving:false});
    for(let i=0;i<120;i++)r.update(1/60);
  });
  const models=await page.evaluate(()=>{
    const r=window.descent.renderer,blade=r.geometries.get('blade:1.72');blade.computeBoundingBox();
    return {bladeLength:blade.boundingBox.max.y-blade.boundingBox.min.y,onlyWeapon:r.rightHand.children.length===1&&r.rightHand.children[0]===r.weaponMount,onlyShield:r.leftHand.children.length===1&&r.leftHand.children[0]===r.shieldMount,roughness:r.weaponMount.children.find(o=>o.geometry===blade).material.roughness};
  });
  assert.ok(Math.abs(models.bladeLength-1.72)<1e-6);assert.ok(models.onlyWeapon&&models.onlyShield);assert.ok(models.roughness>.65);
  await page.screenshot({path:'test-results/dark-longsword.png'});
  for(const [name,seconds] of [['windup',.13],['cut',.22],['impact',.28],['followthrough',.36],['recovered',.54]]){
    await page.evaluate(t=>{const r=window.descent.renderer;r.attack('melee');r.update(t);},seconds);
    await page.screenshot({path:`test-results/dark-sword-${name}.png`});
  }
  const themes=[];
  for(let theme=0;theme<4;theme++){
    const result=await page.evaluate(theme=>{
      const r=window.descent.renderer;
      // Put each procedural family in the same inspection room.
      r.world.children.filter(o=>o.userData.dressing||o.name==='dungeon-dressing-batch').forEach(o=>{o.removeFromParent();if(o.isInstancedMesh)o.dispose();});
      r.features=r.features.filter(f=>!['hanging','trickle','wisp','rune'].includes(f.type));
      for(let v=0;v<3;v++)r._dressing({x:7.5+v*3,z:3.02,angle:0,theme,variant:v,phase:v,cellX:v,cellY:1});
      r._batchDressing();r.setPose({x:3.5,y:2.8,yaw:0,pitch:-.05});r.update(.54);
      const moving=r.features.filter(f=>f.group?.userData.decorativeMotion);
      const before=moving.map(f=>[f.group.position.x,f.group.position.y,f.group.position.z,f.group.rotation.z]);
      r.update(.5);
      return {theme,animated:moving.length,moves:moving.some((f,i)=>[f.group.position.x,f.group.position.y,f.group.position.z,f.group.rotation.z].some((v,j)=>v!==before[i][j])),batches:r.world.children.filter(o=>o.name==='dungeon-dressing-batch').length};
    },theme);
    assert.ok(result.animated>0&&result.moves);assert.ok(result.batches>0);themes.push(result);
    await page.screenshot({path:`test-results/dark-theme-${theme}.png`});
  }
  // Verify blindness lighting eases instead of snapping; recovery restores it.
  const lighting=await page.evaluate(()=>{
    const r=window.descent.renderer,lit=r.lantern.intensity;r.snapshot.player.blind=true;r.update(.016);const fading=r.lantern.intensity;
    for(let i=0;i<180;i++)r.update(1/60);const dark=r.lantern.intensity;r.snapshot.player.blind=false;r.update(.016);
    return {lit,fading,dark,recovering:r.lantern.intensity};
  });assert.ok(lighting.fading>lighting.dark&&lighting.fading<lighting.lit&&lighting.recovering>lighting.dark);
  const creatures=await page.evaluate(()=>{
    const r=window.descent.renderer;r.snapshot.player.blind=false;r.creatures.clear();r.monsters.clear();
    const types=[{name:'gnome',symbol:'G',size:1},{name:'orc captain',symbol:'o',size:2,weapon:'battle-axe'},{name:'Orcus',symbol:'&',size:3,boss:true,weapon:'wand of death'},{name:'fire elemental',symbol:'E',size:4}];
    const result=[];
    for(let i=0;i<types.length;i++){
      const g=r._creature(types[i].name,5,types[i].symbol,types[i]);g.position.set(4.5+i*4,0,7);g.rotation.y=0;r.creatures.add(g);
      r.monsters.set(`id:${i}`,{group:g,target:g.position.clone(),phase:i,moving:true,yaw:0,name:types[i].name});
      result.push({name:types[i].name,height:g.userData.profile.height,scale:g.userData.body.scale.y,meshCount:0});g.traverse(o=>{if(o.isMesh)result[i].meshCount++;});
    }
    r.setPose({x:3.5,y:5.1,yaw:0,pitch:0});for(let i=0;i<120;i++)r.update(1/60);
    return result;
  });
  assert.ok(creatures[1].height>1.8&&creatures[2].height>3);await page.screenshot({path:'test-results/creature-lineup.png'});
  const animation=await page.evaluate(()=>{
    const r=window.descent.renderer,e=r.monsters.get('id:1'),legs=e.group.userData.legs,arms=e.group.userData.arms;
    const leg=legs[0].rotation.x;r.update(.1);const walked=legs[0].rotation.x!==leg;r.actorAttack(1);r.update(.18);
    return {walked,attack:Math.abs(arms[1].rotation.x)>1,body:e.group.userData.body.rotation.x};
  });assert.ok(animation.walked&&animation.attack&&animation.body<0);await page.screenshot({path:'test-results/creature-attack.png'});
  const source=await readFile('../include/objects.h','utf8');
  const symbols={WEAPON:')',PROJECTILE:')',BOW:')',HELM:'[',GLOVES:'[',BOOTS:'[',CLOAK:'[',ARMOR:'[',RING:'=',AMULET:'"',TOOL:'(',WEPTOOL:'(',FOOD:'%',POTION:'!',SCROLL:'?',SPELL:'+',WAND:'/',GEM:'*',COIN:'$'};
  const catalog=[...source.matchAll(/^(WEAPON|PROJECTILE|BOW|HELM|GLOVES|BOOTS|CLOAK|ARMOR|RING|AMULET|TOOL|WEPTOOL|FOOD|POTION|SCROLL|SPELL|WAND|GEM|COIN)\("([^"\n]+)"/gm)].map((m,i)=>({name:m[2],symbol:symbols[m[1]],modelId:i,appearance:m[2]}));
  const coverage=await page.evaluate(catalog=>{
    const r=window.descent.renderer;let count=0,missing=[];
    for(const item of catalog){const g=r._item(item.name,7,item.symbol,item);let meshes=0;g.traverse(o=>{if(o.isMesh)meshes++;});if(!meshes||!g.userData.modelKey)missing.push(item.name);else count++;}
    r.creatures.clear();r.monsters.clear();r.items.clear();
    const display=[['iron shoes','[',4],['leather gloves','[',3],['brass lantern','('],['skeleton key','('],['crossbow',')'],['trident',')'],['wooden harp','('],['tin','%'],['food ration','%'],['expensive camera','('],['plumed helmet','[',2],['magic marker','(']];
    display.forEach(([name,symbol,armorSlot],i)=>{const g=r._item(name,7,symbol,{appearance:name,armorSlot});g.position.set(7.5+i%4*2,0,6.5+Math.floor(i/4)*2);r.items.add(g);});
    r.setPose({x:3.5,y:4.5,yaw:0,pitch:-.6});r.update(.8);return {count,missing};
  },catalog);assert.ok(coverage.count>200);assert.deepEqual(coverage.missing,[]);await page.screenshot({path:'test-results/item-models.png'});
  for(const branch of ['Gnomish Mines','Sokoban','Gehennom','Astral Plane']){
    await page.evaluate(branch=>{const r=window.descent.renderer,s=structuredClone(r.snapshot);s.player.dungeon=branch;s.levelId=branch;s.actors=[];s.floorObjects=[];r.setWorld(s);r.setPose({x:3.5,y:4,yaw:0,pitch:-.07});for(let i=0;i<90;i++)r.update(1/60);},branch);
    await page.screenshot({path:`test-results/branch-${branch.replaceAll(' ','-')}.png`});
  }
  assert.deepEqual(errors,[]);
  const result={models,themes,lighting,creatures,animation,coverage,errors};await writeFile('test-results/dark-fantasy-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(e){console.error(output);throw e;}finally{await browser?.close();server.kill();}
