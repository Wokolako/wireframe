import {z} from 'zod';
import {costFields,mergeCosts} from '../shared/finance.mjs';
import {hasGeography} from '../shared/geography.mjs';
const growing=z.object({crop_type:z.string().trim().min(2).max(80),avg_land_size:z.number().positive().max(1e7),avg_yield_per_acre:z.number().positive().max(1e9),avg_duration_days:z.number().int().positive().max(3650)});
const schema=growing.partial().extend(Object.fromEntries(costFields.map(k=>[k,z.number().nonnegative().max(1e12).nullable().optional()]))).extend({status:z.enum(['draft','complete']).optional(),avg_production_cost:z.number().optional()}).strict();
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function readBaseline(db,id){
 const baseline=await db.get('SELECT * FROM historical_baselines WHERE farmer_id=?',[id])||{};
 const financial=await db.get('SELECT * FROM financial_estimates WHERE farmer_id=?',[id]);
 const result={...baseline,status:financial?.status||'draft'};
 if(financial){for(const key of [...costFields,'avg_production_cost','legacy_total'])result[key]=financial[key]==null?null:Number(financial[key]);result.currency=financial.currency;result.country_code=financial.country_code;result.region=financial.region;result.locality=financial.locality;}
 return result;
}
export async function saveBaseline(db,id,input){
 const incoming=schema.parse(input);
 return db.transaction(async tx=>{
  // Serializes changes to one farmer in PostgreSQL; SQLite uses a queued immediate transaction.
  const farm=await tx.get('SELECT * FROM farmer_profiles WHERE id=?'+(process.env.DATABASE_URL?' FOR UPDATE':''),[id]);
  if(!farm||!hasGeography(farm))throw fail(409,'Complete your Country, District / Region and Locality / Ward in Settings before submitting.');
  const old=await tx.get('SELECT * FROM historical_baselines WHERE farmer_id=?',[id])||{};
  const previous=await tx.get('SELECT * FROM financial_estimates WHERE farmer_id=?',[id])||{};
  for(const key of costFields)if(previous[key]!=null)previous[key]=Number(previous[key]);
  const status=incoming.status||'draft';
  let costs;try{costs=mergeCosts(previous,incoming,status==='complete');}catch(e){throw fail(400,e.message);}
  const v={...old,...incoming};if(status==='complete')growing.parse(v);
  const stamp=new Date().toISOString();
  await tx.run('INSERT INTO historical_baselines (farmer_id,crop_type,avg_land_size,avg_yield_per_acre,avg_duration_days,status,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(farmer_id) DO UPDATE SET crop_type=excluded.crop_type,avg_land_size=excluded.avg_land_size,avg_yield_per_acre=excluded.avg_yield_per_acre,avg_duration_days=excluded.avg_duration_days,status=excluded.status,updated_at=excluded.updated_at',[id,v.crop_type??null,v.avg_land_size??null,v.avg_yield_per_acre??null,v.avg_duration_days??null,status,stamp]);
  const fields=[...costFields,'avg_production_cost','country_code','region','locality','region_key','location_key','currency','status','updated_at'];
  const financial={...costs,...farm,currency:previous.currency||process.env.CURRENCY||'ZAR',status,updated_at:stamp};
  await tx.run(`INSERT INTO financial_estimates (farmer_id,${fields.join(',')}) VALUES (${Array(fields.length+1).fill('?')}) ON CONFLICT(farmer_id) DO UPDATE SET ${fields.map(k=>`${k}=excluded.${k}`).join(',')}`,[id,...fields.map(k=>financial[k])]);
  return {...v,...costs,currency:financial.currency,status,updated_at:stamp};
 });
}

export function financialRoutes(app,db,permit){
 app.get('/api/v1/admin/financial-analytics',permit('Admin'),async(req,res)=>{
  if(!await db.get("SELECT user_id FROM user_permissions WHERE user_id=? AND permission='financial_analytics'",[req.user.id]))throw fail(403,'Financial analytics permission is required.');
  const rows=await db.all(`SELECT country_code,MIN(region) AS region,region_key,currency,COUNT(*) AS farmer_count,${[...costFields,'avg_production_cost'].map(k=>`AVG(${k}) AS ${k}`).join(',')} FROM financial_estimates WHERE status='complete' AND location_key<>'' GROUP BY country_code,region_key,currency HAVING COUNT(*)>=5 ORDER BY country_code,region_key,currency`);
  res.json({minimum_group_size:5,regions:rows.map(r=>({...r,farmer_count:Number(r.farmer_count),...Object.fromEntries([...costFields,'avg_production_cost'].map(k=>[k,Math.round(Number(r[k])*100)/100]))}))});
 });
}
