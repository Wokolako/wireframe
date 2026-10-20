export async function loadTestApi(){
  // API tests must not depend on a public exchange provider or network access.
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,options)=>{
    if(String(input).startsWith('https://api.frankfurter.dev/')){
      const date=new Date().toISOString().slice(0,10);
      return new Response(JSON.stringify(Object.entries({USD:1.16,MWK:2000,ZMW:24,ZAR:20,GBP:0.86}).map(([quote,rate])=>({base:'EUR',quote,rate,date}))),{headers:{'Content-Type':'application/json'}});
    }
    return originalFetch(input,options);
  };
  process.env.PAYCHANGU_SECRET_KEY = process.env.PAYCHANGU_SECRET_KEY || 'test-paychangu-secret';
  process.env.PAYCHANGU_TEST_MODE = process.env.PAYCHANGU_TEST_MODE || 'true';
  const database=await import('../../server/db.mjs');
  await database.migrateDb();
  const application=await import('../../server/index.mjs');
  return {...database,...application};
}
