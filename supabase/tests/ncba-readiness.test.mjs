import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHandler as initiate} from '../functions/initiate-stk/index.ts';
import {createHandler as reconcile} from '../functions/reconcile-payments/index.ts';
const id='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const origin='https://checkout.example.test';
const settings={url:'https://db.example.test',key:'offline-service-key',origins:[origin],network:false,approved:false,contract:false,scope:'offline-scope',account:'TEST01',paybill:'880100',workerSecret:'offline-worker-secret-at-least-32-characters'};
const enabled={...settings,network:true,approved:true,contract:true,base:'https://bank.example.test',username:'offline-user',password:'offline-password',acceptedCode:'0'};
const request=(data,auth=`Bearer ${settings.workerSecret}`)=>new Request('https://edge.example.test',{method:'POST',headers:{'content-type':'application/json',origin,authorization:auth},body:JSON.stringify(data)});
const reply=data=>Response.json(data);

for(const status of ['pending','unknown','succeeded']) {
 test(`disabled NCBA returns an authorized existing ${status} attempt without a charge`,async()=>{
   const res=await initiate(settings,async(url,opt)=>{
     if(url.endsWith('/auth/v1/user'))return reply({id});
     assert.ok(url.endsWith('/claim_ncba_attempt'));
     assert.equal(JSON.parse(opt.body).p_allow_new,false);
     return reply({id,claimed:false,status});
   })(request({order_id:id,idempotency_key:other},'Bearer customer'));
   assert.equal(res.status,200);assert.equal((await res.json()).payment_status,status);
 });
}
test('cross-order idempotency conflict maps to a controlled response without bank requests',async()=>{
 const res=await initiate(settings,async url=>url.endsWith('/auth/v1/user')?reply({id}):Response.json({code:'CP002',details:'private DB details'},{status:400}))(request({order_id:id,idempotency_key:other},'Bearer customer'));
 assert.equal(res.status,409);assert.deepEqual(await res.json(),{error:'payment_conflict'});
});
test('invalid evidence is quarantined and unrelated evidence still finalizes',async()=>{
 const calls=[];
 const handler=reconcile(settings,async(url,opt)=>{
   const data=JSON.parse(opt.body);calls.push([url,data]);
   if(url.endsWith('/ncba_reconciliation_queue'))return reply({evidence:[{id,claim_token:id},{id:other,claim_token:other}]});
   if(url.endsWith('/ncba_finalization_quantity'))return reply(data.p_evidence===id?0:2);
   if(url.endsWith('/block_ncba_evidence')){assert.equal(data.p_claim,id);assert.equal(data.p_error,'invalid_quantity');return reply({blocked:true});}
   assert.ok(url.endsWith('/finalize_ncba_payment'));assert.equal(data.p_evidence,other);assert.equal(data.p_claim,other);return reply({paid:true});
 });
 const res=await handler(request({}));const data=await res.json();
 assert.equal(data.finalized,1);assert.equal(data.blocked,1);
 assert.ok(!calls.some(([url])=>url.includes('claim_ncba_query_jobs')));
});
test('lost blocking response does not starve later evidence',async()=>{
 const res=await reconcile(settings,async(url,opt)=>{
   const data=JSON.parse(opt.body);
   if(url.endsWith('/ncba_reconciliation_queue'))return reply({evidence:[{id,claim_token:id},{id:other,claim_token:other}]});
   if(url.endsWith('/ncba_finalization_quantity'))return reply(2);
   if(url.endsWith('/block_ncba_evidence'))throw new Error('offline timeout');
   if(data.p_evidence===id)return Response.json({code:'CP003'},{status:400});
   return reply({paid:true});
 })(request({}));
 const data=await res.json();assert.equal(data.finalized,1);assert.equal(data.deferred,1);
});
test('database verification rejection blocks evidence with sanitized error code',async()=>{
 const res=await reconcile(settings,async(url,opt)=>{
   if(url.endsWith('/ncba_reconciliation_queue'))return reply({evidence:[{id,claim_token:id}]});
   if(url.endsWith('/ncba_finalization_quantity'))return reply(2);
   if(url.endsWith('/finalize_ncba_payment'))return Response.json({code:'CP003',message:'private evidence'},{status:400});
   assert.equal(JSON.parse(opt.body).p_error,'verification_rejected');return reply({blocked:true});
 })(request({}));assert.equal((await res.json()).blocked,1);
});
test('concurrent workers honor a single-use dispatch authorization',async()=>{
 let dispatches=0,queries=0;
 const send=async(url,opt)=>{
   if(url.endsWith('/ncba_reconciliation_queue'))return reply({evidence:[]});
   if(url.endsWith('/claim_ncba_query_jobs'))return reply([{attempt_id:id,claim_token:other}]);
   // Simulate the atomic database gate, even if two responses contain the same job.
   if(url.endsWith('/begin_ncba_query'))return reply({allowed:++dispatches===1,transaction_id:'T1'});
   if(url.endsWith('/auth/token'))return reply({access_token:'offline',token_type:'Bearer',expires_in:18000});
   if(url.endsWith('/stk-push/query')){queries++;return reply({description:'Success'});}
   assert.ok(url.endsWith('/record_ncba_query'));assert.equal(JSON.parse(opt.body).p_unknown,false);return reply({stored:true});
 };
 const handler=reconcile(enabled,send);
 const results=await Promise.all([handler(request({})),handler(request({}))]);
 const bodies=await Promise.all(results.map(r=>r.json()));
 assert.equal(queries,1);assert.equal(bodies.reduce((n,v)=>n+v.queried,0),1);assert.ok(bodies.every(v=>v.finalized===0));
});
test('query timeout records unknown and never retries the bank request',async()=>{
 let queries=0,unknown=0;
 const res=await reconcile(enabled,async(url,opt)=>{
   if(url.endsWith('/ncba_reconciliation_queue'))return reply({evidence:[]});
   if(url.endsWith('/claim_ncba_query_jobs'))return reply([{attempt_id:id,claim_token:other}]);
   if(url.endsWith('/begin_ncba_query'))return reply({allowed:true,transaction_id:'T1'});
   if(url.endsWith('/auth/token'))return reply({access_token:'offline',token_type:'Bearer',expires_in:18000});
   if(url.endsWith('/stk-push/query')){queries++;throw new Error('timeout');}
   assert.ok(url.endsWith('/record_ncba_query'));assert.equal(JSON.parse(opt.body).p_unknown,true);unknown++;return reply({stored:true});
 })(request({}));assert.equal(queries,1);assert.equal(unknown,1);assert.equal((await res.json()).queried,0);
});
test('stale query claim never contacts NCBA',async()=>{
 const res=await reconcile(enabled,async url=>{
   if(url.endsWith('/ncba_reconciliation_queue'))return reply({evidence:[]});
   if(url.endsWith('/claim_ncba_query_jobs'))return reply([{attempt_id:id,claim_token:other}]);
   assert.ok(url.endsWith('/begin_ncba_query'));return reply({allowed:false});
 })(request({}));assert.equal((await res.json()).queried,0);
});
// Source contracts complement, but do not replace, the unexecuted SQL suites.
const sql=readFileSync(new URL('../migrations/20261020000100_ncba_payment_operations.sql',import.meta.url),'utf8');
test('SQL source: scoped key lock and authorized replay precede new eligibility',()=>{
 const claim=sql.split('CREATE FUNCTION public.claim_ncba_attempt')[1].split('END $$;')[0];
 assert.ok(claim.indexOf("ncba_lock_identity('attempt-key'")<claim.indexOf('WHERE id=p_order FOR UPDATE'));
 assert.ok(claim.indexOf("'claimed',false")<claim.indexOf('p_allow_new IS DISTINCT FROM true'));
 assert.ok(claim.indexOf("'claimed',false")<claim.indexOf('access_row.payment_expires_at>clock_timestamp()'));
 assert.ok(claim.includes("conflict_constraint='payment_attempts_idempotency_unique'"));
});
test('SQL source: finalizer locks receipt before rows and checks all replay invariants',()=>{
 const f=sql.split('CREATE FUNCTION public.finalize_ncba_payment')[1].split('END $$;')[0];
 assert.ok(f.indexOf("ncba_lock_identity('receipt'")<f.indexOf('WHERE id=p_evidence FOR UPDATE'));
 for(const text of ['merchant-notification-conflict','event_payload_digest=e.payload_digest','attempt_request_fingerprint=a.request_fingerprint','receipt_evidence_conflict','generate_series','delivery_outbox','verified_payment_and_ticket_issuance','committed_state_inconsistent','IS DISTINCT FROM true'])assert.ok(f.includes(text),text);
});
test('SQL source: evidence claims are bounded and dispatched queries cannot expire into a new claim',()=>{
 assert.ok(sql.includes('LIMIT 5 FOR UPDATE SKIP LOCKED'));assert.ok(sql.includes('processing_attempts<5'));
 const f=sql.split('CREATE FUNCTION public.claim_ncba_query_jobs')[1].split('END $$;')[0];
 assert.ok(f.includes("j.status='complete'"));assert.ok(f.includes("j.status='claimed'"));
 assert.ok(!f.includes("j.status='dispatched'"));assert.ok(!f.includes("j.status='unknown'"));
 const grant=sql.split('-- Explicit signatures:')[1];assert.ok(grant.includes('FROM PUBLIC,anon,authenticated,service_role'));
});
