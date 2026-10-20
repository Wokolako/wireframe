// Operator-only provisioning. Never exposed as an HTTP route or a public signup option.
import {db,initDb} from './db.mjs';
const [userId,action]=process.argv.slice(2);
if(!userId||!['admin','agent','grant-analytics','revoke-analytics'].includes(action))throw new Error('Usage: node --env-file-if-exists=.env server/manage-access.mjs USER_ID admin|agent|grant-analytics|revoke-analytics');
await initDb();
try{
 const user=await db.get('SELECT id,role FROM users WHERE id=?',[userId]);if(!user)throw new Error('Account not found. Create and onboard the account first.');
 if(action==='admin'){
  await db.run("UPDATE users SET role='Admin' WHERE id=?",[userId]);
 }else if(action==='agent'){
  if(user.role!=='Buyer')throw new Error('Only an existing Buyer account can be converted to Agent. Farmer and Admin accounts are preserved.');
  await db.run("UPDATE users SET role='Agent' WHERE id=?",[userId]);
 }else{
  if(user.role!=='Admin')throw new Error('Financial analytics permission is only available to Admin accounts.');
  if(action==='grant-analytics')await db.run("INSERT INTO user_permissions (user_id,permission) VALUES (?,'financial_analytics') ON CONFLICT(user_id,permission) DO NOTHING",[userId]);
  else await db.run("DELETE FROM user_permissions WHERE user_id=? AND permission='financial_analytics'",[userId]);
 }
 console.log('Access updated.');
}finally{await db.close();}
