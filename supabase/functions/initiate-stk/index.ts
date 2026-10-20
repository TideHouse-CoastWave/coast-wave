import { body, fields, uuid, customer, database, endpoint, settings, serve, PaymentError } from '../_shared/payment.ts';
import type { Settings } from '../_shared/payment.ts';
import { networkReady, provider } from '../_shared/ncba.ts';
export function createHandler(s: Settings, send: typeof fetch = fetch) {
  const db = database(s,send), bank = provider(s,send);
  return endpoint(s, async req => {
    const user = await customer(req,s,send); const v = await body(req);
    fields(v,['order_id','idempotency_key']);
    if (!uuid(v.order_id) || !uuid(v.idempotency_key)) throw new PaymentError(400,'invalid_identifier');
    let allowNew = false;
    try { networkReady(s); allowNew = true; } catch { /* Existing authorized attempts remain readable. */ }
    const attempt = await db('claim_ncba_attempt',{p_order:v.order_id,p_user:user,p_key:v.idempotency_key,p_scope:s.scope,p_account:s.account,p_paybill:s.paybill,p_allow_new:allowNew});
    if (!attempt.claimed) return {attempt_id:attempt.id,payment_status:attempt.status};
    networkReady(s); // Defense in depth: no provider request from a disabled handler.
    let result;
    try { result = await bank.initiate(attempt.phone,attempt.amount); }
    catch {
      await db('record_ncba_submission',{p_attempt:attempt.id,p_status:'unknown',p_identifiers:{}});
      return {attempt_id:attempt.id,payment_status:'unknown',reconciliation_required:true};
    }
    await db('record_ncba_submission',{p_attempt:attempt.id,p_status:result.status,p_identifiers:result.identifiers});
    return {attempt_id:attempt.id,payment_status:result.status};
  });
}
serve((import.meta as any).main,createHandler(settings()));
