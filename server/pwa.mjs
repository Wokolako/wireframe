import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {randomBytes,createHash} from 'node:crypto';
import {z} from 'zod';

const eventSchema=z.object({event:z.enum(['prompted','dismissed','installed']),source:z.enum(['invitation','browser-prompt','appinstalled','standalone','related-app']).optional()}).strict();
const columns=['prompted_at','dismissed_at','installed_at'];
const first=(a,b)=>!a?b:!b?a:a<b?a:b;
export function pwaRouter(db,{production=false}={}){
 const router=Router();
 router.use(rateLimit({windowMs:60000,limit:90,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many install-state requests. Please try again shortly.'}}));
 async function visitor(req,res){
  let token=req.cookies.wirefen_install;
  if(!/^[a-f0-9]{64}$/.test(token||''))token=randomBytes(32).toString('hex');
  res.cookie('wirefen_install',token,{httpOnly:true,sameSite:'lax',secure:production,maxAge:365*86400000,path:'/api/v1/pwa'});
  const id=createHash('sha256').update(token).digest('hex'),stamp=new Date().toISOString();
  await db.run('INSERT INTO pwa_visitors (id,first_seen_at,last_seen_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at',[id,stamp,stamp]);
  return id;
 }
 async function state(id,userId){
  const local=await db.get('SELECT * FROM pwa_visitors WHERE id=?',[id]);
  let account=userId?await db.get('SELECT * FROM pwa_accounts WHERE user_id=?',[userId]):null;
  if(userId){
   const merged=columns.map(c=>first(local[c],account?.[c])||null);
   await db.run('INSERT INTO pwa_accounts (user_id,prompted_at,dismissed_at,installed_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET prompted_at=COALESCE(pwa_accounts.prompted_at,excluded.prompted_at),dismissed_at=COALESCE(pwa_accounts.dismissed_at,excluded.dismissed_at),installed_at=COALESCE(pwa_accounts.installed_at,excluded.installed_at)',[userId,...merged]);
   account=await db.get('SELECT * FROM pwa_accounts WHERE user_id=?',[userId]);
  }
  const merged=Object.fromEntries(columns.map(c=>[c,first(local[c],account?.[c])||null]));
  return {...merged,first_seen_at:local.first_seen_at,last_seen_at:local.last_seen_at,suppress_prompt:columns.some(c=>!!merged[c]),device_installed:!!local.installed_at};
 }
 router.get('/session',async(req,res)=>res.json(await state(await visitor(req,res),req.user?.id)));
 router.post('/events',async(req,res)=>{
  const value=eventSchema.parse(req.body);
  if(value.event==='installed'&&!['appinstalled','standalone','related-app'].includes(value.source))return res.status(400).json({error:'Record installation only after browser confirmation or installed-app detection.'});
  const id=await visitor(req,res),stamp=new Date().toISOString();
  const column={prompted:'prompted_at',dismissed:'dismissed_at',installed:'installed_at'}[value.event];
  // Column is selected from a fixed whitelist. Installed state can never be downgraded.
  await db.run(`UPDATE pwa_visitors SET ${column}=COALESCE(${column},?),last_seen_at=? WHERE id=?`,[stamp,stamp,id]);
  res.json(await state(id,req.user?.id));
 });
 return router;
}
