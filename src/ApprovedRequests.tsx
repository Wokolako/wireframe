import {useEffect,useRef,useState,type FormEvent} from 'react';
import {CheckCircle2,Lock,Smartphone} from 'lucide-react';
import {api,send,readLocal,type Order,type User} from './api';
import {formatMoney,type CurrencyState} from './currency';
import {normalizePhone,isValidMalawiMobile} from '../shared/phone.mjs';

export const requestTerms=(order:Order)=>({unit_price_minor:Number(order.price_minor??Math.round((order.price||0)*100)),currency:order.listing_currency||'MWK',sale_unit:order.sale_unit||'kg'});
export function BuyerCommitment({order,onCommitted}:{order:Order;onCommitted:()=>void}){
 const [checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const submitting=useRef(false),terms=requestTerms(order);
 async function commit(){
  if(!checked||submitting.current)return;
  submitting.current=true;setBusy(true);setError('');
  try{await send('/orders/'+encodeURIComponent(order.id)+'/commit',{acknowledge:true,terms});onCommitted();}
  catch(e){setError((e as Error).message);}finally{submitting.current=false;setBusy(false);}
 }
 return <div className="buyer-commitment">
  <p>Commit to {order.volume} {terms.sale_unit} for {formatMoney(terms.unit_price_minor*order.volume/100,terms.currency)} before farmer approval.</p>
  <label className="commitment-choice"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>I commit to buying this quantity at the stated price and delivery location if the farmer approves. I understand the farmer will plan supply for this request.</span></label>
  {error&&<p role="alert" className="error-box">{error}</p>}
  <button type="button" className="primary compact" disabled={!checked||busy} onClick={()=>void commit()}>{busy?'Committing...':'Commit to request'}</button>
 </div>;
}

type Quote={quote_token:string;payable_minor:number;quote_expires_at:string};
export function ApprovedRequests({user,fx,enabled,onCount,onCheckout,notify}:{user:User|null;fx:CurrencyState;enabled:boolean;onCount:(count:number)=>void;onCheckout:(id:string,phone:string,operator:string)=>void;notify:(message:string)=>void}){
 const [orders,setOrders]=useState<Order[]>([]),[selected,setSelected]=useState<Order|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [quote,setQuote]=useState<Quote|null>(null),[quoteLoading,setQuoteLoading]=useState(false),[revision,setRevision]=useState(0);
 const [operators,setOperators]=useState<Array<{ref_id:string;name:string}>>([]),[operator,setOperator]=useState('');
 const [phone,setPhone]=useState(user?.phone||''),[email,setEmail]=useState(user?.email||readLocal<{email?:string}>('wirefen-saved-delivery-v1',{}).email||'');
 const [busy,setBusy]=useState(false),submitting=useRef(false);
 useEffect(()=>{
  setSelected(null);setOrders([]);onCount(0);
  if(user?.role!=='Buyer'){setOrders([]);onCount(0);return;}
  let live=true;setLoading(true);
  const refresh=()=>api<Order[]>('/orders').then(result=>{if(live){const approved=result.filter(order=>['Approved','Accepted'].includes(order.status)&&order.committed_at&&order.approved_at&&order.payment_status!=='paid');setOrders(approved);onCount(approved.length);setError('');}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});
  void refresh();window.addEventListener('focus',refresh);
  return()=>{live=false;window.removeEventListener('focus',refresh);};
 },[user?.id,onCount,revision]);
 useEffect(()=>{
  if(!selected||!enabled)return;
  let live=true;setQuote(null);setQuoteLoading(true);setError('');
  api<Quote>('/orders/'+encodeURIComponent(selected.id)+'/quote',{method:'POST',body:'{}'}).then(result=>{if(live)setQuote(result);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setQuoteLoading(false);});
  api<{data:Array<{ref_id:string;name:string}>}>('/paychangu/operators').then(result=>{if(live){setOperators(result.data);setOperator(result.data[0]?.ref_id||'');}}).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;};
 },[selected?.id,enabled]);
 async function pay(e:FormEvent){
  e.preventDefault();if(!selected||submitting.current)return;
  if(!isValidMalawiMobile(normalizePhone(phone))){setError('Enter a valid Malawi mobile-money number.');return;}
  if(!operator){setError('Choose a connected mobile-money operator.');return;}
  submitting.current=true;setBusy(true);setError('');
  try{
   let activeQuote=quote;
   if(!activeQuote||Date.parse(activeQuote.quote_expires_at)<=Date.now()){
    activeQuote=await api<Quote>('/orders/'+encodeURIComponent(selected.id)+'/quote',{method:'POST',body:'{}'});setQuote(activeQuote);
    if(quote&&activeQuote.payable_minor!==quote.payable_minor){notify('The MWK quote changed. Review the updated total and confirm again.');return;}
   }
   const result=await send<{checkout_id:string;payment_status:string}>('/orders/'+encodeURIComponent(selected.id)+'/checkout',{quote_token:activeQuote.quote_token,contact_email:email});
   onCheckout(result.checkout_id,normalizePhone(phone),operator);
   if(result.payment_status==='unpaid'){
    try{await send('/paychangu/initialize',{checkout_id:result.checkout_id,operator_ref_id:operator,mobile:normalizePhone(phone)});notify('Approve the payment request on your phone.');}
    catch(e){notify((e as Error).message);}
   }
  }catch(e){setError((e as Error).message);}finally{submitting.current=false;setBusy(false);}
 }
 if(user?.role!=='Buyer')return null;
 if(!orders.length&&!loading&&!error)return null;
 return <section className="approved-requests settings-section" aria-label="Approved order requests">
  <h2>Approved order requests</h2><p>Your commitment has been approved by the farmer. Review the agreed order, then proceed to online payment.</p>
  {loading&&<p role="status">Checking approved requests...</p>}
  {error&&<div><p className="error-box" role="alert">{error}</p><button type="button" className="secondary" onClick={()=>{setSelected(null);setRevision(value=>value+1);}}>Refresh approved requests</button></div>}
  {orders.map(order=><article className="approved-request" id={'approved-request-'+order.id} key={order.id}>
   <div><h3>{order.title}</h3><p><CheckCircle2 size={16} aria-hidden="true"/> Approved order request · {order.volume} {order.sale_unit||'kg'}</p><p>{formatMoney(Number(order.committed_unit_price_minor)*order.volume/100,order.committed_currency||'MWK')} · Delivery: {order.delivery_location}</p></div>
   {selected?.id!==order.id&&(order.checkout_id&&order.checkout_status!=='Cancelled'?<button type="button" className="primary" onClick={()=>onCheckout(order.checkout_id!,normalizePhone(phone),operator)}>Continue payment</button>:<button type="button" className="primary" onClick={()=>setSelected(order)}>Proceed to payment</button>)}
  </article>)}
  {selected&&<form className="approved-request-payment" onSubmit={pay} aria-label="Payment for approved request">
   <h3>Pay for {selected.title}</h3>
   <p>Agreed quantity: {selected.volume} {selected.sale_unit||'kg'} · {selected.delivery_location}</p>
   {quote?<p><strong>Total to pay: {formatMoney(quote.payable_minor/100,'MWK')}</strong>{fx.currency!=='MWK'&&fx.convert(quote.payable_minor/100,'MWK',fx.currency)!=null&&<small>Display estimate: {fx.money(quote.payable_minor/100,'MWK')}</small>}</p>:<p role="status">{quoteLoading?'Checking the MWK payment total...':'Check the current total before paying.'}</p>}
   {!enabled?<p role="status">Online payment is currently unavailable. Your approved request is retained.</p>:<>
    <div className="payment-cards-horizontal" role="group" aria-label="Payment options">{operators.map(item=><button key={item.ref_id} type="button" aria-pressed={operator===item.ref_id} className={`payment-card-btn ${/airtel/i.test(item.name)?'airtel':'tnm'} ${operator===item.ref_id?'selected':''}`} onClick={()=>setOperator(item.ref_id)}><Smartphone size={20}/><span>{item.name}</span></button>)}</div>
    <label className="field"><span>Mobile-money phone number</span><input required type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
    <label className="field"><span>Payment receipt email</span><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <p>One approval request will be sent to your phone. The order is confirmed after payment verification.</p>
    <button className="primary" disabled={busy||!operator}><Lock size={16}/> {busy?'Starting payment...':'Confirm and pay approved request'}</button>
   </>}
   <button className="secondary" type="button" disabled={busy} onClick={()=>setSelected(null)}>Back to approved requests</button>
  </form>}
 </section>;
}
