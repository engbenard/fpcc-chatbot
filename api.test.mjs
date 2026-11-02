import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
test('HTTP workflow: protected staff, citizen ownership, routing, resolve, survey, directory and bookings',async()=>{
 const root=path.dirname(fileURLToPath(import.meta.url));mkdirSync(path.join(root,'data'),{recursive:true});const dir=mkdtempSync(path.join(root,'data','test-'));let child;
 try{
  child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir,STAFF_PASSWORD:'test-only-password-2026',META_APP_SECRET:'test-secret',WHATSAPP_ACCESS_TOKEN:'fake-token',WHATSAPP_PHONE_NUMBER_ID:'fake-id',GRAPH_API_VERSION:'v-test'},stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',c=>console.error(String(c)));
  const base=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Server startup timed out')),10000);child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:(\d+)/);if(match){clearTimeout(timeout);resolve(match[0]);}});child.once('exit',code=>reject(Error('Server exited '+code)));});
  const getCookie=async()=>{const r=await fetch(base).catch(e=>{throw Error(base+' '+e.cause?.message);});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const alice=await getCookie(),bob=await getCookie();
  for(const name of ['qr.png','qr-poster.png','qr.svg']){const asset=await fetch(base+'/'+name);assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),name.endsWith('.svg')?'image/svg+xml':'image/png');const bytes=Buffer.from(await asset.arrayBuffer());assert.ok(bytes.length>100);if(name.endsWith('.png'))assert.equal(bytes.subarray(1,4).toString(),'PNG');}

  async function call(p,method='GET',data,cookie=alice){const r=await fetch(base+p,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  assert.equal((await call('/api/staff')).status,401);
  assert.equal((await call('/api/staff/login','POST',{password:'wrong'})).status,401);
  const staff=(await call('/api/staff/login','POST',{password:'test-only-password-2026'})).cookie;assert.ok(staff);
  const r=(await call('/api/reports','POST',{location:'Market road',description:'Overflowing waste bin at the market',lat:.67,lng:30.28,consent:true})).data;
  assert.equal(r.department,'Environment & sanitation');
  assert.equal((await call('/api/track?reference='+r.id,'GET',null,bob)).status,404);
  assert.equal((await call('/api/surveys','POST',{reference:r.id,rating:5})).status,400);
  assert.equal((await call('/api/staff/reports/'+r.id,'PATCH',{status:'Resolved'},staff)).status,400);
  assert.equal((await call('/api/staff/reports/'+r.id,'PATCH',{status:'Resolved',resolution:'Waste collected',assignee:'Test officer'},staff)).status,200);
  assert.equal((await call('/api/track?reference='+r.id)).data.surveyRequested,true);
  assert.equal((await call('/api/surveys','POST',{reference:r.id,rating:5,comment:'Thank you'})).status,200);
  assert.equal((await call('/api/surveys','POST',{reference:r.id,rating:4})).status,400);
  const service={name:'Pilot service',department:'ICT',requirements:'Bring application reference',fees:'No fee for this test',office:'Test desk',hours:'By appointment',published:true};
  assert.equal((await call('/api/staff/services','POST',service,staff)).status,200);
  const slot=(await call('/api/staff/slots','POST',{office:'ICT test desk',location:'Test location',startsAt:new Date(Date.now()+86400000).toISOString(),capacity:1},staff)).data;
  const booking=await call('/api/appointments','POST',{slotId:slot.id});assert.equal(booking.status,200);
  assert.equal((await call('/api/appointments','POST',{slotId:slot.id},bob)).status,400);
  assert.equal((await call('/api/appointments/'+booking.data.id,'DELETE')).status,200);
  assert.equal((await call('/api/appointments','POST',{slotId:slot.id},bob)).status,200);
  const pub=JSON.stringify((await call('/api/public','GET',null,null)).data);assert.ok(!pub.includes(r.id));assert.ok(!pub.includes('Overflowing'));assert.ok(!pub.includes('Test officer'));assert.ok(pub.includes('Pilot service'));
  const spoofed=await fetch(base+'/api/staff/config',{method:'POST',headers:{Cookie:staff,Origin:'https://attacker.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(spoofed.status,403);
  assert.equal((await fetch(base+'/webhook',{method:'POST',body:'{}',headers:{'x-hub-signature-256':'sha256=bad'}})).status,401);
  const saved=JSON.parse(readFileSync(path.join(dir,'store.json'),'utf8'));assert.equal(saved.reports[0].survey.rating,5);assert.equal(saved.appointments.length,2);
 }finally{if(child&&!child.killed){child.kill();await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,1500);});}rmSync(dir,{recursive:true,force:true});}
});
