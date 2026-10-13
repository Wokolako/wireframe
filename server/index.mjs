import express from 'express';
import {pwaRouter} from './pwa.mjs';
import {clerkMiddleware,getAuth} from '@clerk/express';
import {createClerkProfile} from './clerk-profile.mjs';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { randomUUID, randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import twilio from 'twilio';
import { db, initDb } from './db.mjs';
import { seed, hashPassword } from './seed.mjs';
import { getExchangeRates } from './exchange.mjs';

await initDb();
const production = process.env.NODE_ENV === 'production';
const clerkKey=process.env.CLERK_PUBLISHABLE_KEY||process.env.VITE_CLERK_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkEnabled=!!(clerkKey&&process.env.CLERK_SECRET_KEY);
if(!!clerkKey!==!!process.env.CLERK_SECRET_KEY)throw new Error('Configure both Clerk publishable and secret keys.');
const clerkHost=clerkEnabled?'https://'+Buffer.from(clerkKey.split('_').slice(2).join('_'),'base64').toString().replace(/\$$/,''):null;
const authorizedParties=process.env.APP_ORIGIN?.split(',').map(s=>s.trim()).filter(Boolean)||[];
if(!production)authorizedParties.push('http://localhost:5173','http://127.0.0.1:5173','http://localhost:3001','http://127.0.0.1:3001');
if(clerkEnabled&&production&&!authorizedParties.length)throw new Error('APP_ORIGIN is required with Clerk in production.');
const demo = !production && process.env.SEED_DEMO !== 'false';
if(demo) await seed(db);
export const app = express();
app.disable('x-powered-by');
if(process.env.TRUST_PROXY_HOPS){const hops=Number(process.env.TRUST_PROXY_HOPS);if(!Number.isInteger(hops)||hops<1||hops>5)throw new Error('TRUST_PROXY_HOPS must be an integer from 1 to 5.');app.set('trust proxy',hops);}
app.use(helmet({ contentSecurityPolicy: { directives: { ...(clerkEnabled?{'script-src':["'self'",clerkHost,'https://challenges.cloudflare.com','https://*.protect.clerk.com'],'connect-src':["'self'",clerkHost,'https://*.protect.clerk.com:*','https://clerk-telemetry.com','https://*.clerk-telemetry.com'],'frame-src':["'self'",'https://challenges.cloudflare.com','https://*.protect.clerk.com'],'worker-src':["'self'",'blob:']}:{}), 'img-src': ["'self'",'data:','https://img.clerk.com'], 'upgrade-insecure-requests': production ? [] : null } }, crossOriginEmbedderPolicy:false }));
app.use(express.json({limit:'32kb'}), express.urlencoded({extended:false,limit:'16kb'}),cookieParser());
if(clerkEnabled)app.use('/api',clerkMiddleware({publishableKey:clerkKey,secretKey:process.env.CLERK_SECRET_KEY,authorizedParties}));
const fail = (status,message) => Object.assign(new Error(message),{status});
const hash = v => createHash('sha256').update(v).digest('hex');
const now = () => new Date().toISOString();
const publicUser = async u => ({id:u.id,name:u.name,phone:u.phone,role:u.role,sms_opt_in:!!u.sms_opt_in,farmer:await db.get('SELECT * FROM farmer_profiles WHERE user_id=?',[u.id]) || null});
app.use('/api',async(req,res,next)=>{
 res.set('Cache-Control','no-store');
 if(!['GET','HEAD','OPTIONS'].includes(req.method) && !req.path.startsWith('/v1/webhooks/')){
   const origin=req.get('origin');
   if(origin && !authorizedParties.includes(origin) && new URL(origin).host!==req.get('host')) return next(fail(403,'Request origin is not allowed.'));
 }
 try {if(clerkEnabled){const identity=getAuth(req);req.clerkUserId=identity.isAuthenticated?identity.userId:null;if(req.clerkUserId)req.user=await db.get('SELECT u.* FROM users u JOIN clerk_identities c ON c.user_id=u.id WHERE c.clerk_user_id=?',[req.clerkUserId]);return next();}const s=req.cookies.wirefen_session && await db.get('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?',[hash(req.cookies.wirefen_session),now()]); if(s) req.user=await db.get('SELECT * FROM users WHERE id=?',[s.user_id]); next();} catch(e){next(e);}
});
app.use('/api/v1/pwa',pwaRouter(db,{production}));
app.get('/api/v1/health',async(req,res)=>{await db.get('SELECT 1 AS ok');res.json({status:'ok',service:'wirefen-api',version:'1.0.0'});});
const permit = (...roles)=>(req,res,next)=>!req.user?next(fail(401,'Sign in to continue.')):!roles.includes(req.user.role)?next(fail(403,'Your account cannot perform this action.')):next();
const authLimit=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many sign-in attempts. Try again in 15 minutes.'}});
app.use('/api/v1/auth',authLimit);
app.use(['/api/v1/auth/register','/api/v1/auth/login','/api/v1/auth/demo'],(req,res,next)=>clerkEnabled?next(fail(410,'Use Clerk to sign in or create your account.')):next());
app.post('/api/v1/auth/onboard',async(req,res)=>{if(!clerkEnabled||!req.clerkUserId)throw fail(401,'Sign in with Clerk to continue.');const id=await createClerkProfile(db,req.clerkUserId,req.body);res.status(201).json(await publicUser(await db.get('SELECT * FROM users WHERE id=?',[id])));});
async function session(res,u){const token=randomBytes(32).toString('hex');await db.run('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)',[hash(token),u.id,new Date(Date.now()+604800000).toISOString()]); res.cookie('wirefen_session',token,{httpOnly:true,sameSite:'lax',secure:production,maxAge:604800000,path:'/'});return publicUser(u);}
const phone=z.string().regex(/^\+[1-9]\d{7,14}$/,'Use an international phone number, such as +27821234567.');
app.get('/api/v1/exchange-rates',rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>res.json(await getExchangeRates(process.env.CURRENCY || 'ZAR')));
app.get('/api/v1/config',(req,res)=>res.json({demo,auth_provider:clerkEnabled?'clerk':'local',clerk_publishable_key:clerkEnabled?clerkKey:null,market:process.env.MARKET_NAME || 'South Africa (sample market)',currency:process.env.CURRENCY || 'ZAR',sms_ready:!!(process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_PHONE_NUMBER&&process.env.TWILIO_WEBHOOK_URL)}));
app.post('/api/v1/auth/register',async(req,res)=>{
 const v=z.object({name:z.string().trim().min(2).max(100),phone,password:z.string().min(10).max(128),role:z.enum(['Farmer','Buyer']),sms_opt_in:z.boolean(),farm_name:z.string().trim().max(100).optional(),location:z.string().trim().max(100).optional()}).parse(req.body);
 if(await db.get('SELECT id FROM users WHERE phone=?',[v.phone])) throw fail(409,'This phone number already has an account. Sign in instead.');
 const id=randomUUID(),stamp=now(); await db.run('INSERT INTO users (id,name,phone,password_hash,role,sms_opt_in,sms_opt_in_at,created_at) VALUES (?,?,?,?,?,?,?,?)',[id,v.name,v.phone,hashPassword(v.password),v.role,+v.sms_opt_in,v.sms_opt_in?stamp:null,stamp]);
 if(v.role==='Farmer') await db.run('INSERT INTO farmer_profiles (id,user_id,farm_name,location) VALUES (?,?,?,?)',[randomUUID(),id,v.farm_name||`${v.name}'s farm`,v.location||'Not specified']);
 await db.run('INSERT INTO sms_consents VALUES (?,?,?,?,?)',[randomUUID(),id,+v.sms_opt_in,stamp,'registration']);
 res.status(201).json(await session(res,await db.get('SELECT * FROM users WHERE id=?',[id])));
});
app.post('/api/v1/auth/login',async(req,res)=>{const v=z.object({phone,password:z.string().max(128)}).parse(req.body);const u=await db.get('SELECT * FROM users WHERE phone=?',[v.phone]);const [salt,digest]=(u?.password_hash||hashPassword('dummy-password')).split(':');const valid=timingSafeEqual(scryptSync(v.password,salt,64),Buffer.from(digest,'hex'));if(!u||!valid) throw fail(401,'Phone number or password is incorrect.');res.json(await session(res,u));});
app.post('/api/v1/auth/demo',async(req,res)=>{if(!demo) throw fail(404,'Not found.'); const role=z.enum(['Buyer','Farmer','Admin']).parse(req.body.role);const u=await db.get('SELECT * FROM users WHERE id=?',[{Buyer:'buyer-1',Farmer:'farmer-1',Admin:'admin-1'}[role]]);if(!u) throw fail(404,'Demo account unavailable.');res.json(await session(res,u));});
app.get('/api/v1/auth/me',async(req,res)=>res.json(req.user?await publicUser(req.user):null));
app.post('/api/v1/auth/logout',async(req,res)=>{if(req.cookies.wirefen_session) await db.run('DELETE FROM sessions WHERE token_hash=?',[hash(req.cookies.wirefen_session)]);res.clearCookie('wirefen_session',{path:'/'}).json({ok:true});});
app.patch('/api/v1/account/consent',permit('Farmer','Buyer','Admin'),async(req,res)=>{const {sms_opt_in}=z.object({sms_opt_in:z.boolean()}).parse(req.body);await db.run('UPDATE users SET sms_opt_in=?,sms_opt_in_at=? WHERE id=?',[+sms_opt_in,sms_opt_in?now():null,req.user.id]);await db.run('INSERT INTO sms_consents VALUES (?,?,?,?,?)',[randomUUID(),req.user.id,+sms_opt_in,now(),'account']);res.json({ok:true});});
async function ownFarm(req,id){const f=await db.get('SELECT * FROM farmer_profiles WHERE id=?',[id]);if(!f)throw fail(404,'Farmer not found.');if(req.user.role!=='Admin'&&f.user_id!==req.user.id)throw fail(403,'You can only edit your own farm.');return f;}
app.get('/api/v1/farmers',permit('Admin'),async(req,res)=>res.json(await db.all('SELECT f.*,u.name,u.phone,b.status AS baseline_status FROM farmer_profiles f JOIN users u ON u.id=f.user_id LEFT JOIN historical_baselines b ON b.farmer_id=f.id ORDER BY f.farm_name')));
const baseline=z.object({crop_type:z.string().trim().min(2).max(80),avg_land_size:z.number().positive().max(1e7),avg_yield_per_acre:z.number().positive().max(1e9),avg_duration_days:z.number().int().positive().max(3650),avg_production_cost:z.number().nonnegative().max(1e12)});
app.get('/api/v1/farmers/:id/baseline',permit('Farmer','Admin'),async(req,res)=>{await ownFarm(req,req.params.id);res.json(await db.get('SELECT * FROM historical_baselines WHERE farmer_id=?',[req.params.id])||{status:'draft'});});
async function saveBaseline(req,res){await ownFarm(req,req.params.id);const incoming=baseline.partial().extend({status:z.enum(['draft','complete']).optional()}).parse(req.body);const old=await db.get('SELECT * FROM historical_baselines WHERE farmer_id=?',[req.params.id])||{};const v={...old,...incoming};if(v.status==='complete')baseline.parse(v);await db.run('INSERT INTO historical_baselines (farmer_id,crop_type,avg_land_size,avg_yield_per_acre,avg_duration_days,avg_production_cost,status,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(farmer_id) DO UPDATE SET crop_type=excluded.crop_type,avg_land_size=excluded.avg_land_size,avg_yield_per_acre=excluded.avg_yield_per_acre,avg_duration_days=excluded.avg_duration_days,avg_production_cost=excluded.avg_production_cost,status=excluded.status,updated_at=excluded.updated_at',[req.params.id,v.crop_type??null,v.avg_land_size??null,v.avg_yield_per_acre??null,v.avg_duration_days??null,v.avg_production_cost??null,v.status||'draft',now()]);res.json(await db.get('SELECT * FROM historical_baselines WHERE farmer_id=?',[req.params.id]));}
app.post('/api/v1/farmers/:id/baseline',permit('Farmer','Admin'),saveBaseline);app.patch('/api/v1/farmers/:id/baseline',permit('Farmer','Admin'),saveBaseline);
app.get('/api/v1/farmers/:id/listing-draft',permit('Farmer','Admin'),async(req,res)=>{await ownFarm(req,req.params.id);const row=await db.get('SELECT payload FROM listing_drafts WHERE farmer_id=?',[req.params.id]);res.json(row?JSON.parse(row.payload):{});});
app.patch('/api/v1/farmers/:id/listing-draft',permit('Farmer','Admin'),async(req,res)=>{await ownFarm(req,req.params.id);const schema=z.object({title:z.string().max(100).optional(),crop_category:z.enum(['Vegetables','Fruits','Grains','Tubers','Legumes']).optional(),available_volume:z.string().max(20).optional(),price:z.string().max(20).optional(),harvest_date:z.string().max(10).optional(),expiration_date:z.string().max(10).optional(),shelf_life_days:z.string().max(10).optional(),preservative_used:z.enum(['true','false']).optional(),description:z.string().max(2000).optional()});const patch=schema.parse(req.body);const old=await db.get('SELECT payload FROM listing_drafts WHERE farmer_id=?',[req.params.id]);const value={...(old?JSON.parse(old.payload):{}),...patch};await db.run('INSERT INTO listing_drafts VALUES (?,?,?) ON CONFLICT(farmer_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',[req.params.id,JSON.stringify(value),now()]);res.json(value);});
const date=z.iso.date();
const listing=z.object({farmer_id:z.string().min(1),title:z.string().trim().min(3).max(100),crop_category:z.enum(['Vegetables','Fruits','Grains','Tubers','Legumes']),available_volume:z.number().positive().max(1e9),price:z.number().positive().max(1e9),harvest_date:date,expiration_date:date,shelf_life_days:z.number().int().positive().max(3650),preservative_used:z.boolean(),description:z.string().trim().max(2000).default('')}).refine(v=>v.expiration_date>=v.harvest_date,{message:'Expiry must be on or after harvest.',path:['expiration_date']});
const joinListing='SELECT l.*,f.farm_name,f.location,f.verification_status FROM listings l JOIN farmer_profiles f ON f.id=l.farmer_id';
app.get('/api/v1/listings',async(req,res)=>{
 const q=z.object({category:z.enum(['Vegetables','Fruits','Grains','Tubers','Legumes']).optional(),min_volume:z.coerce.number().nonnegative().optional(),max_volume:z.coerce.number().nonnegative().optional(),harvest_date_after:date.optional(),preservative:z.enum(['true','false']).optional(),search:z.string().max(100).optional(),mine:z.enum(['true']).optional()}).parse(req.query);
 if(q.min_volume!=null&&q.max_volume!=null&&q.min_volume>q.max_volume)throw fail(400,'Minimum volume must not exceed maximum volume.');
 let where=" WHERE l.status='published' AND l.expiration_date>=?",params=[now().slice(0,10)];
 if(q.mine){if(!req.user)throw fail(401,'Sign in to view your listings.');where=' WHERE f.user_id=?';params=[req.user.id];}
 for(const [key,op,val] of [['crop_category','=',q.category],['available_volume','>=',q.min_volume],['available_volume','<=',q.max_volume],['harvest_date','>',q.harvest_date_after],['preservative_used','=',q.preservative===undefined?undefined:+(q.preservative==='true')]]) if(val!==undefined){where+=` AND l.${key}${op}?`;params.push(val);}
 if(q.search){where+=' AND (LOWER(l.title) LIKE ? OR LOWER(f.farm_name) LIKE ? OR LOWER(f.location) LIKE ?)';params.push(...Array(3).fill(`%${q.search.toLowerCase()}%`));}
 res.json(await db.all(joinListing+where+' ORDER BY l.created_at DESC,l.id LIMIT 200',params));
});
app.get('/api/v1/listings/:id',async(req,res)=>{const row=await db.get(joinListing+" WHERE l.id=? AND l.status='published'",[req.params.id]);if(!row)throw fail(404,'Listing not found.');res.json(row);});
app.post('/api/v1/listings',permit('Farmer','Admin'),async(req,res)=>{const v=listing.parse(req.body);await ownFarm(req,v.farmer_id);if(v.expiration_date<now().slice(0,10))throw fail(400,'Expiration date must not be in the past.');const id=randomUUID();const image={Vegetables:'tomatoes',Fruits:'avocados',Grains:'maize',Tubers:'potatoes',Legumes:'beans'}[v.crop_category];await db.run('INSERT INTO listings (id,farmer_id,title,crop_category,available_volume,price,harvest_date,expiration_date,shelf_life_days,preservative_used,description,image,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,v.farmer_id,v.title,v.crop_category,v.available_volume,v.price,v.harvest_date,v.expiration_date,v.shelf_life_days,+v.preservative_used,v.description,`/images/${image}.jpg`,now()]);await db.run('DELETE FROM listing_drafts WHERE farmer_id=?',[v.farmer_id]);res.status(201).json({id});});
app.post('/api/v1/orders',permit('Buyer'),async(req,res)=>{const v=z.object({listing_id:z.string(),volume:z.number().positive(),delivery_location:z.string().trim().min(3).max(200),notes:z.string().max(1000).default('')}).parse(req.body);const l=await db.get("SELECT * FROM listings WHERE id=? AND status='published' AND expiration_date>=?",[v.listing_id,now().slice(0,10)]);if(!l)throw fail(404,'This listing is no longer available.');if(v.volume>l.available_volume)throw fail(400,'Requested volume exceeds available supply.');const id=randomUUID();await db.run('INSERT INTO order_requests (id,listing_id,buyer_id,volume,delivery_location,notes,created_at) VALUES (?,?,?,?,?,?,?)',[id,v.listing_id,req.user.id,v.volume,v.delivery_location,v.notes,now()]);res.status(201).json({id,status:'New'});});
app.get('/api/v1/orders',permit('Buyer','Admin'),async(req,res)=>res.json(await db.all('SELECT o.*,l.title,u.name AS buyer_name,u.phone FROM order_requests o JOIN listings l ON l.id=o.listing_id JOIN users u ON u.id=o.buyer_id'+(req.user.role==='Buyer'?' WHERE o.buyer_id=?':'')+' ORDER BY o.created_at DESC',req.user.role==='Buyer'?[req.user.id]:[])));
app.patch('/api/v1/orders/:id',permit('Admin'),async(req,res)=>{const {status}=z.object({status:z.enum(['New','In review','Contacted','Closed'])}).parse(req.body);if(!await db.get('SELECT id FROM order_requests WHERE id=?',[req.params.id]))throw fail(404,'Request not found.');await db.run('UPDATE order_requests SET status=? WHERE id=?',[status,req.params.id]);res.json({ok:true});});
const smsLimit=rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false});
app.post('/api/v1/webhooks/sms/receive',smsLimit,async(req,res)=>{
 const token=process.env.TWILIO_AUTH_TOKEN,url=process.env.TWILIO_WEBHOOK_URL;
 if(!token||!url)throw fail(503,'SMS provider is not configured.');
 if(!twilio.validateRequest(token,req.get('X-Twilio-Signature')||'',url,req.body))throw fail(403,'Invalid SMS signature.');
 const {From,Body,MessageSid}=z.object({From:phone,Body:z.string().max(1600),MessageSid:z.string().min(1).max(80)}).parse(req.body);
 const xml=message=>{const response=new twilio.twiml.MessagingResponse();if(message)response.message(message);res.type('text/xml').send(response.toString());};
 if(await db.get('SELECT message_sid FROM sms_messages WHERE message_sid=?',[MessageSid]))return xml();
 const u=await db.get('SELECT * FROM users WHERE phone=?',[From]);if(!u)return xml('Please register your phone number on Wirefen first.');
 const command=Body.trim().toUpperCase();
 if(['STOP','START'].includes(command)){const opt=+(command==='START');await db.run('UPDATE users SET sms_opt_in=?,sms_opt_in_at=? WHERE id=?',[opt,opt?now():null,u.id]);await db.run('INSERT INTO sms_consents VALUES (?,?,?,?,?)',[randomUUID(),u.id,opt,now(),'sms']);await db.run('DELETE FROM conversational_state WHERE user_phone=?',[From]);await db.run('INSERT INTO sms_messages VALUES (?,?)',[MessageSid,now()]);return xml(opt?'SMS updates enabled. Reply BASELINE to record yield.':'SMS updates stopped. Reply START to opt in again.');}
 if(!u.sms_opt_in)return xml('Reply START to opt in to Wirefen SMS.');
 if(u.role!=='Farmer')return xml('Farmer baseline entry is available to farmer accounts.');
 const farm=await db.get('SELECT id FROM farmer_profiles WHERE user_id=?',[u.id]);
 const state=await db.get('SELECT * FROM conversational_state WHERE user_phone=?',[From]);
 let message;
 if(command==='BASELINE'){await db.run('INSERT INTO conversational_state VALUES (?,?,?,?) ON CONFLICT(user_phone) DO UPDATE SET current_form_id=excluded.current_form_id,last_question_asked=excluded.last_question_asked,timestamp=excluded.timestamp',[From,'baseline','avg_yield_per_acre',now()]);message='What is your average yield in kilograms per acre? Reply with a positive number.';}
 else if(state?.last_question_asked==='avg_yield_per_acre'&&Date.now()-Date.parse(state.timestamp)<86400000){const value=Number(Body.trim());if(!Number.isFinite(value)||value<=0||value>1e9)message='Enter a positive yield in kilograms per acre, such as 500.';else{await db.run("INSERT INTO historical_baselines (farmer_id,avg_yield_per_acre,status,updated_at) VALUES (?,?,'draft',?) ON CONFLICT(farmer_id) DO UPDATE SET avg_yield_per_acre=excluded.avg_yield_per_acre,status='draft',updated_at=excluded.updated_at",[farm.id,value,now()]);await db.run('DELETE FROM conversational_state WHERE user_phone=?',[From]);message='Yield saved to your draft. Complete the remaining baseline fields on Wirefen.';}}
 else message='Reply BASELINE to record average yield, or STOP to opt out.';
 await db.run('INSERT INTO sms_messages VALUES (?,?)',[MessageSid,now()]);xml(message);
});
app.use('/api',(req,res)=>res.status(404).json({error:'API endpoint not found.'}));
if(existsSync(resolve('dist/index.html'))){app.use(express.static(resolve('dist')));app.get('/{*path}',(req,res)=>res.sendFile(resolve('dist/index.html')));}
app.use((err,req,res,next)=>{if(err instanceof z.ZodError)return res.status(400).json({error:err.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '),fields:err.issues});if(err.code==='23505'||err.code==='ERR_SQLITE_ERROR'&&String(err.message).includes('UNIQUE'))return res.status(409).json({error:'This record already exists.'});if(!err.status)console.error(err);res.status(err.status||500).json({error:err.status?err.message:'Something went wrong. Please try again.'});});
if(process.env.NODE_ENV!=='test'){
 const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3001);
 const server=app.listen(port,host,()=>console.log(`Wirefen API: http://${host}:${port}`));
 let stopping=false;
 const shutdown=()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>process.exit(1),10000);deadline.unref();server.close(async()=>{try{await db.close();clearTimeout(deadline);process.exit(0);}catch{process.exit(1);}});server.closeIdleConnections();};
 process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}

