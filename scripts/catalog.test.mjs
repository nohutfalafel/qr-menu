import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
  assert.equal(catalog.products.length,53);
  assert.equal(catalog.products.filter(p=>p.active!==false).length,52);
  assert.equal(catalog.products.filter(p=>p.category==='dessert' && p.active!==false).length,2);
  const fallback=fs.readFileSync(path.join(root,'menu-data.js'),'utf8');
  const renderer=fs.readFileSync(path.join(root,'menu.js'),'utf8');
  const cmsUpdater=fs.readFileSync(path.join(root,'cms-live.js'),'utf8');
  assert.match(fallback,/\['dessert','Şambali Tatlısı'[^\n]*,false\]/);
  assert.match(renderer,/item\[6\]!==false/);
  assert.match(cmsUpdater,/change\.active/);
});
