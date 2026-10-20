import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {startNextDev} from './next-dev-server.mjs';

const originals=await Promise.all(['next-env.d.ts','tsconfig.json'].map(async file=>[file,await readFile(file)]));
const day=new Date().toISOString().slice(0,10),stamp=new Date().toISOString();
let server,browser;
try{
 server=await startNextDev({port:3032});await mkdir('test-results',{recursive:true});
 const channels=['chrome',...(existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')?['msedge']:[])];
 for(const channel of channels){
  browser=await chromium.launch({channel,headless:true});
  const order={id:'request-1',listing_id:'produce-1',title:'Tomatoes',volume:100,sale_unit:'kg',price_minor:1250,listing_currency:'MWK',delivery_location:'Lilongwe City',notes:'Friday delivery',created_at:stamp,buyer_name:'Test Buyer',phone:'+265991112200',status:'New',payment_status:'unpaid',committed_at:null,approved_at:null};
  let commitments=0,createdRequests=0,approvals=0,checkouts=0,prompts=0,paymentStatus='unpaid',checkoutState='Awaiting payment',checkoutId='1fca6a1a-b868-4fe0-8e74-8f06b7ee14d3';
  const errors=[];
  async function contextFor(role){
   const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
   await context.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname.slice('/api/v1'.length),method=route.request().method();let data;
    if(path==='/config')data={demo:false,auth_provider:'local',market:'Malawi',currency:'MWK',capabilities:{guest_checkout:true,paychangu_mobile_money:true,online_payments:true}};
    else if(path==='/auth/me')data={id:role.toLowerCase(),name:role==='Buyer'?'Test Buyer':'Test Farmer',role,phone:'+265991112200',email:'buyer@example.com',sms_opt_in:false,farmer:role==='Farmer'?{id:'farm-1',user_id:'farmer',farm_name:'Test Farm',verification_status:'Verified',location:'Lilongwe',country:'Malawi',country_code:'MW',region:'Lilongwe',locality:'Area 47',location_key:JSON.stringify(['MW','lilongwe','area 47']),farm_size:1}:null};
    else if(path==='/exchange-rates')data={base:'EUR',rates:{EUR:1,USD:1.2,MWK:2000,GBP:0.9,ZMW:25,ZAR:20},dates:Object.fromEntries(['USD','MWK','GBP','ZMW','ZAR'].map(code=>[code,day])),source:'Test rates',fetched_at:stamp,stale:false};
    else if(path==='/orders'&&method==='POST'){
     const body=route.request().postDataJSON();assert.equal(body.commit,true);assert.deepEqual(body.terms,{unit_price_minor:1250,currency:'MWK',sale_unit:'kg'});assert.equal(body.delivery_location,'Lilongwe City');createdRequests++;data={id:'created-request',status:'Committed'};
    }else if(path==='/orders')data=[order];
    else if(path==='/bulk-orders')data=[];
    else if(path==='/orders/request-1/commit'){
     const body=route.request().postDataJSON();assert.equal(role,'Buyer');assert.equal(body.acknowledge,true);assert.deepEqual(body.terms,{unit_price_minor:1250,currency:'MWK',sale_unit:'kg'});
     commitments++;Object.assign(order,{status:'Committed',committed_at:stamp,committed_unit_price_minor:1250,committed_currency:'MWK',committed_sale_unit:'kg'});data={id:order.id,status:order.status};
    }else if(path==='/orders/request-1'&&method==='PATCH'){
     assert.equal(role,'Farmer');assert.ok(order.committed_at);approvals++;Object.assign(order,{status:'Approved',approved_at:stamp});data={status:'Approved'};
    }else if(path==='/orders/request-1/quote')data={quote_token:'approved-quote',payable_minor:125000,quote_expires_at:new Date(Date.now()+600000).toISOString()};
    else if(path==='/paychangu/operators')data={data:[{ref_id:'airtel-test',name:'Airtel Money'},{ref_id:'tnm-test',name:'TNM Mpamba'}]};
    else if(path==='/orders/request-1/checkout'){
     assert.equal(role,'Buyer');assert.equal(order.status,'Approved');assert.equal(route.request().postDataJSON().quote_token,'approved-quote');checkouts++;
     if(checkouts>1)checkoutId='2fca6a1a-b868-4fe0-8e74-8f06b7ee14d3';
     paymentStatus='unpaid';checkoutState='Awaiting payment';data={checkout_id:checkoutId,order_request_id:order.id,payment_status:'unpaid'};
     Object.assign(order,{checkout_id:checkoutId,checkout_status:checkoutState});
    }else if(path==='/paychangu/initialize'){
     assert.equal(route.request().postDataJSON().checkout_id,checkoutId);prompts++;paymentStatus='pending';data={status:'pending'};
    }else if(path.endsWith('/payment-status'))data={checkout_id:checkoutId,order_request_id:order.id,status:checkoutState,payment_status:paymentStatus,payment_method:'paychangu_mobile_money',currency:'MWK',total_minor:125000,mwk_total:1250,items:[{listing_id:'produce-1',quantity:100}]};
    else if(path.endsWith('/cancel')){paymentStatus='cancelled';checkoutState='Cancelled';Object.assign(order,{checkout_status:'Cancelled'});data={order_request_id:order.id,status:'Cancelled',payment_status:'cancelled',items:[{listing_id:'produce-1',quantity:100}]};}
    else if(path==='/listings/produce-1')data={id:'produce-1',title:'Tomatoes',sale_unit:'kg',price:12.5,price_minor:1250,currency:'MWK',crop_category:'Vegetables',image:'/images/tomatoes.jpg',farm_verified:true,harvest_date:day,expiration_date:day,shelf_life_days:7,guest_limit:{name:'Tomatoes',max:2,unit:'kg'}};
    else if(path==='/listings')data={items:[],pages:1,total:0};
    else data={};
    await route.fulfill({json:data});
   });
   return context;
  }
  const buyerContext=await contextFor('Buyer'),farmerContext=await contextFor('Farmer');
  const buyer=await buyerContext.newPage(),farmer=await farmerContext.newPage();
  for(const page of [buyer,farmer])page.on('pageerror',error=>errors.push(error.message));
  try{
   await farmer.goto(server.base+'/requests');
   await farmer.getByRole('heading',{name:'Incoming order requests'}).waitFor();
   assert.equal(await farmer.getByRole('button',{name:'Approve',exact:true}).isDisabled(),true);
   await buyer.goto(server.base+'/requests');
   const commit=buyer.getByRole('button',{name:'Commit to request',exact:true});await commit.waitFor();assert.equal(await commit.isDisabled(),true);
   await buyer.getByRole('checkbox',{name:/I commit to buying this quantity/}).check();await commit.click();
   await buyer.getByText('Committed - awaiting farmer approval',{exact:true}).waitFor();
   assert.equal(commitments,1);assert.equal(approvals,0);assert.equal(prompts,0);
   await farmer.getByRole('button',{name:'Refresh',exact:true}).click();
   await farmer.getByRole('button',{name:'Approve',exact:true}).click();
   await farmer.getByRole('link',{name:'Contact buyer',exact:true}).waitFor();assert.equal(approvals,1);
   await buyer.goto(server.base+'/basket');
   await buyer.getByRole('heading',{name:'Approved order requests',exact:true}).waitFor();
   assert.equal(checkouts,0);assert.equal(prompts,0);
   await buyer.getByRole('button',{name:'Proceed to payment',exact:true}).click();
   const payment=buyer.getByRole('form',{name:'Payment for approved request'});
   await payment.getByRole('button',{name:'Airtel Money',exact:true}).waitFor();
   assert.equal(await payment.locator('select').count(),0);
   assert.match(await payment.innerText(),/Total to pay: MWK 1[\s\u00a0\u202f]?250/);
   await buyer.screenshot({path:`test-results/approved-request-${channel}-desktop.png`,fullPage:true});
   await buyer.setViewportSize({width:390,height:844});
   assert.ok(await buyer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await buyer.screenshot({path:`test-results/approved-request-${channel}-mobile.png`,fullPage:true});
   await payment.getByRole('button',{name:'Confirm and pay approved request',exact:true}).dblclick();
   await buyer.getByText('Payment request sent.',{exact:false}).first().waitFor();
   assert.equal(checkouts,1);assert.equal(prompts,1);
   await buyer.reload();await buyer.getByText('Payment request sent.',{exact:false}).first().waitFor();assert.equal(prompts,1);
   await buyer.evaluate(()=>localStorage.removeItem('wirefen-active-paychangu-checkout-v1'));
   await buyer.goto(server.base+'/basket');
   await buyer.getByRole('button',{name:'Continue payment',exact:true}).click();
   await buyer.getByText('Payment request sent.',{exact:false}).first().waitFor();assert.equal(checkouts,1);assert.equal(prompts,1);
   await buyer.getByRole('button',{name:'Cancel order',exact:true}).click();
   await buyer.getByRole('button',{name:'Proceed to payment',exact:true}).waitFor();
   assert.equal(buyer.url().includes('checkout='),false);
   assert.deepEqual(await buyer.evaluate(()=>JSON.parse(localStorage.getItem('wirefen-basket-v1')||'[]')),[],'bulk quantities must not enter household basket after cancellation');
   await buyer.getByRole('button',{name:'Proceed to payment',exact:true}).click();
   await buyer.getByRole('button',{name:'Confirm and pay approved request',exact:true}).click();
   await buyer.getByText('Payment request sent.',{exact:false}).first().waitFor();assert.equal(prompts,2);
   paymentStatus='paid';checkoutState='Confirmed';Object.assign(order,{status:'Confirmed',payment_status:'paid',amount_paid:1250,currency:'MWK'});
   await buyer.getByRole('button',{name:'Retry order status',exact:true}).click();
   await buyer.getByRole('heading',{name:'Payment received - order confirmed'}).waitFor();
   await buyer.getByRole('button',{name:'Start another order',exact:true}).click();
   await buyer.getByRole('heading',{name:'Your basket is empty',exact:true}).waitFor();
   assert.equal(await buyer.getByRole('button',{name:'Proceed to payment',exact:true}).count(),0);
   await buyer.goto(server.base+'/produce/produce-1');
   await buyer.getByLabel('Quantity (kg)',{exact:true}).fill('100');
   const dialog=buyer.getByRole('dialog');await dialog.getByRole('heading',{name:'Commit to an order request',exact:true}).waitFor();
   await dialog.getByLabel('Target quantity',{exact:true}).fill('100');
   await dialog.getByLabel('Target delivery dates',{exact:true}).fill('Friday');
   await dialog.getByLabel('Delivery location',{exact:true}).fill('Lilongwe City');
   await dialog.getByRole('button',{name:'Commit and send request',exact:true}).click();
   assert.equal(createdRequests,0,'a new request must require an explicit commitment checkbox');
   await dialog.getByRole('checkbox',{name:/I commit to purchasing/}).check();
   await dialog.getByRole('button',{name:'Commit and send request',exact:true}).dblclick();
   await buyer.getByRole('heading',{name:'Your order requests',exact:true}).waitFor();assert.equal(createdRequests,1);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${channel}: explicit commitment, approval blocked beforehand, approved basket, payment options, one phone request, reload, cancellation, verified payment and mobile layout.`);
  }catch(error){console.error('Buyer page:',(await buyer.locator('body').innerText()).slice(0,2500));console.error('Farmer page:',(await farmer.locator('body').innerText()).slice(0,1500));throw error;}
  await buyerContext.close();await farmerContext.close();await browser.close();browser=null;
 }
}finally{
 await browser?.close();server?.child.kill();for(const [file,contents] of originals)await writeFile(file,contents);
}
