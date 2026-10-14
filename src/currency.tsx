import {useCallback,useEffect,useState} from 'react';
import {ArrowRightLeft,RefreshCw} from 'lucide-react';
import {PRESENTATION_MODE,api,readLocal,writeLocal} from './api';

type Rates={base:string;rates:Record<string,number>;dates:Record<string,string>;fetched_at:string;source:string;stale:boolean;demo?:boolean};
const MAX_AGE=7*86400000;
export const formatMoney=(amount:number,currency:string)=>{
 if(currency==='MWK')return `MWK ${new Intl.NumberFormat('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(amount)}`;
 if(currency==='ZMW')return `ZMW ${new Intl.NumberFormat('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(amount)}`;
 return new Intl.NumberFormat(currency==='EUR'?'en-IE':currency==='USD'?'en-US':'en-ZA',{style:'currency',currency}).format(amount);
};
function usable(value:Rates|null,market:string):value is Rates {
 return !!value&&value.base==='EUR'&&['EUR','USD'].every(c=>Number.isFinite(value.rates?.[c])&&value.rates[c]>0)&&(!value.rates[market]||value.rates[market]>0)&&Object.keys(value.dates||{}).length>0&&Object.values(value.dates).every(d=>Number.isFinite(Date.parse(d))&&Date.now()-Date.parse(d)<=MAX_AGE);
}
export function useCurrency(market:string,online:boolean){
 const [preference,setPreference]=useState(()=>readLocal<string>('wirefen-display-currency',''));
 const [rates,setRates]=useState<Rates|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const refresh=useCallback(async()=>{
  const cached=readLocal<Rates|null>('wirefen-rates-'+market,null);
  if(usable(cached,market))setRates({...cached,stale:true});else setRates(null);
  if(!navigator.onLine&&!PRESENTATION_MODE){setError('Offline — using saved rates when available.');return;}
  setLoading(true);setError('');
  try{const value=await api<Rates>('/exchange-rates');if(!usable(value,market))throw new Error('Recent exchange rates are unavailable.');setRates(value);writeLocal('wirefen-rates-'+market,value);}
  catch(e){setError((e as Error).message);}
  finally{setLoading(false);}
 },[market]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),3600000);return()=>clearInterval(timer);},[refresh,online]);
 const currencies=[...new Set([market,'MWK','ZMW','ZAR','USD','EUR'])];
 const validRates=usable(rates,market)?rates:null;
 const currency=currencies.includes(preference)&&(preference===market||validRates)?preference:market;
 const choose=(value:string)=>{setPreference(value);writeLocal('wirefen-display-currency',value);};
 const convert=(amount:number,from:string,to:string):number|null=>from===to?amount:validRates?.rates[from]&&validRates?.rates[to]?amount/validRates.rates[from]*validRates.rates[to]:null;
 const money=(amount:number)=>formatMoney(convert(amount,market,currency)??amount,currency);
 return {market,currency,currencies,rates:validRates,loading,error,choose,convert,money,refresh};
}
export type CurrencyState=ReturnType<typeof useCurrency>;
export function CurrencySelect({fx}:{fx:CurrencyState}){
 const symbols:Record<string,string>={MWK:' MK',ZMW:' ZK',ZAR:' R',EUR:' €',USD:' $'};
 return <label className="currency-select"><span className="sr-only">Display currency</span><select aria-label="Display currency" value={fx.currency} onChange={e=>fx.choose(e.target.value)}>{fx.currencies.map(c=><option key={c} value={c} disabled={c!==fx.market&&!fx.rates}>{c}{symbols[c]||''}</option>)}</select></label>;
}
export function CurrencyNotice({fx}:{fx:CurrencyState}){if(fx.currency===fx.market)return null;return <div className="currency-notice" role="status">Prices shown in {fx.currency} are estimates. Original prices are in {fx.market}. {fx.rates?.stale?'Using saved rates. ':''}<a href="#/converter">View exchange rates</a></div>;}
export function CurrencyConverter({fx}:{fx:CurrencyState}){
 const [amount,setAmount]=useState('100'),[from,setFrom]=useState('EUR'),[to,setTo]=useState('USD');
 const valid=amount!==''&&Number.isFinite(Number(amount))&&Number(amount)>=0&&Number(amount)<=1e12;
 const result=valid?fx.convert(Number(amount),from,to):null;
 const rate=fx.convert(1,from,to);
 const dates=fx.rates?[...new Set([fx.rates.dates[from],fx.rates.dates[to]].filter(Boolean))].sort():[];
 const allDates=fx.rates?[...new Set(Object.values(fx.rates.dates))].sort():[];
 const formatDate=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
 return <><div className="page-heading"><div><h1>Currency converter</h1><p>Compare euros, US dollars, and {fx.market} before making an inquiry.</p></div><button className="secondary" onClick={()=>void fx.refresh()} disabled={fx.loading||!navigator.onLine}><RefreshCw size={16} aria-hidden="true"/>{fx.loading?'Updating…':'Refresh rates'}</button></div><section className="converter-panel" aria-label="Currency conversion"><div className="conversion-inputs"><label className="field"><span>Amount</span><input aria-describedby={!valid?'conversion-error':undefined} aria-invalid={!valid} type="number" min="0" max="1000000000000" step="any" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="field"><span>From currency</span><select value={from} onChange={e=>setFrom(e.target.value)}>{fx.currencies.map(c=><option key={c}>{c}</option>)}</select></label><button className="secondary swap-currency" aria-label="Swap currencies" onClick={()=>{setFrom(to);setTo(from);}}><ArrowRightLeft size={19} aria-hidden="true"/></button><label className="field"><span>To currency</span><select value={to} onChange={e=>setTo(e.target.value)}>{fx.currencies.map(c=><option key={c}>{c}</option>)}</select></label></div>{!valid&&<p id="conversion-error" className="conversion-error" role="alert">Enter an amount between 0 and 1 trillion.</p>}<div className="conversion-result" aria-live="polite" aria-atomic="true"><span>{valid?`${formatMoney(Number(amount),from)} ${from} equals`:'Converted amount'}</span><strong>{result===null?(fx.loading?'Loading rates…':'Conversion unavailable'):formatMoney(result,to)}{result!==null&&<small> {to}</small>}</strong>{rate!==null&&<p>1 {from} = {new Intl.NumberFormat('en',{maximumFractionDigits:6}).format(rate)} {to}</p>}</div>{fx.error&&<p className="info-box" role="status">{fx.rates?'Could not refresh rates. The saved rates below are still available.':fx.error}</p>}<div className="conversion-meta">{fx.rates?<><p>{fx.rates.demo?'Illustrative demo rates (not live)':fx.rates.stale?'Saved reference rates':'Reference rates'} · {(dates.length?dates:allDates).map(formatDate).join(' / ')}</p><p>Last checked {new Date(fx.rates.fetched_at).toLocaleString('en-GB')} · {fx.rates.demo?'Presentation sample data':<a href="https://frankfurter.dev/" target="_blank" rel="noreferrer">Frankfurter</a>}</p></>:<p>Connect to load exchange rates. Conversion will be available once rates are retrieved.</p>}<p>Indicative conversion only. Bank fees and agreed transaction rates may differ.</p></div></section><section className="converter-preferences"><h2>Choose how you see produce prices</h2><p>Use your preferred currency across the catalogue, saved produce, and listing details.</p><CurrencySelect fx={fx}/><p className="footnote">Farmer price and production-cost entry remains in {fx.market}.</p></section></>;
}
