import {test,after} from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV='test';
process.env.DATABASE_DRIVER='sqlite';
process.env.SQLITE_PATH=':memory:';
delete process.env.DATABASE_URL;

const {db,migrateDb,assertDbSchema}=await import('../server/db.mjs');
const {loadLimitsFromDb,guestLimitFor}=await import('../shared/guest-limits.mjs');
after(()=>db.close());

test('migration repairs missing guest limit catalogue identity and schema check catches stale databases',async()=>{
 await migrateDb();
 await db.run(`INSERT INTO guest_order_limits
   (id,category,produce_item,shelf_life,shelf_life_days,max_quantity,unit,requirement,aliases)
   VALUES ('limit-maize','Grains','Golden yellow maize','Long',30,50,'kg','','')`);
 await db.exec('ALTER TABLE guest_order_limits DROP COLUMN produce_id');
 await db.run('DELETE FROM schema_migrations WHERE version=5');

 await assert.rejects(assertDbSchema,/Run \`npm run db:migrate\`/);

 await migrateDb();
 await assertDbSchema();
 await loadLimitsFromDb(db);
 assert.equal(guestLimitFor('crop-001')?.name,'Golden yellow maize');
 assert.equal((await db.get("SELECT produce_id FROM guest_order_limits WHERE id='limit-maize'")).produce_id,'crop-001');
 const paymentColumns=await db.all('SELECT provider_charge_id,provider_reference FROM guest_order_checkouts LIMIT 0');
 assert.deepEqual(paymentColumns,[]);
});
