export const buyers = {
  zd: {name:'ZD Strmilov', short:'ZD', color:'#dc8a39', date:'14. 10. 2026', source:'E-mail sekretariátu ZD Strmilov, Kalenská', note:'Zájem o koupi; druhá skupina parcel je zatím zvažována.'},
  stagra: {name:'STAGRA, spol. s r. o.', short:'ST', color:'#8064a2', date:'13. 10. 2026', source:'E-mail Ing. Pavlíny Brabcové', note:'Poptávka po pozemcích, včetně podílu 4/32 parcely 666 v Olšanech u Dačic.'},
  pacal: {name:'Vladimír Pacal', short:'VP', color:'#438fbc', date:'13. 10. 2026', source:'E-mail Vladimíra Pacala', note:'Koupě 7 parcel; uvádí souhrn 3 402 172 Kč dle posudku. U dalších 3 parcel žádá převod pachtovních smluv. Jeho LV 211 je pouze souvislost, není součástí prodávaného majetku.'},
  dvorak: {name:'Pan Dvořák', short:'PD', color:'#b57669', date:'14. 10. 2026', source:'Zprostředkovaný zájem v e-mailu ZD Strmilov', note:'Soukromý zemědělec. Zájem závisí na podmínkách; jde o parcely v jeho užívaných půdních blocích.'},
};
export const interestRecords=[];
function add(buyer,cadastre,numbers,status='confirmed',note='') {for(const number of numbers.split(',')) interestRecords.push({buyer,cadastre,number:number.trim(),status,note,source:buyers[buyer].source,date:buyers[buyer].date});}
add('zd','Malý Jeníkov','88/2,91,96,97,107');
add('zd','Strmilov','580/1,956/21,970/3,993,994,995,1846,1847,1868,1870,1871,1872,2224/2,2261,2356/36,2444,3152,3213');
add('zd','Strmilov','676,677/2,678,679,684/3,684/5,780/10,780/11','considering');
add('dvorak','Strmilov','783/1,785,789,790,798,799,817/5,817/7,849','conditional','Zájem závisí na podmínkách.');
add('dvorak','Malý Jeníkov','198,208','conditional','Zájem závisí na podmínkách.');
add('pacal','Velký Jeníkov','162/1,161/1,196/7,196/15,196/25,203/8,202/2');
add('pacal','Velký Jeníkov','141/11,196/5,196/6','lease','Žádost o převedení pachtovních smluv.');
add('stagra','Strmilov','8');
add('stagra','Olšany u Dačic','604,612,661,787,788,666');
add('stagra','Velký Jeníkov','106,109,110,115/9,117/9,117/14,117/16,117/18,117/19,117/20,117/21,117/23,161/2,172,196/4,196/7,196/15,196/25,203/8');
export const statusLabels={confirmed:'Projevený zájem',considering:'Zvažovaný zájem',conditional:'Podmíněný zájem',lease:'Žádost o pacht',multiple:'Více zájemců',none:'Bez evidovaného zájmu'};
export function normalizeArea(s='') {return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/^olsany$/,'olsany u dacic').trim();}
export function getInterests(p) {return interestRecords.filter(r=>normalizeArea(r.cadastre)===normalizeArea(p.cadastralArea)&&r.number.replace(/\s/g,'')===p.parcelNumber.replace(/\s/g,''));}
