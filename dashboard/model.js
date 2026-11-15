/* Signal Atlas • shared model, executed unchanged by Node and the offline page.
   All estimates are conditional market-cap scenarios, never FDV or launch odds.
   TVL is not revenue; listing age is not project age or a tokenless lifetime. */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const median=a=>quantile(a,0.5);
function quantile(a,q){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*q,l=Math.floor(i);return s[l]+(s[Math.ceil(i)]-s[l])*(i-l);}
const token=p=>p.gecko_id!==null||p.symbol!==null||p.mcap_usd!==null;
function age(asof,listed){if(!listed)return null;const n=(Date.parse(asof+'T00:00:00Z')-Date.parse(listed+'T00:00:00Z'))/86400000;return Number.isFinite(n)?Math.max(0,Math.floor(n)):null;}
function calibrate(protocols){
  // One representative per recorded token; highest TVL prevents multi-version caps
  // from counting repeatedly. Ratio is circulating market cap, not diluted value.
  const unique=new Map();
  for(const p of protocols){
    if(!(p.mcap_usd>0&&p.tvl_usd>0)||p.category==='CEX')continue;
    const key=p.gecko_id||p.symbol||p.slug,old=unique.get(key);
    if(!old||p.tvl_usd>old.tvl_usd||(p.tvl_usd===old.tvl_usd&&p.slug<old.slug))unique.set(key,p);
  }
  const peers=[...unique.values()].map(p=>({slug:p.slug,category:p.category,ratio:clamp(p.mcap_usd/p.tvl_usd,.02,20)}));
  const global=median(peers.map(p=>p.ratio))??.25,categories={};
  for(const cat of new Set(protocols.map(p=>p.category||'Unclassified'))){
    const sample=peers.filter(p=>(p.category||'Unclassified')===cat).map(p=>p.ratio),n=sample.length,w=n/(n+6),m=median(sample)??global;
    const multiple=Math.exp(w*Math.log(m)+(1-w)*Math.log(global));
    const spread=sample.length>=4?Math.max(2.5,(quantile(sample,.75)||multiple)/(quantile(sample,.25)||multiple)):4;
    categories[cat]={n,median:m,weight:w,multiple,spread:clamp(spread,2.5,8)};
  }
  const growth=protocols.map(p=>p.change_7d).filter(Number.isFinite);
  return {peer_count:peers.length,global,peers,categories,growth_low:clamp(quantile(growth,.1)??-50,-50,0),growth_high:clamp(quantile(growth,.9)??100,0,100)};
}
function estimate(p,asof,cal){
  const c=cal.categories[p.category||'Unclassified'],days=age(asof,p.listed_at),g=clamp(p.change_7d??0,cal.growth_low,cal.growth_high);
  const growth=1+.35*g/100,maturity=.8+.2*Math.min(days??365,1095)/1095;
  const value=Math.max(1,Math.min(100000000000000,Math.round(p.tvl_usd*c.multiple*growth*maturity)));
  const flags=[];
  if(p.change_7d===null)flags.push('7d change missing; neutral growth');
  if(days===null)flags.push('Listing date missing; 365-day proxy');
  if(c.n<4)flags.push('Sparse category peers; global shrinkage');
  if(p.mcap_usd!==null&&p.mcap_usd<=0)flags.push('Non-positive reported market cap excluded');
  if(p.change_7d!==null&&g!==p.change_7d)flags.push('Growth winsorized');
  if(!p.chains.length)flags.push('No chain recorded');
  const factor=Math.min(12,c.spread*(days===null?1.2:1)*(p.change_7d===null?1.15:1));
  const confidence=c.n>=8&&days!==null&&p.change_7d!==null?'Moderate':'Low';
  return {value,low:Math.max(1,Math.round(value/factor)),high:Math.min(100000000000000,Math.round(value*factor)),days,growth_pct:g,growth,maturity,multiple:c.multiple,peer_n:c.n,peer_median:c.median,shrinkage:c.weight,confidence,flags};
}
function status(p,watch){
  if(token(p))return 'recorded';
  if(watch)return 'pre';
  // No parent field is available. These are caution flags, not invented parent links.
  if(/bridge|staking|restaked|cex|wrapper/i.test(p.category||'')||/\b(wrapped|staked|staking)\b/i.test(p.name)||/\s(v\d+(\.\d+)?|\d+\.\d+)$/i.test(p.name))return 'verify';
  return 'pre';
}
function plan(p){
  const c=(p.category||'').toLowerCase(),chain=p.chains.includes('Base')?'Base':p.chains.includes('Arbitrum')?'Arbitrum':p.chains[0]||'unrecorded chain';
  const fee=chain==='Ethereum'?'$2–25':chain==='Bitcoin'?'$1–15':'$0.05–5';
  let action,capital='$0',duration='20–40 min research';
  if(/cex|rwa|chain|payment|card|ai|risk curator|governance|launchpad|token locker|insurance|uncollateralized|collateral markets|reserve|dor|otc/i.test(c)){
    action=`Research-only route for ${p.category||'unclassified infrastructure'}: inspect ${p.name}'s own documentation for a public access path, legal restrictions, minimum size and current incentives. Do not assume a retail vault, deposit or a token claim exists. Capital estimate $0; 20–40 min.`;
  }else if(/dex|liquidity manager/.test(c)){
    capital='$10–25';duration='10–20 min';action=`Only if a verified ${chain} interface supports your asset, preview one $10–25 spot swap on ${p.name}; reject quotes above 0.5% slippage. Never add LP solely for rewards; impermanent loss is possible. Estimate ${fee} gas plus $0.02–0.25 fees; 10–20 min.`;
  }else if(/derivative|option|prediction|leveraged/.test(c)){
    action=`Use ${p.name}'s read-only market screens or a verified free demo if one exists; compare funding, liquidation and settlement on ${chain}. Do not open leveraged trades or bets to farm. Capital estimate $0; 15–30 min; real trading costs and rewards unverified.`;
  }else if(/lend|cdp|collateral/.test(c)){
    capital='$10–25';duration='15–25 min';action=`If ${p.name} verifies a public supply market on ${chain}, inspect its supported assets and withdrawal liquidity; preview a $10–25 supply and a full withdrawal before approving. Do not borrow or loop. Estimate ${fee} gas per action; 15–25 min; skip if minimums exceed budget.`;
  }else if(/bridge/.test(c)){
    action=`Inspect ${p.name}'s documented route, supported origin/destination assets and exit path. The snapshot lists ${chain}, not a complete bridge route. No transfer is recommended until both endpoints and minimums are verified. Research estimate $0, 15–30 min; bridge fees not known.`;
  }else if(/staking|restak|restaked|anchor btc|decentralized btc/.test(c)){
    capital='$10–25';duration='20–30 min';action=`For ${p.name}, verify whether native delegation or liquid staking is actually offered on ${chain}; read slashing, lockup and unbonding rules. If minimums permit, preview only $10–25 without leverage; otherwise stay read-only. Estimate ${fee} gas; 20–30 min plus documented exit delay.`;
  }else if(/yield|allocator|basis|farm|index|stable|synthetic|cedefi/.test(c)){
    capital='$10–25';duration='20–30 min';action=`If ${p.name} has a verified public ${chain} vault or mint, inspect collateral, redemption fees, custody and withdrawal delays. Preview a $10–25 round trip only if minima permit; avoid recursive deposits and leverage. Estimate ${fee} gas per action; 20–30 min; principal may be lost.`;
  }else{
    action=`No safe retail action is established for ${p.name}'s ${p.category||'unknown'} category. Read its own documentation and access rules on ${chain}; do not invent a deposit, asset or reward route. Research estimate $0 and 20–40 min; stay read-only until verified.`;
  }
  return {capital,time:duration,gas:capital==='$0'?'$0 research':fee,route:capital==='$0'?'Research first':'Optional small test',steps:[
    `Verify ${p.name} through independently located official documentation; check contracts, supported chains (${p.chains.slice(0,3).join(', ')||'not recorded'}) and any campaign terms. No URL or eligibility is inferred here. Research estimate $0, 10–20 min.`,
    action,
    capital==='$0'?`Revisit the documented access and incentive rules once after 7–14 days, not as a qualifying schedule. Keep research notes; do not deposit merely to create activity. Estimate $0 and 5–10 min; no reward or eligibility is established.`:`Use a wallet you control with only the chosen test budget. Keep approvals exact, record the transaction, and test redemption before leaving funds exposed. Budget another ${fee} for exit and 10–20 min; exit delays must be verified, not assumed.`,
    `Check official announcements only; recorded token status can be incomplete and an existing token does not imply another distribution. Never pay a claim fee, share a seed, or sign an opaque approval. Review estimate $0 and 5–10 min; no token, date, reward or eligibility is promised.`
  ]};
}
function build(snapshot){
  const cal=calibrate(snapshot.protocols),watch=new Set(snapshot.watchlist);
  const rows=snapshot.protocols.map(p=>{
    const model=estimate(p,snapshot.as_of,cal),farm=plan(p),state=status(p,watch.has(p.slug));
    return {...p,token_status:state,watchlist:watch.has(p.slug),early:p.tvl_usd<snapshot.floor_usd&&!token(p),model,farm,implied_value_usd:model.value,farm_steps:farm.steps};
  }).sort((a,b)=>b.implied_value_usd-a.implied_value_usd||(a.slug<b.slug?-1:a.slug>b.slug?1:0));
  let preRank=0;
  rows.forEach((r,i)=>{r.rank=i+1;r.pre_rank=r.token_status==='pre'?++preRank:null;});
  return {as_of:snapshot.as_of,source:snapshot.source,floor_usd:snapshot.floor_usd,calibration:cal,rows};
}
root.AtlasModel={clamp,median,quantile,token,age,calibrate,estimate,status,plan,build};
})(globalThis);
