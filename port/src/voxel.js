// Closed, unit-sized voxel volumes with only exterior faces. Lighting remains PBR.
export function voxelVolume(resolution=6){
  const positions=[],normals=[],uvs=[],n=resolution,step=1/n;
  const filled=(x,y,z)=>x>=0&&y>=0&&z>=0&&x<n&&y<n&&z<n&&[(x+.5)/n-.5,(y+.5)/n-.5,(z+.5)/n-.5].reduce((s,v)=>s+v*v,0)<.25;
  const faces=[[[1,0,0],[0,0,-1],[0,1,0]],[[-1,0,0],[0,0,1],[0,1,0]],[[0,1,0],[1,0,0],[0,0,-1]],[[0,-1,0],[1,0,0],[0,0,1]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[-1,0,0],[0,1,0]]];
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
  for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++){
    if(!filled(x,y,z))continue;
    const center=[(x+.5)/n-.5,(y+.5)/n-.5,(z+.5)/n-.5];
    for(const [normal,u,v] of faces){
      if(filled(x+normal[0],y+normal[1],z+normal[2]))continue;
      for(const index of [0,1,2,0,2,3]){
        const [a,b]=corners[index];
        for(let axis=0;axis<3;axis++)positions.push(center[axis]+(normal[axis]+u[axis]*a+v[axis]*b)*step/2);
        normals.push(...normal);uvs.push((a+1)/2,(b+1)/2);
      }
    }
  }
  return {positions,normals,uvs};
}

export function branchStyle(name=''){
  const label=name.toLowerCase();
  if(/mine/.test(label))return {id:'mines',theme:4,wall:0x938777,floor:0x80736d,fog:0x141018};
  if(/sokoban/.test(label))return {id:'sokoban',theme:5,wall:0x8a8c9c,floor:0x728d91,fog:0x0d1521};
  if(/gehennom|hell|vlad|sanctum/.test(label))return {id:'infernal',theme:6,wall:0x73545f,floor:0x675160,fog:0x1c0b15};
  if(/plane|astral/.test(label))return {id:'astral',theme:7,wall:0xa4a1b4,floor:0x8c8d9c,fog:0x15172b};
  if(/quest|fort|castle|ludios/.test(label))return {id:'fortress',theme:8,wall:0x787a98,floor:0x6c6d84,fog:0x0e101e};
  return {id:'dungeon',theme:null,wall:0x8b8d9f,floor:0x8a8998,fog:0x0b0d18};
}
export function dressingPlan(tiles,branch=''){
  const style=branchStyle(branch);
  const hash=(x,y,seed=0)=>{let n=Math.imul(x+173,374761393)^Math.imul(y+97,668265263)^Math.imul(seed+11,1274126177);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  const grid=new Map(tiles.map(t=>[`${t.x},${t.y}`,t])),visited=new Set(),themes=new Map(),result=[];
  const directions=[[0,-1,0],[1,0,-Math.PI/2],[0,1,Math.PI],[-1,0,Math.PI/2]];
  const ordered=[...tiles].sort((a,b)=>a.y-b.y||a.x-b.x);
  for(const t of ordered){
    const key=`${t.x},${t.y}`;if(t.type!=='floor'||visited.has(key))continue;
    const theme=Math.floor(hash(t.x,t.y,129)*4),queue=[t];visited.add(key);
    for(let i=0;i<queue.length;i++){
      const p=queue[i];themes.set(`${p.x},${p.y}`,theme);
      for(const [dx,dy] of directions){const k=`${p.x+dx},${p.y+dy}`,next=grid.get(k);if(next?.type==='floor'&&!visited.has(k)){visited.add(k);queue.push(next);}}
    }
  }
  for(const t of ordered){
    if(!['floor','corridor'].includes(t.type)||t.object||t.trap)continue;
    if(directions.some(([dx,dy])=>/stairs|door/.test(grid.get(`${t.x+dx},${t.y+dy}`)?.type||'')))continue;
    const walls=directions.filter(([dx,dy])=>['wall','stone'].includes(grid.get(`${t.x+dx},${t.y+dy}`)?.type));
    if(!walls.length){
      // Low floor scatter and overhead details in open rooms, never in a
      // puzzle lane, doorway or stair approach. Blue-noise-like spacing.
      if(style.id==='sokoban'||t.type!=='floor'||hash(t.x,t.y,137)<.92)continue;
      if(directions.some(([dx,dy])=>grid.get(`${t.x+dx},${t.y+dy}`)?.type!=='floor'))continue;
      if(result.some(p=>Math.hypot(p.cellX-t.x,p.cellY-t.y)<2.8))continue;
      result.push({x:(t.x+.5)*3+(hash(t.x,t.y,138)-.5)*1.1,z:(t.y+.5)*3+(hash(t.x,t.y,139)-.5)*1.1,angle:hash(t.x,t.y,140)*6.28,theme:style.theme??themes.get(`${t.x},${t.y}`)??0,variant:Math.floor(hash(t.x,t.y,141)*3),phase:hash(t.x,t.y,142)*6.28,cellX:t.x,cellY:t.y,interior:true});continue;
    }
    if(hash(t.x,t.y,31)>.68||hash(t.x,t.y,121)<.57)continue;
    if(result.some(p=>Math.hypot(p.cellX-t.x,p.cellY-t.y)<2.2))continue;
    const [dx,dy,angle]=walls[Math.floor(hash(t.x,t.y,124)*walls.length)];
    result.push({x:(t.x+.5)*3+dx*1.48,z:(t.y+.5)*3+dy*1.48,angle,theme:style.theme??themes.get(`${t.x},${t.y}`)??2,variant:Math.floor(hash(t.x,t.y,122)*3),phase:hash(t.x,t.y,123)*Math.PI*2,cellX:t.x,cellY:t.y});
  }
  return result;
}
