/* Offline rendering: the model in model.js produces exactly ../data.js's values.
   No external requests, fonts, wallet connection or local storage. */
'use strict';
const $=id=>document.getElementById(id),D=globalThis.ATLAS;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>n===null||n===undefined?'Not recorded':'$'+(Math.abs(n)>=1e9?(n/1e9).toFixed(2)+'B':Math.abs(n)>=1e6?(n/1e6).toFixed(1)+'M':Math.abs(n)>=1e3?(n/1e3).toFixed(0)+'K':n.toFixed(0));
const pct=n=>n===null?'—':(n>0?'+':'')+n.toFixed(1)+'%';
const labels={pre:'No token recorded',recorded:'Token recorded',verify:'Verify product / parent'};
let state='pre',sort='implied_value_usd',direction=-1,page=0,selected=null,filtered=[];
const pageSize=9;
if(!D){document.body.textContent='Dataset missing. Run main.ts and open output/dashboard/index.html, not the source template.';throw Error('No sealed dataset');}
$('date').textContent=D.as_of;$('total').textContent=D.rows.length;
$('pre-count').textContent=D.rows.filter(r=>r.token_status!=='recorded').length;
const watchCount=D.rows.filter(r=>r.watchlist).length;
$('coverage').textContent=watchCount+' / '+watchCount;
$('peer-count').textContent=D.calibration.peer_count;
$('source').textContent=D.source;
$('calibration').textContent='This snapshot: global median '+D.calibration.global.toFixed(3)+'× across '+D.calibration.peer_count+' independent token peers; growth winsorization '+D.calibration.growth_low.toFixed(2)+'% to +'+D.calibration.growth_high.toFixed(2)+'%. No parameters are tuned against a future outcome.';
for(const key of ['category','chain']){
  const values=[...new Set(D.rows.flatMap(r=>key==='chain'?r.chains:[r.category||'Unclassified']))].sort();
  for(const v of values){const o=document.createElement('option');o.value=v;o.textContent=v;$(key).append(o);}
}
function update(resetPage=true){
  if(resetPage)page=0;
  const query=$('search').value.toLowerCase().trim(),cat=$('category').value,chain=$('chain').value;
  filtered=D.rows.filter(r=>(state==='all'||r.token_status===state)&&(!query||(r.name+' '+r.slug).toLowerCase().includes(query))&&(!cat||(r.category||'Unclassified')===cat)&&(!chain||r.chains.includes(chain))&&(!$('watch').checked||r.watchlist)&&(!$('early').checked||r.early));
  filtered.sort((a,b)=>{
    let x=sort==='confidence'?a.model.confidence:a[sort],y=sort==='confidence'?b.model.confidence:b[sort];
    // Missing numeric observations remain at the end in either direction.
    if(x===null&&y!==null)return 1;if(y===null&&x!==null)return -1;
    const cmp=typeof x==='string'?x.localeCompare(y,'en'):(x??0)-(y??0);
    return direction*cmp||a.rank-b.rank;
  });
  page=Math.min(page,Math.max(0,Math.ceil(filtered.length/pageSize)-1));
  if(!filtered.some(r=>r.slug===selected))selected=filtered[0]?.slug??null;
  $('count').textContent=filtered.length+' protocols · '+(state==='pre'?'pre-token research':state==='recorded'?'existing-token context':state==='verify'?'verification queue':'all scenarios');
  const shown=filtered.slice(page*pageSize,(page+1)*pageSize);
  $('rows').innerHTML=shown.map(r=>`<tr class="${r.slug===selected?'selected':''}" data-slug="${esc(r.slug)}"><td>${r.rank.toString().padStart(2,'0')}</td><td><button data-detail="${esc(r.slug)}" aria-label="Open ${esc(r.name)} research dossier">${esc(r.name)}</button><small>${r.watchlist?'◆ ':r.early?'↗ ':''}${esc(r.category||'Unclassified')} · ${esc(r.chains[0]||'No chain')}</small></td><td>${money(r.tvl_usd)}</td><td class="${(r.change_7d??0)>=0?'positive':'negative'}">${pct(r.change_7d)}</td><td class="value">${money(r.implied_value_usd)}<small>${money(r.model.low)} – ${money(r.model.high)}</small></td><td><span class="badge ${r.model.confidence==='Low'?'low':''}">${r.model.confidence}</span></td></tr>`).join('');
  $('empty').hidden=filtered.length>0;
  $('page-info').textContent=filtered.length?`${page*pageSize+1}–${Math.min((page+1)*pageSize,filtered.length)} of ${filtered.length} · global value rank shown`:'0 results';
  $('prev').disabled=page===0;$('next').disabled=(page+1)*pageSize>=filtered.length;
  detail();chart();
}
function chart(){
  const rows=filtered.filter(r=>r.token_status!=='recorded'),maxX=Math.max(8,...rows.map(r=>Math.log10(r.tvl_usd))),maxY=Math.max(8,...rows.map(r=>Math.log10(r.implied_value_usd)));
  $('scatter').innerHTML=[25,60,95].map(y=>`<path d="M10 ${y}H840" stroke="#d5ddd2" stroke-dasharray="3 5"/>`).join('')+rows.map(r=>{
    const x=15+(Math.log10(r.tvl_usd)-6)/(maxX-6)*815,y=111-(Math.log10(r.implied_value_usd)-4)/(maxY-4)*100;
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.slug===selected?5:r.watchlist?3:2}" fill="${r.token_status==='verify'?'#b8572f':'#087c72'}" opacity="${r.slug===selected?1:.5}"><title>${esc(r.name)} · ${money(r.implied_value_usd)}</title></circle>`;
  }).join('')+`<text x="13" y="13" fill="#60716f" font-size="9" font-family="Consolas,monospace">${rows.length} RESEARCH SCENARIOS · NOT LAUNCH PROBABILITIES</text>`;
}
function detail(){
  const r=D.rows.find(r=>r.slug===selected);
  if(!r){$('detail').innerHTML='<p class="eyebrow">RESEARCH DOSSIER</p><h2>No matching protocol</h2><p class="meta">Change a filter or reset the board to continue exploring.</p>';return;}
  const m=r.model,f=r.farm;
  $('detail').innerHTML=`<p class="eyebrow">PROTOCOL DOSSIER / ${String(r.rank).padStart(3,'0')}</p><span class="state">${labels[r.token_status]}</span><h2>${esc(r.name)}</h2><div class="meta">${esc(r.category||'Unclassified')} · ${esc(r.chains.slice(0,3).join(' / ')||'No chain recorded')}${r.chains.length>3?' +'+(r.chains.length-3):''}${r.watchlist?'<br>◆ Authoritative watchlist member':''}</div><div class="detail-value"><small>CONDITIONAL IMPLIED MARKET CAP</small><strong>${money(r.implied_value_usd)}</strong><p>${money(m.low)} – ${money(m.high)} · sensitivity range</p>${r.token_status==='recorded'?`<p class="observed">Observed market cap: ${r.mcap_usd>0?money(r.mcap_usd):'not usable / missing'}<br>Existing token context, not a launch candidate.</p>`:''}</div><div class="detail-grid"><div><small>FROZEN TVL</small><b>${money(r.tvl_usd)}</b></div><div><small>TVL / 7 DAYS</small><b>${pct(r.change_7d)}</b></div><div><small>TRACKED AGE / PROXY</small><b>${m.days===null?'Unknown':m.days+' days'}</b></div><div><small>MODEL EVIDENCE</small><b>${m.confidence} · ${m.peer_n} peers</b></div></div><details id="value-audit"><summary>Inspect valuation & missing-data flags</summary><p>TVL ${money(r.tvl_usd)} × ${m.multiple.toFixed(3)}× peer multiple × ${m.growth.toFixed(3)} growth × ${m.maturity.toFixed(3)} listing proxy.</p><p>Category median ${m.peer_median.toFixed(3)}×; category weight ${(100*m.shrinkage).toFixed(0)}%; remainder global median. Clipped growth: ${pct(m.growth_pct)}. Age is DefiLlama tracking history, not protocol age or verified time without a token.</p><ul>${(m.flags.length?m.flags:['No missing age/growth fields; structural uncertainty remains.']).map(x=>'<li>'+esc(x)+'</li>').join('')}</ul></details><h3>${f.route==='Research first'?'Research before capital':'A small, reversible experiment'}</h3><div class="plan-label">ESTIMATES · ${esc(f.capital)} capital · ${esc(f.gas)} gas<br>${esc(f.time)} · NOT PROTOCOL-VERIFIED REQUIREMENTS</div><ol class="plan">${f.steps.map(x=>'<li>'+esc(x)+'</li>').join('')}</ol><p class="warning">No eligibility, launch date or reward is known from this snapshot. “No token recorded” is not proof that no token exists. Verify every action; doing nothing costs $0.</p>`;
}
$('rows').addEventListener('click',event=>{const b=event.target.closest('[data-detail]');if(b){selected=b.dataset.detail;update(false);}});
for(const id of ['search','category','chain','watch','early'])$(id).addEventListener(id==='search'?'input':'change',()=>update());
document.querySelectorAll('[data-state]').forEach(b=>b.addEventListener('click',()=>{state=b.dataset.state;document.querySelectorAll('[data-state]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));update();}));
document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{direction=sort===b.dataset.sort?-direction:(b.dataset.sort==='name'?1:-1);sort=b.dataset.sort;document.querySelectorAll('th').forEach(t=>t.removeAttribute('aria-sort'));b.closest('th').setAttribute('aria-sort',direction===1?'ascending':'descending');update();}));
$('reset').addEventListener('click',()=>{for(const id of ['search','category','chain'])$(id).value='';$('watch').checked=$('early').checked=false;update();});
$('prev').addEventListener('click',()=>{page--;update(false);});$('next').addEventListener('click',()=>{page++;update(false);});
update();
