// NetHack: Descent, 2026-09-07. Continuous metre-space collision and stair geometry.
export const CELL = 3;
export const FLOOR_HEIGHT = 4.2;
export const RADIUS = .28;
const solid = new Set(['wall','stone','unknown']);
export const canonical = type => ({'door-closed':'door','door-open':'door_open','stairs-up':'stairs_up','stairs-down':'stairs_down'}[type] || type);
export const cellKey = (x,z) => `${x},${z}`;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const stairWalls=[{x:-1.47,z:0,hx:.08,hz:1.5},{x:1.47,z:0,hx:.08,hz:1.5},{x:0,z:-1.47,hx:1.5,hz:.08},{x:0,z:.425,hx:.08,hz:1.075}];

// Two flights and a turning landing, sharing one compact architectural stairwell.
// Rotation and dimensions are consumed by both physics and the renderer.
export function stairLocal(stair,x,z) {
  const dx=x-stair.x,dz=z-stair.z,c=Math.cos(stair.angle),s=Math.sin(stair.angle);
  return {x:c*dx-s*dz,z:s*dx+c*dz};
}
export function stairWorld(stair,x,z) {
  const c=Math.cos(stair.angle),s=Math.sin(stair.angle);
  return {x:stair.x+c*x+s*z,z:stair.z-s*x+c*z};
}
export function stairHeight(stair,x,z) {
  const p=stairLocal(stair,x,z);
  if(Math.abs(p.x)>1.5||Math.abs(p.z)>1.5)return null;
  if(p.z<-.65)return stair.sign*FLOOR_HEIGHT/2;
  const progress=clamp((1.5-p.z)/2.15,0,1);
  return stair.sign*FLOOR_HEIGHT*(p.x<0?progress/2:1-progress/2);
}
export function stairFinished(stair,body) {
  const p=stairLocal(stair,body.x,body.z);
  return p.x>.32&&p.x<1.22&&p.z>1.05&&p.z<1.5&&Math.abs(body.y-stair.sign*FLOOR_HEIGHT)<.5;
}

export class CollisionWorld {
  constructor(tiles=[]) { this.setTiles(tiles); }
  setTiles(tiles) {
    this.tiles=new Map(tiles.map(t=>[cellKey(t.x,t.y),{...t,type:canonical(t.type)}]));
    this.stairs=[];
    for(const t of this.tiles.values())if(t.type==='stairs_up'||t.type==='stairs_down') {
      // Prefer the entrance with the longest unobstructed approach.
      let angle=0,best=-1;
      for(const [dx,dz,a] of [[0,1,0],[1,0,Math.PI/2],[0,-1,Math.PI],[-1,0,-Math.PI/2]]) {
        let score=0;for(let i=1;i<=3;i++){if(!this.walkable(t.x+dx*i,t.y+dz*i))break;score++;}
        if(score>best){best=score;angle=a;}
      }
      this.stairs.push({x:(t.x+.5)*CELL,z:(t.y+.5)*CELL,cellX:t.x,cellZ:t.y,angle,sign:t.type==='stairs_up'?1:-1});
    }
  }
  walkable(x,z) {const t=this.tiles.get(cellKey(x,z));return !!t&&!solid.has(t.type)&&!['door','bars','tree'].includes(t.type);}
  at(x,z) {return this.tiles.get(cellKey(Math.floor(x/CELL),Math.floor(z/CELL)));}
  stairAt(x,z) {return this.stairs.find(s=>Math.abs(x-s.x)<=1.501&&Math.abs(z-s.z)<=1.501);}
  support(x,z) {const s=this.stairAt(x,z);return s?stairHeight(s,x,z):0;}
  obstacles(x,z,r) {
    const boxes=[];
    for(let tz=Math.floor((z-r)/CELL)-1;tz<=Math.floor((z+r)/CELL)+1;tz++)for(let tx=Math.floor((x-r)/CELL)-1;tx<=Math.floor((x+r)/CELL)+1;tx++) {
      const t=this.tiles.get(cellKey(tx,tz)),cx=(tx+.5)*CELL,cz=(tz+.5)*CELL;
      if(!t||solid.has(t.type))boxes.push({x:cx,z:cz,hx:1.5,hz:1.5});
      else if(t.type==='tree')boxes.push({x:cx,z:cz,hx:.28,hz:.28});
      else if(['fountain','altar','sink','throne','grave'].includes(t.type)) {
        const size={fountain:[.76,.76],altar:[.8,.55],sink:[.68,.5],throne:[.78,.8],grave:[.48,.28]}[t.type];
        boxes.push({x:cx,z:cz,hx:size[0],hz:size[1]});
      }
      else if(t.type==='door'||t.type==='door_open'||t.type==='bars') {
        const rotate=!(solid.has(this.tiles.get(cellKey(tx-1,tz))?.type)||solid.has(this.tiles.get(cellKey(tx+1,tz))?.type));
        const add=(a,b,ha,hb)=>boxes.push({x:cx+(rotate?b:a),z:cz+(rotate?a:b),hx:rotate?hb:ha,hz:rotate?ha:hb});
        if(t.type!=='door_open')add(0,0,1.5,.13);
        for(const side of [-1,1])add(side*1.3,0,.2,.32);
      }
      if(t?.object?.name==='boulder')boxes.push({x:cx,z:cz,hx:.65,hz:.65});
    }
    return boxes;
  }
  clear(body,x,z,actors=[]) {
    const r=body.radius??RADIUS;
    for(const b of this.obstacles(x,z,r)) {
      const dx=x-clamp(x,b.x-b.hx,b.x+b.hx),dz=z-clamp(z,b.z-b.hz,b.z+b.hz);
      if(dx*dx+dz*dz<r*r-1e-8)return false;
    }
    for(const s of this.stairs) {
      if(Math.abs(x-s.x)>2||Math.abs(z-s.z)>2)continue;
      const p=stairLocal(s,x,z);
      // Outer masonry and the divider physically separate the two elevations.
      for(const b of stairWalls) {
        const dx=p.x-clamp(p.x,b.x-b.hx,b.x+b.hx),dz=p.z-clamp(p.z,b.z-b.hz,b.z+b.hz);
        if(dx*dx+dz*dz<r*r-1e-8)return false;
      }
    }
    const height=this.support(x,z);
    if(height===null||Math.abs(height-(body.y||0))>.26)return false;
    for(const a of actors)if(a!==body&&a.id!==body.id&&Math.abs((a.y||0)-height)<1.6&&Math.hypot(a.x-x,a.z-z)<r+(a.radius??.3))return false;
    return true;
  }
  move(body,dx,dz,actors=[]) {
    const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.06));
    for(let i=0;i<count;i++) {
      const sx=dx/count,sz=dz/count;
      if(this.clear(body,body.x+sx,body.z+sz,actors)){body.x+=sx;body.z+=sz;}
      else {
        if(this.clear(body,body.x+sx,body.z,actors))body.x+=sx;
        if(this.clear(body,body.x,body.z+sz,actors))body.z+=sz;
      }
      body.y=this.support(body.x,body.z)??body.y??0;
    }
    return body;
  }
  lineClear(a,b,r=.2) {
    const distance=Math.hypot(b.x-a.x,b.z-a.z),count=Math.ceil(distance/.15);
    for(let i=0;i<=count;i++) {
      const x=a.x+(b.x-a.x)*i/Math.max(1,count),z=a.z+(b.z-a.z)*i/Math.max(1,count);
      for(const box of this.obstacles(x,z,r))if(Math.abs(x-box.x)<box.hx+r&&Math.abs(z-box.z)<box.hz+r)return false;
      for(const s of this.stairs)if(Math.abs(x-s.x)<2&&Math.abs(z-s.z)<2){const p=stairLocal(s,x,z);for(const b of stairWalls)if(Math.abs(p.x-b.x)<b.hx+r&&Math.abs(p.z-b.z)<b.hz+r)return false;}
    }
    return true;
  }
  spawn(x,z) {
    const body={id:'player',x:(x+.5)*CELL,z:(z+.5)*CELL,y:0,radius:RADIUS};
    const stair=this.stairAt(body.x,body.z);
    if(stair){Object.assign(body,stairWorld(stair,-.72,1.88));body.y=this.support(body.x,body.z);}
    if(!this.clear(body,body.x,body.z)){
      search:for(let r=.3;r<1.5;r+=.2)for(let i=0;i<16;i++){
        const px=body.x+Math.sin(i*Math.PI/8)*r,pz=body.z+Math.cos(i*Math.PI/8)*r;
        if(this.clear(body,px,pz)){body.x=px;body.z=pz;body.y=this.support(px,pz);break search;}
      }
    }
    return body;
  }
}

export function integratePlayer(world,body,input,dt,actors=[]) {
  let f=clamp(input.forward||0,-1,1),s=clamp(input.strafe||0,-1,1);
  const magnitude=Math.hypot(f,s);if(magnitude>1){f/=magnitude;s/=magnitude;}
  const speed=input.crouch?1.55:input.run?5.15:3.1,yaw=input.yaw||0;
  return world.move(body,(-Math.sin(yaw)*f+Math.cos(yaw)*s)*speed*dt,(-Math.cos(yaw)*f-Math.sin(yaw)*s)*speed*dt,actors);
}

// Greedy rectangles retain the authored floor plan without one mesh per map cell.
export function mergeSurfaces(tiles,predicate) {
  const remaining=new Set(tiles.filter(predicate).map(t=>cellKey(t.x,t.y))),out=[];
  for(const t of tiles) {
    if(!remaining.has(cellKey(t.x,t.y)))continue;
    let w=1,h=1;while(remaining.has(cellKey(t.x+w,t.y)))w++;
    outer:while(true){for(let x=0;x<w;x++)if(!remaining.has(cellKey(t.x+x,t.y+h)))break outer;h++;}
    for(let z=0;z<h;z++)for(let x=0;x<w;x++)remaining.delete(cellKey(t.x+x,t.y+z));
    out.push({x:t.x*CELL,z:t.y*CELL,w:w*CELL,h:h*CELL});
  }
  return out;
}
