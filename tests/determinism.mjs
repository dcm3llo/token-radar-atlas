// Execute the real entry twice with different output-path mechanisms; compare every byte.
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const input=resolve(process.argv[2]||'../token-radar-01-kit/input/snapshot.json');
const a=resolve(process.argv[3]||'../out-a'),b=resolve(process.argv[4]||'../out-b');
console.log(execFileSync(process.execPath,['main.ts','--input',input,'--output',a],{encoding:'utf8'}).trim());
console.log(execFileSync(process.execPath,['main.ts','--input='+input],{encoding:'utf8',env:{...process.env,MAKEFUN_OUTPUT_DIR:b}}).trim());
function files(dir,rel=''){return readdirSync(dir).flatMap(name=>statSync(join(dir,name)).isDirectory()?files(join(dir,name),rel+name+'/'):[rel+name]).sort();}
const names=files(a);assert.deepEqual(names,files(b));
const outputs=names.map(name=>{
  const x=readFileSync(join(a,name)),y=readFileSync(join(b,name));assert.ok(x.equals(y),name+' differs');
  return {path:name,bytes:x.length,sha256:createHash('sha256').update(x).digest('hex')};
});
const result={runtime:process.version,byte_equal:true,files:outputs.length,outputs};
if(process.env.ATLAS_DETERMINISM_REPORT)writeFileSync(process.env.ATLAS_DETERMINISM_REPORT,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
