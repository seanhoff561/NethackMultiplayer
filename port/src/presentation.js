// Continuous view-model poses. All attacks return exactly to the resting pose.
const rest=[.48,-.75,-1.2,-.08,-.12,-.2];
const slash=[
  [0,rest],[.13,[.35,-.28,-1.05,.42,-.2,-.19]],
  [.28,[.07,-.8,-1.36,-1.52,.15,.16]],
  [.36,[-.12,-.96,-1.3,-1.9,.22,.28]],[.54,rest],
];
const thrust=[
  [0,rest],[.13,[.51,-.7,-1,-.7,.12,-.18]],
  [.25,[.15,-.62,-1.8,-1.25,.05,-.08]],[.34,[.16,-.65,-1.7,-1.2,.05,-.08]],[.54,rest],
];
export function swingPose(seconds,weapon='sword'){
  const frames=/spear|lance|dagger|knife|bare hands/.test(weapon)?thrust:slash;
  if(seconds<=0||seconds>=.54)return [...rest];
  const i=frames.findIndex(f=>f[0]>=seconds),a=frames[i-1],b=frames[i];
  let t=(seconds-a[0])/(b[0]-a[0]);t=t*t*(3-2*t);
  return a[1].map((v,j)=>v+(b[1][j]-v)*t);
}
