const fail=message=>Object.assign(new Error(message),{status:400});
export function minorUnits(value){
  const text=String(value);
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw fail('Use a non-negative price with at most two decimal places.');
  const [whole,decimal='']=text.split('.');
  const result=BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw fail('Price is too large.');
  return Number(result);
}
export function quantityMillis(value,unit){
  if(!Number.isFinite(value)||value<=0||value>1e9)throw fail('Enter a valid positive quantity.');
  if(!['kg','tonnes'].includes(unit)&&!Number.isInteger(value))throw fail(`Quantity in ${unit} must be a whole number.`);
  const scaled=value*1000;
  if(Math.abs(scaled-Math.round(scaled))>0.00001)throw fail('Use at most three decimal places for weight.');
  return Math.round(scaled);
}
export function lineTotalMinor(unitPrice,quantity,unit){
  if(!Number.isSafeInteger(unitPrice)||unitPrice<0)throw fail('Price must be a non-negative amount in minor units.');
  const total=(BigInt(unitPrice)*BigInt(quantityMillis(quantity,unit))+500n)/1000n;
  if(total>BigInt(Number.MAX_SAFE_INTEGER))throw fail('Order total is too large.');
  return Number(total);
}
export function majorUnits(minor){return minor/100;}
