import postgres from 'pg';

const name=process.env.DATABASE_RUNTIME_USER||'wirefen_runtime';
const password=process.env.DATABASE_RUNTIME_PASSWORD;
if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(name))throw new Error('DATABASE_RUNTIME_USER must be a simple PostgreSQL role name.');
if(!password||password.length<24)throw new Error('DATABASE_RUNTIME_PASSWORD must be at least 24 characters.');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL must use the migration-owner role for runtime grants.');
const quoteIdentifier=value=>`"${value.replace(/"/g,'""')}"`;
const quoteLiteral=value=>`'${value.replace(/'/g,"''")}'`;
const {Pool}=postgres;
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});

try{
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const owner=(await client.query('SELECT current_user, current_database()')).rows[0];
  const existing=await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[name]);
  if(existing.rowCount)await client.query(`ALTER ROLE ${quoteIdentifier(name)} LOGIN PASSWORD ${quoteLiteral(password)}`);
  else await client.query(`CREATE ROLE ${quoteIdentifier(name)} LOGIN PASSWORD ${quoteLiteral(password)}`);
  await client.query(`GRANT CONNECT ON DATABASE ${quoteIdentifier(owner.current_database)} TO ${quoteIdentifier(name)}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(name)}`);
  await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(name)}`);
  await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(owner.current_user)} IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${quoteIdentifier(name)}`);
  await client.query('COMMIT');
 }catch(error){
  await client.query('ROLLBACK');
  throw error;
 }finally{client.release();}
 console.log(`Granted data-only access to PostgreSQL role ${name}.`);
}catch(error){
 console.error(`Runtime role provisioning failed: ${error.message}`);
 process.exitCode=1;
}finally{await pool.end();}
