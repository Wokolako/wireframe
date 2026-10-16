import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base='http://127.0.0.1:3012';
const child=spawn(process.execPath,['server/index.mjs'],{
  env:{...process.env,DATABASE_URL:'',VITE_USE_BACKEND:'false',CLERK_SECRET_KEY:'',CLERK_PUBLISHABLE_KEY:'',VITE_CLERK_PUBLISHABLE_KEY:'',PORT:'3012',SQLITE_PATH:':memory:',NODE_ENV:'development',SEED_DEMO:'true'},
  stdio:'pipe'
});
let browser;
try {
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
    try{if((await fetch(base+'/api/v1/health')).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!ready)throw new Error('Isolated test API did not start.');
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await page.getByRole('heading',{name:'The marketplace'}).waitFor();
  await page.locator('.produce-card').first().waitFor();
  assert.equal(await page.locator('.produce-card').count(),4);
  assert.doesNotMatch(await page.locator('.produce-grid').innerText(),/Mokoena|Limpopo|kg available/i);
  assert.equal(await page.getByText('From a verified farm').count(),4);
  assert.equal(await page.getByText('Sustainability first').count(),4);
  await page.locator('.produce-card').filter({hasText:'Avocados'}).getByRole('button',{name:'Add 1 fruits to basket'}).click();
  await page.getByRole('heading',{name:'Your basket'}).waitFor();
  await page.getByLabel('Quantity for Avocados').fill('15');
  await page.getByRole('heading',{name:'Bulk order request'}).waitFor();
  await page.getByRole('button',{name:'Close bulk request'}).click();
  await page.getByLabel('Quantity for Avocados').fill('2');
  await page.getByLabel('Full name').fill('Guest Buyer');
  await page.getByLabel('Phone with country code').fill('+265991112252');
  await page.getByLabel('Email').fill('guest.browser@example.com');
  await page.getByLabel('Delivery location').fill('Lilongwe City');
  await page.getByRole('button',{name:'Place order · pay on delivery'}).click();
  await page.getByRole('heading',{name:'Order received'}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS: private storefront, badges, fruit cap redirect, guest delivery checkout, mobile layout.');
} finally {
  await browser?.close();
  child.kill();
}
