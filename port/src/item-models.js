// Visible appearance, rather than hidden magical identity, chooses the model.
export function itemProfile(name='',symbol='',data={}){
  const label=name.toLowerCase(),appearance=data.appearance||label;
  let seed=2166136261;for(const c of `${symbol}:${appearance}`)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
  const family=({'!':'potion','?':'scroll','+':'book',')':'weapon','/':'wand','[':'armor','(':'tool','%':'food','*':'gem','$':'gold','=':'ring','"':'amulet','`':/statue/.test(label)?'statue':'boulder','0':'ball','_':'chain','.':'venom'})[symbol]||'tool';
  const slot=data.armorSlot??(/shield/.test(label)?1:/helm|hat|cap/.test(label)?2:/glove|gauntlet/.test(label)?3:/boot|shoe/.test(label)?4:/cloak|robe/.test(label)?5:/shirt/.test(label)?6:0);
  return {family,slot,seed,key:`${family}:${appearance}`,variant:(seed%997)/997,label};
}

export function detailedItem(r,g,profile,color){
  const {family,slot,label,variant:v}=profile;
  const metal=r.material(0x73798a,.5,.67),cloth=r.material(color??0x665c76,0,.94),leather=r.material(0x65514f,0,.95),bone=r.material(0xc1b7a2,0,.95);
  const box=(m,p,s,rot)=>r.mesh(g,'box',m,p,s,rot),round=(m,p,s)=>r.mesh(g,'sphere',m,p,s);
  g.userData.modelKey=profile.key;g.userData.family=family;
  if(family==='armor'){
    if(slot===1){const shield=r.mesh(g,'cylinder',metal,[0,.13,0],[.68,.1,.78],[Math.PI/2,0,0]);shield.rotation.x=0;round(metal,[0,.2,0],[.19,.11,.19]);box(leather,[0,.192,0],[.045,.012,.6]);}
    else if(slot===2){round(metal,[0,.24,0],[.45,.4,.47]);box(metal,[0,.21,.23],[.07,.32,.055]);for(const side of [-1,1])box(metal,[side*.19,.14,.06],[.065,.24,.32]);}
    else if(slot===4)for(const side of [-1,1]){box(leather,[side*.18,.24,-.12],[.2,.45,.23]);round(leather,[side*.18,.1,.1],[.23,.18,.44]);box(metal,[side*.18,.36,.011],[.15,.045,.022]);}
    else if(slot===3)for(const side of [-1,1]){box(leather,[side*.19,.08,0],[.2,.12,.24]);for(let i=0;i<4;i++)box(leather,[side*.19+(i-1.5)*.047,.07,.2],[.04,.09,.17-(i%3)*.02]);box(leather,[side*.32,.07,.02],[.08,.1,.14],[0,side*.45,0]);}
    else if(slot===5||slot===6){for(let i=0;i<7;i++)box(cloth,[(i-3)*.1,.045+(i%2)*.008,0],[.105,.035,.72-Math.abs(i-3)*.055]);if(slot===5)round(cloth,[0,.11,-.32],[.25,.17,.26]);else for(const side of [-1,1])box(cloth,[side*.4,.05,-.2],[.25,.05,.22],[0,side*.3,0]);}
    else {round(metal,[0,.19,0],[.58,.33,.68]);for(const side of [-1,1])round(metal,[side*.34,.17,-.21],[.26,.21,.3]);for(let i=0;i<4;i++)box(metal,[0,.3-i*.025,.1+i*.09],[.5-i*.045,.07,.12]);}
    return true;
  }
  if(family==='tool'){
    if(/chest|large box|ice box/.test(label)){r._chest(g);return true;}
    if(/pick-axe|grappling|unicorn horn/.test(label)){const w=new g.constructor();g.add(w);w.rotation.x=Math.PI/2;w.position.y=.1;r._weapon(w,label);w.scale.setScalar(.6);return true;}
    if(/key|lock pick|opener/.test(label)){r.mesh(g,'torus',metal,[0,.045,-.18],[.2,.2,.12],[Math.PI/2,0,0]);box(metal,[0,.045,.08],[.045,.035,.38]);for(let i=0;i<2;i++)box(metal,[.04,.045,.18+i*.07],[.1,.035,.028]);}
    else if(/lantern|lamp/.test(label)){round(metal,[0,.16,0],[.38,.28,.32]);if(/lantern/.test(label)){box(bone,[0,.36,0],[.19,.24,.19]);for(const side of [-1,1])box(metal,[side*.13,.35,0],[.035,.33,.23]);r.mesh(g,'torus',metal,[0,.65,0],[.24,.25,.14]);}else{r.mesh(g,'cone',metal,[.24,.23,0],[.15,.4,.15],[0,0,-1.2]);r.mesh(g,'torus',metal,[-.22,.21,0],[.24,.26,.12]);}}
    else if(/candelabrum|candle/.test(label)){const n=/candelabrum/.test(label)?7:1;for(let i=0;i<n;i++){const x=(i-(n-1)/2)*.1;box(bone,[x,.22,0],[.055,.4,.055]);box(leather,[x,.43,0],[.012,.03,.012]);}}
    else if(/mirror|looking glass/.test(label)){round(metal,[0,.045,-.07],[.34,.035,.4]);box(leather,[0,.04,.28],[.09,.06,.28]);}
    else if(/camera/.test(label)){box(leather,[0,.17,0],[.42,.31,.23]);r.mesh(g,'cylinder',metal,[0,.17,.15],[.2,.11,.2],[Math.PI/2,0,0]);}
    else if(/ball|orb/.test(label)){round(r.material(0x949db2,.3,.22),[0,.24,0],[.42,.42,.42]);box(metal,[0,.035,0],[.32,.05,.32]);}
    else if(/card|blindfold|towel/.test(label)){box(cloth,[0,.04,0],[.4,.035,/towel/.test(label)?.65:.23]);box(bone,[0,.062,.025],[.26,.008,.03]);}
    else if(/leash|stethoscope/.test(label)){r.mesh(g,'torus',leather,[0,.04,0],[.52,.52,.13],[Math.PI/2,0,0]);box(metal,[.22,.06,.1],[.08,.04,.14]);}
    else if(/saddle/.test(label)){round(leather,[0,.18,0],[.57,.28,.65]);for(const side of [-1,1])box(leather,[side*.22,.1,0],[.22,.06,.5],[0,0,side*.5]);}
    else if(/kit|grease|tin/.test(label)){box(metal,[0,.15,0],[.4,.29,.3]);box(bone,[0,.303,0],[.19,.01,.11]);}
    else if(/figurine/.test(label)){round(cloth,[0,.24,0],[.2,.31,.18]);round(cloth,[0,.47,0],[.15,.15,.16]);box(cloth,[0,.035,0],[.31,.07,.27]);}
    else if(/flute|whistle|marker/.test(label)){r.mesh(g,'cylinder',/marker/.test(label)?cloth:bone,[0,.055,0],[.075,.5,.075],[Math.PI/2,0,0]);for(let i=0;i<4;i++)box(leather,[0,.096,(i-1.5)*.08],[.022,.008,.022]);}
    else if(/horn|bugle/.test(label)){for(let i=0;i<5;i++)r.mesh(g,'cylinder',bone,[Math.sin(i*.22)*.22,.07+i*.04,(i-2)*.1],[.065+i*.038,.12,.065+i*.038],[Math.PI/2-.18*i,0,0]);}
    else if(/harp/.test(label)){for(const x of [-.22,.22])box(leather,[x,.28,0],[.06,.55,.07]);box(leather,[0,.5,0],[.48,.06,.07],[0,0,.12]);for(let i=0;i<7;i++)box(bone,[(i-3)*.05,.28,0],[.008,.42,.008]);}
    else if(/bell|drum/.test(label)){r.mesh(g,'cylinder',/drum/.test(label)?leather:metal,[0,.17,0],[.4,.31,.4]);round(bone,[0,.335,0],[.36,.014,.36]);}
    else if(/mine|trap/.test(label)){r.mesh(g,'torus',metal,[0,.05,0],[.58,.58,.12],[Math.PI/2,0,0]);for(let i=0;i<8;i++)r.mesh(g,'cone',metal,[Math.sin(i)*.22,.1,Math.cos(i)*.22],[.055,.16,.055]);}
    else {round(cloth,[0,.21,0],[.4,.4,.35]);r.mesh(g,'torus',leather,[0,.36,0],[.25,.25,.12],[Math.PI/2,0,0]);}
    return true;
  }
  if(family==='food'){
    if(/corpse/.test(label))return false;
    if(/ration|wafer|candy/.test(label)){box(cloth,[0,.12,0],[.42,.22,.55]);box(leather,[0,.237,0],[.055,.015,.56]);box(bone,[0,.247,0],[.17,.008,.14]);}
    else if(/tin/.test(label)){r.mesh(g,'cylinder',metal,[0,.14,0],[.28,.27,.28]);r.mesh(g,'torus',metal,[0,.283,0],[.12,.12,.08],[Math.PI/2,0,0]);}
    else if(/pie|pancake|cookie/.test(label)){r.mesh(g,'cylinder',bone,[0,.065,0],[.4,.12,.4]);for(let i=0;i<4;i++)box(leather,[(i-1.5)*.08,.129,0],[.025,.005,.28]);}
    else if(/carrot|banana|stick/.test(label)){for(let i=0;i<4;i++)round(cloth,[(i-1.5)*.09,.07+Math.sin(i)*.03,0],[.14,.12,.13]);}
    else if(/leaf|frond|sprig/.test(label)){for(let i=0;i<6;i++)box(cloth,[(i%2?.07:-.07),.027,i*.065-.15],[.17,.015,.08],[0,i%2?.3:-.3,0]);}
    else {round(cloth,[0,.16,0],[.3+v*.07,/egg/.test(label)?.39:.29,.3]);if(/apple|pear|orange/.test(label))box(leather,[0,.33,0],[.024,.07,.024]);}
    return true;
  }
  if(family==='ball'){round(metal,[0,.25,0],[.48,.48,.48]);return true;}
  if(family==='chain'){for(let i=0;i<9;i++)r.mesh(g,'torus',metal,[(i-4)*.08,.06,Math.sin(i)*.04],[.12,.14,.1],[i%2*Math.PI/2,0,0]);return true;}
  if(family==='venom'){round(cloth,[0,.02,0],[.43,.035,.36]);return true;}
  return false;
}
