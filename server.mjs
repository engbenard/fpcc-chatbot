import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { respond } from './bot.mjs';
import { init } from './domain.mjs';
import { createApi } from './api.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir=process.env.DATA_DIR||path.join(root,'data');
mkdirSync(dataDir, {recursive:true});
const store = path.join(dataDir,'store.json');
let db;
try { db = JSON.parse(readFileSync(store,'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; db = {sessions:{},reports:[],processed:[]}; }
if(db.reports?.some(r=>!r.department)) writeFileSync(path.join(dataDir,`store-before-v2-${Date.now()}.json`),JSON.stringify(db,null,2));
init(db);
function save() { writeFileSync(store+'.tmp',JSON.stringify(db,null,2)); renameSync(store+'.tmp',store); }
function reply(res,status,data,type='application/json') { res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(type==='application/json'?JSON.stringify(data):data); }
async function body(req) { const chunks=[]; let size=0; for await (const c of req) { size+=c.length; if(size>65536) throw Error('Body too large'); chunks.push(c); } return Buffer.concat(chunks); }
const api=createApi(root,dataDir,()=>db,save,reply,body);
let queue=Promise.resolve();
const handler=async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(await api(req,res,url)) return;
  if(req.method==='GET' && url.pathname==='/health') return reply(res,200,{ok:true,mode:'prototype'});
  if(req.method==='POST' && url.pathname==='/api/chat') {
    if(process.env.ENABLE_DEMO==='false') return reply(res,404,{error:'Disabled'});
    const sid=req.headers.cookie?.match(/(?:^|; )citizen=([a-f0-9-]+)/)?.[1];
    if(!db.clients[sid]) return reply(res,401,{error:'Open the demo page first.'});
    const data=JSON.parse((await body(req)).toString());
    if(typeof data.message!=='string'||data.message.length>2000) return reply(res,400,{error:'Enter up to 2,000 characters.'});
    const answer=respond(db,'demo:'+sid,data.message); save(); return reply(res,200,{reply:answer});
  }
  if(req.method==='GET' && url.pathname==='/webhook') {
    if(process.env.WHATSAPP_VERIFY_TOKEN && url.searchParams.get('hub.mode')==='subscribe' && url.searchParams.get('hub.verify_token')===process.env.WHATSAPP_VERIFY_TOKEN) return reply(res,200,url.searchParams.get('hub.challenge')||'','text/plain');
    return reply(res,403,{error:'Verification failed'});
  }
  if(req.method==='POST' && url.pathname==='/webhook') {
    const required=['META_APP_SECRET','WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','GRAPH_API_VERSION'];
    if(required.some(k=>!process.env[k])) return reply(res,503,{error:'WhatsApp is not configured'});
    const raw=await body(req), expected='sha256='+createHmac('sha256',process.env.META_APP_SECRET).update(raw).digest('hex');
    const provided=String(req.headers['x-hub-signature-256']||'');
    if(provided.length!==expected.length||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected))) return reply(res,401,{error:'Invalid signature'});
    const payload=JSON.parse(raw.toString());
    const task=async()=>{
      for(const entry of payload.entry||[]) for(const change of entry.changes||[]) {
        if(change.value?.metadata?.phone_number_id!==process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
        for(const message of change.value?.messages||[]) {
          if(!message.id||!message.from||db.processed.includes(message.id)) continue;
          const snapshot=structuredClone(db);
          try {
            const answer=message.type==='text'?respond(db,message.from,message.text?.body||''):message.type==='location'&&db.sessions[message.from]?.step==='location'?respond(db,message.from,`${message.location.latitude},${message.location.longitude} | ${message.location.name||message.location.address||'Shared map location'}`):'Please send a text message, or share a location when prompted. Type MENU for options.';
            const response=await fetch(`https://graph.facebook.com/${process.env.GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:'POST',headers:{Authorization:`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:message.from,type:'text',text:{body:answer}}),signal:AbortSignal.timeout(10000)});
            if(!response.ok) throw Error(`Meta send failed (${response.status})`);
            db.processed.push(message.id); db.processed=db.processed.slice(-10000); save();
          } catch(e) { db=snapshot; throw e; }
        }
      }
    };
    await task();
    return reply(res,200,{ok:true});
  }
  reply(res,404,{error:'Not found'});
 } catch(e) { console.error(e.message); reply(res,500,{error:'Unable to process request. Please try again.'}); }
};
const server=http.createServer((req,res)=>{ queue=queue.then(()=>handler(req,res),()=>handler(req,res)); });
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`Chatbot running at http://${process.env.HOST||'127.0.0.1'}:${server.address().port}`));
