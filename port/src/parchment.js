// A field sketch records the explored native glyphs, never hidden geometry.
export function mapRecord(snapshot,elapsed=0){
  const p=snapshot?.player||{},personal=snapshot?.multiplayer?snapshot.cartography:null;
  return {level:p.dungeon||'The dungeon',depth:p.depth||1,turn:snapshot?.turn||0,levelId:snapshot?.levelId,ownerId:personal?.ownerId,ownerName:personal?.ownerName,width:snapshot?.width||80,height:snapshot?.height||21,
    time:`${Math.floor(elapsed/3600)}:${String(Math.floor(elapsed/60)%60).padStart(2,'0')}:${String(Math.floor(elapsed)%60).padStart(2,'0')}`,
    player:{x:Math.floor(p.x||0),y:Math.floor(p.y||0)},
    tiles:(personal?.tiles||snapshot?.tiles||[]).filter(t=>t.seen===true||t.explored===true).map(t=>({x:t.x,y:t.y,char:t.char||' '}))};
}
export function mapBounds(record){
  const width=record.width||80,height=record.height||21;
  if(!record.ownerId)return {x:0,y:0,width,height};
  const points=[...record.tiles,record.player],xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const columns=Math.min(width,Math.max(24,maxX-minX+5)),rows=Math.min(height,Math.max(12,maxY-minY+5));
  return {x:Math.max(0,Math.min(width-columns,Math.floor((minX+maxX+1-columns)/2))),y:Math.max(0,Math.min(height-rows,Math.floor((minY+maxY+1-rows)/2))),width:columns,height:rows};
}
export function drawParchment(canvas,record){
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  c.fillStyle='#bda77b';c.fillRect(0,0,w,h);
  const shade=c.createRadialGradient(w*.5,h*.48,100,w*.5,h*.5,w*.65);
  shade.addColorStop(0,'#e1cc9b');shade.addColorStop(.7,'#c5ac7d');shade.addColorStop(1,'#705438');c.fillStyle=shade;c.fillRect(0,0,w,h);
  for(let i=0;i<9500;i++){const x=(i*7919)%w,y=(i*3571)%h;c.fillStyle=i%2?'#4f361c09':'#fff6ca0c';c.fillRect(x,y,1+i%3,1);}
  c.strokeStyle='#76583b55';c.lineWidth=2;c.strokeRect(27,25,w-54,h-50);
  c.fillStyle='#392d25';c.font='italic 36px Georgia';c.fillText(`${record.level} · depth ${record.depth}`,55,73);
  c.font='21px Georgia';c.fillText(`${record.ownerName?`${record.ownerName}'s map  ·  `:''}Surveyed ${record.time}  ·  turn ${record.turn}`,57,110);
  c.beginPath();c.moveTo(55,129);c.lineTo(w-55,131);c.stroke();
  const bounds=mapBounds(record),columns=bounds.width,rows=bounds.height,cell=Math.min((w-110)/columns,(h-215)/rows),ox=(w-columns*cell)/2-bounds.x*cell,oy=155-bounds.y*cell;
  c.lineWidth=1.5;c.strokeStyle='#45372bd0';c.font=`${cell*.95}px Georgia`;c.textAlign='center';c.textBaseline='middle';
  for(const t of record.tiles){
    const x=ox+(t.x+.5)*cell,y=oy+(t.y+.5)*cell,ch=t.char;
    const jitter=((t.x*17+t.y*7)%5-2)*.22;
    if(ch===' '||!ch)continue;
    if(ch==='.'||ch==='#'){c.fillStyle=ch==='#'?'#6d513733':'#7b5b2920';c.fillRect(x-cell*.46,y-cell*.46,cell*.92,cell*.92);}
    c.fillStyle=ch==='<'||ch==='>'?'#73392c':'#473729';
    if(ch==='|'||ch==='-'){c.beginPath();if(ch==='|'){c.moveTo(x+jitter,y-cell*.5);c.lineTo(x-jitter,y+cell*.5);}else{c.moveTo(x-cell*.5,y+jitter);c.lineTo(x+cell*.5,y-jitter);}c.stroke();}
    else if(ch==='.') {c.beginPath();c.arc(x+jitter,y,1,0,Math.PI*2);c.fill();}
    else c.fillText(ch,x+jitter,y);
  }
  const px=ox+(record.player.x+.5)*cell,py=oy+(record.player.y+.5)*cell;
  c.strokeStyle='#823a30';c.lineWidth=2;c.beginPath();c.arc(px,py,cell*.72,0,Math.PI*2);c.stroke();c.fillStyle='#70291e';c.fillText('@',px,py);
  c.textAlign='left';c.font='italic 19px Georgia';c.fillStyle='#58422e';c.fillText('A recollection of places seen.  < ascent   > descent   + door   # passage',57,h-38);
  // Soft folds follow the sheet rather than floating in screen space.
  for(const x of [w*.33,w*.67]){const g=c.createLinearGradient(x-10,0,x+10,0);g.addColorStop(0,'#59402200');g.addColorStop(.45,'#59402222');g.addColorStop(.55,'#fff7ce22');g.addColorStop(1,'#fff7ce00');c.fillStyle=g;c.fillRect(x-10,22,20,h-44);}
}
