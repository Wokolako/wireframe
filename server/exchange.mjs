const CACHE_TTL=60*60*1000;
const MAX_QUOTE_AGE=7*24*60*60*1000;
const PROVIDER='https://api.frankfurter.dev/v2/rates';
const FALLBACK='https://open.er-api.com/v6/latest/EUR';
const QUOTES=['USD','MWK','ZMW','ZAR','GBP'];

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
  // Every supported market uses the same EUR-based snapshot.
  const cacheKey='EUR';
  if(pending.has(cacheKey))return pending.get(cacheKey);
  const request=(async()=>{
   const cached=cache.get(cacheKey),now=clock(),usableCache=cached&&currentQuotes(cached.value,now);
   const ttl=usableCache&&QUOTES.every(currency=>usableCache.rates[currency])?CACHE_TTL:30000;
   if(usableCache&&now-cached.cachedAt<ttl)return usableCache;
   const url=`${PROVIDER}?base=EUR&quotes=${QUOTES.join(',')}&expand=providers`;
   try{
    const rates={EUR:1},dates={},sources={};
    try {
    const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error(`Frankfurter returned HTTP ${response.status}.`);
    const rows=await response.json();
    if(!Array.isArray(rows))throw new Error('Frankfurter returned an invalid quote response.');
    for(const row of rows){
     const currency=String(row?.quote||'').toUpperCase();
     if(row?.base!=='EUR'||!QUOTES.includes(currency)||!validDate(row.date,now)||typeof row.rate!=='number'||!Number.isFinite(row.rate)||row.rate<=0)continue;
     if(dates[currency]&&dates[currency]>row.date)continue;
     rates[currency]=row.rate;
     dates[currency]=row.date;
     sources[currency]=`https://api.frankfurter.dev/v2/rate/eur/${currency.toLowerCase()}?expand=providers`;
    }
    } catch { /* Try the independent provider below. */ }
    if(QUOTES.some(currency=>!rates[currency])){
     try{
      const response=await fetcher(FALLBACK,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error('Backup rates unavailable.');
      const body=await response.json();
      const timestamp=Number(body.time_last_update_unix)*1000;
      const date=Number.isFinite(timestamp)?new Date(timestamp).toISOString().slice(0,10):'';
      if(body.result!=='success'||body.base_code!=='EUR'||!validDate(date,now))throw new Error('Invalid backup rate snapshot.');
      for(const currency of QUOTES){
       const rate=body.rates?.[currency];
       if(!rates[currency]&&typeof rate==='number'&&Number.isFinite(rate)&&rate>0){
        rates[currency]=rate;dates[currency]=date;sources[currency]='https://www.exchangerate-api.com';
       }
      }
     }catch{ /* Preserve valid primary quotes or the dated cache. */ }
    }
    if(Object.keys(rates).length===1)throw new Error('Frankfurter returned no current supported currency quotes.');
    const backupUsed=Object.values(sources).includes('https://www.exchangerate-api.com');
    const value={base:'EUR',rates,dates,fetched_at:new Date(now).toISOString(),source:backupUsed?'Daily reference rates':'Frankfurter blended reference rates',sources,stale:false};
    cache.set(cacheKey,{cachedAt:now,value});
    return value;
   }catch(error){
    if(usableCache)return {...usableCache,stale:true};
    throw Object.assign(new Error('Exchange rates are unavailable. Please try again shortly.'),{status:503,cause:error});
   }
  })();
  pending.set(cacheKey,request);
  try{return await request;}finally{pending.delete(cacheKey);}
 };
}

export const getExchangeRates=createExchangeService();
