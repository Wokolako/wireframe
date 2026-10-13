import type {Farmer,Listing,Order,User} from './api';
// Presentation-only persistence. No credentials, API requests or real transactions.
const key='wirefen-presentation-v1';
type State={users:User[];farmers:Farmer[];listings:Listing[];orders:(Order&{buyer_id:string})[];baselines:Record<string,Record<string,unknown>>;drafts:Record<string,Record<string,unknown>>;session:string|null;pwa:Record<string,string>};
const now=()=>new Date().toISOString();
const day=(n=0)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
function seed():State{
 const farms=[['Thandi Mokoena','Mokoena Family Farm','Limpopo',24],['Pieter van der Merwe','Valley View Growers','Western Cape',120],['Nomsa Dlamini','Green Roots Cooperative','KwaZulu-Natal',42]] as const;
 const farmers:Farmer[]=farms.map(([name,farm_name,location,farm_size],i)=>({id:`farm-${i+1}`,user_id:`farmer-${i+1}`,name,farm_name,location,farm_size,phone:`+2782000000${i+1}`,verification_status:i===2?'Pending':'Verified'}));
 const users:User[]=[...farmers.map(f=>({id:f.user_id,name:f.name!,phone:f.phone!,role:'Farmer' as const,sms_opt_in:false,farmer:f})),{id:'buyer-1',name:'Alex Morgan',phone:'+27820000004',role:'Buyer',sms_opt_in:false,farmer:null},{id:'admin-1',name:'Wirefen Operations',phone:'+27820000005',role:'Admin',sms_opt_in:false,farmer:null}];
 const products:[string,string,number,number,number,string,number,string][]=[
 ['Roma tomatoes','Vegetables',2500,12.5,0,'tomatoes',10,'Firm, sun-ripened Roma tomatoes, sorted and packed in reusable crates.'],
 ['Golden yellow maize','Grains',18000,4.8,1,'maize',180,'Dry yellow maize, cleaned and ready for bulk collection.'],
 ['Fresh Hass avocados','Fruits',1800,28,0,'avocados',12,'Creamy Hass avocados, harvested mature green for reliable ripening.'],
 ['Golden potatoes','Tubers',4200,9.5,2,'potatoes',30,'Freshly lifted golden potatoes, field sorted and ready for packing.'],
 ['Green cabbage','Vegetables',3600,6.8,2,'cabbage',14,'Crisp green cabbages with tightly packed leaves, supplied in bulk crates.'],
 ['Red kidney beans','Legumes',6000,24,1,'beans',180,'Dried red kidney beans, sorted for wholesalers and processors.']];
 const listings:Listing[]=products.map(([title,crop_category,available_volume,price,f,image,shelf_life_days,description],i)=>({id:`produce-${i+1}`,farmer_id:farmers[f].id,title,crop_category,available_volume,price,harvest_date:day(-1),expiration_date:day(shelf_life_days),shelf_life_days,preservative_used:0,description,image:`/images/${image}.jpg`,farm_name:farmers[f].farm_name,location:farmers[f].location,verification_status:farmers[f].verification_status}));
 return {users,farmers,listings,session:null,drafts:{},baselines:{'farm-2':{crop_type:'Maize',avg_land_size:80,avg_yield_per_acre:3200,avg_duration_days:120,avg_production_cost:96000,status:'complete'}},orders:[{id:'sample-order-1',listing_id:'produce-1',title:'Roma tomatoes',volume:250,delivery_location:'Pretoria fresh market',notes:'Sample request: Friday morning collection.',status:'In review',created_at:now(),buyer_id:'buyer-1',buyer_name:'Alex Morgan',phone:'+27820000004'},{id:'sample-order-2',listing_id:'produce-2',title:'Golden yellow maize',volume:5000,delivery_location:'Cape Town distribution centre',notes:'Sample request: bulk packaging preferred.',status:'New',created_at:now(),buyer_id:'buyer-1',buyer_name:'Alex Morgan',phone:'+27820000004'}],pwa:{}};
}
let memory:State|undefined;
function load():State{try{const saved=localStorage.getItem(key);if(saved)return JSON.parse(saved);}catch{}return memory??=seed();}
export async function demoApi(path:string,options:RequestInit={}):Promise<unknown>{
 const data=load(),url=new URL(path,'https://presentation.invalid'),route=url.pathname,q=url.searchParams,method=options.method||'GET';
 const body:Record<string,unknown>=options.body?JSON.parse(String(options.body)):{};
 const user=data.users.find(u=>u.id===data.session)||null;
 const finish=(value:unknown)=>{memory=data;try{localStorage.setItem(key,JSON.stringify(data));}catch{}return structuredClone(value);};
 const account=(roles:string[])=>{if(!user||!roles.includes(user.role))throw new Error('Choose the appropriate sample account to continue.');return user;};
 if(route==='/config')return {demo:true,presentation:true,market:'South Africa (sample market)',currency:'ZAR',sms_ready:false,auth_provider:'local'};
 if(route==='/auth/me')return finish(user);
 if(route==='/auth/demo'){data.session=data.users.find(u=>u.role===body.role)?.id||null;return finish(data.users.find(u=>u.id===data.session)||null);}
 if(route==='/auth/logout'){data.session=null;return finish({ok:true});}
 if(route.startsWith('/auth/'))throw new Error('Choose Buyer, Farmer or Admin to explore the presentation.');
 if(route==='/exchange-rates')return {base:'EUR',rates:{EUR:1,USD:1.1,ZAR:20},dates:{EUR:day(),USD:day(),ZAR:day()},fetched_at:now(),source:'Illustrative presentation rates',stale:false,demo:true};
 if(route==='/pwa/session'||route==='/pwa/events'){if(method==='POST'&&['prompted','dismissed','installed'].includes(String(body.event)))data.pwa[String(body.event)+'_at']??=now();return finish({...data.pwa,suppress_prompt:!!(data.pwa.prompted_at||data.pwa.dismissed_at||data.pwa.installed_at),device_installed:!!data.pwa.installed_at});}
 if(route==='/account/consent'){account(['Farmer','Buyer','Admin']).sms_opt_in=!!body.sms_opt_in;return finish({ok:true});}
 if(route==='/farmers'){account(['Admin']);return finish(data.farmers.map(f=>({...f,baseline_status:data.baselines[f.id]?.status})));}
 const farmRoute=route.match(/^\/farmers\/([^/]+)\/(baseline|listing-draft)$/);
 if(farmRoute){const u=account(['Farmer','Admin']),[,id,kind]=farmRoute,farm=data.farmers.find(f=>f.id===id);if(!farm||u.role!=='Admin'&&farm.user_id!==u.id)throw new Error('Choose your sample farm.');const table=kind==='baseline'?data.baselines:data.drafts;if(method!=='GET')table[id]={...table[id],...body,updated_at:now()};return finish(table[id]||(kind==='baseline'?{status:'draft'}:{}));}
 if(route==='/listings'&&method==='GET')return finish(data.listings.filter(l=>(!q.has('mine')||l.farmer_id===user?.farmer?.id)&&(!q.get('category')||l.crop_category===q.get('category'))&&(!q.get('search')||`${l.title} ${l.farm_name} ${l.location}`.toLowerCase().includes(q.get('search')!.toLowerCase()))&&(!q.get('min_volume')||l.available_volume>=Number(q.get('min_volume')))&&(!q.get('max_volume')||l.available_volume<=Number(q.get('max_volume')))&&(!q.get('harvest_date_after')||l.harvest_date>q.get('harvest_date_after')!)&&(!q.has('preservative')||!!l.preservative_used===(q.get('preservative')==='true'))));
 if(route==='/listings'&&method==='POST'){
  const u=account(['Farmer','Admin']),farm=data.farmers.find(f=>f.id===body.farmer_id);if(!farm||u.role!=='Admin'&&farm.user_id!==u.id)throw new Error('Choose your sample farm.');
  const id=crypto.randomUUID(),crop_category=String(body.crop_category),image=({Vegetables:'tomatoes',Fruits:'avocados',Grains:'maize',Tubers:'potatoes',Legumes:'beans'} as Record<string,string>)[crop_category]||'tomatoes';
  data.listings.unshift({id,farmer_id:farm.id,title:String(body.title),crop_category,available_volume:Number(body.available_volume),price:Number(body.price),harvest_date:String(body.harvest_date),expiration_date:String(body.expiration_date),shelf_life_days:Number(body.shelf_life_days),preservative_used:body.preservative_used?1:0,description:String(body.description||''),image:`/images/${image}.jpg`,farm_name:farm.farm_name,location:farm.location,verification_status:farm.verification_status});delete data.drafts[farm.id];return finish({id});
 }
 if(route.startsWith('/listings/')){const item=data.listings.find(l=>l.id===route.split('/')[2]);if(!item)throw new Error('Sample listing not found.');return finish(item);}
 if(route==='/orders'){
  const u=account(method==='GET'?['Buyer','Admin']:['Buyer']);if(method==='GET')return finish(data.orders.filter(o=>u.role==='Admin'||o.buyer_id===u.id));
  const item=data.listings.find(l=>l.id===body.listing_id);if(!item||Number(body.volume)<=0||Number(body.volume)>item.available_volume)throw new Error('Enter a quantity within the available supply.');const id=crypto.randomUUID();
  data.orders.unshift({id,listing_id:item.id,title:item.title,volume:Number(body.volume),delivery_location:String(body.delivery_location),notes:String(body.notes||''),status:'New',created_at:now(),buyer_id:u.id,buyer_name:u.name,phone:u.phone});return finish({id,status:'New'});
 }
 if(route.startsWith('/orders/')&&method==='PATCH'){account(['Admin']);const order=data.orders.find(o=>o.id===route.split('/')[2]);if(!order)throw new Error('Sample request not found.');order.status=String(body.status);return finish({ok:true});}
 throw new Error('This action is not available in the presentation.');
}
