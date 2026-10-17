import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {startNextDev} from './next-dev-server.mjs';

const server=await startNextDev({port:3011});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const health=await fetch(`${server.base}/api/v1/health`);
 assert.equal(health.status,200);
 assert.equal((await health.json()).status,'ok');
 await mkdir('test-results',{recursive:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(server.base);
 await page.getByRole('heading',{name:'The marketplace'}).waitFor();
 await page.locator('.produce-card').first().waitFor();
 assert.equal(await page.locator('.produce-card').count(),4);

 await page.locator('.catalog-toolbar select').nth(0).selectOption('Grains');
 await page.waitForFunction(()=>document.querySelectorAll('.produce-card').length===1);
 assert.match(await page.locator('.produce-card').innerText(),/Maize/);
 await page.locator('.catalog-toolbar select').nth(0).selectOption('All produce');
 await page.waitForFunction(()=>document.querySelectorAll('.produce-card').length===4);

 await page.getByRole('button',{name:'Add 1 kg to basket'}).first().click();
 await page.waitForURL('**/basket');
 await page.getByRole('heading',{name:'Your basket'}).waitFor();
 await page.screenshot({path:'test-results/next-basket.png',fullPage:true});

 await page.getByRole('link',{name:'Currency converter',exact:true}).click();
 await page.waitForURL('**/converter');
 await page.getByRole('heading',{name:'Currency converter'}).waitFor();
 await page.getByRole('link',{name:'Marketplace',exact:true}).click();
 await page.waitForURL('**/marketplace');
 await page.getByRole('heading',{name:'The marketplace'}).waitFor();

 await page.setViewportSize({width:390,height:844});
 await page.goto(`${server.base}/marketplace`);
 await page.locator('.produce-card').first().waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'test-results/next-marketplace-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: Next.js page routing, native history navigation, integrated API health, catalogue filtering and mobile layout.');
}finally{
 await browser.close();
 server.child.kill();
}
