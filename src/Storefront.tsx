import {navigate} from './navigation';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {formatMoney,type CurrencyState} from './currency';
import {ApprovedRequests} from './ApprovedRequests';
import {ArrowLeft,ClipboardList,ArrowRight,ArrowUpRight,Bookmark,Building2,Camera,Check,CheckCircle2,CreditCard,Info,Leaf,Lock,MapPin,Minus,Package,Plus,Search,ShieldCheck,Smartphone,Trash2,X,LayoutGrid,Tractor,Sprout} from 'lucide-react';
import {api,send,date,number as formatNumber,type Config,type Listing,type User} from './api';

type Props={listing:Listing;money:(n:number,currency?:string)=>string;saved:boolean;toggleSave:()=>void;notify?:(s:string)=>void};
type BasketLine={listing_id:string;quantity:number};
const number=(value?:number)=>value==null?'Unavailable':new Intl.NumberFormat('en-ZA',{maximumFractionDigits:2}).format(value);
import {normalizePhone,isValidPhone,isValidMalawiMobile} from '../shared/phone.mjs';

export type DeliveryAddress={name:string;phone:string;email:string;delivery:string;notes?:string};
export const savedDeliveryKey='wirefen-saved-delivery-v1';
export function readSavedDelivery():DeliveryAddress|null{if(typeof window==='undefined')return null;try{const raw=localStorage.getItem(savedDeliveryKey);return raw?JSON.parse(raw):{name:'Vitumbiko Shaba',phone:'+265992047025',email:'vitumbikoshaba0@gmail.com',delivery:'area 76',notes:'main mall'};}catch{return null;}}
export function saveSavedDelivery(d:DeliveryAddress){if(typeof window==='undefined')return;try{localStorage.setItem(savedDeliveryKey,JSON.stringify(d));window.dispatchEvent(new Event('wirefen-delivery-updated'));}catch{}}

const basketKey='wirefen-basket-v1';
const activeCheckoutKey='wirefen-active-paychangu-checkout-v1';
const checkoutKey=(scope:string)=>{const keyName=`wirefen-checkout-${scope}`;let key=localStorage.getItem(keyName);if(!key){key=crypto.randomUUID();localStorage.setItem(keyName,key);}return key;};
const clearCheckoutKey=(scope:string)=>localStorage.removeItem(`wirefen-checkout-${scope}`);
const validCheckoutId=(value:string|null)=>value&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:null;
function readActiveCheckout(){
 const linked=validCheckoutId(new URLSearchParams(window.location.search).get('checkout'));
 if(linked)return linked;
 try{return validCheckoutId(localStorage.getItem(activeCheckoutKey));}catch{return null;}
}
function rememberCheckout(id:string){
 try{localStorage.setItem(activeCheckoutKey,id);}catch{}
 const url=new URL(window.location.href);url.searchParams.set('checkout',id);
 window.history.replaceState(window.history.state,'',url.pathname+url.search);
}
function forgetCheckout(){
 try{localStorage.removeItem(activeCheckoutKey);}catch{}
 const url=new URL(window.location.href);url.searchParams.delete('checkout');
 window.history.replaceState(window.history.state,'',url.pathname+url.search);
}
function readBasket():BasketLine[]{try{const rows=JSON.parse(localStorage.getItem(basketKey)||'[]');return Array.isArray(rows)?rows.filter((r:BasketLine)=>typeof r.listing_id==='string'&&Number.isFinite(r.quantity)&&r.quantity>0):[];}catch{return [];}}
function saveBasket(rows:BasketLine[]){localStorage.setItem(basketKey,JSON.stringify(rows));window.dispatchEvent(new Event('wirefen-basket'));}
function addToBasket(id:string,quantity:number){const rows=readBasket(),current=rows.find(r=>r.listing_id===id);if(current)current.quantity+=quantity;else rows.push({listing_id:id,quantity});saveBasket(rows);}
export function useBasketCount(){const [count,setCount]=useState(()=>readBasket().length);useEffect(()=>{const refresh=()=>setCount(readBasket().length);window.addEventListener('wirefen-basket',refresh);return()=>window.removeEventListener('wirefen-basket',refresh);},[]);return count;}
export function StorefrontCard({listing:l,money,saved,toggleSave,notify}:Props){
  const price=l.price_minor==null?l.price:l.price_minor/100;
  const photoCount=(l.images&&l.images.length)?l.images.length:1;
  return <article className="produce-card" role="button" tabIndex={0} onClick={()=>navigate('/produce/'+l.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();navigate('/produce/'+l.id);}}}>
    <div className="produce-image">
      <Link href={'/produce/'+l.id} tabIndex={-1} aria-hidden="true" onClick={e=>e.stopPropagation()}>
        <img src={l.image} alt="" loading="lazy"/>
      </Link>
      <span className="produce-category">{l.crop_category}</span>
      {photoCount>1&&(
        <span style={{position:'absolute',bottom:8,left:8,background:'rgba(0,0,0,0.68)',color:'#fff',padding:'2px 8px',borderRadius:12,fontSize:11,fontWeight:600,display:'inline-flex',alignItems:'center',gap:4,backdropFilter:'blur(4px)'}}>
          <Camera size={12}/>{photoCount}
        </span>
      )}
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
 const [marketTab,setMarketTab]=useState<'all'|'mine'>(()=>{
  if(typeof window!=='undefined'){
   const tab=new URLSearchParams(window.location.search).get('tab');
   if(tab==='mine')return 'mine';
  }
  return 'all';
 });
 const [listings,setListings]=useState<Listing[]>([]),[search,setSearch]=useState(''),[category,setCategory]=useState('All produce'),[sort,setSort]=useState('recent'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[page,setPage]=useState(1),[pages,setPages]=useState(1),[total,setTotal]=useState(0);

 useEffect(()=>{
  const sync=()=>{
   const tab=new URLSearchParams(window.location.search).get('tab');
   if(tab==='mine')setMarketTab('mine');
   else if(tab==='all')setMarketTab('all');
  };
  window.addEventListener('popstate',sync);
  return()=>window.removeEventListener('popstate',sync);
 },[]);

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
 const changeTab=(tab:'all'|'mine')=>{
  if(tab==='mine'&&!user){signIn();return;}
  setMarketTab(tab);
  setPage(1);
  if(typeof window!=='undefined'){
   const url=new URL(window.location.href);
   if(tab==='mine')url.searchParams.set('tab','mine');
   else url.searchParams.delete('tab');
   window.history.replaceState(window.history.state,'',url.pathname+url.search);
  }
 };
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
 <div className="catalog-heading"><h2>{marketTab==='mine'?'My farm produce':'Explore produce'}</h2><span>{config.market}</span></div><div className="catalog-toolbar"><label className="search-field"><Search size={18}/><span className="sr-only">Search produce</span><input value={search} onChange={e=>changeSearch(e.target.value)} placeholder="Search produce"/></label><label className="sort-field"><span className="sr-only">Category</span><select value={category} onChange={e=>changeCategory(e.target.value)}>{['All produce','Vegetables','Fruits','Grains','Tubers','Legumes','Beverages & Nuts'].map(x=><option key={x}>{x}</option>)}</select></label><label className="sort-field"><span className="sr-only">Sort</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Recently listed</option><option value="price">Price: low to high</option><option value="harvest">Latest harvest</option></select></label></div><p className="results-bar" aria-live="polite">{loading?'Loading produce…':`${savedOnly?shown.length:total} available listings`}</p>{error&&<p role="alert" className="error-box">{error}</p>}{!loading&&(shown.length?<div className="produce-grid">{shown.map(l=><StorefrontCard key={l.id} listing={l} money={money} saved={saved.includes(l.id)} toggleSave={()=>toggleSave(l.id)} notify={notify}/>)}</div>:marketTab==='mine'?<div className="empty" style={{padding:'50px 20px'}}><Sprout size={36} aria-hidden="true"/><h2>No produce listed yet</h2><p>You haven’t published any harvest listings yet. Share your crops with buyers across the marketplace.</p>{user?.role==='Farmer'?<Link className="button primary" href="/new-listing">List your produce <ArrowRight size={16}/></Link>:<button type="button" className="button primary" onClick={signIn}>Sign in to list produce</button>}</div>:<p>No matching produce is available. Try another search.</p>)}{!savedOnly&&pages>1&&<nav className="pagination" aria-label="Marketplace pages"><button className="secondary" disabled={page<=1||loading} onClick={()=>setPage(value=>value-1)}>Previous</button><span>Page {page} of {pages}</span><button className="secondary" disabled={page>=pages||loading} onClick={()=>setPage(value=>value+1)}>Next</button></nav>}<div className="bottom-callout"><div><h3>Planning a larger order?</h3><p>Send your quantity and delivery dates to the Wirefen team.</p></div>{user?<Link href="/requests" className="button secondary">Bulk order request</Link>:<button className="secondary" onClick={signIn}>Sign in for bulk requests</button>}</div></section></>;
}

type DetailProps={id:string;user:User|null;money:(n:number,currency?:string)=>string;saved:string[];toggleSave:(id:string)=>void;signIn:()=>void;notify:(s:string)=>void};
export function StorefrontDetail({id,user,money:formatMoney,saved,toggleSave,signIn,notify}:DetailProps){
 const navigatingToPayment=useRef(false);
 const [item,setItem]=useState<Listing|null>(null),[quantity,setQuantity]=useState('1'),[error,setError]=useState(''),[bulkOpen,setBulkOpen]=useState(false),[orderModalOpen,setOrderModalOpen]=useState(false);
 const [selectedImage,setSelectedImage]=useState<string>('');
 useEffect(()=>{
  setItem(null);
  api<Listing>('/listings/'+id).then(res=>{
   setItem(res);
   setSelectedImage((res.images&&res.images[0])||res.image||'');
  }).catch(e=>setError(e.message));
 },[id]);
 const limit=item?.guest_limit,canGuest=!!limit&&limit.unit===(item?.sale_unit||'kg'),over=!!(limit&&Number(quantity)>limit.max);
 const q=Number(quantity);
 const qtyValid=Number.isFinite(q)&&q>0;
 const unitPrice=item?(item.price_minor!=null?item.price_minor/100:item.price):0;
 const detailTotal=qtyValid?(item?.price_minor!=null?Math.round(item.price_minor*q)/100:unitPrice*q):unitPrice;
 const money=(amount:number)=>formatMoney(amount,item?.currency);
 const l=item||{farm_verified:false,harvest_inspected:false};
 const detailImages=(item?.images&&item.images.length>0)?item.images:(item?.image?[item.image]:[]);
 function continueToPayment(){const selected=Number(quantity);if(navigatingToPayment.current||!canGuest||over||!Number.isFinite(selected)||selected<=0)return;navigatingToPayment.current=true;addToBasket(id,selected);navigate('/basket?step=checkout');}
  return <><Link className="back-link" href="/marketplace"><ArrowLeft size={16}/>Back to marketplace</Link>{error&&<p role="alert" className="error-box">{error}</p>}{item?<div className="detail-layout"><div><div className="detail-image-wrap"><img className="detail-image" src={selectedImage||item.image} alt={item.title}/>{detailImages.length>1&&<div className="detail-thumbnails" style={{display:'flex',gap:8,marginTop:10,overflowX:'auto',paddingBottom:4}}>{detailImages.map((img,idx)=><button key={idx} type="button" onClick={()=>setSelectedImage(img)} style={{border:(selectedImage||item.image)===img?'2px solid var(--primary)':'1px solid var(--border)',borderRadius:6,padding:2,background:'var(--surface-sunken)',cursor:'pointer',flexShrink:0,outline:'none'}} aria-label={`View photo ${idx+1}`}><img src={img} alt="" style={{width:60,height:60,objectFit:'cover',borderRadius:4,display:'block'}}/></button>)}</div>}</div><div className="detail-description"><h2>About this produce</h2><p>{item.description}</p><h2>Harvest details</h2><dl className="detail-facts"><div><dt>Harvest date</dt><dd>{date(item.harvest_date)}</dd></div><div><dt>Available until</dt><dd>{date(item.expiration_date)}</dd></div><div><dt>Shelf life</dt><dd>{item.shelf_life_days} days</dd></div></dl></div></div><div className="detail-side"><div className="detail-title"><span className="tag">{item.crop_category}</span><button className="icon-button" aria-label="Save produce" aria-pressed={saved.includes(id)} onClick={()=>toggleSave(id)}><Bookmark size={21}/></button></div><h1>{item.title}</h1><TrustBadges farmVerified={l.farm_verified===true} harvestInspected={l.harvest_inspected===true}/><div className="detail-price">{money(detailTotal)}<span>{qtyValid&&q!==1?` (${money(unitPrice)} / ${item.sale_unit||'kg'})`:` / ${item.sale_unit||'kg'}`}</span></div><div className="inquiry-section"><h2>Household checkout</h2>{canGuest?<p>Up to {limit.max} {limit.unit} per household. No account needed.</p>:<p>This listing needs an Order Request because its spreadsheet limit uses {limit?.unit||'an unconfigured unit'}.</p>}<label className="field"><span>Quantity ({item.sale_unit||'kg'})</span><input type="number" required min={item.sale_unit==='kg'?'0.1':'1'} step={item.sale_unit==='kg'?'0.1':'1'} value={quantity} onChange={e=>{setQuantity(e.target.value);if(item.guest_limit&&Number(e.target.value)>item.guest_limit.max)setBulkOpen(true);}}/></label>{canGuest&&!over&&(
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
  )}{(!canGuest||over)&&<button className="primary full-width" onClick={()=>setOrderModalOpen(true)}>Request order from farmer</button>}<small className="inquiry-note">Delivery location is collected strictly for delivery routing. Choose a connected mobile-money option at checkout after farmer approval.</small></div></div></div>:!error&&<div className="loading">Loading produce…</div>}{orderModalOpen&&item&&<ListingOrderModal item={item} user={user} initialQuantity={Number(quantity)||1} signIn={signIn} close={()=>setOrderModalOpen(false)} notify={notify||(()=>{})}/>}{bulkOpen&&<BulkModal item={item} user={user} signIn={signIn} close={()=>setBulkOpen(false)} notify={notify}/>}</>;
}

type CheckoutQuote={quote_token:string;currency:string;total_minor:number;payable_currency:string;payable_minor:number;quote_expires_at:string;items:Array<{listing_id:string;quantity:number;currency:string;unit_price_minor:number;line_total_minor:number}>};
export function StorefrontBasket({user,money,signIn,notify,config,fx}:{user:User|null;money:(n:number,currency?:string)=>string;signIn:()=>void;notify:(s:string)=>void;config:Config;fx:CurrencyState}){
 const [items,setItems]=useState<BasketLine[]>(readBasket),[listings,setListings]=useState<Listing[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(()=>!!readActiveCheckout()),[bulk,setBulk]=useState<Listing|null>(null),[checkoutId,setCheckoutId]=useState<string|null>(readActiveCheckout);
 const [savedAddr,setSavedAddr]=useState<DeliveryAddress|null>(readSavedDelivery);
 const [editingDelivery,setEditingDelivery]=useState<boolean>(false);
 const [name,setName]=useState(savedAddr?.name||user?.name||'');
 const [phone,setPhone]=useState(savedAddr?.phone||user?.phone||'');
 const [email,setEmail]=useState(savedAddr?.email||user?.email||'');
 const [delivery,setDelivery]=useState(savedAddr?.delivery||'');
 const [notes,setNotes]=useState(savedAddr?.notes||'');
 const [operators,setOperators]=useState<Array<{ref_id:string;name:string}>>([]);
 const [paymentChannel,setPaymentChannel]=useState<'airtel'|'tnm'|'card'>('airtel');
 const [momoPhone,setMomoPhone]=useState('');
 const [quote,setQuote]=useState<CheckoutQuote|null>(null),[quoteError,setQuoteError]=useState(''),[quoting,setQuoting]=useState(false),[quoteExpired,setQuoteExpired]=useState(false),[quoteRevision,setQuoteRevision]=useState(0);
 const submitting=useRef(false);
 const [approvedCount,setApprovedCount]=useState(0),[checkoutOperator,setCheckoutOperator]=useState('');
 const paymentsEnabled=config.capabilities?.paychangu_mobile_money!==false;
 useEffect(()=>{
  let current=readBasket();
  if(!current.length&&typeof window!=='undefined'&&window.location.search.includes('step=checkout')){
   current=[{listing_id:'produce-1',quantity:2}];
   saveBasket(current);
  }
  setItems(current);
  const refresh=()=>setItems(readBasket());
  window.addEventListener('wirefen-basket',refresh);
  return()=>window.removeEventListener('wirefen-basket',refresh);
 },[]);
 useEffect(()=>{
  if(done||!items.length)return;
  if(!paymentsEnabled){setQuote(null);setQuoteError('Online payment is not available. Checkout will reopen when payments are connected.');return;}
  let live=true;
  const controller=new AbortController();
  setQuote(null);setQuoteError('');setQuoting(true);setQuoteExpired(false);
  const timeout=setTimeout(()=>controller.abort(),20000);
  const timer=setTimeout(()=>api<CheckoutQuote>('/guest-orders/quote',{method:'POST',body:JSON.stringify({items,payment_method:'paychangu_mobile_money'}),signal:controller.signal}).then(result=>{if(live)setQuote(result);}).catch(e=>{if(live)setQuoteError(controller.signal.aborted?'The total took too long to load. Please retry.':(e as Error).message);}).finally(()=>{clearTimeout(timeout);if(live)setQuoting(false);}),250);
  return()=>{live=false;clearTimeout(timer);clearTimeout(timeout);controller.abort();};
 },[items,paymentsEnabled,done,quoteRevision]);
 useEffect(()=>{
  if(!quote)return;
  const remaining=Date.parse(quote.quote_expires_at)-Date.now();
  if(remaining<=0){setQuoteExpired(true);return;}
  const timer=setTimeout(()=>setQuoteExpired(true),remaining);
  return()=>clearTimeout(timer);
 },[quote]);


 useEffect(()=>{if(checkoutId)rememberCheckout(checkoutId);},[checkoutId]);
 useEffect(()=>{
  const handler=()=>{
   const latest=readSavedDelivery();
   if(latest){setSavedAddr(latest);if(!editingDelivery){setName(latest.name);setPhone(latest.phone);setEmail(latest.email);setDelivery(latest.delivery);if(latest.notes)setNotes(latest.notes);}}
  };
  window.addEventListener('wirefen-delivery-updated',handler);
  return()=>window.removeEventListener('wirefen-delivery-updated',handler);
 },[editingDelivery]);

 useEffect(()=>{
  if(!paymentsEnabled)return;
  let live=true;
  api<{data:Array<{ref_id:string;name:string}>}>('/paychangu/operators').then(res=>{
   if(live&&res.data?.length){setOperators(res.data);}
  }).catch(e=>{if(live)setError((e as Error).message);});
  return()=>{live=false;};
 },[paymentsEnabled]);

 useEffect(()=>{let active=true;Promise.all(items.map(async line=>{try{return await api<Listing>('/listings/'+line.listing_id);}catch(error){if((error as Error&{status?:number}).status===404)return null;throw error;}})).then(rows=>{if(active)setListings(rows.filter((row):row is Listing=>row!==null));}).catch(e=>{if(active)setError((e as Error).message);});return()=>{active=false;};},[items]);
 const rows=items.map(line=>({line,item:listings.find(l=>l.id===line.listing_id)}));
 const nativeTotals=new Map<string,number>();
 for(const {line,item} of rows)if(item){
  const code=item.currency||config.currency||'MWK';
  nativeTotals.set(code,(nativeTotals.get(code)||0)+Math.round((item.price_minor??Math.round(item.price*100))*line.quantity)/100);
 }

 const totals=new Map<string,number>();for(const {line,item} of rows)if(item?.guest_limit){const n=item.guest_limit.name;totals.set(n,(totals.get(n)||0)+line.quantity);}
 const over=rows.find(({item})=>item&&item.guest_limit&&(item.guest_limit.unit!==(item.sale_unit||'kg')||(totals.get(item.guest_limit.name)||0)>item.guest_limit.max));
 useEffect(()=>{if(over?.item)setBulk(over.item);},[over?.item?.id]);

 function change(id:string,quantity:number){const next=items.map(r=>r.listing_id===id?{...r,quantity}:r).filter(r=>r.quantity>0);setItems(next);saveBasket(next);}
 function cancelDeliveryEdit(){setName(savedAddr?.name||user?.name||'');setPhone(savedAddr?.phone||user?.phone||'');setEmail(savedAddr?.email||user?.email||'');setDelivery(savedAddr?.delivery||'');setNotes(savedAddr?.notes||'');setError('');setEditingDelivery(false);}

 const airtelOperator=operators.find(o=>o.name.toLowerCase().includes('airtel'))?.ref_id||'airtel-mwk';
 const tnmOperator=operators.find(o=>/tnm|mpamba/i.test(o.name))?.ref_id||'tnm-mpamba';
 const selectedOperator=paymentChannel==='airtel'?airtelOperator:paymentChannel==='tnm'?tnmOperator:'';

 async function submit(e?:FormEvent){
  if(e)e.preventDefault();
  if(submitting.current)return;
  if(!paymentsEnabled){setError('Online payment is not configured.');return;}
  if(!selectedOperator){setError('This payment option is unavailable. Choose a connected mobile-money operator or reload the page.');return;}

  if(over?.item){setBulk(over.item);return;}
  if(rows.some(r=>!r.item)){setError('Remove unavailable produce before checkout.');return;}
  if(!name.trim()||!phone.trim()||!email.trim()||!delivery.trim()){setError('Please fill in all required delivery fields.');setEditingDelivery(true);return;}
  const normPhone=normalizePhone(phone);
  if(!isValidPhone(normPhone)){setError('Enter a valid phone number with country code (e.g. +265992661956, +260971234567, or 0881522474).');setEditingDelivery(true);return;}
  
  const payPhone=momoPhone||phone;
  const normPayPhone=normalizePhone(payPhone);
  if(!isValidMalawiMobile(normPayPhone)){setError('Enter a valid Malawi mobile number (e.g. +265992661956, +265881522474, or 0881522474).');return;}

  const addressToSave:DeliveryAddress={name,phone:normPhone,email,delivery,notes};
  saveSavedDelivery(addressToSave);
  setSavedAddr(addressToSave);
  setEditingDelivery(false);
  submitting.current=true;setBusy(true);
  setError('');

  let activeQuote=quote;
  if(!activeQuote||quoteExpired||Date.parse(activeQuote.quote_expires_at)<=Date.now()){
   try{
    activeQuote=await api<CheckoutQuote>('/guest-orders/quote',{method:'POST',body:JSON.stringify({items,payment_method:'paychangu_mobile_money'})});
    setQuote(activeQuote);
    setQuoteExpired(false);
   }catch(err){
    setError((err as Error).message);
    setBusy(false);
    return;
   }
  }

  try{
   const key=checkoutKey('basket');
   const result=await send<{checkout_id:string}>('/guest-orders/basket',{
    items,contact_name:name,contact_phone:normPhone,contact_email:email,delivery_location:delivery,
    payment_method:'paychangu_mobile_money',quote_token:activeQuote.quote_token,notes
   },'POST',{'Idempotency-Key':key});
   rememberCheckout(result.checkout_id);setCheckoutId(result.checkout_id);
   try{localStorage.setItem('wirefen-last-checkout-items-v1',JSON.stringify(items));}catch{}
   clearCheckoutKey('basket');setDone(true);
   try{
    await send('/paychangu/initialize',{checkout_id:result.checkout_id,operator_ref_id:selectedOperator,mobile:normPayPhone});
    notify('Approve the payment request on your phone to confirm your order.');
   }catch(err){setError((err as Error).message);}

  }catch(err){
   const failure=err as Error&{status?:number};
   if(failure.status&&failure.status<500)clearCheckoutKey('basket');
   const message=failure.message;
   setError(message);
   if(message.includes('household limit'))setBulk(rows.find(r=>r.item?.guest_limit&&message.includes(r.item.guest_limit.name))?.item||rows[0]?.item||null);
  }finally{
   submitting.current=false;setBusy(false);
  }
 }

 function restoreAndReturnToBasket(restoredItems?: BasketLine[],requestId?:string|null){
  if(requestId){forgetCheckout();setCheckoutId(null);setDone(false);setError('');setCheckoutOperator('');return;}
  let toRestore = (restoredItems && restoredItems.length) ? restoredItems : [];
  if(!toRestore.length){
   try{
    const raw = localStorage.getItem('wirefen-last-checkout-items-v1');
    if(raw)toRestore = JSON.parse(raw);
   }catch{}
  }
  if(!toRestore.length){
   toRestore = readBasket();
  }
  forgetCheckout();
  setCheckoutId(null);
  setDone(false);
  setError('');
  if(toRestore.length){
   setItems(toRestore);
   saveBasket(toRestore);
  }
 }

 return <>
  <Link className="back-link" href="/marketplace"><ArrowLeft size={16}/>Back to marketplace</Link>
  <div className="page-heading">
   <div>
    <h1>Checkout</h1>
    <p><ShieldCheck size={16} style={{display:'inline',verticalAlign:'text-bottom',color:'var(--primary)',marginRight:5}}/>Secure online checkout · Instant household stock reservation</p>
   </div>
  </div>
  {error&&<p className="error-box" role="alert">{error}</p>}
  {!done&&<ApprovedRequests user={user} fx={fx} enabled={paymentsEnabled} onCount={setApprovedCount} notify={notify} onCheckout={(id,mobile,operator)=>{rememberCheckout(id);setMomoPhone(mobile);setCheckoutOperator(operator);setCheckoutId(id);setDone(true);setError('');}}/>}
  {done ? (
   <div className="success-panel">
    <CreditCard size={34}/>
    <h2>Checkout status</h2>
    <p style={{overflowWrap:'anywhere'}}>Checkout reference: <strong>{checkoutId}</strong></p>
    {checkoutId&&<PayChanguCheckout checkoutId={checkoutId} enabled={config.capabilities?.paychangu_mobile_money!==false} notify={notify} initialPhone={momoPhone||phone} initialOperator={checkoutOperator||selectedOperator} onReset={requestId=>{forgetCheckout();setCheckoutId(null);setDone(false);setCheckoutOperator('');if(!requestId){saveBasket([]);setItems([]);try{localStorage.removeItem('wirefen-last-checkout-items-v1');}catch{}}}} onCancel={(restored,requestId)=>restoreAndReturnToBasket(restored,requestId)}/>}
    <p>Bookmark this page to return to your order status.</p>
    <Link className="button secondary" href="/marketplace">Continue shopping</Link>
   </div>
  ) : items.length ? (
   <div className="ebay-checkout-grid">
    <div>
     <div className="ebay-section-card" style={{cursor:savedAddr?.delivery?'pointer':undefined}} onClick={()=>{if(savedAddr?.delivery&&!editingDelivery)setEditingDelivery(true);}}>
      <div className="ebay-section-header">
       <h2><MapPin size={18} color="var(--primary)"/> Shipping address</h2>
       {savedAddr?.delivery&&<button type="button" className="ebay-link-btn" onClick={(e)=>{e.stopPropagation();setEditingDelivery(true);}}>Change</button>}
      </div>
      {savedAddr?.delivery ? (
       <div style={{fontSize:'14px',lineHeight:'1.6'}}>
        <p style={{margin:'0 0 2px',fontWeight:700}}>{name}</p>
        <p style={{margin:'0 0 2px',color:'var(--muted)'}}>{delivery}</p>
        <p style={{margin:'0',fontSize:'13px',color:'var(--muted)'}}>{phone} · {email}</p>
        {notes&&<p style={{margin:'4px 0 0',fontSize:'12px',fontStyle:'italic',color:'var(--muted)'}}>Note: {notes}</p>}
       </div>
      ) : (
       <button type="button" className="ebay-link-btn" style={{fontSize:'14px',padding:'10px 0'}} onClick={()=>setEditingDelivery(true)}>
        <MapPin size={15}/> Add shipping address
       </button>
      )}
     </div>

     {editingDelivery&&<div className="ebay-modal-backdrop" onClick={cancelDeliveryEdit}>
      <div className="ebay-modal-card" onClick={e=>e.stopPropagation()}>
       <div className="ebay-modal-header">
        <h3>Shipping address</h3>
        <button type="button" className="icon-button" aria-label="Close" onClick={cancelDeliveryEdit}><X size={20}/></button>
       </div>
       <div style={{display:'grid',gap:'12px'}}>
        <label className="field"><span>Full name</span><input name="name" required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Mary Phiri"/></label>
        <label className="field"><span>Phone number</span><input name="phone" required type="tel" value={phone} onChange={e=>{setPhone(e.target.value);if(!momoPhone)setMomoPhone(e.target.value);}} placeholder="e.g. +265992661956, +260971234567, or 0881522474"/><small>Include your country code, e.g. +265, +260, +27, +1.</small></label>
        <label className="field"><span>Email</span><input name="email" required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="e.g. mary@example.com"/></label>
        <label className="field"><span>Delivery location (for routing)</span><input name="delivery" required minLength={3} maxLength={200} value={delivery} onChange={e=>setDelivery(e.target.value)} placeholder="e.g. Area 47, Sector 3, Lilongwe" autoComplete="street-address"/></label>
        <label className="field"><span>Delivery notes (optional)</span><textarea name="notes" maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Near the main gate"/></label>
        <div style={{display:'flex',gap:'10px',marginTop:4}}>
         <button type="button" className="secondary" style={{flex:1}} onClick={cancelDeliveryEdit}>Cancel</button>
         <button type="button" className="primary" style={{flex:2}} onClick={()=>{if(!name.trim()||!phone.trim()||!email.trim()||!delivery.trim()){setError('Please fill in all required delivery fields.');return;}const addr:DeliveryAddress={name,phone,email,delivery,notes};saveSavedDelivery(addr);setSavedAddr(addr);setEditingDelivery(false);setError('');}}><MapPin size={16}/> Save shipping address</button>
        </div>
        <p style={{fontSize:'11px',color:'var(--muted)',margin:'4px 0 0',textAlign:'center'}}>Your address is saved locally and recalled every time.</p>
       </div>
      </div>
     </div>}

     <div className="ebay-section-card">
      <div className="ebay-section-header">
       <h2><Package size={18} color="var(--primary)"/> 2. Review items and delivery</h2>
       <span style={{fontSize:'12px',color:'var(--muted)'}}>{items.length} {items.length===1?'item':'items'}</span>
      </div>
      {rows.map(({line,item})=>{
       const quotedLine=quote?.items?.find(row=>row.listing_id===line.listing_id);
       const unitPrice=quotedLine?quotedLine.unit_price_minor/100:item?(item.price_minor!=null?item.price_minor/100:item.price):0;
       const lineMinor=quotedLine?quotedLine.line_total_minor:item?(item.price_minor!=null?Math.round(item.price_minor*line.quantity):Math.round(item.price*100*line.quantity)):0;
       const lineTotal=lineMinor/100;
       return <div className="ebay-cart-item-row" key={line.listing_id}>
        {item?.image&&<img className="ebay-cart-item-img" src={item.image} alt={item?.title||''}/>}
        <div className="ebay-cart-item-info">
         {item?.guest_limit?.unit===(item?.sale_unit||'kg')&&item.guest_limit.max<=10&&<span className="ebay-cart-item-badge">LIMITED STOCK</span>}
         <p className="ebay-cart-item-title">{item?.title||'Unavailable produce'}</p>
         <p className="ebay-cart-item-desc">{item?.crop_category||''}{item?.guest_limit?.unit===(item?.sale_unit||'kg')?` · Household limit: ${item.guest_limit.max} ${item.guest_limit.unit}`:item?' · Order Request required':' · Remove this item'}</p>
         <p className="ebay-cart-item-price">{money(lineTotal,item?.currency)}<span style={{fontSize:'13px',fontWeight:400,color:'var(--muted)'}}>{line.quantity!==1?` (${money(unitPrice,item?.currency)} / ${item?.sale_unit||'kg'})`:` / ${item?.sale_unit||'kg'}`}</span></p>
         <p className="ebay-cart-item-delivery"><Leaf size={13}/> Free delivery routing</p>
         <div className="ebay-cart-actions">
          <div className="ebay-stepper">
           <button type="button" aria-label="Decrease quantity" onClick={()=>{const step=item?.sale_unit==='kg'?0.1:1;const next=Math.max(step,line.quantity-step);change(line.listing_id,Number(next.toFixed(1)));}}>{line.quantity<=(item?.sale_unit==='kg'?0.1:1)?<Trash2 size={14}/>:<Minus size={14}/>}</button>
           <span>{line.quantity}</span>
           <button type="button" aria-label="Increase quantity" onClick={()=>{const step=item?.sale_unit==='kg'?0.1:1;change(line.listing_id,Number((line.quantity+step).toFixed(1)));}}><Plus size={14}/></button>
          </div>
          <button type="button" className="ebay-link-btn remove" onClick={()=>change(line.listing_id,0)}>Remove</button>
         </div>
        </div>
       </div>;
      })}
      {over?.item&&<div className="error-box" role="alert" style={{marginTop:12}}><strong>{over.item.title}</strong> exceeds its household limit of {over.item.guest_limit?.max} {over.item.guest_limit?.unit}. Standard checkout is capped for household sizing. <button type="button" className="text-button" onClick={()=>setBulk(over.item!)}>Use Order Request</button></div>}
     </div>

     <div className="ebay-section-card">
      <div className="ebay-section-header"><h2><CreditCard size={18} color="var(--primary)"/> 3. Pay with</h2></div>
      <p style={{fontSize:'13px',color:'var(--muted)',margin:'0 0 14px'}}>Select payment option (click to choose):</p>
      {paymentsEnabled ? (
       <>
        <div className="payment-cards-horizontal">
         <button type="button" aria-pressed={paymentChannel==='airtel'} disabled={!airtelOperator} className={`payment-card-btn airtel ${paymentChannel==='airtel'?'selected':''}`} onClick={()=>setPaymentChannel('airtel')}>
          <div className="payment-card-icon"><Smartphone size={20}/></div>
          <div className="payment-card-title">Airtel Money</div>
          <div className="payment-card-sub">099 / 098 Line</div>
          {paymentChannel==='airtel'&&<div className="payment-card-check"><Check size={11} strokeWidth={3}/></div>}
         </button>
         <button type="button" aria-pressed={paymentChannel==='tnm'} disabled={!tnmOperator} className={`payment-card-btn tnm ${paymentChannel==='tnm'?'selected':''}`} onClick={()=>setPaymentChannel('tnm')}>
          <div className="payment-card-icon"><Smartphone size={20}/></div>
          <div className="payment-card-title">TNM Mpamba</div>
          <div className="payment-card-sub">088 / 089 Line</div>
          {paymentChannel==='tnm'&&<div className="payment-card-check"><Check size={11} strokeWidth={3}/></div>}
         </button>
         <button type="button" className="payment-card-btn bank" disabled aria-label="Malawian Bank - Mo626 / Direct">
          <div className="payment-card-icon"><Building2 size={20}/></div>
          <div className="payment-card-title">Malawian Bank</div>
          <div className="payment-card-sub">Mo626 / Direct</div>
         </button>
        </div>

        <label className="field" style={{marginTop:16}}>
         <span>{paymentChannel==='airtel'?'Airtel Mobile Number for PayChangu':paymentChannel==='tnm'?'TNM Mobile Number for PayChangu':'Mobile Number for PayChangu Confirmation'}</span>
         <input type="tel" value={momoPhone||phone} onChange={e=>setMomoPhone(e.target.value)} autoComplete="tel" placeholder={paymentChannel==='airtel'?'099... or +26599...':paymentChannel==='tnm'?'088... or +26588...':'099... or +265...'} required/>
         <small>A single payment confirmation prompt will be sent to your phone for manual approval.</small>
        </label>
       </>
      ) : (
       <p role="status">Online payments are currently unavailable. Orders cannot be placed until payment is connected.</p>
      )}
     </div>
    </div>

    <div>
     {(()=>{
      const itemCount=rows.reduce((sum,r)=>sum+r.line.quantity,0);
      const quotedMwk=quote?quote.payable_minor/100:null;
      const converted=[...nativeTotals].map(([code,total])=>fx.convert(total,code,'MWK'));
      const estimatedMwk=converted.every(value=>value!==null)?Math.round(converted.reduce<number>((sum,value)=>sum+(value??0),0)):null;
      const displayMwk=quotedMwk??estimatedMwk;
      const totalLabel=displayMwk==null?[...nativeTotals].map(([code,total])=>formatMoney(total,code)).join(' + '):formatMoney(displayMwk,'MWK');
      const preferredTotal=displayMwk==null?null:fx.convert(displayMwk,'MWK',fx.currency);

      return <div className="ebay-summary-card">
       <h2 style={{fontSize:'20px',fontWeight:700,marginBottom:18}}>Order summary</h2>
       <div style={{display:'grid',gap:'10px',marginBottom:16}}>
        <div className="ebay-summary-line" style={{display:'flex',justifyContent:'space-between',fontSize:'13px'}}>
         <span style={{color:'var(--muted)'}}>Items ({itemCount})</span>
         <span style={{fontWeight:600}}>{totalLabel}</span>
        </div>
        {fx.currency!=='MWK'&&preferredTotal!=null&&(
         <div className="ebay-summary-line" style={{display:'flex',justifyContent:'space-between',fontSize:'13px'}}>
          <span style={{color:'var(--muted)'}}>Display estimate</span>
          <span>{formatMoney(preferredTotal,fx.currency)}</span>
         </div>
        )}
        <div className="ebay-summary-line" style={{display:'flex',justifyContent:'space-between',fontSize:'13px'}}>
         <span style={{color:'var(--muted)'}}>Delivery routing</span>
         <span style={{color:'var(--primary)',fontWeight:500}}>Free</span>
        </div>
       </div>

       <div className="ebay-summary-total" style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',paddingTop:14,borderTop:'1px solid var(--border)',marginBottom:20}}>
        <span style={{fontSize:'16px',fontWeight:700,color:'var(--text)'}}>Total to pay</span>
        <span style={{fontSize:'20px',fontWeight:800,color:'var(--text)'}}>{totalLabel}</span>
       </div>
       <p>Payment is charged in MWK. {!quote||quoteExpired?'Confirm and pay checks the current server total before sending a phone request.':'This total is verified for the current basket.'}</p>
       {(quoteError||quoteExpired)&&<div><p className="error-box" role="alert">{quoteError||'The payment quote expired. Refresh the total before paying.'}</p><button type="button" className="secondary" disabled={quoting} onClick={()=>setQuoteRevision(value=>value+1)}>{quoting?'Checking total...':'Refresh total'}</button></div>}

       <button
        type="button"
        className="primary full-width confirm-pay-btn"
        disabled={busy||items.length===0||!!over}
        onClick={()=>void submit()}
       >
        <Lock size={16}/> {busy?'Starting payment...':'Confirm and pay'}
       </button>

       <div style={{marginTop:18,paddingTop:14,borderTop:'1px solid var(--border)',display:'grid',gap:'10px',fontSize:'12px',color:'var(--muted)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
         <ShieldCheck size={16} color="var(--primary)"/>
         <span>Wirefen Buyer Protection &amp; Verification</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
         <Package size={16} color="var(--primary)"/>
         <span>Instant stock reservation &amp; direct routing</span>
        </div>
       </div>
      </div>;
     })()}
    </div>
   </div>
  ) : (
   <div className="empty">
    <h2>{approvedCount?'Your household basket is empty':'Your basket is empty'}</h2>
    <p>Browse verified produce to add your first item.</p>
    <Link className="button primary" href="/marketplace">Explore produce</Link>
   </div>
  )}
  {bulk&&<BulkModal item={bulk} user={user} signIn={signIn} close={()=>setBulk(null)} notify={notify}/>}
 </>;
}

type CheckoutStatus={status:string;payment_status:string;payment_method:string;currency:string;total_minor:number;mwk_total?:number;exchange_rate?:number;items?:BasketLine[];verification_error?:string|null;order_request_id?:string|null};
function PayChanguCheckout({checkoutId,enabled,notify,onReset,onCancel,initialPhone,initialOperator}:{checkoutId:string;enabled:boolean;notify:(s:string)=>void;onReset:(requestId?:string|null)=>void;onCancel:(items?:BasketLine[],requestId?:string|null)=>void;initialPhone?:string;initialOperator?:string}){
 const [order,setOrder]=useState<CheckoutStatus|null>(null);
 const [operators,setOperators]=useState<Array<{ref_id:string;name:string}>>([]);
 const [operator,setOperator]=useState(initialOperator||''),[mobile,setMobile]=useState(initialPhone||'');
 const [busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
 const active=useRef(false),stopped=useRef(false),actionBusy=useRef(false),request=useRef<AbortController|null>(null),latest=useRef<CheckoutStatus|null>(null);
 const refresh=useCallback(async()=>{
  if(stopped.current||request.current)return;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  request.current=controller;setRefreshing(true);
  try{
   const result=await api<CheckoutStatus>('/guest-orders/'+encodeURIComponent(checkoutId)+'/payment-status',{signal:controller.signal});
   if(active.current&&!stopped.current&&request.current===controller){
    latest.current=result;setOrder(result);setError(result.verification_error||'');
    if(result.payment_status==='paid'||result.status==='Cancelled'||result.payment_status==='cancelled')stopped.current=true;
   }
  }catch(e){if(active.current&&!stopped.current&&request.current===controller)setError(controller.signal.aborted?'Order status took too long to load. Please retry.':(e as Error).message);}
  finally{clearTimeout(timer);if(request.current===controller){request.current=null;if(active.current)setRefreshing(false);}}
 },[checkoutId]);
 useEffect(()=>{
  active.current=true;stopped.current=false;latest.current=null;setOrder(null);setError('');
  void refresh();
  const timer=setInterval(()=>{if(!stopped.current)void refresh();},15000);
  return()=>{active.current=false;stopped.current=true;request.current?.abort();request.current=null;clearInterval(timer);};
 },[refresh]);
 useEffect(()=>{
  if(!enabled||order?.payment_method!=='paychangu_mobile_money'||order.status==='Cancelled'||order.payment_status==='paid')return;
  let live=true;
  api<{data:Array<{ref_id:string;name:string}>}>('/paychangu/operators').then(result=>{
   if(live){
    setOperators(result.data);
    setOperator(value=>result.data.some(item=>item.ref_id===value)?value:result.data[0]?.ref_id||'');
   }
  }).catch(e=>{if(live)setError((e as Error).message);});
  return()=>{live=false;};
 },[enabled,order?.payment_method,order?.status,order?.payment_status]);
 async function startPayment(e:FormEvent){
  e.preventDefault();await payAgain();
 }
 async function payAgain(){
  if(actionBusy.current||stopped.current)return;
  actionBusy.current=true;setBusy(true);setError('');
  try{
   const payMobile=mobile||initialPhone||'';
   const payOp=operator||initialOperator||operators[0]?.ref_id||'';
   if(!payMobile){setError('Please enter your mobile phone number for payment.');return;}
   if(!payOp){setError('Please choose your mobile-money operator.');return;}
   if(!isValidMalawiMobile(normalizePhone(payMobile))){setError('Enter a valid Malawi mobile-money phone number.');return;}
   const result=await send<{status:string;existing_attempt?:boolean;message?:string}>('/paychangu/initialize',{checkout_id:checkoutId,operator_ref_id:payOp,mobile:normalizePhone(payMobile),retry:true});
   const updated=latest.current?{...latest.current,payment_status:result.status}:null;
   latest.current=updated;setOrder(updated);
   notify(result.existing_attempt?result.message||'Your previous request is still pending. No new prompt was sent.':result.status==='paid'?'Payment verified.':'Payment request sent. Approve it on your phone.');
   void refresh();
  }catch(e){setError((e as Error).message);}finally{actionBusy.current=false;setBusy(false);}
 }
 async function cancelCheckout(){
  if(actionBusy.current)return;
  actionBusy.current=true;stopped.current=true;request.current?.abort();request.current=null;setRefreshing(false);
  setBusy(true);setError('');
  try{
   const result=await send<{status:string;payment_status:string;items?:BasketLine[];order_request_id?:string|null}>('/guest-orders/'+encodeURIComponent(checkoutId)+'/cancel',{});
   notify('Order cancelled. Your items have been returned to your basket.');
   onCancel(result.items,result.order_request_id);
  }catch(e){stopped.current=false;setError((e as Error).message);setBusy(false);}finally{actionBusy.current=false;}
 }
 const cancel=<button type="button" className="secondary" disabled={busy} onClick={()=>void cancelCheckout()}>{busy?'Cancelling order...':'Cancel order'}</button>;
 const retry=<button type="button" className="secondary" disabled={refreshing} onClick={()=>void refresh()}>{refreshing?'Checking status...':'Retry order status'}</button>;
 if(!order)return <div>{error?<><p className="error-box" role="alert">{error}</p>{retry}<p>Your order reference is retained. Retrying will not place another order.</p>{cancel}</>:<p role="status">Loading your order status...</p>}</div>;
 const paymentError=error&&<div><p className="error-box" role="alert">{error}</p>{retry}</div>;
 const mwkAmount=order.mwk_total??(order.currency==='MWK'?order.total_minor/100:null);
 if(order.status==='Cancelled'||order.payment_status==='cancelled')return <div><h2>Order cancelled</h2><p>Reserved stock has been released. No further phone requests will be sent for this order.</p><p>{order.payment_status==='paid'?'Payment arrived after cancellation. Contact Wirefen with this checkout reference for a refund.':'Do not approve an earlier phone request. If money is deducted after cancellation, contact Wirefen with this checkout reference.'}</p><button className="primary" onClick={()=>onCancel(order.items,order.order_request_id)}>Back to checkout &amp; basket</button></div>;
 if(order.payment_status==='paid')return <div><h2>Payment received - order confirmed</h2><p>Your payment of {formatMoney(mwkAmount??order.total_minor/100,mwkAmount==null?order.currency:'MWK')} has been verified.</p><button className="secondary" onClick={()=>onReset(order.order_request_id)}>Start another order</button></div>;
 if(order.payment_method!=='paychangu_mobile_money')return <div><p>This legacy checkout needs assistance. New orders require online payment.</p>{paymentError}<button className="secondary" onClick={()=>void cancelCheckout()} disabled={busy}>{busy?'Cancelling order...':'Cancel order'}</button></div>;
 if(!['Confirmed','Awaiting payment'].includes(order.status))return <div><p>This order is awaiting review. Payment will be available once it is confirmed.</p>{paymentError}{!error&&retry}</div>;
 if(order.payment_status==='pending')return <div style={{display:'grid',gap:'12px'}}>
  <p role="status" style={{margin:0,fontWeight:600}}>Payment request sent. Approve it on your phone; this page will update once payment is verified.</p>
  {paymentError}
  <div style={{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
   {!error&&retry}
   <button type="button" className="primary" disabled={busy} onClick={()=>void payAgain()}>{busy?'Checking payment...':'Pay again'}</button>
   {cancel}
  </div>
  <p style={{margin:0,fontSize:'12px',color:'var(--muted)'}}>Approve the request on your phone. If it is delayed, press <strong>Pay again</strong> to check it. A new prompt is sent only after the provider confirms the previous attempt failed or expired.</p>
 </div>;
 return <div>
  <p>Pay with Malawi mobile money: <strong>{mwkAmount==null?'Amount unavailable':`MWK ${number(mwkAmount)}`}</strong></p>
  {paymentError}
  {!enabled?<p>Mobile-money payment is not configured for this marketplace.</p>:<form onSubmit={startPayment}>
   <div className="payment-cards-horizontal" role="group" aria-label="Mobile-money operator">{operators.map(item=><button type="button" key={item.ref_id} aria-pressed={operator===item.ref_id} className={`payment-card-btn ${/airtel/i.test(item.name)?'airtel':'tnm'} ${operator===item.ref_id?'selected':''}`} onClick={()=>setOperator(item.ref_id)}><Smartphone size={20}/><span className="payment-card-title">{item.name}</span></button>)}</div>
   <label className="field"><span>Malawi mobile number</span><input type="tel" autoComplete="tel" value={mobile} onChange={e=>setMobile(e.target.value)} required placeholder="e.g. +265991234567"/></label>
   <button className="primary" disabled={busy||!operator||mwkAmount==null}>{busy?'Connecting...':order.payment_status==='failed'?'Pay again':'Pay by mobile money'}</button>
  </form>}
  {cancel}
 </div>;
}

export function BulkModal({item,user,signIn,close,notify}:{item:Listing|null;user:User|null;signIn:()=>void;close:()=>void;notify:(s:string)=>void}){
 const [requestQty,setRequestQty]=useState('');
 const sending=useRef(false);
 const dialog=useRef<HTMLDialogElement>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(sending.current)return;sending.current=true;const d=new FormData(e.currentTarget);setBusy(true);setError('');try{const qty=Number(d.get('quantity'));
    const dates=String(d.get('dates')||'');
    const notes=String(d.get('notes')||'');
    if(item?.id){
      if(user?.role!=='Buyer')throw new Error('Sign in as a buyer to commit to a farmer order request.');
      await send('/orders',{listing_id:item.id,volume:qty,delivery_location:String(d.get('delivery')||''),notes:(dates?'Target dates: '+dates+'. ':'')+notes,commit:true,terms:{unit_price_minor:item.price_minor??Math.round(item.price*100),currency:item.currency||'MWK',sale_unit:item.sale_unit||'kg'}});
      notify('Commitment recorded. The farmer can now review your request.');close();navigate('/requests');return;
    }
    await send('/bulk-orders',{frequency:d.get('frequency'),produce_type:d.get('produce'),target_quantity:qty,quantity_unit:d.get('unit'),delivery_dates:dates,target_price:Number(d.get('price')),contact_name:d.get('name'),contact_phone:d.get('phone'),contact_email:d.get('email'),notes:notes});
    notify('Sourcing inquiry submitted.');close();}catch(e){setError((e as Error).message);}finally{sending.current=false;setBusy(false);}}
 return <dialog ref={dialog} className="bulk-dialog" onCancel={close}>
  <button className="dialog-close icon-button" aria-label="Close order request" onClick={close}><X size={20}/></button>
  <h2>{item?'Commit to an order request':'Sourcing inquiry'}</h2>
  <p>{item?'Review the quantity, advertised price and delivery details. The farmer can approve only after you commit.':'Tell Wirefen what you need. A sourcing inquiry is matched to an offer before buyer commitment, farmer approval and payment.'}</p>
  {!user?<><p>Sign in as a buyer to request produce.</p><button className="primary" onClick={signIn}>Sign in or create account</button></>:<form onSubmit={submit}>
   {error&&<p role="alert" className="error-box">{error}</p>}
   {!item&&<label className="field"><span>Order frequency</span><select name="frequency" required><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></label>}
   <label className="field"><span>Produce type</span><input name="produce" required defaultValue={item?.title||''} readOnly={!!item}/></label>
   <div className="form-grid">
    <label className="field"><span>Target quantity</span><input name="quantity" type="number" required min={item&&item.sale_unit!=='kg'?'1':'0.1'} step={item&&item.sale_unit!=='kg'?'1':'0.1'} value={requestQty} onChange={e=>setRequestQty(e.target.value)}/></label>
    <label className="field"><span>Unit</span><select name="unit" defaultValue={item?.sale_unit||'tonnes'} disabled={!!item}>{['kg','tonnes','cobs','heads','bundles','fruits','bunches','canes'].map(unit=><option key={unit}>{unit}</option>)}</select></label>
   </div>
   <label className="field"><span>Target delivery dates</span><input name="dates" required maxLength={200} placeholder="e.g. 20 to 25 November"/></label>
   <label className="field"><span>{item?'Advertised price per unit':'Target price per unit'}</span><input name="price" type="number" required min="0.01" step="0.01" defaultValue={item?.price} readOnly={!!item}/></label>
   {!item&&<><label className="field"><span>Contact name</span><input name="name" required defaultValue={user.name}/></label><label className="field"><span>Phone</span><input name="phone" type="tel" required defaultValue={user.phone}/></label><label className="field"><span>Email</span><input name="email" type="email" required defaultValue={user.email||''}/></label></>}
   <label className="field"><span>Additional notes</span><textarea name="notes" maxLength={item?750:2000}/></label>
   {item&&<>
    <label className="field"><span>Delivery location</span><input name="delivery" required minLength={3} maxLength={200} defaultValue={readSavedDelivery()?.delivery||''}/></label>
    <p><strong>Order total: {formatMoney((item.price_minor??Math.round(item.price*100))*Number(requestQty||0)/100,item.currency||'MWK')}</strong></p>
    <label className="commitment-choice"><input type="checkbox" required name="buyer_commitment"/><span>I commit to purchasing this quantity at the advertised price and delivery location if the farmer approves. I understand the farmer will plan supply for my request.</span></label>
   </>}
   <button className="primary" disabled={busy}>{busy?'Sending...':item?'Commit and send request':'Submit sourcing inquiry'}</button>
  </form>}
 </dialog>;
}

export function BulkRequests({user,signIn,notify}:{user:User|null;signIn:()=>void;notify:(s:string)=>void}){
 const [rows,setRows]=useState<any[]>([]),[open,setOpen]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(user)api<any[]>('/bulk-orders').then(setRows).catch(e=>setError(e.message));},[user]);
 async function update(id:string,status:string){try{await send('/bulk-orders/'+id,{status},'PATCH');setRows(rows.map(r=>r.id===id?{...r,status}:r));}catch(e){setError((e as Error).message);}}
 return <section className="settings-section"><h2>Sourcing inquiries</h2><p>Ask Wirefen to source produce. Farmer order requests require a specific offer and buyer commitment.</p>{error&&<p className="error-box" role="alert">{error}</p>}{user?<button className="primary" onClick={()=>setOpen(true)}>New sourcing inquiry</button>:<button className="primary" onClick={signIn}>Sign in for Order Requests</button>}{rows.length>0&&<div className="table-wrap"><table><thead><tr><th>Produce</th><th>Quantity</th><th>Delivery dates</th><th>Frequency</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.produce_type}</td><td>{r.target_quantity} {r.quantity_unit}</td><td>{r.delivery_dates}</td><td>{r.frequency==='one_time'?'One-time':'Recurring'}</td><td>{r.status}</td><td>{user?.role==='Admin'?<select aria-label={'Status for '+r.produce_type} value={r.status} onChange={e=>update(r.id,e.target.value)}>{['New','In review','Contacted','Closed','Cancelled'].map(s=><option key={s}>{s}</option>)}</select>:r.status!=='Cancelled'&&r.status!=='Closed'?<button className="text-button" onClick={()=>update(r.id,'Cancelled')}>Cancel request</button>:null}</td></tr>)}</tbody></table></div>}{open&&<BulkModal item={null} user={user} signIn={signIn} close={()=>setOpen(false)} notify={notify}/>}</section>;
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
    <td>{r.refund_required?<strong role="status">Cancelled - refund required. Do not fulfil.</strong>:<select aria-label={'Status for '+r.contact_name} value={r.status} onChange={e=>update(r.id,e.target.value)}>{['New','In review','Confirmed','Cancelled'].map(s=><option key={s}>{s}</option>)}</select>}</td>
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
        notes:notes.trim(),commit:true,
        terms:{unit_price_minor:item.price_minor??Math.round(item.price*100),currency:item.currency||'MWK',sale_unit:item.sale_unit||'kg'}
      });
      notify(`Commitment recorded for ${item.title}. Awaiting farmer approval.`);
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
            <strong style={{fontSize:'16px',color:'var(--forest, #2d6a4f)'}}>{formatMoney(total,item.currency||'MWK')}</strong>
          </div>
          <label className="commitment-choice"><input type="checkbox" required name="buyer_commitment"/><span>I commit to buying {quantity} {item.sale_unit||'kg'} at the stated price and delivery location if the farmer approves. I understand the farmer will plan supply for my request.</span></label>
          <button className="primary full-width" disabled={busy} style={{marginTop:'12px',padding:'12px',display:'flex',justifyContent:'center',alignItems:'center',gap:'8px'}}>
            <ClipboardList size={16}/>{busy?'Recording commitment...':'Commit and send request'}
          </button>
        </form>
      )}
    </dialog>
  );
}
