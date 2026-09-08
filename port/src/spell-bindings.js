export const SPELL_LETTERS='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function spellName(item){return String(item.text||item.name||'').split(/\t|\s{2,}|\s+\d+\s/)[0].trim();}
export function spellDetails(item){const parts=String(item.text||'').slice(spellName(item).length).trim().split(/\s+/);return parts.length>=4?`Level ${parts[0]} · ${parts[1]} · Failure ${parts[2]} · Memory ${parts[3]}`:parts.join(' ');}
export function spellChoices(items=[]){return items.filter(i=>i.selectable!==false&&Number(i.id)>0&&/^[a-z]$/i.test(i.key||''));}
// Allocate custom choices before native defaults so learning another spell can
// never silently steal a binding. IDs still go to NetHack unchanged.
export function bindSpellChoices(items,bindings={}){
  const choices=spellChoices(items),used=new Set(),assigned=new Map();
  for(const i of choices){const key=bindings[spellName(i)];if(SPELL_LETTERS.includes(key)&&key?.length===1&&!used.has(key)){assigned.set(i.id,key);used.add(key);}}
  for(const i of choices)if(!assigned.has(i.id)){const key=!used.has(i.key)?i.key:[...SPELL_LETTERS].find(k=>!used.has(k));assigned.set(i.id,key);used.add(key);}
  return items.map(i=>assigned.has(i.id)?{...i,nativeKey:i.key,key:assigned.get(i.id)}:i);
}
export function rebindSpell(items,bindings,name,key){
  if(key?.length!==1||!SPELL_LETTERS.includes(key))return {...bindings};
  const current=spellChoices(bindSpellChoices(items,bindings)),old=current.find(i=>spellName(i)===name);
  if(!old)return {...bindings};
  const next={...bindings};
  // Include stored spells from other runs so bindings remain unique globally.
  for(const [other,bound] of Object.entries(next))if(other!==name&&bound===key)delete next[other];
  const conflict=current.find(i=>i.key===key&&spellName(i)!==name);
  if(conflict)next[spellName(conflict)]=old.key;
  next[name]=key;return next;
}
