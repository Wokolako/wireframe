export async function loadTestApi(){
  process.env.PAYCHANGU_SECRET_KEY = process.env.PAYCHANGU_SECRET_KEY || 'test-paychangu-secret';
  process.env.PAYCHANGU_TEST_MODE = process.env.PAYCHANGU_TEST_MODE || 'true';
  const database=await import('../../server/db.mjs');
  await database.migrateDb();
  const application=await import('../../server/index.mjs');
  return {...database,...application};
}
