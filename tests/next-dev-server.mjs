import {spawn,spawnSync} from 'node:child_process';
import {rm,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

export async function startNextDev({port,backend=true,seed=true}){
 const base=`http://127.0.0.1:${port}`;
 const databasePath=join(tmpdir(),`wirefen-next-${process.pid}-${randomUUID()}.sqlite`);
 const distDir=`.next-test-${port}-${process.pid}-${randomUUID()}`;
 const environment={...process.env,DATABASE_URL:'',DATABASE_DRIVER:'sqlite',SQLITE_PATH:databasePath,NODE_ENV:'test',USE_BACKEND:String(backend)};
 const migration=spawnSync(process.execPath,[resolve('server/migrate.mjs')],{env:environment,encoding:'utf8'});
 if(migration.error||migration.status!==0)throw new Error(`Next.js test database migration failed.\n${migration.stderr||migration.error?.message||migration.stdout}`);
 const child=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{
  env:{
   ...environment,
   NEXT_PUBLIC_USE_BACKEND:String(backend),
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:'',
   CLERK_PUBLISHABLE_KEY:'',
   CLERK_SECRET_KEY:'',
   PORT:String(port),
   NODE_ENV:'development',
   SEED_DEMO:String(seed),
   NEXT_DIST_DIR:distDir,
  },
  stdio:'pipe',
 });
 let output='';
 child.stdout.on('data',chunk=>{output+=chunk;});
 child.stderr.on('data',chunk=>{output+=chunk;});
 child.once('exit',()=>{for(const suffix of ['', '-wal', '-shm'])void unlink(databasePath+suffix).catch(error=>{if(error.code!=='ENOENT')console.error(`Could not remove test database ${databasePath+suffix}: ${error.message}`);});void rm(resolve(distDir),{recursive:true,force:true}).catch(error=>console.error(`Could not remove test build directory ${distDir}: ${error.message}`));});
 for(let attempt=0;attempt<120;attempt++){
  if(child.exitCode!==null)throw new Error(`Next.js test server exited early.\n${output}`);
  try{
   const response=await fetch(base);
   if(response.ok)return {base,child,databasePath};
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 child.kill();
 throw new Error(`Next.js test server did not become ready.\n${output}`);
}
