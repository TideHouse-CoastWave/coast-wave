import { body, database, digest, endpoint, settings, serve, PaymentError } from '../_shared/payment.ts';
import type { Settings } from '../_shared/payment.ts';
import { authenticateNotification } from '../_shared/ncba.ts';
export function createHandler(s: Settings, send: typeof fetch = fetch) {
  const db = database(s,send);
  return endpoint(s,async req => {
    const safe = await authenticateNotification(await body(req),s);
    const stored=await db('ingest_ncba_notification',{p_scope:s.scope,p_key:safe.TransID,p_digest:await digest(JSON.stringify(safe)),p_payload:safe});
    if(stored.conflict)throw new PaymentError(409,'notification_conflict');
    return {ResultCode:'0',ResultDesc:'Notification stored'};
  },true);
}
serve((import.meta as any).main,createHandler(settings()));
