export const costFields=['cost_fertilizer_seeds','cost_labor','cost_processing','cost_transportation'];
export function parseCost(text){
 const value=String(text).trim();
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value))return null;
 const amount=Number(value.replaceAll(',',''));
 return Number.isFinite(amount)&&amount<=1e12?amount:null;
}
export function costTotal(data){return costFields.reduce((sum,key)=>sum+Math.round(Number(data[key]??0)*100),0)/100;}
export function validCost(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e12&&Math.abs(value*100-Math.round(value*100))<0.02;}
export function mergeCosts(old,incoming,complete=false){
 const data={};
 for(const key of costFields){const value=Object.hasOwn(incoming,key)?incoming[key]:old[key];if(value!=null&&!validCost(value))throw new Error('Costs must be nonnegative amounts with at most two decimal places.');data[key]=value??null;}
 if(complete&&costFields.some(key=>data[key]===null))throw new Error('Enter all four cost estimates. Use 0 when there is no expected spend.');
 return {...data,avg_production_cost:costTotal(data)};
}
