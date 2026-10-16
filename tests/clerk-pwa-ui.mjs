import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.TEST_URL||'http://127.0.0.1:3000';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 const cfg=await (await fetch(base+'/api/v1/config')).json();assert.equal(cfg.auth_provider,'clerk');assert.ok(cfg.clerk_publishable_key?.startsWith('pk_'));assert.ok(!JSON.stringify(cfg).includes('sk_test'));
 for(const path of ['login','register','demo'])assert.equal((await fetch(base+'/api/v1/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,410);
 assert.equal((await fetch(base+'/api/v1/auth/onboard',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(base+'/api/v1/farmers')).status,401);
 await page.goto(base);await page.getByRole('heading',{name:'The marketplace'}).waitFor();await page.waitForFunction(()=>window.Clerk?.loaded,{timeout:60000});
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.cl-signIn-root').waitFor({timeout:30000});await page.screenshot({path:'test-results/clerk-sign-in.png',fullPage:true});
 await page.evaluate(()=>window.Clerk.closeSignIn());await page.getByRole('button',{name:'Create account',exact:true}).click();await page.locator('.cl-signUp-root').waitFor({timeout:30000});await page.screenshot({path:'test-results/clerk-sign-up.png',fullPage:true});await page.evaluate(()=>window.Clerk.closeSignUp());
 await page.locator('.sidebar-utilities').getByRole('link',{name:'Get app'}).click();await page.getByRole('heading',{name:'Get the Wirefen app'}).waitFor();await page.screenshot({path:'test-results/get-app-desktop.png',fullPage:true});
 await page.evaluate(()=>{window.__prompted=false;const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.__prompted=true;};e.userChoice=Promise.resolve({outcome:'dismissed'});dispatchEvent(e);});await page.getByRole('button',{name:'Install Wirefen',exact:true}).click();assert.equal(await page.evaluate(()=>window.__prompted),true);await page.getByText('No problem. You can install Wirefen whenever you’re ready.').waitFor();
 await page.evaluate(()=>dispatchEvent(new Event('appinstalled')));await page.getByText('You’re using the installed app.').waitFor();
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/#/marketplace');await page.locator('.produce-card').first().waitFor();await page.screenshot({path:'test-results/pwa-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Get app'}).click();await page.getByRole('heading',{name:'Get the Wirefen app'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/get-app-mobile.png',fullPage:true});
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'Get the Wirefen app'}).waitFor();await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Market',exact:true}).click();await page.locator('.produce-card').first().waitFor();await context.setOffline(false);
 assert.deepEqual(errors,[]);console.log('PASS: live Clerk sign-in/sign-up render, legacy auth disabled, anonymous protected routes denied, install/dismiss/installed states, mobile navigation, offline PWA reload and catalogue.');
}catch(error){await page.screenshot({path:'test-results/clerk-pwa-failure.png',fullPage:true});console.log('Browser errors:',errors);console.log('Visible text:',await page.locator('body').innerText());throw error;}finally{await browser.close();}
