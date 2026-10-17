import {randomUUID} from 'node:crypto';
export async function audit(tx,{actor=null,action,entity,id,details={}}){
  await tx.run('INSERT INTO audit_events (id,actor_id,action,entity,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?)',[randomUUID(),actor,action,entity,id,JSON.stringify(details),new Date().toISOString()]);
}
