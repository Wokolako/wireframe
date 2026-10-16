import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const port=3014,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{stdio:'pipe'});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'Next.js presentation server started');
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(()=>localStorage.setItem('wirefen-install-v1',JSON.stringify({promptedAt:new Date().toISOString()})));
 const page=await context.newPage(),apiCalls=[],external=[],errors=[];page.on('request',r=>{if(r.url().includes('/api/'))apiCalls.push(r.url());if(!r.url().startsWith(base))external.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.abort());await page.goto(base);await page.getByRole('heading',{name:'The marketplace'}).waitFor();await page.locator('.produce-card').first().waitFor();assert.equal(await page.locator('.produce-card').count(),6);
 await page.locator('.produce-card').first().locator('a.view-produce').click();await page.getByRole('heading',{name:'Roma tomatoes'}).waitFor();await page.getByRole('button',{name:'Add to cart'}).click();await page.getByRole('link',{name:'Cart',exact:true}).click();await page.getByRole('heading',{name:'Your cart'}).waitFor();await page.getByRole('heading',{name:'Roma tomatoes'}).waitFor();assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('wirefen-cart'))).length,1);await page.goto(base+'/cart');await page.waitForFunction(()=>location.hash==='#/cart');await page.getByRole('heading',{name:'Your cart'}).waitFor();
 await page.getByRole('link',{name:'Currency converter',exact:true}).click();await page.getByText('Illustrative demo rates (not live)',{exact:false}).waitFor();await page.getByLabel('Amount',{exact:true}).fill('100');assert.match(await page.locator('.conversion-result').innerText(),/110\.00/);
 await page.waitForFunction(()=>window.Clerk?.loaded);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.cl-signIn-root').waitFor();assert.equal(await page.getByRole('button',{name:'Admin',exact:true}).count(),0);await page.evaluate(()=>window.Clerk.closeSignIn());
 await page.getByRole('button',{name:'Create account',exact:true}).click();await page.locator('.cl-signUp-root').waitFor();await page.evaluate(()=>window.Clerk.closeSignUp());
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/#/marketplace');await page.locator('.produce-card').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/presentation-mobile.png'});
 assert.deepEqual(apiCalls,[]);assert.ok(external.some(url=>url.includes('.clerk.')));assert.deepEqual(errors,[]);console.log('PASS: static-only dummy marketplace, zero Wirefen API calls, real Clerk sign-in/signup, EUR/USD example rates and mobile layout.');
}finally{await browser.close();server.kill();}
