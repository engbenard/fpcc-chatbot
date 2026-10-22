import test from 'node:test';
import assert from 'node:assert/strict';
import { respond } from './bot.mjs';
test('consent, report persistence, and owner-only tracking',()=>{
 const db={sessions:{},reports:[]};
 assert.match(respond(db,'alice','2'),/YES/);
 respond(db,'alice','no'); assert.equal(db.reports.length,0);
 respond(db,'alice','2'); respond(db,'alice','yes'); respond(db,'alice','Central road');
 assert.match(respond(db,'alice','There is an overflowing waste bin'),/FP-/);
 assert.equal(db.reports.length,1);
 const id=db.reports[0].id;
 respond(db,'bob','3'); assert.match(respond(db,'bob',id),/No report found/);
 respond(db,'alice','3'); assert.match(respond(db,'alice',id),/Department: Environment & sanitation/);
});
test('cancel clears partial report and short descriptions are rejected',()=>{
 const db={sessions:{},reports:[]};
 respond(db,'a','2'); respond(db,'a','yes'); respond(db,'a','Road A');
 assert.match(respond(db,'a','x'),/more detail/);
 respond(db,'a','cancel'); assert.deepEqual(db.sessions.a,{}); assert.equal(db.reports.length,0);
});
