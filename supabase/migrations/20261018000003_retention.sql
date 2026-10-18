-- =====================================================================
-- ShuleHub · automatic deletion of expired records (retention schedule)
-- The Privacy notice promises these deletions, so this job must run.
-- Uses pg_cron, which Supabase provides. If it is not available, the
-- notice below is printed and you must run purge_expired_data() daily
-- some other way (see README).
-- =====================================================================
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('shulehub-purge-expired', '30 1 * * *', 'select public.purge_expired_data()');
exception when others then
  raise notice 'pg_cron is not available here (%). Schedule select public.purge_expired_data(); to run daily.', sqlerrm;
end $$;
