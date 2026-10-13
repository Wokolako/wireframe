import {clerkClient} from '@clerk/express';
import {db,initDb} from './db.mjs';
// Explicit operator migration only; never match or promote accounts by email/phone.
const {CLERK_USER_ID,WIREFEN_USER_ID}=process.env;
if(!CLERK_USER_ID||!WIREFEN_USER_ID||!process.env.CLERK_SECRET_KEY)throw new Error('Set CLERK_USER_ID, WIREFEN_USER_ID and CLERK_SECRET_KEY in the process environment.');
try{
 await initDb();
 if(!await db.get('SELECT id FROM users WHERE id=?',[WIREFEN_USER_ID]))throw new Error('Wirefen account does not exist.');
 await clerkClient.users.getUser(CLERK_USER_ID);
 await db.run('INSERT INTO clerk_identities (clerk_user_id,user_id) VALUES (?,?)',[CLERK_USER_ID,WIREFEN_USER_ID]);
 console.log('Clerk identity linked to the existing Wirefen account. Its role and records are unchanged.');
}finally{await db.close();}
