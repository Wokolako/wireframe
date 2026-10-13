import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const root=resolve('dist'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root))throw Error('Invalid path');res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(()=>localStorage.setItem('wirefen-install-v1',JSON.stringify({promptedAt:new Date().toISOString()})));
 const page=await context.newPage(),apiCalls=[],external=[],errors=[];page.on('request',r=>{if(r.url().includes('/api/'))apiCalls.push(r.url());if(!r.url().startsWith(base))external.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.abort());await page.goto(base);await page.getByRole('heading',{name:'The marketplace'}).waitFor();await page.locator('.produce-card').first().waitFor();assert.equal(await page.locator('.produce-card').count(),6);
 await page.getByRole('link',{name:'Currency converter',exact:true}).click();await page.getByText('Illustrative demo rates (not live)',{exact:false}).waitFor();await page.getByLabel('Amount',{exact:true}).fill('100');assert.match(await page.locator('.conversion-result').innerText(),/110\.00/);
 await page.waitForFunction(()=>window.Clerk?.loaded);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.cl-signIn-root').waitFor();assert.equal(await page.getByRole('button',{name:'Admin',exact:true}).count(),0);await page.evaluate(()=>window.Clerk.closeSignIn());
 await page.getByRole('button',{name:'Create account',exact:true}).click();await page.locator('.cl-signUp-root').waitFor();await page.evaluate(()=>window.Clerk.closeSignUp());
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/#/marketplace');await page.locator('.produce-card').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/presentation-mobile.png'});
 assert.deepEqual(apiCalls,[]);assert.ok(external.some(url=>url.includes('.clerk.')));assert.deepEqual(errors,[]);console.log('PASS: static-only dummy marketplace, zero Wirefen API calls, real Clerk sign-in/signup, EUR/USD example rates and mobile layout.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
