// Generous aim assist uses the creature's body size, without expanding its
// walking collision shape. One swing always chooses one native monster ID.
export function meleeTarget(player,actors,yaw,world){
  if(!player)return null;
  const forward={x:-Math.sin(yaw),z:-Math.cos(yaw)};
  return [...actors].map(actor=>{
    const dx=actor.x-player.x,dz=actor.z-player.z,distance=Math.hypot(dx,dz),radius=Math.max(.35,actor.radius||.35);
    const along=dx*forward.x+dz*forward.z,side=Math.abs(dx*forward.z-dz*forward.x);
    return {actor,distance,radius,along,side,angle:Math.atan2(side,Math.max(.001,along))};
  }).filter(t=>t.actor.data?.hp!==0&&t.distance<=2.25+t.radius&&Math.abs((t.actor.y||0)-(player.y||0))<1.8&&t.along>0&&t.side<=t.radius+.6+t.along*.65&&world.lineClear(player,t.actor,.04))
    .sort((a,b)=>(a.angle*.8+Math.max(0,a.distance-a.radius)*.3)-(b.angle*.8+Math.max(0,b.distance-b.radius)*.3)||a.actor.id-b.actor.id)[0]?.actor.id??null;
}
