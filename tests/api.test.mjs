import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
process.env.NODE_ENV='test';process.env.SQLITE_PATH=':memory:';process.env.TWILIO_AUTH_TOKEN='test-token-not-a-secret';process.env.TWILIO_WEBHOOK_URL='https://wirefen.test/api/v1/webhooks/sms/receive';process.env.USSD_WEBHOOK_SECRET='test-ussd-secret';
const {app,db}=await import('./helpers/test-api.mjs').then(module=>module.loadTestApi());const twilio=(await import('twilio')).default;
let server,base;before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api/v1`;});after(async()=>{await new Promise(r=>server.close(r));await db.close();});
async function call(path,{body,method,cookie,headers}={}){const verb=method||(body?'POST':'GET');const checkout=verb==='POST'&&path.startsWith('/guest-orders')?{'Idempotency-Key':randomUUID()}:{};const r=await fetch(base+path,{method:verb,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...checkout,...headers},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const demo=async role=>(await call('/auth/demo',{body:{role}})).cookie;
test('public catalogue exposes paginated verified produce without supplier or stock data',async()=>{const all=await call('/listings');assert.equal(all.status,200);assert.equal(all.data.items.length,4);assert.equal(all.data.total,4);const filtered=await call('/listings?category=Grains&preservative=false');assert.equal(filtered.data.items.length,1);assert.equal(filtered.data.items[0].crop_category,'Grains');for(const item of all.data.items)for(const key of ['farm_name','location','available_volume','farmer_id','country','region','sustainability_badge'])assert.equal(key in item,false);assert.equal(all.data.items[0].farm_verified,true);assert.equal(all.data.items[0].harvest_inspected,false);assert.equal((await call('/listings?min_volume=100')).status,400);assert.equal((await call('/listings?harvest_date_after=nonsense')).status,400);});
test('spreadsheet limits govern guest checkout and private admin stock reporting',async()=>{
 const tomato=(await call('/listings/produce-1')).data;
 assert.equal(tomato.guest_limit.max,2);
 assert.equal(tomato.guest_limit.unit,'kg');
 const body={listing_id:'produce-1',quantity:2,contact_name:'Guest Buyer',contact_phone:'+265991112200',contact_email:'guest@example.com',delivery_location:'Lilongwe city'};
 assert.equal((await call('/guest-orders',{body})).status,201);
 assert.equal((await call('/guest-orders',{body:{...body,quantity:0.5}})).status,409);
 assert.equal((await call('/guest-orders',{body:{...body,quantity:2.1}})).status,409);
 assert.equal((await call('/guest-orders',{body:{...body,listing_id:'produce-2',quantity:25}})).status,201);
 assert.equal((await call('/guest-orders',{body:{...body,listing_id:'produce-2',quantity:25.1}})).status,409);
 assert.equal((await call('/guest-orders',{body:{...body,listing_id:'produce-4',quantity:1}})).status,404);
 assert.equal((await call('/admin/listings')).status,401);
 const admin=await demo('Admin');const report=await call('/admin/listings?country_code=ZA&region=Capricorn%20District',{cookie:admin});
 assert.equal(report.status,200);assert.ok(report.data.listings.some(l=>l.farm_name==='Mokoena Family Farm'&&l.available_volume>0));
 assert.ok(report.data.total_available_kg>0);
 assert.equal((await call('/admin/guest-orders',{cookie:admin})).data.length,2);
});
test('basket checkout enforces per-produce limits and reserves stock atomically',async()=>{
 const body={items:[{listing_id:'produce-1',quantity:1},{listing_id:'produce-2',quantity:2}],contact_name:'Basket Buyer',contact_phone:'+265991112250',contact_email:'basket@example.com',delivery_location:'Lilongwe city'};
 const before=Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-1'])).available_volume);
 assert.equal((await call('/guest-orders/basket',{body:{...body,items:[{listing_id:'produce-1',quantity:3},body.items[1]]}})).status,409);
 assert.equal((await db.get('SELECT COUNT(*) AS count FROM guest_orders WHERE contact_phone=?',[body.contact_phone])).count,0);
 const placed=await call('/guest-orders/basket',{body});assert.equal(placed.status,201);assert.equal(placed.data.ids.length,2);
 const admin=await demo('Admin');
 assert.equal(placed.data.payment_method,'paychangu_mobile_money');
 const stored=await db.get('SELECT payment_method,payment_status,unit_price,currency FROM guest_orders WHERE id=?',[placed.data.ids[0]]);
 assert.equal(stored.payment_method,'paychangu_mobile_money');assert.equal(stored.payment_status,'unpaid');assert.ok(Number(stored.unit_price)>0);assert.ok(stored.currency);
 assert.equal(placed.data.status,'Confirmed');
 assert.equal(Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-1'])).available_volume),before-1);
 assert.equal((await call('/guest-orders/basket',{body:{...body,items:[{listing_id:'produce-1',quantity:1.1},body.items[1]]}})).status,409);
 const stockAfter=Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-2'])).available_volume);
 assert.equal((await call('/admin/guest-orders/'+placed.data.checkout_id,{cookie:admin,method:'PATCH',body:{status:'Confirmed'}})).status,200);
 assert.equal(Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-1'])).available_volume),before-1);
 assert.equal(Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-2'])).available_volume),stockAfter);
 assert.equal((await call('/admin/guest-orders/'+placed.data.checkout_id,{cookie:admin,method:'PATCH',body:{status:'Cancelled'}})).status,200);
 assert.equal(Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-1'])).available_volume),before);
 const paidCheckout=await call('/guest-orders/basket',{body:{...body,contact_name:'Second Basket',contact_phone:'0881522474',contact_email:'secondbasket@example.com'}});
 assert.equal(paidCheckout.status,201);
 const checkoutRow=await db.get('SELECT contact_phone FROM guest_order_checkouts WHERE id=?',[paidCheckout.data.checkout_id]);
 assert.equal(checkoutRow.contact_phone,'+265881522474');
 assert.equal((await call('/admin/guest-orders/'+paidCheckout.data.checkout_id,{cookie:admin,method:'PATCH',body:{status:'Confirmed'}})).status,200);
 assert.equal((await call('/admin/guest-orders/'+placed.data.checkout_id+'/collect-payment',{body:{}})).status,401);
 assert.equal((await call('/admin/guest-orders/'+paidCheckout.data.checkout_id+'/collect-payment',{cookie:admin,body:{}})).status,200);
 assert.equal((await db.get('SELECT payment_status FROM guest_orders WHERE id=?',[paidCheckout.data.ids[1]])).payment_status,'paid');
 assert.equal((await call('/admin/guest-orders/'+paidCheckout.data.checkout_id+'/collect-payment',{cookie:admin,body:{}})).status,409);
 assert.equal((await call('/admin/guest-orders/'+paidCheckout.data.checkout_id,{cookie:admin,method:'PATCH',body:{status:'Cancelled'}})).status,409);
 const bankOrder=await call('/guest-orders/basket',{body:{...body,contact_name:'Bank Buyer',contact_phone:'0881522474',contact_email:'bankbuyer@example.com',payment_method:'malawian_bank'}});
 assert.equal(bankOrder.status,201);
 assert.equal(bankOrder.data.payment_method,'malawian_bank');
});
test('guest checkout uses count units from the spreadsheet for verified produce',async()=>{
 const avocado=(await call('/listings/produce-3')).data;
 assert.equal(avocado.title,'Avocados');
 assert.equal(avocado.produce_id,'crop-037');
 assert.equal(avocado.sale_unit,'fruits');
 assert.deepEqual(avocado.guest_limit,{id:'crop-037',category:'Fruits',name:'Avocados',max:14,unit:'fruits'});
 const placed=await call('/guest-orders',{body:{listing_id:'produce-3',quantity:14,contact_name:'Fruit Buyer',contact_phone:'+265991112251',contact_email:'fruit@example.com',delivery_location:'Lilongwe city'}});
 assert.equal(placed.status,201);
 assert.equal((await db.get('SELECT quantity_unit FROM guest_orders WHERE id=?',[placed.data.id])).quantity_unit,'fruits');
 assert.equal((await call('/guest-orders',{body:{listing_id:'produce-3',quantity:0.5,contact_name:'Fraction Buyer',contact_phone:'+265991112252',contact_email:'fraction@example.com',delivery_location:'Lilongwe city'}})).status,400);
});
test('bulk requests require a buyer account and USSD writes require a provider secret',async()=>{
 const body={frequency:'recurring',produce_type:'Roma tomatoes',target_quantity:1,quantity_unit:'tonnes',delivery_dates:'November 2026',target_price:12,contact_name:'Buyer Name',contact_phone:'+265991112201',contact_email:'buyer@example.com'};
 assert.equal((await call('/bulk-orders',{body})).status,401);
 const buyer=await demo('Buyer');assert.equal((await call('/bulk-orders',{cookie:buyer,body})).status,201);
 assert.equal((await call('/bulk-orders',{cookie:buyer})).data.length,1);
 const agent=await demo('Agent');assert.equal((await call('/bulk-orders',{cookie:agent})).status,403);
 const costBefore=await db.get("SELECT * FROM financial_estimates WHERE farmer_id='farm-1'");
 assert.equal((await call('/ussd/simulate',{body:{phoneNumber:'+27820000001',text:'2*1*2*3*4'}})).status,401);
 const unsigned=await fetch(base+'/webhooks/ussd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:'+27820000001',text:'2*1*2*3*4'})});
 assert.equal(unsigned.status,403);
 assert.deepEqual(await db.get("SELECT * FROM financial_estimates WHERE farmer_id='farm-1'"),costBefore);
});
test('SMS farmer registration refuses missing standardized location fields',async()=>{
 const params={From:'+265991112299',MessageSid:'SM-missing-geo',Body:'JOIN FARMER Missing Location'};
 const signature=twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN,process.env.TWILIO_WEBHOOK_URL,params);
 const response=await fetch(base+'/webhooks/sms/receive',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':signature},body:new URLSearchParams(params)});
 assert.equal(response.status,200);assert.match(await response.text(),/All location fields are required/);
 assert.equal(await db.get('SELECT id FROM users WHERE phone=?',[params.From]),undefined);
});
test('registration enforces E.164, unique phone, explicit consent, and safe public roles',async()=>{const v={name:'Test Grower',phone:'+27821111111',password:'test-long-password',role:'Farmer',country:'ZA',region:'Test Region',locality:'Ward 12',sms_opt_in:true};assert.equal((await call('/auth/register',{body:{...v,phone:'0821111111'}})).status,400);assert.equal((await call('/auth/register',{body:{...v,role:'Admin'}})).status,400);const r=await call('/auth/register',{body:v});assert.equal(r.status,201);assert.ok(r.cookie);assert.ok(r.data.farmer.id);assert.equal((await call('/auth/register',{body:v})).status,409);const consent=await db.get('SELECT * FROM sms_consents WHERE user_id=?',[r.data.id]);assert.equal(consent.opted_in,1);assert.ok(consent.recorded_at);const login=await call('/auth/login',{body:{phone:v.phone,password:v.password}});assert.equal(login.status,200);assert.equal((await call('/auth/login',{body:{phone:v.phone,password:'incorrect'}})).status,401);});
test('RBAC and owner checks prevent unauthorized reads and writes',async()=>{assert.equal((await call('/farmers/farm-1/baseline')).status,401);const buyer=await demo('Buyer'),farmer=await demo('Farmer');assert.equal((await call('/farmers/farm-1/baseline',{cookie:buyer})).status,403);assert.equal((await call('/farmers/farm-2/baseline',{cookie:farmer})).status,403);assert.equal((await call('/farmers',{cookie:farmer})).status,403);assert.equal((await call('/listings',{cookie:buyer,body:{}})).status,403);const admin=await demo('Admin');assert.equal((await call('/farmers',{cookie:admin})).status,200);});
test('baseline PATCH preserves earlier fields and only completes validated data',async()=>{const cookie=await demo('Farmer');assert.equal((await call('/farmers/farm-1/baseline',{cookie,method:'PATCH',body:{crop_type:'Tomatoes',avg_land_size:12,status:'draft'}})).status,200);assert.equal((await call('/farmers/farm-1/baseline',{cookie,method:'PATCH',body:{avg_yield_per_acre:3500}})).data.crop_type,'Tomatoes');assert.equal((await call('/farmers/farm-1/baseline',{cookie,method:'PATCH',body:{status:'complete'}})).status,400);const final=await call('/farmers/farm-1/baseline',{cookie,method:'PATCH',body:{avg_duration_days:90,cost_fertilizer_seeds:4000,cost_labor:3000,cost_processing:2000,cost_transportation:1000,status:'complete'}});assert.equal(final.data.status,'complete');assert.equal(final.data.avg_land_size,12);});
test('listing drafts preserve catalogue identity and all catalogue categories',async()=>{const cookie=await demo('Farmer');await call('/farmers/farm-1/listing-draft',{cookie,method:'PATCH',body:{produce_id:'crop-044',crop_category:'Beverages & Nuts',title:'Draft coffee'}});const update=await call('/farmers/farm-1/listing-draft',{cookie,method:'PATCH',body:{price:'12'}});assert.equal(update.data.title,'Draft coffee');assert.equal(update.data.produce_id,'crop-044');assert.equal(update.data.crop_category,'Beverages & Nuts');assert.equal((await call('/farmers/farm-2/listing-draft',{cookie})).status,403);});
test('listings validate dates, stable produce identity, volumes, and farm ownership',async()=>{const cookie=await demo('Farmer');const v={farmer_id:'farm-1',produce_id:'crop-031',title:'Fresh green peppers',crop_category:'Vegetables',available_volume:300,sale_unit:'kg',price:12,harvest_date:'2099-01-01',expiration_date:'2099-01-10',shelf_life_days:9,preservative_used:false};assert.equal((await call('/listings',{cookie,body:{...v,farmer_id:'farm-2'}})).status,403);assert.equal((await call('/listings',{cookie,body:{...v,available_volume:-1}})).status,400);assert.equal((await call('/listings',{cookie,body:{...v,expiration_date:'2098-12-01'}})).status,400);assert.equal((await call('/listings',{cookie,body:{...v,produce_id:'crop-033'}})).status,400);assert.equal((await call('/listings',{cookie,body:v})).status,201);});
test('public listing text cannot expose a supplier name or origin',async()=>{
 const farmer=await demo('Farmer');
 const body={farmer_id:'farm-1',produce_id:'crop-024',title:'Mokoena Family Farm Limpopo tomatoes',crop_category:'Vegetables',available_volume:50,sale_unit:'kg',price:12,harvest_date:'2099-01-01',expiration_date:'2099-01-10',shelf_life_days:9,preservative_used:false,description:'Grown at Mokoena Family Farm in Limpopo.'};
 const created=await call('/listings',{cookie:farmer,body});assert.equal(created.status,201);
 const publicView=await call('/listings/'+created.data.id);assert.equal(publicView.status,200);
 assert.equal(publicView.data.title,'Tomatoes');
 assert.doesNotMatch(JSON.stringify(publicView.data),/Mokoena|Limpopo|available_volume|farm_name/i);
 assert.equal((await call('/listings?search=Mokoena')).data.items.length,0);
 assert.equal((await call('/listings',{cookie:farmer,method:'POST',body:{...body,title:'Cabbage',sale_unit:'cobs'}})).status,400);
});
test('buyer inquiry reaches the listing farmer while admin retains oversight',async()=>{
 const buyer=await demo('Buyer'),farmer=await demo('Farmer');
 const body={listing_id:'produce-1',volume:100,delivery_location:'Johannesburg',notes:'Collection preferred'};
 assert.equal((await call('/orders',{cookie:buyer,body:{...body,volume:100000}})).status,400);
 const create=await call('/orders',{cookie:buyer,body});assert.equal(create.status,201);
 assert.equal((await call('/orders/'+create.data.id,{cookie:buyer,method:'PATCH',body:{status:'Closed'}})).status,403);
 const farmerQueue=await call('/orders',{cookie:farmer});assert.equal(farmerQueue.status,200);assert.ok(farmerQueue.data.some(order=>order.id===create.data.id&&order.buyer_name==='Alex Morgan'));
 assert.equal((await call('/orders/'+create.data.id,{cookie:farmer,method:'PATCH',body:{status:'Accepted'}})).status,200);
 assert.equal((await call('/orders',{cookie:buyer})).data.find(order=>order.id===create.data.id).status,'Accepted');
 const other=await call('/orders',{cookie:buyer,body:{...body,listing_id:'produce-2',volume:25}});assert.equal(other.status,201);
 assert.ok(!(await call('/orders',{cookie:farmer})).data.some(order=>order.id===other.data.id));
 assert.equal((await call('/orders/'+other.data.id,{cookie:farmer,method:'PATCH',body:{status:'Accepted'}})).status,403);
 const admin=await demo('Admin');assert.ok((await call('/orders',{cookie:admin})).data.some(order=>order.id===other.data.id));
 assert.equal((await call('/orders/'+create.data.id,{cookie:admin,method:'PATCH',body:{status:'Contacted'}})).status,200);
 assert.equal((await call('/orders',{cookie:buyer})).data.find(order=>order.id===create.data.id).status,'Contacted');
});
test('cross-origin writes and revoked sessions are rejected',async()=>{const cookie=await demo('Buyer');assert.equal((await call('/account/consent',{cookie,method:'PATCH',body:{sms_opt_in:true},headers:{Origin:'https://attacker.example'}})).status,403);await call('/auth/logout',{cookie,body:{}});assert.equal((await call('/orders',{cookie})).status,401);});
test('checkout idempotency replays the original header and rejects key reuse with a new payload',async()=>{
 const body={listing_id:'produce-1',quantity:.25,contact_name:'Retry Buyer',contact_phone:'+265991112260',contact_email:'retry@example.com',delivery_location:'Lilongwe city'};
 const key=randomUUID(),before=Number((await db.get('SELECT COUNT(*) AS count FROM guest_order_checkouts')).count);
 const first=await call('/guest-orders',{body,headers:{'Idempotency-Key':key}});
 const retry=await call('/guest-orders',{body,headers:{'Idempotency-Key':key}});
 assert.equal(first.status,201);assert.deepEqual(retry.data,first.data);
 assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM guest_order_checkouts')).count),before+1);
 assert.equal((await call('/guest-orders',{body:{...body,quantity:.5},headers:{'Idempotency-Key':key}})).status,409);
});
test('expired and sold-out listings are unavailable through search, detail, and checkout',async()=>{
 const original=await db.get('SELECT available_volume,expiration_date FROM listings WHERE id=?',['produce-6']);
 const tomatoOriginal=await db.get('SELECT available_volume,expiration_date FROM listings WHERE id=?',['produce-1']);
 try{
  await db.run("UPDATE listings SET expiration_date='2000-01-01' WHERE id='produce-6'");
  assert.equal((await call('/listings/produce-6')).status,404);
  assert.equal((await call('/guest-orders',{body:{listing_id:'produce-6',quantity:1,contact_name:'Expired Buyer',contact_phone:'+265991112261',contact_email:'expired@example.com',delivery_location:'Lilongwe city'}})).status,404);
  await db.run("UPDATE listings SET expiration_date=?,available_volume=0 WHERE id='produce-1'",[tomatoOriginal.expiration_date]);
  assert.equal((await call('/listings/produce-1')).status,404);
  assert.equal((await call('/listings?search=Tomatoes')).data.items.some(item=>item.id==='produce-1'),false);
  assert.equal((await call('/guest-orders',{body:{listing_id:'produce-1',quantity:1,contact_name:'Sold Buyer',contact_phone:'+265991112262',contact_email:'sold@example.com',delivery_location:'Lilongwe city'}})).status,404);
 }finally{
  await db.run('UPDATE listings SET available_volume=?,expiration_date=? WHERE id=?',[original.available_volume,original.expiration_date,'produce-6']);
  await db.run('UPDATE listings SET available_volume=?,expiration_date=? WHERE id=?',[tomatoOriginal.available_volume,tomatoOriginal.expiration_date,'produce-1']);
 }
});
test('last-unit confirmation reaches zero safely and concurrent confirmations cannot oversell',async()=>{
 const original=Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-1'])).available_volume);
 const admin=await demo('Admin');
 try{
  await db.run('UPDATE listings SET available_volume=2 WHERE id=?',['produce-1']);
  const order=await call('/guest-orders',{body:{listing_id:'produce-1',quantity:2,contact_name:'Final Unit Buyer',contact_phone:'+265991112263',contact_email:'final@example.com',delivery_location:'Lilongwe city'}});
  assert.equal(order.status,201);
  assert.equal((await call('/admin/guest-orders/'+order.data.checkout_id,{cookie:admin,method:'PATCH',body:{status:'Confirmed'}})).status,200);
  assert.equal(Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-1'])).available_volume),0);
  assert.equal((await call('/listings/produce-1')).status,404);
  assert.equal((await call('/admin/guest-orders/'+order.data.checkout_id,{cookie:admin,method:'PATCH',body:{status:'Confirmed'}})).status,200);
  assert.equal(Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-1'])).available_volume),0);

  await db.run('UPDATE listings SET available_volume=1 WHERE id=?',['produce-1']);
  const orderA=await call('/guest-orders',{body:{listing_id:'produce-1',quantity:1,contact_name:'Concurrent Buyer A',contact_phone:'+265991112264',contact_email:'concurrent-a@example.com',delivery_location:'Lilongwe city'}});
  const orderB=await call('/guest-orders',{body:{listing_id:'produce-1',quantity:1,contact_name:'Concurrent Buyer B',contact_phone:'+265991112265',contact_email:'concurrent-b@example.com',delivery_location:'Lilongwe city'}});
  assert.equal(orderA.status,201);assert.notEqual(orderB.status,201);
  assert.equal(Number((await db.get('SELECT available_volume FROM listings WHERE id=?',['produce-1'])).available_volume),0);
  assert.ok(Number((await db.get('SELECT COUNT(*) AS count FROM audit_events WHERE action=\'inventory.reserved\'')).count)>=2);
 }finally{await db.run('UPDATE listings SET available_volume=? WHERE id=?',[original,'produce-1']);}
});
test('catalogue search runs before bounded pagination',async()=>{
 const before=Number((await db.get("SELECT COUNT(*) AS count FROM listings l JOIN farmer_profiles f ON f.id=l.farmer_id WHERE l.status='published' AND l.available_volume>0 AND l.expiration_date>=? AND f.verification_status='Verified'",[new Date().toISOString().slice(0,10)])).count);
 for(let index=0;index<35;index++)await db.run('INSERT INTO listings (id,farmer_id,produce_id,title,crop_category,available_volume,sale_unit,price,price_minor,currency,harvest_date,expiration_date,shelf_life_days,preservative_used,description,image,traceability,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[`page-test-${index}`,'farm-1',index===34?'crop-044':'crop-030',index===34?'Rare search target':'Older garlic listing','Vegetables',10,'kg',1,100,'ZAR','2026-01-01','2099-01-01',30,0,'','/images/beans.jpg','',`2020-01-01T00:00:${String(index).padStart(2,'0')}.000Z`]);
 const first=await call('/listings?page=1&page_size=24');
 assert.equal(first.data.items.length,24);assert.equal(first.data.pages,Math.ceil((before+35)/24));assert.equal(first.data.total,before+35);
 const found=await call('/listings?search=Coffee');
 assert.equal(found.data.total,1);assert.equal(found.data.items.length,1);
});
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
 assert.match(qFinal.text,/Total Estimated Cost: ZAR 15000/);
 const saved=await db.get('SELECT * FROM financial_estimates WHERE farmer_id=?',['farm-1']);
 assert.equal(saved.cost_fertilizer_seeds,4500);
 assert.equal(saved.cost_labor,5500);
 assert.equal(saved.cost_processing,3000);
 assert.equal(saved.cost_transportation,2000);
 assert.equal(saved.avg_production_cost,15000);
});

test('Appendix C: RBAC enforces financial data isolation and strict role boundaries',async()=>{
 const buyer=await demo('Buyer');
 const farmer=await demo('Farmer');
 const agent=await demo('Agent');
 const admin=await demo('Admin');

 // 1. Sellers (Farmers): Read/Write strictly limited to their own financial submissions
 const ownRead=await call('/farmers/farm-1/baseline',{cookie:farmer});
 assert.equal(ownRead.status,200);
 const otherRead=await call('/farmers/farm-2/baseline',{cookie:farmer});
 assert.equal(otherRead.status,403);
 const otherWrite=await call('/farmers/farm-2/baseline',{cookie:farmer,method:'PATCH',body:{cost_labor:1000}});
 assert.equal(otherWrite.status,403);

 // 2. Buyers: NO ACCESS to farmer financial data (costs, margins, etc.)
 const buyerAccess=await call('/farmers/farm-1/baseline',{cookie:buyer});
 assert.equal(buyerAccess.status,403);
 const buyerListings=await call('/listings',{cookie:buyer});
 assert.equal(buyerListings.status,200);
 assert.ok(buyerListings.data.items.length>0);
 for(const item of buyerListings.data.items){
  assert.equal(item.cost_fertilizer_seeds,undefined);
  assert.equal(item.cost_labor,undefined);
  assert.equal(item.cost_processing,undefined);
  assert.equal(item.cost_transportation,undefined);
  assert.equal(item.avg_production_cost,undefined);
  assert.ok('price' in item);
  assert.equal('available_volume' in item,false);
  assert.ok('traceability' in item);
  assert.ok('agent_score' in item);
 }

 // 3. Agents: NO ACCESS to farmer financial data, only physical verification requirements
 const agentBaseline=await call('/farmers/farm-1/baseline',{cookie:agent});
 assert.equal(agentBaseline.status,403);
 const agentAnalytics=await call('/admin/financial-analytics',{cookie:agent});
 assert.equal(agentAnalytics.status,403);

 assert.equal((await call('/admin/verifications',{cookie:admin,body:{listing_id:'produce-1',agent_id:'agent-1'}})).status,200);
 const verifs=await call('/agent/verifications',{cookie:agent});
 assert.equal(verifs.status,200);
 assert.ok(verifs.data.length>0);
 const v1=verifs.data[0];
 assert.ok('farm_name' in v1);
 assert.ok('location' in v1);
 assert.ok('country' in v1);
 assert.ok('region' in v1);
 assert.ok('available_volume' in v1);
 assert.ok('status' in v1);
 assert.equal(v1.cost_fertilizer_seeds,undefined);
 assert.equal(v1.avg_production_cost,undefined);

 const patchVerif=await call(`/agent/verifications/${v1.listing_id}`,{cookie:agent,method:'PATCH',body:{crop_confirmed:true,volume_confirmed:true,location_confirmed:true,harvest_confirmed:true}});
 assert.equal(patchVerif.status,200);
 assert.equal(patchVerif.data.status,'verified');
 assert.equal(patchVerif.data.score,100);

 // 4. Platform Admins: Access to aggregated financial data for platform analytics
 const buyerAnalytics=await call('/admin/financial-analytics',{cookie:buyer});
 assert.equal(buyerAnalytics.status,403);
 const adminAnalytics=await call('/admin/financial-analytics',{cookie:admin});
 assert.equal(adminAnalytics.status,200);
 assert.ok(Array.isArray(adminAnalytics.data.regions));
 assert.equal(adminAnalytics.data.minimum_group_size,5);
 assert.ok(adminAnalytics.data.regions.every(region=>region.farmer_count>=5));
});

test('Direct payment enables Malawian bank account & mobile money checkout with RBAC',async()=>{
 const buyer=await demo('Buyer');
 const farmer=await demo('Farmer');
 const admin=await demo('Admin');

 // 1. Buyer creates an order
 const orderResp=await call('/orders',{cookie:buyer,body:{listing_id:'produce-1',volume:50,delivery_location:'Lilongwe',notes:'Pay via National Bank'}});
 assert.equal(orderResp.status,201);
 const orderId=orderResp.data.id;

 // 2. Farmer cannot process or view payments (RBAC quarantine)
 const farmerPay=await call('/payments',{cookie:farmer,body:{order_id:orderId,amount:150000,currency:'MWK',method:'malawian_bank',provider:'nbm',bank_name:'National Bank of Malawi',account_or_phone:'1002345678'}});
 assert.equal(farmerPay.status,403);
 const farmerList=await call('/payments',{cookie:farmer});
 assert.equal(farmerList.status,403);

 // 3. Buyer processes direct payment using National Bank of Malawi account
 const payResp=await call('/payments',{cookie:buyer,body:{order_id:orderId,amount:150000,currency:'MWK',method:'malawian_bank',provider:'nbm',bank_name:'National Bank of Malawi',account_or_phone:'1002345678',notes:'Mo626 digital bank transfer'}});
 assert.equal(payResp.status,201);
 assert.equal(payResp.data.status,'completed');
 assert.equal(payResp.data.currency,'MWK');
 assert.equal(payResp.data.amount,150000);
 assert.ok(payResp.data.reference.startsWith('WF-MWK-'));

 // 4. Duplicate payment rejected
 const dupResp=await call('/payments',{cookie:buyer,body:{order_id:orderId,amount:150000,currency:'MWK',method:'malawian_bank',provider:'nbm',account_or_phone:'1002345678'}});
 assert.equal(dupResp.status,400);

 // 5. Order is marked paid
 const buyerOrders=await call('/orders',{cookie:buyer});
 const updatedOrder=buyerOrders.data.find(o=>o.id===orderId);
 assert.ok(updatedOrder);
 assert.equal(updatedOrder.payment_status,'paid');
 assert.equal(updatedOrder.amount_paid,150000);
 assert.equal(updatedOrder.currency,'MWK');
 assert.ok(updatedOrder.payment_ref.startsWith('WF-MWK-'));

 // 6. Admin can inspect all payments, buyer inspects own
 const buyerPayments=await call('/payments',{cookie:buyer});
 assert.equal(buyerPayments.status,200);
 assert.ok(buyerPayments.data.some(p=>p.order_id===orderId));
 const adminPayments=await call('/payments',{cookie:admin});
 assert.equal(adminPayments.status,200);
 assert.ok(adminPayments.data.some(p=>p.order_id===orderId));
});

test('USSD *211# menu provides parallel signup, cost breakdown, and live market prices',async()=>{
 const phone='+265991112233';
 const admin=await demo('Admin');

 // 1. Initial dial *211# for unauthenticated Malawian user
 const sim=async text=>call('/ussd/simulate',{cookie:admin,body:{phoneNumber:phone,text}});

 const step0=await sim('');
 assert.equal(step0.status,200);
 assert.equal(step0.data.isEnd,false);
 assert.match(step0.data.response,/CON Welcome to Wirefen Marketplace/);
 assert.match(step0.data.response,/1\. Register as Farmer/);
 assert.match(step0.data.response,/2\. Register as Buyer/);

 // 2. Step 1: Select 1 (Register as Farmer)
 const step1=await sim('1');
 assert.match(step1.data.response,/CON Enter your Full Name:/);

 // 3. Step 2: Name
 const step2=await sim('1*Chisomo Phiri');
 assert.match(step2.data.response,/CON Select your Country:\n1. Malawi\n2. Zambia/);

 // 4. Step 3: Country (1 for Malawi)
 const step3=await sim('1*Chisomo Phiri*1');
 assert.match(step3.data.response,/CON Enter your District in Malawi/);

 // 5. Step 4: District
 const step4=await sim('1*Chisomo Phiri*1*Kasungu');
 assert.match(step4.data.response,/CON Enter your Ward or Locality/);

 // 6. Step 5: Locality -> Completes registration
 const step5=await sim('1*Chisomo Phiri*1*Kasungu*Chulu');
 assert.equal(step5.data.isEnd,true);
 assert.match(step5.data.response,/END Welcome to Wirefen, Chisomo Phiri!/);
 assert.match(step5.data.response,/Kasungu, Malawi/);

 // Verify in database: user created with SMS consent & geographic metadata
 const registered=await db.get('SELECT * FROM users WHERE phone=?',[phone]);
 assert.ok(registered);
 assert.equal(registered.name,'Chisomo Phiri');
 assert.equal(registered.role,'Farmer');
 assert.equal(registered.sms_opt_in,1);

 const farmProfile=await db.get('SELECT * FROM farmer_profiles WHERE user_id=?',[registered.id]);
 assert.ok(farmProfile);
 assert.equal(farmProfile.country,'Malawi');
 assert.equal(farmProfile.district,'Kasungu');
 assert.equal(farmProfile.locality,'Chulu');

 // 7. Dialing *211# now greets the registered farmer
 const authDial=await sim('');
 assert.match(authDial.data.response,/CON Wirefen Farmer: Muli bwanji Chisomo!/);
 assert.match(authDial.data.response,/2\. Record Form 1 Farm Costs/);

 // 8. Check market prices (MWK)
 const prices=await sim('1');
 assert.equal(prices.data.isEnd,true);
 assert.match(prices.data.response,/Wirefen Market Prices:/);
 assert.match(prices.data.response,/MWK/);

 // 9. Record Form 1 guided financial breakdown via USSD
 const costSaved=await sim('2*120000*60000*25000*15000');
 assert.equal(costSaved.data.isEnd,true);
 assert.match(costSaved.data.response,/Costs saved!/);
 assert.match(costSaved.data.response,/Total Estimated Cost: MWK 220000/);

 const baseline=await db.get('SELECT * FROM financial_estimates WHERE farmer_id=?',[farmProfile.id]);
 assert.ok(baseline);
 assert.equal(baseline.cost_fertilizer_seeds,120000);
 assert.equal(baseline.cost_labor,60000);
 assert.equal(baseline.cost_processing,25000);
 assert.equal(baseline.cost_transportation,15000);
 assert.equal(baseline.avg_production_cost,220000);
 const invalid=await sim('2*-1*60000*25000*15000');
 assert.match(invalid.data.response,/Nothing was saved/);
 assert.deepEqual(await db.get('SELECT * FROM financial_estimates WHERE farmer_id=?',[farmProfile.id]),baseline);
});

test('SMS JOIN command registers farmer with Appendix A standardized geography',async()=>{
 const smsPhone='+265998887766';
 const params={From:smsPhone,MessageSid:'SM'+Math.random(),Body:'JOIN FARMER Mary Banda, Malawi, Mchinji, Kochilira'};
 const signature=twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN,process.env.TWILIO_WEBHOOK_URL,params);
 const resp=await fetch(base+'/webhooks/sms/receive',{
  method:'POST',
  headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':signature},
  body:new URLSearchParams(params)
 });
 assert.equal(resp.status,200);
 const text=await resp.text();
 assert.match(text,/Welcome to Wirefen, Mary Banda!/);

 const user=await db.get('SELECT * FROM users WHERE phone=?',[smsPhone]);
 assert.ok(user);
 assert.equal(user.name,'Mary Banda');
 assert.equal(user.role,'Farmer');

 const profile=await db.get('SELECT * FROM farmer_profiles WHERE user_id=?',[user.id]);
 assert.ok(profile);
 assert.equal(profile.country,'Malawi');
 assert.equal(profile.district,'Mchinji');
 assert.equal(profile.locality,'Kochilira');
});
