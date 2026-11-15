// Dev only: install Playwright OUTSIDE this repository. Runtime needs no packages.
// ATLAS_PLAYWRIGHT must name its installed package directory.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdirSync,writeFileSync,statSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT||'playwright');
const out=resolve(process.argv[2]||'../preview'),shots=resolve('screenshots');
mkdirSync(shots,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.ATLAS_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const p=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[],external=[];let assertions=0;
p.on('pageerror',e=>errors.push(e.message));
p.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
await p.goto(pathToFileURL(join(out,'dashboard/index.html')).href);await p.waitForSelector('#rows tr');
assert.equal(await p.locator('#total').textContent(),'758');assertions++;
assert.equal(await p.locator('#coverage').textContent(),'40 / 40');assertions++;
const names=await p.locator('#rows [data-detail]').allTextContents();
assert.equal(names.length,9);assertions++;
assert.ok((await p.locator('#count').textContent()).startsWith('193 '));assertions++;
// Capture the overview without a fabricated screenshot layout.
const visibleRows=await p.locator('#rows tr').evaluateAll(trs=>trs.filter(t=>t.getBoundingClientRect().bottom<=innerHeight).length);
assert.ok(visibleRows>=3,'Overview must show multiple real ranked rows');assertions++;
await p.screenshot({path:join(shots,'1-board.png')});
await p.getByRole('button',{name:'IMPLIED MCAP'}).click();
assert.ok(await p.locator('th[aria-sort="ascending"]').count());assertions++;
const ascendingValues=await p.locator('#rows tr').evaluateAll(trs=>trs.map(t=>globalThis.ATLAS.rows.find(r=>r.slug===t.dataset.slug).implied_value_usd));
assert.ok(ascendingValues.every((x,i)=>i===0||x>=ascendingValues[i-1]));assertions++;
await p.getByRole('button',{name:'IMPLIED MCAP'}).click();
await p.locator('#search').fill('curvance');
assert.equal(await p.locator('#rows tr').count(),1);assertions++;
await p.locator('[data-detail="curvance"]').focus();await p.keyboard.press('Enter');
assert.equal(await p.locator('#detail h2').textContent(),'Curvance');assertions++;
await p.locator('#value-audit summary').click();
assert.ok(await p.locator('#value-audit').getAttribute('open')!==null);assertions++;
await p.locator('#reset').click();
// Keep real ranked context at left while exposing the complete action plan at right.
await p.locator('#reset').click();
await p.locator('#search').fill('curvance');
await p.evaluate(()=>{window.scrollTo(0,document.querySelector('.workspace').offsetTop-20);document.querySelector('#detail').scrollTop=0;});
const planBottom=await p.locator('.plan').evaluate(el=>el.getBoundingClientRect().bottom);
assert.ok(planBottom<=900,'Complete concrete plan must fit in detail capture');assertions++;
await p.screenshot({path:join(shots,'2-detail.png')});
await p.locator('#reset').click();
await p.locator('#watch').check();await p.locator('#category').selectOption('Risk Curators');
const categoryCount=await p.locator('#count').textContent();
assert.ok(parseInt(categoryCount)>0&&parseInt(categoryCount)<40);assertions++;
const slugs=await p.locator('#rows tr').evaluateAll(trs=>trs.map(t=>t.dataset.slug));
assert.equal(await p.evaluate(slugs=>slugs.every(slug=>globalThis.ATLAS.rows.some(r=>r.slug===slug&&r.watchlist&&r.category==='Risk Curators')),slugs),true);assertions++;
const matches=await p.evaluate(()=>globalThis.ATLAS.rows.filter(r=>r.watchlist&&r.category==='Risk Curators'&&r.token_status==='pre').length);
assert.equal(parseInt(categoryCount),matches);assertions++;
await p.screenshot({path:join(shots,'3-filtered.png')});
await p.locator('#chain').selectOption('Solana');await p.locator('#search').fill('zzzz-impossible');
assert.equal(await p.locator('#rows tr').count(),0);assertions++;
assert.equal(await p.locator('#empty').isVisible(),true);assertions++;
assert.equal(await p.locator('#detail h2').textContent(),'No matching protocol');assertions++;
await p.locator('#reset').click();await p.locator('[data-state="recorded"]').click();
assert.ok((await p.locator('#count').textContent()).startsWith('416 '));assertions++;
assert.ok((await p.locator('#detail').textContent()).includes('Existing token context'));assertions++;
await p.locator('[data-state="verify"]').click();assert.ok((await p.locator('#count').textContent()).startsWith('149 '));assertions++;
await p.locator('[data-state="all"]').click();assert.ok((await p.locator('#count').textContent()).startsWith('758 '));assertions++;
await p.locator('#early').check();
const earlyCount=await p.evaluate(()=>globalThis.ATLAS.rows.filter(r=>r.early).length);
assert.equal(parseInt(await p.locator('#count').textContent()),earlyCount);assertions++;
await p.locator('#reset').click();await p.locator('#next').click();assert.ok((await p.locator('#page-info').textContent()).startsWith('10–18'));assertions++;
await p.locator('#prev').click();assert.ok((await p.locator('#page-info').textContent()).startsWith('1–9'));assertions++;
// Displayed estimates must equal the shared model, not a screenshot-only mock.
assert.equal(await p.evaluate(()=>{const r=globalThis.ATLAS.rows[0],m=globalThis.AtlasModel.estimate(r,globalThis.ATLAS.as_of,globalThis.ATLAS.calibration);return m.value===r.implied_value_usd;}),true);assertions++;
// Exercise every detail renderer against actual rows, including missing data.
const detailFailures=await p.evaluate(()=>{
  const failed=[];
  for(const r of globalThis.ATLAS.rows){
    selected=r.slug;detail();
    if(document.querySelector('#detail h2').textContent!==r.name||document.querySelectorAll('#detail .plan li').length!==r.farm_steps.length||!document.querySelector('#detail .detail-value strong').textContent.startsWith('$'))failed.push(r.slug);
  }
  return failed;
});
assert.deepEqual(detailFailures,[]);assertions++;
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assertions++;
await p.setViewportSize({width:390,height:844});
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assertions++;
assert.deepEqual(errors,[]);assertions++;assert.deepEqual(external,[]);assertions++;
const images=['1-board.png','2-detail.png','3-filtered.png'].map(name=>({name,bytes:statSync(join(shots,name)).size}));
for(const image of images)assert.ok(image.bytes<=350*1024);
await browser.close();
const result={browser:'Installed Chrome / Playwright',viewport:[1440,900],assertions,errors,external_requests:external,screenshots:images,filtered_watchlist_curators:matches,mobile_overflow:false};
if(process.env.ATLAS_BROWSER_REPORT)writeFileSync(process.env.ATLAS_BROWSER_REPORT,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
