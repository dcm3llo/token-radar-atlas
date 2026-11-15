import '../dashboard/model.js';
export const model = (globalThis as any).AtlasModel;
export function parseSnapshot(text: string) {
  const s=JSON.parse(text);
  if(!s||!/^\d{4}-\d{2}-\d{2}$/.test(s.as_of)||!Number.isFinite(Date.parse(s.as_of+'T00:00:00Z'))||!Array.isArray(s.protocols)||!Array.isArray(s.watchlist))throw Error('Invalid snapshot header');
  const slugs=new Set();
  for(const p of s.protocols){
    if(!/^[^\s]{1,128}$/.test(p.slug)||slugs.has(p.slug)||typeof p.name!=='string'||!p.name.trim()||!Number.isSafeInteger(p.tvl_usd)||p.tvl_usd<=0||!Array.isArray(p.chains)||p.chains.some((c:any)=>typeof c!=='string'))throw Error('Invalid or duplicate protocol');
    for(const f of ['mcap_usd','change_7d'])if(p[f]!==null&&!Number.isFinite(p[f]))throw Error('Invalid numeric observation');
    for(const f of ['category','listed_at','gecko_id','symbol'])if(p[f]!==null&&typeof p[f]!=='string')throw Error('Invalid nullable string');
    slugs.add(p.slug);
  }
  if(s.watchlist.some((x:string)=>!slugs.has(x)))throw Error('Unknown watchlist slug');
  return s;
}
