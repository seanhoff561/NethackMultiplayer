import { spawn } from 'node:child_process';
import { mkdir, cp } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
const root = dirname(fileURLToPath(import.meta.url));
const session = resolve(root, 'test-session-' + Date.now());
await mkdir(session, { recursive: true });
await cp(resolve(root, 'data'), session, { recursive: true });
const proc = spawn(resolve(root, 'bin/nethack-engine.exe'), ['-u','Smoke','-p','Valkyrie','-r','human','-g','female','-a','neutral'], {cwd:session, windowsHide:true});
let commands = 0, snapshots = 0, menus = 0, firstTurn, lastTurn;
const timeout = setTimeout(()=>{console.error('Timed out');proc.kill();process.exitCode=1;},15000);
proc.stderr.on('data',data=>process.stderr.write(data));
proc.on('exit',(code)=>{clearTimeout(timeout);console.log('exit',code,{snapshots,menus,commands,firstTurn,lastTurn});});
readline.createInterface({input:proc.stdout}).on('line',line=>{
 let event; try {event=JSON.parse(line);} catch {console.log('RAW',line);return;}
 if(event.type==='snapshot') {
  console.log("STATE",event.turn,event.player.x,event.player.y,event.messages.slice(-2)); snapshots++; firstTurn ??= event.turn; lastTurn=event.turn;
  if(snapshots===1) console.log('SNAPSHOT',JSON.stringify({player:event.player,tiles:event.tiles.length,inventory:event.inventory,messages:event.messages}));
 } else if(event.type==='request') {
  console.log('REQUEST',event.kind,event.prompt.slice(0,180),event.items?.slice(0,3));
  if(event.kind==='command') {
   commands++;
   if(commands===1) proc.stdin.write('k 46\n');
   else if(commands===2) proc.stdin.write('k 105\n');
   else if(commands===3) proc.stdin.write('k 115\n');
   else if(commands===4) proc.stdin.write('k 35\n');
   else if(commands===5) proc.stdin.write('k 83\n');
   else {proc.kill();}
  } else if(event.kind==='extcmd') proc.stdin.write('x inventory\n');
  else if(event.kind==='menu') {menus++;proc.stdin.write('m \n');}
  else if(event.kind==='yn') proc.stdin.write('k '+(event.prompt.toLowerCase().includes('save')?121:event.default||110)+'\n');
  else proc.stdin.write('k 32\n');
 } else console.log('EVENT',event.type,event.text||event.reason||event.commands?.length);
});

