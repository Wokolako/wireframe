import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {startNextDev} from './next-dev-server.mjs';

const originals=await Promise.all(['next-env.d.ts','tsconfig.json'].map(async file=>[file,await readFile(file)]));
const checkoutId='1fca6a1a-b868-4fe0-8e74-8f06b7ee14d3';
const today=new Date().toISOString().slice(0,10);
const listing={id:'produce-1',title:'Tomatoes',crop_category:'Vegetables',sale_unit:'kg',price:12.5,price_minor:1250,currency:'MWK',image:'/images/tomatoes.jpg',farm_verified:true,harvest_date:today,expiration_date:today,shelf_life_days:7,preservative_used:false,guest_limit:{name:'Tomatoes',max:2,unit:'kg'}};
const rates={base:'EUR',rates:{EUR:1,USD:1.2,MWK:2000,ZMW:25,ZAR:20,GBP:0.9},dates:Object.fromEntries(['USD','MWK','ZMW','ZAR','GBP'].map(c=>[c,today])),fetched_at:new Date().toISOString(),source:'Test daily rates',stale:false};
let child,browser;
try{
 const server=await startNextDev({port:3030});child=server.child;
 const channels=['chrome'];
 if(existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'))channels.push('msedge');
 await mkdir('test-results',{recursive:true});
 for(const channel of channels){
  browser=await chromium.launch({channel,headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  let unavailable=false,ratesUnavailable=false,ratesGate=null,paymentMethod='paychangu_mobile_money',paymentStatus='unpaid',checkoutState='Awaiting payment',placed=0,initialized=0,statusChecks=0;
  const mockApi=async route=>{
   const url=new URL(route.request().url()),path=url.pathname.slice('/api/v1'.length);
   let data;
   if(path==='/config')data={demo:false,market:'Malawi',currency:'MWK',sms_ready:false,auth_provider:'local',capabilities:{guest_checkout:true,paychangu_mobile_money:true}};
   else if(path==='/auth/me')data=null;
   else if(path==='/exchange-rates'){
    if(ratesGate)await ratesGate;
    if(ratesUnavailable)return route.fulfill({status:503,json:{error:'Exchange rates are temporarily unavailable.'}});
    data=rates;
   }
   else if(path==='/listings')data={items:[listing],pages:1,total:1};
   else if(path==='/listings/produce-1')data=listing;
   else if(path==='/paychangu/operators')data={data:[{ref_id:'airtel-test',name:'Airtel Money'},{ref_id:'tnm-test',name:'TNM Mpamba'}]};
   else if(path.endsWith('/payment-status')){
    statusChecks++;
    if(unavailable)return route.fulfill({status:503,json:{error:'Payment provider temporarily unavailable. Please retry.'}});
    data={checkout_id:checkoutId,status:paymentStatus==='paid'?'Confirmed':checkoutState,payment_method:paymentMethod,payment_status:paymentStatus,currency:'MWK',total_minor:2500,mwk_total:25,items:[{listing_id:'produce-1',quantity:2}]};
   }else if(path==='/guest-orders/quote'){
    const input=route.request().postDataJSON(),quantity=input.items[0].quantity;
    data={quote_token:'test-server-quote',currency:'MWK',total_minor:1250*quantity,payable_currency:'MWK',payable_minor:1250*quantity,quote_expires_at:new Date(Date.now()+600000).toISOString(),items:[{listing_id:'produce-1',quantity,currency:'MWK',unit_price_minor:1250,line_total_minor:1250*quantity}]};
   }else if(path==='/guest-orders/basket'){
    const body=route.request().postDataJSON();assert.equal(body.quote_token,'test-server-quote');
    placed++;paymentMethod=body.payment_method;paymentStatus='unpaid';checkoutState='Awaiting payment';
    data={checkout_id:checkoutId,mwk_total:25,status:checkoutState};
   }else if(path==='/paychangu/initialize'){
    if(paymentStatus==='pending')data={status:'pending',existing_attempt:true,message:'Your previous request is still pending. No new prompt was sent.'};
    else{initialized++;paymentStatus='pending';data={status:'pending'};}
   }else if(path.endsWith('/cancel')){
    if(paymentStatus==='paid')return route.fulfill({status:409,json:{error:'A refund is required.'}});
    checkoutState='Cancelled';paymentStatus='cancelled';data={status:'Cancelled',payment_status:paymentStatus,items:[{listing_id:'produce-1',quantity:2}]};
   }else data={};
   return route.fulfill({json:data});
  };
  await context.route('**/api/v1/**',mockApi);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(server.base+'/converter');
   await page.getByRole('heading',{name:'Currency converter',exact:true}).waitFor();
   await page.getByLabel('From currency').selectOption('MWK');
   await page.getByLabel('To currency').selectOption('ZMW');
   await page.getByLabel('Amount',{exact:true}).fill('1000');
   await page.waitForFunction(()=>document.querySelector('.conversion-result strong')?.textContent.includes('12'));
   assert.match(await page.locator('.conversion-result strong').innerText(),/ZMW 12[,.]50/);
   await page.screenshot({path:`test-results/reliability-${channel}-desktop.png`,fullPage:true});
   await page.reload();
   await page.getByRole('heading',{name:'Currency converter',exact:true}).waitFor();
   assert.match(await page.locator('.conversion-result').innerText(),/120/);

   // Exercise the header selector and actual catalogue prices, not only the converter.
   await page.goto(server.base+'/marketplace');
   await page.locator('.produce-card').first().waitFor();
   await page.getByLabel('Display currency',{exact:true}).first().selectOption('USD');
   await page.waitForFunction(()=>/\$0[,.]01/.test(document.querySelector('.produce-card .price')?.textContent||''));
   await page.reload();
   await page.waitForFunction(()=>document.querySelector('.currency-select select')?.value==='USD');
   await page.waitForFunction(()=>/\$0[,.]01/.test(document.querySelector('.produce-card .price')?.textContent||''));

   const delayedContext=await browser.newContext({serviceWorkers:'block'});
   let releaseRates;
   ratesGate=new Promise(resolve=>{releaseRates=resolve;});
   await delayedContext.route('**/api/v1/**',mockApi);
   const delayedPage=await delayedContext.newPage();
   await delayedPage.goto(server.base+'/marketplace');
   await delayedPage.locator('.produce-card').first().waitFor();
   await delayedPage.getByLabel('Display currency',{exact:true}).selectOption('USD');
   assert.equal(await delayedPage.getByLabel('Display currency',{exact:true}).inputValue(),'USD');
   assert.match(await delayedPage.locator('.currency-notice').innerText(),/USD selected/);
   releaseRates();ratesGate=null;
   await delayedPage.waitForFunction(()=>/\$0[,.]01/.test(document.querySelector('.produce-card .price')?.textContent||''));
   await delayedContext.close();

   const failedContext=await browser.newContext({serviceWorkers:'block'});
   ratesUnavailable=true;
   await failedContext.route('**/api/v1/**',mockApi);
   const failedPage=await failedContext.newPage();
   await failedPage.goto(server.base+'/marketplace');
   await failedPage.locator('.produce-card').first().waitFor();
   await failedPage.getByLabel('Display currency',{exact:true}).selectOption('USD');
   await failedPage.getByRole('button',{name:'Retry exchange rates'}).waitFor();
   assert.equal(await failedPage.getByLabel('Display currency',{exact:true}).inputValue(),'USD');
   assert.match(await failedPage.locator('.produce-card .price').innerText(),/MWK/);
   assert.match(await failedPage.locator('.currency-notice').innerText(),/Prices remain in their original currencies/);
   ratesUnavailable=false;
   await failedPage.getByRole('button',{name:'Retry exchange rates'}).click();
   await failedPage.waitForFunction(()=>/\$0[,.]01/.test(document.querySelector('.produce-card .price')?.textContent||''));
   await failedContext.close();

   const restrictedContext=await browser.newContext({serviceWorkers:'block'});
   await restrictedContext.route('**/api/v1/**',mockApi);
   await restrictedContext.addInitScript(()=>{
    Object.defineProperty(navigator,'onLine',{get:()=>false});
    Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage blocked','SecurityError');}});
   });
   const restrictedPage=await restrictedContext.newPage();
   await restrictedPage.goto(server.base+'/marketplace');
   await restrictedPage.locator('.produce-card').first().waitFor();
   await restrictedPage.getByLabel('Display currency',{exact:true}).selectOption('USD');
   await restrictedPage.waitForFunction(()=>/\$0[,.]01/.test(document.querySelector('.produce-card .price')?.textContent||''));
   await restrictedPage.setViewportSize({width:390,height:844});
   assert.ok(await restrictedPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await restrictedPage.screenshot({path:`test-results/currency-selector-${channel}-mobile.png`,fullPage:true});
   await restrictedContext.close();
   console.log(`PASS ${channel} header selector: price updates, reload preference, delayed rates, outage/retry, blocked storage and false offline indicator.`);

   unavailable=true;
   await page.goto(server.base+'/basket?checkout='+checkoutId);
   await page.getByRole('alert').filter({hasText:'Payment provider temporarily unavailable'}).waitFor();
   assert.equal(await page.getByText('Loading your order status...', {exact:true}).count(),0);
   unavailable=false;
   await page.getByRole('button',{name:'Retry order status',exact:true}).click();
   await page.getByRole('button',{name:'Pay by mobile money',exact:true}).waitFor();
   assert.equal(placed,0);
   await page.reload();
   await page.getByRole('button',{name:'Pay by mobile money',exact:true}).waitFor();
   assert.ok(page.url().includes(checkoutId));

   paymentStatus='pending';
   await page.reload();
   await page.getByText('Payment request sent.',{exact:false}).waitFor();
   await page.goto(server.base+'/marketplace');
   await page.locator('.produce-card').first().waitFor();
   await page.goto(server.base+'/basket');
   await page.getByText('Payment request sent.',{exact:false}).waitFor();
   assert.ok(page.url().includes(checkoutId));

   await page.evaluate(()=>{
    localStorage.removeItem('wirefen-active-paychangu-checkout-v1');
    localStorage.setItem('wirefen-basket-v1',JSON.stringify([{listing_id:'produce-1',quantity:2}]));
    localStorage.setItem('wirefen-saved-delivery-v1',JSON.stringify({name:'Test Buyer',phone:'+265991112200',email:'test@example.com',delivery:'Lilongwe City'}));
   });
   await page.goto(server.base+'/basket');
   await page.locator('.ebay-summary-total').filter({hasText:/MWK 25/}).waitFor();
   assert.doesNotMatch(await page.locator('.ebay-summary-total').innerText(),/653/);
   assert.equal(await page.locator('.payment-cards-horizontal select').count(),0);
   assert.equal(await page.getByRole('button',{name:'Malawian Bank - unavailable'}).isDisabled(),true);
   await page.getByLabel('Airtel Mobile Number for PayChangu').fill('+265991112200');
   await page.screenshot({path:`test-results/payment-${channel}-desktop.png`,fullPage:true});
   await page.setViewportSize({width:390,height:844});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`test-results/payment-${channel}-mobile.png`,fullPage:true});
   await page.setViewportSize({width:1440,height:1000});
   await page.getByRole('button',{name:'Confirm and pay',exact:true}).dblclick();
   await page.getByText('Payment request sent.',{exact:false}).waitFor();
   assert.equal(placed,1);
   await page.reload();
   await page.getByText('Payment request sent.',{exact:false}).waitFor();
   assert.equal(placed,1);
   assert.equal(initialized,1);
   await page.getByRole('button',{name:'Pay again',exact:true}).click();
   await page.getByText('Your previous request is still pending. No new prompt was sent.',{exact:true}).waitFor();
   assert.equal(initialized,1);
   paymentStatus='failed';
   await page.getByRole('button',{name:'Retry order status',exact:true}).click();
   await page.getByRole('button',{name:'Pay again',exact:true}).waitFor();
   assert.equal(initialized,1);
   await page.getByRole('button',{name:'Pay again',exact:true}).dblclick();
   await page.getByText('Payment request sent.',{exact:false}).first().waitFor();
   assert.equal(initialized,2);
   await page.getByRole('button',{name:'Cancel order',exact:true}).click();
   await page.getByRole('button',{name:'Confirm and pay',exact:true}).waitFor();
   assert.equal(page.url().includes('checkout='),false);
   assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wirefen-basket-v1'))),[{listing_id:'produce-1',quantity:2}]);
   const checksAfterCancel=statusChecks;
   await page.waitForTimeout(16000);
   assert.equal(statusChecks,checksAfterCancel,'cancelled checkout must stop polling');
   assert.equal(initialized,2);
   await page.reload();
   await page.getByRole('button',{name:'Confirm and pay',exact:true}).waitFor();
   assert.equal(initialized,2,'refresh after cancellation must not send a prompt');
   await page.getByRole('button',{name:'Confirm and pay',exact:true}).click();
   await page.getByText('Payment request sent.',{exact:false}).first().waitFor();
   assert.equal(initialized,3);
   paymentStatus='paid';
   await page.getByRole('button',{name:'Retry order status',exact:true}).click();
   await page.getByRole('heading',{name:'Payment received - order confirmed'}).waitFor();
   await page.setViewportSize({width:390,height:844});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`test-results/reliability-${channel}-mobile.png`,fullPage:true});
   // Shared order links work in a new browser context even when storage is blocked.
   const privateContext=await browser.newContext({serviceWorkers:'block'});
   await privateContext.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const data=path.endsWith('/config')?{auth_provider:'local',market:'Malawi',currency:'MWK'}:path.endsWith('/payment-status')?{status:'Awaiting payment',payment_method:'paychangu_mobile_money',payment_status:'pending',currency:'MWK',total_minor:2500,mwk_total:25}:path.endsWith('/paychangu/operators')?{data:[{ref_id:'airtel-test',name:'Airtel Money'}]}:path.endsWith('/auth/me')?null:{};
    return route.fulfill({json:data});
   });
   await privateContext.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage blocked','SecurityError');}});});
   const privatePage=await privateContext.newPage();
   await privatePage.goto(server.base+'/basket?checkout='+checkoutId);
   await privatePage.getByText('Payment request sent.',{exact:false}).waitFor();
   await privateContext.close();
   assert.deepEqual(errors,[]);
   console.log(`PASS ${channel}: conversion, phone approval, manual retry, duplicate-click protection, cancellation without polling or prompts, basket recovery, verified payment, mobile layout, blocked storage.`);
  }catch(error){console.error('Visible page:',(await page.locator('body').innerText()).slice(0,2000));console.error('Runtime errors:',errors);throw error;}
  await context.close();await browser.close();browser=null;
 }
}finally{
 await browser?.close();child?.kill();
 for(const [file,content] of originals)await writeFile(file,content);
}
