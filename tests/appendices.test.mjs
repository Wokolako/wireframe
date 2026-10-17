import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGeography} from '../shared/geography.mjs';
import {parseCost,costFields} from '../shared/finance.mjs';
process.env.NODE_ENV='test';process.env.SQLITE_PATH=':memory:';process.env.SEED_DEMO='true';
delete process.env.DATABASE_URL;
for(const name of ['CLERK_SECRET_KEY','CLERK_PUBLISHABLE_KEY','NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY','NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'])delete process.env[name];
process.env.TWILIO_AUTH_TOKEN='appendix-test';process.env.TWILIO_WEBHOOK_URL='https://wirefen.test/api/v1/webhooks/sms/receive';
const {app,db,initDb}=await import('./helpers/test-api.mjs').then(module=>module.loadTestApi());
const {createClerkProfile}=await import('../server/clerk-profile.mjs');
const {saveBaseline}=await import('../server/financial.mjs');
const twilio=(await import('twilio')).default;
let server,base;before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api/v1`;});
after(async()=>{await new Promise(r=>server.close(r));await db.close();});
async function call(path,cookie,body,method){const r=await fetch(base+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const demo=async role=>(await call('/auth/demo',null,{role})).cookie;
const complete={crop_type:'Maize',avg_land_size:10,avg_yield_per_acre:20,avg_duration_days:90,cost_fertilizer_seeds:10.1,cost_labor:20.2,cost_processing:0,cost_transportation:5,status:'complete'};
test('geography is canonical, mandatory in both registration paths, and repairable by its owner',async()=>{
 assert.equal(normalizeGeography({country:'za',region:'  Cape   Winelands ',locality:'Ward 8'}).location_key,normalizeGeography({country:'South Africa',region:'cape winelands',locality:'WARD 8'}).location_key);
 const input={name:'Test Farmer',phone:'+27828880001',password:'test-long-password',role:'Farmer',farm_name:'Test farm',sms_opt_in:false};
 for(const geo of [{},{country:'ZA'},{country:'ZA',region:'District'},{country:'invalid',region:'District',locality:'Ward'}])assert.equal((await call('/auth/register',null,{...input,...geo})).status,400);
 await assert.rejects(createClerkProfile(db,'clerk_invalid',{...input,location:'Town only'}));
 const farmer=await demo('Farmer');await db.run("UPDATE farmer_profiles SET location_key='' WHERE id='farm-1'");
 assert.equal((await call('/farmers/farm-1/baseline',farmer,complete,'PATCH')).status,409);
 const fixed=await call('/account/location',farmer,{country:'ZA',region:'Capricorn District',locality:'Ward 12'},'PATCH');assert.equal(fixed.status,200);assert.equal(fixed.data.farmer.country_code,'ZA');
 assert.equal((await call('/account/location',await demo('Buyer'),{country:'ZA',region:'Other',locality:'Other'},'PATCH')).status,403);
});
test('only owner can read/write finances; public and agent records never contain financial fields',async()=>{
 const farmer=await demo('Farmer');assert.equal((await call('/farmers/farm-1/baseline',farmer,complete,'PATCH')).status,200);
 for(const role of ['Buyer','Admin']){const cookie=await demo(role);for(const method of ['GET','PATCH','POST'])assert.equal((await call('/farmers/farm-1/baseline',cookie,method==='GET'?undefined:complete,method)).status,403);}
 for(const method of ['GET','PATCH','POST'])assert.equal((await call('/farmers/farm-2/baseline',farmer,method==='GET'?undefined:complete,method)).status,403);
 assert.equal((await call('/farmers/farm-1/baseline')).status,401);
 const listing=(await call('/listings/produce-1')).data;for(const key of [...costFields,'avg_production_cost','legacy_total'])assert.equal(Object.hasOwn(listing,key),false);
 const cols=await db.all('PRAGMA table_info(historical_baselines)');assert.ok(!cols.some(c=>costFields.includes(c.name)||c.name==='avg_production_cost'));
});
test('complete forms require four estimates; totals ignore client manipulation and partial writes preserve prior amounts',async()=>{
 const farmer=await demo('Farmer');
 assert.equal((await call('/farmers/farm-1/baseline',farmer,{...complete,cost_labor:null},'PATCH')).status,400);
 assert.equal((await call('/farmers/farm-1/baseline',farmer,{...complete,cost_labor:1.234},'PATCH')).status,400);
 let r=await call('/farmers/farm-1/baseline',farmer,{...complete,avg_production_cost:999999},'PATCH');assert.equal(r.data.avg_production_cost,35.3);
 r=await call('/farmers/farm-1/baseline',farmer,{cost_labor:1.2},'PATCH');assert.equal(r.data.avg_production_cost,16.3);
 await Promise.all([saveBaseline(db,'farm-1',{cost_processing:2}),saveBaseline(db,'farm-1',{cost_transportation:3})]);
 r=await call('/farmers/farm-1/baseline',farmer);assert.equal(r.data.avg_production_cost,16.3);assert.equal(r.data.cost_processing,2);assert.equal(r.data.cost_transportation,3);
});
test('SMS rejects malformed amounts and recalculates the total after every accepted answer',async()=>{
 for(const text of ['-500','invalid','','1e3','1.234','R500','1,23'])assert.equal(parseCost(text),null);
 assert.equal(parseCost('1,234.50'),1234.5);assert.equal(parseCost('0'),0);
 async function sms(Body){const body={From:'+27820000001',Body,MessageSid:'SM'+crypto.randomUUID()};const sig=twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN,process.env.TWILIO_WEBHOOK_URL,body);const r=await fetch(base+'/webhooks/sms/receive',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':sig},body:new URLSearchParams(body)});return r.text();}
 await sms('START');await sms('COST');const old=await db.get("SELECT * FROM financial_estimates WHERE farmer_id='farm-1'");
 for(const invalid of ['-500','invalid'])assert.match(await sms(invalid),/not saved/);
 assert.deepEqual(await db.get("SELECT * FROM financial_estimates WHERE farmer_id='farm-1'"),old);
 await sms('100');const row=await db.get("SELECT * FROM financial_estimates WHERE farmer_id='farm-1'");assert.equal(Number(row.avg_production_cost),106.2);
});
test('analytics needs an explicit permission and never returns groups smaller than five farmers',async()=>{
 const admin=await demo('Admin');assert.deepEqual((await call('/admin/financial-analytics',admin)).data.regions,[]);
 await db.run("DELETE FROM user_permissions WHERE user_id='admin-1'");assert.equal((await call('/admin/financial-analytics',admin)).status,403);
 await db.run("INSERT INTO user_permissions VALUES ('admin-1','financial_analytics')");
 for(let i=0;i<5;i++){
  const id=await createClerkProfile(db,'analytics-'+i,{name:'Farmer '+i,phone:'+2782888010'+i,role:'Farmer',farm_name:'Farm '+i,country:'ZA',region:'Test Region',locality:'Ward '+i,sms_opt_in:false});
  const farm=await db.get('SELECT id FROM farmer_profiles WHERE user_id=?',[id]);await saveBaseline(db,farm.id,complete);
 }
 const result=await call('/admin/financial-analytics',admin);assert.equal(result.data.regions.length,1);assert.equal(result.data.regions[0].farmer_count,5);assert.equal(result.data.regions[0].avg_production_cost,35.3);assert.ok(!JSON.stringify(result.data).includes('farmer_id'));
 assert.equal((await call('/admin/financial-analytics',await demo('Farmer'))).status,403);
});
test('agents see assigned physical requirements only and can publish a derived listing score',async()=>{
 // Session provisioning here deliberately bypasses public signup, which never accepts Agent.
 const {createHash}=await import('node:crypto');const token='agent-test-token';await db.run('INSERT INTO sessions VALUES (?,?,?)',[createHash('sha256').update(token).digest('hex'),'agent-1','2099-01-01']);const agent='wirefen_session='+token;
 const admin=await demo('Admin');assert.equal((await call('/admin/verifications',admin,{listing_id:'produce-1',agent_id:'agent-1'})).status,200);
 const tasks=await call('/agent/verifications',agent);assert.equal(tasks.data.length,1);assert.ok(!('price' in tasks.data[0]));for(const key of costFields)assert.ok(!(key in tasks.data[0]));
 for(const method of ['GET','POST','PATCH'])assert.equal((await call('/farmers/farm-1/baseline',agent,method==='GET'?undefined:complete,method)).status,403);
 const check={crop_confirmed:true,volume_confirmed:true,location_confirmed:true,harvest_confirmed:true};
 assert.equal((await call('/agent/verifications/produce-2',agent,check,'PATCH')).status,404);
 assert.equal((await call('/agent/verifications/produce-1',agent,{...check,score:100},'PATCH')).status,400);
 assert.equal((await call('/agent/verifications/produce-1',agent,check,'PATCH')).data.score,100);
 assert.equal((await call('/listings/produce-1')).data.agent_score,100);
 await initDb();assert.equal((await call('/farmers/farm-1/baseline',await demo('Farmer'))).data.cost_fertilizer_seeds,100);
});
