import {randomUUID,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createReport,citizenReport,updateReport,survey,book,availableSlots,statistics,hotspots,overdue,statuses} from './domain.mjs';
export function createApi(root,dataDir,getDb,save,reply,body){
 const staffSessions=new Map(),attempts=new Map();
 let password=process.env.STAFF_PASSWORD;
 if(!password){const file=path.join(dataDir,'initial-staff-password.txt');try{password=readFileSync(file,'utf8').trim();}catch(e){if(e.code!=='ENOENT')throw e;password=randomBytes(18).toString('base64url');writeFileSync(file,password,{mode:0o600});}console.log('Staff login password: read data/initial-staff-password.txt locally, or set STAFF_PASSWORD in .env.');}
 if(password.length<12)throw Error('STAFF_PASSWORD must contain at least 12 characters.');
 const salt=randomBytes(16),hash=scryptSync(password,salt,32);password=undefined;
 const cookie=(req,key)=>req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(key+'='))?.slice(key.length+1);
 const setCookie=(res,name,value,age)=>res.setHeader('Set-Cookie',`${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.PUBLIC_HTTPS==='true'?'; Secure':''}`);
 return async function api(req,res,url){
  const db=getDb(),p=url.pathname;
  if(!p.startsWith('/api/') && !['/','/app.js','/styles.css','/qr.png','/qr.svg','/qr-poster.png'].includes(p))return false;
  if(['POST','PATCH','DELETE'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`${process.env.PUBLIC_HTTPS==='true'?'https':'http'}://${req.headers.host}`){reply(res,403,{error:'Origin not allowed'});return true;}
  let sid=cookie(req,'citizen');
  if(!sid||!db.clients[sid]||Date.parse(db.clients[sid])<Date.now()){sid=randomUUID();db.clients[sid]=new Date(Date.now()+30*86400000).toISOString();if(p==='/') {setCookie(res,'citizen',sid,30*86400);save();}}
  const owner='demo:'+sid;
  if(req.method==='GET'&&['/','/app.js','/styles.css','/qr.png','/qr.svg','/qr-poster.png'].includes(p)){const name=p==='/'?'index.html':p.slice(1);reply(res,200,readFileSync(path.join(root,name)),p.endsWith('.png')?'image/png':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html; charset=utf-8');return true;}
  if(p==='/api/public'&&req.method==='GET'){reply(res,200,{stats:statistics(db),services:db.services.filter(s=>s.published),slots:availableSlots(db),pilot:true});return true;}
  if(p==='/api/staff/login'&&req.method==='POST'){
   const ip=req.socket.remoteAddress,entry=attempts.get(ip);if(entry&&entry.until>Date.now()&&entry.count>=5){reply(res,429,{error:'Too many attempts. Try again in 15 minutes.'});return true;}
   const data=JSON.parse((await body(req)).toString()||'{}');const candidate=scryptSync(String(data.password||'').slice(0,256),salt,32);
   if(!timingSafeEqual(candidate,hash)){const a=entry&&entry.until>Date.now()?entry:{count:0,until:Date.now()+900000};a.count++;attempts.set(ip,a);reply(res,401,{error:'Incorrect staff password.'});return true;}
   attempts.delete(ip);const token=randomBytes(32).toString('hex');staffSessions.set(token,Date.now()+8*3600000);setCookie(res,'staff',token,8*3600);reply(res,200,{ok:true});return true;
  }
  if(p.startsWith('/api/staff')){
   const token=cookie(req,'staff');if(!token||(staffSessions.get(token)||0)<Date.now()){reply(res,401,{error:'Staff login required.'});return true;}
   if(p==='/api/staff/logout'&&req.method==='POST'){staffSessions.delete(token);setCookie(res,'staff','',0);reply(res,200,{ok:true});return true;}
   if(req.method==='GET'&&p==='/api/staff'){reply(res,200,{reports:db.reports.map(r=>({...r,overdue:overdue(r)})),appointments:db.appointments.map(a=>({...a,slot:db.slots.find(s=>s.id===a.slotId)})),slots:db.slots,services:db.services,config:db.config,stats:statistics(db),hotspots:hotspots(db),statuses});return true;}
   const data=JSON.parse((await body(req)).toString()||'{}');const snapshot=structuredClone(db);
   try{
    if(p.startsWith('/api/staff/reports/')&&req.method==='PATCH'){const r=updateReport(db,decodeURIComponent(p.split('/').pop()),data);save();reply(res,200,r);return true;}
    if(p==='/api/staff/config'&&req.method==='POST'){
     const hours=Number(data.slaHours);if(!Number.isInteger(hours)||hours<1||hours>8760)throw Error('Choose 1–8760 response hours.');
     if(!Array.isArray(data.routing)||data.routing.some(r=>!db.config.departments.includes(r.department)||typeof r.keywords!=='string'||r.keywords.length>500))throw Error('Invalid routing rules.');
     db.config.slaHours=hours;db.config.routing=data.routing;save();reply(res,200,{ok:true});return true;
    }
    if(p==='/api/staff/services'&&req.method==='POST'){
     const item={id:data.id||'SVC-'+randomUUID().slice(0,8),published:data.published===true};
     for(const k of ['name','department','requirements','fees','office','hours']){if(typeof data[k]!=='string'||!data[k].trim()||data[k].length>2000)throw Error('Complete every service field (up to 2,000 characters).');item[k]=data[k].trim();}
     if(!db.config.departments.includes(item.department))throw Error('Choose a department.');const i=db.services.findIndex(s=>s.id===item.id);if(i<0)db.services.push(item);else db.services[i]=item;save();reply(res,200,item);return true;
    }
    if(p==='/api/staff/slots'&&req.method==='POST'){
     const start=Date.parse(data.startsAt),capacity=Number(data.capacity);if(!Number.isFinite(start)||start<=Date.now()||!Number.isInteger(capacity)||capacity<1||capacity>100)throw Error('Choose a future date and capacity between 1 and 100.');
     if(!String(data.office||'').trim()||!String(data.location||'').trim()||data.office.length>200||data.location.length>300)throw Error('Enter office and location.');
     if(db.slots.some(s=>s.office===data.office.trim()&&s.startsAt===new Date(start).toISOString()&&!s.disabled))throw Error('This office already has a slot at that time.');
     const slot={id:'SLOT-'+randomUUID().slice(0,6).toUpperCase(),office:data.office.trim(),location:data.location.trim(),startsAt:new Date(start).toISOString(),capacity};db.slots.push(slot);save();reply(res,200,slot);return true;
    }
    if(p.startsWith('/api/staff/slots/')&&req.method==='PATCH'){const slot=db.slots.find(s=>s.id===p.split('/').pop());if(!slot)throw Error('Slot not found.');slot.disabled=!!data.disabled;save();reply(res,200,{ok:true});return true;}
    if(p.startsWith('/api/staff/appointments/')&&req.method==='PATCH'){const a=db.appointments.find(a=>a.id===p.split('/').pop());if(!a||!['Booked','Completed','Cancelled'].includes(data.status))throw Error('Invalid appointment update.');if(data.status==='Booked'&&a.status==='Cancelled')throw Error('A cancelled appointment cannot be reopened.');a.status=data.status;save();reply(res,200,{ok:true});return true;}
   }catch(e){for(const k of Object.keys(db))delete db[k];Object.assign(db,snapshot);reply(res,400,{error:e.message});return true;}
   reply(res,404,{error:'Not found'});return true;
  }
  if(!cookie(req,'citizen')||!db.clients[cookie(req,'citizen')]){reply(res,401,{error:'Open the application first.'});return true;}
  try{
   if(req.method==='GET'&&p==='/api/mine'){reply(res,200,{reports:db.reports.filter(r=>r.owner===owner).map(citizenReport),appointments:db.appointments.filter(a=>a.owner===owner).map(a=>({...a,slot:db.slots.find(s=>s.id===a.slotId)}))});return true;}
   if(req.method==='GET'&&p==='/api/track'){const r=db.reports.find(r=>r.owner===owner&&r.id===url.searchParams.get('reference')?.toUpperCase());if(!r){reply(res,404,{error:'No report found for this browser identity. WhatsApp reports must be tracked in their original WhatsApp conversation.'});return true;}reply(res,200,citizenReport(r));return true;}
   if(p==='/api/chat')return false;
   const data=JSON.parse((await body(req)).toString()||'{}');
   if(p==='/api/reports'&&req.method==='POST'){if(data.consent!==true)throw Error('Consent is required to save a report.');const r=createReport(db,owner,data);save();reply(res,200,citizenReport(r));return true;}
   if(p==='/api/surveys'&&req.method==='POST'){const result=survey(db,owner,data.reference,Number(data.rating),data.comment);save();reply(res,200,result);return true;}
   if(p==='/api/appointments'&&req.method==='POST'){const a=book(db,owner,data.slotId);save();reply(res,200,a);return true;}
   if(p.startsWith('/api/appointments/')&&req.method==='DELETE'){const a=db.appointments.find(a=>a.id===p.split('/').pop()&&a.owner===owner);if(!a||a.status!=='Booked')throw Error('Booked appointment not found.');a.status='Cancelled';save();reply(res,200,{ok:true});return true;}
  }catch(e){reply(res,400,{error:e.message});return true;}
  reply(res,404,{error:'Not found'});return true;
 };
}
