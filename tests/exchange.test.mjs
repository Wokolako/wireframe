import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createExchangeService} from '../server/exchange.mjs';
const start=Date.parse('2026-10-17T12:00:00Z');
const quote=[
 {base:'EUR',quote:'USD',date:'2026-10-16',rate:1.16},
 {base:'EUR',quote:'MWK',date:'2026-10-15',rate:2000},
 {base:'EUR',quote:'ZMW',date:'2026-10-14',rate:24},
 {base:'EUR',quote:'ZAR',date:'2026-10-16',rate:20},
];

test('exchange rates validate provenance and coalesce provider requests',async()=>{
 let calls=0,url='';
 const get=createExchangeService({clock:()=>start,fetcher:async target=>{calls++;url=target;return {ok:true,json:async()=>quote};}});
 const [a,b]=await Promise.all([get('ZAR'),get('ZAR')]);
 assert.equal(a.rates.EUR,1);assert.equal(a.rates.USD,1.16);assert.equal(a.rates.MWK,2000);assert.equal(a.rates.ZMW,24);assert.equal(a.rates.ZAR,20);
 assert.equal(a.dates.USD,'2026-10-16');assert.equal(a.dates.MWK,'2026-10-15');assert.equal(a.dates.ZMW,'2026-10-14');
 assert.match(a.sources.MWK,/\/v2\/rate\/eur\/mwk/);assert.match(url,/\/v2\/rates\?base=EUR&quotes=USD,MWK,ZMW,ZAR&expand=providers/);assert.deepEqual(a,b);
 await get('ZAR');assert.equal(calls,1);assert.equal(100/a.rates.ZAR*a.rates.USD,5.8);
});

test('failed refresh returns a dated cached quote only within its freshness window',async()=>{
 let time=start,fail=false;
 const get=createExchangeService({clock:()=>time,fetcher:async()=>{if(fail)throw Error('offline');return{ok:true,json:async()=>quote};}});
 await get('ZAR');fail=true;time+=3600001;assert.equal((await get('ZAR')).stale,true);
 time=Date.parse('2026-10-22T12:00:00Z');const partial=await get('ZAR');assert.equal(partial.stale,true);assert.equal(partial.rates.MWK,undefined);assert.equal(partial.rates.USD,1.16);
 time=Date.parse('2026-10-25T12:00:00Z');await assert.rejects(get('ZAR'),e=>e.status===503);
});

test('missing, nonpositive, stale, and unsupported quotes never fabricate a market rate',async()=>{
 const invalid=[
  [{base:'EUR',quote:'USD',date:'2026-10-16',rate:0}],
  [{base:'EUR',quote:'USD',date:'2026-01-01',rate:1.1}],
  [{base:'USD',quote:'MWK',date:'2026-10-16',rate:2000}],
 ];
 for(const data of invalid){
  const get=createExchangeService({clock:()=>start,fetcher:async()=>({ok:true,json:async()=>data})});
  await assert.rejects(get('ZAR'),e=>e.status===503);
 }
 const get=createExchangeService({clock:()=>start,fetcher:async()=>({ok:true,json:async()=>[{base:'EUR',quote:'USD',date:'2026-10-16',rate:1.1}]})});
 const unsupported=await get('MWK');
 assert.deepEqual(unsupported.rates,{EUR:1,USD:1.1});
 assert.equal(unsupported.rates.MWK,undefined);
 await assert.rejects(get('../../'),e=>e.status===400);
});

test('valid local-currency quotes remain available when another quote is absent or stale',async()=>{
 const rows=[{base:'EUR',quote:'USD',date:'2026-01-01',rate:1.1},{base:'EUR',quote:'MWK',date:'2026-10-16',rate:2000},{base:'EUR',quote:'ZMW',date:'2026-10-15',rate:24}];
 const get=createExchangeService({clock:()=>start,fetcher:async()=>({ok:true,json:async()=>rows})});
 const result=await get('MWK');
 assert.deepEqual(result.rates,{EUR:1,MWK:2000,ZMW:24});
 assert.equal(result.dates.MWK,'2026-10-16');
 assert.equal(result.rates.USD,undefined);
});
