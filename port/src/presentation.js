// Continuous view-model poses. All attacks return exactly to the resting pose.
const rest=[.44,-.43,-1,0,.1,-.14];
const slash=[
  [0,rest],[.12,[.56,-.31,-.92,-.35,-.35,-.65]],
  [.27,[-.34,-.35,-.83,-.9,.35,1.52]],
  [.36,[-.39,-.56,-.95,-.65,.45,1.85]],[.54,rest],
];
const thrust=[
  [0,rest],[.13,[.51,-.42,-.86,-.7,.12,-.18]],
  [.25,[.15,-.31,-1.55,-1.15,.05,-.08]],[.34,[.16,-.33,-1.5,-1.1,.05,-.08]],[.54,rest],
];
export function swingPose(seconds,weapon='sword'){
  const frames=/spear|lance|dagger|knife|bare hands/.test(weapon)?thrust:slash;
  if(seconds<=0||seconds>=.54)return [...rest];
  const i=frames.findIndex(f=>f[0]>=seconds),a=frames[i-1],b=frames[i];
  let t=(seconds-a[0])/(b[0]-a[0]);t=t*t*(3-2*t);
  return a[1].map((v,j)=>v+(b[1][j]-v)*t);
}
