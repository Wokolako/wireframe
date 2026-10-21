'use client';

import Link from 'next/link';
import {useEffect,useMemo,useRef,useState,type FormEvent,type ChangeEvent} from 'react';
import {ArrowLeft,ArrowRight,Camera,X,CheckCircle2,AlertCircle,Trash2,Star} from 'lucide-react';
import catalogue from '../shared/catalogue.json';
import {api,readLocal,send,writeLocal,type User} from './api';
import {navigate} from './navigation';

type Produce=typeof catalogue[number];
type Draft=Record<string,string>;
type Props={farmerId:string;user:User;currency:string;notify:(message:string)=>void};

const LISTING_CURRENCIES=['MWK','ZMW','ZAR','USD','EUR','GBP'] as const;

export function ListingComposer({farmerId,user,currency,notify}:Props){
 const key=`wirefen-listing-${user.id}-${farmerId}`;
 const [draft,setDraft]=useState<Draft>(()=>readLocal(key,{produce_id:'crop-024',title:'Fresh Roma tomatoes',crop_category:'Vegetables',preservative_used:'false',currency:currency||'MWK'}));
 const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dirty,setDirty]=useState(false),[ready,setReady]=useState(false);
 const [images,setImages]=useState<string[]>(()=>{
  const local=readLocal<Draft>(key,{});
  if(local.images){
   try{const parsed=JSON.parse(local.images);if(Array.isArray(parsed)&&parsed.length)return parsed;}catch(e){}
  }
  return local.image?[local.image]:[];
 });
 const revision=useRef(0);
 const produce=useMemo(()=>catalogue.find(item=>item.id===draft.produce_id)||catalogue[0], [draft.produce_id]) as Produce;

 useEffect(()=>{
  let alive=true;
  api<Draft>('/farmers/'+farmerId+'/listing-draft').then(server=>{
   if(!alive)return;
   const local=readLocal<Draft>(key,{});
   if(!Object.keys(local).length&&Object.keys(server).length){
    const merged={...server,produce_id:server.produce_id||'crop-024'};
    setDraft(current=>({...current,...merged}));
    if(server.images){
     try{const parsed=JSON.parse(server.images);if(Array.isArray(parsed)&&parsed.length)setImages(parsed);}catch(e){}
    }else if(server.image){
     setImages([server.image]);
    }
   }
  }).catch(e=>{if(alive)setError((e as Error).message);}).finally(()=>{if(alive)setReady(true);});
  return()=>{alive=false;};
 },[farmerId,key]);

 useEffect(()=>{
  if(!ready||!dirty)return;
  const current=revision.current;
  const timer=setTimeout(()=>send('/farmers/'+farmerId+'/listing-draft',draft,'PATCH').then(()=>{
   if(current===revision.current)setDirty(false);
  }).catch(e=>setError(`Draft is saved on this device; server sync failed: ${(e as Error).message}`)),800);
  return()=>clearTimeout(timer);
 },[draft,dirty,ready,farmerId]);

 const update=(name:string,value:string)=>{
  revision.current++;
  const next={...draft,[name]:value};
  if(name==='produce_id'){
   const selected=catalogue.find(item=>item.id===value);
   if(selected)next.crop_category=selected.category;
  }
  setDraft(next);setDirty(true);writeLocal(key,next);
 };

 function processFile(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{
   if(!file.type.startsWith('image/')){
    reject(new Error(`${file.name} is not an image file.`));
    return;
   }
   if(file.size>8*1024*1024){
    reject(new Error(`${file.name} is too large (max 8MB).`));
    return;
   }
   const reader=new FileReader();
   reader.onerror=()=>reject(new Error(`Failed to read ${file.name}`));
   reader.onload=()=>{
    const raw=reader.result as string;
    const img=new Image();
    img.onerror=()=>reject(new Error(`Failed to load ${file.name}`));
    img.onload=()=>{
     const maxDim=500;
     let width=img.width,height=img.height;
     if(width>maxDim||height>maxDim){
      if(width>height){
       height=Math.round((height*maxDim)/width);
       width=maxDim;
      }else{
       width=Math.round((width*maxDim)/height);
       height=maxDim;
      }
     }
     const canvas=document.createElement('canvas');
     canvas.width=width;canvas.height=height;
     const ctx=canvas.getContext('2d');
     if(ctx){
      ctx.drawImage(img,0,0,width,height);
      resolve(canvas.toDataURL('image/jpeg',0.7));
     }else{
      resolve(raw);
     }
    };
    img.src=raw;
   };
   reader.readAsDataURL(file);
  });
 }

 async function handleImageUpload(e:ChangeEvent<HTMLInputElement>){
  const files=Array.from(e.target.files||[]);
  if(!files.length)return;
  setError('');
  try{
   const processed=await Promise.all(files.map(processFile));
   const next=[...images,...processed];
   setImages(next);
   update('images',JSON.stringify(next));
   update('image',next[0]||'');
  }catch(err){
   setError((err as Error).message);
  }finally{
   e.target.value='';
  }
 }

 function removeImage(index:number){
  const next=images.filter((_,i)=>i!==index);
  setImages(next);
  update('images',JSON.stringify(next));
  update('image',next[0]||'');
 }

 function setAsCover(index:number){
  if(index<=0||index>=images.length)return;
  const picked=images[index];
  const next=[picked,...images.filter((_,i)=>i!==index)];
  setImages(next);
  update('images',JSON.stringify(next));
  update('image',next[0]);
 }

 const input=(name:string,label:string,type='text',extra:Record<string,unknown>={})=><label className="field"><span>{label}</span><input required type={type} value={draft[name]||''} onChange={event=>update(name,event.target.value)} {...extra}/></label>;

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(step===0&&images.length<3){
   setError(`Please upload at least 3 photos of your produce (${images.length} of 3 uploaded). Real photos are required.`);
   return;
  }
  if(step<2){setStep(step+1);setError('');return;}
  if(images.length<3){
   setError(`Please upload at least 3 photos of your produce (${images.length} of 3 uploaded).`);
   return;
  }
  setBusy(true);setError('');
  try{
   await send('/listings',{
    ...draft,
    farmer_id:farmerId,
    produce_id:produce.id,
    crop_category:produce.category,
    sale_unit:produce.unit,
    available_volume:Number(draft.available_volume),
    price:Number(draft.price),
    shelf_life_days:Number(draft.shelf_life_days),
    preservative_used:draft.preservative_used==='true',
    image:images[0],
    images
   });
   localStorage.removeItem(key);setDirty(false);
   notify('Your produce listing with photos is now live on the marketplace.');
   navigate('/marketplace?tab=mine');
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 return <>
  <Link className="back-link" href={user.role==='Admin'?'/admin':'/farm'}><ArrowLeft size={16}/>Back to workspace</Link>
  <div className="page-heading"><div><h1>Give your harvest a wider reach.</h1><p>Create a produce listing with real photos. Drafts save on this device and sync when connected.</p></div></div>
  <div className="single-form">
   <div className="step-header"><span>Step {step+1} of 3</span><span>{['Produce details & photos','Harvest & handling','Review & publish'][step]}</span></div>
   <progress value={step+1} max={3} aria-label="Listing progress"/>
   {error&&<div className="error-box" role="alert">{error}</div>}
   <form onSubmit={submit}>
    {step===0&&<>
     <h2>What’s ready for market?</h2>
     <label className="field"><span>Produce type</span><select required value={produce.id} onChange={event=>update('produce_id',event.target.value)}>{catalogue.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><small>Produce identity sets the sale unit and household order limit.</small></label>
     {input('title','Listing title','text',{minLength:3,maxLength:100,placeholder:`e.g. Fresh ${produce.name}`})}
     <p className="field-hint">Category: {produce.category} · sold by {produce.unit}</p>
     <div className="form-grid">{input('available_volume',`Available volume (${produce.unit})`,'number',{min:0.001,max:1e9,step:produce.unit==='kg'||produce.unit==='tonnes'?'0.001':'1'})}<label className="field"><span>Price ({draft.currency||currency} / {produce.unit})</span><div style={{display:'flex',gap:8}}><select value={draft.currency||currency||'MWK'} onChange={e=>update('currency',e.target.value)} style={{width:90,flexShrink:0}}>{LISTING_CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}</select><input required type="number" min={0.01} max={1e9} step="0.01" value={draft.price||''} onChange={e=>update('price',e.target.value)} placeholder="e.g. 500"/></div><small>Choose the currency your price is in. Buyers see this exact currency.</small></label></div>

     <div className="field photo-upload-field" style={{marginTop:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',flexWrap:'wrap',gap:8}}>
       <span style={{fontWeight:600}}>Harvest photographs (minimum 3 required)</span>
       <span style={{fontSize:13,fontWeight:600,color:images.length>=3?'#16a34a':'#ea580c',display:'inline-flex',alignItems:'center',gap:4}}>
        {images.length>=3?<CheckCircle2 size={15}/>:<AlertCircle size={15}/>}
        {images.length} of 3 required photos uploaded
       </span>
      </div>
      <small style={{display:'block',marginTop:4,color:'var(--muted)'}}>Upload at least 3 genuine photographs of your harvest. The first photo will be used as the cover photo.</small>

      {images.length>0&&(
       <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))',gap:12,marginTop:12}}>
        {images.map((img,idx)=>(
         <div key={idx} style={{position:'relative',borderRadius:8,overflow:'hidden',border:idx===0?'2px solid var(--primary)':'1px solid var(--border)',aspectRatio:'1/1',background:'var(--surface-sunken)'}}>
          <img src={img} alt={`Produce photo ${idx+1}`} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
          {idx===0&&(
           <span style={{position:'absolute',top:6,left:6,background:'var(--primary)',color:'#fff',fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,display:'inline-flex',alignItems:'center',gap:3}}>
            <Star size={10} fill="currentColor"/> Cover
           </span>
          )}
          <div style={{position:'absolute',top:6,right:6,display:'flex',gap:4}}>
           {idx>0&&(
            <button type="button" onClick={()=>setAsCover(idx)} title="Set as cover photo" style={{background:'rgba(255,255,255,0.92)',border:'none',borderRadius:'50%',width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}>
             <Star size={13} style={{color:'var(--primary)'}}/>
            </button>
           )}
           <button type="button" onClick={()=>removeImage(idx)} title="Remove photo" style={{background:'rgba(255,255,255,0.92)',border:'none',borderRadius:'50%',width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}>
            <Trash2 size={13} style={{color:'#ef4444'}}/>
           </button>
          </div>
         </div>
        ))}
       </div>
      )}

      <label className="listing-photo-dropzone" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,padding:'22px 16px',marginTop:12,border:'2px dashed var(--border)',borderRadius:8,background:'var(--surface-sunken)',cursor:'pointer',textAlign:'center'}}>
       <Camera size={26} style={{color:'var(--primary)'}}/>
       <strong style={{fontSize:13}}>{images.length===0?'Click to select at least 3 harvest photographs':'Click to add more photographs'}</strong>
       <span style={{fontSize:11,color:'var(--muted)'}}>Select one or multiple photos (JPG, PNG, WebP). Optimized automatically.</span>
       <input type="file" multiple accept="image/*" className="sr-only" onChange={handleImageUpload}/>
      </label>
     </div>
    </>}
    {step===1&&<>
     <h2>Freshness, from field to buyer.</h2>
     <div className="form-grid">{input('harvest_date','Harvest date','date')}{input('expiration_date','Available until','date',{min:draft.harvest_date})}</div>
     {input('shelf_life_days','Shelf life (days)','number',{min:1,max:3650})}
     <label className="field"><span>Preservatives</span><select value={draft.preservative_used||'false'} onChange={event=>update('preservative_used',event.target.value)}><option value="false">No preservatives used</option><option value="true">Preservatives used</option></select></label>
     <label className="field"><span>Description (optional)</span><textarea maxLength={2000} rows={4} value={draft.description||''} onChange={event=>update('description',event.target.value)} placeholder="Tell buyers about the produce, packing and collection."/></label>
    </>}
    {step===2&&<>
     <h2>Ready to meet your buyers?</h2>
     {images.length>0&&(
      <div style={{marginBottom:18}}>
       <span style={{fontSize:12,fontWeight:600,color:'var(--muted)',display:'block',marginBottom:8}}>Uploaded produce photos ({images.length})</span>
       <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(90px, 1fr))',gap:8}}>
        {images.map((img,i)=>(
         <div key={i} style={{position:'relative',borderRadius:6,overflow:'hidden',aspectRatio:'1/1',border:i===0?'2px solid var(--primary)':'1px solid var(--border)'}}>
          <img src={img} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
          {i===0&&<span style={{position:'absolute',bottom:3,left:3,background:'var(--primary)',color:'#fff',fontSize:9,fontWeight:700,padding:'1px 4px',borderRadius:3}}>Cover</span>}
         </div>
        ))}
       </div>
      </div>
     )}
     <dl className="review-list">{[['Produce',produce.name],['Listing title',draft.title],['Category',produce.category],['Volume',`${draft.available_volume} ${produce.unit}`],['Price',`${draft.currency||currency} ${draft.price} / ${produce.unit}`],['Currency',draft.currency||currency||'MWK'],['Harvest',draft.harvest_date],['Available until',draft.expiration_date],['Shelf life',`${draft.shelf_life_days} days`],['Preservatives',draft.preservative_used==='true'?'Used':'None'],['Photographs',`${images.length} real produce photographs attached`]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </>}
    <div className="wizard-buttons"><button className="secondary" type="button" disabled={step===0||busy} onClick={()=>setStep(step-1)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={busy}>{busy?'Publishing…':step===2?'Publish listing':'Continue'}<ArrowRight size={16}/></button></div>
   </form>
  </div>
 </>;
}
