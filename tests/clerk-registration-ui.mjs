import {chromium} from 'playwright';
import {clerkSetup,setupClerkTestingToken} from '@clerk/testing/playwright';
import {clerkClient} from '@clerk/express';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
if(!process.env.CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_'))throw new Error('Run only against a Clerk development instance.');
const email=`wirefen-qa+clerk_test_${Date.now()}@example.com`,password=randomBytes(24).toString('base64url')+'aA9!';
await clerkSetup();
const browser=await chromium.launch({channel:'chrome',headless:true});let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await setupClerkTestingToken({context});await context.addInitScript(()=>localStorage.setItem('wirefen-install-v1',JSON.stringify({promptedAt:new Date().toISOString()})));
 page=await context.newPage();const requests=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/v1'))requests.push(r.url());});await page.route('**/api/v1/**',r=>r.abort());
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:3000');await page.waitForFunction(()=>window.Clerk?.loaded);
 await page.getByRole('button',{name:'Create account',exact:true}).click();await page.locator('.cl-signUp-root').waitFor();await page.locator('input[name=emailAddress]').fill(email);await page.locator('input[name=password]').fill(password);
 for(const [name,value] of [['firstName','Wirefen'],['lastName','Test']])if(await page.locator(`input[name=${name}]`).isVisible())await page.locator(`input[name=${name}]`).fill(value);
 await page.locator('.cl-signUp-root').getByRole('button',{name:'Continue',exact:true}).click();
 const otp=page.getByRole('textbox',{name:'Enter verification code'});await otp.waitFor({timeout:30000});await otp.pressSequentially('424242');
 await page.getByRole('heading',{name:'Find your place in the harvest.'}).waitFor({timeout:30000});
 await page.getByLabel('Full name',{exact:true}).fill('Wirefen Test');await page.getByLabel(/^Contact phone number/).fill('+12015550101');await page.getByRole('button',{name:'Complete my account'}).click();await page.locator('.profile-name').waitFor();assert.match(await page.locator('.profile-name').innerText(),/Buyer/);await page.locator('.produce-card').first().waitFor();assert.equal(await page.locator('.produce-card').count(),6);
 await page.locator('.profile-menu summary').click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForFunction(()=>window.Clerk?.loaded&&!window.Clerk.session);await page.reload();await page.waitForFunction(()=>window.Clerk?.loaded);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.cl-signIn-root').waitFor();await page.locator('.cl-signIn-root input[name=identifier]').fill(email);await page.locator('.cl-signIn-root').getByRole('button',{name:'Continue',exact:true}).click();
 const pass=page.locator('.cl-signIn-root input[name=password]');await pass.waitFor();await pass.fill(password);await page.locator('.cl-signIn-root').getByRole('button',{name:'Continue',exact:true}).click();
 await page.locator('.profile-name').waitFor({timeout:30000});assert.match(await page.locator('.profile-name').innerText(),/Buyer/);assert.equal(await page.getByRole('link',{name:'Admin assist',exact:true}).count(),0);
 await page.reload();await page.locator('.profile-name').waitFor({timeout:30000});assert.match(await page.locator('.profile-name').innerText(),/Buyer/);
 assert.deepEqual(requests,[]);console.log('PASS: real Clerk registration, email verification, local profile onboarding, logout, password login and session persistence after reload; dummy catalogue; no Wirefen API calls.');
}catch(error){if(page)await page.screenshot({path:'test-results/clerk-registration-failure.png'});throw error;}
finally{
 await browser.close();
 const users=await clerkClient.users.getUserList({emailAddress:[email]});for(const user of users.data)await clerkClient.users.deleteUser(user.id);
 console.log('Temporary Clerk test user cleaned up.');
}
