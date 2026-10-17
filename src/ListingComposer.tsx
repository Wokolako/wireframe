'use client';

import Link from 'next/link';
import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight} from 'lucide-react';
import catalogue from '../shared/catalogue.json';
import {api,readLocal,send,writeLocal,type User} from './api';
import {navigate} from './navigation';

type Produce=typeof catalogue[number];
type Draft=Record<string,string>;
type Props={farmerId:string;user:User;currency:string;notify:(message:string)=>void};

export function ListingComposer({farmerId,user,currency,notify}:Props){
 const key=`wirefen-listing-${user.id}-${farmerId}`;
 const [draft,setDraft]=useState<Draft>(()=>readLocal(key,{produce_id:'crop-024',title:'Fresh Roma tomatoes',crop_category:'Vegetables',preservative_used:'false'}));
 const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dirty,setDirty]=useState(false),[ready,setReady]=useState(false);
 const revision=useRef(0);
 const produce=useMemo(()=>catalogue.find(item=>item.id===draft.produce_id)||catalogue[0], [draft.produce_id]) as Produce;

 useEffect(()=>{
  let alive=true;
  api<Draft>('/farmers/'+farmerId+'/listing-draft').then(server=>{
   if(!alive)return;
   if(!Object.keys(readLocal(key,{})).length&&Object.keys(server).length)setDraft(current=>({...current,...server,produce_id:server.produce_id||'crop-024'}));
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
 const input=(name:string,label:string,type='text',extra:Record<string,unknown>={})=><label className="field"><span>{label}</span><input required type={type} value={draft[name]||''} onChange={event=>update(name,event.target.value)} {...extra}/></label>;

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(step<2){setStep(step+1);return;}
  setBusy(true);setError('');
  try{
   await send('/listings',{...draft,farmer_id:farmerId,produce_id:produce.id,crop_category:produce.category,sale_unit:produce.unit,available_volume:Number(draft.available_volume),price:Number(draft.price),shelf_life_days:Number(draft.shelf_life_days),preservative_used:draft.preservative_used==='true'});
   localStorage.removeItem(key);setDirty(false);notify('Your produce is now on the marketplace.');navigate(user.role==='Admin'?'/admin':'/farm');
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 return <>
  <Link className="back-link" href={user.role==='Admin'?'/admin':'/farm'}><ArrowLeft size={16}/>Back to workspace</Link>
  <div className="page-heading"><div><h1>Give your harvest a wider reach.</h1><p>Create a produce listing. Drafts save on this device and sync when connected.</p></div></div>
  <div className="single-form">
   <div className="step-header"><span>Step {step+1} of 3</span><span>{['Produce details','Harvest & handling','Review & publish'][step]}</span></div>
   <progress value={step+1} max={3} aria-label="Listing progress"/>
   {error&&<div className="error-box" role="alert">{error}</div>}
   <form onSubmit={submit}>
    {step===0&&<>
     <h2>What’s ready for market?</h2>
     <label className="field"><span>Produce type</span><select required value={produce.id} onChange={event=>update('produce_id',event.target.value)}>{catalogue.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><small>Produce identity sets the sale unit and household order limit.</small></label>
     {input('title','Listing title','text',{minLength:3,maxLength:100,placeholder:`e.g. Fresh ${produce.name}`})}
     <p className="field-hint">Category: {produce.category} · sold by {produce.unit}</p>
     <div className="form-grid">{input('available_volume',`Available volume (${produce.unit})`,'number',{min:0.001,max:1e9,step:produce.unit==='kg'||produce.unit==='tonnes'?'0.001':'1'})}{input('price',`Price (${currency} / ${produce.unit})`,'number',{min:0.01,max:1e9,step:'0.01'})}</div>
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
     <dl className="review-list">{[['Produce',produce.name],['Listing title',draft.title],['Category',produce.category],['Volume',`${draft.available_volume} ${produce.unit}`],['Price',`${currency} ${draft.price} / ${produce.unit}`],['Harvest',draft.harvest_date],['Available until',draft.expiration_date],['Shelf life',`${draft.shelf_life_days} days`],['Preservatives',draft.preservative_used==='true'?'Used':'None']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
     <p className="info-box">A category photograph will illustrate your listing. Buyers can request packing and collection details.</p>
    </>}
    <div className="wizard-buttons"><button className="secondary" type="button" disabled={step===0||busy} onClick={()=>setStep(step-1)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={busy}>{busy?'Publishing…':step===2?'Publish listing':'Continue'}<ArrowRight size={16}/></button></div>
   </form>
  </div>
 </>;
}
