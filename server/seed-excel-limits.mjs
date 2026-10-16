/** Import the 44 household caps and shelf-life values from Produce_Guest_Order_Limits.xlsx.
 * This command never creates farms, listings, prices, or stock.
 * Run with: node --env-file=.env server/seed-excel-limits.mjs
 */
import {Pool,neonConfig} from '@neondatabase/serverless';
import {randomUUID} from 'node:crypto';

const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw new Error('DATABASE_URL is required.');
if(!new URL(databaseUrl).hostname.endsWith('.neon.tech'))throw new Error('The limits import requires a Neon DATABASE_URL.');
neonConfig.webSocketConstructor=WebSocket;
const pool=new Pool({connectionString:databaseUrl,connectionTimeoutMillis:15000});

function shelfLifeToDays(value){
  const match=String(value||'').trim().match(/^(\d+)(?:\s*[-\u2013]\s*(\d+))?\s*(day|week|month)/i);
  if(!match)return 14;
  const amount=(Number(match[1])+Number(match[2]||match[1]))/2;
  return Math.round(amount*({day:1,week:7,month:30})[match[3].toLowerCase()]);
}

// Produce_Guest_Order_Limits.xlsx, data rows 2-45.
const excelRows = [
  ["Grains & Cereals", "Maize (Dry Hard Grain)", "1 Month", 25, "kg", "Registration required to buy > 25 kg"],
  ["Grains & Cereals", "Maize Flour (Ufa)", "1 Month", 25, "kg", "Registration required to buy > 25 kg"],
  ["Grains & Cereals", "Maize (Fresh on the Cob)", "3-4 Days", 28, "cobs", "Registration required to buy > 28 cobs"],
  ["Grains & Cereals", "Rice (Paddy & Milled)", "1 Month", 20, "kg", "Registration required to buy > 20 kg"],
  ["Grains & Cereals", "Sorghum (dry)", "1 Month", 10, "kg", "Registration required to buy > 10 kg"],
  ["Grains & Cereals", "Pearl Millet (dry)", "1 Month", 10, "kg", "Registration required to buy > 10 kg"],
  ["Grains & Cereals", "Wheat (dry)", "1 Month", 10, "kg", "Registration required to buy > 10 kg"],
  ["Roots & Tubers", "Cassava (Fresh Root)", "3-5 Days", 10, "kg", "Registration required to buy > 10 kg"],
  ["Roots & Tubers", "Cassava Powder (Kondowole)", "1 Month", 15, "kg", "Registration required to buy > 15 kg"],
  ["Roots & Tubers", "Sweet Potatoes (fresh)", "2 Weeks", 15, "kg", "Registration required to buy > 15 kg"],
  ["Roots & Tubers", "Irish Potatoes (fresh)", "2 Weeks", 15, "kg", "Registration required to buy > 15 kg"],
  ["Roots & Tubers", "Yams (Zikhu) (fresh)", "2 Weeks", 10, "kg", "Registration required to buy > 10 kg"],
  ["Legumes & Oilseeds", "Groundnuts (Peanuts) (fresh)", "1 Week", 5, "kg", "Registration required to buy > 5 kg"],
  ["Legumes & Oilseeds", "Groundnuts (Peanuts) (dried)", "1 Month", 10, "kg", "Registration required to buy > 10 kg"],
  ["Legumes & Oilseeds", "Groundnuts (Peanuts) Powder (nsinjiro)", "1 Month", 5, "kg", "Registration required to buy > 5 kg"],
  ["Legumes & Oilseeds", "Dried Soya Beans", "1 Month", 10, "kg", "Registration required to buy > 10 kg"],
  ["Legumes & Oilseeds", "Dry Beans (e.g., Kidney, Sugar Beans)", "1 Month", 15, "kg", "Registration required to buy > 15 kg"],
  ["Legumes & Oilseeds", "Fresh Beans (e.g., Kidney, Sugar Beans)", "1 Week", 5, "kg", "Registration required to buy > 5 kg"],
  ["Legumes & Oilseeds", "Green beans (zitheba)", "1 Week", 5, "kg", "Registration required to buy > 5 kg"],
  ["Legumes & Oilseeds", "Fresh Beans: Sold in pods", "1 Week", 5, "kg", "Registration required to buy > 5 kg"],
  ["Legumes & Oilseeds", "Pigeon Peas (Nandolo)", "1 Month", 10, "kg", "Registration required to buy > 10 kg"],
  ["Legumes & Oilseeds", "Cowpeas (Khobwe)", "1 Month", 10, "kg", "Registration required to buy > 10 kg"],
  ["Legumes & Oilseeds", "Sunflower Seeds", "1 Month", 3, "kg", "Registration required to buy > 3 kg"],
  ["Vegetables & Spices", "Tomatoes", "1 Week", 2, "kg", "Registration required to buy > 2 kg"],
  ["Vegetables & Spices", "Onions", "3-4 Weeks", 3, "kg", "Registration required to buy > 3 kg"],
  ["Vegetables & Spices", "Chilli Peppers assorted", "2 Weeks", 0.5, "kg", "Registration required to buy > 0.5 kg"],
  ["Vegetables & Spices", "Mustard Greens (Mpiru)", "3-4 Days", 14, "bundles", "Registration required to buy > 14 bundles"],
  ["Vegetables & Spices", "Pumpkin Leaves (Mkhwani)", "3-4 Days", 14, "bundles", "Registration required to buy > 14 bundles"],
  ["Vegetables & Spices", "Cabbage", "1-2 Weeks", 5, "heads", "Registration required to buy > 5 heads"],
  ["Vegetables & Spices", "Garlic", "1 Month", 0.5, "kg", "Registration required to buy > 0.5 kg"],
  ["Vegetables & Spices", "Green Peppers", "1 Week", 1.5, "kg", "Registration required to buy > 1.5 kg"],
  ["Vegetables & Spices", "Okra (Therere)", "4-5 Days", 2, "kg", "Registration required to buy > 2 kg"],
  ["Fruits (Fresh Produce)", "Mangoes (Ripe)", "3-5 Days", 28, "fruits", "Registration required to buy > 28 fruits"],
  ["Fruits (Fresh Produce)", "Bananas", "1 Week", 3, "bunches", "Registration required to buy > 3 bunches"],
  ["Fruits (Fresh Produce)", "Citrus Oranges", "2 Weeks", 5, "kg", "Registration required to buy > 5 kg"],
  ["Fruits (Fresh Produce)", "Tangerines", "2 Weeks", 5, "kg", "Registration required to buy > 5 kg"],
  ["Fruits (Fresh Produce)", "Avocados", "1 Week", 14, "fruits", "Registration required to buy > 14 fruits"],
  ["Fruits (Fresh Produce)", "Pineapples", "1 Week", 4, "fruits", "Registration required to buy > 4 fruits"],
  ["Fruits (Fresh Produce)", "Pawpaws (Papaya)", "1 Week", 4, "fruits", "Registration required to buy > 4 fruits"],
  ["Fruits (Fresh Produce)", "Guavas", "1 Week", 3, "kg", "Registration required to buy > 3 kg"],
  ["Fruits (Fresh Produce)", "Sugarcane", "1-2 Weeks", 14, "canes", "Registration required to buy > 14 canes"],
  ["Beverages & Nuts", "Tea", "3 Months", 1, "kg", "Registration required to buy > 1 kg"],
  ["Beverages & Nuts", "Macadamia Nuts", "1 Month", 2, "kg", "Registration required to buy > 2 kg"],
  ["Beverages & Nuts", "Coffee (dry uncooked beans)", "3 Months", 2, "kg", "Registration required to buy > 2 kg"],
];

async function main() {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS guest_order_limits (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        produce_item TEXT NOT NULL UNIQUE,
        shelf_life TEXT NOT NULL,
        shelf_life_days INTEGER NOT NULL,
        max_quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        requirement TEXT NOT NULL DEFAULT '',
        aliases TEXT NOT NULL DEFAULT ''
      )
    `);
    for (const [category, produce_item, shelf_life, max_quantity, unit, requirement] of excelRows) {
      await client.query(
        `INSERT INTO guest_order_limits (id, category, produce_item, shelf_life, shelf_life_days, max_quantity, unit, requirement)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (produce_item) DO UPDATE SET
           category = EXCLUDED.category,
           shelf_life = EXCLUDED.shelf_life,
           shelf_life_days = EXCLUDED.shelf_life_days,
           max_quantity = EXCLUDED.max_quantity,
           unit = EXCLUDED.unit,
           requirement = EXCLUDED.requirement`,
        [randomUUID(), category, produce_item, shelf_life, shelfLifeToDays(shelf_life), max_quantity, unit, requirement]
      );
    }
    await client.query('COMMIT');
    console.log(`Upserted ${excelRows.length} spreadsheet limits. No farmers or listings were changed.`);
  } catch (error) {
    if(client)await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

main().catch(error => { console.error(`Limit import failed: ${error.message}`); process.exitCode=1; });
