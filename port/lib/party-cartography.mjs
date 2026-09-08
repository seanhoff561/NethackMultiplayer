import {CELL,canonical} from '../src/spatial.js';

const opaque=new Set(['wall','stone','unknown','door','bars','tree']);
const glyphs={floor:'.',corridor:'#',stone:' ',unknown:' ',door:'+',door_open:"'",stairs_up:'<',stairs_down:'>',water:'}',lava:'}',air:'.',ice:'.',fountain:'{',altar:'_',sink:'#',throne:'\\',grave:'|',tree:'T',bars:'#',trap:'^'};
const key=(x,y)=>`${x},${y}`;

// Trace through map cells, including the first blocking cell itself. Movement
// collision cannot do this: a wall's centre is necessarily inside an obstacle.
export function visibleMapTiles(tiles,body,radius=15){
  const grid=new Map(tiles.map(t=>[key(t.x,t.y),t])),sx=body.x/CELL,sy=body.z/CELL,ox=Math.floor(sx),oy=Math.floor(sy);
  const blocks=(x,y)=>{const tile=grid.get(key(x,y));return !tile||opaque.has(canonical(tile.type));};
  return tiles.filter(tile=>{
    if(Math.hypot((tile.x+.5)*CELL-body.x,(tile.y+.5)*CELL-body.z)>radius)return false;
    let x=ox,y=oy;const dx=tile.x+.5-sx,dy=tile.y+.5-sy,stepX=Math.sign(dx),stepY=Math.sign(dy),deltaX=dx?1/Math.abs(dx):Infinity,deltaY=dy?1/Math.abs(dy):Infinity;
    let edgeX=dx?((stepX>0?x+1-sx:sx-x)/Math.abs(dx)):Infinity,edgeY=dy?((stepY>0?y+1-sy:sy-y)/Math.abs(dy)):Infinity;
    for(let i=0;i<100;i++){
      if(x===tile.x&&y===tile.y)return true;
      if((x!==ox||y!==oy)&&blocks(x,y))return false;
      if(Math.abs(edgeX-edgeY)<1e-9){if(blocks(x+stepX,y)&&blocks(x,y+stepY))return false;x+=stepX;y+=stepY;edgeX+=deltaX;edgeY+=deltaY;}
      else if(edgeX<edgeY){x+=stepX;edgeX+=deltaX;}else{y+=stepY;edgeY+=deltaY;}
    }
    return false;
  });
}

export function rememberMapTiles(player,depth,visible,tiles){
  player.cartography??={};const memory=player.cartography[depth]??={revision:0,tiles:{}};
  const grid=new Map(tiles.map(t=>[key(t.x,t.y),t]));
  for(const tile of visible){
    const type=canonical(tile.type),at=key(tile.x,tile.y);
    // Never copy generator glyphs: they can contain unseen cells, creatures or
    // the generator's own hero, and do not track cooperative terrain changes.
    const wall=(x,y)=>['wall','stone'].includes(canonical(grid.get(key(x,y))?.type));
    const char=type==='wall'?(wall(tile.x-1,tile.y)||wall(tile.x+1,tile.y)?'-':'|'):(glyphs[type]||'.');
    const remembered={x:tile.x,y:tile.y,type,char,seen:true,explored:true};
    if(memory.tiles[at]?.type!==type||memory.tiles[at]?.char!==char){memory.tiles[at]=remembered;memory.revision++;}
    player.seen.add(`${depth}:${at}`);
  }
  return memory;
}
