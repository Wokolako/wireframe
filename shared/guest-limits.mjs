// Source: Produce_Guest_Order_Limits.xlsx, rows 2–45. Units are part of each limit.
// This hardcoded list is the fallback; loadLimitsFromDb() replaces it with DB data.
const defaultLimits = [
  ['Maize (Dry Hard Grain)',25,'kg'],['Maize Flour (Ufa)',25,'kg'],['Maize (Fresh on the Cob)',28,'cobs'],
  ['Rice (Paddy & Milled)',20,'kg'],['Sorghum (dry)',10,'kg'],['Pearl Millet (dry)',10,'kg'],['Wheat (dry)',10,'kg'],
  ['Cassava (Fresh Root)',10,'kg'],['Cassava Powder (Kondowole)',15,'kg'],['Sweet Potatoes (fresh)',15,'kg'],
  ['Irish Potatoes (fresh)',15,'kg'],['Yams (Zikhu) (fresh)',10,'kg'],
  ['Groundnuts (Peanuts) (fresh)',5,'kg'],['Groundnuts (Peanuts) (dried)',10,'kg'],
  ['Groundnuts (Peanuts) Powder (nsinjiro)',5,'kg'],['Dried Soya Beans',10,'kg'],
  ['Dry Beans (e.g., Kidney, Sugar Beans)',15,'kg'],['Fresh Beans (e.g., Kidney, Sugar Beans)',5,'kg'],
  ['Green beans (zitheba)',5,'kg'],['Fresh Beans: Sold in pods',5,'kg'],['Pigeon Peas (Nandolo)',10,'kg'],
  ['Cowpeas (Khobwe)',10,'kg'],['Sunflower Seeds',3,'kg'],['Tomatoes',2,'kg'],['Onions',3,'kg'],
  ['Chilli Peppers assorted',0.5,'kg'],['Mustard Greens (Mpiru)',14,'bundles'],
  ['Pumpkin Leaves (Mkhwani)',14,'bundles'],['Cabbage',5,'heads'],['Garlic',0.5,'kg'],
  ['Green Peppers',1.5,'kg'],['Okra (Therere)',2,'kg'],['Mangoes (Ripe)',28,'fruits'],
  ['Bananas',3,'bunches'],['Citrus Oranges',5,'kg'],['Tangerines',5,'kg'],['Avocados',14,'fruits'],
  ['Pineapples',4,'fruits'],['Pawpaws (Papaya)',4,'fruits'],['Guavas',3,'kg'],['Sugarcane',14,'canes'],
  ['Tea',1,'kg'],['Macadamia Nuts',2,'kg'],['Coffee (dry uncooked beans)',2,'kg']
].map(([name,max,unit])=>({name,max,unit}));

// Live list — starts as default, replaced by DB data when loadLimitsFromDb() is called
export let guestLimits = [...defaultLimits];

/**
 * Load limits from the database. Call once at server startup after initDb().
 * Replaces the in-memory guestLimits array with rows from guest_order_limits.
 */
export async function loadLimitsFromDb(db) {
  try {
    const rows = await db.all('SELECT produce_item, max_quantity, unit FROM guest_order_limits ORDER BY produce_item');
    if (rows && rows.length > 0) {
      guestLimits.length = 0;
      for (const row of rows) {
        guestLimits.push({ name: row.produce_item, max: Number(row.max_quantity), unit: row.unit });
      }
    }
  } catch {
    // Table may not exist yet (tests, SQLite without migration) — keep defaults
  }
}

const aliases = new Map([
  ['roma tomatoes','Tomatoes'],['golden yellow maize','Maize (Dry Hard Grain)'],
  ['golden potatoes','Irish Potatoes (fresh)'],['potatoes','Irish Potatoes (fresh)'],
  ['red kidney beans','Dry Beans (e.g., Kidney, Sugar Beans)'],['beans','Dry Beans (e.g., Kidney, Sugar Beans)'],
  ['fresh hass avocados','Avocados'],['green cabbage','Cabbage'],['cabbages','Cabbage'],
  ['maize','Maize (Dry Hard Grain)'],['cassava','Cassava (Fresh Root)'],
  ['peanuts','Groundnuts (Peanuts) (dried)'],['groundnuts','Groundnuts (Peanuts) (dried)'],
  ['chilli','Chilli Peppers assorted'],['chillies','Chilli Peppers assorted'],
  ['peppers','Green Peppers'],['mangoes','Mangoes (Ripe)'],['oranges','Citrus Oranges'],
  ['papaya','Pawpaws (Papaya)'],['coffee','Coffee (dry uncooked beans)'],['tea leaves','Tea']
]);
export function guestLimitFor(title){
  const key=String(title).trim().toLowerCase();
  if(!key) return null;
  const name=aliases.get(key)||guestLimits.find(item=>item.name.toLowerCase()===key)?.name;
  if(name) return guestLimits.find(item=>item.name===name)||null;
  const baseKey=key.replace(/\s*\(.*?\)/g,'').trim();
  return guestLimits.find(item=>{
    const baseItem=item.name.toLowerCase().replace(/\s*\(.*?\)/g,'').trim();
    return baseKey===baseItem || key.includes(baseItem) || (baseItem.length>3 && baseKey.includes(baseItem));
  })||null;
}
