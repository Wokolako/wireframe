import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
process.env.NODE_ENV='test';process.env.CURRENCY='MWK';process.env.SQLITE_PATH=':memory:';process.env.TWILIO_AUTH_TOKEN='test-token-not-a-secret';process.env.TWILIO_WEBHOOK_URL='https://wirefen.test/api/v1/webhooks/sms/receive';process.env.PAYCHANGU_SECRET_KEY='test-paychangu-secret';process.env.PAYCHANGU_WEBHOOK_SECRET='test-webhook-secret';process.env.PAYCHANGU_TEST_MODE='true';
const {app}=await import('../server/index.mjs');const {db}=await import('../server/db.mjs');const twilio=(await import('twilio')).default;
let server,base;before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api/v1`;});after(async()=>{await new Promise(r=>server.close(r));await db.close();});
async function call(path,{body,method,cookie,headers}={}){const r=await fetch(base+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const demo=async role=>(await call('/auth/demo',{body:{role}})).cookie;
test('public catalogue filters preserve numeric, category, and preservative semantics',async()=>{const all=await call('/listings');assert.equal(all.status,200);assert.equal(all.data.length,6);const filtered=await call('/listings?category=Grains&min_volume=10000&max_volume=20000&preservative=false');assert.equal(filtered.data.length,1);assert.equal(filtered.data[0].crop_category,'Grains');assert.equal((await call('/listings?min_volume=100&max_volume=2')).status,400);assert.equal((await call('/listings?harvest_date_after=nonsense')).status,400);});
test('registration enforces E.164, unique phone, explicit consent, and safe public roles',async()=>{const v={name:'Test Grower',phone:'+27821111111',password:'test-long-password',role:'Farmer',sms_opt_in:true};assert.equal((await call('/auth/register',{body:{...v,phone:'0821111111'}})).status,400);assert.equal((await call('/auth/register',{body:{...v,role:'Admin'}})).status,400);const r=await call('/auth/register',{body:v});assert.equal(r.status,201);assert.ok(r.cookie);assert.ok(r.data.farmer.id);assert.equal((await call('/auth/register',{body:v})).status,409);const consent=await db.get('SELECT * FROM sms_consents WHERE user_id=?',[r.data.id]);assert.equal(consent.opted_in,1);assert.ok(consent.recorded_at);const login=await call('/auth/login',{body:{phone:v.phone,password:v.password}});assert.equal(login.status,200);assert.equal((await call('/auth/login',{body:{phone:v.phone,password:'incorrect'}})).status,401);});
test('RBAC and owner checks prevent unauthorized reads and writes',async()=>{assert.equal((await call('/farmers/farm-1/baseline')).status,401);const buyer=await demo('Buyer'),farmer=await demo('Farmer');assert.equal((await call('/farmers/farm-1/baseline',{cookie:buyer})).status,403);assert.equal((await call('/farmers/farm-2/baseline',{cookie:farmer})).status,403);assert.equal((await call('/farmers',{cookie:farmer})).status,403);assert.equal((await call('/listings',{cookie:buyer,body:{}})).status,403);const admin=await demo('Admin');assert.equal((await call('/farmers',{cookie:admin})).status,200);});
test('baseline PATCH preserves earlier fields and only completes validated data',async()=>{const cookie=await demo('Farmer');assert.equal((await call('/farmers/farm-1/baseline',{cookie,method:'PATCH',body:{crop_type:'Tomatoes',avg_land_size:12,status:'draft'}})).status,200);assert.equal((await call('/farmers/farm-1/baseline',{cookie,method:'PATCH',body:{avg_yield_per_acre:3500}})).data.crop_type,'Tomatoes');assert.equal((await call('/farmers/farm-1/baseline',{cookie,method:'PATCH',body:{status:'complete'}})).status,400);const final=await call('/farmers/farm-1/baseline',{cookie,method:'PATCH',body:{avg_duration_days:90,avg_production_cost:10000,status:'complete'}});assert.equal(final.data.status,'complete');assert.equal(final.data.avg_land_size,12);});
test('listing drafts support partial server saves with ownership enforcement',async()=>{const cookie=await demo('Farmer');await call('/farmers/farm-1/listing-draft',{cookie,method:'PATCH',body:{title:'Draft tomatoes'}});const update=await call('/farmers/farm-1/listing-draft',{cookie,method:'PATCH',body:{price:'12'}});assert.equal(update.data.title,'Draft tomatoes');assert.equal((await call('/farmers/farm-2/listing-draft',{cookie})).status,403);});
test('listings validate dates, volumes, and farm ownership',async()=>{const cookie=await demo('Farmer');const v={farmer_id:'farm-1',title:'Fresh carrots',crop_category:'Vegetables',available_volume:300,price:12,harvest_date:'2099-01-01',expiration_date:'2099-01-10',shelf_life_days:9,preservative_used:false};assert.equal((await call('/listings',{cookie,body:{...v,farmer_id:'farm-2'}})).status,403);assert.equal((await call('/listings',{cookie,body:{...v,available_volume:-1}})).status,400);assert.equal((await call('/listings',{cookie,body:{...v,expiration_date:'2098-12-01'}})).status,400);assert.equal((await call('/listings',{cookie,body:v})).status,201);});
test('buyer inquiry is persisted and admin can progress its status',async()=>{const cookie=await demo('Buyer');const body={listing_id:'produce-1',volume:100,delivery_location:'Johannesburg',notes:'Collection preferred'};assert.equal((await call('/orders',{cookie,body:{...body,volume:100000}})).status,400);const create=await call('/orders',{cookie,body});assert.equal(create.status,201);assert.equal((await call('/orders/'+create.data.id,{cookie,method:'PATCH',body:{status:'Closed'}})).status,403);const admin=await demo('Admin');assert.equal((await call('/orders/'+create.data.id,{cookie:admin,method:'PATCH',body:{status:'Contacted'}})).status,200);assert.equal((await call('/orders',{cookie})).data[0].status,'Contacted');});
test('sample marketplace data cannot initiate a real payment',async()=>{const setting=process.env.PAYCHANGU_TEST_MODE;delete process.env.PAYCHANGU_TEST_MODE;try{const cookie=await demo('Buyer');const result=await call('/paychangu/initialize',{cookie,body:{items:[{listing_id:'produce-1',quantity:1}],operator_ref_id:'test-operator',mobile:'+265991234567',email:'buyer@example.test',expected_total:1250}});assert.equal(result.status,503);assert.match(result.data.error,/sample marketplace data/);}finally{if(setting!==undefined)process.env.PAYCHANGU_TEST_MODE=setting;}});
test('PayChangu initialization reports provider rejection details without exposing credentials',async()=>{
 const originalFetch=globalThis.fetch,originalConsoleError=console.error;let initBody,authorization,loggedError,initializeCount=0;
 globalThis.fetch=async(input,init)=>{
  if(String(input)==='https://api.paychangu.com/mobile-money/')return new Response(JSON.stringify({status:'success',data:[{name:'Test Money',ref_id:'test-operator',supported_country:{currency:'MWK'}}]}),{status:200});
  if(String(input)==='https://api.paychangu.com/mobile-money/payments/initialize'){
   initBody=JSON.parse(init.body);authorization=init.headers.Authorization;initializeCount++;
   const body=initializeCount===1
    ?{status:'failed',data:{errors:{mobile:['Phone number +265991234567 for buyer@example.test is invalid.']}}}
    :{status:'failed',data:null};
   return new Response(JSON.stringify(body),{status:400});
  }
  return originalFetch(input,init);
 };
 console.error=(...args)=>{loggedError=args;};
 try{
  const cookie=await demo('Buyer');
  const result=await call('/paychangu/initialize',{cookie,body:{items:[{listing_id:'produce-1',quantity:1}],operator_ref_id:'test-operator',mobile:'+265991234567',email:'buyer@example.test',expected_total:1250}});
  assert.equal(result.status,502);assert.match(result.data.error,/mobile: Phone number \[redacted phone\] for \[redacted email\] is invalid/);assert.doesNotMatch(result.data.error,/\+265991234567|buyer@example\.test/);
  assert.ok(loggedError);assert.equal(loggedError[1].reason,result.data.error.replace('PayChangu rejected the payment request: ',''));
  assert.doesNotMatch(JSON.stringify(loggedError),/\+265991234567|buyer@example\.test|test-paychangu-secret/);
  assert.equal(authorization,'Bearer test-paychangu-secret');
  assert.deepEqual(Object.keys(initBody).sort(),['amount','charge_id','email','first_name','last_name','mobile','mobile_money_operator_ref_id'].sort());
  assert.equal(initBody.amount,'1250');assert.equal(initBody.mobile_money_operator_ref_id,'test-operator');
  const order=await db.get('SELECT status FROM purchase_orders WHERE provider_charge_id=?',[initBody.charge_id]);assert.equal(order.status,'failed');
  const second=await call('/paychangu/initialize',{cookie,body:{items:[{listing_id:'produce-1',quantity:1}],operator_ref_id:'test-operator',mobile:'+265991234567',email:'buyer@example.test',expected_total:1250}});
  assert.equal(second.status,502);assert.match(second.data.error,/HTTP 400; response fields: status, data/);
 }finally{globalThis.fetch=originalFetch;console.error=originalConsoleError;}
});
test('cross-origin writes and revoked sessions are rejected',async()=>{const cookie=await demo('Buyer');assert.equal((await call('/account/consent',{cookie,method:'PATCH',body:{sms_opt_in:true},headers:{Origin:'https://attacker.example'}})).status,403);await call('/auth/logout',{cookie,body:{}});assert.equal((await call('/orders',{cookie})).status,401);});
test('SMS rejects forged signatures, records STOP/START, routes yield, and deduplicates',async()=>{async function sms(body,signed=true){const params={From:'+27820000001',MessageSid:'SM'+Math.random(),...body};const signature=twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN,process.env.TWILIO_WEBHOOK_URL,params);const r=await fetch(base+'/webhooks/sms/receive',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':signed?signature:'forged'},body:new URLSearchParams(params)});return{status:r.status,text:await r.text()};}assert.equal((await sms({Body:'START'},false)).status,403);assert.match((await sms({Body:'START'})).text,/enabled/);assert.match((await sms({Body:'BASELINE'})).text,/kilograms/);assert.match((await sms({Body:'invalid'})).text,/positive/);const sid='SM-dedup';assert.match((await sms({Body:'500',MessageSid:sid})).text,/saved/);assert.equal((await db.get('SELECT avg_yield_per_acre FROM historical_baselines WHERE farmer_id=?',['farm-1'])).avg_yield_per_acre,500);assert.doesNotMatch((await sms({Body:'500',MessageSid:sid})).text,/<Message>/);assert.match((await sms({Body:'STOP'})).text,/stopped/);assert.equal((await db.get('SELECT sms_opt_in FROM users WHERE id=?',['farmer-1'])).sms_opt_in,0);});
test('Appendix B: Form 1 Guided Breakdown automatically aggregates costs via API and SMS',async()=>{
 const cookie=await demo('Farmer');
 const r=await call('/farmers/farm-1/baseline',{cookie,method:'PATCH',body:{cost_fertilizer_seeds:4000,cost_labor:5000,cost_processing:3000,cost_transportation:2000}});
 assert.equal(r.status,200);
 assert.equal(r.data.cost_fertilizer_seeds,4000);
 assert.equal(r.data.cost_labor,5000);
 assert.equal(r.data.cost_processing,3000);
 assert.equal(r.data.cost_transportation,2000);
 assert.equal(r.data.avg_production_cost,14000);

 async function sms(body){
  const params={From:'+27820000001',MessageSid:'SM'+Math.random(),...body};
  const signature=twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN,process.env.TWILIO_WEBHOOK_URL,params);
  const resp=await fetch(base+'/webhooks/sms/receive',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':signature},body:new URLSearchParams(params)});
  return{status:resp.status,text:await resp.text()};
 }
 await sms({Body:'START'});
 const q1=await sms({Body:'COST'});
 assert.match(q1.text,/Fertilizer and Seeds/i);
 const q2=await sms({Body:'4500'});
 assert.match(q2.text,/Labor/i);
 const q3=await sms({Body:'5500'});
 assert.match(q3.text,/Processing/i);
 const q4=await sms({Body:'3000'});
 assert.match(q4.text,/Transportation/i);
 const qFinal=await sms({Body:'2000'});
 assert.match(qFinal.text,/Total Estimated Cost: MWK 15000/);
 const saved=await db.get('SELECT * FROM historical_baselines WHERE farmer_id=?',['farm-1']);
 assert.equal(saved.cost_fertilizer_seeds,4500);
 assert.equal(saved.cost_labor,5500);
 assert.equal(saved.cost_processing,3000);
 assert.equal(saved.cost_transportation,2000);
 assert.equal(saved.avg_production_cost,15000);
});

test('PayChangu verifies the server-priced MWK order before one-time stock fulfillment',async()=>{
 const originalFetch=globalThis.fetch;
 let initializedBody,verifiedAmount;
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url==='https://api.paychangu.com/mobile-money/')return new Response(JSON.stringify({status:'success',data:[{name:'Test Money',ref_id:'test-operator',supported_country:{name:'Malawi',currency:'MWK'}}]}),{status:200});
  if(url==='https://api.paychangu.com/mobile-money/payments/initialize'){initializedBody=JSON.parse(init.body);return new Response(JSON.stringify({status:'success',data:{charge_id:initializedBody.charge_id}}),{status:200});}
  if(url.startsWith('https://api.paychangu.com/mobile-money/payments/')&&url.endsWith('/verify'))return new Response(JSON.stringify({status:'success',data:{status:'success',charge_id:decodeURIComponent(url.split('/').at(-2)),amount:verifiedAmount,currency:'MWK',ref_id:'verified-ref'}}),{status:200});
  return originalFetch(input,init);
 };
 try{
  const cookie=await demo('Buyer'),before=Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-1'])).available_volume);
  const stale=await call('/paychangu/initialize',{cookie,body:{items:[{listing_id:'produce-1',quantity:10}],operator_ref_id:'test-operator',mobile:'+265991234567',email:'buyer@example.test',expected_total:12501}});
  assert.equal(stale.status,409);assert.equal(stale.data.amount,12500);
  const start=await call('/paychangu/initialize',{cookie,body:{items:[{listing_id:'produce-1',quantity:10}],operator_ref_id:'test-operator',mobile:'+265991234567',email:'buyer@example.test',expected_total:12500}});
  assert.equal(start.status,201);assert.equal(start.data.currency,'MWK');assert.equal(start.data.amount,12500);assert.equal(initializedBody.amount,'12500');assert.equal(initializedBody.mobile,'991234567');
  assert.equal(Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-1'])).available_volume),before);
  const order=await db.get('SELECT status,mobile FROM purchase_orders WHERE id=?',[start.data.order_id]);assert.equal(order.status,'pending');assert.equal(order.mobile,'+265991234567');
  verifiedAmount=12500;
  const verified=await call('/paychangu/verify?charge_id='+encodeURIComponent(start.data.charge_id),{cookie});
  assert.equal(verified.status,200);assert.equal(verified.data.status,'paid');
  const settled=await db.get('SELECT status FROM purchase_orders WHERE id=?',[start.data.order_id]);assert.equal(settled.status,'paid');
  assert.equal(Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-1'])).available_volume),before-10);
  await call('/paychangu/verify?charge_id='+encodeURIComponent(start.data.charge_id),{cookie});
  assert.equal(Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-1'])).available_volume),before-10);
  const full=await call('/paychangu/initialize',{cookie,body:{items:[{listing_id:'produce-3',quantity:1800}],operator_ref_id:'test-operator',mobile:'+265991234567',email:'buyer@example.test',expected_total:5040000}});
  assert.equal(full.status,201);verifiedAmount=5040000;
  const fullVerified=await call('/paychangu/verify?charge_id='+encodeURIComponent(full.data.charge_id),{cookie});
  assert.equal(fullVerified.data.status,'paid');
  const soldOut=await db.get('SELECT available_volume,status FROM listings WHERE id=?',['produce-3']);
  assert.equal(Number(soldOut.available_volume),0);assert.equal(soldOut.status,'sold_out');
 }finally{globalThis.fetch=originalFetch;}
});

test('PayChangu rejects forged webhook signatures without changing listing stock',async()=>{
 const before=Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-2'])).available_volume);
 const body={charge_id:'not-a-real-order',status:'success'},raw=JSON.stringify(body);
 const forged=await fetch(base+'/paychangu/webhook',{method:'POST',headers:{'Content-Type':'application/json',Signature:'forged'},body:raw});
 assert.equal(forged.status,401);
 const signed=createHmac('sha256','test-webhook-secret').update(raw).digest('hex');
 const valid=await fetch(base+'/paychangu/webhook',{method:'POST',headers:{'Content-Type':'application/json',Signature:signed,Origin:'https://provider.example'},body:raw});
 assert.equal(valid.status,200);
 assert.equal(Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-2'])).available_volume),before);
});
