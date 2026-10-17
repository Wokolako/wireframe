import {db,migrateDb} from './db.mjs';

try{
  await migrateDb();
  const result=await db.get('SELECT MAX(version) AS version FROM schema_migrations');
  console.log(`Wirefen database schema migrated to version ${result.version}.`);
}catch(error){
  console.error(`Database migration failed: ${error.message}`);
  process.exitCode=1;
}finally{
  await db.close();
}
