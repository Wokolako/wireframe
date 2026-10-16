import assert from 'node:assert/strict';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
if(!new URL(process.env.DATABASE_URL).hostname.endsWith('.neon.tech'))throw new Error('The live test requires Neon.');
process.env.NODE_ENV='test';
const {app}=await import('../server/index.mjs');
const {db}=await import('../server/db.mjs');
const server=app.listen(0,'127.0.0.1');
try {
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api/v1`;
  const get=async path=>{
    const response=await fetch(base+path);
    assert.equal(response.status,200,`${path} failed`);
    return response.json();
  };
  assert.equal((await get('/health')).status,'ok');
  assert.equal((await get('/config')).demo,false);
  const limits=await get('/guest-limits');
  assert.equal(limits.length,44);
  const listings=await get('/listings');
  assert.ok(Array.isArray(listings));
  for(const item of listings){
    assert.equal(item.verified,true);
    for(const key of ['farm_name','farmer_id','location','region','country','available_volume'])assert.equal(key in item,false);
  }
  console.log(`PASS: live Neon API healthy; ${limits.length} caps; ${listings.length} private-safe public listings.`);
} finally {
  await new Promise(resolve=>server.close(resolve));
  await db.close();
}
