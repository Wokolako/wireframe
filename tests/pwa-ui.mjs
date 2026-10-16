import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
const base='http://127.0.0.1:3013';
const server=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'3001',API_PORT:'3001',APP_ORIGIN:'http://127.0.0.1:3013',SQLITE_PATH:':memory:',NODE_ENV:'development',SEED_DEMO:'true'},stdio:'pipe'});
const webServer=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3013'],{stdio:'pipe'});
await mkdir('test-results',{recursive:true});let browser;
try{
 let apiReady=false;for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:3001/api/v1/health')).ok){apiReady=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(apiReady,'Test API started');
 let webReady=false;for(let i=0;i<60;i++){try{if((await fetch(base)).ok){webReady=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(webReady,'Next.js test frontend started');
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByRole('heading',{name:'Take Wirefen to the field.'}).waitFor();await page.screenshot({path:'test-results/install-first-visit-desktop.png'});
 await page.getByRole('button',{name:'Not now',exact:true}).click();await page.reload();await page.waitForTimeout(4100);assert.equal(await page.locator('.install-invitation').count(),0);
 // Clearing local storage still preserves suppression in the server's visitor cookie.
 await page.evaluate(()=>{localStorage.removeItem('wirefen-install-v1');sessionStorage.clear();});await page.reload();await page.waitForTimeout(4100);assert.equal(await page.locator('.install-invitation').count(),0);
 const mobile=await browser.newContext({viewport:{width:390,height:844}});const phone=await mobile.newPage();await phone.goto(base);await phone.getByRole('heading',{name:'Take Wirefen to the field.'}).waitFor();assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await phone.screenshot({path:'test-results/install-first-visit-mobile.png'});
 await phone.evaluate(()=>dispatchEvent(new Event('appinstalled')));await phone.waitForFunction(()=>JSON.parse(localStorage.getItem('wirefen-install-v1')).installedAt);await phone.waitForFunction(async()=>!!(await(await fetch('/api/v1/pwa/session')).json()).installed_at);await phone.reload();await phone.waitForTimeout(4100);assert.equal(await phone.locator('.install-invitation').count(),0);
 await phone.evaluate(async()=>{await fetch('/api/v1/auth/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'Farmer'})});});await phone.reload();await phone.waitForFunction(()=>document.querySelector('.profile-name')?.textContent.includes('Farmer'));await phone.waitForFunction(async()=>!!(await(await fetch('/api/v1/pwa/session')).json()).installed_at);
 const other=await browser.newContext();await other.request.post(base+'/api/v1/auth/demo',{data:{role:'Farmer'}});const otherPage=await other.newPage();await otherPage.goto(base);await otherPage.waitForTimeout(4500);assert.equal(await otherPage.locator('.install-invitation').count(),0);assert.equal(await otherPage.evaluate(()=>JSON.parse(localStorage.getItem('wirefen-install-v1')).suppressed),true);
 const standalone=await browser.newContext();await standalone.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{get:()=>true});});const app=await standalone.newPage();await app.goto(base);await app.waitForTimeout(4200);assert.equal(await app.locator('.install-invitation').count(),0);assert.ok(await app.evaluate(()=>JSON.parse(localStorage.getItem('wirefen-install-v1')).installedAt));
 assert.deepEqual(errors,[]);console.log('PASS: first-visit invitations, desktop/mobile layout, dismissal/reload persistence, server-cookie fallback, confirmed installation, account cross-device suppression and standalone launch.');
}finally{await browser?.close();webServer.kill();server.kill();}
