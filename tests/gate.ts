// Local structural proxy for the seven published output constraints; NOT a judge.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync,statSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {inflateSync} from 'node:zlib';
import {buildDossier} from '../vendor/makefun-board.ts';
const out=resolve(process.argv[2]||'../out-a'),snapshot=JSON.parse(readFileSync(process.argv[3]||'../token-radar-01-kit/input/snapshot.json','utf8'));
const result:any={local_proxy:true,not_server_grade:true,checks:{}};
function check(name:string,fn:()=>any){const details=fn();result.checks[name]={pass:true,...details};}
function walk(path:string,rel=''):any[]{return readdirSync(path).flatMap(name=>{assert.ok(!name.startsWith('.'));const file=join(path,name),s=lstatSync(file);assert.ok(!s.isSymbolicLink());return s.isDirectory()?walk(file,rel+name+'/'):[{path:rel+name,size:s.size,full:file,regular:s.isFile()}];});}
check('dashboard_files',()=>{
  const files=walk(join(out,'dashboard')),size=files.reduce((a,f)=>a+f.size,0);
  assert.ok(files.length<=400&&size<=4194304&&size<65536);
  for(const f of files){assert.ok(f.regular&&/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(f.path.split('/').at(-1)));const text=readFileSync(f.full,'utf8');
    if(/\.html$/.test(f.path)){
      assert.ok(!/\b[\w-]+\s*=\s*["'][^"']*https?:\/\//i.test(text),'external HTML attribute');
      for(const m of text.matchAll(/<(style|script)\b[^>]*>([\s\S]*?)<\/\1>/gi))assert.ok(!/https?:\/\//i.test(m[2]));
    }
    if(/\.css$/.test(f.path))assert.ok(!/https?:\/\//i.test(text),'external CSS');
    if(/\.js$/.test(f.path))assert.ok(!/(?:import\s*(?:\(|[^;]*?from\s*)|require\s*\(|export\s+[^;]*?from\s*)["']https?:\/\//i.test(text),'external JS import');
  }
  assert.ok(files.some(f=>f.path==='index.html')&&files.some(f=>f.path.endsWith('.css'))&&files.some(f=>f.path.endsWith('.js')));
  return {files:files.length,source_bytes:size};
});
const boardPath=join(out,'board.json'),board=JSON.parse(readFileSync(boardPath,'utf8')).rows;
check('board_file',()=>{
  assert.ok(statSync(boardPath).size<=8388608&&board.length>=100&&board.length<=4000);
  const known=new Set(snapshot.protocols.map((p:any)=>p.slug)),seen=new Set();
  for(const r of board){assert.ok(known.has(r.slug)&&!seen.has(r.slug)&&/^[^\s]{1,128}$/.test(r.slug));seen.add(r.slug);assert.ok(typeof r.name==='string'&&r.name.trim());assert.ok(Number.isSafeInteger(r.rank)&&r.rank>0);assert.ok(Number.isSafeInteger(r.implied_value_usd)&&r.implied_value_usd>0&&r.implied_value_usd<=100000000000000);assert.ok(Array.isArray(r.farm_steps));}
  assert.ok(new Set(board.map((r:any)=>r.implied_value_usd)).size>1);
  return {rows:board.length,bytes:statSync(boardPath).size};
});
check('sorted_by_value',()=>{const rows=[...board].sort((a,b)=>a.rank-b.rank);rows.forEach((r,i)=>{assert.equal(r.rank,i+1);if(i)assert.ok(rows[i-1].implied_value_usd>=r.implied_value_usd);});return {contiguous:true};});
check('coverage',()=>{const slugs=new Set(board.map((r:any)=>r.slug));assert.ok(snapshot.watchlist.every((s:string)=>slugs.has(s)));return {covered:snapshot.watchlist.length,required:snapshot.watchlist.length};});
check('farm_steps',()=>{for(const r of board){assert.ok(r.farm_steps.length>=3&&r.farm_steps.length<=12);for(const s of r.farm_steps)assert.ok(typeof s==='string'&&s.trim().length>=20&&s.trim().length<=600);}return {rows:board.length};});
function crc32(b:Buffer){let c=0xffffffff;for(const byte of b){c^=byte;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return (c^0xffffffff)>>>0;}
check('screenshots',()=>{
  const files=walk(join(out,'screenshots'));assert.ok(files.length>=3&&files.length<=4);
  const images=files.map(f=>{
    assert.ok(f.regular&&f.size<=350*1024&&/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(f.path));
    const b=readFileSync(f.full);assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    let pos=8,w=0,h=0,bpp=0,ended=false;const compressed=[];
    while(pos<b.length){const n=b.readUInt32BE(pos),type=b.toString('ascii',pos+4,pos+8),data=b.subarray(pos+8,pos+8+n);assert.equal(crc32(b.subarray(pos+4,pos+8+n)),b.readUInt32BE(pos+8+n));
      if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);assert.equal(data[8],8);bpp=data[9]===6?4:data[9]===2?3:0;assert.ok(bpp);}
      if(type==='IDAT')compressed.push(data);if(type==='IEND'){ended=true;assert.equal(n,0);}pos+=n+12;
    }
    assert.ok(ended&&pos===b.length);assert.equal(inflateSync(Buffer.concat(compressed)).length,h*(1+w*bpp));
    assert.ok(Math.max(w,h)<=1440&&Math.min(w,h)>=800);return {name:f.path,bytes:f.size,width:w,height:h};
  });return {images};
});
check('dossier_matches',()=>{
  const actual=readFileSync(join(out,'dossier.json')),rebuilt=Buffer.from(buildDossier(out,{text_max_bytes:65536}));assert.ok(actual.equals(rebuilt));assert.ok(actual.length<=1572864);
  const text=JSON.parse(actual.toString()).text;assert.ok(!text.includes('[Cut at'));
  return {bytes:actual.length,byte_equal:true,source_truncated:false};
});
assert.equal(Object.keys(result.checks).length,7);
if(process.env.ATLAS_GATE_REPORT)writeFileSync(process.env.ATLAS_GATE_REPORT,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
