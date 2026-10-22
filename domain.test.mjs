import test from 'node:test';
import assert from 'node:assert/strict';
import {init,createReport,updateReport,book,survey,statistics,hotspots,overdue} from './domain.mjs';
import {respond} from './bot.mjs';
test('routing, duplicate suggestions, coordinates and privacy aggregates',()=>{
 const db=init({});const r=createReport(db,'alice',{location:'Market road',description:'Overflowing waste bin near the market',lat:.67,lng:30.28});
 assert.equal(r.department,'Environment & sanitation');assert.equal(r.status,'New');assert.equal(r.possibleDuplicates.length,0);
 const other=createReport(db,'bob',{location:'Market road',description:'Overflowing waste bin near the market',lat:.6701,lng:30.2801});
 assert.deepEqual(other.possibleDuplicates,[r.id]);assert.equal(db.reports.length,2);assert.equal(hotspots(db)[0].count,2);
 assert.throws(()=>createReport(db,'a',{location:'Market road',description:'A problem in the road',lat:91,lng:30}),/valid latitude/);
 const stats=JSON.stringify(statistics(db));assert.ok(!stats.includes('alice'));assert.ok(!stats.includes('Overflowing'));assert.ok(!stats.includes(r.id));
});
test('deadline, resolution, owner-only survey and one response',()=>{
 const db=init({});const r=createReport(db,'alice',{location:'Main road',description:'A large pothole on the road'});r.dueAt=new Date(Date.now()-1000).toISOString();assert.ok(overdue(r));
 assert.throws(()=>updateReport(db,r.id,{status:'Resolved'}),/resolution summary/);
 updateReport(db,r.id,{status:'Resolved',resolution:'Road repaired'});assert.equal(overdue(r),false);assert.ok(r.surveyRequestedAt);
 assert.throws(()=>survey(db,'bob',r.id,5),/not available/);assert.throws(()=>survey(db,'alice',r.id,6),/1 to 5/);
 respond(db,'alice','8');respond(db,'alice',r.id);assert.match(respond(db,'alice','1'),/feedback has been saved/);
 assert.equal(r.survey.rating,1);assert.throws(()=>survey(db,'alice',r.id,5),/already/);
});
test('appointment capacity, cancellation and duplicate booking',()=>{
 const db=init({});db.slots.push({id:'SLOT-TEST',office:'ICT',startsAt:new Date(Date.now()+86400000).toISOString(),capacity:1});
 const a=book(db,'alice','SLOT-TEST');assert.throws(()=>book(db,'alice','SLOT-TEST'),/already/);assert.throws(()=>book(db,'bob','SLOT-TEST'),/full/);
 a.status='Cancelled';db.appointments[0].status='Cancelled';assert.ok(book(db,'bob','SLOT-TEST'));
});
test('legacy reports migrate without losing their details',()=>{
 const db=init({reports:[{id:'FP-OLD',owner:'a',location:'Road',description:'Broken road',status:'Saved locally',createdAt:new Date().toISOString()}]});
 assert.equal(db.reports[0].id,'FP-OLD');assert.equal(db.reports[0].status,'New');assert.equal(db.reports[0].department,'Engineering & roads');assert.equal(db.reports[0].legacyStatus,'Saved locally');
});
