import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildCatalog,serializeCatalog} from './generate-catalog.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const catalog=read('cms/catalog-v1.json');
const registry=read('cms/product-ids.json');
const cms=read('cms/menu-prices.json');
const campaigns=read('cms/campaigns.json');

test('generated catalog matches current QR source exactly',()=>{
  assert.equal(
    fs.readFileSync(path.join(root,'cms/catalog-v1.json'),'utf8'),
    serializeCatalog().catalog
  );
  assert.equal(
    fs.readFileSync(path.join(root,'cms/product-ids.json'),'utf8'),
    serializeCatalog().registry
  );
  // vm-created source literals can have cross-realm prototypes.
  assert.deepEqual(catalog,JSON.parse(JSON.stringify(buildCatalog().catalog)));
});

test('stable IDs retain Flutter legacy 0–50 and reserve 51,52 for additions',()=>{
  assert.equal(catalog.schemaVersion,1);
  assert.equal(registry.schemaVersion,1);
  const ids=catalog.products.map(product=>product.id);
  assert.ok(ids.length>=53);
  assert.equal(new Set(ids).size,ids.length);
  assert.deepEqual([...ids].sort((a,b)=>a-b),Array.from({length:ids.length},(_,n)=>n));
  const byName=Object.fromEntries(
    catalog.products.map(product=>[product.name.tr,product.id])
  );
  assert.equal(byName['Falafel Dürüm'],0);
  assert.equal(byName['Vegan Dürüm'],51);
  assert.equal(byName['Layali Lübnan'],52);
  for(const product of catalog.products){
    assert.equal(product.id,registry.byName[product.name.tr]);
  }
  assert.ok(registry.nextId>=53);
});

test('preserves three languages and the website visible drink labels',()=>{
  for(const product of catalog.products){
    for(const language of ['tr','en','ar']){
      assert.ok(product.name[language]?.length>0);
      assert.ok(product.displayName[language]?.length>0);
      assert.equal(typeof product.description[language],'string');
    }
  }
  assert.equal(
    catalog.products.find(p=>p.name.tr==='Büyük Ayran').displayName.tr,
    'Eker Ayran (Büyük)'
  );
  assert.equal(catalog.products.find(p=>p.name.tr==='Layali Lübnan').name.ar,
    'ليالي لبنان');
});

test('prices and campaigns stay identical to existing CMS source',()=>{
  for(const [category,rows] of Object.entries(cms)){
    for(const row of rows){
      const product=catalog.products.find(p=>p.name.tr===row.name);
      assert.ok(product,'Missing '+row.name);
      assert.equal(product.price,row.price);
      assert.equal(product.category,category);
    }
  }
  assert.deepEqual(catalog.campaigns,campaigns);
});

test('all directly exposed product and campaign image assets exist',()=>{
  for(const product of catalog.products){
    if(product.image===null)continue;
    assert.match(product.image,/^assets\//);
    assert.ok(fs.existsSync(path.join(root,product.image)),product.image);
  }
  for(const campaign of catalog.campaigns){
    for(const file of [campaign.poster,campaign.thumbnail]){
      assert.ok(fs.existsSync(path.join(root,file)),file);
    }
  }
});


test('Şambali is hidden, reversible, and retains historic stable ID 32',()=>{
  const dessert=cms.dessert;
  const row=dessert.find(p=>p.name==='Şambali Tatlısı');
  assert.ok(row);
  assert.equal(row.price,70);
  assert.equal(row.active,false);
  const archived=catalog.products.find(p=>p.name.tr==='Şambali Tatlısı');
  assert.ok(archived);
  assert.equal(archived.id,32);
  assert.equal(archived.active,false);
  assert.equal(registry.byName['Şambali Tatlısı'],32);
  assert.equal(catalog.products.length,55);
  assert.equal(catalog.products.filter(p=>p.active!==false).length,54);
  assert.equal(catalog.products.filter(p=>p.category==='dessert' && p.active!==false).length,2);
  const fallback=fs.readFileSync(path.join(root,'menu-data.js'),'utf8');
  const renderer=fs.readFileSync(path.join(root,'menu.js'),'utf8');
  const cmsUpdater=fs.readFileSync(path.join(root,'cms-live.js'),'utf8');
  assert.match(fallback,/\['dessert','Şambali Tatlısı'[^\n]*,false\]/);
  assert.match(renderer,/item\[6\]!==false/);
  assert.match(cmsUpdater,/change\.active/);
});


test('Karışık Meze Tabağı uses the approved square image and keeps its product data',()=>{
  const photoPath='assets/meze-cutouts/karisik-meze-tabagi-20261114.webp';
  const dish=catalog.products.find(p=>p.id===21);
  assert.equal(dish?.name.tr,'Karışık Meze Tabağı');
  assert.equal(dish?.price,200);
  assert.equal(dish?.active,true);
  assert.equal(dish?.image,photoPath);
  const binary=fs.readFileSync(path.join(root,photoPath));
  assert.equal(binary.subarray(0,4).toString('ascii'),'RIFF');
  assert.equal(binary.subarray(8,12).toString('ascii'),'WEBP');
  assert.equal(binary.readUInt32LE(4)+8,binary.length);
  const gitBlobHeader=Buffer.concat([Buffer.from('blob '+binary.length),Buffer.from([0])]);
  assert.equal(createHash('sha1').update(gitBlobHeader).update(binary).digest('hex'),
    '6bd0956e9561337b74a0aa3d3a61810e2dd70cde');
  const renderer=fs.readFileSync(path.join(root,'menu.js'),'utf8');
  assert.ok(renderer.includes('"Karışık Meze Tabağı": "'+photoPath+'"'));
});


test('1 Adet Falafel appears in Diğer for 15 TL with new permanent ID',()=>{
  const item=catalog.products.find(p=>p.id===53);
  assert.ok(item);
  assert.equal(registry.byName['1 Adet Falafel'],53);
  assert.equal(registry.nextId,55);
  assert.equal(item.category,'side');
  assert.equal(item.price,15);
  assert.equal(item.active,true);
  assert.deepEqual(item.name,{
    tr:'1 Adet Falafel',en:'1 Falafel Piece',ar:'حبة فلافل واحدة'
  });
  assert.equal(item.description.ar,'حبة فلافل مقرمشة');
  assert.equal(item.image,'assets/side-cutouts/falafel-1-adet-20261114.webp');
  const sideRow=cms.side.find(p=>p.name==='1 Adet Falafel');
  assert.equal(sideRow?.price,15);
  assert.equal(cms.side.length,9);
  const image=fs.readFileSync(path.join(root,item.image));
  assert.equal(image.subarray(0,4).toString('ascii'),'RIFF');
  assert.equal(image.subarray(8,12).toString('ascii'),'WEBP');
  assert.equal(image.readUInt32LE(4)+8,image.length);
  const menuData=fs.readFileSync(path.join(root,'menu-data.js'),'utf8');
  assert.match(menuData,/\['side','1 Adet Falafel','1 Falafel Piece',15/);
  const renderer=fs.readFileSync(path.join(root,'menu.js'),'utf8');
  assert.ok(renderer.includes('"1 Adet Falafel": "'+item.image+'"'));
});


test('İçli Köfte is offered as one transparent cutout for 110 TL',()=>{
  const item=catalog.products.find(p=>p.id===54);
  assert.equal(item?.name.tr,'İçli Köfte (1 Adet)');
  assert.equal(item.category,'side');
  assert.equal(item.price,110);
  assert.equal(item.name.en,'Kibbeh (1 Piece)');
  assert.equal(item.name.ar,'كبة (حبة واحدة)');
  assert.equal(item.image,'assets/side-cutouts/kibbe-1-adet-transparent.svg');
  assert.equal(registry.byName['İçli Köfte (1 Adet)'],54);
  assert.equal(cms.side.find(p=>p.name==='İçli Köfte (1 Adet)')?.price,110);
  const image=fs.readFileSync(path.join(root,item.image),'utf8');
  assert.match(image,/<svg /);
  assert.match(image,/clipPath/);
});
