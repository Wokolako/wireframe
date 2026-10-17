export async function loadTestApi(){
  const database=await import('../../server/db.mjs');
  await database.migrateDb();
  const application=await import('../../server/index.mjs');
  return {...database,...application};
}
