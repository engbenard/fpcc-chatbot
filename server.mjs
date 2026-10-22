import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { respond } from './bot.mjs';
import {
  initialiseDatabase,
  listReports,
  getReportStats,
  updateReport
} from './db.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

mkdirSync(path.join(root,'data'), {recursive:true});
const store = path.join(root,'data/store.json');

let db;
try {
  db = JSON.parse(readFileSync(store,'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  db = {sessions:{},processed:[]};
}
db.sessions ||= {};
db.processed ||= [];

function save() {
  const localOnly = { sessions: db.sessions, processed: db.processed };
  writeFileSync(store+'.tmp',JSON.stringify(localOnly,null,2));
  renameSync(store+'.tmp',store);
}

function reply(res,status,data,type='application/json') {
  res.writeHead(status,{
    'Content-Type':type,
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'no-referrer'
  });
  res.end(type==='application/json' ? JSON.stringify(data) : data);
}

async function body(req) {
  const chunks=[]; let size=0;
  for await (const c of req) {
    size+=c.length;
    if(size>65536) throw Error('Body too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

function adminAuthorised(req) {
  const user = process.env.ADMIN_USERNAME;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) return false;

  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return false;

  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }

  const i = decoded.indexOf(':');
  if (i < 0) return false;

  const providedUser = decoded.slice(0, i);
  const providedPass = decoded.slice(i + 1);

  const a = Buffer.from(providedUser);
  const b = Buffer.from(user);
  const c = Buffer.from(providedPass);
  const d = Buffer.from(pass);

  return a.length === b.length && c.length === d.length
    && timingSafeEqual(a,b) && timingSafeEqual(c,d);
}

function requireAdmin(req,res) {
  if (adminAuthorised(req)) return true;
  res.writeHead(401,{
    'WWW-Authenticate':'Basic realm="FPCC Officer Dashboard"',
    'Content-Type':'application/json',
    'Cache-Control':'no-store'
  });
  res.end(JSON.stringify({error:'Officer authentication required'}));
  return false;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
}

await initialiseDatabase();

const sessions=new Set();
let queue=Promise.resolve();

const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');

    if(req.method==='GET' && url.pathname==='/health') {
      return reply(res,200,{ok:true,mode:'prototype',database:'neon'});
    }

    if(req.method==='GET' && url.pathname==='/admin') {
      if (!requireAdmin(req,res)) return;
      return reply(
        res,200,
        readFileSync(path.join(root,'admin.html'),'utf8'),
        'text/html; charset=utf-8'
      );
    }

    if(req.method==='GET' && url.pathname==='/api/admin/stats') {
      if (!requireAdmin(req,res)) return;
      return reply(res,200,await getReportStats());
    }

    if(req.method==='GET' && url.pathname==='/api/admin/reports') {
      if (!requireAdmin(req,res)) return;
      const reports = await listReports({
        status:url.searchParams.get('status')||'',
        department:url.searchParams.get('department')||'',
        priority:url.searchParams.get('priority')||'',
        source:url.searchParams.get('source')||'',
        q:url.searchParams.get('q')||'',
        limit:url.searchParams.get('limit')||200
      });
      return reply(res,200,{reports});
    }

    if(req.method==='PATCH' && url.pathname.startsWith('/api/admin/reports/')) {
      if (!requireAdmin(req,res)) return;

      const reference = decodeURIComponent(url.pathname.split('/').pop()||'').toUpperCase();
      if (!/^FP-[A-Z0-9]{8}$/.test(reference)) {
        return reply(res,400,{error:'Invalid report reference'});
      }

      const data=JSON.parse((await body(req)).toString()||'{}');

      const validStatuses = ['submitted','in progress','resolved','closed','rejected'];
      const validPriorities = ['low','normal','high','urgent'];

      if (data.status !== undefined && !validStatuses.includes(String(data.status).toLowerCase())) {
        return reply(res,400,{error:'Invalid status'});
      }
      if (data.priority !== undefined && !validPriorities.includes(String(data.priority).toLowerCase())) {
        return reply(res,400,{error:'Invalid priority'});
      }

      const cleaned = {
        status: data.status === undefined ? undefined : String(data.status).toLowerCase(),
        department: data.department === undefined ? undefined : String(data.department).slice(0,100),
        assigned_to: data.assigned_to === undefined ? undefined : String(data.assigned_to).slice(0,150),
        priority: data.priority === undefined ? undefined : String(data.priority).toLowerCase(),
        resolution_notes: data.resolution_notes === undefined ? undefined : String(data.resolution_notes).slice(0,5000)
      };

      const updated = await updateReport(reference, cleaned);
      if (!updated) return reply(res,404,{error:'Report not found'});
      return reply(res,200,{report:updated});
    }

    if(req.method==='GET' && url.pathname==='/api/admin/export.csv') {
      if (!requireAdmin(req,res)) return;
      const reports = await listReports({
        status:url.searchParams.get('status')||'',
        department:url.searchParams.get('department')||'',
        priority:url.searchParams.get('priority')||'',
        source:url.searchParams.get('source')||'',
        q:url.searchParams.get('q')||'',
        limit:1000
      });

      const headers = [
        'reference','category','type','description','location','source',
        'department','assigned_to','priority','status','resolution_notes',
        'created_at','updated_at','resolved_at'
      ];

      const lines = [headers.join(',')];
      for (const r of reports) {
        lines.push(headers.map(h=>csvEscape(r[h])).join(','));
      }

      res.writeHead(200,{
        'Content-Type':'text/csv; charset=utf-8',
        'Content-Disposition':'attachment; filename="fpcc-reports.csv"',
        'Cache-Control':'no-store'
      });
      return res.end(lines.join('\n'));
    }

    if(req.method==='GET' && url.pathname==='/') {
      if(process.env.ENABLE_DEMO==='false') return reply(res,404,{error:'Disabled'});
      const sid=randomUUID(); sessions.add(sid);
      res.setHeader('Set-Cookie',`demo=${sid}; HttpOnly; SameSite=Strict; Path=/`);
      return reply(res,200,readFileSync(path.join(root,'index.html'),'utf8'),'text/html; charset=utf-8');
    }

    if(req.method==='POST' && url.pathname==='/api/chat') {
      if(process.env.ENABLE_DEMO==='false') return reply(res,404,{error:'Disabled'});
      const sid=req.headers.cookie?.match(/(?:^|; )demo=([a-f0-9-]+)/)?.[1];
      if(!sessions.has(sid)) return reply(res,401,{error:'Open the demo page first.'});

      const data=JSON.parse((await body(req)).toString());
      if(typeof data.message!=='string'||data.message.length>2000) {
        return reply(res,400,{error:'Enter up to 2,000 characters.'});
      }

      const answer=await respond(db,'demo:'+sid,data.message);
      save();
      return reply(res,200,{reply:answer});
    }

    if(req.method==='GET' && url.pathname==='/webhook') {
      if(
        process.env.WHATSAPP_VERIFY_TOKEN &&
        url.searchParams.get('hub.mode')==='subscribe' &&
        url.searchParams.get('hub.verify_token')===process.env.WHATSAPP_VERIFY_TOKEN
      ) return reply(res,200,url.searchParams.get('hub.challenge')||'','text/plain');

      return reply(res,403,{error:'Verification failed'});
    }

    if(req.method==='POST' && url.pathname==='/webhook') {
      const required=['META_APP_SECRET','WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','GRAPH_API_VERSION'];
      if(required.some(k=>!process.env[k])) return reply(res,503,{error:'WhatsApp is not configured'});

      const raw=await body(req);
      const expected='sha256='+createHmac('sha256',process.env.META_APP_SECRET).update(raw).digest('hex');
      const provided=String(req.headers['x-hub-signature-256']||'');

      if(provided.length!==expected.length||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected))) {
        return reply(res,401,{error:'Invalid signature'});
      }

      const payload=JSON.parse(raw.toString());

      const task=async()=>{
        for(const entry of payload.entry||[]) for(const change of entry.changes||[]) {
          if(change.value?.metadata?.phone_number_id!==process.env.WHATSAPP_PHONE_NUMBER_ID) continue;

          for(const message of change.value?.messages||[]) {
            if(!message.id||!message.from||db.processed.includes(message.id)) continue;

            const snapshot=structuredClone(db);
            try {
              const answer=message.type==='text'
                ? await respond(db,message.from,message.text?.body||'')
                : 'Please send a text message. Type MENU for options.';

              const response=await fetch(
                `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
                {
                  method:'POST',
                  headers:{
                    Authorization:`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type':'application/json'
                  },
                  body:JSON.stringify({
                    messaging_product:'whatsapp',
                    to:message.from,
                    type:'text',
                    text:{body:answer}
                  }),
                  signal:AbortSignal.timeout(10000)
                }
              );

              if(!response.ok) throw Error(`Meta send failed (${response.status})`);

              db.processed.push(message.id);
              db.processed=db.processed.slice(-10000);
              save();
            } catch(e) {
              db=snapshot;
              throw e;
            }
          }
        }
      };

      const pending=queue.then(task);
      queue=pending.catch(()=>{});
      await pending;
      return reply(res,200,{ok:true});
    }

    return reply(res,404,{error:'Not found'});
  } catch(e) {
    console.error(e);
    return reply(res,500,{error:'Unable to process request. Please try again.'});
  }
});

server.listen(
  Number(process.env.PORT||3000),
  process.env.HOST||'0.0.0.0',
  ()=>console.log(`Chatbot running on ${process.env.HOST||'0.0.0.0'}:${process.env.PORT||3000}`)
);
