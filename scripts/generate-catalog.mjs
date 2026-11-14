// Additive catalog exporter: it never edits the existing QR-menu site files.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const catalogPath=path.join(root,'cms/catalog-v1.json');
const idsPath=path.join(root,'cms/product-ids.json');

function literal(file,name){
  const source=read(file),marker='const '+name,at=source.indexOf(marker);
  if(at<0)throw Error('Missing '+name+' in '+file);
  const eq=source.indexOf('=',at+marker.length);
  if(eq<0)throw Error('Missing assignment: '+name);
  let start=eq+1;
  while(/\s/.test(source[start]||''))start++;
  if(!'{['.includes(source[start]))throw Error('Not a static literal: '+name);
  const stack=[],pairs={']':'[','}':'{'};
  let quote='',escape=false,end=-1;
  for(let i=start;i<source.length;i++){
    const c=source[i];
    if(quote){
      if(escape){escape=false;continue;}
      if(c==='\\'){escape=true;continue;}
      if(c===quote)quote='';
    }else if(c==='"'||c==="'"){quote=c;}
    else if(c==='['||c==='{'){stack.push(c);}
    else if(c===']'||c==='}'){
      if(stack.pop()!==pairs[c])throw Error('Unbalanced '+name);
      if(!stack.length){end=i;break;}
    }
  }
  if(end<0)throw Error('Unclosed literal: '+name);
  return vm.runInNewContext('('+source.slice(start,end+1)+')',Object.create(null),{timeout:1000});
}
const assert=(condition,message)=>{if(!condition)throw Error(message);};
function asset(src,label){
  if(src==null)return;
  assert(typeof src==='string'&&src.startsWith('assets/')&&
    !src.includes('..')&&fs.existsSync(path.join(root,src)),
    'Missing or unsafe image for '+label+': '+src);
}
function trilingual(tr,en,ar,label){
  assert([tr,en,ar].every(x=>typeof x==='string'),'Missing localized text for '+label);
  return {tr,en,ar};
}

export function buildCatalog(){
  const categories=literal('menu-data.js','categories');
  const data=literal('menu-data.js','data');
  const arabic=literal('menu-ar.js','arabicMenu');
  const descriptionMap=literal('menu.js','descriptions');
  const photos=literal('menu.js','restaurantPhotos');
  const drinks=literal('menu.js','drinkProducts');
  const photoMap=literal('menu-data.js','photoMap');
  const drinkNames=literal('menu.js','drinkDisplayNames');
  const prices=JSON.parse(read('cms/menu-prices.json'));
  const campaigns=JSON.parse(read('cms/campaigns.json'));
  const old=JSON.parse(read('cms/product-ids.json'));
  assert(old.schemaVersion===1&&Number.isInteger(old.nextId)&&old.byName,
    'Invalid stable product-ID registry');
  const byName={...old.byName},ids=Object.values(byName);
  assert(ids.every(id=>Number.isInteger(id)&&id>=0)&&
    new Set(ids).size===ids.length,'Duplicate/invalid registered IDs');
  let nextId=Math.max(old.nextId,0,...ids.map(id=>id+1));
  const sourceNames=new Set(),priceNames=new Map();
  for(const [group,rows] of Object.entries(prices)){
    assert(Array.isArray(rows),'Invalid CMS group '+group);
    for(const row of rows){
      assert(!priceNames.has(row.name),'Duplicate CMS name '+row.name);
      assert(typeof row.name==='string'&&Number.isFinite(row.price)&&
        row.price>=0&&row.price<=100000,'Invalid price '+row.name);
      assert(row.active===undefined||typeof row.active==='boolean',
        'Invalid visibility for '+row.name);
      priceNames.set(row.name,{category:group,price:row.price,active:row.active});
    }
  }
  for(const item of data){
    const name=item[1],group=item[0];
    assert(!sourceNames.has(name),'Duplicate website product '+name);
    sourceNames.add(name);
    assert(priceNames.get(name)?.category===group,'CMS name/category mismatch '+name);
    assert(Array.isArray(arabic.items[name])&&arabic.items[name].length===2,
      'Missing Arabic translation for '+name);
    if(!(name in byName))byName[name]=nextId++;
  }
  assert(sourceNames.size===priceNames.size,'CMS and website product counts differ');
  const missing=Object.keys(old.byName).filter(name=>!sourceNames.has(name));
  assert(missing.length===0,
    'Renamed/deleted product requires stable-ID review: '+missing.join(', '));
  const catalogCategories=categories.map(([id,tr,en])=>({
    id,
    name:trilingual(tr,en,arabic.categories[id],id),
    description:trilingual(descriptionMap[id][0],descriptionMap[id][1],
      arabic.descriptions[id],id)
  }));
  const products=data.map(([category,name,en,originalPrice,descriptionTr,descriptionEn])=>{
    const [arName,arDescription]=arabic.items[name];
    const display=drinkNames[name];
    // Respect the special website image choices before generic photo maps.
    const image=name==='Vegan Dürüm'
      ?'assets/wrap-cutouts/vegan-transparent.webp'
      :name==='Layali Lübnan'
      ?'assets/dessert-cutouts/lubnan-geceleri-poster-bowl.webp'
      :(photos[name]??drinks[name]?.source??photoMap[name]??null);
    asset(image,name);
    return {
      id:byName[name],
      category,
      name:trilingual(name,en,arName,name),
      displayName:trilingual(display?.[0]??name,display?.[1]??en,arName,name),
      description:trilingual(descriptionTr,descriptionEn,arDescription,name),
      price:priceNames.get(name).price,
      active:priceNames.get(name).active!==false,
      image
    };
  });
  assert(Array.isArray(campaigns),'Campaigns are not an array');
  for(const campaign of campaigns){
    asset(campaign.poster,campaign.id);
    asset(campaign.thumbnail,campaign.id);
  }
  return {
    registry:{
      schemaVersion:1,
      nextId,
      byName:Object.fromEntries(Object.entries(byName).sort((a,b)=>a[1]-b[1]))
    },
    catalog:{
      schemaVersion:1,
      source:'nohutfalafel/qr-menu',
      currency:'TRY',
      categories:catalogCategories,
      products,
      campaigns
    }
  };
}
export function serializeCatalog(){
  const {catalog,registry}=buildCatalog();
  return {
    catalog:JSON.stringify(catalog,null,2)+'\n',
    registry:JSON.stringify(registry,null,2)+'\n'
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const mode=process.argv[2]??'--check';
  assert(['--write','--check'].includes(mode),'Use --write or --check');
  const result=serializeCatalog();
  for(const [filename,generated] of [[idsPath,result.registry],[catalogPath,result.catalog]]){
    if(mode==='--write')fs.writeFileSync(filename,generated,'utf8');
    else assert(fs.existsSync(filename)&&fs.readFileSync(filename,'utf8')===generated,
      path.relative(root,filename)+' is stale. Run node scripts/generate-catalog.mjs --write');
  }
  console.log('Catalog '+mode+': '+buildCatalog().catalog.products.length+
    ' products and '+buildCatalog().catalog.campaigns.length+' campaigns');
}
