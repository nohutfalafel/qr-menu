'use strict';
(() => {
 const section=document.getElementById('campaigns');
 const list=document.getElementById('campaignsList');
 const pagination=document.getElementById('campaignsPagination');
 const viewer=document.getElementById('campaignViewer');
 if(!section||!list||!pagination||!viewer)return;
 const poster=viewer.querySelector('img');
 const viewerTitle=document.getElementById('campaignViewerTitle');
 const closeButton=viewer.querySelector('button');
 const sidePhoto=document.createElement('img');
 sidePhoto.className='campaign-viewer-side';
 sidePhoto.hidden=true;
 poster.after(sidePhoto);
 const copy={
  tr:{heading:'Kampanyalar',eyebrow:'GÜNCEL KAMPANYA',details:'Afişi görüntüle',close:'Kapat',poster:'kampanya afişi',navigation:'Kampanya seç'},
  ar:{heading:'عروضنا',eyebrow:'عرضنا الحالي',details:'شاهد تفاصيل العرض',close:'إغلاق',poster:'ملصق العرض',navigation:'اختر عرضًا'},
  en:{heading:'Special Offers',eyebrow:'CURRENT OFFER',details:'View offer poster',close:'Close',poster:'offer poster',navigation:'Choose an offer'}
 };
 const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const language=()=>Object.hasOwn(copy,document.documentElement.lang)?document.documentElement.lang:'tr';
 const translated=(value,lang)=>value?.[lang]||value?.tr||'';
 let campaigns=[];
 let returnFocus=null;
 let renderedKey='';
 function isActive(campaign,now){
  if(campaign.active!==true)return false;
  for(const field of ['startsAt','endsAt'])if(campaign[field]&&Number.isNaN(Date.parse(campaign[field])))return false;
  return (!campaign.startsAt||now>=Date.parse(campaign.startsAt))&&(!campaign.endsAt||now<Date.parse(campaign.endsAt));
 }
 function campaignPosition(index){
  const first=list.firstElementChild.getBoundingClientRect();
  const card=list.children[index].getBoundingClientRect();
  const distance=Math.abs(card.left-first.left);
  return Math.min(distance,list.scrollWidth-list.clientWidth);
 }
 function updatePagination(){
  const offset=Math.abs(list.scrollLeft);
  let current=0;
  let nearest=Infinity;
  Array.from(pagination.children).forEach((button,index)=>{
   const distance=Math.abs(campaignPosition(index)-offset);
   if(distance<nearest){
    nearest=distance;
    current=index;
   }
  });
  Array.from(pagination.children).forEach((button,index)=>{
   if(index===current)button.setAttribute('aria-current','true');
   else button.removeAttribute('aria-current');
  });
 }
 function render(){
  const lang=language(),t=copy[lang],now=Date.now();
  campaigns=(Array.isArray(window.nohutCampaigns)?window.nohutCampaigns:[]).filter(c=>isActive(c,now));
  const key=JSON.stringify([lang,campaigns]);
  if(key===renderedKey)return;
  renderedKey=key;
  section.hidden=campaigns.length===0;
  document.getElementById('campaignsTitle').textContent=t.heading;
  closeButton.setAttribute('aria-label',t.close);
  list.innerHTML=campaigns.map((c,index)=>{
   const title=translated(c.title,lang),alt=title+' — '+t.poster;
   return `<article class="campaign-card" aria-labelledby="campaignTitle${index}">
    <button class="campaign-poster-button" type="button" data-campaign="${index}" aria-label="${escape(t.details+': '+title)}" aria-haspopup="dialog" aria-controls="campaignViewer"><img class="campaign-poster" src="${escape(c.thumbnail||c.poster)}" alt="${escape(alt)}" width="144" height="216" decoding="async">${c.id==='lubnan-geceleri-150'?`<span class="campaign-new">${lang==='ar'?'جديد':lang==='en'?'NEW':'YENİ'}</span>`:''}<span class="campaign-image-hint" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M10 7v6M7 10h6"/></svg></span></button>
    <div class="campaign-copy"><span class="campaign-eyebrow">${escape(translated(c.eyebrow,lang)||t.eyebrow)}</span><h3 class="campaign-title" id="campaignTitle${index}">${escape(title)}</h3><p class="campaign-description">${escape(translated(c.description,lang))}</p><ul class="campaign-items">${c.items.map(item=>'<li>'+escape(translated(item,lang))+'</li>').join('')}</ul></div>
    <div class="campaign-action"><div class="campaign-price" dir="ltr">${escape(c.price)}<small>TL</small></div><button class="campaign-detail-button" type="button" data-campaign="${index}" aria-haspopup="dialog" aria-controls="campaignViewer">${t.details}</button></div>
   </article>`;
  }).join('');
  pagination.setAttribute('aria-label',t.navigation);
  pagination.innerHTML=campaigns.length>1?campaigns.map((c,index)=>
   `<button type="button" data-slide="${index}" aria-label="${escape(translated(c.title,lang))}" aria-controls="campaignTitle${index}">${index+1}</button>`
  ).join(''):'';
  updatePagination();
 }
 pagination.addEventListener('click',event=>{
  const button=event.target.closest('[data-slide]');
  if(!button)return;
  const direction=document.documentElement.dir==='rtl'?-1:1;
  const behavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
  list.scrollTo({left:direction*campaignPosition(Number(button.dataset.slide)),behavior});
 });
 list.addEventListener('scroll',updatePagination,{passive:true});
 window.addEventListener('resize',updatePagination);
 list.addEventListener('click',event=>{
  const button=event.target.closest('[data-campaign]');if(!button)return;
  const campaign=campaigns[Number(button.dataset.campaign)];if(!campaign)return;
  const lang=language(),title=translated(campaign.title,lang);
  poster.src=campaign.poster;poster.alt=title+' — '+copy[lang].poster;
  sidePhoto.hidden=true;
  viewer.classList.remove('campaign-viewer-gallery');
  viewerTitle.textContent=title;
  returnFocus=button;
  viewer.showModal();document.documentElement.classList.add('campaign-modal-open');
 });
 closeButton.addEventListener('click',()=>viewer.close());
 viewer.addEventListener('click',event=>{if(event.target===viewer)viewer.close();});
 viewer.addEventListener('close',()=>{document.documentElement.classList.remove('campaign-modal-open');if(returnFocus?.isConnected)returnFocus.focus();});
 window.addEventListener('nohut:campaigns-updated', render);
 new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 render();
 // Hide offers at their configured expiry even if the page stays open.
 setInterval(render,60000);
})();
