import catalogue from './catalogue.json' with {type:'json'};

const defaultLimits = catalogue.map(({id,category,name,max,unit})=>({id,category,name,max,unit}));

// Live list — starts as default, replaced by DB data when loadLimitsFromDb() is called
export let guestLimits = [...defaultLimits];

/**
 * Load limits from the database. Call once at server startup after initDb().
 * Replaces the in-memory guestLimits array with rows from guest_order_limits.
 */
export async function loadLimitsFromDb(db) {
  const rows = await db.all('SELECT produce_id,produce_item AS name,max_quantity AS max,unit,category FROM guest_order_limits ORDER BY produce_item');
  if (!rows.length) return;
  const limits = rows.map(row=>({id:row.produce_id,name:row.name,max:Number(row.max),unit:row.unit,category:row.category}));
  if (limits.some(row=>!row.id||!Number.isFinite(row.max)||row.max<=0||!row.unit)) throw new Error('Produce household limits contain invalid catalogue data.');
  guestLimits.splice(0,guestLimits.length,...limits);
}

const aliases = new Map([
  ['roma tomatoes','crop-024'],['golden yellow maize','crop-001'],
  ['golden potatoes','crop-011'],['potatoes','crop-011'],
  ['red kidney beans','crop-017'],['beans','crop-017'],
  ['fresh hass avocados','crop-037'],['green cabbage','crop-029'],['cabbages','crop-029'],
  ['maize','crop-001'],['cassava','crop-008'],
  ['peanuts','crop-014'],['groundnuts','crop-014'],
  ['chilli','crop-026'],['chillies','crop-026'],
  ['peppers','crop-031'],['mangoes','crop-033'],['oranges','crop-035'],
  ['papaya','crop-039'],['coffee','crop-044'],['tea leaves','crop-042']
]);
export function guestLimitFor(titleOrId){
  const key=String(titleOrId).trim().toLowerCase();
  if(!key) return null;
  return guestLimits.find(item=>item.id===titleOrId||item.name.toLowerCase()===key)
    ||guestLimits.find(item=>item.id===aliases.get(key))
    ||null;
}
