import { randomUUID } from 'node:crypto';
import { db,initDb } from './db.mjs';
import { hashPassword } from './seed.mjs';
const {ADMIN_NAME:name,ADMIN_PHONE:phone,ADMIN_PASSWORD:password}=process.env;
if(!name||!/^\+[1-9]\d{7,14}$/.test(phone||'')||!password||password.length<14)throw new Error('Set ADMIN_NAME, an E.164 ADMIN_PHONE, and ADMIN_PASSWORD (at least 14 characters) in the process environment.');
await initDb();
await db.run('INSERT INTO users (id,name,phone,password_hash,role,created_at) VALUES (?,?,?,?,?,?)',[randomUUID(),name,phone,hashPassword(password),'Admin',new Date().toISOString()]);
await db.close();console.log('Admin account created.');
