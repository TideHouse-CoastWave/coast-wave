-- REVIEW ONLY. Empty-install rollback, not financial reversal.
BEGIN;
DO $$ BEGIN
 IF current_setting('coastwave.empty_staging_rollback_approved',true) IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'Empty staging rollback not approved'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_customer_access)
 OR EXISTS(SELECT 1 FROM public.customer_order_creation_keys)
 OR EXISTS(SELECT 1 FROM public.ncba_verification_evidence)
 OR EXISTS(SELECT 1 FROM public.ncba_query_jobs)
 OR EXISTS(SELECT 1 FROM public.payment_events WHERE provider='ncba')
 OR EXISTS(SELECT 1 FROM public.payment_attempts WHERE provider='ncba')
 OR EXISTS(SELECT 1 FROM public.payment_receipts WHERE provider='ncba')
 OR to_regnamespace('ncba_staging_test') IS NOT NULL THEN
  RAISE EXCEPTION 'Data/test fixtures exist: retain records and restore disposable clone or use a forward fix'; END IF;
END $$;
DROP FUNCTION public.record_ncba_query(uuid,uuid,jsonb,text,boolean) RESTRICT;
DROP FUNCTION public.begin_ncba_query(uuid,uuid) RESTRICT;
DROP FUNCTION public.claim_ncba_query_jobs() RESTRICT;
DROP FUNCTION public.block_ncba_evidence(uuid,uuid,text) RESTRICT;
DROP FUNCTION public.ncba_reconciliation_queue() RESTRICT;
DROP FUNCTION public.list_customer_tickets(uuid,uuid) RESTRICT;
DROP FUNCTION public.retrieve_customer_ticket(uuid,uuid,uuid,text) RESTRICT;
DROP FUNCTION public.ncba_finalization_quantity(uuid) RESTRICT;
DROP FUNCTION public.finalize_ncba_payment(uuid,jsonb,uuid) RESTRICT;
DROP FUNCTION public.customer_payment_status(uuid,uuid) RESTRICT;
DROP FUNCTION public.ingest_ncba_notification(text,text,text,jsonb) RESTRICT;
DROP FUNCTION public.record_ncba_submission(uuid,text,jsonb) RESTRICT;
DROP FUNCTION public.claim_ncba_attempt(uuid,uuid,text,text,text,text,boolean) RESTRICT;
DROP FUNCTION public.ncba_lock_identity(text,text,text) RESTRICT;
DROP FUNCTION public.create_customer_pending_order_secure(uuid,jsonb,integer,integer,integer) RESTRICT;
DROP INDEX public.ncba_conflict_receipt_idx;
DROP TABLE public.ncba_query_jobs RESTRICT;
DROP TABLE public.ncba_verification_evidence RESTRICT;
DROP TABLE public.customer_order_creation_keys RESTRICT;
DROP TABLE public.order_customer_access RESTRICT;
-- Migration-history repair, if needed, must use the separately reviewed chosen
-- deployment tool procedure. Do not delete history rows blindly or rerun a batch.
COMMIT;
