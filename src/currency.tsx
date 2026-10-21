import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowRightLeft,RefreshCw} from 'lucide-react';
import {api,readLocal,writeLocal} from './api';

type Rates={base:string;rates:Record<string,number>;dates:Record<string,string>;sources?:Record<string,string>;fetched_at:string;source:string;stale:boolean;demo?:boolean};
const MAX_AGE=7*86400000;
export const normalizeCurrency=(c:string)=>{
 const upper=String(c||'').toUpperCase();
 if(upper==='MKW'||upper==='MK')return 'MWK';
 return upper;
};
export const formatMoney=(amount:number,currency:string)=>{
 const code=normalizeCurrency(currency);
 const digits=code==='MWK'&&Number.isInteger(amount)?0:2;
 const formatted=new Intl.NumberFormat('en-US',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(amount);
 if(code==='MWK')return `MWK ${formatted}`;
 if(code==='ZMW')return `ZMW ${formatted}`;
 if(code==='USD')return `$${formatted}`;
 if(code==='EUR')return `€${formatted}`;
 if(code==='GBP')return `£${formatted}`;
 if(code==='ZAR')return `R ${formatted}`;
 return `${code} ${formatted}`;
};
function currentRates(value:Rates|null):Rates|null {
 if(!value||value.base!=='EUR'||value.rates?.EUR!==1)return null;
 const rates:Record<string,number>={EUR:1},dates:Record<string,string>={},sources:Record<string,string>={};
 for(const currency of ['USD','MWK','ZMW','ZAR','GBP']){
  const rate=value.rates?.[currency]??(currency==='MWK'?(value.rates?.['MKW']??value.rates?.['MK']):undefined);
  const date=value.dates?.[currency]??(currency==='MWK'?(value.dates?.['MKW']??value.dates?.['MK']):undefined);
  const timestamp=Date.parse(`${date}T00:00:00Z`);
  if(Number.isFinite(rate)&&rate>0&&typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(timestamp)&&Date.now()-timestamp<=MAX_AGE&&timestamp<=Date.now()+86400000){
   rates[currency]=rate;dates[currency]=date;
   if(value.sources?.[currency])sources[currency]=value.sources[currency];
   else if(currency==='MWK'&&(value.sources?.['MKW']||value.sources?.['MK']))sources[currency]=value.sources['MKW']||value.sources['MK'];
  }
 }
 return Object.keys(rates).length>1?{...value,rates,dates,sources}:null;
}
export function useCurrency(market:string,online:boolean){
 const [preference,setPreference]=useState(()=>normalizeCurrency(readLocal<string>('wirefen-display-currency','')));
 const [rates,setRates]=useState<Rates|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const requestId=useRef(0),memoryRates=useRef<Rates|null>(null);
 const refresh=useCallback(async()=>{
  const current=++requestId.current;
  const cached=readLocal<Rates|null>('wirefen-rates-'+market,null);
  const saved=currentRates(cached)||currentRates(memoryRates.current);
  if(saved)setRates({...saved,stale:true});else setRates(null);
  // Browser connection indicators can report offline while this server is reachable.
  // Attempt the request and use its result to determine availability.
  setLoading(true);setError('');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const value=currentRates(await api<Rates>('/exchange-rates',{signal:controller.signal}));if(!value)throw new Error('Recent exchange rates are unavailable.');if(current===requestId.current){memoryRates.current=value;setRates(value);writeLocal('wirefen-rates-'+market,value);}}
  catch(e){if(current===requestId.current)setError(controller.signal.aborted?'Exchange rates took too long to load. Please retry.':(e as Error).message);}
  finally{clearTimeout(timer);if(current===requestId.current)setLoading(false);}
 },[market]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),3600000);return()=>{clearInterval(timer);requestId.current++;};},[refresh,online]);
 const currencies=[...new Set([market,'MWK','ZMW','ZAR','USD','EUR','GBP'])];
 const validRates=currentRates(rates);
 const currency=currencies.includes(preference)?preference:market;
 const choose=(value:string)=>{
  const normalized=normalizeCurrency(value);
  if(!currencies.includes(normalized))return;
  setPreference(normalized);writeLocal('wirefen-display-currency',normalized);
  if(normalized!==market&&(!validRates?.rates[normalized]||!validRates?.rates[market])&&!loading)void refresh();
 };
 const convert=(amount:number,from:string,to:string):number|null=>{
  const f=normalizeCurrency(from),t=normalizeCurrency(to);
  return f===t?amount:validRates?.rates[f]&&validRates?.rates[t]?amount/validRates.rates[f]*validRates.rates[t]:null;
 };
 const money=(amount:number,source=market)=>{
  const s=normalizeCurrency(source);
  const converted=convert(amount,s,currency);
  return formatMoney(converted??amount,converted===null?s:currency);
 };
 return {market,currency,currencies,rates:validRates,loading,error,choose,convert,money,refresh};
}
export type CurrencyState=ReturnType<typeof useCurrency>;
export function CurrencySelect({fx}:{fx:CurrencyState}){
 const symbols:Record<string,string>={MWK:' MK',MKW:' MK',ZMW:' ZK',ZAR:' R',EUR:' €',USD:' $',GBP:' £'};
 return <label className="currency-select"><span className="sr-only">Display currency</span><select aria-label="Display currency" value={fx.currency} onChange={e=>fx.choose(e.target.value)}>{fx.currencies.map(c=><option key={c} value={c}>{c}{symbols[c]||''}</option>)}</select></label>;
}
export function CurrencyNotice({fx}:{fx:CurrencyState}){
 if(fx.currency===fx.market&&!fx.error)return null;
 const available=!!fx.rates?.rates[fx.currency]&&!!fx.rates?.rates[fx.market];
 return <div className="currency-notice" role="status">
  {!available?`${fx.currency} selected. ${fx.loading?'Loading exchange rates.':'Conversion is temporarily unavailable.'} Prices remain in their original currencies. `:`Prices shown in ${fx.currency} are estimates. ${fx.rates?.stale?'Using saved rates. ':''}`}
  {fx.error&&available?'Could not refresh rates. ':''}
  {!fx.loading&&(!available||fx.error)&&<button type="button" className="text-button" onClick={()=>void fx.refresh()}>Retry exchange rates</button>}
  {' '}<Link href="/converter">View exchange rates</Link>
 </div>;
}
export function CurrencyConverter({fx}:{fx:CurrencyState}){
 const [amount,setAmount]=useState('100'),[from,setFrom]=useState('EUR'),[to,setTo]=useState('USD');
 const valid=amount!==''&&Number.isFinite(Number(amount))&&Number(amount)>=0&&Number(amount)<=1e12;
 const result=valid?fx.convert(Number(amount),from,to):null;
 const rate=fx.convert(1,from,to);
 const dates=fx.rates?[...new Set([fx.rates.dates[from],fx.rates.dates[to]].filter(Boolean))].sort():[];
 const allDates=fx.rates?[...new Set(Object.values(fx.rates.dates))].sort():[];
 const formatDate=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
 return <><div className="page-heading"><div><h1>Currency converter</h1><p>Convert amounts using current reference rates.</p></div><button className="secondary" onClick={()=>void fx.refresh()} disabled={fx.loading}><RefreshCw size={16} aria-hidden="true"/>{fx.loading?'Updating…':'Refresh rates'}</button></div><section className="converter-panel" aria-label="Currency conversion"><div className="conversion-inputs"><label className="field"><span>Amount</span><input aria-describedby={!valid?'conversion-error':undefined} aria-invalid={!valid} type="number" min="0" max="1000000000000" step="any" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="field"><span>From currency</span><select value={from} onChange={e=>setFrom(e.target.value)}>{fx.currencies.map(c=><option key={c} >{c}</option>)}</select></label><button className="secondary swap-currency" aria-label="Swap currencies" onClick={()=>{setFrom(to);setTo(from);}}><ArrowRightLeft size={19} aria-hidden="true"/></button><label className="field"><span>To currency</span><select value={to} onChange={e=>setTo(e.target.value)}>{fx.currencies.map(c=><option key={c} >{c}</option>)}</select></label></div>{!valid&&<p id="conversion-error" className="conversion-error" role="alert">Enter an amount between 0 and 1 trillion.</p>}<div className="conversion-result" aria-live="polite" aria-atomic="true"><span>{valid?`${formatMoney(Number(amount),from)} equals`:'Converted amount'}</span><strong>{result===null?(fx.loading?'Loading rates…':'Conversion unavailable'):formatMoney(result,to)}</strong>{rate!==null&&<p>1 {from} = {new Intl.NumberFormat('en',{maximumFractionDigits:6}).format(rate)} {to}</p>}</div>{fx.error&&<p className="info-box" role="status">{fx.rates?'Could not refresh rates. The saved rates below are still available.':fx.error}</p>}<div className="conversion-meta">{fx.rates?<><p>{fx.rates.demo?'Illustrative demo rates (not live)':fx.rates.stale?'Saved reference rates':'Reference rates'} · {(dates.length?dates:allDates).map(formatDate).join(' / ')}</p><p>Last checked {new Date(fx.rates.fetched_at).toLocaleString('en-GB')} · {fx.rates.source}{fx.rates.sources?.[from]||fx.rates.sources?.[to]?<> · <Link href={fx.rates.sources[from]||fx.rates.sources[to]} target="_blank" rel="noreferrer">Quote source</Link></>:null}</p></>:<p>Connect to load exchange rates. Conversion will be available once rates are retrieved.</p>}<p>Indicative conversion only. Bank fees and agreed transaction rates may differ.</p></div></section><section className="converter-preferences"><h2>Choose how you see produce prices</h2><p>Use your preferred currency across the catalogue, saved produce, and listing details.</p><CurrencySelect fx={fx}/><p className="footnote">Farmer price and production-cost entry remains in {fx.market}.</p></section></>;
}
