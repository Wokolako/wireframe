// Isolated rendering of the real Admin component; no accounts or database writes.
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';

const bundle = await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ProducePriceReferences} from './src/ProducePriceReferences';createRoot(document.getElementById('root')).render(React.createElement(ProducePriceReferences));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',jsx:'automatic'});
const root = resolve('src');
const css = await readFile(resolve(root,'styles.css'),'utf8');
const server = createServer(async (req,res) => {
  try {
    if(req.url === '/component.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
    if(req.url === '/__price-reference-test'){
      res.setHeader('Content-Type','text/html');
      res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${css}</style><title>Price reference check</title></head><body><main id="root"></main><script type="module" src="/component.js"></script></body></html>`);return;
    }
    const file = resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+sep))throw Error('Invalid path');
    res.setHeader('Content-Type',({'.css':'text/css','.woff2':'font/woff2','.woff':'font/woff'})[extname(file)]||'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.writeHead(404);res.end('Not found');}
});
let browser;
try {
  server.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/__price-reference-test`);
  await page.getByRole('heading',{name:'Produce price references'}).waitFor();
  assert.equal(await page.locator('tbody tr').count(),44);
  await page.getByLabel('Search price references').fill('tomato');
  assert.equal(await page.locator('tbody tr').count(),1);
  assert.match(await page.locator('tbody').innerText(),/£1\.80.*£2\.20/);
  assert.match(await page.locator('tbody').innerText(),/2,600.*end unreadable/);
  await page.getByLabel('Price reference category').selectOption('Beverages & Nuts');
  await page.getByText('No price references match.',{exact:false}).waitFor();
  await page.getByLabel('Search price references').fill('');
  assert.equal(await page.locator('tbody tr').count(),3);
  assert.match(await page.locator('tbody').innerText(),/£22\.00.*end unreadable/);
  await page.getByLabel('Price reference category').selectOption('');
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/produce-prices-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile viewport overflows');
  await page.getByRole('region',{name:'Produce price reference table'}).focus();
  await page.keyboard.press('ArrowRight');
  await page.screenshot({path:'test-results/produce-prices-mobile.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: 44 references, search/category/empty states, incomplete prices, desktop/mobile layout.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
