import twilio from 'twilio';
import { db } from './db.mjs';
// Called by an explicit business event. No messages are sent at application startup.
export async function sendSms(userId, body) {
 const user=await db.get('SELECT phone,sms_opt_in FROM users WHERE id=?',[userId]);
 if(!user?.sms_opt_in)throw new Error('SMS consent is required.');
 const {TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:token,TWILIO_PHONE_NUMBER:from}=process.env;
 if(!account||!token||!from)throw new Error('SMS provider is not configured.');
 return twilio(account,token).messages.create({to:user.phone,from,body});
}
