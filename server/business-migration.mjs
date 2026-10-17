import {legacyProduce} from '../shared/catalogue.mjs';

const columns=async(db,table,postgres)=>postgres
  ? db.all('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=?',[table])
  : db.all(`PRAGMA table_info(${table})`);
const add=async(db,table,name,type,postgres)=>{if(!(await columns(db,table,postgres)).some(column=>column.name===name))await db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);};

async function allowZeroInventory(db,postgres){
  if(postgres){
    await db.exec('ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_available_volume_check; ALTER TABLE listings ADD CONSTRAINT listings_available_volume_check CHECK(available_volume >= 0);');
    return;
  }
  const definition=await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='listings'");
  if(!definition?.sql||/available_volume\s*>=\s*0/i.test(definition.sql))return;
  await db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try{
    await db.exec(`CREATE TABLE listings_migration (
      id TEXT PRIMARY KEY, farmer_id TEXT NOT NULL REFERENCES farmer_profiles(id), produce_id TEXT,
      title TEXT NOT NULL, crop_category TEXT NOT NULL, available_volume REAL NOT NULL CHECK(available_volume >= 0),
      sale_unit TEXT NOT NULL DEFAULT 'kg', price REAL NOT NULL CHECK(price > 0), price_minor INTEGER,
      currency TEXT, harvest_date TEXT NOT NULL, expiration_date TEXT NOT NULL,
      shelf_life_days INTEGER NOT NULL CHECK(shelf_life_days > 0), preservative_used INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '', image TEXT NOT NULL, traceability TEXT NOT NULL DEFAULT '',
      agent_score REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published', created_at TEXT NOT NULL
    );
    INSERT INTO listings_migration (id,farmer_id,title,crop_category,available_volume,sale_unit,price,harvest_date,expiration_date,shelf_life_days,preservative_used,description,image,traceability,agent_score,status,created_at)
      SELECT id,farmer_id,title,crop_category,available_volume,sale_unit,price,harvest_date,expiration_date,shelf_life_days,preservative_used,description,image,traceability,agent_score,status,created_at FROM listings;
    DROP TABLE listings;
    ALTER TABLE listings_migration RENAME TO listings;
    CREATE INDEX IF NOT EXISTS listings_category_idx ON listings(crop_category,harvest_date);`);
    await db.exec('COMMIT');
  }catch(error){
    await db.exec('ROLLBACK');
    throw error;
  }finally{
    await db.exec('PRAGMA foreign_keys=ON');
  }
}

export async function migrateBusinessSchema(db,postgres){
  await allowZeroInventory(db,postgres);
  for(const [table,name,type] of [
    ['listings','produce_id','TEXT'],['listings','price_minor','BIGINT'],['listings','currency',"TEXT"],
    ['guest_order_limits','produce_id','TEXT'],['guest_orders','produce_id','TEXT'],['guest_orders','checkout_id','TEXT'],
    ['guest_orders','unit_price_minor','BIGINT'],['guest_orders','line_total_minor','BIGINT']
  ])await add(db,table,name,type,postgres);
  const missingListingCurrency=await db.get("SELECT COUNT(*) AS count FROM listings WHERE currency IS NULL OR currency=''");
  const missingOrderCurrency=await db.get("SELECT COUNT(*) AS count FROM guest_orders WHERE currency IS NULL OR currency=''");
  const legacyCurrency=process.env.LEGACY_PRICE_CURRENCY;
  if((Number(missingListingCurrency.count)||Number(missingOrderCurrency.count))&&!/^[A-Z]{3}$/.test(legacyCurrency||''))throw new Error('Set LEGACY_PRICE_CURRENCY to the actual currency of existing unlabelled prices before migrating.');
  const moneyCurrency=legacyCurrency||process.env.CURRENCY||'ZAR';
  await db.run('UPDATE listings SET currency=? WHERE currency IS NULL OR currency=\'\'',[moneyCurrency]);
  await db.exec('UPDATE listings SET price_minor=CAST(ROUND(price*100) AS INTEGER) WHERE price_minor IS NULL');
  await db.run('UPDATE guest_orders SET currency=? WHERE currency IS NULL OR currency=\'\'',[moneyCurrency]);
  await db.exec('UPDATE guest_orders SET unit_price_minor=CAST(ROUND(unit_price*100) AS INTEGER) WHERE unit_price_minor IS NULL AND unit_price IS NOT NULL');
  await db.exec(`UPDATE guest_orders SET unit_price_minor=(SELECT price_minor FROM listings WHERE listings.id=guest_orders.listing_id)
    WHERE unit_price_minor IS NULL`);
  await db.exec('UPDATE guest_orders SET line_total_minor=CAST(ROUND(quantity*unit_price_minor) AS INTEGER) WHERE line_total_minor IS NULL AND unit_price_minor IS NOT NULL');

  const limits=await db.all('SELECT produce_item FROM guest_order_limits');
  for(const row of limits){
    const produce=legacyProduce(row.produce_item);
    if(produce)await db.run('UPDATE guest_order_limits SET produce_id=? WHERE produce_item=?',[produce.id,row.produce_item]);
  }
  const listings=await db.all('SELECT id,title FROM listings WHERE produce_id IS NULL');
  for(const row of listings){
    const produce=legacyProduce(row.title);
    if(produce)await db.run('UPDATE listings SET produce_id=? WHERE id=?',[produce.id,row.id]);
  }
  await db.exec(`UPDATE guest_orders SET produce_id=(SELECT produce_id FROM listings WHERE listings.id=guest_orders.listing_id)
    WHERE produce_id IS NULL`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS guest_order_checkouts (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE,
      request_fingerprint TEXT,
      response_json TEXT,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      delivery_location TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL DEFAULT 'pay_on_delivery',
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      currency TEXT NOT NULL,
      total_minor BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'New',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
  `);
  await add(db,'guest_orders','checkout_id','TEXT',postgres);
  if(postgres){
    await db.exec(`INSERT INTO guest_order_checkouts (id,contact_name,contact_phone,contact_email,delivery_location,notes,currency,total_minor,status,created_at)
      SELECT 'legacy-'||id,contact_name,contact_phone,contact_email,delivery_location,notes,COALESCE(currency,'ZAR'),COALESCE(line_total_minor,0),status,created_at
      FROM guest_orders WHERE checkout_id IS NULL ON CONFLICT(id) DO NOTHING`);
  }else{
    await db.exec(`INSERT OR IGNORE INTO guest_order_checkouts (id,contact_name,contact_phone,contact_email,delivery_location,notes,currency,total_minor,status,created_at)
      SELECT 'legacy-'||id,contact_name,contact_phone,contact_email,delivery_location,notes,COALESCE(currency,'ZAR'),COALESCE(line_total_minor,0),status,created_at
      FROM guest_orders WHERE checkout_id IS NULL`);
  }
  await db.exec("UPDATE guest_orders SET checkout_id='legacy-'||id WHERE checkout_id IS NULL");
  await db.exec("UPDATE guest_order_checkouts SET payment_status='paid' WHERE EXISTS (SELECT 1 FROM guest_orders g WHERE g.checkout_id=guest_order_checkouts.id) AND NOT EXISTS (SELECT 1 FROM guest_orders g WHERE g.checkout_id=guest_order_checkouts.id AND g.payment_status!='paid')");
  await db.exec('CREATE INDEX IF NOT EXISTS guest_orders_checkout_idx ON guest_orders(checkout_id); CREATE INDEX IF NOT EXISTS listings_availability_idx ON listings(status,expiration_date,available_volume);');
}

export async function migrateGuestLimitIdentity(db,postgres){
  await add(db,'guest_order_limits','produce_id','TEXT',postgres);
  const limits=await db.all('SELECT produce_item FROM guest_order_limits WHERE produce_id IS NULL');
  for(const row of limits){
    const produce=legacyProduce(row.produce_item);
    if(produce)await db.run('UPDATE guest_order_limits SET produce_id=? WHERE produce_item=?',[produce.id,row.produce_item]);
  }
}

export async function migratePayChanguCheckout(db,postgres){
  await add(db,'guest_order_checkouts','provider_charge_id','TEXT',postgres);
  await add(db,'guest_order_checkouts','provider_reference','TEXT',postgres);
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS guest_checkout_provider_charge_idx ON guest_order_checkouts(provider_charge_id)');
}
