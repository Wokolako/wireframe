import {migrateAppendices} from './appendix-migration.mjs';
import {migrateBusinessSchema,migrateGuestLimitIdentity,migratePayChanguCheckout,migrateCommittedOrders} from './business-migration.mjs';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {Pool as NeonPool,neonConfig} from '@neondatabase/serverless';
import postgres from 'pg';
let pool, sqlite;
let transactionQueue=Promise.resolve();
const backendEnabled=process.env.USE_BACKEND??process.env.NEXT_PUBLIC_USE_BACKEND;
const explicitLocalSqlite=process.env.DATABASE_DRIVER==='sqlite'&&process.env.NODE_ENV!=='production';
if (!process.env.DATABASE_URL && (process.env.NODE_ENV==='production' || backendEnabled==='true' && process.env.SQLITE_PATH!==':memory:'&&!explicitLocalSqlite)) {
  throw new Error('DATABASE_URL is required for the live Wirefen backend. Configure Neon before starting the API.');
}
if (process.env.DATABASE_URL) {
  const driver=process.env.DATABASE_DRIVER;
  if(!['postgres','neon'].includes(driver))throw new Error('Set DATABASE_DRIVER explicitly to "postgres" or "neon".');
  if(driver==='neon'){
    neonConfig.webSocketConstructor=WebSocket;
    pool = new NeonPool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  }else{
    const {Pool}=postgres;
    pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  }
}
else { const { DatabaseSync } = await import('node:sqlite'); mkdirSync('data', { recursive: true }); sqlite = new DatabaseSync(process.env.SQLITE_PATH || resolve('data/wirefen.sqlite')); sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;'); }
const sql = s => { let i = 0; return s.replace(/\?/g, () => `$${++i}`); };
export const db = {
  async all(s, p = []) { return pool ? (await pool.query(sql(s), p)).rows : sqlite.prepare(s).all(...p); },
  async get(s, p = []) { return (await this.all(s, p))[0]; },
  async run(s, p = []) { return pool ? pool.query(sql(s), p) : sqlite.prepare(s).run(...p); },
  async exec(s) { return pool ? pool.query(s) : sqlite.exec(s); },
  async transaction(work) {
    if(pool){const client=await pool.connect();try{await client.query('BEGIN');const tx={all:async(s,p=[]) => (await client.query(sql(s),p)).rows,get:async(s,p=[]) => (await client.query(sql(s),p)).rows[0],run:(s,p=[])=>client.query(sql(s),p)};const result=await work(tx);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
    const previous=transactionQueue;let release;transactionQueue=new Promise(resolve=>{release=resolve;});await previous;
    try{sqlite.exec('BEGIN IMMEDIATE');try{const result=await work(this);sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}finally{release();}
  },
  async close() { if(pool) await pool.end(); else sqlite.close(); }
};
async function createBaseSchema(){
  await db.exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('Farmer','Buyer','Admin','Agent')), sms_opt_in INTEGER NOT NULL DEFAULT 0, sms_opt_in_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clerk_identities (clerk_user_id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id));
CREATE TABLE IF NOT EXISTS pwa_visitors (id TEXT PRIMARY KEY, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, prompted_at TEXT, dismissed_at TEXT, installed_at TEXT);
CREATE TABLE IF NOT EXISTS pwa_accounts (user_id TEXT PRIMARY KEY REFERENCES users(id), prompted_at TEXT, dismissed_at TEXT, installed_at TEXT);
CREATE TABLE IF NOT EXISTS farmer_profiles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id), farm_name TEXT NOT NULL, country TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', district TEXT, locality TEXT NOT NULL DEFAULT '', ward TEXT, location TEXT NOT NULL DEFAULT '', farm_size REAL NOT NULL DEFAULT 0 CHECK(farm_size >= 0), verification_status TEXT NOT NULL DEFAULT 'Unverified');
CREATE TABLE IF NOT EXISTS historical_baselines (farmer_id TEXT PRIMARY KEY REFERENCES farmer_profiles(id), crop_type TEXT, avg_land_size REAL, avg_yield_per_acre REAL, avg_duration_days INTEGER, status TEXT NOT NULL DEFAULT 'draft', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS listings (id TEXT PRIMARY KEY, farmer_id TEXT NOT NULL REFERENCES farmer_profiles(id), produce_id TEXT, title TEXT NOT NULL, crop_category TEXT NOT NULL, available_volume REAL NOT NULL CHECK(available_volume >= 0), sale_unit TEXT NOT NULL DEFAULT 'kg', price REAL NOT NULL CHECK(price > 0), price_minor INTEGER, currency TEXT, harvest_date TEXT NOT NULL, expiration_date TEXT NOT NULL, shelf_life_days INTEGER NOT NULL CHECK(shelf_life_days > 0), preservative_used INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL DEFAULT '', image TEXT NOT NULL, images TEXT, traceability TEXT NOT NULL DEFAULT '', agent_score REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_requests (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id), buyer_id TEXT NOT NULL REFERENCES users(id), volume REAL NOT NULL CHECK(volume > 0), delivery_location TEXT NOT NULL, notes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'New', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sms_consents (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), opted_in INTEGER NOT NULL, recorded_at TEXT NOT NULL, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversational_state (user_phone TEXT PRIMARY KEY REFERENCES users(phone), current_form_id TEXT, last_question_asked TEXT, timestamp TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sms_messages (message_sid TEXT PRIMARY KEY, received_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS listing_drafts (farmer_id TEXT PRIMARY KEY REFERENCES farmer_profiles(id), payload TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES order_requests(id), buyer_id TEXT NOT NULL REFERENCES users(id), amount REAL NOT NULL, currency TEXT NOT NULL, method TEXT NOT NULL, provider TEXT NOT NULL, account_or_phone TEXT NOT NULL, bank_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'completed', reference TEXT NOT NULL UNIQUE, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ussd_sessions (session_id TEXT PRIMARY KEY, phone_number TEXT NOT NULL, step TEXT NOT NULL DEFAULT 'welcome', data TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS listings_category_idx ON listings(crop_category,harvest_date);
CREATE INDEX IF NOT EXISTS orders_buyer_idx ON order_requests(buyer_id);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments(order_id);
CREATE INDEX IF NOT EXISTS payments_buyer_idx ON payments(buyer_id);
`);
}

export async function migrateDb(){
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)`);
  const applied=async version=>!!(await db.get('SELECT version FROM schema_migrations WHERE version=?',[version]));
  if(!await applied(1)){
    await createBaseSchema();
    await db.run("INSERT INTO schema_migrations (version,name,applied_at) VALUES (1,'base-schema',?)",[new Date().toISOString()]);
  }
  if(!await applied(2)){
    await migrateAppendices(db,!!pool);
    await db.run("INSERT INTO schema_migrations (version,name,applied_at) VALUES (2,'legacy-appendices',?)",[new Date().toISOString()]);
  }
  if(!await applied(3)){
    await migrateBusinessSchema(db,!!pool);
    await db.run("INSERT INTO schema_migrations (version,name,applied_at) VALUES (3,'business-invariants-and-audit',?)",[new Date().toISOString()]);
  }
  if(!await applied(4)){
    await migrateBusinessSchema(db,!!pool);
    await db.run("INSERT INTO schema_migrations (version,name,applied_at) VALUES (4,'catalogue-identity-and-checkout-headers',?)",[new Date().toISOString()]);
  }
  if(!await applied(5)){
    await migrateGuestLimitIdentity(db,!!pool);
    await db.run("INSERT INTO schema_migrations (version,name,applied_at) VALUES (5,'guest-limit-catalogue-identity',?)",[new Date().toISOString()]);
  }
  if(!await applied(6)){
    await migratePayChanguCheckout(db,!!pool);
    await db.run("INSERT INTO schema_migrations (version,name,applied_at) VALUES (6,'paychangu-checkout-fields',?)",[new Date().toISOString()]);
  }
  if(!await applied(7)){
    try{
      if(pool)await db.exec('ALTER TABLE listings ADD COLUMN IF NOT EXISTS images TEXT');
      else{try{await db.exec('ALTER TABLE listings ADD COLUMN images TEXT');}catch{}}
    }catch{}
    await db.run("INSERT INTO schema_migrations (version,name,applied_at) VALUES (7,'listing-images-column',?)",[new Date().toISOString()]);
  }
  if(!await applied(8)){
    await migrateCommittedOrders(db,!!pool);
    await db.run("INSERT INTO schema_migrations (version,name,applied_at) VALUES (8,'buyer-commitment-and-approved-request-checkout',?)",[new Date().toISOString()]);
  }
}

export async function assertDbSchema(){
  try{
    const migration=await db.get('SELECT MAX(version) AS version FROM schema_migrations');
    if(Number(migration?.version)<8)throw new Error('database migrations are incomplete');
    await db.all('SELECT produce_id FROM guest_order_limits LIMIT 0');
  }catch(error){
    throw new Error('Wirefen database schema is not ready. Run `npm run db:migrate` before starting the application.',{cause:error});
  }
}

export const initDb=migrateDb;
