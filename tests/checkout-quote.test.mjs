import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeCheckoutQuote,verifyCheckoutQuote,frozenPaymentAmount} from '../server/checkout.mjs';

const items=[{listing_id:'tomatoes',quantity:2,currency:'MWK',priceMinor:1250,lineTotalMinor:2500}];
test('MWK quotes preserve the actual total and reject changed prices or forged quotes',async()=>{
 const quote=await makeCheckoutQuote(items,'paychangu_mobile_money');
 assert.equal(quote.payable_minor,2500);assert.equal(quote.mwk_total,25);assert.equal(quote.exchange_rate_to_mwk,1);
 assert.equal(verifyCheckoutQuote(quote.quote_token,items,'paychangu_mobile_money').payable_minor,2500);
 assert.throws(()=>verifyCheckoutQuote(quote.quote_token,[{...items[0],priceMinor:1300,lineTotalMinor:2600}],'paychangu_mobile_money'),error=>error.status===409);
 assert.throws(()=>verifyCheckoutQuote(quote.quote_token+'tampered',items,'paychangu_mobile_money'),error=>error.status===400);
});
test('expired quotes cannot create a checkout',async()=>{
 const quote=await makeCheckoutQuote(items,'paychangu_mobile_money'),original=Date.now;
 try{Date.now=()=>Date.parse(quote.quote_expires_at)+1;assert.throws(()=>verifyCheckoutQuote(quote.quote_token,items,'paychangu_mobile_money'),error=>error.status===409);}finally{Date.now=original;}
});
test('offline payment methods are rejected and payment verification never recalculates FX',async()=>{
 await assert.rejects(makeCheckoutQuote(items,'pay_on_delivery'),error=>error.status===400);
 await assert.rejects(makeCheckoutQuote(items,'malawian_bank'),error=>error.status===400);
 assert.equal(frozenPaymentAmount({currency:'USD',total_minor:100,response_json:JSON.stringify({mwk_total:1750})}),1750);
 assert.throws(()=>frozenPaymentAmount({currency:'USD',total_minor:100,response_json:'{}'}),error=>error.status===409);
});
