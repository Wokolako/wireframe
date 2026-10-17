import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
const compiled=await build({entryPoints:['src/demo.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY':'undefined'}});
const {demoApi,setDemoIdentity}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const post=(path,body)=>demoApi(path,{method:'POST',body:JSON.stringify(body)});
test('real identity is required and old sample role bypasses are rejected',async()=>{
 setDemoIdentity(null);assert.equal(await demoApi('/auth/me'),null);
 await assert.rejects(post('/auth/demo',{role:'Admin'}));
 await assert.rejects(post('/auth/onboard',{role:'Buyer'}));
 assert.equal((await demoApi('/listings')).length,0);
});
test('only the verified designated email receives the dummy admin workspace',async()=>{
 setDemoIdentity({id:'user_admin',name:'George',email:'georgechivalo01@gmail.com',verifiedEmails:[]});assert.equal(await demoApi('/auth/me'),null);
 await assert.rejects(post('/auth/onboard',{name:'George',phone:'+27824440000',role:'Admin'}));
 setDemoIdentity({id:'user_admin',name:'George',email:'georgechivalo01@gmail.com',verifiedEmails:['georgechivalo01@gmail.com']});assert.equal((await demoApi('/auth/me')).role,'Admin');assert.equal((await demoApi('/farmers')).length,0);
 setDemoIdentity({id:'user_other',name:'Other',email:'other@example.com',verifiedEmails:['other@example.com']});assert.equal(await demoApi('/auth/me'),null);await assert.rejects(demoApi('/farmers'));
});
test('real users can create local buyer/farmer profiles without public admin registration',async()=>{
 setDemoIdentity({id:'user_other',name:'Other',email:'other@example.com',verifiedEmails:['other@example.com']});
 const buyer=await post('/auth/onboard',{name:'Test Buyer',phone:'+27824440001',role:'Buyer',sms_opt_in:false});assert.equal(buyer.id,'user_other');assert.equal(buyer.role,'Buyer');
 setDemoIdentity({id:'user_grower',name:'Grower',email:'grower@example.com',verifiedEmails:['grower@example.com']});const farmer=await post('/auth/onboard',{name:'Test Grower',phone:'+27824440002',role:'Farmer',country:'ZA',region:'Test Region',locality:'Ward 12',farm_name:'Demo farm',location:'Sample region',sms_opt_in:false});assert.equal(farmer.role,'Farmer');assert.ok(farmer.farmer.id);
 setDemoIdentity(null);assert.equal(await demoApi('/auth/me'),null);await assert.rejects(demoApi('/orders'));
});
