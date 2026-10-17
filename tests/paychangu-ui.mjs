import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startNextDev} from './next-dev-server.mjs';

const {base,child}=await startNextDev({port:3016});
let browser;
try{
 let statusPolls=0,initialized=false,paid=false,checkoutBody,initializeBody;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.url().includes('paychangu'))console.log('REQ',request.method(),request.url());});
 await page.route('**/api/v1/config',route=>route.fulfill({json:{demo:false,market:'Malawi',currency:'MWK',sms_ready:false,capabilities:{guest_checkout:true,online_payments:false,paychangu_mobile_money:true,ussd:false,sms:false}}}));
 await page.route('**/api/v1/guest-orders/basket',async route=>{
  checkoutBody=route.request().postDataJSON();
  await route.fulfill({status:201,json:{checkout_id:'1fca6a1a-b868-4fe0-8e74-8f06b7ee14d3',payment_method:'paychangu_mobile_money'}});
 });
 await page.route('**/api/v1/paychangu/operators',route=>route.fulfill({json:{data:[{ref_id:'airtel-test',name:'Airtel Money'}]}}));
 await page.route('**/api/v1/guest-orders/*/payment-status',async route=>{
  statusPolls++;
  await route.fulfill({json:{checkout_id:'1fca6a1a-b868-4fe0-8e74-8f06b7ee14d3',status:statusPolls>2?'Confirmed':'New',payment_method:'paychangu_mobile_money',payment_status:paid?'paid':initialized?'pending':'unpaid',currency:'MWK',total_minor:2500}});
 });
 await page.route('**/api/v1/paychangu/initialize',async route=>{
  initializeBody=route.request().postDataJSON();
  initialized=true;
  await route.fulfill({status:201,json:{checkout_id:initializeBody.checkout_id,charge_id:'WF-test-charge',amount:25,currency:'MWK',status:'pending'}});
 });
 await page.goto(base);
 await page.getByRole('heading',{name:'The marketplace'}).waitFor();
 await page.locator('.produce-card').first().getByRole('link',{name:'View produce'}).click();
 await page.getByRole('button',{name:'Choose payment for this item'}).evaluate(button=>{button.click();button.click();});
 await page.getByLabel('Quantity for Tomatoes').waitFor();
 assert.equal(await page.getByLabel('Quantity for Tomatoes').inputValue(),'1');
 await page.getByLabel('Quantity for Tomatoes').fill('2');
 await page.getByLabel('Full name').fill('Malawi Buyer');
 await page.getByLabel('Phone with country code').fill('+265991112200');
 await page.getByLabel('Email').fill('buyer@example.com');
 await page.getByLabel('Delivery location').fill('Lilongwe City');
 await page.getByLabel('Malawi mobile money (PayChangu)').check();
 await page.getByRole('button',{name:'Place order · pay after confirmation'}).click();
 await page.getByText('Wirefen is confirming stock availability.').waitFor();
 await page.getByLabel('Malawi mobile number').waitFor({timeout:12000});
 await page.getByLabel('Malawi mobile number').fill('+265991112200');
 const dismissInvitation=page.getByRole('button',{name:'Not now'});
 if(await dismissInvitation.isVisible())await dismissInvitation.click();
 await page.getByRole('button',{name:'Pay by mobile money'}).click();
 await page.getByText('PayChangu has sent a payment request to your phone.').waitFor();
 assert.equal(checkoutBody.payment_method,'paychangu_mobile_money');
 assert.equal(initializeBody.operator_ref_id,'airtel-test');
 assert.equal(initializeBody.mobile,'+265991112200');
 paid=true;
 await page.getByText(/Payment received\. Your MWK 25 order is paid\./).waitFor({timeout:7000});
 assert.deepEqual(errors,[]);
 console.log('PASS: Malawi checkout selection, staff-confirmation gate, operator/mobile capture, PayChangu request and paid-state polling.');
}finally{
 await browser?.close();
 child.kill();
}
