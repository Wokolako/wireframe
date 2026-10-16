import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
process.env.NODE_ENV='test';process.env.SQLITE_PATH=':memory:';process.env.SEED_DEMO='false';
process.env.CLERK_PUBLISHABLE_KEY='pk_test_'+Buffer.from('wirefen-test.clerk.accounts.dev$').toString('base64');
process.env.CLERK_SECRET_KEY='sk_test_isolated_fixture';
process.env.CLERK_JWT_KEY=publicKey.export({type:'spki',format:'pem'});
process.env.CLERK_TELEMETRY_DISABLED='1';
const {app}=await import('../server/index.mjs');const {db}=await import('../server/db.mjs');
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`;
after(async()=>{await new Promise(r=>server.close(r));await db.close();});
function token(sub,extra={}){const now=Math.floor(Date.now()/1000);const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:'test_key'})).toString('base64url');const payload=Buffer.from(JSON.stringify({iss:'https://wirefen-test.clerk.accounts.dev',sub,sid:'sess_test',azp:'http://127.0.0.1:3001',iat:now,nbf:now-1,exp:now+300,...extra})).toString('base64url');const body=header+'.'+payload;return body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');}
const request=(path,{jwt,body,method='GET',cookie}={})=>fetch(base+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(jwt?{Authorization:'Bearer '+jwt}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('verified Clerk JWT provisions a Farmer, loads the profile and authorizes their baseline',async()=>{
 const jwt=token('user_farmer');let response=await request('/auth/onboard',{method:'POST',jwt,body:{name:'Clerk Farmer',phone:'+27827770001',role:'Farmer',country:'ZA',region:'Test Region',locality:'Ward 12',sms_opt_in:false,farm_name:'Verified identity farm',location:'Test region'}});assert.equal(response.status,201);const user=await response.json();assert.equal(user.role,'Farmer');assert.ok(user.farmer.id);
 response=await request('/auth/me',{jwt});assert.equal((await response.json()).id,user.id);
 response=await request('/farmers/'+user.farmer.id+'/baseline',{method:'PATCH',jwt,body:{crop_type:'Maize'}});assert.equal(response.status,200);
 response=await request('/farmers/'+user.farmer.id+'/baseline',{jwt:token('user_unlinked')});assert.equal(response.status,401);
 response=await request('/farmers',{jwt});assert.equal(response.status,403);
});
test('Clerk mode rejects role escalation, expired or wrong-origin JWTs, and legacy sessions',async()=>{
 assert.equal((await request('/auth/onboard',{method:'POST',jwt:token('user_escalate'),body:{name:'No Admin',phone:'+27827770002',role:'Admin',sms_opt_in:false}})).status,400);
 for(const jwt of [token('user_farmer',{exp:1}),token('user_farmer',{azp:'https://untrusted.example'}),'not-a-valid-jwt'])assert.equal((await request('/farmers',{jwt})).status,401);
 const farmer=await db.get("SELECT id FROM users WHERE phone='+27827770001'");const old='legacy-cookie';await db.run('INSERT INTO sessions VALUES (?,?,?)',[createHash('sha256').update(old).digest('hex'),farmer.id,new Date(Date.now()+60000).toISOString()]);
 assert.equal(await (await request('/auth/me',{cookie:'wirefen_session='+old})).json(),null);
 for(const path of ['login','register','demo'])assert.equal((await request('/auth/'+path,{method:'POST',body:{}})).status,410);
});
