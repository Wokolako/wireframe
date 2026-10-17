import {spawn} from 'node:child_process';
import {resolve} from 'node:path';

export async function startNextDev({port,backend=true,seed=true}){
 const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{
  env:{
   ...process.env,
   DATABASE_URL:'',
   USE_BACKEND:String(backend),
   NEXT_PUBLIC_USE_BACKEND:String(backend),
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:'',
   CLERK_PUBLISHABLE_KEY:'',
   CLERK_SECRET_KEY:'',
   PORT:String(port),
   SQLITE_PATH:':memory:',
   NODE_ENV:'development',
   SEED_DEMO:String(seed),
  },
  stdio:'pipe',
 });
 let output='';
 child.stdout.on('data',chunk=>{output+=chunk;});
 child.stderr.on('data',chunk=>{output+=chunk;});
 for(let attempt=0;attempt<120;attempt++){
  if(child.exitCode!==null)throw new Error(`Next.js test server exited early.\n${output}`);
  try{
   const response=await fetch(base);
   if(response.ok)return {base,child};
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 child.kill();
 throw new Error(`Next.js test server did not become ready.\n${output}`);
}
