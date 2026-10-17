import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';

process.env.NODE_ENV='test';
process.env.SQLITE_PATH=':memory:';
process.env.CURRENCY='MWK';
process.env.PAYCHANGU_SECRET_KEY='test-paychangu-secret';
process.env.PAYCHANGU_WEBHOOK_SECRET='test-paychangu-webhook-secret';
process.env.PAYCHANGU_TEST_MODE='true';

const {app,db}=await import('./helpers/test-api.mjs').then(module=>module.loadTestApi());
const originalFetch=globalThis.fetch;
let initRequests=0,verifyStatus='pending';
const chargeAmounts=new Map();
globalThis.fetch=async(input,options={})=>{
 const url=String(input);
 if(url==='https://api.paychangu.com/mobile-money/'){
  return new Response(JSON.stringify({status:'success',data:[{ref_id:'test-airtel',name:'Airtel Money',supported_country:{currency:'MWK'}}]}),{status:200});
 }
 if(url==='https://api.paychangu.com/mobile-money/payments/initialize'){
  initRequests++;
  const body=JSON.parse(options.body);
  assert.equal(body.mobile,'991112200');
  chargeAmounts.set(body.charge_id,body.amount);
  return new Response(JSON.stringify({status:'success',message:'Approve on your phone',data:{charge_id:body.charge_id}}),{status:200});
 }
 if(url.includes('/mobile-money/payments/')&&url.endsWith('/verify')){
  const chargeId=decodeURIComponent(url.split('/').at(-2));
  return new Response(JSON.stringify({status:'success',data:{status:verifyStatus,charge_id:chargeId,amount:chargeAmounts.get(chargeId)||'25',currency:'MWK',reference:'PC-TEST-REF'}}),{status:200});
 }
 return originalFetch(input,options);
};

let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/api/v1`;});
after(async()=>{globalThis.fetch=originalFetch;await new Promise(resolve=>server.close(resolve));await db.close();});

async function call(path,{body,method,cookie,headers}={}){
 const verb=method||(body?'POST':'GET');
 const idempotency=verb==='POST'&&path==='/guest-orders/basket'?{'Idempotency-Key':randomUUID()}:{};
 const response=await originalFetch(base+path,{method:verb,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...idempotency,...headers},body:body?JSON.stringify(body):undefined});
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function createCheckout(suffix){
 return call('/guest-orders/basket',{body:{items:[{listing_id:'produce-1',quantity:2}],contact_name:'MWK Buyer',contact_phone:`+265991112${suffix}`,contact_email:`mwk${suffix}@example.com`,delivery_location:'Lilongwe city',payment_method:'paychangu_mobile_money'}});
}

test('PayChangu requires MWK configuration, confirmed stock, and exact verified payment before settlement',async()=>{
 const config=await call('/config');
 assert.equal(config.data.currency,'MWK');
 assert.equal(config.data.capabilities.online_payments,false);
 assert.equal(config.data.capabilities.paychangu_mobile_money,true);
 process.env.CURRENCY='ZAR';
 assert.equal((await call('/config')).data.capabilities.paychangu_mobile_money,false);
 assert.equal((await call('/paychangu/operators')).status,503);
 process.env.CURRENCY='MWK';
 const fractional=await call('/guest-orders/basket',{body:{items:[{listing_id:'produce-1',quantity:1}],contact_name:'Fractional Buyer',contact_phone:'+265991112202',contact_email:'fractional@example.com',delivery_location:'Lilongwe city',payment_method:'paychangu_mobile_money'}});
 assert.equal(fractional.status,400);
 const placed=await createCheckout('200');
 assert.equal(placed.status,201);
 assert.equal(placed.data.total_minor,2500);
 assert.equal(placed.data.payment_status,'unpaid');
 const early=await call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'+265991112200'}});
 assert.equal(early.status,409);
 assert.equal(initRequests,0);
 const admin=(await call('/auth/demo',{body:{role:'Admin'}})).cookie;
 assert.ok(admin);
 assert.equal((await call(`/admin/guest-orders/${placed.data.checkout_id}`,{method:'PATCH',body:{status:'Confirmed'},cookie:admin})).status,200);
 assert.equal((await call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'bad-operator',mobile:'+265991112200'}})).status,400);
 assert.equal((await call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'+27821234567'}})).status,400);
 const first=await call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'+265991112200'}});
 assert.equal(first.status,201);
 assert.equal(first.data.amount,25);
 assert.equal(first.data.currency,'MWK');
 assert.equal(initRequests,1);
 assert.equal((await call(`/guest-orders/${placed.data.checkout_id}/payment-status`)).data.payment_status,'pending');
 verifyStatus='failed';
 assert.equal((await call(`/guest-orders/${placed.data.checkout_id}/payment-status`)).data.payment_status,'failed');
 const retry=await call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'+265991112200'}});
 assert.equal(retry.status,201);
 assert.notEqual(retry.data.charge_id,first.data.charge_id);
 verifyStatus='successful';
 const settled=await call(`/guest-orders/${placed.data.checkout_id}/payment-status`);
 assert.equal(settled.status,200);
 assert.equal(settled.data.payment_status,'paid');
 assert.equal((await db.get('SELECT payment_status,provider_reference FROM guest_order_checkouts WHERE id=?',[placed.data.checkout_id])).provider_reference,'PC-TEST-REF');
 assert.equal((await call(`/admin/guest-orders/${placed.data.checkout_id}`,{method:'PATCH',body:{status:'Cancelled'},cookie:admin})).status,409);
});

test('PayChangu webhook requires a valid HMAC and verifies provider state before marking an order paid',async()=>{
 verifyStatus='pending';
 const placed=await createCheckout('201');
 const admin=(await call('/auth/demo',{body:{role:'Admin'}})).cookie;
 assert.equal((await call(`/admin/guest-orders/${placed.data.checkout_id}`,{method:'PATCH',body:{status:'Confirmed'},cookie:admin})).status,200);
 const initialized=await call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'+265991112200'}});
 assert.equal(initialized.status,201);
 const payload={data:{charge_id:initialized.data.charge_id,status:'successful'}},raw=JSON.stringify(payload);
 assert.equal((await call('/paychangu/webhook',{body:payload,headers:{signature:'00'}})).status,401);
 verifyStatus='successful';
 const signature=createHmac('sha256',process.env.PAYCHANGU_WEBHOOK_SECRET).update(raw).digest('hex');
 const webhook=await call('/paychangu/webhook',{body:payload,headers:{signature}});
 assert.equal(webhook.status,200);
 assert.equal((await db.get('SELECT payment_status FROM guest_order_checkouts WHERE id=?',[placed.data.checkout_id])).payment_status,'paid');
});
