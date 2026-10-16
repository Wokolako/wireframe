import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.SQLITE_PATH=':memory:';
const {db,initDb}=await import('../server/db.mjs');
const {createClerkProfile}=await import('../server/clerk-profile.mjs');
await initDb();after(()=>db.close());
const input={name:'Test Grower',phone:'+27821112222',role:'Farmer',country:'ZA',region:'Test Region',locality:'Ward 12',farm_name:'Test Farm',location:'Test Town',sms_opt_in:true};
test('Clerk onboarding creates the linked farmer and timestamped consent atomically',async()=>{
 const id=await createClerkProfile(db,'user_verified_test',input);
 assert.equal((await db.get('SELECT * FROM clerk_identities WHERE clerk_user_id=?',['user_verified_test'])).user_id,id);
 assert.equal((await db.get('SELECT * FROM farmer_profiles WHERE user_id=?',[id])).farm_name,'Test Farm');
 const consent=await db.get('SELECT * FROM sms_consents WHERE user_id=?',[id]);assert.equal(consent.opted_in,1);assert.ok(Date.parse(consent.recorded_at));
 assert.equal(await createClerkProfile(db,'user_verified_test',{...input,role:'Buyer'}),id);
 assert.equal((await db.get('SELECT role FROM users WHERE id=?',[id])).role,'Farmer');
});
test('onboarding rejects missing identity, public Admin roles and phone account takeover',async()=>{
 await assert.rejects(createClerkProfile(db,null,input),{status:401});
 await assert.rejects(createClerkProfile(db,'user_bad_role',{...input,role:'Admin'}));
 await assert.rejects(createClerkProfile(db,'user_other',input),{status:409});
 assert.equal(await db.get('SELECT * FROM clerk_identities WHERE clerk_user_id=?',['user_other']),undefined);
 await assert.rejects(createClerkProfile(db,'user_bad_phone',{...input,phone:'0821112222'}));
});
test('a failed onboarding transaction does not leave an orphaned account',async()=>{
 const original=db.run;db.run=async function(s,p){if(s.includes('INSERT INTO sms_consents'))throw new Error('Simulated database failure');return original.call(this,s,p);};
 try{await assert.rejects(createClerkProfile(db,'user_rollback',{...input,phone:'+27823334444'}),/Simulated database failure/);}finally{db.run=original;}
 assert.equal(await db.get('SELECT * FROM users WHERE phone=?',['+27823334444']),undefined);
});
