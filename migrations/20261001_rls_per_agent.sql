-- Applicata il 1 ottobre 2026.
-- Accesso per singolo agente (sostituisce le policy "staff_all" su tabelle operative).
--  * Admin: tutto.
--  * Agente: propri immobili, propri Open House e relativi orari; prenotazioni dei propri Open House
--    (modificabili) e quelle in cui è agente di riferimento (sola lettura); clienti, questionari e
--    feedback collegati a prenotazioni che può vedere (sola lettura).
--  * Le prenotazioni dei clienti si creano solo lato server (service role).

CREATE OR REPLACE FUNCTION public.gre_my_agent_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM gre_agents
   WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) AND is_active = true
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.gre_can_see_booking(p_booking_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.gre_is_admin() OR EXISTS (
    SELECT 1 FROM gre_bookings b
     WHERE b.id = p_booking_id
       AND public.gre_my_agent_id() IS NOT NULL
       AND (b.agent_id = public.gre_my_agent_id() OR b.agente_referente_id = public.gre_my_agent_id())
  );
$$;

CREATE OR REPLACE FUNCTION public.gre_can_see_client(p_client_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.gre_is_admin() OR EXISTS (
    SELECT 1 FROM gre_bookings b
     WHERE b.client_id = p_client_id
       AND public.gre_my_agent_id() IS NOT NULL
       AND (b.agent_id = public.gre_my_agent_id() OR b.agente_referente_id = public.gre_my_agent_id())
  );
$$;

CREATE OR REPLACE FUNCTION public.gre_owns_open_house(p_open_house_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.gre_is_admin() OR EXISTS (
    SELECT 1 FROM gre_open_houses o
     WHERE o.id = p_open_house_id
       AND public.gre_my_agent_id() IS NOT NULL
       AND o.agent_id = public.gre_my_agent_id()
  );
$$;

REVOKE ALL ON FUNCTION public.gre_my_agent_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gre_can_see_booking(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gre_can_see_client(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gre_owns_open_house(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gre_my_agent_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gre_can_see_booking(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gre_can_see_client(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gre_owns_open_house(uuid) TO authenticated, service_role;

-- Rimuove le vecchie policy "tutto lo staff"
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gre_clients','gre_properties','gre_open_houses','gre_time_slots','gre_bookings',
                           'gre_prequalification_responses','gre_feedback_responses','gre_office_appointments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS staff_all ON public.%I', t);
  END LOOP;
END $$;

-- Immobili
CREATE POLICY own_properties ON public.gre_properties FOR ALL TO authenticated
  USING (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()))
  WITH CHECK (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()));

-- Open House
CREATE POLICY own_open_houses ON public.gre_open_houses FOR ALL TO authenticated
  USING (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()))
  WITH CHECK (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()));

-- Orari (seguono l'Open House)
CREATE POLICY own_time_slots ON public.gre_time_slots FOR ALL TO authenticated
  USING (public.gre_owns_open_house(open_house_id))
  WITH CHECK (public.gre_owns_open_house(open_house_id));

-- Prenotazioni: lettura proprie + come referente; modifica solo proprie
CREATE POLICY bookings_select ON public.gre_bookings FOR SELECT TO authenticated
  USING (public.gre_is_admin() OR (public.gre_my_agent_id() IS NOT NULL
         AND (agent_id = public.gre_my_agent_id() OR agente_referente_id = public.gre_my_agent_id())));
CREATE POLICY bookings_update ON public.gre_bookings FOR UPDATE TO authenticated
  USING (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()))
  WITH CHECK (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()));
CREATE POLICY bookings_delete ON public.gre_bookings FOR DELETE TO authenticated
  USING (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()));
CREATE POLICY bookings_insert_admin ON public.gre_bookings FOR INSERT TO authenticated
  WITH CHECK (public.gre_is_admin());

-- Clienti: lettura se collegati a una prenotazione visibile; modifiche solo admin
CREATE POLICY clients_select ON public.gre_clients FOR SELECT TO authenticated
  USING (public.gre_can_see_client(id));
CREATE POLICY clients_admin_write ON public.gre_clients FOR ALL TO authenticated
  USING (public.gre_is_admin()) WITH CHECK (public.gre_is_admin());

-- Questionari e feedback: lettura se la prenotazione è visibile; modifiche solo admin
CREATE POLICY prequal_select ON public.gre_prequalification_responses FOR SELECT TO authenticated
  USING (public.gre_can_see_booking(booking_id));
CREATE POLICY prequal_admin_write ON public.gre_prequalification_responses FOR ALL TO authenticated
  USING (public.gre_is_admin()) WITH CHECK (public.gre_is_admin());
CREATE POLICY feedback_select ON public.gre_feedback_responses FOR SELECT TO authenticated
  USING (public.gre_can_see_booking(booking_id));
CREATE POLICY feedback_admin_write ON public.gre_feedback_responses FOR ALL TO authenticated
  USING (public.gre_is_admin()) WITH CHECK (public.gre_is_admin());

-- Appuntamenti in ufficio (non usati): solo admin
CREATE POLICY office_admin ON public.gre_office_appointments FOR ALL TO authenticated
  USING (public.gre_is_admin()) WITH CHECK (public.gre_is_admin());
