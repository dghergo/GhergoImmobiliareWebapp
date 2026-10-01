-- Applicata il 1 ottobre 2026 dopo enable_rls (suggerimenti del controllo sicurezza Supabase).
REVOKE ALL ON FUNCTION public.gre_agents_guard() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('update_updated_at_column', 'update_time_slot_occupancy')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', f.sig);
  END LOOP;
END $$;
