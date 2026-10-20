import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';

process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.SQLITE_PATH=':memory:';process.env.CURRENCY='MWK';
process.env.PAYCHANGU_SECRET_KEY='test-provider-key';process.env.PAYCHANGU_WEBHOOK_SECRET='test-webhook-key';process.env.PAYCHANGU_TEST_MODE='true';
const originalFetch=globalThis.fetch;
const {app,db}=await import('./helpers/test-api.mjs').then(module=>module.loadTestApi());
const fallbackFetch=globalThis.fetch,amounts=new Map();
let prompts=0,providerStatus='pending',server,base,buyer,farmer,admin;
globalThis.fetch=async(input,options)=>{
 const url=String(input);
 if(url==='https://api.paychangu.com/mobile-money/')return Response.json({status:'success',data:[{ref_id:'airtel',name:'Airtel Money',supported_country:{currency:'MWK'}}]});
 if(url.endsWith('/mobile-money/payments/initialize')){const body=JSON.parse(options.body);prompts++;amounts.set(body.charge_id,body.amount);return Response.json({status:'success',data:{charge_id:body.charge_id}});}
 if(url.includes('/mobile-money/payments/')&&url.endsWith('/verify')){const id=url.split('/').at(-2);return Response.json({status:'success',data:{status:providerStatus,charge_id:id,currency:'MWK',amount:amounts.get(id),reference:'APPROVED-TEST'}});}
 return fallbackFetch(input,options);
};
async function call(path,{body,cookie,method}={}){
 const response=await originalFetch(base+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const terms={unit_price_minor:1250,currency:'MWK',sale_unit:'kg'};
async function request(extra={}){return call('/orders',{cookie:buyer,body:{listing_id:'produce-1',volume:100,delivery_location:'Lilongwe City',notes:'Deliver on Friday',...extra}});}
async function approve(id){return call('/orders/'+id,{cookie:farmer,method:'PATCH',body:{status:'Approved'}});}
before(async()=>{
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/api/v1`;
 buyer=(await call('/auth/demo',{body:{role:'Buyer'}})).cookie;farmer=(await call('/auth/demo',{body:{role:'Farmer'}})).cookie;admin=(await call('/auth/demo',{body:{role:'Admin'}})).cookie;
});
after(async()=>{globalThis.fetch=originalFetch;await new Promise(resolve=>server.close(resolve));await db.close();});

test('buyer commitment is explicit, price-bound and required before farmer or admin approval',async()=>{
 const stock=Number((await db.get("SELECT available_volume FROM listings WHERE id='produce-1'")).available_volume);
 const created=await request();assert.equal(created.status,201);const id=created.data.id;
 assert.equal((await request({volume:101,commit:true,terms})).status,400,'an unpayable fractional-MWK total must be rejected before commitment');
 const anotherBuyer=await call('/auth/register',{body:{name:'Another Buyer',phone:'+265991112234',password:'strong-test-password',role:'Buyer',country:'MW',region:'Lilongwe',locality:'Area 47',sms_opt_in:true}});
 assert.equal(anotherBuyer.status,201);
 assert.equal((await call('/orders/'+id+'/commit',{cookie:anotherBuyer.cookie,body:{acknowledge:true,terms}})).status,403);
 assert.equal((await call('/orders/'+id+'/quote',{cookie:anotherBuyer.cookie,body:{}})).status,403);
 assert.equal((await call('/orders/'+id+'/checkout',{cookie:anotherBuyer.cookie,body:{quote_token:'invalid',contact_email:'another@example.com'}})).status,403);
 assert.equal((await approve(id)).status,409);
 assert.equal((await call('/orders/'+id,{cookie:admin,method:'PATCH',body:{status:'Approved'}})).status,409);
 assert.equal((await call('/orders/'+id+'/quote',{cookie:buyer,body:{}})).status,409);
 assert.equal((await call('/orders/'+id+'/commit',{cookie:farmer,body:{acknowledge:true,terms}})).status,403);
 assert.equal((await call('/orders/'+id+'/commit',{cookie:buyer,body:{acknowledge:false,terms}})).status,400);
 assert.equal((await call('/orders/'+id+'/commit',{cookie:buyer,body:{acknowledge:true,terms:{...terms,unit_price_minor:1}}})).status,409);
 assert.equal((await call('/orders/'+id+'/commit',{cookie:buyer,body:{acknowledge:true,terms}})).status,200);
 const row=(await call('/orders',{cookie:buyer})).data.find(order=>order.id===id);
 assert.equal(row.status,'Committed');assert.ok(row.committed_at);assert.equal(row.committed_unit_price_minor,1250);
 assert.equal((await approve(id)).status,200);
 assert.equal(Number((await db.get("SELECT available_volume FROM listings WHERE id='produce-1'")).available_volume),stock,'commitment and approval must not hold unpaid stock');
 assert.equal(prompts,0);
 assert.equal((await call('/orders/'+id+'/withdraw',{cookie:buyer,body:{}})).status,409);
});

test('approved bulk requests use agreed prices, one checkout reservation and verified payment',async()=>{
 const created=await request({commit:true,terms});assert.equal(created.status,201);const id=created.data.id;
 assert.equal(created.data.status,'Committed');assert.equal((await approve(id)).status,200);
 const original=await db.get("SELECT price,price_minor,available_volume FROM listings WHERE id='produce-1'");
 try{
  await db.run("UPDATE listings SET price=99,price_minor=9900 WHERE id='produce-1'");
  const quote=await call('/orders/'+id+'/quote',{cookie:buyer,body:{}});assert.equal(quote.status,200);assert.equal(quote.data.mwk_total,1250);
  const body={quote_token:quote.data.quote_token,contact_email:'buyer@example.com'};
  assert.equal((await call('/orders/'+id+'/checkout',{cookie:farmer,body})).status,403);
  await db.run("UPDATE farmer_profiles SET verification_status='Unverified' WHERE id='farm-1'");
  try{assert.equal((await call('/orders/'+id+'/checkout',{cookie:buyer,body})).status,409);}
  finally{await db.run("UPDATE farmer_profiles SET verification_status='Verified' WHERE id='farm-1'");}
  const attempts=await Promise.all([call('/orders/'+id+'/checkout',{cookie:buyer,body}),call('/orders/'+id+'/checkout',{cookie:buyer,body})]);
  assert.ok(attempts.every(result=>result.status===201));assert.equal(attempts[0].data.checkout_id,attempts[1].data.checkout_id);
  const checkout=attempts[0].data;
  assert.equal(checkout.mwk_total,1250);assert.equal(checkout.order_request_id,id);
  assert.equal(Number((await db.get("SELECT available_volume FROM listings WHERE id='produce-1'")).available_volume),Number(original.available_volume)-100);
  assert.equal(prompts,0,'displaying or creating checkout must not send a phone request');
  assert.equal((await call('/payments',{cookie:buyer,body:{order_id:id,amount:1,currency:'MWK',method:'malawian_bank',provider:'manual',account_or_phone:'123456'}})).status,409);
  const initialized=await call('/paychangu/initialize',{body:{checkout_id:checkout.checkout_id,operator_ref_id:'airtel',mobile:'+265991112200'}});assert.equal(initialized.status,201);assert.equal(prompts,1);
  assert.equal((await call('/admin/guest-orders',{cookie:admin})).data.some(order=>order.id===checkout.checkout_id),false);
  assert.equal((await call('/orders',{cookie:buyer})).data.find(order=>order.id===id).payment_status,'unpaid');
  providerStatus='successful';
  const payload={data:{charge_id:initialized.data.charge_id}},signature=createHmac('sha256',process.env.PAYCHANGU_WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex');
  assert.equal((await call('/paychangu/webhook',{body:payload,method:'POST',cookie:null,headers:{}})).status,401);
  const response=await originalFetch(base+'/paychangu/webhook',{method:'POST',headers:{'Content-Type':'application/json',signature},body:JSON.stringify(payload)});assert.equal(response.status,200);
  const paid=(await call('/orders',{cookie:buyer})).data.find(order=>order.id===id);
  assert.equal(paid.payment_status,'paid');assert.equal(paid.status,'Confirmed');assert.equal(paid.amount_paid,1250);
  assert.equal((await call('/payments/'+id,{cookie:buyer})).data.length,1);
  assert.equal((await call('/admin/guest-orders',{cookie:admin})).data.some(order=>order.id===checkout.checkout_id),true);
  assert.equal((await call('/orders/'+id,{cookie:farmer,method:'PATCH',body:{status:'Closed'}})).status,200);
 }finally{await db.run("UPDATE listings SET price=?,price_minor=? WHERE id='produce-1'",[original.price,original.price_minor]);}
});

test('withdrawn requests cannot be approved and cancelled checkout restores only the approved request',async()=>{
 providerStatus='pending';
 const withdrawn=await request({commit:true,terms});const id=withdrawn.data.id;
 assert.equal((await call('/orders/'+id+'/withdraw',{cookie:buyer,body:{}})).status,200);assert.equal((await approve(id)).status,409);
 const created=await request({commit:true,terms});const approvedId=created.data.id;await approve(approvedId);
 const before=Number((await db.get("SELECT available_volume FROM listings WHERE id='produce-1'")).available_volume);
 const quote=await call('/orders/'+approvedId+'/quote',{cookie:buyer,body:{}});
 const checkout=await call('/orders/'+approvedId+'/checkout',{cookie:buyer,body:{quote_token:quote.data.quote_token,contact_email:'buyer@example.com'}});
 const cancel=await call('/guest-orders/'+checkout.data.checkout_id+'/cancel',{body:{}});assert.equal(cancel.status,200);assert.equal(cancel.data.order_request_id,approvedId);
 assert.equal(Number((await db.get("SELECT available_volume FROM listings WHERE id='produce-1'")).available_volume),before);
 assert.equal((await call('/orders',{cookie:buyer})).data.find(order=>order.id===approvedId).status,'Approved');
 assert.equal((await call('/guest-orders/'+checkout.data.checkout_id+'/payment-status')).data.order_request_id,approvedId);
});
