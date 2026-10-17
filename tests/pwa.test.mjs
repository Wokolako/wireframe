import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV='test';process.env.SQLITE_PATH=':memory:';
const {app,db}=await import('./helpers/test-api.mjs').then(module=>module.loadTestApi());
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}/api/v1`;
after(async()=>{await new Promise(r=>server.close(r));await db.close();});
async function request(path,{cookie,body,origin}={}){const res=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0],rawCookie:res.headers.get('set-cookie'),cache:res.headers.get('cache-control')};}
test('first visitor receives an opaque session; prompt history persists across reloads',async()=>{
 const fresh=await request('/pwa/session');assert.equal(fresh.status,200);assert.equal(fresh.data.suppress_prompt,false);assert.match(fresh.rawCookie,/HttpOnly/);assert.match(fresh.rawCookie,/SameSite=Lax/);assert.equal(fresh.cache,'no-store');
 const shown=await request('/pwa/events',{cookie:fresh.cookie,body:{event:'prompted',source:'invitation'}});assert.equal(shown.data.suppress_prompt,true);assert.ok(shown.data.prompted_at);
 const returned=await request('/pwa/session',{cookie:fresh.cookie});assert.equal(returned.data.prompted_at,shown.data.prompted_at);assert.equal(returned.data.first_seen_at,fresh.data.first_seen_at);
});
test('confirmed installation is permanent and cannot be downgraded by dismissal',async()=>{
 const fresh=await request('/pwa/session');const installed=await request('/pwa/events',{cookie:fresh.cookie,body:{event:'installed',source:'appinstalled'}});
 assert.equal(installed.data.device_installed,true);const dismissed=await request('/pwa/events',{cookie:fresh.cookie,body:{event:'dismissed'}});assert.equal(dismissed.data.installed_at,installed.data.installed_at);assert.equal(dismissed.data.suppress_prompt,true);
 assert.equal((await request('/pwa/events',{cookie:fresh.cookie,body:{event:'installed',source:'browser-prompt'}})).status,400);
});
test('installation follows the authenticated account to another browser without leaking to another account',async()=>{
 const farmer=(await request('/auth/demo',{body:{role:'Farmer'}})).cookie,buyer=(await request('/auth/demo',{body:{role:'Buyer'}})).cookie;
 const device=await request('/pwa/session');await request('/pwa/events',{cookie:device.cookie,body:{event:'installed',source:'standalone'}});
 await request('/pwa/session',{cookie:device.cookie+'; '+farmer});
 const anotherDevice=await request('/pwa/session',{cookie:farmer});assert.equal(anotherDevice.data.suppress_prompt,true);assert.ok(anotherDevice.data.installed_at);assert.equal(anotherDevice.data.device_installed,false);
 const unrelated=await request('/pwa/session',{cookie:buyer});assert.equal(unrelated.data.suppress_prompt,false);assert.equal(unrelated.data.installed_at,null);
});
test('PWA event validation and origin controls reject unsafe state changes',async()=>{
 assert.equal((await request('/pwa/events',{body:{event:'reset'}})).status,400);
 assert.equal((await request('/pwa/events',{body:{event:'installed',source:'standalone',user_id:'admin-1'}})).status,400);
 assert.equal((await request('/pwa/events',{body:{event:'dismissed'},origin:'https://untrusted.example'})).status,403);
});
test('health endpoint checks the database and returns no credentials',async()=>{
 const health=await request('/health');assert.equal(health.status,200);assert.deepEqual(health.data,{status:'ok',service:'wirefen-api',version:'1.0.0'});
});
