import {z} from 'zod';
import {audit} from './audit.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function verificationRoutes(app,db,permit){
 app.get('/api/v1/admin/agents',permit('Admin'),async(req,res)=>res.json(await db.all("SELECT id,name FROM users WHERE role='Agent' ORDER BY name")));
 app.get('/api/v1/admin/verifications',permit('Admin'),async(req,res)=>res.json(await db.all("SELECT l.id AS listing_id,l.title,f.farm_name,v.agent_id,v.status,v.score FROM listings l JOIN farmer_profiles f ON f.id=l.farmer_id LEFT JOIN listing_verifications v ON v.listing_id=l.id WHERE l.status='published' ORDER BY l.created_at DESC")));
 app.post('/api/v1/admin/verifications',permit('Admin'),async(req,res)=>{
  const v=z.object({listing_id:z.string(),agent_id:z.string()}).strict().parse(req.body);
  if(!await db.get("SELECT id FROM users WHERE id=? AND role='Agent'",[v.agent_id]))throw fail(400,'Choose an agent account.');
  if(!await db.get('SELECT id FROM listings WHERE id=?',[v.listing_id]))throw fail(404,'Listing not found.');
  await db.transaction(async tx=>{
   const previous=await tx.get('SELECT status,agent_id FROM listing_verifications WHERE listing_id=?',[v.listing_id]);
   await tx.run("INSERT INTO listing_verifications (listing_id,agent_id,updated_at) VALUES (?,?,?) ON CONFLICT(listing_id) DO UPDATE SET agent_id=excluded.agent_id,status='pending',score=NULL,crop_confirmed=0,volume_confirmed=0,location_confirmed=0,harvest_confirmed=0,notes='',updated_at=excluded.updated_at",[v.listing_id,v.agent_id,new Date().toISOString()]);
   await audit(tx,{actor:req.user.id,action:'verification.assigned',entity:'listing',id:v.listing_id,details:{agent_id:v.agent_id,previous_status:previous?.status||null,previous_agent_id:previous?.agent_id||null}});
  });
  res.json({ok:true});
 });
 app.get('/api/v1/agent/verifications',permit('Agent'),async(req,res)=>{
  res.json(await db.all('SELECT v.*,l.title,l.crop_category,l.available_volume,l.harvest_date,f.farm_name,f.country,f.country_code,f.region,f.locality,f.location FROM listing_verifications v JOIN listings l ON l.id=v.listing_id JOIN farmer_profiles f ON f.id=l.farmer_id WHERE v.agent_id=? ORDER BY v.updated_at DESC',[req.user.id]));
 });
 app.patch('/api/v1/agent/verifications/:id',permit('Agent'),async(req,res)=>{
  const v=z.object({crop_confirmed:z.boolean(),volume_confirmed:z.boolean(),location_confirmed:z.boolean(),harvest_confirmed:z.boolean(),notes:z.string().trim().max(1000).default('')}).strict().parse(req.body);
  const score=[v.crop_confirmed,v.volume_confirmed,v.location_confirmed,v.harvest_confirmed].filter(Boolean).length*25;
  await db.transaction(async tx=>{
   const result=await tx.run('UPDATE listing_verifications SET crop_confirmed=?,volume_confirmed=?,location_confirmed=?,harvest_confirmed=?,notes=?,score=?,status=?,updated_at=? WHERE listing_id=? AND agent_id=?',[+v.crop_confirmed,+v.volume_confirmed,+v.location_confirmed,+v.harvest_confirmed,v.notes,score,score===100?'verified':'needs_review',new Date().toISOString(),req.params.id,req.user.id]);
   if(!(result.rowCount??result.changes))throw fail(404,'Assigned verification not found.');
   await audit(tx,{actor:req.user.id,action:'verification.recorded',entity:'listing',id:req.params.id,details:{score,status:score===100?'verified':'needs_review',crop_confirmed:v.crop_confirmed,volume_confirmed:v.volume_confirmed,location_confirmed:v.location_confirmed,harvest_confirmed:v.harvest_confirmed}});
  });
  res.json({score,status:score===100?'verified':'needs_review'});
 });
}
