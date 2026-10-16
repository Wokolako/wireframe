import express from 'express';
import {pwaRouter} from './pwa.mjs';
import {clerkMiddleware,getAuth} from '@clerk/express';
import {createClerkProfile} from './clerk-profile.mjs';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { randomUUID, randomBytes, createHash, createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import twilio from 'twilio';
import { db, initDb } from './db.mjs';
import { seed, hashPassword } from './seed.mjs';
import { getExchangeRates } from './exchange.mjs';

await initDb();
const production = process.env.NODE_ENV === 'production';
const clerkKey=process.env.CLERK_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkEnabled=!!(clerkKey&&process.env.CLERK_SECRET_KEY);
if(!!clerkKey!==!!process.env.CLERK_SECRET_KEY)throw new Error('Configure both Clerk publishable and secret keys.');
const clerkHost=clerkEnabled?'https://'+Buffer.from(clerkKey.split('_').slice(2).join('_'),'base64').toString().replace(/\$$/,''):null;
const authorizedParties=process.env.APP_ORIGIN?.split(',').map(s=>s.trim()).filter(Boolean)||[];
if(!production)authorizedParties.push('http://localhost:3000','http://127.0.0.1:3000','http://localhost:3001','http://127.0.0.1:3001');
if(clerkEnabled&&production&&!authorizedParties.length)throw new Error('APP_ORIGIN is required with Clerk in production.');
const demo = !production && process.env.SEED_DEMO !== 'false';
if(demo) await seed(db);
export const app = express();
app.disable('x-powered-by');
if(process.env.TRUST_PROXY_HOPS){const hops=Number(process.env.TRUST_PROXY_HOPS);if(!Number.isInteger(hops)||hops<1||hops>5)throw new Error('TRUST_PROXY_HOPS must be an integer from 1 to 5.');app.set('trust proxy',hops);}
app.use(helmet({ contentSecurityPolicy: { directives: { ...(clerkEnabled?{'script-src':["'self'",clerkHost,'https://challenges.cloudflare.com','https://*.protect.clerk.com'],'connect-src':["'self'",clerkHost,'https://*.protect.clerk.com:*','https://clerk-telemetry.com','https://*.clerk-telemetry.com'],'frame-src':["'self'",'https://challenges.cloudflare.com','https://*.protect.clerk.com'],'worker-src':["'self'",'blob:']}:{}), 'img-src': ["'self'",'data:','https://img.clerk.com'], 'upgrade-insecure-requests': production ? [] : null } }, crossOriginEmbedderPolicy:false }));
app.use(express.json({limit:'32kb',verify:(req,res,buffer)=>{req.rawBody=Buffer.from(buffer);}}), express.urlencoded({extended:false,limit:'16kb'}),cookieParser());
if(clerkEnabled)app.use('/api',clerkMiddleware({publishableKey:clerkKey,secretKey:process.env.CLERK_SECRET_KEY,authorizedParties}));
const fail = (status,message) => Object.assign(new Error(message),{status});
const hash = v => createHash('sha256').update(v).digest('hex');
const now = () => new Date().toISOString();
const publicUser = async u => ({id:u.id,name:u.name,phone:u.phone,role:u.role,sms_opt_in:!!u.sms_opt_in,farmer:await db.get('SELECT * FROM farmer_profiles WHERE user_id=?',[u.id]) || null});
app.use('/api',async(req,res,next)=>{
 res.set('Cache-Control','no-store');
 if(!['GET','HEAD','OPTIONS'].includes(req.method) && !req.path.startsWith('/v1/webhooks/')){
   const origin=req.get('origin');
   if(origin && !req.path.startsWith('/v1/paychangu/webhook') && !authorizedParties.includes(origin) && new URL(origin).host!==req.get('host')) return next(fail(403,'Request origin is not allowed.'));
 }
 try {if(clerkEnabled){const identity=getAuth(req);req.clerkUserId=identity.isAuthenticated?identity.userId:null;if(req.clerkUserId)req.user=await db.get('SELECT u.* FROM users u JOIN clerk_identities c ON c.user_id=u.id WHERE c.clerk_user_id=?',[req.clerkUserId]);return next();}const s=req.cookies.wirefen_session && await db.get('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?',[hash(req.cookies.wirefen_session),now()]); if(s) req.user=await db.get('SELECT * FROM users WHERE id=?',[s.user_id]); next();} catch(e){next(e);}
});
app.use('/api/v1/pwa',pwaRouter(db,{production}));
app.get('/api/v1/health',async(req,res)=>{await db.get('SELECT 1 AS ok');res.json({status:'ok',service:'wirefen-api',version:'1.0.0'});});
const permit = (...roles)=>(req,res,next)=>!req.user?next(fail(401,'Sign in to continue.')):!roles.includes(req.user.role)?next(fail(403,'Your account cannot perform this action.')):next();
const paymentLimit=rateLimit({windowMs:60000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many payment requests. Please try again shortly.'}});
const payChanguSecret=()=>process.env.PAYCHANGU_SECRET_KEY;
let payChanguOperatorsCache;
function payChanguErrorMessage(payload,sensitiveValues=[]){
 const messages=[];
 const collect=(value,label='',depth=0,errorContext=false)=>{
  if(depth>6||messages.length>=5)return;
  if(typeof value==='string'){
   const message=value.replace(/[\u0000-\u001f\u007f]+/g,' ').trim();
   if(message&&errorContext)messages.push(label?`${label}: ${message}`:message);
  }else if(Array.isArray(value))for(const item of value)collect(item,label,depth+1,errorContext);
  else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
   const diagnostic=['message','error','detail','errors','reason','description'].includes(key.toLowerCase());
   if(diagnostic)collect(item,label||key,depth+1,true);
   else if(errorContext)collect(item,key,depth+1,true);
   else collect(item,label,depth+1,false);
  }
 };
 collect(payload);
 const secrets=[process.env.PAYCHANGU_SECRET_KEY,process.env.PAYCHANGU_WEBHOOK_SECRET,...sensitiveValues].filter(value=>typeof value==='string'&&value.length>0);
 const escapedSecrets=secrets.map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 return messages.join('; ').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[redacted email]').replace(/\+?\d[\d\s().-]{6,}\d/g,'[redacted phone]').replace(new RegExp(escapedSecrets.join('|'),'g'),'[redacted]').slice(0,240);
}
async function payChanguOperators(){
 if(payChanguOperatorsCache&&Date.now()-payChanguOperatorsCache.updatedAt<300000)return payChanguOperatorsCache.items;
 const secret=payChanguSecret();if(!secret)throw fail(503,'Mobile-money checkout is not configured.');
 const response=await fetch('https://api.paychangu.com/mobile-money/',{headers:{Accept:'application/json',Authorization:`Bearer ${secret}`}});
 const body=await response.json().catch(()=>null);
 if(!response.ok||body?.status==='failed')throw fail(502,'PayChangu could not provide supported mobile-money operators.');
 const items=Array.isArray(body?.data)?body.data.filter(operator=>typeof operator?.ref_id==='string'&&operator.ref_id&&typeof operator?.name==='string'&&operator.name&&['MK','MWK'].includes(String(operator.supported_country?.currency||'').toUpperCase())):[];
 if(!items.length)throw fail(502,'PayChangu returned no supported mobile-money operators.');
 payChanguOperatorsCache={updatedAt:Date.now(),items};return items;
}
async function verifyPayChanguCharge(chargeId){
 const secret=payChanguSecret();if(!secret)throw fail(503,'Mobile-money checkout is not configured.');
 const response=await fetch(`https://api.paychangu.com/mobile-money/payments/${encodeURIComponent(chargeId)}/verify`,{headers:{Accept:'application/json',Authorization:`Bearer ${secret}`}});
 const body=await response.json().catch(()=>null);
 if(!response.ok||!body)throw fail(502,'PayChangu could not verify this payment.');
 return body;
}
const normalizedPaymentStatus=value=>String(value||'').toLowerCase()==='successful'?'success':String(value||'').toLowerCase();
async function settlePurchase(order,verified){
 const details=verified?.data??verified;
 if(normalizedPaymentStatus(details?.status||verified?.status)!=='success')return 'pending';
 const paidCurrency=String(details?.currency||'').toUpperCase();
 const currency=paidCurrency==='MK'?'MWK':paidCurrency;
 const paidAmount=Number(details?.amount);
 if(String(details?.charge_id||'')!==String(order.provider_charge_id)||currency!==order.currency||!Number.isFinite(paidAmount)||paidAmount<Number(order.amount))throw fail(409,'The verified payment does not match this order.');
 return db.transaction(async tx=>{
  const current=await tx.get('SELECT * FROM purchase_orders WHERE id=?',[order.id]);
  if(!current)throw fail(404,'Purchase order not found.');
  if(current.status==='paid')return 'paid';
  if(current.status!=='pending')return current.status;
  const claimed=await tx.run("UPDATE purchase_orders SET status='paid',provider_reference=?,updated_at=? WHERE id=? AND status='pending'",[String(details.ref_id||details.reference||''),now(),order.id]);
  const claimCount=typeof claimed.rowCount==='number'?claimed.rowCount:claimed.changes;
  if(!claimCount)return (await tx.get('SELECT status FROM purchase_orders WHERE id=?',[order.id]))?.status||'failed';
  const items=await tx.get('SELECT COUNT(*) AS count FROM purchase_order_items WHERE order_id=?',[order.id]);
  if(!Number(items?.count))throw fail(409,'Purchase order has no items.');
  for(const item of await tx.all('SELECT listing_id,quantity FROM purchase_order_items WHERE order_id=?',[order.id])){
   const result=await tx.run("UPDATE listings SET available_volume=available_volume-?,status=CASE WHEN available_volume-?<=0 THEN 'sold_out' ELSE status END WHERE id=? AND available_volume>=?",[item.quantity,item.quantity,item.listing_id,item.quantity]);
   const affected=typeof result.rowCount==='number'?result.rowCount:result.changes;
   if(!affected)throw fail(409,'A listing no longer has enough available supply to fulfill this order.');
  }
  return 'paid';
 });
}
app.get('/api/v1/paychangu/operators',paymentLimit,async(req,res)=>res.json({data:await payChanguOperators()}));
app.post('/api/v1/paychangu/initialize',paymentLimit,permit('Buyer'),async(req,res)=>{
 if(demo&&process.env.PAYCHANGU_TEST_MODE!=='true')throw fail(503,'Checkout is disabled while sample marketplace data is enabled. Configure MWK listing prices and set SEED_DEMO=false before testing payments.');
 const secret=payChanguSecret();if(!secret)throw fail(503,'Mobile-money checkout is not configured.');
 const currency=String(process.env.CURRENCY||'MWK').toUpperCase();
 if(currency!=='MWK')throw fail(503,'PayChangu mobile-money checkout requires the marketplace currency to be MWK.');
 const input=z.object({
  items:z.array(z.object({listing_id:z.string().min(1).max(100),quantity:z.coerce.number().positive().max(1e9)})).min(1).max(30),
  operator_ref_id:z.string().min(1).max(100),
  mobile:z.string().trim().regex(/^\+265\d{9}$/,'Enter a Malawi mobile number with country code and 9 digits, such as +265991234567.'),
  email:z.email().max(254),
  expected_total:z.coerce.number().int().positive(),
  first_name:z.string().trim().max(100).default(''),
  last_name:z.string().trim().max(100).default('')
 }).parse(req.body);
 const operators=await payChanguOperators();
 if(!operators.some(operator=>String(operator.ref_id)===input.operator_ref_id))throw fail(400,'Choose a supported PayChangu mobile-money operator.');
 const quantities=new Map();
 for(const item of input.items)quantities.set(item.listing_id,(quantities.get(item.listing_id)||0)+item.quantity);
 const orderItems=[];
 let total=0;
 for(const [listingId,quantity] of quantities){
  const listing=await db.get(joinListing+" WHERE l.id=? AND l.status='published' AND l.expiration_date>=?",[listingId,now().slice(0,10)]);
  if(!listing)throw fail(404,'A selected listing is no longer available.');
  if(quantity>Number(listing.available_volume))throw fail(400,`Requested quantity exceeds available supply for ${listing.title}.`);
  const unitPrice=Number(listing.price);
  total+=quantity*unitPrice;
  orderItems.push({listing_id:listing.id,title:listing.title,quantity,unit_price:unitPrice,available_volume:Number(listing.available_volume),image:listing.image});
 }
 const amount=Math.round(total);
 if(!Number.isSafeInteger(amount)||amount<1)throw fail(400,'The MWK order total must be at least one Kwacha.');
 if(input.expected_total!==amount)return res.status(409).json({error:'Listing prices changed. Refresh the cart and review the updated total before paying.',amount,currency:'MWK',items:orderItems});
 const orderId=randomUUID(),chargeId=`WF${randomUUID().replaceAll('-','').slice(0,24)}`,stamp=now();
 await db.transaction(async tx=>{
  await tx.run("INSERT INTO purchase_orders (id,buyer_id,amount,currency,status,payment_provider,provider_charge_id,email,mobile,created_at,updated_at) VALUES (?,?,?,'MWK','pending','paychangu',?,?,?,?,?)",[orderId,req.user.id,amount,chargeId,input.email,input.mobile,stamp,stamp]);
  for(const item of orderItems)await tx.run('INSERT INTO purchase_order_items (id,order_id,listing_id,title,quantity,unit_price) VALUES (?,?,?,?,?,?)',[randomUUID(),orderId,item.listing_id,item.title,item.quantity,item.unit_price]);
 });
 const customerMobile=input.mobile;
 // PayChangu's Malawi charge endpoint expects nine national digits, without +265.
 input.mobile=customerMobile.slice(4);
 let providerResponse;
 try{
  const response=await fetch('https://api.paychangu.com/mobile-money/payments/initialize',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${secret}`},body:JSON.stringify({mobile:input.mobile,mobile_money_operator_ref_id:input.operator_ref_id,amount:String(amount),charge_id:chargeId,email:input.email,first_name:input.first_name,last_name:input.last_name})});
  const providerBody=await response.text();
  try{providerResponse=JSON.parse(providerBody);}catch{providerResponse=null;}
  const providerStatus=normalizedPaymentStatus(providerResponse?.status),providerMessage=payChanguErrorMessage(providerResponse,[customerMobile,input.email]);
  if(!response.ok||providerStatus!=='success'||!providerResponse?.data?.charge_id){
   const responseFields=providerResponse&&typeof providerResponse==='object'?Object.keys(providerResponse).slice(0,8).join(', '):'none';
   const reason=providerMessage||(!response.ok?`HTTP ${response.status}; response fields: ${responseFields}`:'The provider returned no charge ID.');
   console.error('PayChangu initialization rejected.',{httpStatus:response.status,providerStatus:providerStatus||'unknown',responseType:providerResponse?'json':'unstructured',reason});
   throw fail(502,`PayChangu rejected the payment request: ${reason}`);
  }
 }catch(error){
  await db.run("UPDATE purchase_orders SET status='failed',updated_at=? WHERE id=? AND status='pending'",[now(),orderId]);
  if(error.status)throw error;
  throw fail(502,'Could not connect to PayChangu to start the payment. Check the API server connection and retry.');
 }
 const actualChargeId=String(providerResponse.data.charge_id);
 if(actualChargeId!==chargeId)await db.run('UPDATE purchase_orders SET provider_charge_id=?,updated_at=? WHERE id=?',[actualChargeId,now(),orderId]);
 res.status(201).json({order_id:orderId,charge_id:actualChargeId,amount,currency:'MWK',status:'pending',message:providerResponse.message||'Approve the payment request on your phone.'});
});
app.get('/api/v1/paychangu/verify',paymentLimit,permit('Buyer','Admin'),async(req,res)=>{
 const chargeId=z.string().min(1).max(100).parse(req.query.charge_id);
 const order=await db.get('SELECT * FROM purchase_orders WHERE provider_charge_id=?',[chargeId]);
 if(!order||req.user.role!=='Admin'&&order.buyer_id!==req.user.id)throw fail(404,'Payment order not found.');
 if(order.status==='paid'||order.status==='failed')return res.json({status:order.status,order_id:order.id});
 const verified=await verifyPayChanguCharge(chargeId);
 const status=await settlePurchase(order,verified);
 res.json({status,order_id:order.id});
});
app.post('/api/v1/paychangu/webhook',async(req,res)=>{
 const secret=process.env.PAYCHANGU_WEBHOOK_SECRET,signature=req.get('signature')?.replace(/^sha256=/i,'');
 if(!secret||!req.rawBody||!signature)throw fail(401,'Invalid PayChangu webhook signature.');
 const expected=createHmac('sha256',secret).update(req.rawBody).digest();
 let received;try{received=Buffer.from(signature,'hex');}catch{received=Buffer.alloc(0);}
 if(received.length!==expected.length||!timingSafeEqual(received,expected))throw fail(401,'Invalid PayChangu webhook signature.');
 const event=req.body||{},payment=event.data||event.order||event,chargeId=String(payment.charge_id||'');
 if(!chargeId)return res.status(200).json({received:true});
 const order=await db.get('SELECT * FROM purchase_orders WHERE provider_charge_id=?',[chargeId]);
 if(!order)return res.status(200).json({received:true});
 const webhookStatus=normalizedPaymentStatus(payment.status||event.status);
 if(webhookStatus==='success'){
  const verified=await verifyPayChanguCharge(chargeId);
  await settlePurchase(order,verified);
 }else if(webhookStatus==='failed'){
  await db.run("UPDATE purchase_orders SET status='failed',updated_at=? WHERE id=? AND status='pending'",[now(),order.id]);
 }
 res.status(200).json({received:true});
});
app.get('/api/v1/purchases',permit('Buyer','Admin'),async(req,res)=>{
 const purchases=await db.all('SELECT id,amount,currency,status,payment_provider,provider_charge_id,created_at FROM purchase_orders'+(req.user.role==='Buyer'?' WHERE buyer_id=?':'')+' ORDER BY created_at DESC',req.user.role==='Buyer'?[req.user.id]:[]);
 res.json(purchases);
});
const authLimit=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many sign-in attempts. Try again in 15 minutes.'}});
app.use('/api/v1/auth',authLimit);
app.use(['/api/v1/auth/register','/api/v1/auth/login','/api/v1/auth/demo'],(req,res,next)=>clerkEnabled?next(fail(410,'Use Clerk to sign in or create your account.')):next());
app.post('/api/v1/auth/onboard',async(req,res)=>{if(!clerkEnabled||!req.clerkUserId)throw fail(401,'Sign in with Clerk to continue.');const id=await createClerkProfile(db,req.clerkUserId,req.body);res.status(201).json(await publicUser(await db.get('SELECT * FROM users WHERE id=?',[id])));});
async function session(res,u){const token=randomBytes(32).toString('hex');await db.run('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)',[hash(token),u.id,new Date(Date.now()+604800000).toISOString()]); res.cookie('wirefen_session',token,{httpOnly:true,sameSite:'lax',secure:production,maxAge:604800000,path:'/'});return publicUser(u);}
const phone=z.string().regex(/^\+[1-9]\d{7,14}$/,'Use an international phone number, such as +27821234567.');
app.get('/api/v1/exchange-rates',rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>res.json(await getExchangeRates(process.env.CURRENCY || 'MWK')));
app.get('/api/v1/config',(req,res)=>res.json({demo,auth_provider:clerkEnabled?'clerk':'local',clerk_publishable_key:clerkEnabled?clerkKey:null,market:process.env.MARKET_NAME || 'Malawi (sample market)',currency:process.env.CURRENCY || 'MWK',sms_ready:!!(process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_PHONE_NUMBER&&process.env.TWILIO_WEBHOOK_URL)}));
app.post('/api/v1/auth/register',async(req,res)=>{
 const v=z.object({name:z.string().trim().min(2).max(100),phone,password:z.string().min(10).max(128),role:z.enum(['Farmer','Buyer','Agent']),sms_opt_in:z.boolean(),farm_name:z.string().trim().max(100).optional(),country:z.string().trim().max(100).optional(),region:z.string().trim().max(100).optional(),district:z.string().trim().max(100).optional(),locality:z.string().trim().max(100).optional(),ward:z.string().trim().max(100).optional(),location:z.string().trim().max(100).optional()}).parse(req.body);
 if(await db.get('SELECT id FROM users WHERE phone=?',[v.phone])) throw fail(409,'This phone number already has an account. Sign in instead.');
 const id=randomUUID(),stamp=now(); await db.run('INSERT INTO users (id,name,phone,password_hash,role,sms_opt_in,sms_opt_in_at,created_at) VALUES (?,?,?,?,?,?,?,?)',[id,v.name,v.phone,hashPassword(v.password),v.role,+v.sms_opt_in,v.sms_opt_in?stamp:null,stamp]);
 if(v.role==='Farmer'){
  const country=v.country||'South Africa',region=v.region||v.district||v.location||'Not specified',locality=v.locality||v.ward||v.location||'Not specified';
  const location=v.location||[locality,region,country].filter(Boolean).join(', ');
  await db.run('INSERT INTO farmer_profiles (id,user_id,farm_name,country,region,district,locality,ward,location) VALUES (?,?,?,?,?,?,?,?,?)',[randomUUID(),id,v.farm_name||`${v.name}'s farm`,country,region,v.district||region,locality,v.ward||locality,location]);
 }
 await db.run('INSERT INTO sms_consents VALUES (?,?,?,?,?)',[randomUUID(),id,+v.sms_opt_in,stamp,'registration']);
 res.status(201).json(await session(res,await db.get('SELECT * FROM users WHERE id=?',[id])));
});
app.post('/api/v1/auth/login',async(req,res)=>{const v=z.object({phone,password:z.string().max(128)}).parse(req.body);const u=await db.get('SELECT * FROM users WHERE phone=?',[v.phone]);const [salt,digest]=(u?.password_hash||hashPassword('dummy-password')).split(':');const valid=timingSafeEqual(scryptSync(v.password,salt,64),Buffer.from(digest,'hex'));if(!u||!valid) throw fail(401,'Phone number or password is incorrect.');res.json(await session(res,u));});
app.post('/api/v1/auth/demo',async(req,res)=>{if(!demo) throw fail(404,'Not found.'); const role=z.enum(['Buyer','Farmer','Admin','Agent']).parse(req.body.role);const u=await db.get('SELECT * FROM users WHERE id=?',[{Buyer:'buyer-1',Farmer:'farmer-1',Admin:'admin-1',Agent:'agent-1'}[role]]);if(!u) throw fail(404,'Demo account unavailable.');res.json(await session(res,u));});
app.get('/api/v1/auth/me',async(req,res)=>res.json(req.user?await publicUser(req.user):null));
app.post('/api/v1/auth/logout',async(req,res)=>{if(req.cookies.wirefen_session) await db.run('DELETE FROM sessions WHERE token_hash=?',[hash(req.cookies.wirefen_session)]);res.clearCookie('wirefen_session',{path:'/'}).json({ok:true});});
app.patch('/api/v1/account/consent',permit('Farmer','Buyer','Admin','Agent'),async(req,res)=>{const {sms_opt_in}=z.object({sms_opt_in:z.boolean()}).parse(req.body);await db.run('UPDATE users SET sms_opt_in=?,sms_opt_in_at=? WHERE id=?',[+sms_opt_in,sms_opt_in?now():null,req.user.id]);await db.run('INSERT INTO sms_consents VALUES (?,?,?,?,?)',[randomUUID(),req.user.id,+sms_opt_in,now(),'account']);res.json({ok:true});});
async function ownFarm(req,id){const f=await db.get('SELECT * FROM farmer_profiles WHERE id=?',[id]);if(!f)throw fail(404,'Farmer not found.');if(req.user.role!=='Admin'&&f.user_id!==req.user.id)throw fail(403,'You can only edit your own farm.');return f;}
app.get('/api/v1/farmers',permit('Admin'),async(req,res)=>res.json(await db.all('SELECT f.*,u.name,u.phone,b.status AS baseline_status FROM farmer_profiles f JOIN users u ON u.id=f.user_id LEFT JOIN historical_baselines b ON b.farmer_id=f.id ORDER BY f.farm_name')));
const baseline=z.object({crop_type:z.string().trim().min(2).max(80),avg_land_size:z.number().positive().max(1e7),avg_yield_per_acre:z.number().positive().max(1e9),avg_duration_days:z.number().int().positive().max(3650),cost_fertilizer_seeds:z.number().nonnegative().max(1e12).nullish(),cost_labor:z.number().nonnegative().max(1e12).nullish(),cost_processing:z.number().nonnegative().max(1e12).nullish(),cost_transportation:z.number().nonnegative().max(1e12).nullish(),avg_production_cost:z.number().nonnegative().max(1e12)});
app.get('/api/v1/farmers/:id/baseline',permit('Farmer','Admin'),async(req,res)=>{await ownFarm(req,req.params.id);res.json(await db.get('SELECT * FROM historical_baselines WHERE farmer_id=?',[req.params.id])||{status:'draft'});});
async function saveBaseline(req,res){await ownFarm(req,req.params.id);const incoming=baseline.partial().extend({status:z.enum(['draft','complete']).optional()}).parse(req.body);const old=await db.get('SELECT * FROM historical_baselines WHERE farmer_id=?',[req.params.id])||{};const v={...old,...incoming};const hasBreakdown=[v.cost_fertilizer_seeds,v.cost_labor,v.cost_processing,v.cost_transportation].some(x=>x!==undefined&&x!==null);if(hasBreakdown){v.avg_production_cost=(Number(v.cost_fertilizer_seeds)||0)+(Number(v.cost_labor)||0)+(Number(v.cost_processing)||0)+(Number(v.cost_transportation)||0);}if(v.status==='complete')baseline.parse(v);await db.run('INSERT INTO historical_baselines (farmer_id,crop_type,avg_land_size,avg_yield_per_acre,avg_duration_days,cost_fertilizer_seeds,cost_labor,cost_processing,cost_transportation,avg_production_cost,status,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(farmer_id) DO UPDATE SET crop_type=excluded.crop_type,avg_land_size=excluded.avg_land_size,avg_yield_per_acre=excluded.avg_yield_per_acre,avg_duration_days=excluded.avg_duration_days,cost_fertilizer_seeds=excluded.cost_fertilizer_seeds,cost_labor=excluded.cost_labor,cost_processing=excluded.cost_processing,cost_transportation=excluded.cost_transportation,avg_production_cost=excluded.avg_production_cost,status=excluded.status,updated_at=excluded.updated_at',[req.params.id,v.crop_type??null,v.avg_land_size??null,v.avg_yield_per_acre??null,v.avg_duration_days??null,v.cost_fertilizer_seeds??null,v.cost_labor??null,v.cost_processing??null,v.cost_transportation??null,v.avg_production_cost??null,v.status||'draft',now()]);res.json(await db.get('SELECT * FROM historical_baselines WHERE farmer_id=?',[req.params.id]));}
app.post('/api/v1/farmers/:id/baseline',permit('Farmer','Admin'),saveBaseline);app.patch('/api/v1/farmers/:id/baseline',permit('Farmer','Admin'),saveBaseline);
app.get('/api/v1/farmers/:id/listing-draft',permit('Farmer','Admin'),async(req,res)=>{await ownFarm(req,req.params.id);const row=await db.get('SELECT payload FROM listing_drafts WHERE farmer_id=?',[req.params.id]);res.json(row?JSON.parse(row.payload):{});});
app.patch('/api/v1/farmers/:id/listing-draft',permit('Farmer','Admin'),async(req,res)=>{await ownFarm(req,req.params.id);const schema=z.object({title:z.string().max(100).optional(),crop_category:z.enum(['Vegetables','Fruits','Grains','Tubers','Legumes']).optional(),available_volume:z.string().max(20).optional(),price:z.string().max(20).optional(),harvest_date:z.string().max(10).optional(),expiration_date:z.string().max(10).optional(),shelf_life_days:z.string().max(10).optional(),preservative_used:z.enum(['true','false']).optional(),description:z.string().max(2000).optional()});const patch=schema.parse(req.body);const old=await db.get('SELECT payload FROM listing_drafts WHERE farmer_id=?',[req.params.id]);const value={...(old?JSON.parse(old.payload):{}),...patch};await db.run('INSERT INTO listing_drafts VALUES (?,?,?) ON CONFLICT(farmer_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',[req.params.id,JSON.stringify(value),now()]);res.json(value);});
const date=z.iso.date();
const listing=z.object({farmer_id:z.string().min(1),title:z.string().trim().min(3).max(100),crop_category:z.enum(['Vegetables','Fruits','Grains','Tubers','Legumes']),available_volume:z.number().positive().max(1e9),price:z.number().positive().max(1e9),harvest_date:date,expiration_date:date,shelf_life_days:z.number().int().positive().max(3650),preservative_used:z.boolean(),description:z.string().trim().max(2000).default(''),traceability:z.string().trim().max(100).default(''),agent_score:z.number().min(0).max(5).default(0)}).refine(v=>v.expiration_date>=v.harvest_date,{message:'Expiry must be on or after harvest.',path:['expiration_date']});
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
app.post('/api/v1/listings',permit('Farmer','Admin'),async(req,res)=>{const v=listing.parse(req.body);await ownFarm(req,v.farmer_id);if(v.expiration_date<now().slice(0,10))throw fail(400,'Expiration date must not be in the past.');const id=randomUUID();const image={Vegetables:'tomatoes',Fruits:'avocados',Grains:'maize',Tubers:'potatoes',Legumes:'beans'}[v.crop_category];await db.run('INSERT INTO listings (id,farmer_id,title,crop_category,available_volume,price,harvest_date,expiration_date,shelf_life_days,preservative_used,description,image,traceability,agent_score,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,v.farmer_id,v.title,v.crop_category,v.available_volume,v.price,v.harvest_date,v.expiration_date,v.shelf_life_days,+v.preservative_used,v.description,`/images/${image}.jpg`,v.traceability||'',v.agent_score||0,now()]);await db.run('DELETE FROM listing_drafts WHERE farmer_id=?',[v.farmer_id]);res.status(201).json({id});});
app.get('/api/v1/verifications',permit('Agent','Admin'),async(req,res)=>res.json(await db.all('SELECT f.id,f.farm_name,f.country,f.region,f.district,f.locality,f.ward,f.location,f.farm_size,f.verification_status,u.name AS farmer_name,u.phone AS contact_phone FROM farmer_profiles f JOIN users u ON u.id=f.user_id ORDER BY f.farm_name')));
app.patch('/api/v1/verifications/:id',permit('Agent','Admin'),async(req,res)=>{const {verification_status}=z.object({verification_status:z.enum(['Verified','Pending','Unverified'])}).parse(req.body);if(!await db.get('SELECT id FROM farmer_profiles WHERE id=?',[req.params.id]))throw fail(404,'Farmer not found.');await db.run('UPDATE farmer_profiles SET verification_status=? WHERE id=?',[verification_status,req.params.id]);res.json({ok:true,id:req.params.id,verification_status});});
app.get('/api/v1/analytics/financial',permit('Admin'),async(req,res)=>{
 const regional=await db.all(`SELECT f.country,COALESCE(NULLIF(f.region,''),'Unspecified') AS region,COUNT(b.farmer_id) AS total_baselines,ROUND(AVG(b.cost_fertilizer_seeds),2) AS avg_fertilizer_seeds,ROUND(AVG(b.cost_labor),2) AS avg_labor,ROUND(AVG(b.cost_processing),2) AS avg_processing,ROUND(AVG(b.cost_transportation),2) AS avg_transportation,ROUND(AVG(b.avg_production_cost),2) AS avg_total_production_cost,ROUND(AVG(b.avg_land_size),2) AS avg_land_size,ROUND(AVG(b.avg_yield_per_acre),2) AS avg_yield_per_acre FROM historical_baselines b JOIN farmer_profiles f ON f.id=b.farmer_id GROUP BY f.country,f.region ORDER BY f.country,f.region`);
 const by_crop=await db.all(`SELECT COALESCE(b.crop_type,'Other') AS crop_type,COUNT(b.farmer_id) AS total_baselines,ROUND(AVG(b.avg_production_cost),2) AS avg_production_cost,ROUND(AVG(b.avg_yield_per_acre),2) AS avg_yield_per_acre FROM historical_baselines b WHERE b.crop_type IS NOT NULL AND b.crop_type!='' GROUP BY b.crop_type ORDER BY total_baselines DESC`);
 const summary=await db.get(`SELECT COUNT(b.farmer_id) AS total_submissions,ROUND(AVG(b.avg_production_cost),2) AS overall_avg_cost,ROUND(SUM(b.avg_production_cost),2) AS overall_total_cost FROM historical_baselines b`);
 res.json({regional,by_crop,summary:summary||{total_submissions:0,overall_avg_cost:0,overall_total_cost:0}});
});
app.post('/api/v1/orders',permit('Buyer'),async(req,res)=>{const v=z.object({listing_id:z.string(),volume:z.number().positive(),delivery_location:z.string().trim().min(3).max(200),notes:z.string().max(1000).default('')}).parse(req.body);const l=await db.get("SELECT * FROM listings WHERE id=? AND status='published' AND expiration_date>=?",[v.listing_id,now().slice(0,10)]);if(!l)throw fail(404,'This listing is no longer available.');if(v.volume>l.available_volume)throw fail(400,'Requested volume exceeds available supply.');const id=randomUUID();await db.run('INSERT INTO order_requests (id,listing_id,buyer_id,volume,delivery_location,notes,created_at) VALUES (?,?,?,?,?,?,?)',[id,v.listing_id,req.user.id,v.volume,v.delivery_location,v.notes,now()]);res.status(201).json({id,status:'New'});});
app.get('/api/v1/orders',permit('Buyer','Admin'),async(req,res)=>res.json(await db.all('SELECT o.*,l.title,u.name AS buyer_name,u.phone FROM order_requests o JOIN listings l ON l.id=o.listing_id JOIN users u ON u.id=o.buyer_id'+(req.user.role==='Buyer'?' WHERE o.buyer_id=?':'')+' ORDER BY o.created_at DESC',req.user.role==='Buyer'?[req.user.id]:[])));
app.patch('/api/v1/orders/:id',permit('Admin'),async(req,res)=>{const {status}=z.object({status:z.enum(['New','In review','Contacted','Closed'])}).parse(req.body);if(!await db.get('SELECT id FROM order_requests WHERE id=?',[req.params.id]))throw fail(404,'Request not found.');await db.run('UPDATE order_requests SET status=? WHERE id=?',[status,req.params.id]);res.json({ok:true});});
app.post('/api/v1/payments',permit('Buyer','Admin'),async(req,res)=>{
 const v=z.object({order_id:z.string(),amount:z.number().positive().max(1e12),currency:z.enum(['MWK','ZMW','ZAR','USD','EUR']),method:z.enum(['malawian_bank','airtel_money_mw','tnm_mpamba','zambian_momo','card']),provider:z.string().trim().max(100),bank_name:z.string().trim().max(100).optional(),account_or_phone:z.string().trim().min(3).max(50),notes:z.string().trim().max(500).optional()}).parse(req.body);
 const order=await db.get('SELECT * FROM order_requests WHERE id=?',[v.order_id]);
 if(!order)throw fail(404,'Order request not found.');
 if(req.user.role==='Buyer'&&order.buyer_id!==req.user.id)throw fail(403,'You can only pay for your own order requests.');
 if(order.payment_status==='paid')throw fail(400,'This order has already been paid.');
 const paymentId=randomUUID(),stamp=now();
 const prefix=v.currency==='MWK'?'MWK':v.currency==='ZMW'?'ZMW':v.currency;
 const ref=`WF-${prefix}-${Date.now().toString().slice(-6)}-${randomBytes(3).toString('hex').toUpperCase()}`;
 await db.run('INSERT INTO payments (id,order_id,buyer_id,amount,currency,method,provider,account_or_phone,bank_name,status,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[paymentId,v.order_id,order.buyer_id,v.amount,v.currency,v.method,v.provider,v.account_or_phone,v.bank_name||'','completed',ref,v.notes||'',stamp]);
 await db.run("UPDATE order_requests SET payment_status='paid',payment_ref=?,payment_method=?,amount_paid=?,currency=?,status=CASE WHEN status='New' THEN 'In review' ELSE status END WHERE id=?",[ref,`${v.method}: ${v.provider}${v.bank_name?' ('+v.bank_name+')':''}`,v.amount,v.currency,v.order_id]);
 res.status(201).json({id:paymentId,order_id:v.order_id,amount:v.amount,currency:v.currency,method:v.method,provider:v.provider,bank_name:v.bank_name||'',status:'completed',reference:ref,created_at:stamp});
});
app.get('/api/v1/payments',permit('Buyer','Admin'),async(req,res)=>{
 const where=req.user.role==='Buyer'?' WHERE buyer_id=?':'';
 res.json(await db.all('SELECT * FROM payments'+where+' ORDER BY created_at DESC',req.user.role==='Buyer'?[req.user.id]:[]));
});
app.get('/api/v1/payments/:orderId',permit('Buyer','Admin'),async(req,res)=>{
 const order=await db.get('SELECT * FROM order_requests WHERE id=?',[req.params.orderId]);
 if(!order)throw fail(404,'Order request not found.');
 if(req.user.role==='Buyer'&&order.buyer_id!==req.user.id)throw fail(403,'Access denied.');
 res.json(await db.all('SELECT * FROM payments WHERE order_id=? ORDER BY created_at DESC',[req.params.orderId]));
});

export async function processUssdSession({sessionId,phoneNumber,text='',serviceCode='*211#'}){
 const rawParts=(text||'').split('*').map(s=>s.trim());
 const parts=(rawParts.length===1&&rawParts[0]==='')?[]:rawParts;
 const user=await db.get('SELECT * FROM users WHERE phone=?',[phoneNumber]);
 const currency=phoneNumber.startsWith('+265')?'MWK':phoneNumber.startsWith('+260')?'ZMW':(process.env.CURRENCY||'MWK');

 if(!user){
  if(parts.length===0){
   return 'CON Welcome to Wirefen Marketplace\n1. Register as Farmer\n2. Register as Buyer\n3. Check Crop Prices ('+currency+')\n0. Exit';
  }
  const choice=parts[0];
  if(choice==='1'){
   if(parts.length===1)return 'CON Enter your Full Name:';
   if(parts.length===2)return 'CON Select your Country:\n1. Malawi\n2. Zambia';
   const country=parts[2]==='2'?'Zambia':'Malawi';
   if(parts.length===3)return `CON Enter your District in ${country} (e.g. Lilongwe, Kasungu, Chipata):`;
   if(parts.length===4)return 'CON Enter your Ward or Locality (e.g. Mitundu, Chulu):';
   if(parts.length>=5){
    const name=parts[1],district=parts[3],locality=parts[4],id=randomUUID(),stamp=now();
    await db.run('INSERT INTO users (id,name,phone,password_hash,role,sms_opt_in,sms_opt_in_at,created_at) VALUES (?,?,?,?,?,?,?,?)',[id,name,phoneNumber,hashPassword(randomUUID()),'Farmer',1,stamp,stamp]);
    await db.run('INSERT INTO farmer_profiles (id,user_id,farm_name,country,region,district,locality,ward,location) VALUES (?,?,?,?,?,?,?,?,?)',[randomUUID(),id,`${name}'s Farm`,country,district,district,locality,locality,`${locality}, ${district}, ${country}`]);
    await db.run('INSERT INTO sms_consents VALUES (?,?,?,?,?)',[randomUUID(),id,1,stamp,'ussd']);
    return `END Welcome to Wirefen, ${name}!\nYour Farmer profile is active in ${district}, ${country}. Dial *211# anytime to check prices or record farm costs.`;
   }
  } else if(choice==='2'){
   if(parts.length===1)return 'CON Enter your Name or Business:';
   if(parts.length===2)return 'CON Select your Country:\n1. Malawi\n2. Zambia';
   const country=parts[2]==='2'?'Zambia':'Malawi';
   if(parts.length===3)return 'CON Enter your City/District (e.g. Blantyre, Lilongwe, Lusaka):';
   if(parts.length>=4){
    const name=parts[1],city=parts[3],id=randomUUID(),stamp=now();
    await db.run('INSERT INTO users (id,name,phone,password_hash,role,sms_opt_in,sms_opt_in_at,created_at) VALUES (?,?,?,?,?,?,?,?)',[id,name,phoneNumber,hashPassword(randomUUID()),'Buyer',1,stamp,stamp]);
    await db.run('INSERT INTO sms_consents VALUES (?,?,?,?,?)',[randomUUID(),id,1,stamp,'ussd']);
    return `END Welcome to Wirefen, ${name}!\nYour Buyer account is registered in ${city}, ${country}. Dial *211# or visit wirefen.com to place orders.`;
   }
  } else if(choice==='3'){
   return 'END Wirefen Market Prices:\nMaize: MWK 850 / ZMW 14/kg\nTomatoes: MWK 1,500 / ZMW 25/kg\nSoya Beans: MWK 1,200 / ZMW 20/kg\nPotatoes: MWK 1,100 / ZMW 18/kg';
  } else if(choice==='0'){
   return 'END Thank you for visiting Wirefen Marketplace. Dial *211# anytime.';
  }
  return 'CON Invalid option.\n1. Register as Farmer\n2. Register as Buyer\n3. Check Crop Prices\n0. Exit';
 }

 const farm=user.role==='Farmer'?await db.get('SELECT * FROM farmer_profiles WHERE user_id=?',[user.id]):null;
 if(parts.length===0){
  if(user.role==='Farmer')return `CON Wirefen Farmer: Muli bwanji ${user.name.split(' ')[0]}!\n1. Check Crop Prices\n2. Record Form 1 Farm Costs\n3. My Farm Profile\n0. Exit`;
  return `CON Wirefen: Muli bwanji ${user.name.split(' ')[0]}!\n1. Check Crop Prices\n2. My Orders\n0. Exit`;
 }

 const choice=parts[0];
 if(choice==='1')return 'END Wirefen Market Prices:\nMaize: MWK 850 / ZMW 14/kg\nTomatoes: MWK 1,500 / ZMW 25/kg\nSoya Beans: MWK 1,200 / ZMW 20/kg\nPotatoes: MWK 1,100 / ZMW 18/kg';
 if(user.role==='Farmer'&&choice==='2'){
  if(parts.length===1)return 'CON Form 1 Financial Breakdown (1/4):\nExpected spend for Fertilizer & Seeds? (Reply 0 to skip):';
  if(parts.length===2)return 'CON Step 2/4: Expected spend for Labor (planting & weeding)? (Reply 0 to skip):';
  if(parts.length===3)return 'CON Step 3/4: Expected spend for Processing (post-harvest prep)? (Reply 0 to skip):';
  if(parts.length===4)return 'CON Step 4/4: Expected spend for Transportation? (Reply 0 to skip):';
  if(parts.length>=5){
   const c1=Number(parts[1])||0,c2=Number(parts[2])||0,c3=Number(parts[3])||0,c4=Number(parts[4])||0;
   const total=c1+c2+c3+c4;
   if(farm){
    await db.run("INSERT INTO historical_baselines (farmer_id,cost_fertilizer_seeds,cost_labor,cost_processing,cost_transportation,avg_production_cost,status,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(farmer_id) DO UPDATE SET cost_fertilizer_seeds=excluded.cost_fertilizer_seeds,cost_labor=excluded.cost_labor,cost_processing=excluded.cost_processing,cost_transportation=excluded.cost_transportation,avg_production_cost=excluded.avg_production_cost,status='draft',updated_at=excluded.updated_at",[farm.id,c1,c2,c3,c4,total,'draft',now()]);
   }
   return `END Costs saved!\nFertilizer: ${c1}\nLabor: ${c2}\nProcessing: ${c3}\nTransport: ${c4}\nTotal Estimated Cost: ${currency} ${total}.\nThank you!`;
  }
 }
 if(user.role==='Farmer'&&choice==='3'){
  if(!farm)return 'END Farm details not found. Please contact support.';
  return `END Farm: ${farm.farm_name}\nLocation: ${farm.location||farm.district||'Malawi'}\nStatus: ${farm.verification_status}\nPhone: ${user.phone}`;
 }
 if(user.role==='Buyer'&&choice==='2'){
  const orders=await db.all('SELECT o.*,l.title FROM order_requests o JOIN listings l ON l.id=o.listing_id WHERE o.buyer_id=? ORDER BY o.created_at DESC LIMIT 3',[user.id]);
  if(!orders.length)return 'END You have no active orders. Browse listings on wirefen.com.';
  return `END Recent Orders:\n${orders.map(o=>`${o.title.slice(0,15)}: ${o.payment_status==='paid'?'PAID':o.status}`).join('\n')}`;
 }
 if(choice==='0')return 'END Thank you for using Wirefen. Dial *211# anytime.';
 return 'END Invalid option selected. Dial *211# to start again.';
}

app.post('/api/v1/webhooks/ussd',async(req,res)=>{
 try{
  const sessionId=req.body.sessionId||randomUUID(),serviceCode=req.body.serviceCode||'*211#';
  const phoneNumber=req.body.phoneNumber||req.body.phone||'';
  const text=req.body.text??'';
  if(!phoneNumber)return res.type('text/plain').send('END Phone number is required.');
  const response=await processUssdSession({sessionId,phoneNumber,text,serviceCode});
  res.type('text/plain').send(response);
 }catch(err){
  console.error('USSD error:',err);
  res.type('text/plain').send('END An error occurred. Please try again.');
 }
});

app.post('/api/v1/ussd/simulate',async(req,res)=>{
 const v=z.object({phoneNumber:phone,text:z.string().max(200).default(''),serviceCode:z.string().max(20).default('*211#'),sessionId:z.string().max(100).optional()}).parse(req.body);
 const sessionId=v.sessionId||randomUUID();
 const response=await processUssdSession({sessionId,phoneNumber:v.phoneNumber,text:v.text,serviceCode:v.serviceCode});
 res.json({sessionId,phoneNumber:v.phoneNumber,response,isEnd:response.startsWith('END'),menuText:response.replace(/^(CON|END)\s+/,'')});
});

const smsLimit=rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false});
app.post('/api/v1/webhooks/sms/receive',smsLimit,async(req,res)=>{
 const token=process.env.TWILIO_AUTH_TOKEN,url=process.env.TWILIO_WEBHOOK_URL;
 if(!token||!url)throw fail(503,'SMS provider is not configured.');
 if(!twilio.validateRequest(token,req.get('X-Twilio-Signature')||'',url,req.body))throw fail(403,'Invalid SMS signature.');
 const {From,Body,MessageSid}=z.object({From:phone,Body:z.string().max(1600),MessageSid:z.string().min(1).max(80)}).parse(req.body);
 const xml=message=>{const response=new twilio.twiml.MessagingResponse();if(message)response.message(message);res.type('text/xml').send(response.toString());};
 if(await db.get('SELECT message_sid FROM sms_messages WHERE message_sid=?',[MessageSid]))return xml();
 const u=await db.get('SELECT * FROM users WHERE phone=?',[From]);
 if(!u){
  const clean=Body.trim(),upper=clean.toUpperCase();
  if(upper.startsWith('JOIN')||upper.startsWith('SIGNUP')){
   const match=clean.match(/^(?:JOIN|SIGNUP)\s+(FARMER|BUYER)\s+(.+)$/i);
   if(match){
    const role=match[1].charAt(0).toUpperCase()+match[1].slice(1).toLowerCase();
    const rest=match[2].split(/[,;]+/).map(s=>s.trim()).filter(Boolean);
    const name=rest[0]||'Wirefen User',country=rest[1]||'Malawi',district=rest[2]||'Lilongwe',locality=rest[3]||'Mitundu';
    const id=randomUUID(),stamp=now();
    await db.run('INSERT INTO users (id,name,phone,password_hash,role,sms_opt_in,sms_opt_in_at,created_at) VALUES (?,?,?,?,?,?,?,?)',[id,name,From,hashPassword(randomUUID()),role,1,stamp,stamp]);
    if(role==='Farmer'){
     await db.run('INSERT INTO farmer_profiles (id,user_id,farm_name,country,region,district,locality,ward,location) VALUES (?,?,?,?,?,?,?,?,?)',[randomUUID(),id,`${name}'s Farm`,country,district,district,locality,locality,`${locality}, ${district}, ${country}`]);
    }
    await db.run('INSERT INTO sms_consents VALUES (?,?,?,?,?)',[randomUUID(),id,1,stamp,'sms']);
    await db.run('INSERT INTO sms_messages VALUES (?,?)',[MessageSid,now()]);
    return xml(`Welcome to Wirefen, ${name}! Your ${role} account is registered. Reply BASELINE to record farm yield, COST for cost breakdown, or dial *211#.`);
   }
   return xml('To register via SMS, reply: JOIN FARMER <Name>, <Country>, <District>, <Locality> or dial *211# for interactive menu.');
  }
  return xml('Welcome to Wirefen! To register, reply JOIN FARMER <Name>, <Country>, <District>, <Locality> or dial *211# on your phone.');
 }
 const command=Body.trim().toUpperCase();
 if(['STOP','START'].includes(command)){const opt=+(command==='START');await db.run('UPDATE users SET sms_opt_in=?,sms_opt_in_at=? WHERE id=?',[opt,opt?now():null,u.id]);await db.run('INSERT INTO sms_consents VALUES (?,?,?,?,?)',[randomUUID(),u.id,opt,now(),'sms']);await db.run('DELETE FROM conversational_state WHERE user_phone=?',[From]);await db.run('INSERT INTO sms_messages VALUES (?,?)',[MessageSid,now()]);return xml(opt?'SMS updates enabled. Reply BASELINE to record yield.':'SMS updates stopped. Reply START to opt in again.');}
 if(!u.sms_opt_in)return xml('Reply START to opt in to Wirefen SMS.');
 if(u.role!=='Farmer')return xml('Farmer baseline entry is available to farmer accounts.');
 const farm=await db.get('SELECT id FROM farmer_profiles WHERE user_id=?',[u.id]);
 const state=await db.get('SELECT * FROM conversational_state WHERE user_phone=?',[From]);
 let message;
 const parseCost=txt=>{const s=txt.trim().toLowerCase();if(s==='skip')return 0;const n=Number(s.replace(/[^0-9.]/g,''));return Number.isFinite(n)&&n>=0&&n<=1e12?n:null;};
 if(command==='BASELINE'){await db.run('INSERT INTO conversational_state VALUES (?,?,?,?) ON CONFLICT(user_phone) DO UPDATE SET current_form_id=excluded.current_form_id,last_question_asked=excluded.last_question_asked,timestamp=excluded.timestamp',[From,'baseline','avg_yield_per_acre',now()]);message='What is your average yield in kilograms per acre? Reply with a positive number.';}
 else if(['COST','EXPENSE','EXPENSES'].includes(command)){await db.run('INSERT INTO conversational_state VALUES (?,?,?,?) ON CONFLICT(user_phone) DO UPDATE SET current_form_id=excluded.current_form_id,last_question_asked=excluded.last_question_asked,timestamp=excluded.timestamp',[From,'baseline','cost_fertilizer_seeds',now()]);message='Form 1 Financial Breakdown (1/4): Expected spend for Fertilizer and Seeds? Reply with an amount, or 0.';}
 else if(state?.last_question_asked==='avg_yield_per_acre'&&Date.now()-Date.parse(state.timestamp)<86400000){const value=Number(Body.trim());if(!Number.isFinite(value)||value<=0||value>1e9)message='Enter a positive yield in kilograms per acre, such as 500.';else{await db.run("INSERT INTO historical_baselines (farmer_id,avg_yield_per_acre,status,updated_at) VALUES (?,?,'draft',?) ON CONFLICT(farmer_id) DO UPDATE SET avg_yield_per_acre=excluded.avg_yield_per_acre,status='draft',updated_at=excluded.updated_at",[farm.id,value,now()]);await db.run('INSERT INTO conversational_state VALUES (?,?,?,?) ON CONFLICT(user_phone) DO UPDATE SET current_form_id=excluded.current_form_id,last_question_asked=excluded.last_question_asked,timestamp=excluded.timestamp',[From,'baseline','cost_fertilizer_seeds',now()]);message='Yield saved to your draft. Form 1 Financial Breakdown (1/4): Expected spend for Fertilizer and Seeds? Reply with an amount, or 0.';}}
 else if(state?.last_question_asked==='cost_fertilizer_seeds'&&Date.now()-Date.parse(state.timestamp)<86400000){const value=parseCost(Body);if(value===null)message='Enter a positive spend for Fertilizer and Seeds, or reply 0 to skip.';else{await db.run("INSERT INTO historical_baselines (farmer_id,cost_fertilizer_seeds,status,updated_at) VALUES (?,?,'draft',?) ON CONFLICT(farmer_id) DO UPDATE SET cost_fertilizer_seeds=excluded.cost_fertilizer_seeds,status='draft',updated_at=excluded.updated_at",[farm.id,value,now()]);await db.run('INSERT INTO conversational_state VALUES (?,?,?,?) ON CONFLICT(user_phone) DO UPDATE SET current_form_id=excluded.current_form_id,last_question_asked=excluded.last_question_asked,timestamp=excluded.timestamp',[From,'baseline','cost_labor',now()]);message='Fertilizer & seeds spend saved. Step 2/4: Expected spend for Labor (planting and maintenance)? Reply with an amount, or 0.';}}
 else if(state?.last_question_asked==='cost_labor'&&Date.now()-Date.parse(state.timestamp)<86400000){const value=parseCost(Body);if(value===null)message='Enter a positive spend for Labor, or reply 0 to skip.';else{await db.run("INSERT INTO historical_baselines (farmer_id,cost_labor,status,updated_at) VALUES (?,?,'draft',?) ON CONFLICT(farmer_id) DO UPDATE SET cost_labor=excluded.cost_labor,status='draft',updated_at=excluded.updated_at",[farm.id,value,now()]);await db.run('INSERT INTO conversational_state VALUES (?,?,?,?) ON CONFLICT(user_phone) DO UPDATE SET current_form_id=excluded.current_form_id,last_question_asked=excluded.last_question_asked,timestamp=excluded.timestamp',[From,'baseline','cost_processing',now()]);message='Labor spend saved. Step 3/4: Expected spend for Processing (harvest prep for storage)? Reply with an amount, or 0.';}}
 else if(state?.last_question_asked==='cost_processing'&&Date.now()-Date.parse(state.timestamp)<86400000){const value=parseCost(Body);if(value===null)message='Enter a positive spend for Processing, or reply 0 to skip.';else{await db.run("INSERT INTO historical_baselines (farmer_id,cost_processing,status,updated_at) VALUES (?,?,'draft',?) ON CONFLICT(farmer_id) DO UPDATE SET cost_processing=excluded.cost_processing,status='draft',updated_at=excluded.updated_at",[farm.id,value,now()]);await db.run('INSERT INTO conversational_state VALUES (?,?,?,?) ON CONFLICT(user_phone) DO UPDATE SET current_form_id=excluded.current_form_id,last_question_asked=excluded.last_question_asked,timestamp=excluded.timestamp',[From,'baseline','cost_transportation',now()]);message='Processing spend saved. Step 4/4: Expected spend for Transportation (moving produce from farm)? Reply with an amount, or 0.';}}
 else if(state?.last_question_asked==='cost_transportation'&&Date.now()-Date.parse(state.timestamp)<86400000){const value=parseCost(Body);if(value===null)message='Enter a positive spend for Transportation, or reply 0 to skip.';else{const row=await db.get('SELECT * FROM historical_baselines WHERE farmer_id=?',[farm.id])||{};const total=(Number(row.cost_fertilizer_seeds)||0)+(Number(row.cost_labor)||0)+(Number(row.cost_processing)||0)+value;await db.run("INSERT INTO historical_baselines (farmer_id,cost_transportation,avg_production_cost,status,updated_at) VALUES (?,?,?,'draft',?) ON CONFLICT(farmer_id) DO UPDATE SET cost_transportation=excluded.cost_transportation,avg_production_cost=excluded.avg_production_cost,status='draft',updated_at=excluded.updated_at",[farm.id,value,total,now()]);await db.run('DELETE FROM conversational_state WHERE user_phone=?',[From]);message=`Transportation spend saved. Financial estimation complete! Total Estimated Cost: ${process.env.CURRENCY||'MWK'} ${total}. Complete the remaining baseline fields on Wirefen.`;}}
 else message='Reply BASELINE to record average yield, COST for financial breakdown, or STOP to opt out.';
 await db.run('INSERT INTO sms_messages VALUES (?,?)',[MessageSid,now()]);xml(message);
});
app.use('/api',(req,res)=>res.status(404).json({error:'API endpoint not found.'}));
app.use((err,req,res,next)=>{if(err instanceof z.ZodError)return res.status(400).json({error:err.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '),fields:err.issues});if(err.code==='23505'||err.code==='ERR_SQLITE_ERROR'&&String(err.message).includes('UNIQUE'))return res.status(409).json({error:'This record already exists.'});if(!err.status)console.error(err);res.status(err.status||500).json({error:err.status?err.message:'Something went wrong. Please try again.'});});
if(process.env.NODE_ENV!=='test'){
 const host=process.env.API_HOST||process.env.HOST||'127.0.0.1',port=Number(process.env.API_PORT||process.env.PORT||3001);
 const server=app.listen(port,host,()=>console.log(`Wirefen API: http://${host}:${port}`));
 let stopping=false;
 const shutdown=()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>process.exit(1),10000);deadline.unref();server.close(async()=>{try{await db.close();clearTimeout(deadline);process.exit(0);}catch{process.exit(1);}});server.closeIdleConnections();};
 process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
