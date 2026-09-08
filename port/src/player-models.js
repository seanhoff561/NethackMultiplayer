import * as THREE from 'three';
import {CLASSES} from './party-rules.js';

// Box geometry, rough cloth and muted metal match the dungeon's voxel creatures.
// Each rig owns its geometry/materials so departed players release GPU resources.
export function playerModel(player){
  const style=CLASSES[player.role]||CLASSES.Knight,group=new THREE.Group(),body=new THREE.Group();group.add(body);
  const materials={},geometry=new THREE.BoxGeometry(1,1,1);
  const material=(name,color,metalness=0)=>materials[name]??=new THREE.MeshStandardMaterial({color,roughness:.88,metalness});
  const cloth=material('cloth',style.color),trim=material('trim',style.trim),skin=material('skin',player.race==='orc'?0x80816a:player.race==='elf'?0xb6a18c:0xa48a78),steel=material('steel',0x818898,.5),dark=material('dark',0x35323f),leather=material('leather',0x594849);
  const box=(parent,mat,pos,size)=>{const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(...pos);mesh.scale.set(...size);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  box(body,cloth,[0,1.04,0],[.52,.64,.3]);box(body,leather,[0,.78,0],[.56,.1,.34]);box(body,trim,[0,.78,-.185],[.09,.09,.025]);
  const shade=material('shade',new THREE.Color(style.color).multiplyScalar(.72));
  for(const side of [-1,1])for(let i=0;i<4;i++)box(body,shade,[side*.19,.93+i*.09,-.157],[.055,.05,.012]);
  box(body,trim,[0,1.32,-.16],[.25,.035,.025]);box(body,shade,[0,1.05,.158],[.035,.49,.016]);
  box(body,skin,[0,1.53,0],[.36,.38,.34]);box(body,dark,[0,1.65,.02],[.38,.14,.35]);
  for(const side of [-1,1]){box(body,dark,[side*.085,1.55,-.177],[.055,.04,.014]);if(player.race==='elf'||player.race==='orc')box(body,skin,[side*.21,1.53,0],[.1,.11,.11]);}
  if(player.race==='dwarf')for(let i=0;i<3;i++)box(body,leather,[(i-1)*.09,1.36-Math.abs(i-1)*.025,-.17],[.1,.25,.07]);
  const legs=[],arms=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.145,.74,0);body.add(leg);legs.push(leg);box(leg,cloth,[0,-.25,0],[.21,.5,.23]);box(leg,leather,[0,-.6,-.045],[.23,.27,.32]);
    const arm=new THREE.Group();arm.position.set(side*.35,1.28,0);body.add(arm);arms.push(arm);box(arm,cloth,[0,-.21,0],[.2,.43,.23]);box(arm,skin,[0,-.48,0],[.17,.16,.18]);box(arm,trim,[0,-.36,0],[.215,.075,.25]);
  }
  const hat=style.hat;
  if(['helm','kabuto','wings','horns'].includes(hat)){
    box(body,steel,[0,1.76,0],[.43,.18,.4]);box(body,steel,[0,1.57,-.19],[.055,.3,.035]);
    for(const side of [-1,1])box(body,steel,[side*.195,1.55,.04],[.07,.24,.32]);
    if(hat==='kabuto')for(const side of [-1,1]){box(body,trim,[side*.24,1.83,-.1],[.07,.25,.06]).rotation.z=side*-.6;box(body,cloth,[side*.25,1.61,.1],[.13,.23,.33]);}
    if(hat==='wings'||hat==='horns')for(const side of [-1,1])for(let i=0;i<3;i++)box(body,trim,[side*(.23+i*.055),1.77+i*.07,.04+i*.02],[.1,.13-i*.015,.14]);
  }else if(hat==='hood'){box(body,cloth,[0,1.78,.04],[.45,.17,.43]);for(const side of [-1,1])box(body,cloth,[side*.205,1.59,.025],[.07,.32,.38]);}
  else if(hat==='point'||hat==='mitre'){
    box(body,cloth,[0,1.77,0],[.47,.08,.44]);for(let i=0;i<5;i++)box(body,i===0?trim:cloth,[i*.016,1.85+i*.075,0],[.34-i*.057,.09,.33-i*.054]);
  }else if(hat==='brim'){box(body,leather,[0,1.76,0],[.62,.07,.57]);box(body,cloth,[0,1.86,.02],[.38,.2,.34]);box(body,trim,[0,1.8,.02],[.4,.06,.36]);}
  else if(hat==='fur'){box(body,leather,[0,1.76,.01],[.43,.19,.39]);box(body,trim,[-.2,1.6,.1],[.12,.25,.2]);}
  else if(hat==='cap')box(body,trim,[0,1.76,.02],[.42,.16,.38]);
  else box(body,trim,[0,1.64,0],[.385,.06,.36]);
  if(['Wizard','Priest','Monk','Healer'].includes(player.role))for(let i=0;i<4;i++)box(body,cloth,[(i-1.5)*.14,.64,.01],[.15,.35,.38]);
  if(['Ranger','Rogue','Wizard','Valkyrie'].includes(player.role)){const cloak=box(body,cloth,[0,1.05,.22],[.58,.87,.055]);cloak.rotation.x=.1;}
  if(player.role==='Archeologist'||player.role==='Tourist'){box(body,leather,[.31,.91,.15],[.2,.31,.25]);if(player.role==='Tourist')box(body,dark,[0,1.05,-.25],[.28,.21,.16]);}
  if(player.role==='Healer')for(const side of [-1,1])box(body,trim,[side*.2,.8,-.2],[.07,.19,.07]);
  const weapon=new THREE.Group();weapon.position.set(0,-.49,-.06);arms[1].add(weapon);
  const name=player.weapon||style.weapon;
  if(!/bare hands/.test(name)){
    box(weapon,leather,[0,-.12,0],[.06,.35,.07]);
    if(/staff|club|mace/.test(name)){box(weapon,/staff/.test(name)?leather:steel,[0,.37,0],[.075,1.1,.075]);if(/mace|club/.test(name))box(weapon,steel,[0,.73,0],[.23,.25,.21]);}
    else if(/axe/.test(name)){box(weapon,leather,[0,.3,0],[.075,.9,.07]);box(weapon,steel,[.07,.64,0],[.42,.3,.055]);}
    else if(/whip/.test(name)){for(let i=0;i<7;i++)box(weapon,leather,[Math.sin(i*.45)*.13,.12+i*.1,0],[.035,.13,.035]);}
    else {box(weapon,trim,[0,.05,0],[.26,.055,.065]);box(weapon,steel,[0,/dagger/.test(name)?.26:.52,0],[.075,/dagger/.test(name)?.36:.91,.04]);}
  }
  if(['Knight','Valkyrie'].includes(player.role)){box(arms[0],steel,[-.08,-.32,-.12],[.48,.61,.095]);box(arms[0],trim,[-.08,-.32,-.18],[.05,.48,.025]);}
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=80;
  const ctx=labelCanvas.getContext('2d');ctx.fillStyle='rgba(14,15,24,.78)';ctx.fillRect(8,8,496,64);ctx.font='bold 32px Georgia';ctx.textAlign='center';ctx.fillStyle='#e5dece';ctx.fillText(player.name,256,49,475);
  const texture=new THREE.CanvasTexture(labelCanvas),labelMaterial=new THREE.SpriteMaterial({map:texture,depthTest:true,transparent:true}),label=new THREE.Sprite(labelMaterial);label.scale.set(1.35,.211,1);label.position.y=2.28;group.add(label);
  const scale=player.race==='dwarf'?.82:player.race==='gnome'?.72:1;body.scale.setScalar(scale);label.position.y=2.28*scale;
  return {group,body,arms,legs,label,scale,target:new THREE.Vector3(),stride:0,attackAt:-10,dispose(){geometry.dispose();Object.values(materials).forEach(m=>m.dispose());texture.dispose();labelMaterial.dispose();}};
}

export class PartyModels {
  constructor(scene){this.scene=scene;this.models=new Map();this.shots=new Map();this.shotGeometry=new THREE.BoxGeometry(.08,.08,.35);this.shotMaterial=new THREE.MeshBasicMaterial({color:0xbfa8ec});}
  accept(packet,self){
    const visible=(packet.players||[]).filter(p=>p.id!==self&&p.connected&&p.levelId===packet.levelId),ids=new Set(visible.map(p=>p.id));
    for(const [id,rig] of this.models)if(!ids.has(id)){this.scene.remove(rig.group);rig.dispose();this.models.delete(id);}
    for(const p of visible){let rig=this.models.get(p.id);const signature=[p.name,p.role,p.race,p.weapon].join(':');if(rig&&rig.signature!==signature){this.scene.remove(rig.group);rig.dispose();this.models.delete(p.id);rig=null;}
      if(!rig){rig=playerModel(p);rig.signature=signature;rig.group.position.set(p.x,p.y||0,p.z);this.scene.add(rig.group);this.models.set(p.id,rig);}rig.data=p;rig.target.set(p.x,(p.y||0)+(p.jumpOffset||0),p.z);
      if(p.attackAt!==rig.attackAt){rig.attackAt=p.attackAt;rig.attackAge=packet.time-p.attackAt;}
    }
    const shots=new Set((packet.projectiles||[]).map(p=>p.id));for(const [id,mesh] of this.shots)if(!shots.has(id)){this.scene.remove(mesh);this.shots.delete(id);}
    for(const p of packet.projectiles||[]){let mesh=this.shots.get(p.id);if(!mesh){mesh=new THREE.Mesh(this.shotGeometry,this.shotMaterial);this.shots.set(p.id,mesh);this.scene.add(mesh);}mesh.position.set(p.x,p.y,p.z);}
  }
  update(dt){for(const rig of this.models.values()){
    const p=rig.data;rig.group.position.lerp(rig.target,1-Math.exp(-dt*16));rig.group.rotation.y+=Math.atan2(Math.sin(p.yaw-rig.group.rotation.y),Math.cos(p.yaw-rig.group.rotation.y))*(1-Math.exp(-dt*12));
    rig.stride+=dt*(p.moving?9:0);rig.walk=(rig.walk||0)+((p.moving?1:0)-(rig.walk||0))*(1-Math.exp(-dt*12));rig.attackAge=(rig.attackAge??10)+dt;
    const attack=rig.attackAge<.55?Math.sin(Math.PI*rig.attackAge/.55):0;
    rig.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(rig.stride+i*Math.PI)*.6*rig.walk);
    rig.arms.forEach((arm,i)=>arm.rotation.x=-Math.sin(rig.stride+i*Math.PI)*.4*rig.walk+(i?attack*2.1:0)-(p.defend?.8:0));
    rig.body.position.y=Math.abs(Math.sin(rig.stride))*.035*rig.walk-(p.crouch?.35:0);rig.body.rotation.x=p.downed?-Math.PI/2:0;rig.label.material.opacity=p.downed?.55:1;
  }}
  clear(){this.accept({players:[],projectiles:[]});}
  dispose(){this.clear();this.shotGeometry.dispose();this.shotMaterial.dispose();}
}
