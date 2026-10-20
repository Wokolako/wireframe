import {normalizeGeography,hasGeography} from '../shared/geography.mjs';
import {guestLimitFor,guestLimits} from '../shared/guest-limits.mjs';
import {costFields,mergeCosts} from '../shared/finance.mjs';
import type {Farmer,Listing,Order,Payment,User} from './api';
import {adminEmail,clerkPublishableKey} from './auth-config';
// Presentation-only persistence. No credentials, API requests or real transactions.
const key='wirefen-presentation-v1';
type Identity={id:string;name:string;email:string;verifiedEmails:string[]};
let identity:Identity|null=null;
export function setDemoIdentity(value:Identity|null){identity=value;}
const isAdmin=()=>!!identity?.verifiedEmails.some(email=>email.toLowerCase()===adminEmail);
type State={users:User[];farmers:Farmer[];listings:Listing[];orders:(Order&{buyer_id:string})[];payments?:Payment[];guestOrders?:Record<string,unknown>[];bulkOrders?:Record<string,unknown>[];baselines:Record<string,Record<string,unknown>>;drafts:Record<string,Record<string,unknown>>;session:string|null;pwa:Record<string,string>};
const now=()=>new Date().toISOString();
const day=(n=0)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
function seed():State{
 return {users:[],farmers:[],listings:[],orders:[],payments:[],baselines:{},drafts:{},session:null,pwa:{}};
}
let memory:State|undefined;
function load():State{if(memory)return memory;try{const saved=localStorage.getItem(key);if(saved){memory=JSON.parse(saved);if(memory){memory.baselines={};return memory;}}}catch{}return memory=seed();}
export async function demoApi(path:string,options:RequestInit={}):Promise<unknown>{
 const data=load(),url=new URL(path,'https://presentation.invalid'),route=url.pathname,q=url.searchParams,method=options.method||'GET';
 const body:Record<string,unknown>=options.body?JSON.parse(String(options.body)):{};
 let user=identity?data.users.find(u=>u.id===identity!.id)||null:null;
 // Demo roles derive from the signed-in identity, never the old sample-role switch.
 if(identity&&isAdmin()){
  if(!user){user={id:identity.id,name:identity.name||'George Chivalo',email:identity.email,phone:'Not provided',role:'Admin',sms_opt_in:false,farmer:null};data.users.push(user);}
  user.role='Admin';user.farmer=null;
 }else if(user?.role==='Admin'){user.role='Buyer';user.farmer=null;}
 const finish=(value:unknown)=>{memory=data;try{localStorage.setItem(key,JSON.stringify({...data,baselines:{}}));}catch{}return structuredClone(value);};
 const account=(roles:string[])=>{if(!user||!roles.includes(user.role))throw new Error('Sign in with an authorized account to continue.');return user;};
 if(route==='/config')return {demo:true,presentation:true,market:'South Africa (sample market)',currency:'ZAR',sms_ready:false,auth_provider:'clerk',clerk_publishable_key:clerkPublishableKey,capabilities:{guest_checkout:true,online_payments:true,paychangu_mobile_money:true,ussd:false,sms:false}};
 if(route==='/auth/me')return finish(user);
 if(route==='/auth/onboard'){
  if(!identity)throw new Error('Sign in with Clerk to create your profile.');if(user)return finish(user);
  if(!['Buyer','Farmer'].includes(String(body.role)))throw new Error('Choose Buyer or Farmer.');
  const name=String(body.name||'').trim(),phone=String(body.phone||'').trim(),role=body.role as 'Buyer'|'Farmer';
  if(name.length<2||!/^\+[1-9]\d{7,14}$/.test(phone))throw new Error('Enter your name and a phone number with its country code.');
  if(data.users.some(u=>u.phone===phone))throw new Error('This phone number is already used by another profile on this device.');
  let farmer:Farmer|null=null;
  if(role==='Farmer'){
   const farm_name=String(body.farm_name||'').trim();
   const g=normalizeGeography(body);
   if(farm_name.length<2)throw new Error('Enter your farm name.');
   farmer={...g,id:'farm-'+identity.id,user_id:identity.id,name,phone,farm_name,farm_size:0,verification_status:'Unverified'};
   data.farmers.push(farmer);
  }
  user={id:identity.id,name,email:identity.email,phone,role,sms_opt_in:!!body.sms_opt_in,farmer};data.users.push(user);return finish(user);
 }
 if(route==='/auth/demo')throw new Error('Sample account switching is disabled. Sign in with your Clerk account.');
 if(route==='/auth/logout'){data.session=null;data.baselines={};return finish({ok:true});}
 if(route.startsWith('/auth/'))throw new Error('Use Clerk to sign in or create your account.');
 if(route==='/exchange-rates')return {base:'EUR',rates:{EUR:1,USD:1.1,ZAR:20},dates:{USD:day(),ZAR:day()},sources:{USD:'presentation-sample',ZAR:'presentation-sample'},fetched_at:now(),source:'Illustrative presentation rates (not live)',stale:false,demo:true};
 if(route==='/pwa/session'||route==='/pwa/events'){if(method==='POST'&&['prompted','dismissed','installed'].includes(String(body.event)))data.pwa[String(body.event)+'_at']??=now();return finish({...data.pwa,suppress_prompt:!!(data.pwa.prompted_at||data.pwa.dismissed_at||data.pwa.installed_at),device_installed:!!data.pwa.installed_at});}
 if(route==='/account/consent'){account(['Farmer','Buyer','Admin','Agent']).sms_opt_in=!!body.sms_opt_in;return finish({ok:true});}
 if(route==='/account/location'){
  const u=account(['Farmer']),g=normalizeGeography(body);if(!u.farmer)throw new Error('Farm not found.');Object.assign(u.farmer,g);Object.assign(data.farmers.find(f=>f.id===u.farmer!.id)!,g);return finish(u);
 }
 if(route==='/admin/financial-analytics'){account(['Admin']);return {minimum_group_size:5,regions:[]};}
 if(route==='/admin/agents'||route==='/admin/verifications'){account(['Admin']);return [];}
 if(route==='/agent/verifications'){account(['Agent']);return [];}
 if(route==='/farmers'){account(['Admin']);return finish(data.farmers.map(f=>({...f,baseline_status:data.baselines[f.id]?.status})));}
 if(route==='/guest-limits')return structuredClone(guestLimits);
 if(route==='/admin/listings'){
  account(['Admin']);const rows=data.listings.filter(l=>['country_code','region','locality'].every(k=>!q.get(k)||String(k==='country_code'?data.farmers.find(f=>f.id===l.farmer_id)?.country_code:(data.farmers.find(f=>f.id===l.farmer_id) as unknown as Record<string,unknown>)?.[k]||'').toLowerCase()===q.get(k)!.toLowerCase())).map(l=>({...l,...data.farmers.find(f=>f.id===l.farmer_id)}));
  const byUnit=new Map<string,number>();for(const row of rows){const unit=row.sale_unit||'kg';byUnit.set(unit,(byUnit.get(unit)||0)+Number(row.available_volume));}
  return finish({listing_count:rows.length,total_available_kg:byUnit.get('kg')||0,stock_by_unit:[...byUnit].map(([unit,available])=>({unit,available})),listings:rows});
 }
 if(route==='/admin/guest-orders'){account(['Admin']);return finish(data.guestOrders||[]);}
 if(route.startsWith('/admin/guest-orders/')&&method==='PATCH'){account(['Admin']);const row=data.guestOrders?.find(r=>r.id===route.split('/').pop());if(!row)throw new Error('Guest order not found.');row.status=body.status;return finish({id:row.id,status:row.status});}
 if(route.startsWith('/admin/guest-orders/')&&route.endsWith('/collect-payment')&&method==='POST'){
  account(['Admin']);const row=data.guestOrders?.find(r=>r.id===route.split('/')[3]);
  if(!row||row.status!=='Confirmed'||row.payment_status==='paid')throw new Error('Confirm the unpaid order before recording delivery payment.');
  row.payment_status='paid';row.paid_at=now();return finish({id:row.id,payment_status:'paid',paid_at:row.paid_at});
 }
 if(route==='/bulk-orders'){
  const u=account(['Buyer','Admin']);if(method==='GET')return finish((data.bulkOrders||[]).filter(r=>u.role==='Admin'||r.buyer_id===u.id));
  if(u.role!=='Buyer')throw new Error('Use a buyer account.');
  const row={...body,id:crypto.randomUUID(),buyer_id:u.id,status:'New',created_at:now()};data.bulkOrders??=[];data.bulkOrders.push(row);return finish({id:row.id,status:'New'});
 }
 if(route.startsWith('/bulk-orders/')&&method==='PATCH'){const u=account(['Buyer','Admin']),row=data.bulkOrders?.find(r=>r.id===route.split('/')[2]);if(!row||u.role==='Buyer'&&row.buyer_id!==u.id)throw new Error('Request not found.');if(u.role==='Buyer'&&body.status!=='Cancelled')throw new Error('You may only cancel your request.');row.status=body.status;return finish({id:row.id,status:row.status});}
 if(route==='/guest-orders'){
  const item=data.listings.find(l=>l.id===body.listing_id&&data.farmers.find(f=>f.id===l.farmer_id)?.verification_status==='Verified');const cap=guestLimitFor(item?.title||'');
  if(!item||item.available_volume==null||!cap||cap.unit!==(item.sale_unit||'kg')||Number(body.quantity)<=0||Number(body.quantity)>cap.max||Number(body.quantity)>item.available_volume)throw new Error(`The household limit is ${cap?.max||'unavailable'} ${cap?.unit||''}. Use Order Request.`);
  const recent=(data.guestOrders||[]).filter(r=>r.status!=='Cancelled'&&Date.now()-Date.parse(String(r.created_at))<=86400000&&(r.contact_phone===body.contact_phone||String(r.contact_email).toLowerCase()===String(body.contact_email).toLowerCase())).filter(r=>guestLimitFor(data.listings.find(l=>l.id===r.listing_id)?.title||'')?.name===cap.name).reduce((sum,r)=>sum+Number(r.quantity),0);
  if(recent+Number(body.quantity)>cap.max)throw new Error(`The household limit is ${cap.max} kg across orders in 24 hours. Use Order Request.`);
  const row={...body,quantity_unit:cap.unit,payment_method:'paychangu_mobile_money',payment_status:'unpaid',unit_price:item.price,currency:'ZAR',id:crypto.randomUUID(),status:'Confirmed',created_at:now()};data.guestOrders??=[];data.guestOrders.push(row);return finish({id:row.id,checkout_id:row.id,status:'Confirmed',payment_method:'paychangu_mobile_money',payment_status:'unpaid'});
 }
 if(route==='/guest-orders/basket'){
  const items=body.items as {listing_id:string;quantity:number}[];
  if(!Array.isArray(items)||!items.length||new Set(items.map(x=>x.listing_id)).size!==items.length)throw new Error('Choose distinct produce for your basket.');
  const totals=new Map<string,number>();for(const prior of data.guestOrders||[]){if(prior.status==='Cancelled'||Date.now()-Date.parse(String(prior.created_at))>86400000||prior.contact_phone!==body.contact_phone&&String(prior.contact_email).toLowerCase()!==String(body.contact_email).toLowerCase())continue;const listing=data.listings.find(l=>l.id===prior.listing_id),cap=guestLimitFor(listing?.title||'');if(cap)totals.set(cap.name,(totals.get(cap.name)||0)+Number(prior.quantity));}
  for(const line of items){const item=data.listings.find(l=>l.id===line.listing_id&&data.farmers.find(f=>f.id===l.farmer_id)?.verification_status==='Verified'),cap=guestLimitFor(item?.title||'');if(!item||item.available_volume==null||!cap||cap.unit!==(item.sale_unit||'kg')||!(line.quantity>0)||line.quantity>item.available_volume)throw new Error('This produce needs an Order Request.');totals.set(cap.name,(totals.get(cap.name)||0)+line.quantity);if((totals.get(cap.name)||0)>cap.max)throw new Error(`${cap.name} has a household limit of ${cap.max} ${cap.unit}. Use Order Request.`);}
  const rows=items.map(line=>({...body,items:undefined,listing_id:line.listing_id,quantity:line.quantity,quantity_unit:guestLimitFor(data.listings.find(l=>l.id===line.listing_id)?.title||'')?.unit||'kg',payment_method:'paychangu_mobile_money',payment_status:'unpaid',unit_price:data.listings.find(l=>l.id===line.listing_id)?.price,currency:'ZAR',id:crypto.randomUUID(),status:'Confirmed',created_at:now()}));data.guestOrders??=[];data.guestOrders.push(...rows);return finish({checkout_id:rows[0].id,ids:rows.map(r=>r.id),status:'Confirmed',payment_method:'paychangu_mobile_money',payment_status:'unpaid'});
 }
 if(route==='/paychangu/operators')return finish({data:[{ref_id:'airtel-mwk',name:'Airtel Money (MWK)'},{ref_id:'tnm-mpamba',name:'TNM Mpamba (MWK)'}]});
 if(route==='/paychangu/initialize'){
  const chargeId=`WF${crypto.randomUUID().replaceAll('-','').slice(0,20)}`;
  const order=data.guestOrders?.find(r=>r.id===body.checkout_id);
  if(order)order.payment_status='pending';
  return finish({checkout_id:body.checkout_id,charge_id:chargeId,amount:25000,currency:'MWK',status:'pending',message:'Approve the mobile-money request on your phone.'});
 }
 if(route.startsWith('/guest-orders/')&&route.endsWith('/payment-status')){
  const id=decodeURIComponent(route.split('/')[2]);
  const order=data.guestOrders?.find(r=>r.id===id);
  return finish({checkout_id:id,status:order?.status||'Confirmed',payment_method:'paychangu_mobile_money',payment_status:order?.payment_status||'unpaid',currency:order?.currency||'USD',total_minor:2500,mwk_total:43306});
 }
 const farmRoute=route.match(/^\/farmers\/([^/]+)\/(baseline|listing-draft)$/);
 if(farmRoute){
  const [,id,kind]=farmRoute,u=account(kind==='baseline'?['Farmer']:['Farmer','Admin']),farm=data.farmers.find(f=>f.id===id);
  if(!farm||u.role!=='Admin'&&farm.user_id!==u.id)throw new Error('Choose a farm you are authorized to manage.');
  const table=kind==='baseline'?data.baselines:data.drafts;
  if(method!=='GET'){
   const updateData={...body};
   if(kind==='baseline'){
    if(!hasGeography(farm))throw new Error('Complete your farm location in Settings.');
    const complete=body.status==='complete';
    const merged={...table[id],...body};
    if(complete&&(!String(merged.crop_type||'').trim()||['avg_land_size','avg_yield_per_acre','avg_duration_days'].some(k=>!(Number(merged[k])>0))))throw new Error('Complete the crop, land, yield and duration fields.');
    Object.assign(updateData,mergeCosts(table[id]||{},body,complete),{status:complete?'complete':'draft'});
   }

   table[id]={...table[id],...updateData,updated_at:now()};
  }
  return finish(table[id]||(kind==='baseline'?{status:'draft'}:{}));
 }
 const publicListing=(l:Listing)=>({id:l.id,title:guestLimitFor(l.title)?.name||l.crop_category,crop_category:l.crop_category,price:l.price,sale_unit:l.sale_unit||'kg',harvest_date:l.harvest_date,expiration_date:l.expiration_date,shelf_life_days:l.shelf_life_days,preservative_used:l.preservative_used,description:`Verified ${l.crop_category.toLowerCase()} available through Wirefen.`,image:l.image,verified:true,sustainability_badge:true,agent_score:l.agent_score,traceability:`WF-BATCH-${l.id.slice(0,8)}`,guest_limit:guestLimitFor(l.title)});
 if(route==='/listings'&&method==='GET'){
  if(q.has('mine')){account(['Farmer']);return finish(data.listings.filter(l=>l.farmer_id===user?.farmer?.id));}
  return finish(data.listings.filter(l=>data.farmers.find(f=>f.id===l.farmer_id)?.verification_status==='Verified'&&(!q.get('category')||l.crop_category===q.get('category'))&&(!q.get('search')||l.title.toLowerCase().includes(q.get('search')!.toLowerCase()))).map(publicListing));
 }
 if(route==='/listings'&&method==='POST'){
  const u=account(['Farmer','Admin']),farm=data.farmers.find(f=>f.id===body.farmer_id);if(!farm||u.role!=='Admin'&&farm.user_id!==u.id)throw new Error('Choose a farm you are authorized to manage.');
  if(!hasGeography(farm))throw new Error('Complete your farm location in Settings.');const id=crypto.randomUUID(),crop_category=String(body.crop_category),image=({Vegetables:'tomatoes',Fruits:'avocados',Grains:'maize',Tubers:'potatoes',Legumes:'beans'} as Record<string,string>)[crop_category]||'tomatoes';
  data.listings.unshift({id,farmer_id:farm.id,title:String(body.title),crop_category,available_volume:Number(body.available_volume),sale_unit:String(body.sale_unit||guestLimitFor(String(body.title))?.unit||'kg'),price:Number(body.price),harvest_date:String(body.harvest_date),expiration_date:String(body.expiration_date),shelf_life_days:Number(body.shelf_life_days),preservative_used:body.preservative_used?1:0,description:String(body.description||''),image:`/images/${image}.jpg`,farm_name:farm.farm_name,location:farm.location,verification_status:farm.verification_status,traceability:String(body.traceability||'')});delete data.drafts[farm.id];return finish({id});
 }
 if(route.startsWith('/listings/')){const item=data.listings.find(l=>l.id===route.split('/')[2]&&data.farmers.find(f=>f.id===l.farmer_id)?.verification_status==='Verified');if(!item)throw new Error('Sample listing not found.');return finish(publicListing(item));}
 if(route==='/orders'){
  const u=account(method==='GET'?['Buyer','Farmer','Admin']:['Buyer']);if(method==='GET')return finish(data.orders.filter(o=>u.role==='Admin'||u.role==='Buyer'&&o.buyer_id===u.id||u.role==='Farmer'&&data.listings.find(l=>l.id===o.listing_id)?.farmer_id===u.farmer?.id));
  const item=data.listings.find(l=>l.id===body.listing_id);if(!item||item.available_volume==null||Number(body.volume)<=0||Number(body.volume)>item.available_volume)throw new Error('Enter a quantity within the available supply.');const id=crypto.randomUUID();
  data.orders.unshift({id,listing_id:item.id,title:item.title,volume:Number(body.volume),delivery_location:String(body.delivery_location),notes:String(body.notes||''),status:'New',created_at:now(),buyer_id:u.id,buyer_name:u.name,phone:u.phone});return finish({id,status:'New'});
 }
 if(route.startsWith('/orders/')&&method==='PATCH'){const u=account(['Farmer','Admin']),order=data.orders.find(o=>o.id===route.split('/')[2]);if(!order)throw new Error('Sample request not found.');const listing=data.listings.find(l=>l.id===order.listing_id);if(u.role==='Farmer'&&listing?.farmer_id!==u.farmer?.id)throw new Error('You can only manage requests for your own produce.');if(u.role==='Farmer'&&!['Accepted','Declined','Approved','Denied','Contacted','Closed'].includes(String(body.status)))throw new Error('Choose a seller response for this request.');order.status=String(body.status);return finish({ok:true,status:order.status});}
 if(route==='/payments'){
  const u=account(method==='GET'?['Buyer','Admin']:['Buyer','Admin']);
  if(method==='GET')return finish((data.payments||[]).filter(p=>u.role==='Admin'||p.buyer_id===u.id));
  const order=data.orders.find(o=>o.id===body.order_id);
  if(!order)throw new Error('Order not found.');
  const id=crypto.randomUUID(),nowStr=now();
  const prefix=body.currency==='MWK'?'MWK':body.currency==='ZMW'?'ZMW':String(body.currency||'MWK');
  const ref=`WF-${prefix}-${Date.now().toString().slice(-6)}-DEMO`;
  const payment:Payment={id,order_id:String(body.order_id),buyer_id:order.buyer_id,amount:Number(body.amount),currency:String(body.currency),method:String(body.method),provider:String(body.provider),bank_name:body.bank_name?String(body.bank_name):undefined,account_or_phone:String(body.account_or_phone),status:'completed',reference:ref,notes:body.notes?String(body.notes):'',created_at:nowStr};
  data.payments??=[];
  data.payments.unshift(payment);
  order.payment_status='paid';
  order.payment_ref=ref;
  order.payment_method=`${payment.method}: ${payment.provider}${payment.bank_name?' ('+payment.bank_name+')':''}`;
  order.amount_paid=payment.amount;
  order.currency=payment.currency;
  if(order.status==='New')order.status='In review';
  return finish(payment);
 }
 if(route.startsWith('/payments/')){
  const u=account(['Buyer','Admin']);
  const orderId=route.split('/')[2];
  return finish((data.payments||[]).filter(p=>p.order_id===orderId&&(u.role==='Admin'||p.buyer_id===u.id)));
 }
 if(route==='/ussd/simulate'&&method==='POST'){
  const text=String(body.text||'').trim();
  const rawParts=text.split('*').map(s=>s.trim());
  const parts=(rawParts.length===1&&rawParts[0]==='')?[]:rawParts;
  const phoneNumber=String(body.phoneNumber||'+265991234567');
  const currency=phoneNumber.startsWith('+265')?'MWK':phoneNumber.startsWith('+260')?'ZMW':'MWK';
  const existing=data.users.find(u=>u.phone===phoneNumber);
  let response='CON Welcome to Wirefen Marketplace\n1. Register as Farmer\n2. Register as Buyer\n3. Check Crop Prices ('+currency+')\n0. Exit';
  if(!existing){
   if(parts.length===1&&parts[0]==='1')response='CON Enter your Full Name:';
   else if(parts.length===2&&parts[0]==='1')response='CON Select your Country:\n1. Malawi\n2. Zambia';
   else if(parts.length===3&&parts[0]==='1')response='CON Enter your District (e.g. Lilongwe, Kasungu, Chipata):';
   else if(parts.length===4&&parts[0]==='1')response='CON Enter your Ward or Locality (e.g. Mitundu, Chulu):';
   else if(parts.length>=5&&parts[0]==='1'){
    const name=parts[1],district=parts[3];
    response=`END Welcome to Wirefen, ${name}!\nYour Farmer profile is active in ${district}, Malawi. Dial *211# anytime to check prices or record farm costs.`;
   }
   else if(parts.length===1&&parts[0]==='2')response='CON Enter your Name or Business:';
   else if(parts.length===2&&parts[0]==='2')response='CON Select your Country:\n1. Malawi\n2. Zambia';
   else if(parts.length===3&&parts[0]==='2')response='CON Enter your City/District:';
   else if(parts.length>=4&&parts[0]==='2')response=`END Welcome to Wirefen, ${parts[1]}!\nYour Buyer account is registered in ${parts[3]}. Dial *211# or visit wirefen.com to place orders.`;
   else if(parts[0]==='3')response='END Wirefen Market Prices:\nMaize: MWK 850 / ZMW 14/kg\nTomatoes: MWK 1,500 / ZMW 25/kg\nSoya Beans: MWK 1,200 / ZMW 20/kg\nPotatoes: MWK 1,100 / ZMW 18/kg';
   else if(parts[0]==='0')response='END Thank you for visiting Wirefen Marketplace. Dial *211# anytime.';
  } else {
   if(parts.length===0)response=`CON Wirefen Farmer: Muli bwanji ${existing.name.split(' ')[0]}!\n1. Check Crop Prices\n2. Record Form 1 Farm Costs\n3. My Farm Profile\n0. Exit`;
   else if(parts[0]==='1')response='END Wirefen Market Prices:\nMaize: MWK 850 / ZMW 14/kg\nTomatoes: MWK 1,500 / ZMW 25/kg\nSoya Beans: MWK 1,200 / ZMW 20/kg\nPotatoes: MWK 1,100 / ZMW 18/kg';
   else if(parts[0]==='2'){
    if(parts.length===1)response='CON Form 1 Financial Breakdown (1/4):\nExpected spend for Fertilizer & Seeds? (Reply 0 to skip):';
    else if(parts.length===2)response='CON Step 2/4: Expected spend for Labor? (Reply 0 to skip):';
    else if(parts.length===3)response='CON Step 3/4: Expected spend for Processing? (Reply 0 to skip):';
    else if(parts.length===4)response='CON Step 4/4: Expected spend for Transportation? (Reply 0 to skip):';
    else if(parts.length>=5){
     const total=(Number(parts[1])||0)+(Number(parts[2])||0)+(Number(parts[3])||0)+(Number(parts[4])||0);
     response=`END Costs saved!\nTotal Estimated Cost: ${currency} ${total}.\nThank you!`;
    }
   }
   else if(parts[0]==='3')response=`END Farm: ${existing.farmer?.farm_name||'Family Farm'}\nLocation: ${existing.farmer?.location||'Malawi'}\nStatus: ${existing.farmer?.verification_status||'Verified'}`;
   else if(parts[0]==='0')response='END Thank you for using Wirefen. Dial *211# anytime.';
  }
  return finish({sessionId:String(body.sessionId||'demo-session'),phoneNumber,response,isEnd:response.startsWith('END'),menuText:response.replace(/^(CON|END)\s+/,'')});
 }
 throw new Error('This action is not available in the presentation.');
}
