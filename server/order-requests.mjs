import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {minorUnits,lineTotalMinor,majorUnits} from './money.mjs';
import {makeCheckoutQuote,verifyCheckoutQuote} from './checkout.mjs';

const fail=(status,message)=>Object.assign(new Error(message),{status});
const lock=process.env.DATABASE_URL?' FOR UPDATE':'';
const termsSchema=z.object({unit_price_minor:z.number().int().positive(),currency:z.string().regex(/^[A-Z]{3}$/),sale_unit:z.string().min(1)}).strict();
const isApproved=order=>['Approved','Accepted'].includes(order.status)&&!!order.committed_at&&!!order.approved_at;
const payableItem=order=>({listing_id:order.listing_id,quantity:Number(order.volume),currency:order.committed_currency,priceMinor:Number(order.committed_unit_price_minor),lineTotalMinor:lineTotalMinor(Number(order.committed_unit_price_minor),Number(order.volume),order.committed_sale_unit)});

export function registerOrderRequests({app,db,permit,availabilityWhere,requireValidQuantity,audit,now,payChanguEnabled,paymentLimit}){
 async function ownedOrder(tx,id,user,locking=false){
  const order=await tx.get('SELECT * FROM order_requests WHERE id=?'+(locking?lock:''),[id]);
  if(!order)throw fail(404,'Order request not found.');
  if(user.role==='Buyer'&&order.buyer_id!==user.id)throw fail(403,'You can only manage your own order requests.');
  return order;
 }
 async function availableListing(tx,id,locking=false){
  const listing=await tx.get(`SELECT * FROM listings WHERE id=? AND ${availabilityWhere('listings')}`+(locking?lock:''),[id,now().slice(0,10)]);
  if(!listing)throw fail(409,'The produce is no longer available. Ask the farmer for a new offer.');
  return listing;
 }
 function checkTerms(listing,terms){
  if(!terms||terms.unit_price_minor!==Number(listing.price_minor??minorUnits(listing.price))||terms.currency!==(listing.currency||process.env.CURRENCY||'ZAR')||terms.sale_unit!==(listing.sale_unit||'kg'))throw fail(409,'The price or sale unit changed. Refresh and review the terms before committing.');
 }
 async function commit(tx,order,listing,terms,actor){
  checkTerms(listing,terms);
  requireValidQuantity(Number(order.volume),listing.sale_unit||'kg');
  if(Number(order.volume)>Number(listing.available_volume))throw fail(409,'The requested quantity is no longer available.');
  if(terms.currency==='MWK'&&lineTotalMinor(terms.unit_price_minor,Number(order.volume),terms.sale_unit)%100!==0)throw fail(400,'Mobile-money payment requires a whole-Kwacha total. Adjust the requested quantity before committing.');
  const stamp=now();
  await tx.run("UPDATE order_requests SET committed_at=?,committed_unit_price_minor=?,committed_currency=?,committed_sale_unit=?,status='Committed' WHERE id=?",[stamp,terms.unit_price_minor,terms.currency,terms.sale_unit,order.id]);
  await audit(tx,{actor,action:'order_request.buyer_committed',entity:'order_request',id:order.id,details:{quantity:Number(order.volume),delivery_location:order.delivery_location,...terms}});
  return {id:order.id,status:'Committed',committed_at:stamp};
 }
 app.post('/api/v1/orders',permit('Buyer'),async(req,res)=>{
  const input=z.object({listing_id:z.string().min(1),volume:z.number().positive().max(1e9),delivery_location:z.string().trim().min(3).max(200),notes:z.string().trim().max(1000).default(''),commit:z.boolean().default(false),terms:termsSchema.optional()}).strict().parse(req.body);
  const result=await db.transaction(async tx=>{
   const listing=await availableListing(tx,input.listing_id,true);
   requireValidQuantity(input.volume,listing.sale_unit||'kg');
   if(input.volume>Number(listing.available_volume))throw fail(400,'Requested volume exceeds available supply.');
   const id=randomUUID();
   await tx.run('INSERT INTO order_requests (id,listing_id,buyer_id,volume,delivery_location,notes,created_at) VALUES (?,?,?,?,?,?,?)',[id,input.listing_id,req.user.id,input.volume,input.delivery_location,input.notes,now()]);
   return input.commit?commit(tx,{...input,id},listing,input.terms,req.user.id):{id,status:'New'};
  });
  res.status(201).json(result);
 });
 app.get('/api/v1/orders',permit('Buyer','Farmer','Admin'),async(req,res)=>{
  const scope=req.user.role==='Buyer'?[' WHERE o.buyer_id=?',[req.user.id]]:req.user.role==='Farmer'?[' WHERE f.user_id=?',[req.user.id]]:['',[]];
  res.json(await db.all(`SELECT o.*,l.title,COALESCE(o.committed_sale_unit,l.sale_unit) AS sale_unit,COALESCE(o.committed_unit_price_minor,l.price_minor) AS price_minor,COALESCE(o.committed_currency,l.currency) AS listing_currency,l.price,l.image,f.farm_name,u.name AS buyer_name,u.phone,c.status AS checkout_status,c.payment_status AS checkout_payment_status FROM order_requests o JOIN listings l ON l.id=o.listing_id JOIN farmer_profiles f ON f.id=l.farmer_id JOIN users u ON u.id=o.buyer_id LEFT JOIN guest_order_checkouts c ON c.id=o.checkout_id`+scope[0]+' ORDER BY o.created_at DESC',scope[1]));
 });
 app.post('/api/v1/orders/:id/commit',permit('Buyer'),async(req,res)=>{
  const input=z.object({acknowledge:z.literal(true),terms:termsSchema}).strict().parse(req.body);
  res.json(await db.transaction(async tx=>{
   const order=await ownedOrder(tx,req.params.id,req.user,true);
   if(order.committed_at)return {id:order.id,status:order.status,committed_at:order.committed_at};
   if(!['New','In review','Contacted','Approved','Accepted'].includes(order.status)||order.payment_status==='paid')throw fail(409,'This request cannot be committed. Create a new request.');
   return commit(tx,order,await availableListing(tx,order.listing_id,true),input.terms,req.user.id);
  }));
 });
 app.post('/api/v1/orders/:id/withdraw',permit('Buyer'),async(req,res)=>{
  res.json(await db.transaction(async tx=>{
   const order=await ownedOrder(tx,req.params.id,req.user,true);
   if(!['New','In review','Contacted','Committed'].includes(order.status)||order.payment_status==='paid')throw fail(409,'This request has already been approved. Contact the farmer before changing it.');
   await tx.run("UPDATE order_requests SET status='Cancelled' WHERE id=?",[order.id]);
   await audit(tx,{actor:req.user.id,action:'order_request.withdrawn',entity:'order_request',id:order.id});
   return {id:order.id,status:'Cancelled'};
  }));
 });
 app.patch('/api/v1/orders/:id',permit('Farmer','Admin'),async(req,res)=>{
  const input=z.object({status:z.enum(['New','In review','Accepted','Declined','Approved','Denied','Contacted','Closed'])}).strict().parse(req.body);
  const status=input.status==='Accepted'?'Approved':input.status==='Declined'?'Denied':input.status;
  res.json(await db.transaction(async tx=>{
   const order=await ownedOrder(tx,req.params.id,req.user,true);
   const owner=await tx.get('SELECT f.user_id FROM listings l JOIN farmer_profiles f ON f.id=l.farmer_id WHERE l.id=?',[order.listing_id]);
   if(req.user.role==='Farmer'&&owner?.user_id!==req.user.id)throw fail(403,'You can only manage requests for your own produce.');
   if(status==='Approved'&&!order.committed_at)throw fail(409,'The buyer must commit before farmer approval.');
   if(order.status===status)return {id:order.id,status};
   if(['Cancelled','Denied','Declined','Closed'].includes(order.status))throw fail(409,'This request is closed and cannot be reopened.');
   if(status==='Approved'){
    if(!order.committed_at)throw fail(409,'The buyer must commit to the quantity, price and delivery details before you approve.');
    if(!['Committed','In review','Contacted','New'].includes(order.status))throw fail(409,'This request cannot be approved again.');
    const listing=await availableListing(tx,order.listing_id,true);
    if(Number(listing.available_volume)<Number(order.volume))throw fail(409,'There is no longer enough produce to approve this quantity.');
    if(listing.sale_unit!==order.committed_sale_unit)throw fail(409,'The sale unit changed. Ask the buyer for a new request.');
    await tx.run("UPDATE order_requests SET status='Approved',approved_at=? WHERE id=?",[now(),order.id]);
   }else{
    if(['Approved','Accepted','Confirmed'].includes(order.status)&&!(status==='Closed'&&order.payment_status==='paid'))throw fail(409,'An approved request remains available for payment. Only paid requests can be closed.');
    if(status==='Closed'&&order.payment_status!=='paid')throw fail(409,'Payment must be verified before closing a request.');
    if(req.user.role==='Farmer'&&!['Denied','Contacted','Closed'].includes(status))throw fail(403,'Choose a farmer response for this request.');
    await tx.run('UPDATE order_requests SET status=? WHERE id=?',[status,order.id]);
   }
   await audit(tx,{actor:req.user.id,action:'order_request.status_changed',entity:'order_request',id:order.id,details:{from:order.status,to:status}});
   return {id:order.id,status};
  }));
 });
 app.post('/api/v1/orders/:id/quote',permit('Buyer'),paymentLimit,async(req,res)=>{
  const order=await ownedOrder(db,req.params.id,req.user);
  if(!isApproved(order)||order.payment_status==='paid')throw fail(409,'Commit to this request and obtain farmer approval before paying.');
  if(!payChanguEnabled())throw fail(503,'Online payment is currently unavailable.');
  res.json(await makeCheckoutQuote([payableItem(order)],'paychangu_mobile_money'));
 });
 app.post('/api/v1/orders/:id/checkout',permit('Buyer'),paymentLimit,async(req,res)=>{
  const input=z.object({quote_token:z.string().max(20000),contact_email:z.email().max(200)}).strict().parse(req.body);
  if(!payChanguEnabled())throw fail(503,'Online payment is currently unavailable.');
  const result=await db.transaction(async tx=>{
   const order=await ownedOrder(tx,req.params.id,req.user,true);
   if(!order.committed_at||!order.approved_at)throw fail(409,'Buyer commitment and farmer approval are required before checkout.');
   if(order.checkout_id){
    const existing=await tx.get('SELECT * FROM guest_order_checkouts WHERE id=?',[order.checkout_id]);
    if(existing&&existing.status!=='Cancelled')return {...JSON.parse(existing.response_json),status:existing.status,payment_status:existing.payment_status};
   }
   if(!isApproved(order)||order.payment_status==='paid')throw fail(409,'This request is not available for payment.');
   const listing=await availableListing(tx,order.listing_id,true);
   const farm=await tx.get('SELECT verification_status FROM farmer_profiles WHERE id=?',[listing.farmer_id]);
   if(farm?.verification_status!=='Verified')throw fail(409,'The farm must be verified before accepting online payment. Contact Wirefen.');
   if(listing.sale_unit!==order.committed_sale_unit)throw fail(409,'The sale unit changed. Contact the farmer.');
   const item=payableItem(order),quote=verifyCheckoutQuote(input.quote_token,[item],'paychangu_mobile_money');
   const id=randomUUID(),lineId=randomUUID(),stamp=now();
   const reserved=await tx.run(`UPDATE listings SET available_volume=available_volume-? WHERE id=? AND available_volume>=? AND ${availabilityWhere('listings')}`,[order.volume,order.listing_id,order.volume,stamp.slice(0,10)]);
   if(!(reserved.rowCount??reserved.changes))throw fail(409,'The approved quantity is no longer available. Contact the farmer.');
   const result={...quote,id,checkout_id:id,order_request_id:order.id,ids:[lineId],status:'Awaiting payment',payment_status:'unpaid',total:majorUnits(quote.total_minor),payment_quote_expires_at:quote.currency!=='MWK'?quote.quote_expires_at:null};
   await tx.run(`INSERT INTO guest_order_checkouts (id,idempotency_key,response_json,contact_name,contact_phone,contact_email,delivery_location,notes,payment_method,currency,total_minor,status,created_at,order_request_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,'request:'+id,JSON.stringify(result),req.user.name,req.user.phone,input.contact_email,order.delivery_location,order.notes,'paychangu_mobile_money',quote.currency,quote.total_minor,'Awaiting payment',stamp,order.id]);
   await tx.run(`INSERT INTO guest_orders (id,checkout_id,listing_id,produce_id,quantity,quantity_unit,payment_method,unit_price,unit_price_minor,line_total_minor,currency,contact_name,contact_phone,contact_email,delivery_location,notes,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[lineId,id,order.listing_id,listing.produce_id,order.volume,order.committed_sale_unit,'paychangu_mobile_money',majorUnits(item.priceMinor),item.priceMinor,item.lineTotalMinor,item.currency,req.user.name,req.user.phone,input.contact_email,order.delivery_location,order.notes,'Awaiting payment',stamp]);
   await tx.run("UPDATE order_requests SET checkout_id=?,payment_status='unpaid' WHERE id=?",[id,order.id]);
   await audit(tx,{actor:req.user.id,action:'inventory.reserved',entity:'listing',id:order.listing_id,details:{checkout_id:id,order_request_id:order.id,quantity:Number(order.volume),unit:order.committed_sale_unit}});
   return result;
  });
  res.status(201).json(result);
 });
}

export async function settleApprovedRequest(tx,checkout,amount,stamp){
 if(!checkout.order_request_id||checkout.status==='Cancelled')return;
 const order=await tx.get('SELECT * FROM order_requests WHERE id=?'+lock,[checkout.order_request_id]);
 if(!order||order.checkout_id!==checkout.id||order.payment_status==='paid')return;
 const reference='WF-PC-'+checkout.id;
 await tx.run("INSERT INTO payments (id,order_id,buyer_id,amount,currency,method,provider,account_or_phone,status,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",[randomUUID(),order.id,order.buyer_id,amount,'MWK','paychangu_mobile_money','PayChangu','','completed',reference,'Verified provider payment',stamp]);
 await tx.run("UPDATE order_requests SET payment_status='paid',payment_ref=?,payment_method='paychangu_mobile_money',amount_paid=?,currency='MWK',status='Confirmed' WHERE id=? AND checkout_id=?",[reference,amount,order.id,checkout.id]);
}
