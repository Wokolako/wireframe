import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {hashPassword} from './seed.mjs';
export const profileSchema=z.object({
 name:z.string().trim().min(2).max(100),phone:z.string().regex(/^\+[1-9]\d{7,14}$/,'Use an international number, such as +27821234567.'),
 role:z.enum(['Buyer','Farmer']),sms_opt_in:z.boolean(),farm_name:z.string().trim().max(100).default(''),location:z.string().trim().max(100).default('')
}).superRefine((v,ctx)=>{if(v.role==='Farmer')for(const key of ['farm_name','location'])if(v[key].length<2)ctx.addIssue({code:'custom',path:[key],message:'Please complete this field.'});});
// The identity must come from verified Clerk middleware, never from the request body.
export async function createClerkProfile(db,clerkUserId,input){
 if(!clerkUserId)throw Object.assign(new Error('Sign in to continue.'),{status:401});
 const v=profileSchema.parse(input),id=randomUUID(),stamp=new Date().toISOString();
 return db.transaction(async tx=>{
  const existing=await tx.get('SELECT user_id FROM clerk_identities WHERE clerk_user_id=?',[clerkUserId]);
  if(existing)return existing.user_id;
  if(await tx.get('SELECT id FROM users WHERE phone=?',[v.phone]))throw Object.assign(new Error('This phone number is already registered. Contact Wirefen support to recover or link an existing account.'),{status:409});
  await tx.run('INSERT INTO users (id,name,phone,password_hash,role,sms_opt_in,sms_opt_in_at,created_at) VALUES (?,?,?,?,?,?,?,?)',[id,v.name,v.phone,hashPassword(randomUUID()),v.role,+v.sms_opt_in,v.sms_opt_in?stamp:null,stamp]);
  if(v.role==='Farmer')await tx.run('INSERT INTO farmer_profiles (id,user_id,farm_name,location) VALUES (?,?,?,?)',[randomUUID(),id,v.farm_name,v.location]);
  await tx.run('INSERT INTO sms_consents VALUES (?,?,?,?,?)',[randomUUID(),id,+v.sms_opt_in,stamp,'clerk-onboarding']);
  await tx.run('INSERT INTO clerk_identities VALUES (?,?)',[clerkUserId,id]);
  return id;
 });
}
