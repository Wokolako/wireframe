import type {Farmer,Listing,Order,Payment,User} from './api';
import {adminEmail,clerkPublishableKey} from './auth-config';
// Presentation-only persistence. No credentials, API requests or real transactions.
const key='wirefen-presentation-v1';
type Identity={id:string;name:string;email:string;verifiedEmails:string[]};
let identity:Identity|null=null;
export function setDemoIdentity(value:Identity|null){identity=value;}
const isAdmin=()=>!!identity?.verifiedEmails.some(email=>email.toLowerCase()===adminEmail);
type State={users:User[];farmers:Farmer[];listings:Listing[];orders:(Order&{buyer_id:string})[];payments?:Payment[];baselines:Record<string,Record<string,unknown>>;drafts:Record<string,Record<string,unknown>>;session:string|null;pwa:Record<string,string>};
const now=()=>new Date().toISOString();
const day=(n=0)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
function seed():State{
 const farms=[
  ['Thandi Mokoena','Mokoena Family Farm','South Africa','Capricorn District','Polokwane Ward 12',24],
  ['Pieter van der Merwe','Valley View Growers','South Africa','Cape Winelands','Stellenbosch Ward 8',120],
  ['Nomsa Dlamini','Green Roots Cooperative','South Africa','uMgungundlovu','Msunduzi Ward 22',42]
 ] as const;
 const farmers:Farmer[]=farms.map(([name,farm_name,country,region,locality,farm_size],i)=>{
  const location=`${locality}, ${region}, ${country}`;
  return {id:`farm-${i+1}`,user_id:`farmer-${i+1}`,name,farm_name,country,region,district:region,locality,ward:locality,location,farm_size,phone:`+2782000000${i+1}`,verification_status:i===2?'Pending':'Verified'};
 });
 const users:User[]=[...farmers.map(f=>({id:f.user_id,name:f.name!,phone:f.phone!,role:'Farmer' as const,sms_opt_in:false,farmer:f})),{id:'buyer-1',name:'Alex Morgan',phone:'+27820000004',role:'Buyer',sms_opt_in:false,farmer:null},{id:'agent-1',name:'Kuda Moyo (Field Agent)',phone:'+27820000006',role:'Agent',sms_opt_in:false,farmer:null},{id:'admin-1',name:'Wirefen Operations',phone:'+27820000005',role:'Admin',sms_opt_in:false,farmer:null}];
 const products:[string,string,number,number,number,string,number,string,string,number][]=[
 ['Roma tomatoes','Vegetables',2500,12.5,0,'tomatoes',10,'Firm, sun-ripened Roma tomatoes, sorted and packed in reusable crates.','WF-ZA-LP-2026-TOM01',4.9],
 ['Golden yellow maize','Grains',18000,4.8,1,'maize',180,'Dry yellow maize, cleaned and ready for bulk collection.','WF-ZA-WC-2026-MAZ02',4.7],
 ['Fresh Hass avocados','Fruits',1800,28,0,'avocados',12,'Creamy Hass avocados, harvested mature green for reliable ripening.','WF-ZA-LP-2026-AVO03',4.8],
 ['Golden potatoes','Tubers',4200,9.5,2,'potatoes',30,'Freshly lifted golden potatoes, field sorted and ready for packing.','WF-ZA-KZ-2026-POT04',4.6],
 ['Green cabbage','Vegetables',3600,6.8,2,'cabbage',14,'Crisp green cabbages with tightly packed leaves, supplied in bulk crates.','WF-ZA-KZ-2026-CAB05',4.5],
 ['Red kidney beans','Legumes',6000,24,1,'beans',180,'Dried red kidney beans, sorted for wholesalers and processors.','WF-ZA-WC-2026-BN06',4.9]];
 const listings:Listing[]=products.map(([title,crop_category,available_volume,price,f,image,shelf_life_days,description,traceability,agent_score],i)=>({id:`produce-${i+1}`,farmer_id:farmers[f].id,title,crop_category,available_volume,price,harvest_date:day(-1),expiration_date:day(shelf_life_days),shelf_life_days,preservative_used:0,description,image:`/images/${image}.jpg`,farm_name:farmers[f].farm_name,location:farmers[f].location,verification_status:farmers[f].verification_status,traceability,agent_score}));
  return {users,farmers,listings,session:null,drafts:{},baselines:{'farm-1':{crop_type:'Tomatoes',avg_land_size:24,avg_yield_per_acre:2800,avg_duration_days:90,cost_fertilizer_seeds:12000,cost_labor:18000,cost_processing:6000,cost_transportation:5000,avg_production_cost:41000,status:'complete'},'farm-2':{crop_type:'Maize',avg_land_size:80,avg_yield_per_acre:3200,avg_duration_days:120,cost_fertilizer_seeds:32000,cost_labor:40000,cost_processing:14000,cost_transportation:10000,avg_production_cost:96000,status:'complete'},'farm-3':{crop_type:'Potatoes',avg_land_size:42,avg_yield_per_acre:4000,avg_duration_days:110,cost_fertilizer_seeds:20000,cost_labor:25000,cost_processing:9000,cost_transportation:7000,avg_production_cost:61000,status:'draft'}},orders:[{id:'sample-order-1',listing_id:'produce-1',title:'Roma tomatoes',volume:250,delivery_location:'Pretoria fresh market',notes:'Sample request: Friday morning collection.',status:'In review',created_at:now(),buyer_id:'buyer-1',buyer_name:'Alex Morgan',phone:'+27820000004'},{id:'sample-order-2',listing_id:'produce-2',title:'Golden yellow maize',volume:5000,delivery_location:'Cape Town distribution centre',notes:'Sample request: bulk packaging preferred.',status:'New',created_at:now(),buyer_id:'buyer-1',buyer_name:'Alex Morgan',phone:'+27820000004'}],payments:[],pwa:{}};
}
let memory:State|undefined;
function load():State{try{const saved=localStorage.getItem(key);if(saved)return JSON.parse(saved);}catch{}return memory??=seed();}
export async function demoApi(path:string,options:RequestInit={}):Promise<unknown>{
 const data=load(),url=new URL(path,'https://presentation.invalid'),route=url.pathname,q=url.searchParams,method=options.method||'GET';
 const body:Record<string,unknown>=options.body?JSON.parse(String(options.body)):{};
 let user=identity?data.users.find(u=>u.id===identity!.id)||null:null;
 // Demo roles derive from the signed-in identity, never the old sample-role switch.
 if(identity&&isAdmin()){
  if(!user){user={id:identity.id,name:identity.name||'George Chivalo',email:identity.email,phone:'Not provided',role:'Admin',sms_opt_in:false,farmer:null};data.users.push(user);}
  user.role='Admin';user.farmer=null;
 }else if(user?.role==='Admin'){user.role='Buyer';user.farmer=null;}
 const finish=(value:unknown)=>{memory=data;try{localStorage.setItem(key,JSON.stringify(data));}catch{}return structuredClone(value);};
 const account=(roles:string[])=>{if(!user||!roles.includes(user.role))throw new Error('Sign in with an authorized account to continue.');return user;};
 if(route==='/config')return {demo:true,presentation:true,market:'South Africa (sample market)',currency:'ZAR',sms_ready:false,auth_provider:'clerk',clerk_publishable_key:clerkPublishableKey};
 if(route==='/auth/me')return finish(user);
 if(route==='/auth/onboard'){
  if(!identity)throw new Error('Sign in with Clerk to create your profile.');if(user)return finish(user);
  if(!['Buyer','Farmer','Agent'].includes(String(body.role)))throw new Error('Choose Buyer, Farmer, or Agent.');
  const name=String(body.name||'').trim(),phone=String(body.phone||'').trim(),role=body.role as 'Buyer'|'Farmer'|'Agent';
  if(name.length<2||!/^\+[1-9]\d{7,14}$/.test(phone))throw new Error('Enter your name and a phone number with its country code.');
  if(data.users.some(u=>u.phone===phone))throw new Error('This phone number is already used by another profile on this device.');
  let farmer:Farmer|null=null;
  if(role==='Farmer'){
   const farm_name=String(body.farm_name||'').trim();
   const country=String(body.country||'South Africa').trim();
   const region=String(body.region||body.district||body.location||'').trim();
   const locality=String(body.locality||body.ward||body.location||'').trim();
   const location=String(body.location||[locality,region,country].filter(Boolean).join(', ')).trim();
   if(!farm_name||(!location&&(!country||!region||!locality)))throw new Error('Enter your farm name and location.');
   farmer={id:'farm-'+identity.id,user_id:identity.id,name,phone,farm_name,country,region,district:region,locality,ward:locality,location,farm_size:0,verification_status:'Unverified'};
   data.farmers.push(farmer);
  }
  user={id:identity.id,name,email:identity.email,phone,role,sms_opt_in:!!body.sms_opt_in,farmer};data.users.push(user);return finish(user);
 }
 if(route==='/auth/demo')throw new Error('Sample account switching is disabled. Sign in with your Clerk account.');
 if(route==='/auth/logout'){data.session=null;return finish({ok:true});}
 if(route.startsWith('/auth/'))throw new Error('Use Clerk to sign in or create your account.');
 if(route==='/exchange-rates')return {base:'EUR',rates:{EUR:1,USD:1.1,ZAR:20,MWK:1885.5,ZMW:29.5},dates:{EUR:day(),USD:day(),ZAR:day(),MWK:day(),ZMW:day()},fetched_at:now(),source:'Illustrative presentation rates (including MWK & ZMW)',stale:false,demo:true};
 if(route==='/pwa/session'||route==='/pwa/events'){if(method==='POST'&&['prompted','dismissed','installed'].includes(String(body.event)))data.pwa[String(body.event)+'_at']??=now();return finish({...data.pwa,suppress_prompt:!!(data.pwa.prompted_at||data.pwa.dismissed_at||data.pwa.installed_at),device_installed:!!data.pwa.installed_at});}
 if(route==='/account/consent'){account(['Farmer','Buyer','Admin','Agent']).sms_opt_in=!!body.sms_opt_in;return finish({ok:true});}
 if(route==='/farmers'){account(['Admin']);return finish(data.farmers.map(f=>({...f,baseline_status:data.baselines[f.id]?.status})));}
 if(route==='/verifications'){account(['Agent','Admin']);return finish(data.farmers.map(f=>({id:f.id,farm_name:f.farm_name,country:f.country||'South Africa',region:f.region||f.district||'',district:f.district||f.region||'',locality:f.locality||f.ward||'',ward:f.ward||f.locality||'',location:f.location,farm_size:f.farm_size,verification_status:f.verification_status,farmer_name:f.name,contact_phone:f.phone})));}
 const verifRoute=route.match(/^\/verifications\/([^/]+)$/);
 if(verifRoute&&method==='PATCH'){account(['Agent','Admin']);const [,id]=verifRoute,farm=data.farmers.find(f=>f.id===id);if(!farm)throw new Error('Farm not found.');farm.verification_status=String(body.verification_status) as 'Verified'|'Pending'|'Unverified';return finish({ok:true,id,verification_status:farm.verification_status});}
 if(route==='/analytics/financial'){
  account(['Admin']);
  const regMap=new Map<string,{country:string;region:string;count:number;fert:number;labor:number;proc:number;trans:number;total:number;land:number;yield:number}>();
  const cropMap=new Map<string,{crop_type:string;count:number;cost:number;yield:number}>();
  let totalSubs=0,sumCost=0;
  for(const farm of data.farmers){
   const b=data.baselines[farm.id];
   if(b&&b.avg_production_cost!=null){
    totalSubs++;
    const cost=Number(b.avg_production_cost)||0;
    sumCost+=cost;
    const regKey=`${farm.country||'South Africa'}__${farm.region||farm.district||'Unspecified'}`;
    const curr=regMap.get(regKey)||{country:farm.country||'South Africa',region:farm.region||farm.district||'Unspecified',count:0,fert:0,labor:0,proc:0,trans:0,total:0,land:0,yield:0};
    curr.count++;
    curr.fert+=Number(b.cost_fertilizer_seeds)||0;
    curr.labor+=Number(b.cost_labor)||0;
    curr.proc+=Number(b.cost_processing)||0;
    curr.trans+=Number(b.cost_transportation)||0;
    curr.total+=cost;
    curr.land+=Number(b.avg_land_size)||0;
    curr.yield+=Number(b.avg_yield_per_acre)||0;
    regMap.set(regKey,curr);
    const cType=String(b.crop_type||'Other');
    const cCurr=cropMap.get(cType)||{crop_type:cType,count:0,cost:0,yield:0};
    cCurr.count++;
    cCurr.cost+=cost;
    cCurr.yield+=Number(b.avg_yield_per_acre)||0;
    cropMap.set(cType,cCurr);
   }
  }
  const regional=[...regMap.values()].map(r=>({country:r.country,region:r.region,total_baselines:r.count,avg_fertilizer_seeds:Math.round(r.fert/r.count*100)/100,avg_labor:Math.round(r.labor/r.count*100)/100,avg_processing:Math.round(r.proc/r.count*100)/100,avg_transportation:Math.round(r.trans/r.count*100)/100,avg_total_production_cost:Math.round(r.total/r.count*100)/100,avg_land_size:Math.round(r.land/r.count*100)/100,avg_yield_per_acre:Math.round(r.yield/r.count*100)/100}));
  const by_crop=[...cropMap.values()].map(c=>({crop_type:c.crop_type,total_baselines:c.count,avg_production_cost:Math.round(c.cost/c.count*100)/100,avg_yield_per_acre:Math.round(c.yield/c.count*100)/100}));
  return finish({regional,by_crop,summary:{total_submissions:totalSubs,overall_avg_cost:totalSubs?Math.round(sumCost/totalSubs*100)/100:0,overall_total_cost:sumCost}});
 }
 const farmRoute=route.match(/^\/farmers\/([^/]+)\/(baseline|listing-draft)$/);
 if(farmRoute){
  const u=account(['Farmer','Admin']),[,id,kind]=farmRoute,farm=data.farmers.find(f=>f.id===id);
  if(!farm||u.role!=='Admin'&&farm.user_id!==u.id)throw new Error('Choose a farm you are authorized to manage.');
  const table=kind==='baseline'?data.baselines:data.drafts;
  if(method!=='GET'){
   const updateData={...body};
   if(kind==='baseline'){
    const hasBreakdown=['cost_fertilizer_seeds','cost_labor','cost_processing','cost_transportation'].some(k=>updateData[k]!==undefined&&updateData[k]!==null);
    if(hasBreakdown){
     updateData.avg_production_cost=(Number(updateData.cost_fertilizer_seeds)||0)+(Number(updateData.cost_labor)||0)+(Number(updateData.cost_processing)||0)+(Number(updateData.cost_transportation)||0);
    }
   }
   table[id]={...table[id],...updateData,updated_at:now()};
  }
  return finish(table[id]||(kind==='baseline'?{status:'draft'}:{}));
 }
 if(route==='/listings'&&method==='GET')return finish(data.listings.filter(l=>(!q.has('mine')||l.farmer_id===user?.farmer?.id)&&(!q.get('category')||l.crop_category===q.get('category'))&&(!q.get('search')||`${l.title} ${l.farm_name} ${l.location}`.toLowerCase().includes(q.get('search')!.toLowerCase()))&&(!q.get('min_volume')||l.available_volume>=Number(q.get('min_volume')))&&(!q.get('max_volume')||l.available_volume<=Number(q.get('max_volume')))&&(!q.get('harvest_date_after')||l.harvest_date>q.get('harvest_date_after')!)&&(!q.has('preservative')||!!l.preservative_used===(q.get('preservative')==='true'))));
 if(route==='/listings'&&method==='POST'){
  const u=account(['Farmer','Admin']),farm=data.farmers.find(f=>f.id===body.farmer_id);if(!farm||u.role!=='Admin'&&farm.user_id!==u.id)throw new Error('Choose a farm you are authorized to manage.');
  const id=crypto.randomUUID(),crop_category=String(body.crop_category),image=({Vegetables:'tomatoes',Fruits:'avocados',Grains:'maize',Tubers:'potatoes',Legumes:'beans'} as Record<string,string>)[crop_category]||'tomatoes';
  data.listings.unshift({id,farmer_id:farm.id,title:String(body.title),crop_category,available_volume:Number(body.available_volume),price:Number(body.price),harvest_date:String(body.harvest_date),expiration_date:String(body.expiration_date),shelf_life_days:Number(body.shelf_life_days),preservative_used:body.preservative_used?1:0,description:String(body.description||''),image:`/images/${image}.jpg`,farm_name:farm.farm_name,location:farm.location,verification_status:farm.verification_status,traceability:String(body.traceability||'WF-'+crop_category.slice(0,3).toUpperCase()+'-'+Date.now().toString().slice(-4)),agent_score:Number(body.agent_score)||4.8});delete data.drafts[farm.id];return finish({id});
 }
 if(route.startsWith('/listings/')){const item=data.listings.find(l=>l.id===route.split('/')[2]);if(!item)throw new Error('Sample listing not found.');return finish(item);}
 if(route==='/orders'){
  const u=account(method==='GET'?['Buyer','Admin']:['Buyer']);if(method==='GET')return finish(data.orders.filter(o=>u.role==='Admin'||o.buyer_id===u.id));
  const item=data.listings.find(l=>l.id===body.listing_id);if(!item||Number(body.volume)<=0||Number(body.volume)>item.available_volume)throw new Error('Enter a quantity within the available supply.');const id=crypto.randomUUID();
  data.orders.unshift({id,listing_id:item.id,title:item.title,volume:Number(body.volume),delivery_location:String(body.delivery_location),notes:String(body.notes||''),status:'New',created_at:now(),buyer_id:u.id,buyer_name:u.name,phone:u.phone});return finish({id,status:'New'});
 }
 if(route.startsWith('/orders/')&&method==='PATCH'){account(['Admin']);const order=data.orders.find(o=>o.id===route.split('/')[2]);if(!order)throw new Error('Sample request not found.');order.status=String(body.status);return finish({ok:true});}
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
