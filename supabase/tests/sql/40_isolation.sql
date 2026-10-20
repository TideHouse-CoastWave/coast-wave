-- No fixture writes. Confirm unsupported isolation fails explicitly.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 BEGIN
  PERFORM public.ncba_lock_identity('test','NCBA_SQL_ISOLATION','test');
 EXCEPTION WHEN SQLSTATE 'CP005' THEN RETURN;
 END;
 RAISE EXCEPTION 'Expected CP005 for unsupported isolation';
END $$;
RESET ROLE;
ROLLBACK;
