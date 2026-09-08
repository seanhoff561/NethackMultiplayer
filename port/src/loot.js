// Stable, separated placement shared by interaction targeting and presentation.
import {stairWorld} from './spatial.js';
export function lootPositions(objects=[],world) {
  const groups=new Map(),result=[];
  for(const item of objects){const key=`${item.x},${item.y}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  for(const group of groups.values()){
    group.sort((a,b)=>a.id-b.id);
    const placed=[];
    group.forEach(item=>{
      const angle=item.id*2.3999632297+(item.x*13+item.y*7)*.17;
      const radius=.66+(item.id%3)*.14;
      let x=(item.x+.5)*3+Math.cos(angle)*radius,z=(item.y+.5)*3+Math.sin(angle)*radius;
      const altar=world?.at((item.x+.5)*3,(item.y+.5)*3)?.type==='altar';
      const stair=world?.stairs.find(s=>s.cellX===item.x&&s.cellZ===item.y);
      if(stair){const p=stairWorld(stair,-.72+(item.id%3-1)*.19,1.22-(Math.floor(item.id/3)%3)*.22);x=p.x;z=p.z;}
      else if(altar){
        const index=placed.length,ring=Math.floor(index/8),a=index*2.3999632297;
        const r=index===0?0:Math.min(.55,.32+ring*.12);
        x=(item.x+.5)*3+Math.cos(a)*r;z=(item.y+.5)*3+Math.sin(a)*r;
      }
      else if(/boulder|statue/.test(item.name||'')){x=(item.x+.5)*3;z=(item.y+.5)*3;}
      else for(let attempt=0;attempt<24;attempt++){
        if((!world||world.clear({radius:.12,y:world.support(x,z)||0},x,z))&&placed.every(p=>Math.hypot(p.x-x,p.z-z)>.35))break;
        x=(item.x+.5)*3+Math.cos(angle+attempt*.6)*(.3+(attempt%4)*.2);
        z=(item.y+.5)*3+Math.sin(angle+attempt*.6)*(.3+(attempt%4)*.2);
      }
      placed.push({x,z});result.push({...item,worldX:x,worldZ:z,worldY:world?.support(x,z)||0,rotation:angle});
    });
  }
  return result;
}
export function targetLoot(objects,body,yaw,world) {
  if(!body)return null;
  return lootPositions(objects,world).map(item=>{
    const dx=item.worldX-body.x,dz=item.worldZ-body.z,distance=Math.hypot(dx,dz);
    return {...item,distance,alignment:(-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/Math.max(.01,distance)};
  }).filter(i=>i.distance<2.05&&Math.abs((body.y||0)-i.worldY)<1.5&&(i.alignment>.25||i.distance<.65)&&world.lineClear(body,{x:i.worldX,z:i.worldZ},.02))
    .sort((a,b)=>(b.alignment-a.alignment)*.5+a.distance-b.distance)[0]||null;
}
