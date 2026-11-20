'use strict';
// A versioned, human-editable overlay. Existing menu scripts remain offline fallback.
// Never includes auth keys; publication happens on the private POS publisher bridge.
(async () => {
  try {
    await (window.nohutLegacyCmsReady || Promise.resolve());
    // Versioned marker avoids requesting a managed catalog before the first
    // confirmed POS publish. Existing QR website CMS remains authoritative.
    const statusResponse=await fetch('cms/pos-managed-status.json?v='+Date.now(),
      {cache:'no-store'});
    if(statusResponse.status===404||statusResponse.status===503)return;
    if(!statusResponse.ok)throw Error('Managed menu status HTTP '+statusResponse.status);
    const status=await statusResponse.json();
    if(status.schemaVersion!==1||typeof status.enabled!=='boolean')
      throw Error('Invalid managed menu status');
    if(!status.enabled)return;
    const response=await fetch('cms/pos-managed-menu.json?v='+Date.now(),
      {cache:'no-store'});
    if(response.status===404)return;
    if(!response.ok)throw Error('Managed menu HTTP '+response.status);
    const managed=await response.json();
    if(managed.schemaVersion!==1||managed.source!=='nohutfalafel/qr-menu'||
      !Array.isArray(managed.products)||!Array.isArray(managed.categories)||
      !Array.isArray(managed.campaigns))throw Error('Invalid POS CMS format');
    const baselineResponse=await fetch('cms/catalog-v1.json?v='+Date.now(),
      {cache:'no-store'});
    const baseline=baselineResponse.ok?await baselineResponse.json():{products:[]};
    const originalPhotos=new Map((baseline.products||[]).map(p=>[p.id,p.image]));
    const known=new Map(data.map(item=>[item[1],item]));
    const translations=new Map(),imageOverrides=new Map(),order=new Map();
    const categoriesById=new Map(categories.map(c=>[c[0],c]));
    const activeCategoryIds=[];
    for(const group of managed.categories){
      if(!/^[a-z][a-z0-9-]*$/.test(group.id))continue;
      let item=categoriesById.get(group.id);
      if(!item){
        item=[group.id,group.name.tr,group.name.en];categories.push(item);
        categoriesById.set(group.id,item);
      }
      item[1]=group.name.tr;item[2]=group.name.en;
      arabicMenu.categories[group.id]=group.name.ar;
      arabicMenu.descriptions[group.id]=group.description.ar;
      descriptions[group.id]=[group.description.tr,group.description.en];
      if(group.active!==false)activeCategoryIds.push(group.id);
    }
    if(!activeCategoryIds.includes('all'))activeCategoryIds.unshift('all');
    activeCategoryIds.sort((a,b)=>{
      const x=managed.categories.find(c=>c.id===a);
      const y=managed.categories.find(c=>c.id===b);
      return (x?.order??0)-(y?.order??0);
    });
    categoryOrder.splice(0,categoryOrder.length,...activeCategoryIds);
    if(!categoryOrder.includes(category))category='all';
    const visible=new Set();
    for(const p of managed.products){
      if(!Number.isInteger(p.id)||typeof p.legacyKey!=='string')continue;
      let item=known.get(p.legacyKey);
      if(!item){
        item=[p.category,p.legacyKey,p.name.en,p.price,
          p.description.tr,p.description.en,p.active,p.available];
        data.push(item);known.set(p.legacyKey,item);
      }else{
        item[0]=p.category;item[2]=p.name.en;item[3]=p.price;
        item[4]=p.description.tr;item[5]=p.description.en;
        item[6]=p.active;item[7]=p.available;
      }
      if(!activeCategoryIds.includes(p.category))item[6]=false;
      translations.set(p.legacyKey,p);
      order.set(p.legacyKey,p.order??0);
      if(p.image&&p.image!==originalPhotos.get(p.id))
        imageOverrides.set(p.legacyKey,p.image);
      visible.add(p.legacyKey);
    }
    for(const item of data){
      if(!visible.has(item[1]))item[6]=false;
    }
    window.nohutManagedTranslations=translations;
    window.nohutManagedImages=imageOverrides;
    window.nohutManagedOrder=order;
    window.nohutCampaigns=managed.campaigns;
    window.dispatchEvent(new Event('nohut:campaigns-updated'));
    renderCategories();
    renderMenu();
    window.dispatchEvent(new Event('nohut:managed-updated'));
  } catch(e){
    console.error('Nohut POS CMS fallback:',e.message);
  }
})();
