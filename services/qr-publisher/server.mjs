// Nohut QR Publisher • Node 22+ • private localhost bridge, never ship private keys with POS.
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {createSign,timingSafeEqual} from 'node:crypto';

const repo='nohutfalafel/qr-menu',branch='main',api='https://api.github.com';
const appId=process.env.GITHUB_APP_ID || '5845851';
const privateKey=(process.env.GITHUB_APP_PRIVATE_KEY_FILE
  ? readFileSync(process.env.GITHUB_APP_PRIVATE_KEY_FILE,'utf8')
  : process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g,'\n');
const adminToken=process.env.QR_PUBLISH_ADMIN_TOKEN || '';
const port=Number(process.env.QR_PUBLISH_PORT || '8787');
if(!privateKey.includes('BEGIN')||adminToken.length<32) {
  throw new Error('Set GITHUB_APP_PRIVATE_KEY_FILE and QR_PUBLISH_ADMIN_TOKEN (32+ characters).');
}
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid port');
const headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'NohutQrPublisher/1'};
const fail=(status,message)=>Object.assign(new Error(message),{status});
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt() {
  const now=Math.floor(Date.now()/1000);
  const payload=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iat:now-60,exp:now+480,iss:appId});
  const sign=createSign('RSA-SHA256');sign.update(payload);sign.end();
  return payload+'.'+sign.sign(privateKey).toString('base64url');
}
async function github(path,token,{method='GET',body,allow404=false}={}) {
  const res=await fetch(api+path,{
    method,headers:{...headers,'Authorization':'Bearer '+token,
      ...(body===undefined?{}:{'Content-Type':'application/json'})},
    body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(25000),
  });
  if(res.status===404&&allow404)return null;
  const result=await res.json().catch(()=>({}));
  if(!res.ok)throw fail(res.status===409||res.status===422?409:502,
    'GitHub HTTP '+res.status+(res.status===409?' · İçerik değişti, yeniden yükleyin.':''));
  return result;
}
let tokenCache=null,installationId=process.env.GITHUB_INSTALLATION_ID||null;
async function installationToken() {
  if(tokenCache && tokenCache.until>Date.now()+60000)return tokenCache.value;
  if(!installationId) {
    const i=await github('/repos/'+repo+'/installation',jwt());
    installationId=String(i.id);
  }
  const value=await github('/app/installations/'+installationId+'/access_tokens',jwt(),
    {method:'POST',body:{repositories:['qr-menu'],permissions:{contents:'write'}}});
  tokenCache={value:value.token,until:Date.parse(value.expires_at)};
  return value.token;
}
const pathFor=path=>'/repos/'+repo+'/contents/'+path+'?ref='+branch;
async function getFile(path,token,allow404=false) {
  const result=await github(pathFor(path),token,{allow404});
  if(!result)return null;
  if(result.encoding!=='base64'||typeof result.content!=='string')throw fail(502,'GitHub dosya biçimi desteklenmiyor.');
  return {sha:result.sha,text:Buffer.from(result.content.replace(/\s/g,''),'base64').toString('utf8')};
}
const multilingual=(v,required=false,max=2500)=>v&&typeof v==='object'&&
  ['tr','en','ar'].every(lang=>typeof v[lang]==='string'&&v[lang].length<=max&&
    (!required||v[lang].trim().length>0));
const safeAsset=value=>value===null||(typeof value==='string'&&
  /^assets\/[A-Za-z0-9_./-]+\.(png|jpg|jpeg|webp|svg)$/.test(value)&&
  !value.includes('..')&&!value.includes('//'));
const goodPrice=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000&&
  Math.round(v*100)===v*100;
function validate(menu,previous) {
  if(!menu||menu.schemaVersion!==1||menu.source!==repo||menu.currency!=='TRY'||
    !Array.isArray(menu.categories)||!Array.isArray(menu.products)||
    !Array.isArray(menu.campaigns)||menu.products.length<1||
    menu.products.length>500||menu.categories.length<2||
    menu.categories.length>80||menu.campaigns.length>100)throw fail(422,'Katalog şeması geçersiz.');
  const ids=new Set(),categoryIds=new Set(),names=new Set(),campaigns=new Set();
  for(const category of menu.categories) {
    if(!category||typeof category.id!=='string'||!/^[a-z][a-z0-9-]{0,49}$/.test(category.id)||
      categoryIds.has(category.id)||!multilingual(category.name,true)||
      !multilingual(category.description)||typeof category.active!=='boolean'||
      !Number.isInteger(category.order)||category.order<0)
      throw fail(422,'Geçersiz kategori.');
    categoryIds.add(category.id);
  }
  if(!categoryIds.has('all')||menu.categories.find(c=>c.id==='all')?.active!==true)
    throw fail(422,'Tümü kategorisi etkin kalmalı.');
  for(const product of menu.products) {
    if(!product||!Number.isInteger(product.id)||product.id<0||product.id>1000000||
      ids.has(product.id)||!categoryIds.has(product.category)||product.category==='all'||
      !multilingual(product.name,true)||!multilingual(product.displayName,true)||
      !multilingual(product.description)||!goodPrice(product.price)||
      typeof product.active!=='boolean'||typeof product.available!=='boolean'||
      !safeAsset(product.image)||!Number.isInteger(product.order)||product.order<0||
      typeof product.legacyKey!=='string'||product.legacyKey.length<1||
      product.legacyKey.length>150||names.has(product.name.tr.trim().toLowerCase()))
      throw fail(422,'Geçersiz ürün: '+String(product?.name?.tr??product?.id));
    ids.add(product.id);names.add(product.name.tr.trim().toLowerCase());
  }
  if(previous) {
    const before=new Map(previous.products.map(p=>[p.id,p]));
    for(const [id,p] of before) {
      const now=menu.products.find(x=>x.id===id);
      if(!now||now.legacyKey!==p.legacyKey)throw fail(422,'Ürün kimliği silinemez veya değiştirilemez: '+id);
    }
    for(const c of previous.categories) {
      if(!menu.categories.some(x=>x.id===c.id))throw fail(422,'Kategori kimliği silinemez: '+c.id);
    }
  }
  for(const campaign of menu.campaigns) {
    if(!campaign||typeof campaign.id!=='string'||
      !/^[a-z0-9-]{1,70}$/.test(campaign.id)||campaigns.has(campaign.id)||
      typeof campaign.active!=='boolean'||!goodPrice(campaign.price)||
      !multilingual(campaign.title,true)||!multilingual(campaign.description)||
      !Array.isArray(campaign.items)||campaign.items.length>100||
      !campaign.items.every(i=>multilingual(i,true))||
      !safeAsset(campaign.poster)||!safeAsset(campaign.thumbnail))
      throw fail(422,'Geçersiz kampanya.');
    campaigns.add(campaign.id);
  }
  return menu;
}
function bootstrap(catalog) {
  return {...catalog,
    categories:catalog.categories.map((c,i)=>({...c,active:true,order:i})),
    products:catalog.products.map((p,i)=>({...p,available:true,
      legacyKey:p.name.tr,order:i})),
  };
}
async function currentCatalog(token) {
  const managed=await getFile('cms/pos-managed-menu.json',token,true);
  if(managed)return {revision:managed.sha,catalog:validate(JSON.parse(managed.text),null)};
  const catalog=await getFile('cms/catalog-v1.json',token);
  return {revision:'bootstrap:'+catalog.sha,
    catalog:bootstrap(JSON.parse(catalog.text))};
}
const authorized=req=>{
  const value=req.headers.authorization;
  if(typeof value!=='string'||!value.startsWith('Bearer '))return false;
  const a=Buffer.from(value.slice(7)),b=Buffer.from(adminToken);
  return a.length===b.length&&timingSafeEqual(a,b);
};
function respond(res,status,value) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(value));
}
async function readBody(req,max=800000) {
  let n=0,parts=[];
  for await(const chunk of req){
    n+=chunk.length;if(n>max)throw fail(413,'İstek çok büyük.');
    parts.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}
  catch(_){throw fail(400,'Geçersiz JSON.')}
}
let publishing=false;
const server=http.createServer(async(req,res)=>{
  try {
    if(req.method==='GET'&&req.url==='/health'){
      return respond(res,200,{service:'Nohut QR Publisher',status:'ready'});
    }
    if(!authorized(req))return respond(res,401,{error:'Yönetici anahtarı yanlış.'});
    if(req.method==='GET'&&req.url==='/catalog') {
      const result=await currentCatalog(await installationToken());
      return respond(res,200,result);
    }
    if(req.method==='POST'&&req.url==='/publish') {
      if(publishing)throw fail(409,'Başka bir yayın devam ediyor.');
      publishing=true;
      try {
        const data=await readBody(req);
        if(typeof data.revision!=='string'||!data.catalog)throw fail(400,'Sürüm ve katalog gerekli.');
        const token=await installationToken(),original=await currentCatalog(token);
        if(data.revision!==original.revision)throw fail(409,'Web menüsü değişti. Güncel sürümü yeniden alın.');
        const updated=validate(data.catalog,original.catalog);
        const body={message:'cms: publish Nohut POS QR menu changes',
          branch,content:Buffer.from(JSON.stringify(updated,null,2)+'\n').toString('base64')};
        if(!original.revision.startsWith('bootstrap:'))body.sha=original.revision;
        const commit=await github('/repos/'+repo+'/contents/cms/pos-managed-menu.json',
          token,{method:'PUT',body});
        return respond(res,200,{published:true,revision:commit.content.sha,
          commit:commit.commit?.sha,
          message:'GitHub dosyası kaydedildi. Pages dağıtımı ayrıca tamamlanmalıdır.'});
      }finally{publishing=false;}
    }
    if(req.method==='POST'&&req.url==='/image') {
      const data=await readBody(req,9000000);
      const ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'})[data.mime];
      if(!ext||typeof data.base64!=='string'||data.base64.length>8000000||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64))throw fail(422,'PNG/JPEG/WEBP resim gerekli.');
      const bytes=Buffer.from(data.base64,'base64');
      if(bytes.length===0||bytes.length>6000000)throw fail(422,'Resim en fazla 6 MB.');
      const path='assets/products/pos-'+Date.now()+'-'+Math.random().toString(16).slice(2,10)+'.'+ext;
      const result=await github('/repos/'+repo+'/contents/'+path,
        await installationToken(),{method:'PUT',body:{
          message:'cms: add QR product image',branch,content:bytes.toString('base64')}});
      return respond(res,200,{path,commit:result.commit?.sha});
    }
    respond(res,404,{error:'Bilinmeyen işlem.'});
  } catch(e) {
    respond(res,e.status||503,{error:e.status?e.message:
      'Yayın hizmeti başarısız. İşlem gönderilmeden önce bağlantıyı denetleyin.'});
  }
});
server.listen(port,'127.0.0.1',()=>{
  console.log('Nohut QR Publisher only on http://127.0.0.1:'+port);
});
