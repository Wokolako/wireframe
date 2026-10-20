import {navigate} from './navigation';
import Link from 'next/link';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ClipboardList,ArrowRight,ArrowUpRight,Bookmark,Building2,CheckCircle2,CreditCard,Info,Leaf,Lock,MapPin,Minus,Package,Plus,Search,ShieldCheck,Smartphone,Trash2,X,LayoutGrid,Tractor,Sprout} from 'lucide-react';
import {api,send,date,number as formatNumber,type Config,type Listing,type User} from './api';

type Props={listing:Listing;money:(n:number,currency?:string)=>string;saved:boolean;toggleSave:()=>void;notify?:(s:string)=>void};
type BasketLine={listing_id:string;quantity:number};
const number=(value?:number)=>value==null?'Unavailable':formatNumber(value);
import {normalizePhone,isValidPhone,isValidMalawiMobile} from '../shared/phone.mjs';

export type DeliveryAddress={name:string;phone:string;email:string;delivery:string;notes?:string};
export const savedDeliveryKey='wirefen-saved-delivery-v1';
export function readSavedDelivery():DeliveryAddress|null{if(typeof window==='undefined')return null;try{const raw=localStorage.getItem(savedDeliveryKey);return raw?JSON.parse(raw):null;}catch{return null;}}
export function saveSavedDelivery(d:DeliveryAddress){if(typeof window==='undefined')return;try{localStorage.setItem(savedDeliveryKey,JSON.stringify(d));window.dispatchEvent(new Event('wirefen-delivery-updated'));}catch{}}

const basketKey='wirefen-basket-v1';
const activeCheckoutKey='wirefen-active-paychangu-checkout-v1';
const checkoutKey=(scope:string)=>{const keyName=`wirefen-checkout-${scope}`;let key=localStorage.getItem(keyName);if(!key){key=crypto.randomUUID();localStorage.setItem(keyName,key);}return key;};
const clearCheckoutKey=(scope:string)=>localStorage.removeItem(`wirefen-checkout-${scope}`);
const readActiveCheckout=()=>localStorage.getItem(activeCheckoutKey);
function readBasket():BasketLine[]{try{const rows=JSON.parse(localStorage.getItem(basketKey)||'[]');return Array.isArray(rows)?rows.filter((r:BasketLine)=>typeof r.listing_id==='string'&&Number.isFinite(r.quantity)&&r.quantity>0):[];}catch{return [];}}
function saveBasket(rows:BasketLine[]){localStorage.setItem(basketKey,JSON.stringify(rows));window.dispatchEvent(new Event('wirefen-basket'));}
function addToBasket(id:string,quantity:number){try{localStorage.removeItem(activeCheckoutKey);}catch{}const rows=readBasket(),current=rows.find(r=>r.listing_id===id);if(current)current.quantity+=quantity;else rows.push({listing_id:id,quantity});saveBasket(rows);}
function useBasketCount(){const [count,setCount]=useState(()=>readBasket().length);useEffect(()=>{const refresh=()=>setCount(readBasket().length);window.addEventListener('wirefen-basket',refresh);return()=>window.removeEventListener('wirefen-basket',refresh);},[]);return count;}
export function StorefrontCard({listing:l,money,saved,toggleSave,notify}:Props){
  const price=l.price_minor==null?l.price:l.price_minor/100;
  return <article className="produce-card" role="button" tabIndex={0} onClick={()=>navigate('/produce/'+l.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();navigate('/produce/'+l.id);}}}>
    <div className="produce-image">
      <Link href={'/produce/'+l.id} tabIndex={-1} aria-hidden="true" onClick={e=>e.stopPropagation()}>
        <img src={l.image} alt="" loading="lazy"/>
      </Link>
      <span className="produce-category">{l.crop_category}</span>
      <button className={'save-button '+(saved?'saved':'')} aria-label={(saved?'Unsave ':'Save ')+l.title} aria-pressed={saved} onClick={e=>{e.stopPropagation();toggleSave();}}>
        <Bookmark size={18} fill={saved?'currentColor':'none'}/>
      </button>
    </div>
    <div className="produce-info">
      <h3><Link href={'/produce/'+l.id} onClick={e=>e.stopPropagation()}>{l.title}</Link></h3>
      <TrustBadges farmVerified={l.farm_verified===true} harvestInspected={l.harvest_inspected===true}/>
      <p className="produce-facts"><span><Leaf size={14}/>{l.preservative_used?'Preserved':'No preservatives'}</span></p>
      <div className="produce-bottom">
        <div className="price">{money(price,l.currency)}<span> / {l.sale_unit||'kg'}</span></div>
        <Link className="view-produce" href={'/produce/'+l.id} onClick={e=>e.stopPropagation()}>View produce <ArrowUpRight size={16}/></Link>
      </div>
      <button className="secondary full-width add-basket-btn" onClick={e=>{
        e.stopPropagation();
        if(l.guest_limit?.unit===(l.sale_unit||'kg')){
          addToBasket(l.id,1);
          notify?.(`Added 1 ${l.sale_unit||'kg'} of ${l.title} to your basket.`);
        }else navigate('/produce/'+l.id);
      }}>
        {l.guest_limit?.unit===(l.sale_unit||'kg')?`Add 1 ${l.sale_unit||'kg'} to basket`:'Request quantity'}
      </button>
    </div>
  </article>;
}
function TrustBadges({farmVerified,harvestInspected}:{farmVerified:boolean;harvestInspected:boolean}){return <div className="storefront-badges">{farmVerified&&<span><ShieldCheck size={15}/>From a verified farm</span>}<span><Leaf size={15}/>Sustainability first</span>{harvestInspected&&<span><Leaf size={15}/>Harvest inspected</span>}</div>;}

export function StorefrontMarketplace({savedOnly,saved,toggleSave,money,user,config,signIn,notify}:{savedOnly:boolean;saved:string[];toggleSave:(id:string)=>void;money:(n:number,currency?:string)=>string;user:User|null;config:Config;signIn:()=>void;notify?:(s:string)=>void}){
 const basketCount=useBasketCount();
 const [marketTab,setMarketTab]=useState<'all'|'mine'>('all');
 const [listings,setListings]=useState<Listing[]>([]),[search,setSearch]=useState(''),[category,setCategory]=useState('All produce'),[sort,setSort]=useState('recent'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[page,setPage]=useState(1),[pages,setPages]=useState(1),[total,setTotal]=useState(0);
 useEffect(()=>{
  let live=true;
  setLoading(true);
  setError('');
  const q=new URLSearchParams({page:String(page),page_size:'24'});
  if(marketTab==='mine')q.set('mine','true');
  if(search.trim())q.set('search',search.trim());
  if(category!=='All produce')q.set('category',category);
  api<Listing[]|{items:Listing[];pages:number;total:number}>('/listings?'+q).then(result=>{
    if(!live)return;
    const items=Array.isArray(result)?result:result.items;
    setListings(items);
    setPages(Array.isArray(result)?1:result.pages);
    setTotal(Array.isArray(result)?items.length:result.total);
  }).catch(e=>{
    if(live)setError(e.message);
  }).finally(()=>{
    if(live)setLoading(false);
  });
  return()=>{live=false;};
 },[search,category,page,marketTab]);
 const shown=listings.filter(l=>!savedOnly||saved.includes(l.id)).sort((a,b)=>sort==='price'?a.price-b.price:sort==='harvest'?b.harvest_date.localeCompare(a.harvest_date):0);
 const changeCategory=(value:string)=>{setCategory(value);setPage(1);};
 const changeSearch=(value:string)=>{setSearch(value);setPage(1);};
 const changeTab=(tab:'all'|'mine')=>{if(tab==='mine'&&!user){signIn();return;}setMarketTab(tab);setPage(1);};
 return <><div className="page-heading"><div><h1>{savedOnly?'Saved produce':'The marketplace'}</h1><p>Browse listings from farms with verified identities.</p></div><div className="storefront-actions"><Link className="button secondary" href="/basket">Basket ({basketCount})</Link>{user?.role==='Farmer'&&<Link className="button primary" href="/new-listing">List produce</Link>}</div></div>{!savedOnly&&<section className="market-hero"><div className="hero-copy"><h2>Good things<br/>grow together.</h2><p>Find quality produce for your household or place a larger request.</p><Link className="hero-link" href="#produce-catalog">Explore produce <ArrowRight size={17}/></Link></div><div className="hero-photo" role="img" aria-label="Green fields in warm afternoon sunlight"/></section>}
 <section id="produce-catalog">
 {!savedOnly&&<div className="marketplace-tabs" role="tablist" aria-label="Marketplace categories">
   <button type="button" role="tab" aria-selected={marketTab==='all'} className={'marketplace-tab '+(marketTab==='all'?'active':'')} onClick={()=>changeTab('all')}>
     <LayoutGrid size={16}/><span>All products</span>
   </button>
   <button type="button" role="tab" aria-selected={marketTab==='mine'} className={'marketplace-tab '+(marketTab==='mine'?'active':'')} onClick={()=>changeTab('mine')}>
     <Tractor size={16}/><span>My listings</span>{user?.role==='Farmer'&&<span className="tab-badge">Farmer</span>}
   </button>
 </div>}
 <div className="catalog-heading"><h2>{marketTab==='mine'?'My farm produce':'Explore produce'}</h2><span>{config.market}</span></div><div className="catalog-toolbar"><label className="search-field"><Search size={18}/><span className="sr-only">Search produce</span><input value={search} onChange={e=>changeSearch(e.target.value)} placeholder="Search produce"/></label><label className="sort-field"><span className="sr-only">Category</span><select value={category} onChange={e=>changeCategory(e.target.value)}>{['All produce','Vegetables','Fruits','Grains','Tubers','Legumes','Beverages & Nuts'].map(x=><option key={x}>{x}</option>)}</select></label><label className="sort-field"><span className="sr-only">Sort</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Recently listed</option><option value="price">Price: low to high</option><option value="harvest">Latest harvest</option></select></label></div><p className="results-bar" aria-live="polite">{loading?'Loading produce…':`${savedOnly?shown.length:total} available listings`}</p>{error&&<p role="alert" className="error-box">{error}</p>}{!loading&&(shown.length?<div className="produce-grid">{shown.map(l=><StorefrontCard key={l.id} listing={l} money={money} saved={saved.includes(l.id)} toggleSave={()=>toggleSave(l.id)} notify={notify}/>)}</div>:marketTab==='mine'?<div className="empty" style={{padding:'50px 20px'}}><Sprout size={36} aria-hidden="true"/><h2>No produce listed yet</h2><p>You haven’t published any harvest listings yet. Share your crops with buyers across the marketplace.</p>{user?.role==='Farmer'?<Link className="button primary" href="/new-listing">List your produce <ArrowRight size={16}/></Link>:<button type="button" className="button primary" onClick={signIn}>Sign in to list produce</button>}</div>:<p>No matching produce is available. Try another search.</p>)}{!savedOnly&&pages>1&&<nav className="pagination" aria-label="Marketplace pages"><button className="secondary" disabled={page<=1||loading} onClick={()=>setPage(value=>value-1)}>Previous</button><span>Page {page} of {pages}</span><button className="secondary" disabled={page>=pages||loading} onClick={()=>setPage(value=>value+1)}>Next</button></nav>}<div className="bottom-callout"><div><h3>Planning a larger order?</h3><p>Send your quantity and delivery dates to the Wirefen team.</p></div>{user?.role==='Buyer'?<Link href="/requests" className="button secondary">Bulk order request</Link>:<button className="secondary" onClick={signIn}>Sign in for bulk requests</button>}</div></section></>;
}

type DetailProps={id:string;user:User|null;money:(n:number,currency?:string)=>string;saved:string[];toggleSave:(id:string)=>void;signIn:()=>void;notify:(s:string)=>void};
export function StorefrontDetail({id,user,money:formatMoney,saved,toggleSave,signIn,notify}:DetailProps){
 const navigatingToPayment=useRef(false);
 const [item,setItem]=useState<Listing|null>(null),[quantity,setQuantity]=useState('1'),[error,setError]=useState(''),[bulkOpen,setBulkOpen]=useState(false),[orderModalOpen,setOrderModalOpen]=useState(false);
 useEffect(()=>{setItem(null);api<Listing>('/listings/'+id).then(setItem).catch(e=>setError(e.message));},[id]);
 const limit=item?.guest_limit,canGuest=!!limit&&limit.unit===(item?.sale_unit||'kg'),over=!!(limit&&Number(quantity)>limit.max);
 const q=Number(quantity);
 const qtyValid=Number.isFinite(q)&&q>0;
 const unitPrice=item?(item.price_minor!=null?item.price_minor/100:item.price):0;
 const detailTotal=qtyValid?(item?.price_minor!=null?Math.round(item.price_minor*q)/100:unitPrice*q):unitPrice;
 const money=(amount:number)=>formatMoney(amount,item?.currency);
 const l=item||{farm_verified:false,harvest_inspected:false};
 function continueToPayment(){const selected=Number(quantity);if(navigatingToPayment.current||!canGuest||over||!Number.isFinite(selected)||selected<=0)return;navigatingToPayment.current=true;addToBasket(id,selected);navigate('/basket?step=checkout');}
  return <><Link className="back-link" href="/marketplace"><ArrowLeft size={16}/>Back to marketplace</Link>{error&&<p role="alert" className="error-box">{error}</p>}{item?<div className="detail-layout"><div><img className="detail-image" src={item.image} alt={item.title}/><div className="detail-description"><h2>About this produce</h2><p>{item.description}</p><h2>Harvest details</h2><dl className="detail-facts"><div><dt>Harvest date</dt><dd>{date(item.harvest_date)}</dd></div><div><dt>Available until</dt><dd>{date(item.expiration_date)}</dd></div><div><dt>Shelf life</dt><dd>{item.shelf_life_days} days</dd></div></dl></div></div><div className="detail-side"><div className="detail-title"><span className="tag">{item.crop_category}</span><button className="icon-button" aria-label="Save produce" aria-pressed={saved.includes(id)} onClick={()=>toggleSave(id)}><Bookmark size={21}/></button></div><h1>{item.title}</h1><TrustBadges farmVerified={l.farm_verified===true} harvestInspected={l.harvest_inspected===true}/><div className="detail-price">{money(detailTotal)}<span>{qtyValid&&q!==1?` (${money(unitPrice)} / ${item.sale_unit||'kg'})`:` / ${item.sale_unit||'kg'}`}</span></div><div className="inquiry-section"><h2>Household checkout</h2>{canGuest?<p>Up to {limit.max} {limit.unit} per household. No account needed.</p>:<p>This listing needs an Order Request because its spreadsheet limit uses {limit?.unit||'an unconfigured unit'}.</p>}<label className="field"><span>Quantity ({item.sale_unit||'kg'})</span><input type="number" required min={item.sale_unit==='kg'?'0.1':'1'} step={item.sale_unit==='kg'?'0.1':'1'} value={quantity} onChange={e=>{setQuantity(e.target.value);if(item.guest_limit&&Number(e.target.value)>item.guest_limit.max)setBulkOpen(true);}}/></label>{canGuest&&!over&&(
    <div style={{display:'grid',gap:'8px'}}>
      <button type="button" className="primary full-width" disabled={over||!Number.isFinite(Number(quantity))||Number(quantity)<=0} onClick={continueToPayment}>
        Buy now <ArrowRight size={16}/>
      </button>
      <button type="button" className="secondary full-width" onClick={()=>{const q=Number(quantity);if(Number.isFinite(q)&&q>0){addToBasket(id,q);notify(`Added ${q} ${item.sale_unit||'kg'} to your basket.`);}}}>
        Add to basket
      </button>
      <button type="button" className="secondary full-width" style={{marginTop:8,display:'flex',justifyContent:'center',alignItems:'center',gap:6}} onClick={()=>setOrderModalOpen(true)}>
        <ClipboardList size={16}/> Request order from farmer
      </button>
    </div>
  )}{(!canGuest||over)&&<button className="primary full-width" onClick={()=>setOrderModalOpen(true)}>Request order from farmer</button>}<small className="inquiry-note">Delivery location is collected strictly for delivery routing. Choose Airtel Money, TNM Mpamba, or Bank Transfer at checkout.</small></div></div></div>:!error&&<div className="loading">Loading produce…</div>}{orderModalOpen&&item&&<ListingOrderModal item={item} user={user} initialQuantity={Number(quantity)||1} signIn={signIn} close={()=>setOrderModalOpen(false)} notify={notify||(()=>{})}/>}{bulkOpen&&<BulkModal item={item} user={user} signIn={signIn} close={()=>setBulkOpen(false)} notify={notify}/>}</>;
}

export function StorefrontBasket({user,money,signIn,notify,config}:{user:User|null;money:(n:number)=>string;signIn:()=>void;notify:(s:string)=>void;config:Config}){
 const [items,setItems]=useState<BasketLine[]>(readBasket),[listings,setListings]=useState<Listing[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[bulk,setBulk]=useState<Listing|null>(null),[checkoutId,setCheckoutId]=useState<string|null>(null);
 const [savedAddr,setSavedAddr]=useState<DeliveryAddress|null>(readSavedDelivery);
 const [editingDelivery,setEditingDelivery]=useState<boolean>(false);
 const [name,setName]=useState(savedAddr?.name||user?.name||'');
 const [phone,setPhone]=useState(savedAddr?.phone||user?.phone||'');
 const [email,setEmail]=useState(savedAddr?.email||user?.email||'');
 const [delivery,setDelivery]=useState(savedAddr?.delivery||'');
 const [notes,setNotes]=useState(savedAddr?.notes||'');
 const [operators,setOperators]=useState<Array<{ref_id:string;name:string}>>([]);
 const [paymentChannel,setPaymentChannel]=useState<'airtel'|'tnm'|'bank'>('airtel');
 const [bankName,setBankName]=useState('National Bank of Malawi');
 const [bankAccount,setBankAccount]=useState('');
 const [bankConfirmation,setBankConfirmation]=useState<{checkoutId:string;mwkTotal:number;bankName:string;bankAccount:string}|null>(null);
 const [momoPhone,setMomoPhone]=useState('');

 useEffect(()=>{
  if(items.length>0){
   setDone(false);
   setCheckoutId(null);
   setBankConfirmation(null);
   try{localStorage.removeItem(activeCheckoutKey);}catch{}
  }
 },[items.length]);
 useEffect(()=>{
  const handler=()=>{
   const latest=readSavedDelivery();
   if(latest){setSavedAddr(latest);if(!editingDelivery){setName(latest.name);setPhone(latest.phone);setEmail(latest.email);setDelivery(latest.delivery);if(latest.notes)setNotes(latest.notes);}}
  };
  window.addEventListener('wirefen-delivery-updated',handler);
  return()=>window.removeEventListener('wirefen-delivery-updated',handler);
 },[editingDelivery]);

 useEffect(()=>{
  let live=true;
  api<{data:Array<{ref_id:string;name:string}>}>('/paychangu/operators').then(res=>{
   if(live&&res.data?.length){setOperators(res.data);}
  }).catch(()=>{});
  return()=>{live=false;};
 },[]);

 useEffect(()=>{let active=true;Promise.all(items.map(async line=>{try{return await api<Listing>('/listings/'+line.listing_id);}catch(error){if((error as Error&{status?:number}).status===404)return null;throw error;}})).then(rows=>{if(active)setListings(rows.filter((row):row is Listing=>row!==null));}).catch(e=>{if(active)setError((e as Error).message);});return()=>{active=false;};},[items]);
 const rows=items.map(line=>({line,item:listings.find(l=>l.id===line.listing_id)}));
 const totals=new Map<string,number>();for(const {line,item} of rows)if(item?.guest_limit){const n=item.guest_limit.name;totals.set(n,(totals.get(n)||0)+line.quantity);}
 const over=rows.find(({item})=>item&&item.guest_limit&&(item.guest_limit.unit!==(item.sale_unit||'kg')||(totals.get(item.guest_limit.name)||0)>item.guest_limit.max));
 useEffect(()=>{if(over?.item)setBulk(over.item);},[over?.item?.id]);

 function change(id:string,quantity:number){const next=items.map(r=>r.listing_id===id?{...r,quantity}:r).filter(r=>r.quantity>0);setItems(next);saveBasket(next);}
 function cancelDeliveryEdit(){setName(savedAddr?.name||user?.name||'');setPhone(savedAddr?.phone||user?.phone||'');setEmail(savedAddr?.email||user?.email||'');setDelivery(savedAddr?.delivery||'');setNotes(savedAddr?.notes||'');setError('');setEditingDelivery(false);}

 const totalMinor=rows.reduce((acc,{line,item})=>acc+(item?(item.price_minor!=null?Math.round(item.price_minor*line.quantity):Math.round(item.price*100*line.quantity)):0),0);
 const totalMajor=totalMinor/100;
 const estMwkTotal=Math.round(totalMajor*1732.26);

 const airtelOperator=operators.find(o=>o.name.toLowerCase().includes('airtel'))?.ref_id||operators[0]?.ref_id||'';
 const tnmOperator=operators.find(o=>o.name.toLowerCase().includes('tnm')||o.name.toLowerCase().includes('mpamba'))?.ref_id||operators[1]?.ref_id||operators[0]?.ref_id||'';

 async function submit(e?:FormEvent){
  if(e)e.preventDefault();
  if(over?.item){setBulk(over.item);return;}
  if(rows.some(r=>!r.item)){setError('Remove unavailable produce before checkout.');return;}
  if(!name.trim()||!phone.trim()||!email.trim()||!delivery.trim()){setError('Please fill in all required delivery fields.');setEditingDelivery(true);return;}
  const normPhone=normalizePhone(phone);
  if(!isValidPhone(normPhone)){setError('Enter a valid phone number (e.g. 0881522474, 265 881522474, or +265991234567).');setEditingDelivery(true);return;}
  
  if(paymentChannel==='airtel'||paymentChannel==='tnm'){
   const payPhone=momoPhone||phone;
   const normPayPhone=normalizePhone(payPhone);
   if(!isValidMalawiMobile(normPayPhone)){setError('Enter a valid Malawi mobile number (e.g. 0881522474, 265 881522474, or +265991234567).');return;}
  }

  const addressToSave:DeliveryAddress={name,phone:normPhone,email,delivery,notes};
  saveSavedDelivery(addressToSave);
  setSavedAddr(addressToSave);
  setEditingDelivery(false);
  setBusy(true);
  setError('');

  try{
   const key=checkoutKey('basket');
   if(paymentChannel==='bank'){
    const result=await send<{checkout_id:string;mwk_total?:number}>('/guest-orders/basket',{
     items,
     contact_name:name,
     contact_phone:normPhone,
     contact_email:email,
     delivery_location:delivery,
     payment_method:'malawian_bank',
     notes:`${notes?notes+' | ':''}Bank: ${bankName}${bankAccount?' ('+bankAccount+')':''}`
    },'POST',{'Idempotency-Key':key});
    clearCheckoutKey('basket');
    setItems([]);
    saveBasket([]);
    setBankConfirmation({
     checkoutId:result.checkout_id,
     mwkTotal:result.mwk_total||estMwkTotal,
     bankName,
     bankAccount
    });
    setDone(true);
    notify('Order placed! Complete transfer via your Malawian bank account.');
   }else{
    const result=await send<{checkout_id:string}>('/guest-orders/basket',{
     items,
     contact_name:name,
     contact_phone:normPhone,
     contact_email:email,
     delivery_location:delivery,
     payment_method:'paychangu_mobile_money',
     notes
    },'POST',{'Idempotency-Key':key});
    clearCheckoutKey('basket');
    setItems([]);
    saveBasket([]);
    setCheckoutId(result.checkout_id);
    localStorage.setItem(activeCheckoutKey,result.checkout_id);
    const chosenOp=paymentChannel==='airtel'?airtelOperator:tnmOperator;
    if(chosenOp){
     try{
      const normPayPhone=normalizePhone(momoPhone||phone);
      await send('/paychangu/initialize',{
       checkout_id:result.checkout_id,
       operator_ref_id:chosenOp,
       mobile:normPayPhone
      });
      notify(`Payment request sent to your ${paymentChannel==='airtel'?'Airtel':'TNM'} line! Approve prompt on your phone.`);
     }catch(err){
      setError((err as Error).message);
     }
    }
    setDone(true);
   }
  }catch(err){
   const failure=err as Error&{status?:number};
   if(failure.status&&failure.status<500)clearCheckoutKey('basket');
   const message=failure.message;
   setError(message);
   if(message.includes('household limit'))setBulk(rows.find(r=>r.item?.guest_limit&&message.includes(r.item.guest_limit.name))?.item||rows[0]?.item||null);
  }finally{
   setBusy(false);
  }
 }

 return <><Link className="back-link" href="/marketplace"><ArrowLeft size={16}/>Back to marketplace</Link><div className="page-heading"><div><h1>Checkout</h1><p><ShieldCheck size={16} style={{display:'inline',verticalAlign:'text-bottom',color:'var(--primary)',marginRight:5}}/>Secure eBay-style checkout · Instant household stock reservation</p></div></div>{error&&<p className="error-box" role="alert">{error}</p>}{done?(bankConfirmation?<div className="success-panel"><CheckCircle2 size={38} color="#245334"/><h2>Order Confirmed & Produce Reserved!</h2><p>Thank you, <strong>{name}</strong>. Your order is registered in the system.</p><div className="receipt-card" style={{maxWidth:540,margin:'20px auto',textAlign:'left'}}><div className="receipt-badge"><Building2 size={24}/></div><h3 style={{textAlign:'center',marginBottom:6}}>Malawian Bank Transfer</h3><p style={{textAlign:'center',fontSize:13,color:'var(--muted)',marginBottom:16}}>Order Reference: <strong>{bankConfirmation.checkoutId.slice(0,18).toUpperCase()}</strong></p><div className="receipt-details"><div className="row"><span>Order Status:</span><strong style={{color:'#2c5b20'}}>CONFIRMED (Awaiting Transfer)</strong></div><div className="row"><span>Amount Due:</span><strong>MWK {number(bankConfirmation.mwkTotal)}</strong></div><div className="row"><span>Selected Bank:</span><strong>{bankConfirmation.bankName}</strong></div>{bankConfirmation.bankAccount&&<div className="row"><span>Account/Card:</span><strong>{bankConfirmation.bankAccount}</strong></div>}<div className="row"><span>Delivery Routing:</span><strong>{delivery}</strong></div><div className="row"><span>Recipient Contact:</span><span>{name} ({phone})</span></div></div></div><div style={{background:'var(--surface-sunken)',padding:'16px',borderRadius:'8px',maxWidth:540,margin:'0 auto 20px',fontSize:'13px',lineHeight:'1.5'}}><strong>How to complete payment:</strong><p style={{margin:'6px 0 0'}}>1. Open your <strong>{bankConfirmation.bankName}</strong> app or dial *626# (Mo626).<br/>2. Transfer <strong>MWK {number(bankConfirmation.mwkTotal)}</strong> using reference <strong>{bankConfirmation.checkoutId.slice(0,18).toUpperCase()}</strong>.<br/>3. Your harvest will be routed directly to <strong>{delivery}</strong> upon settlement.</p></div><div style={{display:'flex',gap:12,justifyContent:'center',marginTop:20,flexWrap:'wrap'}}><button className="primary" onClick={()=>{try{localStorage.removeItem(activeCheckoutKey);}catch{}setCheckoutId(null);setDone(false);setBankConfirmation(null);navigate('/marketplace');}}>Continue shopping</button><button className="secondary" onClick={()=>{try{localStorage.removeItem(activeCheckoutKey);}catch{}setCheckoutId(null);setDone(false);setBankConfirmation(null);navigate('/marketplace');}}>Cancel</button></div></div>:<div className="success-panel"><CheckCircle2 size={34}/><h2>Order placed</h2>{checkoutId?<PayChanguCheckout checkoutId={checkoutId} enabled={config.capabilities?.paychangu_mobile_money!==false} notify={notify} onReset={()=>{try{localStorage.removeItem(activeCheckoutKey);}catch{}setCheckoutId(null);setDone(false);}}/>:<p>Your order is placed. Complete your payment in-app.</p>}<div style={{display:'flex',gap:12,justifyContent:'center',marginTop:20,flexWrap:'wrap'}}><button type="button" className="secondary" onClick={()=>{try{localStorage.removeItem(activeCheckoutKey);}catch{}setCheckoutId(null);setDone(false);navigate('/marketplace');}}>Return to marketplace</button><button type="button" className="text-button" onClick={()=>{try{localStorage.removeItem(activeCheckoutKey);}catch{}setCheckoutId(null);setDone(false);}}>Cancel / Start new order</button></div></div>):items.length?<div className="ebay-checkout-grid"><div><div className="ebay-section-card" style={{cursor:savedAddr?.delivery?'pointer':undefined}} onClick={()=>{if(savedAddr?.delivery&&!editingDelivery)setEditingDelivery(true);}}><div className="ebay-section-header"><h2><MapPin size={18} color="var(--primary)"/> Shipping address</h2>{savedAddr?.delivery&&<button type="button" className="ebay-link-btn" onClick={(e)=>{e.stopPropagation();setEditingDelivery(true);}}>Change</button>}</div>{savedAddr?.delivery?<div style={{fontSize:'14px',lineHeight:'1.6'}}><p style={{margin:'0 0 2px',fontWeight:700}}>{name}</p><p style={{margin:'0 0 2px',color:'var(--muted)'}}>{delivery}</p><p style={{margin:'0',fontSize:'13px',color:'var(--muted)'}}>{phone} · {email}</p>{notes&&<p style={{margin:'4px 0 0',fontSize:'12px',fontStyle:'italic',color:'var(--muted)'}}>Note: {notes}</p>}</div>:<button type="button" className="ebay-link-btn" style={{fontSize:'14px',padding:'10px 0'}} onClick={()=>setEditingDelivery(true)}><MapPin size={15}/> Add shipping address</button>}</div>{editingDelivery&&<div className="ebay-modal-backdrop" onClick={cancelDeliveryEdit}><div className="ebay-modal-card" onClick={e=>e.stopPropagation()}><div className="ebay-modal-header"><h3>Shipping address</h3><button type="button" className="icon-button" aria-label="Close" onClick={cancelDeliveryEdit}><X size={20}/></button></div><div style={{display:'grid',gap:'12px'}}><label className="field"><span>Full name</span><input name="name" required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Mary Phiri"/></label><label className="field"><span>Phone number</span><input name="phone" required type="tel" value={phone} onChange={e=>{setPhone(e.target.value);if(!momoPhone)setMomoPhone(e.target.value);}} placeholder="e.g. 0881522474, 265 881522474, or +265991234567"/><small>Accepts 0881522474, 265 881522474 or +265 formats.</small></label><label className="field"><span>Email</span><input name="email" required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="e.g. mary@example.com"/></label><label className="field"><span>Delivery location (for routing)</span><input name="delivery" required minLength={3} maxLength={200} value={delivery} onChange={e=>setDelivery(e.target.value)} placeholder="e.g. Area 47, Sector 3, Lilongwe" autoComplete="street-address"/></label><label className="field"><span>Delivery notes (optional)</span><textarea name="notes" maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Near the main gate"/></label><div style={{display:'flex',gap:'10px',marginTop:4}}><button type="button" className="secondary" style={{flex:1}} onClick={cancelDeliveryEdit}>Cancel</button><button type="button" className="primary" style={{flex:2}} onClick={()=>{if(!name.trim()||!phone.trim()||!email.trim()||!delivery.trim()){setError('Please fill in all required delivery fields.');return;}const addr:DeliveryAddress={name,phone,email,delivery,notes};saveSavedDelivery(addr);setSavedAddr(addr);setEditingDelivery(false);setError('');}}><MapPin size={16}/> Save shipping address</button></div><p style={{fontSize:'11px',color:'var(--muted)',margin:'4px 0 0',textAlign:'center'}}>Your address is saved locally and recalled every time.</p></div></div></div>}<div className="ebay-section-card"><div className="ebay-section-header"><h2><Package size={18} color="var(--primary)"/> 2. Review items and delivery</h2><span style={{fontSize:'12px',color:'var(--muted)'}}>{items.length} {items.length===1?'item':'items'}</span></div>{rows.map(({line,item})=>{const unitPrice=item?(item.price_minor!=null?item.price_minor/100:item.price):0;const lineMinor=item?(item.price_minor!=null?Math.round(item.price_minor*line.quantity):Math.round(item.price*100*line.quantity)):0;const lineTotal=lineMinor/100;return <div className="ebay-cart-item-row" key={line.listing_id}>{item?.image&&<img className="ebay-cart-item-img" src={item.image} alt={item?.title||''}/>}<div className="ebay-cart-item-info">{item?.guest_limit?.unit===(item?.sale_unit||'kg')&&item.guest_limit.max<=10&&<span className="ebay-cart-item-badge">LIMITED STOCK</span>}<p className="ebay-cart-item-title">{item?.title||'Unavailable produce'}</p><p className="ebay-cart-item-desc">{item?.crop_category||''}{item?.guest_limit?.unit===(item?.sale_unit||'kg')?` · Household limit: ${item.guest_limit.max} ${item.guest_limit.unit}`:item?' · Order Request required':' · Remove this item'}</p><p className="ebay-cart-item-price">{money(lineTotal)}<span style={{fontSize:'13px',fontWeight:400,color:'var(--muted)'}}>{line.quantity!==1?` (${money(unitPrice)} / ${item?.sale_unit||'kg'})`:` / ${item?.sale_unit||'kg'}`}</span></p><p className="ebay-cart-item-delivery"><Leaf size={13}/> Free delivery routing</p><div className="ebay-cart-actions"><div className="ebay-stepper"><button type="button" aria-label="Decrease quantity" onClick={()=>{const step=item?.sale_unit==='kg'?0.1:1;const next=Math.max(step,line.quantity-step);change(line.listing_id,Number(next.toFixed(1)));}}>{line.quantity<=(item?.sale_unit==='kg'?0.1:1)?<Trash2 size={14}/>:<Minus size={14}/>}</button><span>{line.quantity}</span><button type="button" aria-label="Increase quantity" onClick={()=>{const step=item?.sale_unit==='kg'?0.1:1;change(line.listing_id,Number((line.quantity+step).toFixed(1)));}}><Plus size={14}/></button></div><button type="button" className="ebay-link-btn remove" onClick={()=>change(line.listing_id,0)}>Remove</button></div></div></div>;})}){over?.item&&<div className="error-box" role="alert" style={{marginTop:12}}><strong>{over.item.title}</strong> exceeds its household limit of {over.item.guest_limit?.max} {over.item.guest_limit?.unit}. Standard checkout is capped for household sizing. <button type="button" className="text-button" onClick={()=>setBulk(over.item!)}>Use Order Request</button></div>}</div><div className="ebay-section-card"><div className="ebay-section-header"><h2><CreditCard size={18} color="var(--primary)"/> 3. Pay with</h2></div><p style={{fontSize:'13px',color:'var(--muted)',marginBottom:14}}>Select payment option (click to choose):</p><div className="payment-cards-horizontal"><div className={`payment-card-btn airtel ${paymentChannel==='airtel'?'selected':''}`} onClick={()=>setPaymentChannel('airtel')}>{paymentChannel==='airtel'&&<span className="payment-card-check">✓</span>}<div className="payment-card-icon"><Smartphone size={20}/></div><span className="payment-card-title">Airtel Money</span><span className="payment-card-sub">099 / 098 Line</span></div><div className={`payment-card-btn tnm ${paymentChannel==='tnm'?'selected':''}`} onClick={()=>setPaymentChannel('tnm')}>{paymentChannel==='tnm'&&<span className="payment-card-check">✓</span>}<div className="payment-card-icon"><Smartphone size={20}/></div><span className="payment-card-title">TNM Mpamba</span><span className="payment-card-sub">088 / 089 Line</span></div><div className={`payment-card-btn bank ${paymentChannel==='bank'?'selected':''}`} onClick={()=>setPaymentChannel('bank')}>{paymentChannel==='bank'&&<span className="payment-card-check">✓</span>}<div className="payment-card-icon"><Building2 size={20}/></div><span className="payment-card-title">Malawian Bank</span><span className="payment-card-sub">Mo626 / Direct</span></div></div>{(paymentChannel==='airtel'||paymentChannel==='tnm')&&<div style={{background:'var(--surface-sunken)',padding:'16px',borderRadius:'8px',marginTop:14,border:'1px solid var(--border)'}}><label className="field" style={{margin:0}}><span>{paymentChannel==='airtel'?'Airtel':'TNM'} Mobile Number for PayChangu</span><input type="tel" value={momoPhone||phone} onChange={e=>setMomoPhone(e.target.value)} placeholder="e.g. 0881522474, 0991112200, or +265..." required/><small>Accepts 0881522474, 265 881522474, or +265 formats.</small></label><p style={{fontSize:'12px',color:'var(--muted)',margin:'8px 0 0'}}>You will receive a prompt on your phone to approve <strong>MWK {number(estMwkTotal)}</strong>.</p></div>}{paymentChannel==='bank'&&<div style={{background:'var(--surface-sunken)',padding:'16px',borderRadius:'8px',marginTop:14,border:'1px solid var(--border)',display:'grid',gap:'12px'}}><label className="field" style={{margin:0}}><span>Select your Malawian Bank (click to choose)</span><div className="bank-cards-grid">{[{id:'National Bank of Malawi',name:'National Bank',sub:'Mo626 / Direct'},{id:'Standard Bank Malawi',name:'Standard Bank',sub:'247 Online'},{id:'FDH Bank',name:'FDH Bank',sub:'FDH Mobile'},{id:'NBS Bank',name:'NBS Bank',sub:'EazyMobile'},{id:'Ecobank Malawi',name:'Ecobank',sub:'Omni Lite'},{id:'Centenary Bank',name:'Centenary Bank',sub:'Direct Transfer'}].map(b=><div key={b.id} className={`bank-card-tile ${bankName===b.id?'selected':''}`} onClick={()=>setBankName(b.id)}><Building2 size={16} style={{marginBottom:4,color:bankName===b.id?'#3730a3':'inherit'}}/><span>{b.name}</span><small>{b.sub}</small></div>)}</div></label><label className="field" style={{margin:0}}><span>Bank Account / Debit Card Number (optional)</span><input placeholder="e.g. 1004589234 or card number" value={bankAccount} onChange={e=>setBankAccount(e.target.value)}/></label><p style={{fontSize:'12px',color:'var(--muted)',margin:'0'}}>Selected: <strong>{bankName}</strong>. Stock is reserved immediately. You will receive transfer / Mo626 payment instructions with your order reference.</p></div>}</div></div><div><div className="ebay-summary-card"><h2 style={{fontSize:'18px',margin:'0 0 16px'}}>Order summary</h2><div className="ebay-summary-line"><span>Items ({items.reduce((s,i)=>s+i.quantity,0)})</span><span>MWK {number(estMwkTotal)}</span></div>{config.currency!=='MWK'&&<div className="ebay-summary-line" style={{fontSize:'11px',color:'var(--muted)'}}><span>Original currency</span><span>{config.currency} {number(totalMajor)}</span></div>}<div className="ebay-summary-line"><span>Delivery routing</span><span style={{color:'var(--forest)',fontWeight:600}}>Free</span></div><div className="ebay-summary-total"><span>Total to pay</span><span>MWK {number(estMwkTotal)}</span></div><button type="button" className="primary full-width" style={{marginTop:18,padding:'14px',fontSize:'16px',fontWeight:700,display:'flex',justifyContent:'center',alignItems:'center',gap:8}} disabled={busy||!!over||rows.some(r=>!r.item)} onClick={()=>void submit()}><Lock size={16}/>{busy?'Placing order…':'Confirm and pay'}</button><div style={{marginTop:18,paddingTop:14,borderTop:'1px solid var(--border)',display:'grid',gap:'8px',fontSize:'12px',color:'var(--muted)'}}><div style={{display:'flex',alignItems:'center',gap:6}}><ShieldCheck size={15} color="var(--primary)"/><span>Wirefen Buyer Protection & Verification</span></div><div style={{display:'flex',alignItems:'center',gap:6}}><Package size={15} color="var(--primary)"/><span>Instant stock reservation & direct routing</span></div></div></div></div></div>:<div className="empty"><h2>Your basket is empty</h2><p>Browse verified produce to add your first item.</p><Link className="button primary" href="/marketplace">Explore produce</Link></div>}{bulk&&<BulkModal item={bulk} user={user} signIn={signIn} close={()=>setBulk(null)} notify={notify}/>}</>;
}

function PayChanguCheckout({checkoutId,enabled,notify,onReset}:{checkoutId:string;enabled:boolean;notify:(s:string)=>void;onReset:()=>void}){
 const [order,setOrder]=useState<{status:string;payment_status:string;currency:string;total_minor:number;mwk_total?:number;exchange_rate?:number}|null>(null),[operators,setOperators]=useState<Array<{ref_id:string;name:string}>>([]),[operator,setOperator]=useState(''),[mobile,setMobile]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;async function refresh(){try{const result=await api<{checkout_id:string;status:string;payment_status:string;currency:string;total_minor:number;mwk_total?:number;exchange_rate?:number}>('/guest-orders/'+encodeURIComponent(checkoutId)+'/payment-status');if(active)setOrder(result);}catch(e){if(active)setError((e as Error).message);}}void refresh();const timer=setInterval(refresh,5000);return()=>{active=false;clearInterval(timer);};},[checkoutId]);
 useEffect(()=>{if(!enabled)return;let active=true;api<{data:Array<{ref_id:string;name:string}>}>('/paychangu/operators').then(result=>{if(active){setOperators(result.data);setOperator(result.data[0]?.ref_id||'');}}).catch(e=>{if(active)setError((e as Error).message);});return()=>{active=false;};},[enabled]);
 async function startPayment(){setBusy(true);setError('');try{const normMobile=normalizePhone(mobile);await send('/paychangu/initialize',{checkout_id:checkoutId,operator_ref_id:operator,mobile:normMobile});setOrder(current=>current?{...current,payment_status:'pending'}:current);notify('Approve the PayChangu payment request on your phone.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!order)return <p>Loading your order status…</p>;
 const mwkAmount = order.mwk_total || (order.currency === 'MWK' ? Math.round(order.total_minor / 100) : Math.round((order.total_minor / 100) * 1732.26));
 if(order.payment_status==='paid')return <div className="success-panel"><CheckCircle2 size={34}/><h2>Payment received</h2><p>Your order for {order.currency} {number(order.total_minor/100)} {order.currency!=='MWK'?`(MWK ${number(mwkAmount)}) `:''}has been paid in full.</p><button className="secondary" onClick={onReset}>Start another order</button></div>;
 if(order.status==='Cancelled')return <p>This order was cancelled. Contact Wirefen if you need help.</p>;
 if(order.status!=='Confirmed')return <><p>This order is awaiting review. Payment will be available once it is confirmed.</p>{error&&<p className="error-box" role="alert">{error}</p>}<button type="button" className="secondary" style={{marginTop:12}} onClick={onReset}>Cancel / Start new order</button></>;
 if(order.payment_status==='pending')return <><div className="info-box"><p><strong>Payment request sent!</strong> PayChangu has sent a payment request to your phone ({mobile || 'your number'}). Approve it on your phone; this page will update automatically once verified.</p></div>{error&&<p className="error-box" role="alert">{error}</p>}<button type="button" className="secondary" style={{marginTop:12}} onClick={onReset}>Cancel payment / Change method</button></>;
 return <div style={{padding:'12px 0'}}><p>Pay in-app with Malawi mobile money: <strong>MWK {number(mwkAmount)}</strong>{order.currency!=='MWK'&&<span style={{fontSize:'13px',color:'var(--muted)'}}> (converted from {order.currency} {number(order.total_minor/100)})</span>}</p>{error&&<p className="error-box" role="alert">{error}</p>}{!enabled?<p>PayChangu is not configured for this marketplace.</p>:operators.length?<form onSubmit={e=>{e.preventDefault();void startPayment();}}><label className="field"><span>Select Mobile-Money Operator (click to choose)</span><div className="payment-cards-horizontal" style={{margin:'8px 0'}}>{operators.map(item=>{const isAirtel=item.name.toLowerCase().includes('airtel');return <div key={item.ref_id} className={`payment-card-btn ${isAirtel?'airtel':'tnm'} ${operator===item.ref_id?'selected':''}`} onClick={()=>setOperator(item.ref_id)} style={{minHeight:70,padding:'10px 8px'}}>{operator===item.ref_id&&<span className="payment-card-check">✓</span>}<div className="payment-card-icon" style={{width:28,height:28,marginBottom:4}}><Smartphone size={16}/></div><span className="payment-card-title" style={{fontSize:12}}>{item.name}</span></div>;})}</div></label><label className="field"><span>Malawi mobile number</span><input type="tel" autoComplete="tel" placeholder="e.g. 0881522474, 265 881522474, or +265..." value={mobile} onChange={e=>setMobile(e.target.value)} required/></label><button className="primary full-width" disabled={busy}>{busy?'Connecting to PayChangu…':`Pay MWK ${number(mwkAmount)} by mobile money`}</button></form>:<p>Loading available operators…</p>}</div>;
}

export function BulkModal({item,user,signIn,close,notify}:{item:Listing|null;user:User|null;signIn:()=>void;close:()=>void;notify:(s:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget);setBusy(true);setError('');try{const qty=Number(d.get('quantity'));
    const dates=String(d.get('dates')||'');
    const notes=String(d.get('notes')||'');
    if(item?.id&&user?.role==='Buyer'){
      try{
        await send('/orders',{
          listing_id:item.id,
          volume:qty,
          delivery_location:readSavedDelivery()?.delivery||'Delivery location pending',
          notes:notes?(`${dates?'Target dates: '+dates+'. ':''}${notes}`):(dates?'Target dates: '+dates:'Order request from catalogue')
        });
      }catch{}
    }
    await send('/bulk-orders',{frequency:d.get('frequency'),produce_type:d.get('produce'),target_quantity:qty,quantity_unit:d.get('unit'),delivery_dates:dates,target_price:Number(d.get('price')),contact_name:d.get('name'),contact_phone:d.get('phone'),contact_email:d.get('email'),notes:notes});
    notify('Order Request submitted.');close();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <dialog ref={dialog} className="bulk-dialog" onCancel={close}><button className="dialog-close icon-button" aria-label="Close order request" onClick={close}><X size={20}/></button><h2>Order Request</h2><p style={{margin:'4px 0 16px',fontSize:'14px',color:'var(--muted)'}}>Standard checkout enforces household purchase limits based on official produce guidelines. For commercial or larger orders, please submit an Order Request.</p>{!user?<><p>Sign in or create an account to submit and manage an Order Request.</p><button className="primary" onClick={()=>{close();signIn();}}>Sign in or create account</button></>:user.role!=='Buyer'?<p>Use a buyer account to submit an Order Request.</p>:<form onSubmit={submit}><p>Tell us what you need. Wirefen will contact you to agree the order and delivery routing.</p>{error&&<p role="alert" className="error-box">{error}</p>}<label className="field"><span>Order frequency</span><select name="frequency" required><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></label><label className="field"><span>Produce type</span><input name="produce" required defaultValue={item?.title||''}/></label><div className="form-grid"><label className="field"><span>Target quantity</span><input name="quantity" type="number" required min="0.1" step="0.1"/></label><label className="field"><span>Unit</span><select name="unit" defaultValue={item?.guest_limit?.unit||'tonnes'}>{['kg','tonnes','cobs','heads','bundles','fruits','bunches','canes'].map(u=><option key={u}>{u}</option>)}</select></label></div><label className="field"><span>Target delivery dates</span><input name="dates" required placeholder="e.g. 20–25 November"/></label><label className="field"><span>Target price per unit</span><input name="price" type="number" required min="0.01" step="0.01"/></label><label className="field"><span>Contact name</span><input name="name" required defaultValue={user.name}/></label><label className="field"><span>Phone</span><input name="phone" type="tel" required defaultValue={user.phone}/></label><label className="field"><span>Email</span><input name="email" type="email" required defaultValue={user.email||''}/></label><label className="field"><span>Additional notes</span><textarea name="notes" maxLength={2000}/></label><button className="primary" disabled={busy}>{busy?'Sending…':'Submit Order Request'}</button></form>}</dialog>;
}

export function BulkRequests({user,signIn,notify}:{user:User|null;signIn:()=>void;notify:(s:string)=>void}){
 const [rows,setRows]=useState<any[]>([]),[open,setOpen]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(user?.role==='Buyer'||user?.role==='Admin')api<any[]>('/bulk-orders').then(setRows).catch(e=>setError(e.message));},[user]);
 async function update(id:string,status:string){try{await send('/bulk-orders/'+id,{status},'PATCH');setRows(rows.map(r=>r.id===id?{...r,status}:r));}catch(e){setError((e as Error).message);}}
 return <section className="settings-section"><h2>Order requests</h2><p>For quantities above the household limit or repeated deliveries.</p>{error&&<p className="error-box" role="alert">{error}</p>}{user?.role==='Buyer'?<button className="primary" onClick={()=>setOpen(true)}>New Order Request</button>:!user?<button className="primary" onClick={signIn}>Sign in for Order Requests</button>:null}{rows.length>0&&<div className="table-wrap"><table><thead><tr><th>Produce</th><th>Quantity</th><th>Delivery dates</th><th>Frequency</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.produce_type}</td><td>{r.target_quantity} {r.quantity_unit}</td><td>{r.delivery_dates}</td><td>{r.frequency==='one_time'?'One-time':'Recurring'}</td><td>{r.status}</td><td>{user?.role==='Admin'?<select aria-label={'Status for '+r.produce_type} value={r.status} onChange={e=>update(r.id,e.target.value)}>{['New','In review','Contacted','Closed','Cancelled'].map(s=><option key={s}>{s}</option>)}</select>:r.status!=='Cancelled'&&r.status!=='Closed'?<button className="text-button" onClick={()=>update(r.id,'Cancelled')}>Cancel request</button>:null}</td></tr>)}</tbody></table></div>}{open&&<BulkModal item={null} user={user} signIn={signIn} close={()=>setOpen(false)} notify={notify}/>}</section>;
}

export function AdminListingReport(){const [rows,setRows]=useState<Listing[]>([]),[total,setTotal]=useState(0),[units,setUnits]=useState<Array<{unit:string;available:number}>>([]),[count,setCount]=useState(0),[region,setRegion]=useState(''),[country,setCountry]=useState(''),[locality,setLocality]=useState(''),[error,setError]=useState('');useEffect(()=>{const q=new URLSearchParams();if(country)q.set('country_code',country);if(region)q.set('region',region);if(locality)q.set('locality',locality);api<{listings:Listing[];total_available_kg:number;stock_by_unit:Array<{unit:string;available:number}>;listing_count:number}>('/admin/listings?'+q).then(r=>{setRows(r.listings);setTotal(r.total_available_kg);setUnits(r.stock_by_unit||[]);setCount(r.listing_count);}).catch(e=>setError(e.message));},[country,region,locality]);return <section className="settings-section"><h2>Registered produce by location</h2><p>Private supplier, location and stock records for Wirefen staff.</p><div className="form-grid"><label className="field"><span>Country code</span><input value={country} maxLength={2} onChange={e=>setCountry(e.target.value)}/></label><label className="field"><span>District / region</span><input value={region} onChange={e=>setRegion(e.target.value)}/></label><label className="field"><span>Locality / ward</span><input value={locality} onChange={e=>setLocality(e.target.value)}/></label></div>{error&&<p className="error-box" role="alert">{error}</p>}<p><strong>{count}</strong> listings · <strong>{number(total)} kg</strong> registered · {units.filter(u=>u.unit!=='kg').map(u=><span key={u.unit}><strong>{number(u.available)} {u.unit}</strong> registered · </span>)}</p><div className="table-wrap"><table><thead><tr><th>Produce</th><th>Farm</th><th>Location</th><th>Available</th><th>Verification</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.title}</td><td>{r.farm_name}</td><td>{r.location}</td><td>{number(r.available_volume)} {r.sale_unit||'kg'}</td><td>{r.verification_status}</td></tr>)}</tbody></table></div></section>;}
export function AdminGuestOrders(){
 const [rows,setRows]=useState<any[]>([]),[error,setError]=useState('');
 useEffect(()=>{api<any[]>('/admin/guest-orders').then(setRows).catch(e=>setError(e.message));},[]);
 async function update(id:string,status:string){try{await send('/admin/guest-orders/'+id,{status},'PATCH');setRows(rows.map(r=>r.id===id?{...r,status}:r));}catch(e){setError((e as Error).message);}}
 async function collect(id:string){try{await send('/admin/guest-orders/'+id+'/collect-payment',{});setRows(rows.map(r=>r.id===id?{...r,payment_status:'paid'}:r));}catch(e){setError((e as Error).message);}}
 return <section className="settings-section">
  <h2>Guest checkout orders</h2><p>Household stock is reserved at checkout. In-app PayChangu payments settle after provider verification.</p>
  {error&&<p role="alert" className="error-box">{error}</p>}
  {rows.length?<div className="table-wrap"><table><thead><tr><th>Produce</th><th>Quantity</th><th>Guest contact</th><th>Delivery route</th><th>Payment</th><th>Status</th></tr></thead><tbody>
   {rows.map(r=><tr key={r.id}>
    <td>{r.items?.map((item:any)=><span key={item.id}>{item.title}<small>{item.produce_id}</small></span>)}</td>
    <td>{r.items?.map((item:any)=><span key={item.id}>{item.quantity} {item.quantity_unit}<br/></span>)}</td>
    <td>{r.contact_name}<small>{r.contact_phone} · {r.contact_email}</small></td><td>{r.delivery_location}</td>
    <td>{r.total_minor!=null?`${r.currency||'ZAR'} ${number(Number(r.total_minor)/100)}`:'Price pending'}
     <small>{r.payment_method==='paychangu_mobile_money'?'PayChangu mobile money':'In-app payment'} · {r.payment_status==='paid'?'Paid':r.payment_status==='pending'?'Payment pending':r.payment_status==='failed'?'Payment failed':'Unpaid'}</small>
    </td>
    <td><select aria-label={'Status for '+r.contact_name} value={r.status} onChange={e=>update(r.id,e.target.value)}>{['New','In review','Confirmed','Cancelled'].map(s=><option key={s}>{s}</option>)}</select></td>
   </tr>)}
  </tbody></table></div>:<p>No guest orders yet.</p>}
 </section>;
}


export function ListingOrderModal({item,user,initialQuantity=1,signIn,close,notify}:{item:Listing|null;user:User|null;initialQuantity?:number;signIn:()=>void;close:()=>void;notify:(s:string)=>void}){
  if(!item)return null;
  const dialog=useRef<HTMLDialogElement>(null);
  const [quantity,setQuantity]=useState(initialQuantity>0?String(initialQuantity):'1');
  const [location,setLocation]=useState(()=>readSavedDelivery()?.delivery||'');
  const [notes,setNotes]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);

  const q=Number(quantity);
  const unitPrice=item.price_minor!=null?item.price_minor/100:item.price;
  const total=Number.isFinite(q)&&q>0?q*unitPrice:0;

  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!item)return;
    if(!user){close();signIn();return;}
    if(user.role!=='Buyer'){setError('Sign in with a Buyer account to send an order request to the farmer.');return;}
    if(!Number.isFinite(q)||q<=0){setError('Enter a valid quantity.');return;}
    if(!location.trim()||location.trim().length<3){setError('Please enter a delivery location (at least 3 characters).');return;}
    setBusy(true);setError('');
    try{
      await send('/orders',{
        listing_id:item.id,
        volume:q,
        delivery_location:location.trim(),
        notes:notes.trim()
      });
      notify(`Order request for ${item.title} submitted to ${item.farm_name||'farmer'}!`);
      close();
      navigate('/requests');
    }catch(err){
      setError((err as Error).message);
    }finally{
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="bulk-dialog" onCancel={close}>
      <button className="dialog-close icon-button" aria-label="Close order request" onClick={close}><X size={20}/></button>
      <h2>Order Request from Farmer</h2>
      <p style={{margin:'4px 0 16px',fontSize:'14px',color:'var(--muted)'}}>
        Send a direct order request to <strong>{item.farm_name||'the grower'}</strong> for fresh {item.title}. The farmer will review and approve or deny your request.
      </p>
      {!user?(
        <div style={{padding:'12px 0'}}>
          <p style={{marginBottom:14}}>Sign in or create a buyer account to submit an order request directly to the farmer.</p>
          <button className="primary" onClick={()=>{close();signIn();}}>Sign in or create account</button>
        </div>
      ):user.role!=='Buyer'?(
        <div className="error-box">You are currently signed in as a {user.role}. Please sign in with a Buyer account to send an order request.</div>
      ):(
        <form onSubmit={submit}>
          {error&&<p role="alert" className="error-box">{error}</p>}
          <div style={{background:'var(--surface-sunken)',padding:'12px 16px',borderRadius:'8px',marginBottom:'16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <strong>{item.title}</strong>
              <small style={{display:'block',color:'var(--muted)'}}>{item.farm_name} · {item.location}</small>
            </div>
            <div style={{textAlign:'right'}}>
              <strong style={{color:'var(--forest, #2d6a4f)'}}>{item.currency||'MWK'} {formatNumber(unitPrice)}</strong>
              <small style={{display:'block',color:'var(--muted)'}}>per {item.sale_unit||'kg'}</small>
            </div>
          </div>
          <label className="field">
            <span>Requested quantity ({item.sale_unit||'kg'})</span>
            <input type="number" required min={item.sale_unit==='kg'?'0.1':'1'} max={item.available_volume||100000} step={item.sale_unit==='kg'?'0.1':'1'} value={quantity} onChange={e=>setQuantity(e.target.value)}/>
            {item.available_volume!=null&&<small>Available supply: {formatNumber(item.available_volume)} {item.sale_unit||'kg'}</small>}
          </label>
          <label className="field">
            <span>Delivery location (strictly for delivery routing)</span>
            <input required minLength={3} maxLength={200} value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Area 47, Sector 3, Lilongwe"/>
          </label>
          <label className="field">
            <span>Notes or preferred delivery dates (optional)</span>
            <textarea maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Preferred delivery date or collection arrangement"/>
          </label>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderTop:'1px solid var(--border)',marginTop:'8px'}}>
            <span style={{fontSize:'13px',color:'var(--muted)'}}>Estimated total:</span>
            <strong style={{fontSize:'16px',color:'var(--forest, #2d6a4f)'}}>{item.currency||'MWK'} {formatNumber(Math.round(total))}</strong>
          </div>
          <button className="primary full-width" disabled={busy} style={{marginTop:'12px',padding:'12px',display:'flex',justifyContent:'center',alignItems:'center',gap:'8px'}}>
            <ClipboardList size={16}/>{busy?'Sending request…':'Send Order Request to Farmer'}
          </button>
        </form>
      )}
    </dialog>
  );
}
