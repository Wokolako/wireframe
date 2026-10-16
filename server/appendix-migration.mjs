import {normalizeGeography} from '../shared/geography.mjs';
import {costFields,mergeCosts} from '../shared/finance.mjs';

export async function migrateAppendices(db,postgres){
 const columns=async table=>postgres?(await db.all('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=?',[table])):(await db.all(`PRAGMA table_info(${table})`));
 const add=async(table,name,type)=>{if(!(await columns(table)).some(c=>c.name===name))await db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);};
 for(const [table,name,type] of [
  ['listings','traceability',"TEXT NOT NULL DEFAULT ''"],['listings','agent_score','REAL NOT NULL DEFAULT 0'],
  ['listings','sale_unit',"TEXT NOT NULL DEFAULT 'kg'"],
  ['order_requests','payment_status',"TEXT NOT NULL DEFAULT 'unpaid'"],['order_requests','payment_ref','TEXT'],
  ['order_requests','payment_method','TEXT'],['order_requests','amount_paid','REAL'],['order_requests','currency','TEXT']
 ])await add(table,name,type);
 for(const name of ['country','region','district','locality','ward','country_code','region_key','location_key'])await add('farmer_profiles',name,"TEXT NOT NULL DEFAULT ''");
 // SQLite cannot alter a CHECK constraint. Rebuild only the parent table, preserving every ID.
 if(postgres){await db.exec("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check; ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('Farmer','Buyer','Admin','Agent'));");}
 else {
  const row=await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
  if(!row.sql.includes("'Agent'")){
   await db.exec('PRAGMA foreign_keys=OFF');
   try{await db.transaction(async tx=>{
    await tx.run("CREATE TABLE users_appendix (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('Farmer','Buyer','Admin','Agent')), sms_opt_in INTEGER NOT NULL DEFAULT 0, sms_opt_in_at TEXT, created_at TEXT NOT NULL)");
    await tx.run('INSERT INTO users_appendix SELECT * FROM users');await tx.run('DROP TABLE users');await tx.run('ALTER TABLE users_appendix RENAME TO users');
   });}finally{await db.exec('PRAGMA foreign_keys=ON');}
   if((await db.all('PRAGMA foreign_key_check')).length)throw new Error('Foreign key validation failed after role migration.');
  }
 }
 await db.exec(`
 CREATE TABLE IF NOT EXISTS financial_estimates (
  farmer_id TEXT PRIMARY KEY REFERENCES farmer_profiles(id),
  cost_fertilizer_seeds NUMERIC, cost_labor NUMERIC, cost_processing NUMERIC, cost_transportation NUMERIC,
  avg_production_cost NUMERIC NOT NULL DEFAULT 0, legacy_total NUMERIC,
  country_code TEXT NOT NULL, region TEXT NOT NULL, locality TEXT NOT NULL, region_key TEXT NOT NULL, location_key TEXT NOT NULL,
  currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', updated_at TEXT NOT NULL,
  CHECK(cost_fertilizer_seeds>=0),CHECK(cost_labor>=0),CHECK(cost_processing>=0),CHECK(cost_transportation>=0));
 CREATE TABLE IF NOT EXISTS user_permissions (user_id TEXT NOT NULL REFERENCES users(id), permission TEXT NOT NULL, PRIMARY KEY(user_id,permission));
 CREATE TABLE IF NOT EXISTS listing_verifications (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id), agent_id TEXT NOT NULL REFERENCES users(id),
  crop_confirmed INTEGER NOT NULL DEFAULT 0,volume_confirmed INTEGER NOT NULL DEFAULT 0,
  location_confirmed INTEGER NOT NULL DEFAULT 0,harvest_confirmed INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',score INTEGER,status TEXT NOT NULL DEFAULT 'pending',updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS guest_orders (
  id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id), quantity REAL NOT NULL,
  contact_name TEXT NOT NULL, contact_phone TEXT NOT NULL, contact_email TEXT NOT NULL,
  delivery_location TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'New', created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS bulk_order_requests (
  id TEXT PRIMARY KEY, buyer_id TEXT NOT NULL REFERENCES users(id), frequency TEXT NOT NULL,
  produce_type TEXT NOT NULL, target_quantity REAL NOT NULL, quantity_unit TEXT NOT NULL,
  delivery_dates TEXT NOT NULL, target_price REAL NOT NULL, contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL, contact_email TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'New', created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS guest_order_limits (
  id TEXT PRIMARY KEY, category TEXT NOT NULL, produce_item TEXT NOT NULL UNIQUE,
  shelf_life TEXT NOT NULL, shelf_life_days INTEGER NOT NULL,
  max_quantity REAL NOT NULL, unit TEXT NOT NULL,
  requirement TEXT NOT NULL DEFAULT '', aliases TEXT NOT NULL DEFAULT '');
 `);
 await add('guest_orders','quantity_unit',"TEXT NOT NULL DEFAULT 'kg'");
 await add('guest_orders','payment_method',"TEXT NOT NULL DEFAULT 'pay_on_delivery'");
 await add('guest_orders','payment_status',"TEXT NOT NULL DEFAULT 'unpaid'");
 await add('guest_orders','unit_price','REAL');
 await add('guest_orders','currency','TEXT');
 await add('guest_orders','paid_at','TEXT');
 for(const farm of await db.all('SELECT * FROM farmer_profiles')){
  if(farm.location_key)continue;
  // Do not reinterpret an old free-text location copied into both administrative fields.
  if(!farm.region||!farm.locality||farm.region===farm.location||farm.locality===farm.location)continue;
  let geo;try{geo=normalizeGeography(farm);}catch{continue;}
  await db.run('UPDATE farmer_profiles SET country=?,country_code=?,region=?,district=?,locality=?,ward=?,region_key=?,location_key=?,location=? WHERE id=?',[geo.country,geo.country_code,geo.region,geo.district,geo.locality,geo.ward,geo.region_key,geo.location_key,geo.location,farm.id]);
 }
 const legacyColumns=await columns('historical_baselines');
 if(legacyColumns.some(c=>c.name==='avg_production_cost')){
  await db.transaction(async tx=>{
   // Read before dropping old columns; total-only legacy records remain drafts and retain their old total privately.
   const rows=await db.all('SELECT b.*,f.country_code,f.region,f.locality,f.region_key,f.location_key FROM historical_baselines b JOIN farmer_profiles f ON f.id=b.farmer_id');
   for(const row of rows){
    const costs=mergeCosts({},row);const complete=costFields.every(k=>costs[k]!==null)&&row.status==='complete'&&row.location_key;
    await tx.run(`INSERT INTO financial_estimates (farmer_id,${costFields.join(',')},avg_production_cost,legacy_total,country_code,region,locality,region_key,location_key,currency,status,updated_at) VALUES (${Array(15).fill('?')}) ON CONFLICT(farmer_id) DO NOTHING`,[row.farmer_id,...costFields.map(k=>costs[k]),costs.avg_production_cost,row.avg_production_cost??null,row.country_code,row.region,row.locality,row.region_key,row.location_key,process.env.CURRENCY||'ZAR',complete?'complete':'draft',row.updated_at]);
   }
   for(const name of [...costFields,'avg_production_cost'])if(legacyColumns.some(c=>c.name===name))await tx.run(`ALTER TABLE historical_baselines DROP COLUMN ${name}`);
  });
 }
}
