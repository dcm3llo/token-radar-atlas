import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {model,parseSnapshot} from '../lib/model.ts';
const fixture={slug:'test',name:'Fixture',category:'Lending',chains:['Base'],tvl_usd:10000000,change_7d:3,mcap_usd:null,listed_at:'2025-11-14',gecko_id:null,symbol:null};
const s={as_of:'2026-11-14',source:'test fixture',floor_usd:50000000,protocols:[fixture],watchlist:['test']};
test('parser rejects malformed input and duplicated slugs',()=>{
  assert.throws(()=>parseSnapshot('{}'));
  assert.throws(()=>parseSnapshot(JSON.stringify({...s,protocols:[fixture,fixture]})));
  assert.throws(()=>parseSnapshot(JSON.stringify({...s,watchlist:['invented']})));
});
test('age is deterministic UTC tracking proxy, not wall clock',()=>{
  assert.equal(model.age('2026-11-14','2025-11-14'),365);
  assert.equal(model.age('2026-11-14',null),null);
  assert.equal(model.age('2026-11-14','2027-01-01'),0);
});
test('token marker is conservative, including missing/zero/negative cap',()=>{
  assert.equal(model.token(fixture),false);
  for(const patch of [{symbol:'EXISTING'},{mcap_usd:0},{mcap_usd:-1},{gecko_id:'recorded'}])assert.equal(model.token({...fixture,...patch}),true);
});
test('peer ratios deduplicate token identities and shrink sparse categories',()=>{
  const cal=model.calibrate([fixture,{...fixture,slug:'a',symbol:'A',mcap_usd:20000000},{...fixture,slug:'a2',symbol:'A',mcap_usd:20000000,tvl_usd:5000000},{...fixture,slug:'b',symbol:'B',category:'Dexs',mcap_usd:10000000}]);
  assert.equal(cal.peer_count,2);assert.equal(cal.global,1.5);assert.equal(cal.categories.Lending.n,1);
  assert.ok(cal.categories.Lending.multiple>1.5&&cal.categories.Lending.multiple<2);
});
test('missing observations use explicit fallbacks with wider uncertainty',()=>{
  const cal=model.calibrate([fixture]);
  const a=model.estimate(fixture,s.as_of,cal),b=model.estimate({...fixture,change_7d:null,listed_at:null},s.as_of,cal);
  assert.equal(b.growth,1);assert.equal(b.days,null);assert.equal(b.confidence,'Low');assert.ok(b.flags.length>=3);assert.ok(b.high/b.value>a.high/a.value);
});
test('growth cannot dominate arbitrarily; valuation has integer bounds',()=>{
  const cal=model.calibrate([fixture,{...fixture,change_7d:-20},{...fixture,change_7d:40}]);
  const a=model.estimate({...fixture,change_7d:1e10},s.as_of,cal),b=model.estimate({...fixture,change_7d:-1e10},s.as_of,cal);
  assert.ok(a.growth<=1.35&&b.growth>=.825);assert.ok(Number.isSafeInteger(a.value)&&a.value>0);assert.ok(a.flags.includes('Growth winsorized'));
});
test('no impossible retail deposit advice for infrastructure / regulated access',()=>{
  for(const category of ['Chain','CEX','RWA','Risk Curators','Insurance','Payments','Uncollateralized Lending']){
    const p=model.plan({...fixture,category});assert.equal(p.capital,'$0');assert.equal(p.route,'Research first');
    assert.ok(p.steps.every((x:string)=>x.length>=20&&x.length<=600));
    assert.ok(!/https?:/.test(p.steps.join(' ')));
  }
});
test('farming plans use chain-aware costs and avoid leverage or invented assets',()=>{
  const lending=model.plan(fixture),dex=model.plan({...fixture,category:'Dexs',chains:['Ethereum']});
  assert.equal(lending.gas,'$0.05–5');assert.equal(dex.gas,'$2–25');
  assert.ok(lending.steps.join(' ').includes('Do not borrow or loop'));
  assert.equal(model.plan({...fixture,category:'Derivatives'}).capital,'$0');
});
test('status preserves watchlist but isolates unverified product-like records',()=>{
  assert.equal(model.status({...fixture,category:'Bridge'},false),'verify');
  assert.equal(model.status({...fixture,category:'Bridge'},true),'pre');
  assert.equal(model.status({...fixture,symbol:'T'},true),'recorded');
});
if(process.env.ATLAS_SNAPSHOT){
  const snapshot=parseSnapshot(readFileSync(process.env.ATLAS_SNAPSHOT,'utf8'));
  test('real sealed input: full universe, watchlist coverage, ranks, plans, exact reproducibility',()=>{
    const a=model.build(snapshot),b=model.build(snapshot);assert.deepEqual(a,b);
    assert.equal(a.rows.length,snapshot.protocols.length);assert.equal(new Set(a.rows.map((r:any)=>r.slug)).size,a.rows.length);
    for(const slug of snapshot.watchlist)assert.ok(a.rows.some((r:any)=>r.slug===slug&&r.watchlist));
    a.rows.forEach((r:any,i:number)=>{assert.equal(r.rank,i+1);assert.ok(r.implied_value_usd>0&&Number.isSafeInteger(r.implied_value_usd));if(i)assert.ok(a.rows[i-1].implied_value_usd>=r.implied_value_usd);assert.ok(r.farm_steps.length>=3&&r.farm_steps.length<=12);r.farm_steps.forEach((x:string)=>assert.ok(x.length>=20&&x.length<=600));});
    assert.ok(a.rows.some((r:any)=>r.early));assert.ok(a.rows.some((r:any)=>r.token_status==='recorded'));
    console.log(JSON.stringify({rows:a.rows.length,watchlist:snapshot.watchlist.length,peers:a.calibration.peer_count,statuses:Object.fromEntries(['pre','recorded','verify'].map(t=>[t,a.rows.filter((r:any)=>r.token_status===t).length]))}));
  });
}
