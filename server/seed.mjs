import { randomUUID, scryptSync, randomBytes } from 'node:crypto';
export const hashPassword = password => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
export async function seed(db) {
 if(await db.get('SELECT id FROM users LIMIT 1')) return;
 const now = new Date().toISOString();
 const users = [['farmer-1','Thandi Mokoena','+27820000001','Farmer'],['farmer-2','Pieter van der Merwe','+27820000002','Farmer'],['farmer-3','Nomsa Dlamini','+27820000003','Farmer'],['buyer-1','Alex Morgan','+27820000004','Buyer'],['admin-1','Wirefen Operations','+27820000005','Admin'],['agent-1','Kuda Moyo (Field Agent)','+27820000006','Agent']];
 for(const [id,name,phone,role] of users) await db.run('INSERT INTO users (id,name,phone,password_hash,role,created_at) VALUES (?,?,?,?,?,?)',[id,name,phone,hashPassword(randomUUID()),role,now]);
 const seedFarmers = [
  ['farm-1','farmer-1','Mokoena Family Farm','South Africa','Capricorn District','Capricorn District','Polokwane Ward 12','Polokwane Ward 12','Polokwane Ward 12, Capricorn District, South Africa',24,'Verified'],
  ['farm-2','farmer-2','Valley View Growers','South Africa','Cape Winelands','Cape Winelands','Stellenbosch Ward 8','Stellenbosch Ward 8','Stellenbosch Ward 8, Cape Winelands, South Africa',120,'Verified'],
  ['farm-3','farmer-3','Green Roots Cooperative','South Africa','uMgungundlovu','uMgungundlovu','Msunduzi Ward 22','Msunduzi Ward 22','Msunduzi Ward 22, uMgungundlovu, South Africa',42,'Pending']
 ];
 for(const row of seedFarmers) await db.run('INSERT INTO farmer_profiles (id,user_id,farm_name,country,region,district,locality,ward,location,farm_size,verification_status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',row);
 const date = offset => new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
 const products = [
 ['Roma tomatoes','Vegetables',2500,12.5,'farm-1','tomatoes',-1,10,'Firm, sun-ripened Roma tomatoes, sorted and packed in reusable crates. Ideal for fresh markets and food service.','WF-ZA-LP-2026-TOM01',4.9],
 ['Golden yellow maize','Grains',18000,4.8,'farm-2','maize',-3,180,'Dry yellow maize, cleaned and ready for collection. Bulk supply available.','WF-ZA-WC-2026-MZ02',4.7],
 ['Fresh Hass avocados','Fruits',1800,28,'farm-1','avocados',0,12,'Rich, creamy Hass avocados. Harvested at mature green stage for a reliable ripening window.','WF-ZA-LP-2026-AVO03',4.8],
 ['Golden potatoes','Tubers',4200,9.5,'farm-3','potatoes',-2,30,'Freshly lifted golden potatoes, field sorted and ready for packing.','WF-ZA-KZN-2026-POT04',4.6],
 ['Green cabbage','Vegetables',3600,6.8,'farm-3','cabbage',0,14,'Crisp green cabbages with tightly packed leaves. Supplied whole in bulk crates.','WF-ZA-KZN-2026-CAB05',4.5],
 ['Red kidney beans','Legumes',6000,24,'farm-2','beans',-5,180,'Dried red kidney beans, sorted for consistent quality. Suitable for wholesalers and processors.','WF-ZA-WC-2026-BN06',4.8]
 ];
 for(let i=0;i<products.length;i++){ const [title,cat,vol,price,farm,img,harvest,life,desc,trace,score]=products[i]; await db.run('INSERT INTO listings (id,farmer_id,title,crop_category,available_volume,price,harvest_date,expiration_date,shelf_life_days,preservative_used,description,image,traceability,agent_score,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[`produce-${i+1}`,farm,title,cat,vol,price,date(harvest),date(harvest+life),life,0,desc,`/images/${img}.jpg`,trace,score,now]); }
}
