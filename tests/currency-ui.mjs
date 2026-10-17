import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {startNextDev} from './next-dev-server.mjs';
const base='http://127.0.0.1:3012';
const server=await startNextDev({port:3012});
let browser;
try{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/api/v1/config')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const today=new Date().toISOString().slice(0,10);
 const fixture={base:'EUR',rates:{EUR:1,USD:1.2,ZAR:20},dates:{USD:today,ZAR:today},fetched_at:new Date().toISOString(),source:'Frankfurter',stale:false};
 let outage=false;
 await context.route('**/api/v1/exchange-rates',route=>outage?route.fulfill({status:503,json:{error:'Exchange rates are unavailable. Please try again shortly.'}}):route.fulfill({json:fixture}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.produce-card').first().waitFor();
 await page.getByLabel('Display currency',{exact:true}).selectOption('USD');
 assert.match(await page.locator('.produce-card').first().locator('.price').innerText(),/\$0.75/);
 await page.getByRole('link',{name:'Currency converter',exact:true}).click();await page.getByLabel('Amount',{exact:true}).fill('100');
 assert.match(await page.locator('.conversion-result').innerText(),/\$120.00/);
 await page.getByRole('button',{name:'Swap currencies'}).click();assert.match(await page.locator('.conversion-result').innerText(),/€83.33/);
 await page.getByLabel('Amount',{exact:true}).fill('-1');await page.locator('#conversion-error').waitFor();assert.match(await page.locator('.conversion-result').innerText(),/unavailable/);
 await page.getByLabel('Amount',{exact:true}).fill('100');await page.getByLabel('From currency').selectOption('EUR');await page.getByLabel('To currency').selectOption('USD');
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/currency-desktop.png',fullPage:true});
 await page.reload();await page.waitForFunction(()=>document.querySelector('.currency-select select')?.value==='USD');
 outage=true;await page.getByRole('button',{name:'Refresh rates'}).click();await page.getByText('Could not refresh rates. The saved rates below are still available.').waitFor();assert.match(await page.locator('.conversion-result').innerText(),/\$120.00/);
 outage=false;await page.getByRole('button',{name:'Refresh rates'}).click();
 await page.setViewportSize({width:375,height:812});await page.screenshot({path:'test-results/currency-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const fresh=await browser.newContext({serviceWorkers:'block'});await fresh.route('**/api/v1/exchange-rates',route=>route.fulfill({status:503,json:{error:'Exchange rates are unavailable. Please try again shortly.'}}));const unavailable=await fresh.newPage();await unavailable.goto(base+'/converter');await unavailable.getByText('Exchange rates are unavailable. Please try again shortly.').waitFor();assert.match(await unavailable.locator('.conversion-result').innerText(),/unavailable/);assert.equal(await unavailable.locator('.currency-select select').first().inputValue(),'ZAR');
 assert.deepEqual(errors,[]);console.log('PASS: EUR/USD conversion, reverse conversion, actual converted catalogue prices, preference persistence, negative input, cached-rate outage, no-rate fallback, 375px layout, no runtime errors.');
}finally{await browser?.close();server.child.kill();}
