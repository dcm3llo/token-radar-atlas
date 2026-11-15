// Node 22.18+ • offline, stdlib only. No clock, randomness, or external service.
import {readFileSync,writeFileSync,mkdirSync,cpSync,statSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseSnapshot,model} from './lib/model.ts';
import {buildDossier} from './vendor/makefun-board.ts';
const root=fileURLToPath(new URL('.',import.meta.url));
function option(name:string,fallback:string){
  const args=process.argv.slice(2),at=args.indexOf('--'+name),eq=args.find(a=>a.startsWith('--'+name+'='));
  if(at>=0){if(!args[at+1]||args[at+1].startsWith('--'))throw Error('Missing --'+name+' value');return args[at+1];}
  return eq?eq.slice(name.length+3):fallback;
}
const input=option('input','/input/snapshot.json');
const path=statSync(input).isDirectory()?join(input,'snapshot.json'):input;
const out=resolve(option('output',process.env.MAKEFUN_OUTPUT_DIR||'/output'));
if(out===resolve(root))throw Error('Output cannot overwrite source repository');
const snapshot=parseSnapshot(readFileSync(path,'utf8')),data=model.build(snapshot);
mkdirSync(out,{recursive:true});
writeFileSync(join(out,'board.json'),JSON.stringify({model_version:'atlas-1',as_of:snapshot.as_of,rows:data.rows})+'\n');
writeFileSync(join(out,'data.js'),'globalThis.ATLAS='+JSON.stringify(data).replace(/</g,'\\u003c')+';\n');
cpSync(join(root,'dashboard'),join(out,'dashboard'),{recursive:true});
// Preview is explicitly development-only; final runs always require real captures.
if(process.argv.includes('--preview')&&!existsSync(join(root,'screenshots','1-board.png'))){
  console.log('Preview generated; dossier intentionally absent until real screenshots exist.');
}else{
  cpSync(join(root,'screenshots'),join(out,'screenshots'),{recursive:true});
  writeFileSync(join(out,'dossier.json'),buildDossier(out,{text_max_bytes:65536}));
}
console.log(JSON.stringify({rows:data.rows.length,watchlist:snapshot.watchlist.length,peers:data.calibration.peer_count,output:out}));
