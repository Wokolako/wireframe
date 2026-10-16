import {Pool,neonConfig} from '@neondatabase/serverless';
neonConfig.webSocketConstructor=WebSocket;

const urls=[['pooled',process.env.DATABASE_URL],['direct',process.env.DATABASE_URL_UNPOOLED]].filter(([,url])=>url);
if(!urls.length)throw new Error('DATABASE_URL is required.');
for(const [,url] of urls)if(!new URL(url).hostname.endsWith('.neon.tech'))throw new Error('Database URL does not point to Neon.');

let connected=false;
for(const [endpoint,url] of urls) {
  const pool=new Pool({connectionString:url,connectionTimeoutMillis:15000,query_timeout:10000});
  try {
    const result=await pool.query(`SELECT
    current_database() AS database,
    to_regclass('public.farmer_profiles') IS NOT NULL AS farmers,
    to_regclass('public.listings') IS NOT NULL AS listings,
    to_regclass('public.guest_order_limits') IS NOT NULL AS limits,
    to_regclass('public.guest_orders') IS NOT NULL AS guest_orders,
    to_regclass('public.bulk_order_requests') IS NOT NULL AS bulk_orders`);
    const {database,...tables}=result.rows[0];
    console.log(`Connected to Neon ${endpoint} endpoint, database ${database}.`);
    for(const [name,exists] of Object.entries(tables))console.log(`${name}: ${exists?'ready':'missing'}`);
    const columns=await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='guest_orders'");
    const names=new Set(columns.rows.map(row=>row.column_name));
    const checkoutReady=['payment_method','payment_status','unit_price','currency','paid_at'].every(name=>names.has(name));
    console.log(`pay-on-delivery columns: ${checkoutReady?'ready':'missing'}`);
    const limits=await pool.query('SELECT COUNT(*) AS count FROM guest_order_limits');
    console.log(`household limit rows: ${limits.rows[0].count}`);
    connected=true;
    if(endpoint==='direct'){
      console.error('The app uses DATABASE_URL, so its pooled endpoint must also be reachable.');
      process.exitCode=1;
    }
    if(Object.values(tables).some(exists=>!exists))process.exitCode=1;
    if(!checkoutReady||Number(limits.rows[0].count)!==44)process.exitCode=1;
    break;
  } catch(error) {
    console.error(`Neon ${endpoint} endpoint failed: ${error.code||error.message||'unknown error'}`);
  } finally {
    await pool.end();
  }
}
if(!connected)process.exitCode=1;
