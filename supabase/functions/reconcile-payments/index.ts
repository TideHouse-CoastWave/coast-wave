import {body,fields,database,digest,equal,endpoint,settings,serve,PaymentError} from '../_shared/payment.ts';
import type {Settings} from '../_shared/payment.ts';
import {networkReady,provider} from '../_shared/ncba.ts';
import {credential} from '../ticket-access/index.ts';

export function createHandler(s:Settings,send:typeof fetch=fetch) {
  const db=database(s,send), bank=provider(s,send);
  return endpoint(s,async req=>{
    if(!s.workerSecret || s.workerSecret.length<32 || !await equal(req.headers.get('authorization')??'',`Bearer ${s.workerSecret}`)) {
      throw new PaymentError(401,'worker_auth_required');
    }
    fields(await body(req),[]);
    const queue=await db('ncba_reconciliation_queue',{});
    let finalized=0, queried=0, blocked=0, deferred=0;
    for(const e of queue.evidence) {
      try {
        if(typeof e.claim_token!=='string') throw new PaymentError(503,'invalid_claim');
        const count=await db('ncba_finalization_quantity',{p_evidence:e.id});
        if(!Number.isInteger(count)||count<1||count>100) throw new PaymentError(409,'invalid_quantity');
        const hashes=await Promise.all(Array.from({length:count},()=>digest(credential())));
        const result=await db('finalize_ncba_payment',{p_evidence:e.id,p_hashes:hashes,p_claim:e.claim_token});
        if(result.paid!==true) throw new PaymentError(503,'finalization_unconfirmed');
        finalized++;
      } catch(error) {
        const code=error instanceof PaymentError && error.message==='invalid_quantity' ? 'invalid_quantity'
          : error instanceof PaymentError && error.status===409 ? 'verification_rejected' : 'worker_error';
        try {
          // Token fencing prevents an old worker from blocking a newer claim.
          const result=await db('block_ncba_evidence',{p_evidence:e.id,p_claim:e.claim_token,p_error:code});
          if(result.blocked) blocked++; else deferred++;
        } catch { deferred++; } // Claim recovery is bounded in SQL; continue unrelated work.
      }
    }
    let queryEnabled=false;
    try { networkReady(s); queryEnabled=true; } catch { /* No query claims or bank calls while disabled. */ }
    if(queryEnabled) {
      const jobs=await db('claim_ncba_query_jobs',{});
      for(const job of jobs) {
        let dispatched=false;
        try {
          const permission=await db('begin_ncba_query',{p_attempt:job.attempt_id,p_claim:job.claim_token});
          if(!permission.allowed) { deferred++; continue; }
          dispatched=true; // Durable one-time dispatch authorization precedes HTTP.
          const result=await bank.query(permission.transaction_id);
          const safe:Record<string,string>={};
          for(const key of ['status','description']) {
            if(typeof result[key]==='string'&&result[key].length<=256) safe[key]=result[key];
          }
          const stored=await db('record_ncba_query',{p_attempt:job.attempt_id,p_claim:job.claim_token,p_payload:safe,p_digest:await digest(JSON.stringify(safe)),p_unknown:false});
          if(stored.stored) queried++; else deferred++;
        } catch {
          deferred++;
          if(dispatched) {
            try {
              await db('record_ncba_query',{p_attempt:job.attempt_id,p_claim:job.claim_token,p_payload:{},p_digest:await digest('{}'),p_unknown:true});
            } catch { /* Dispatched state remains quarantined: never automatically redispatched. */ }
          }
        }
      }
    }
    // Query descriptions are never financial verification or charge-retry rules.
    return {finalized,queried,blocked,deferred,verification_blocker:'NCBA correlation and final-success contract required'};
  },true);
}
serve((import.meta as any).main,createHandler(settings()));
