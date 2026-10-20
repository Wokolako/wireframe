import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {getExchangeRates} from './exchange.mjs';
import {majorUnits} from './money.mjs';

const fail=(status,message)=>Object.assign(new Error(message),{status});
const quoteKey=createHmac('sha256',process.env.CHECKOUT_QUOTE_SECRET||process.env.CLERK_SECRET_KEY||process.env.PAYCHANGU_SECRET_KEY||process.env.DATABASE_URL||randomBytes(32)).update('wirefen-checkout-quote-v1').digest();
const fingerprint=items=>JSON.stringify(items.map(item=>({id:item.listing_id,quantity:item.quantity,currency:item.currency,price:item.priceMinor,total:item.lineTotalMinor})).sort((a,b)=>a.id.localeCompare(b.id)));

export async function makeCheckoutQuote(items,paymentMethod){
 const mixed=items.some(item=>item.currency!==items[0].currency);
 const currency=mixed?'USD':items[0].currency;
 if(paymentMethod!=='paychangu_mobile_money')throw fail(400,'Payment must be completed online at checkout. Pay on delivery and manual bank transfers are not supported.');
 if(items.some(item=>!Number.isSafeInteger(item.lineTotalMinor)||item.lineTotalMinor<=0))throw fail(400,'Invalid checkout total.');
 let totalMinor=items.reduce((sum,item)=>sum+item.lineTotalMinor,0);
 const payableCurrency='MWK';
 let payableMinor=totalMinor,rate=1,dates={},sources={};
 let expires=Date.now()+10*60*1000;
 if(mixed||payableCurrency!==currency){
  const exchange=await getExchangeRates(currency);
  const codes=[...new Set([currency,payableCurrency,...items.map(item=>item.currency)])];
  if(codes.some(code=>!exchange.rates[code]))throw fail(503,'A current payment exchange rate is unavailable. Please retry later.');
  // Normalize mixed native prices to USD, then round only the final MWK charge.
  const usdTotal=items.reduce((sum,item)=>sum+majorUnits(item.lineTotalMinor)*exchange.rates.USD/exchange.rates[item.currency],0);
  if(mixed)totalMinor=Math.round(usdTotal*100);
  rate=exchange.rates[payableCurrency]/exchange.rates[currency];
  payableMinor=Math.max(1,Math.round(mixed?usdTotal*exchange.rates.MWK/exchange.rates.USD:majorUnits(totalMinor)*rate))*100;
  for(const code of codes)if(code!=='EUR'){
   dates[code]=exchange.dates[code];sources[code]=exchange.sources[code];
   expires=Math.min(expires,Date.parse(exchange.dates[code]+'T00:00:00Z')+7*86400000);
  }
 }
 if(!Number.isSafeInteger(totalMinor)||totalMinor<=0)throw fail(400,'Invalid checkout total.');
 if(!Number.isSafeInteger(payableMinor)||payableMinor<=0)throw fail(400,'The converted checkout amount is outside the supported range.');
 if(paymentMethod==='paychangu_mobile_money'&&payableMinor%100!==0)throw fail(400,'PayChangu accepts whole-Kwacha checkout totals. Adjust the basket quantity.');
 const payload={fingerprint:fingerprint(items),payment_method:paymentMethod,items:items.map(item=>({listing_id:item.listing_id,quantity:item.quantity,currency:item.currency,unit_price_minor:item.priceMinor,line_total_minor:item.lineTotalMinor})),currency,total_minor:totalMinor,payable_currency:payableCurrency,payable_minor:payableMinor,mwk_total:payableCurrency==='MWK'?majorUnits(payableMinor):null,exchange_rate_to_mwk:payableCurrency==='MWK'?rate:null,rate_dates:dates,rate_sources:sources,quoted_at:new Date().toISOString(),quote_expires_at:new Date(expires).toISOString(),bank_transfer:null};
 const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const signature=createHmac('sha256',quoteKey).update(encoded).digest('base64url');
 const {fingerprint:ignored,...publicQuote}=payload;
 return {...publicQuote,quote_token:encoded+'.'+signature};
}

export function verifyCheckoutQuote(token,items,paymentMethod){
 try{
  const [encoded,signature,extra]=token.split('.');
  if(extra||!encoded||!signature)throw new Error('Invalid token');
  const expected=createHmac('sha256',quoteKey).update(encoded).digest(),actual=Buffer.from(signature,'base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Invalid signature');
  const payload=JSON.parse(Buffer.from(encoded,'base64url').toString());
  if(!Number.isFinite(Date.parse(payload.quote_expires_at))||Date.parse(payload.quote_expires_at)<=Date.now())throw fail(409,'Your checkout quote expired. Refresh the total and confirm again.');
  if(payload.fingerprint!==fingerprint(items)||payload.payment_method!==paymentMethod)throw fail(409,'Prices or basket details changed. Refresh the total and confirm again.');
  const {fingerprint:ignored,...quote}=payload;
  return quote;
 }catch(error){if(error.status)throw error;throw fail(400,'Invalid checkout quote. Refresh the total and confirm again.');}
}

export function frozenPaymentAmount(checkout){
 let stored={};try{stored=JSON.parse(checkout.response_json||'{}');}catch{}
 const amount=stored.mwk_total??(checkout.currency==='MWK'?majorUnits(Number(checkout.total_minor)):null);
 if(!Number.isFinite(amount)||amount<=0)throw fail(409,'This order has no confirmed MWK payment quote. Contact Wirefen before paying.');
 return amount;
}
