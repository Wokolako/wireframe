import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {startNextDev} from './next-dev-server.mjs';
const server=await startNextDev({port:3014,backend:false});
const {base}=server;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(()=>localStorage.setItem('wirefen-install-v1',JSON.stringify({promptedAt:new Date().toISOString()})));
 const page=await context.newPage(),apiCalls=[],external=[],errors=[];page.on('request',r=>{if(r.url().includes('/api/'))apiCalls.push(r.url());if(!r.url().startsWith(base))external.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.abort());assert.equal((await page.request.get(base+'/api/v1/health')).status(),404);await page.goto(base);await page.getByRole('heading',{name:'The marketplace'}).waitFor();await page.getByText('No matching produce is available.',{exact:false}).waitFor();assert.equal(await page.locator('.produce-card').count(),0);
 await page.getByRole('link',{name:'Currency converter',exact:true}).click();await page.getByText('Illustrative demo rates (not live)',{exact:false}).waitFor();await page.getByLabel('Amount',{exact:true}).fill('100');assert.match(await page.locator('.conversion-result').innerText(),/110\.00/);
 let clerkLoaded=false;try{await page.waitForFunction(()=>window.Clerk?.loaded,null,{timeout:5000});clerkLoaded=true;}catch{console.log('SKIP: external Clerk dialogs could not load in this environment.');}
 if(clerkLoaded){await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.cl-signIn-root').waitFor();assert.equal(await page.getByRole('button',{name:'Admin',exact:true}).count(),0);await page.evaluate(()=>window.Clerk.closeSignIn());
 await page.getByRole('button',{name:'Create account',exact:true}).click();await page.locator('.cl-signUp-root').waitFor();await page.evaluate(()=>window.Clerk.closeSignUp());}
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/marketplace');await page.getByRole('heading',{name:'The marketplace'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/presentation-mobile.png'});
 assert.deepEqual(apiCalls,[]);assert.ok(external.some(url=>url.includes('.clerk.')));assert.deepEqual(errors,[]);console.log('PASS: Next.js presentation routes, disabled API, EUR/USD example rates and mobile layout.');
}finally{await browser.close();server.child.kill();}
