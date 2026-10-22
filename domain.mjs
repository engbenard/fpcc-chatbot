import { randomUUID } from 'node:crypto';
export const statuses=['New','Assigned','In progress','Resolved','Closed'];
export const departments=['Environment & sanitation','Engineering & roads','Physical planning','Revenue','ICT','Communications'];
export function init(db){
 db.sessions ||= {}; db.reports ||= []; db.processed ||= []; db.appointments ||= []; db.slots ||= []; db.clients ||= {};
 db.config ||= {slaHours:72,departments:[...departments],routing:[{department:departments[0],keywords:'waste,garbage,rubbish,drain,sanitation,sewage'},{department:departments[1],keywords:'road,pothole,streetlight,bridge'},{department:departments[2],keywords:'building,construction,planning'},{department:departments[3],keywords:'tax,licence,license,revenue,fee'},{department:departments[4],keywords:'computer,internet,website,network'}]};
 db.services ||= ['Trading licences','Local revenue enquiries','Building and planning','Waste collection'].map((name,i)=>({id:'service-'+(i+1),name,department:departments[[3,3,2,0][i]],requirements:'Awaiting approved council information',fees:'Not configured',office:'Not configured',hours:'Not configured',published:false}));
 for(const r of db.reports){ if(!statuses.includes(r.status)){r.legacyStatus=r.status;r.status='New';} r.department ||= route(db,r.description);r.dueAt ||= new Date(Date.parse(r.createdAt)+db.config.slaHours*3600000).toISOString();r.history ||= [];r.possibleDuplicates ||= []; }
 return db;
}
export function route(db,text){return db.config.routing.find(rule=>rule.keywords.split(',').some(k=>k.trim()&&new RegExp('\\b'+k.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(text)))?.department || 'Communications';}
const normalized=s=>s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
export function duplicates(db,location,description){
 const words=new Set(normalized(description).split(' ').filter(w=>w.length>3));
 return db.reports.filter(r=>{
  if(Date.now()-Date.parse(r.createdAt)>30*86400000)return false;
  const other=new Set(normalized(r.description).split(' ').filter(w=>w.length>3));
  const union=new Set([...words,...other]);const score=union.size?[...words].filter(w=>other.has(w)).length/union.size:0;
  return normalized(r.location)===normalized(location)&&score>=.45;
 }).map(r=>r.id);
}
export function createReport(db,owner,data){
 const location=String(data.location||'').trim(),description=String(data.description||'').trim();
 if(location.length<3||location.length>300||description.length<10||description.length>2000)throw Error('Enter a location (3–300 characters) and description (10–2,000 characters).');
 let coordinates=null;
 if(data.lat!==undefined&&data.lat!==''&&data.lat!==null || data.lng!==undefined&&data.lng!==''&&data.lng!==null){const lat=Number(data.lat),lng=Number(data.lng);if(data.lat==null||data.lng==null||data.lat===''||data.lng===''||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw Error('Enter valid latitude and longitude together.');coordinates={lat,lng};}
 const now=new Date().toISOString(); const r={id:'FP-'+randomUUID().slice(0,8).toUpperCase(),owner,type:data.type||'Issue report',location,description,coordinates,department:route(db,description),status:'New',createdAt:now,dueAt:new Date(Date.now()+db.config.slaHours*3600000).toISOString(),possibleDuplicates:duplicates(db,location,description),history:[{at:now,action:'Created and automatically routed',actor:'System'}]};db.reports.push(r);return r;
}
export function overdue(r){return !['Resolved','Closed'].includes(r.status)&&Date.parse(r.dueAt)<Date.now();}
export function citizenReport(r){return {id:r.id,status:r.status,department:r.department,createdAt:r.createdAt,dueAt:r.dueAt,resolution:r.resolution||'',surveyRequested:!!r.surveyRequestedAt,survey:r.survey?{rating:r.survey.rating}:null};}
export function updateReport(db,id,data,actor='Staff'){
 const r=db.reports.find(x=>x.id===id);if(!r)throw Error('Report not found.');
 if(data.status&&!statuses.includes(data.status))throw Error('Invalid status.');
 if(data.department&&!db.config.departments.includes(data.department))throw Error('Unknown department.');
 if(data.status==='Resolved'&&!String(data.resolution||r.resolution||'').trim())throw Error('Add a resolution summary before resolving.');
 const before=r.status,events=[];
 for(const field of ['status','department','assignee','resolution','note']) if(data[field]!==undefined){const value=String(data[field]).trim();if(value.length>2000)throw Error('Field is too long.');if(field==='note'){if(value)events.push('Note: '+value);}else if(r[field]!==value){events.push(field+': '+value);r[field]=value;}}
 if(data.duplicateOf!==undefined){if(data.duplicateOf&&(!db.reports.some(x=>x.id===data.duplicateOf)||data.duplicateOf===id))throw Error('Choose a different existing report.');r.duplicateOf=data.duplicateOf;events.push(data.duplicateOf?'Linked duplicate: '+data.duplicateOf:'Duplicate link cleared');}
 if(r.status==='Resolved'&&before!=='Resolved'){r.resolvedAt=new Date().toISOString();r.surveyRequestedAt=r.resolvedAt;}
 if(!['Resolved','Closed'].includes(r.status)){delete r.resolvedAt;delete r.surveyRequestedAt;}
 if(events.length)r.history.push({at:new Date().toISOString(),actor,action:events.join(' · ')});return r;
}
export function survey(db,owner,id,rating,comment=''){
 const r=db.reports.find(x=>x.id===id&&x.owner===owner);if(!r||!r.surveyRequestedAt||!['Resolved','Closed'].includes(r.status))throw Error('This resolved report is not available for feedback.');
 if(!Number.isInteger(rating)||rating<1||rating>5)throw Error('Choose a rating from 1 to 5.');if(r.survey)throw Error('Feedback has already been submitted.');
 r.survey={rating,comment:String(comment).slice(0,1000),at:new Date().toISOString()};return {ok:true};
}
export function book(db,owner,slotId){const s=db.slots.find(x=>x.id===slotId);if(!s||s.disabled||Date.parse(s.startsAt)<=Date.now())throw Error('This slot is unavailable.');if(db.appointments.some(a=>a.owner===owner&&a.slotId===slotId&&a.status!=='Cancelled'))throw Error('You already booked this slot.');if(db.appointments.filter(a=>a.slotId===slotId&&a.status!=='Cancelled').length>=s.capacity)throw Error('This slot is full.');const a={id:'APT-'+randomUUID().slice(0,8).toUpperCase(),owner,slotId,status:'Booked',createdAt:new Date().toISOString()};db.appointments.push(a);return {...a,...s,id:a.id};}
export function availableSlots(db){return db.slots.filter(s=>!s.disabled&&Date.parse(s.startsAt)>Date.now()).map(s=>({...s,remaining:Math.max(0,s.capacity-db.appointments.filter(a=>a.slotId===s.id&&a.status!=='Cancelled').length)}));}
export function statistics(db){const counts=field=>Object.entries(db.reports.reduce((a,r)=>(a[r[field]]=(a[r[field]]||0)+1,a),{})).map(([name,count])=>({name,count}));const ratings=db.reports.filter(r=>r.survey).map(r=>r.survey.rating);return {total:db.reports.length,resolved:db.reports.filter(r=>['Resolved','Closed'].includes(r.status)).length,overdue:db.reports.filter(overdue).length,byStatus:counts('status'),byDepartment:counts('department'),surveyResponses:ratings.length,averageRating:ratings.length?Math.round(ratings.reduce((a,b)=>a+b,0)/ratings.length*10)/10:null};}
export function hotspots(db){const buckets={};for(const r of db.reports.filter(r=>r.coordinates)){const lat=Math.floor(r.coordinates.lat*100)/100+.005,lng=Math.floor(r.coordinates.lng*100)/100+.005,key=lat+','+lng;buckets[key] ||= {lat,lng,count:0};buckets[key].count++;}return Object.values(buckets).sort((a,b)=>b.count-a.count);}
