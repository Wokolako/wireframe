const CACHE_TTL=60*60*1000;
const MAX_QUOTE_AGE=7*24*60*60*1000;
const PROVIDER='https://api.frankfurter.dev/v2/rates';
const QUOTES=['USD','MWK','ZMW','ZAR'];

function validDate(value,now){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=Date.parse(`${value}T00:00:00Z`);
 return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===value&&parsed<=now+86400000&&now-parsed<=MAX_QUOTE_AGE;
}

function currentQuotes(value,now){
 const rates={EUR:1},dates={},sources={};
 for(const currency of QUOTES){
  const rate=value.rates[currency],date=value.dates[currency];
  if(typeof rate==='number'&&Number.isFinite(rate)&&rate>0&&validDate(date,now)){
   rates[currency]=rate;dates[currency]=date;sources[currency]=value.sources[currency];
  }
 }
 return Object.keys(rates).length>1?{...value,rates,dates,sources}:null;
}

export function createExchangeService({clock=Date.now,fetcher=fetch}={}){
 const cache=new Map(),pending=new Map();
 return async function getExchangeRates(market){
  if(typeof market!=='string'||!/^[A-Z]{3}$/.test(market))throw Object.assign(new Error('Invalid market currency.'),{status:400});
  if(pending.has(market))return pending.get(market);
  const request=(async()=>{
   const cached=cache.get(market),now=clock(),usableCache=cached&&currentQuotes(cached.value,now);
   if(usableCache&&now-cached.cachedAt<CACHE_TTL)return usableCache;
   const url=`${PROVIDER}?base=EUR&quotes=${QUOTES.join(',')}&expand=providers`;
   try{
    const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error(`Frankfurter returned HTTP ${response.status}.`);
    const rows=await response.json();
    if(!Array.isArray(rows))throw new Error('Frankfurter returned an invalid quote response.');
    const rates={EUR:1},dates={},sources={};
    for(const row of rows){
     const currency=String(row?.quote||'').toUpperCase();
     if(row?.base!=='EUR'||!QUOTES.includes(currency)||!validDate(row.date,now)||typeof row.rate!=='number'||!Number.isFinite(row.rate)||row.rate<=0)continue;
     if(dates[currency]&&dates[currency]>row.date)continue;
     rates[currency]=row.rate;
     dates[currency]=row.date;
     sources[currency]=`https://api.frankfurter.dev/v2/rate/eur/${currency.toLowerCase()}?expand=providers`;
    }
    if(Object.keys(rates).length===1)throw new Error('Frankfurter returned no current supported currency quotes.');
    const value={base:'EUR',rates,dates,fetched_at:new Date(now).toISOString(),source:'Frankfurter blended reference rates',sources,stale:false};
    cache.set(market,{cachedAt:now,value});
    return value;
   }catch(error){
    if(usableCache)return {...usableCache,stale:true};
    throw Object.assign(new Error('Exchange rates are unavailable. Please try again shortly.'),{status:503,cause:error});
   }
  })();
  pending.set(market,request);
  try{return await request;}finally{pending.delete(market);}
 };
}

export const getExchangeRates=createExchangeService();
