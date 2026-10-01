-- Applicata il 1 ottobre 2026 (dopo la pubblicazione del codice che usa le API server).
-- Chiusura del database (Row Level Security).
--  * Visitatori anonimi: nessun accesso diretto alle tabelle (le pagine pubbliche passano dalle API del server).
--  * Agenti e admin loggati (presenti e attivi in gre_agents): accesso alle tabelle operative.
--  * gre_agents: lettura per lo staff senza le colonne dei token Google; modifiche dei ruoli solo admin.
-- Per tornare indietro in emergenza: ALTER TABLE public.<tabella> DISABLE ROW LEVEL SECURITY;

-- Funzioni di controllo (eseguite con i permessi del proprietario per evitare ricorsioni)
CREATE OR REPLACE FUNCTION public.gre_is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM gre_agents
     WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.gre_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM gre_agents
     WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       AND is_active = true AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.gre_is_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gre_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gre_is_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gre_is_admin() TO authenticated, service_role;

-- Attiva RLS su tutte le tabelle
ALTER TABLE public.gre_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gre_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gre_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gre_open_houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gre_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gre_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gre_prequalification_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gre_feedback_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gre_office_appointments ENABLE ROW LEVEL SECURITY;

-- Tabelle operative: tutto lo staff
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gre_clients','gre_properties','gre_open_houses','gre_time_slots','gre_bookings',
                           'gre_prequalification_responses','gre_feedback_responses','gre_office_appointments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS staff_all ON public.%I', t);
    EXECUTE format('CREATE POLICY staff_all ON public.%I FOR ALL TO authenticated USING (public.gre_is_staff()) WITH CHECK (public.gre_is_staff())', t);
  END LOOP;
END $$;

-- Agenti: lettura staff, modifica admin (o il proprio profilo), creazione/eliminazione admin
DROP POLICY IF EXISTS agents_select ON public.gre_agents;
DROP POLICY IF EXISTS agents_update ON public.gre_agents;
DROP POLICY IF EXISTS agents_insert ON public.gre_agents;
DROP POLICY IF EXISTS agents_delete ON public.gre_agents;
CREATE POLICY agents_select ON public.gre_agents FOR SELECT TO authenticated USING (public.gre_is_staff());
CREATE POLICY agents_update ON public.gre_agents FOR UPDATE TO authenticated
  USING (public.gre_is_admin() OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  WITH CHECK (public.gre_is_admin() OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
CREATE POLICY agents_insert ON public.gre_agents FOR INSERT TO authenticated WITH CHECK (public.gre_is_admin());
CREATE POLICY agents_delete ON public.gre_agents FOR DELETE TO authenticated USING (public.gre_is_admin());

-- Colonne: i token Google non sono leggibili né modificabili dal browser
REVOKE SELECT, INSERT, UPDATE ON public.gre_agents FROM anon, authenticated;
GRANT SELECT (id, email, nome, cognome, role, is_active, password_changed, google_oauth_enabled, created_at)
  ON public.gre_agents TO authenticated;
GRANT UPDATE (nome, cognome, role, is_active, google_oauth_enabled, password_changed)
  ON public.gre_agents TO authenticated;
GRANT INSERT (email, nome, cognome, role, is_active, password_changed) ON public.gre_agents TO authenticated;

-- Un agente non admin non può cambiarsi ruolo o stato da solo
CREATE OR REPLACE FUNCTION public.gre_agents_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF NOT public.gre_is_admin() AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.google_oauth_enabled IS DISTINCT FROM OLD.google_oauth_enabled OR NEW.email IS DISTINCT FROM OLD.email) THEN
    RAISE EXCEPTION 'Solo l''amministratore può modificare ruolo e stato degli agenti';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gre_agents_guard ON public.gre_agents;
CREATE TRIGGER gre_agents_guard BEFORE UPDATE ON public.gre_agents
  FOR EACH ROW EXECUTE FUNCTION public.gre_agents_guard();
