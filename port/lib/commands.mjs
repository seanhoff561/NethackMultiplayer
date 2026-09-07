// NetHack: Descent modification, 2026-09-07. Distributed under dat/license.
import { readFileSync } from 'node:fs';
const categories = {
  Combat: ['fight','fire','throw','cast','zap','wield','swap','quiver','twoweapon','enhance','monster','turn'],
  Equipment: ['inventory','inventtype','wear','takeoff','takeoffall','puton','remove','seeall','seeamulet','seearmor','seerings','seetools','seeweapon','showspells','adjust'],
  Interaction: ['apply','open','close','kick','pickup','drop','droptype','loot','untrap','force','dip','rub','invoke','tip','pay','chat','ride','jump','sit'],
  Survival: ['eat','quaff','read','pray','offer','engrave','wipe','search','wait','up','down'],
};
export function readCommands(sourcePath) {
  const source = readFileSync(sourcePath, 'utf8').split('struct ext_func_tab extcmdlist[] = {')[1]?.split('/* movement commands')[0] || '';
  const commands = [];
  for (const match of source.matchAll(/\{\s*((?:[CM]\('[^']*'\))|(?:'(?:\\.|[^'])*')|[A-Z_]+)\s*,\s*"([^"\n]+)"\s*,\s*((?:"[^"\n]*"\s*)+),([\s\S]*?)\}/g)) {
    const [,binding,name,strings,flags] = match;
    if (/WIZMODECMD|NOFUZZERCMD[\s\S]*CMD_NOT_AVAILABLE/.test(flags) || /^(wiz|debug)|^(shell|suspend|panic|#|\?)$/.test(name)) continue;
    let key = null;
    if (binding.startsWith("C(")) key = String.fromCharCode(binding.charCodeAt(3) & 31);
    else if (binding.startsWith("M(")) key = String.fromCharCode(binding.charCodeAt(3) | 128);
    else if (binding.startsWith("'")) {
      const body = binding.slice(1,-1);
      key = body === '\\0' ? null : body === '\\\\' ? '\\' : body === '\\177' ? '\x7f' : body;
    }
    const symbols = {GOLD_SYM:'$',SPBOOK_SYM:'+',AMULET_SYM:'"',ARMOR_SYM:'[',RING_SYM:'=',TOOL_SYM:'(',WEAPON_SYM:')'};
    key ||= symbols[binding] || null;
    const description = [...strings.matchAll(/"([^"\n]*)"/g)].map(m=>m[1]).join('');
    const category = Object.entries(categories).find(([,names])=>names.includes(name))?.[0] || 'Journal & system';
    commands.push({name,label:name,description,key:key || `#${name}`,category});
  }
  return commands;
}

export function directionKey(dx,dy) {
  return ({'-1,-1':'y','0,-1':'k','1,-1':'u','-1,0':'h','0,0':'.','1,0':'l','-1,1':'b','0,1':'j','1,1':'n'})[`${Math.sign(dx)},${Math.sign(dy)}`] || '.';
}

export function headingDirection(yaw) {
  const eighth = Math.round(yaw / (Math.PI / 4));
  const directions = [[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1]];
  return directions[((eighth%8)+8)%8];
}
