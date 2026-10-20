// Offline HTTP/crypto boundary tests. Database responses are mocked: these do
// not establish PostgreSQL transaction/concurrency correctness.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHandler as initiate} from '../functions/initiate-stk/index.ts';
import {createHandler as notify} from '../functions/ncba-paybill-notification/index.ts';
import {createHandler as status} from '../functions/order-status/index.ts';
import {createHandler as tickets} from '../functions/ticket-access/index.ts';
import {createHandler as reconcile} from '../functions/reconcile-payments/index.ts';
import {createHandler as createCustomerOrder} from '../functions/create-customer-order/index.ts';
import {authenticateNotification,provider} from '../functions/_shared/ncba.ts';
import {digest} from '../functions/_shared/payment.ts';
const order='11111111-1111-4111-8111-111111111111', user='22222222-2222-4222-8222-222222222222', key='33333333-3333-4333-8333-333333333333';
const origin='https://checkout.example.test';
const s={url:'https://db.example.test',key:'offline-service-key',origins:[origin],network:true,approved:true,contract:true,base:'https://bank.example.test',username:'offline-api-user',password:'offline-api-password',scope:'offline-merchant',paybill:'880100',account:'TEST01',acceptedCode:'0',notificationUser:'offline-notification-user',notificationPassword:'offline-notification-password',notificationSecret:'offline-notification-secret',hashConfirmed:true,workerSecret:'offline-worker-secret-at-least-32-characters'};
const req=(v,auth='Bearer customer-jwt',headers={})=>new Request('https://edge.example.test',{method:'POST',headers:{origin,'content-type':'application/json',authorization:auth,...headers},body:JSON.stringify(v)});
const good={TransType:'Pay Bill',TransID:'TESTRECEIPT1',TransTime:'20261020120000',TransAmount:'100.00',BusinessShortCode:'880100',BillRefNumber:'TEST01',Mobile:'254712345678',name:'TEST BUYER',Username:s.notificationUser,Password:s.notificationPassword,FTRef:'CORE1',Narrative:'unsigned-order-reference'};
async function signed(v={}) {const b={...good,...v};b.Hash=btoa(await digest(s.notificationSecret+b.TransType+b.TransID+b.TransTime+b.TransAmount+b.BusinessShortCode+b.BillRefNumber+b.Mobile+b.name+'1'));return b;}
const response=v=>Response.json(v);
test('disabled initiation permits only a read-only attempt lookup and makes no NCBA request',async()=>{
 let calls=0;
 const r=await initiate({...s,network:false},async(url,opt)=>{
   calls++;
   if(url.endsWith('/auth/v1/user'))return response({id:user});
   assert.ok(url.endsWith('/claim_ncba_attempt'));assert.equal(JSON.parse(opt.body).p_allow_new,false);
   return Response.json({code:'CP004'},{status:400});
 })(req({order_id:order,idempotency_key:key}));
 assert.equal(r.status,503);assert.equal(calls,2);
});
test('customer token is verified and forged financial fields rejected',async()=>{
 const fetch=async url=>{assert.ok(url.endsWith('/auth/v1/user'));return response({id:user});};
 assert.equal((await initiate(s,fetch)(req({order_id:order,idempotency_key:key,payment_status:'Paid'}))).status,400);
 assert.equal((await initiate(s,fetch)(req({order_id:order,idempotency_key:key},`Bearer ${s.key}`))).status,401);
 assert.equal((await initiate(s,async()=>new Response('',{status:401}))(req({order_id:order,idempotency_key:key}))).status,401);
});
test('accepted initiation uses trusted amount, documented contract, and stays pending',async()=>{
 const calls=[];
 const r=await initiate(s,async(url,opt)=>{
 calls.push(url);
 if(url.endsWith('/auth/v1/user'))return response({id:user});
 const b=JSON.parse(opt.body);
 if(url.endsWith('/claim_ncba_attempt')){assert.equal(b.p_user,user);return response({id:key,claimed:true,phone:'254712345678',amount:'100'});}
 if(url.endsWith('/auth/token')){assert.ok(opt.headers.Authorization.startsWith('Basic '));return response({access_token:'offline-access-token',token_type:'Bearer',expires_in:18000});}
 if(url.endsWith('/stk-push/initiate')){assert.deepEqual(b,{TelephoneNo:'254712345678',Amount:'100',PayBillNo:'880100',AccountNo:'TEST01',Network:'Safaricom',TransactionType:'CustomerPayBillOnline'});return response({TransactionID:'T1',ReferenceID:'R1',StatusCode:'0'});}
 assert.ok(url.endsWith('/record_ncba_submission'));assert.equal(b.p_status,'pending');return response({stored:true});
 })(req({order_id:order,idempotency_key:key}));
 assert.equal(r.status,200);assert.equal((await r.json()).payment_status,'pending');assert.equal(calls.length,5);
 assert.ok(!calls.some(x=>/finalize|ticket/.test(x)));
});
test('documented failure is failed, timeout unknown; no automatic provider retry',async()=>{
 for(const timeout of [false,true]){
 let attempts=0,stored;
 const r=await initiate(s,async(url,opt)=>{
 if(url.endsWith('/auth/v1/user'))return response({id:user});
 if(url.endsWith('/claim_ncba_attempt'))return response({id:key,claimed:true,phone:'254712345678',amount:'100'});
 if(url.endsWith('/auth/token'))return response({access_token:'offline',token_type:'Bearer',expires_in:18000});
 if(url.endsWith('/stk-push/initiate')){attempts++;if(timeout)throw new Error('timeout');return response({StatusCode:'1',TransactionID:null,ReferenceID:null});}
 stored=JSON.parse(opt.body).p_status;return response({stored:true});
 })(req({order_id:order,idempotency_key:key}));
 assert.equal(r.status,200);assert.equal(stored,timeout?'unknown':'failed');assert.equal(attempts,1);
 }
});
test('durable attempt replay sends no bank request',async()=>{
 const r=await initiate(s,async url=>url.endsWith('/auth/v1/user')?response({id:user}):(()=>{assert.ok(url.endsWith('/claim_ncba_attempt'));return response({id:key,claimed:false,status:'unknown'});})())(req({order_id:order,idempotency_key:key}));
 assert.equal((await r.json()).payment_status,'unknown');
});
test('notification verifies hex-text Base64 hash; unsigned fields excluded',async()=>{
 const safe=await authenticateNotification(await signed(),s);
 for(const k of ['Username','Password','Hash','FTRef','Narrative'])assert.ok(!(k in safe));
 const rawHash=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s.notificationSecret+good.TransType+good.TransID+good.TransTime+good.TransAmount+good.BusinessShortCode+good.BillRefNumber+good.Mobile+good.name+'1')))));
 await assert.rejects(()=>authenticateNotification({...good,Hash:rawHash},s));
});
test('forged authentication, changed signed amount, and wrong merchant rejected before storage',async()=>{
 const valid=await signed();
 for(const v of [{...valid,Hash:'forged'},{...valid,Password:'forged'},{...valid,TransAmount:'1000.00'},await signed({BillRefNumber:'OTHER'})]){
 const r=await notify(s,async()=>assert.fail('must not persist forged event'))(req(v));assert.ok([401,403].includes(r.status));
 }
 assert.equal((await notify({...s,hashConfirmed:false},async()=>assert.fail())(req(valid))).status,503);
});
test('duplicate/replayed notification uses identical durable event key and never finalizes',async()=>{
 const keys=[];const v=await signed();
 const handler=notify(s,async(url,opt)=>{assert.ok(url.endsWith('/ingest_ncba_notification'));const b=JSON.parse(opt.body);keys.push([b.p_key,b.p_digest]);assert.ok(!JSON.stringify(b).includes(s.notificationPassword));return response({event_id:key,status:'unmatched'});});
 for(let i=0;i<2;i++)assert.equal((await handler(req(v))).status,200);
 assert.deepEqual(keys[0],keys[1]);
});
test('same receipt with conflicting authenticated amount is not acknowledged',async()=>{
 const r=await notify(s,async()=>Response.json({code:'CP002'},{status:400}))(req(await signed({TransAmount:'101.00'})));
 assert.equal(r.status,409);assert.equal((await r.json()).ResultCode,'1');
});
test('database failure is never acknowledged as stored',async()=>{
 const r=await notify(s,async()=>{throw new Error('offline');})(req(await signed()));assert.equal(r.status,503);
});
test('status cannot enumerate another customer order',async()=>{
 const r=await status(s,async url=>url.endsWith('/auth/v1/user')?response({id:user}):Response.json({code:'CP001'},{status:400}))(req({order_id:order}));assert.equal(r.status,403);
});
test('ticket endpoint returns a fresh QR credential only after authorized DB retrieval',async()=>{
 let hash;
 const r=await tickets(s,async(url,opt)=>{
 if(url.endsWith('/auth/v1/user'))return response({id:user});
 assert.ok(url.endsWith('/retrieve_customer_ticket'));hash=JSON.parse(opt.body).p_hash;return response({ticket_id:key,credential_version:2});
 })(req({order_id:order,ticket_id:key}));
 const v=await r.json();assert.equal(r.headers.get('cache-control'),'no-store');const token=v.qr_payload.split(':').at(-1);assert.equal(token.length,64);assert.equal(hash,await digest(token));
 const denied=await tickets(s,async url=>url.endsWith('/auth/v1/user')?response({id:user}):Response.json({code:'CP003'},{status:400}))(req({order_id:order,ticket_id:key}));
 assert.equal(denied.status,409);assert.ok(!(await denied.text()).includes('qr_payload'));
});
test('query Success cannot finalize; only preverified evidence reaches finalizer',async()=>{
 const calls=[];
 const r=await reconcile(s,async(url,opt)=>{
 calls.push(url);
 if(url.endsWith('/ncba_reconciliation_queue'))return response({evidence:[]});
 if(url.endsWith('/claim_ncba_query_jobs'))return response([{attempt_id:key,claim_token:key}]);
 if(url.endsWith('/begin_ncba_query'))return response({allowed:true,transaction_id:'T1'});
 if(url.endsWith('/auth/token'))return response({access_token:'offline',token_type:'Bearer',expires_in:18000});
 if(url.endsWith('/record_ncba_query'))return response({stored:true});
 assert.ok(url.endsWith('/stk-push/query'));return response({description:'Success'});
 })(req({},`Bearer ${s.workerSecret}`));
 const result=await r.json();assert.equal(result.finalized,0);assert.equal(result.queried,1);assert.ok(!calls.some(x=>x.includes('finalize_ncba_payment')));
});
test('trusted verified payment success invokes transactional issuance with random hashes',async()=>{
 const r=await reconcile({...s,network:false},async(url,opt)=>{
 if(url.endsWith('/ncba_reconciliation_queue'))return response({evidence:[{id:key,order_id:order,claim_token:key}],attempts:[]});
 if(url.endsWith('/ncba_finalization_quantity'))return response(2);
 assert.ok(url.endsWith('/finalize_ncba_payment'));const v=JSON.parse(opt.body);assert.equal(v.p_hashes.length,2);assert.notEqual(v.p_hashes[0],v.p_hashes[1]);assert.ok(v.p_hashes.every(x=>/^[a-f0-9]{64}$/.test(x)));return response({paid:true,replayed:false});
 })(req({},`Bearer ${s.workerSecret}`));assert.equal((await r.json()).finalized,1);
 assert.equal((await reconcile(s,async()=>assert.fail())(req({},'Bearer forged'))).status,401);
});
test('unconfirmed network profile cannot call token endpoint',async()=>{
 await assert.rejects(()=>provider({...s,approved:false},async()=>assert.fail()).initiate('254712345678','100'));
});
test('authenticated order creation binds verified user, reuses normalized inputs and rejects ownership injection',async()=>{
 const config={...s,maxQuantity:1,accessTtl:2592000,paymentTtl:900};
 const input={customer_name:'Test Buyer',customer_email:'BUYER@example.test',customer_phone:'0712 345 678',ticket_id:order,quantity:1,idempotency_key:key};
 const handler=createCustomerOrder(config,async(url,opt)=>{
   if(url.endsWith('/auth/v1/user'))return response({id:user});
   assert.ok(url.endsWith('/create_customer_pending_order_secure'));
   const b=JSON.parse(opt.body);assert.equal(b.p_user,user);assert.equal(b.p_input.customer_phone,'254712345678');assert.equal(b.p_input.idempotency_key,key);
   assert.equal(b.p_access_ttl,2592000);assert.equal(b.p_payment_ttl,900);
   return response({order_id:order,quantity:1,total_amount:100,currency:'KES',payment_status:'pending'});
 });
 assert.equal((await handler(req(input))).status,200);
 assert.equal((await handler(req({...input,user_id:key}))).status,400);
 assert.equal((await handler(req({...input,total_amount:1}))).status,400);
 assert.equal((await createCustomerOrder({...config,accessTtl:0},async()=>response({id:user}))(req(input))).status,503);
});
test('authenticated conflicting notification evidence remains a failure after durable quarantine',async()=>{
 const r=await notify(s,async()=>response({conflict:true}))(req(await signed()));
 assert.equal(r.status,409);assert.equal((await r.json()).ResultCode,'1');
});
