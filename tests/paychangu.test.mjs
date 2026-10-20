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
let initRequests=0,verifyRequests=0,verifyStatus='pending',verificationUnavailable=false;
const chargeAmounts=new Map(),chargeStatuses=new Map();
globalThis.fetch=async(input,options={})=>{
 const url=String(input);
 if(url==='https://api.paychangu.com/mobile-money/'){
  return new Response(JSON.stringify({status:'success',data:[{ref_id:'test-airtel',name:'Airtel Money',supported_country:{currency:'MWK'}}]}),{status:200});
 }
 if(url==='https://api.paychangu.com/mobile-money/payments/initialize'){
  initRequests++;
  const body=JSON.parse(options.body);
  assert.ok(['991112200','881522474'].includes(body.mobile));
  chargeAmounts.set(body.charge_id,body.amount);
  return new Response(JSON.stringify({status:'success',message:'Approve on your phone',data:{charge_id:body.charge_id}}),{status:200});
 }
 if(url.includes('/mobile-money/payments/')&&url.endsWith('/verify')){
  verifyRequests++;
  if(verificationUnavailable)return new Response(JSON.stringify({error:'Provider unavailable'}),{status:503});
  const chargeId=decodeURIComponent(url.split('/').at(-2));
  return new Response(JSON.stringify({status:'success',data:{status:chargeStatuses.get(chargeId)||verifyStatus,charge_id:chargeId,amount:chargeAmounts.get(chargeId)||'25',currency:'MWK',reference:'PC-TEST-REF'}}),{status:200});
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

test('PayChangu requires secret key configuration, supports multi-currency conversion to MWK, reserves stock at checkout, and verifies payment before settlement',async()=>{
 const config=await call('/config');
 assert.equal(config.data.currency,'MWK');
 assert.equal(config.data.capabilities.online_payments,true);
 assert.equal(config.data.capabilities.paychangu_mobile_money,true);
 const originalKey=process.env.PAYCHANGU_SECRET_KEY;
 delete process.env.PAYCHANGU_SECRET_KEY;
 assert.equal((await call('/config')).data.capabilities.paychangu_mobile_money,false);
 assert.equal((await call('/paychangu/operators')).status,503);
 process.env.PAYCHANGU_SECRET_KEY=originalKey;
 process.env.CURRENCY='USD';
 assert.equal((await call('/config')).data.capabilities.paychangu_mobile_money,true);
 assert.equal((await call('/paychangu/operators')).status,200);
 process.env.CURRENCY='MWK';
 const fractional=await call('/guest-orders/basket',{body:{items:[{listing_id:'produce-1',quantity:1}],contact_name:'Fractional Buyer',contact_phone:'+265991112202',contact_email:'fractional@example.com',delivery_location:'Lilongwe city',payment_method:'paychangu_mobile_money'}});
 assert.equal(fractional.status,400);
 const placed=await createCheckout('200');
 assert.equal(placed.status,201);
 assert.equal(placed.data.total_minor,2500);
 assert.equal(placed.data.payment_status,'unpaid');
 assert.equal(placed.data.status,'Awaiting payment');
 assert.equal(initRequests,0);
 const admin=(await call('/auth/demo',{body:{role:'Admin'}})).cookie;
 assert.ok(admin);
 assert.equal((await call(`/admin/guest-orders/${placed.data.checkout_id}`,{method:'PATCH',body:{status:'Confirmed'},cookie:admin})).status,409);
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
 assert.equal((await call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'265 881522474'}})).status,409);
 const retry=await call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'265 881522474',retry:true}});
 assert.equal(retry.status,201);
 assert.notEqual(retry.data.charge_id,first.data.charge_id);
 verifyStatus='successful';
 const settled=await call(`/guest-orders/${placed.data.checkout_id}/payment-status`);
 assert.equal(settled.status,200);
 assert.equal(settled.data.payment_status,'paid');
 assert.equal(settled.data.status,'Confirmed');
 assert.ok((await call('/admin/guest-orders',{cookie:admin})).data.some(order=>order.id===placed.data.checkout_id));
 assert.equal((await db.get('SELECT payment_status,provider_reference FROM guest_order_checkouts WHERE id=?',[placed.data.checkout_id])).provider_reference,'PC-TEST-REF');
 assert.equal((await call(`/admin/guest-orders/${placed.data.checkout_id}`,{method:'PATCH',body:{status:'Cancelled'},cookie:admin})).status,409);
});

test('PayChangu webhook requires a valid HMAC and verifies provider state before marking an order paid',async()=>{
 verifyStatus='pending';
 const placed=await createCheckout('201');
 const admin=(await call('/auth/demo',{body:{role:'Admin'}})).cookie;
 assert.equal((await call(`/admin/guest-orders/${placed.data.checkout_id}`,{method:'PATCH',body:{status:'Confirmed'},cookie:admin})).status,409);
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


test('only verified online payment confirms orders; cancellation releases unpaid stock once',async()=>{
 const body={items:[{listing_id:'produce-1',quantity:2}],contact_name:'Cancellation Test',contact_phone:'+265991112299',contact_email:'cancel@example.com',delivery_location:'Lilongwe City',payment_method:'paychangu_mobile_money'};
 assert.equal((await call('/guest-orders/basket',{body:{...body,payment_method:'pay_on_delivery'}})).status,400);
 assert.equal((await call('/guest-orders/basket',{body:{...body,payment_method:'malawian_bank'}})).status,400);
 const before=Number((await db.get("SELECT available_volume FROM listings WHERE id='produce-1'")).available_volume);
 const quote=await call('/guest-orders/quote',{body:{items:body.items,payment_method:'paychangu_mobile_money'}});
 assert.equal(quote.status,200);assert.equal(quote.data.payable_minor,2500);assert.ok(quote.data.quote_token);
 const placed=await call('/guest-orders/basket',{body:{...body,quote_token:quote.data.quote_token}});
 assert.equal(placed.status,201);assert.equal(placed.data.status,'Awaiting payment');
 assert.equal((await call('/admin/guest-orders',{cookie:(await call('/auth/demo',{body:{role:'Admin'}})).cookie})).data.some(order=>order.id===placed.data.checkout_id),false);
 assert.equal((await call(`/guest-orders/${placed.data.checkout_id}/cancel`,{body:{}})).status,200);
 assert.equal((await call(`/guest-orders/${placed.data.checkout_id}/cancel`,{body:{}})).status,200);
 assert.equal(Number((await db.get("SELECT available_volume FROM listings WHERE id='produce-1'")).available_volume),before);
 assert.equal((await call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'+265991112200'}})).status,409);
});

test('buyer can cancel pending payment order without problems and stock is released',async()=>{
 verifyStatus='pending';
 const placed=await createCheckout('298');assert.equal(placed.status,201);
 const started=await call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'+265991112200'}});assert.equal(started.status,201);
 const reserved=Number((await db.get("SELECT available_volume FROM listings WHERE id='produce-1'")).available_volume);
 const prompts=initRequests;
 const attempts=await Promise.all(Array.from({length:3},()=>call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'+265991112200',retry:true}})));
 assert.ok(attempts.every(attempt=>attempt.status===200&&attempt.data.existing_attempt));
 assert.equal(initRequests,prompts,'pending retries must not send another prompt');
 assert.equal((await db.get('SELECT provider_charge_id FROM guest_order_checkouts WHERE id=?',[placed.data.checkout_id])).provider_charge_id,started.data.charge_id);
 const cancelRes=await call(`/guest-orders/${placed.data.checkout_id}/cancel`,{body:{}});
 assert.equal(cancelRes.status,200);
 assert.equal(cancelRes.data.status,'Cancelled');
 assert.equal(Number((await db.get("SELECT available_volume FROM listings WHERE id='produce-1'")).available_volume),reserved+2);
 const checks=verifyRequests;
 await call(`/guest-orders/${placed.data.checkout_id}/payment-status`);
 assert.equal((await call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'+265991112200',retry:true}})).status,409);
 assert.equal(verifyRequests,checks,'cancelled checkout must not poll the provider');
 assert.equal(initRequests,prompts);
 // A provider may settle an already-sent request after local cancellation.
 verifyStatus='successful';
 const payload={data:{charge_id:started.data.charge_id}},signature=createHmac('sha256',process.env.PAYCHANGU_WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex');
 assert.equal((await call('/paychangu/webhook',{body:payload,headers:{signature}})).status,200);
 assert.equal((await call('/paychangu/webhook',{body:payload,headers:{signature}})).status,200);
 const late=await db.get('SELECT status,payment_status FROM guest_order_checkouts WHERE id=?',[placed.data.checkout_id]);
 assert.deepEqual({...late},{status:'Cancelled',payment_status:'paid'});
 assert.equal(Number((await db.get("SELECT available_volume FROM listings WHERE id='produce-1'")).available_volume),reserved+2);
 const admin=(await call('/auth/demo',{body:{role:'Admin'}})).cookie;
 assert.equal((await call('/admin/guest-orders',{cookie:admin})).data.find(order=>order.id===placed.data.checkout_id)?.refund_required,true);
 assert.equal((await call(`/admin/guest-orders/${placed.data.checkout_id}`,{method:'PATCH',body:{status:'Confirmed'},cookie:admin})).status,409);
});

test('mixed native currencies use a USD aggregate and one frozen MWK phone charge',async()=>{
 verifyStatus='pending';
 const native=await db.get("SELECT currency,price,price_minor FROM listings WHERE id='produce-2'");
 try{
  await db.run("UPDATE listings SET currency='USD',price=1,price_minor=100 WHERE id='produce-2'");
  const items=[{listing_id:'produce-1',quantity:2},{listing_id:'produce-2',quantity:1}];
  const quote=await call('/guest-orders/quote',{body:{items,payment_method:'paychangu_mobile_money'}});
  assert.equal(quote.status,200);assert.equal(quote.data.currency,'USD');
  assert.equal(quote.data.total_minor,101);
  assert.equal(quote.data.payable_minor,Math.round(25+2000/1.16)*100);
  const placed=await call('/guest-orders/basket',{body:{items,quote_token:quote.data.quote_token,contact_name:'Mixed Buyer',contact_phone:'+265991112297',contact_email:'mixed@example.com',delivery_location:'Lilongwe City',payment_method:'paychangu_mobile_money'}});
  assert.equal(placed.status,201);
  const initialized=await call('/paychangu/initialize',{body:{checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'+265991112200'}});
  assert.equal(initialized.status,201);assert.equal(initialized.data.amount,quote.data.mwk_total);
  verifyStatus='successful';
  const payload={data:{charge_id:initialized.data.charge_id}},signature=createHmac('sha256',process.env.PAYCHANGU_WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex');
  assert.equal((await call('/paychangu/webhook',{body:payload,headers:{signature}})).status,200);
  const admin=(await call('/auth/demo',{body:{role:'Admin'}})).cookie;
  const order=(await call('/admin/guest-orders',{cookie:admin})).data.find(row=>row.id===placed.data.checkout_id);
  assert.equal(order.total_minor,101);assert.equal(order.currency,'USD');assert.equal(order.status,'Confirmed');
  assert.deepEqual(order.items.map(item=>item.currency).sort(),['MWK','USD']);
 }finally{await db.run("UPDATE listings SET currency=?,price=?,price_minor=? WHERE id='produce-2'",[native.currency,native.price,native.price_minor]);}
});

test('manual Pay again checks expiry and sends exactly one replacement prompt',async()=>{
 verifyStatus='pending';
 const placed=await createCheckout('296');assert.equal(placed.status,201);
 const body={checkout_id:placed.data.checkout_id,operator_ref_id:'test-airtel',mobile:'+265991112200'};
 const start=await call('/paychangu/initialize',{body});assert.equal(start.status,201);
 const prompts=initRequests;
 verificationUnavailable=true;
 try{
  const unavailable=await call(`/guest-orders/${placed.data.checkout_id}/payment-status`);
  assert.equal(unavailable.data.payment_status,'pending');assert.match(unavailable.data.verification_error,/temporarily unavailable/);
  assert.equal((await call('/paychangu/initialize',{body:{...body,retry:true}})).status,502);
  assert.equal(initRequests,prompts,'an ambiguous provider response must not cause another charge');
 }finally{verificationUnavailable=false;}
 chargeStatuses.set(start.data.charge_id,'expired');
 const retries=await Promise.all([call('/paychangu/initialize',{body:{...body,retry:true}}),call('/paychangu/initialize',{body:{...body,retry:true}})]);
 assert.equal(retries.filter(result=>result.status===201).length,1);
 assert.equal(retries.filter(result=>result.data.existing_attempt).length,1);
 assert.equal(initRequests,prompts+1);
 assert.notEqual((await db.get('SELECT provider_charge_id FROM guest_order_checkouts WHERE id=?',[placed.data.checkout_id])).provider_charge_id,start.data.charge_id);
});
