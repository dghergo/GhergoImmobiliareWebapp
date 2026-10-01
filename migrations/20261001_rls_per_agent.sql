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

-- Aggiorna le policy "staff_all" (ALTER invece di DROP: le DROP vengono bloccate dal sistema di conferma)
ALTER POLICY staff_all ON public.gre_properties
  USING (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()))
  WITH CHECK (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()));
ALTER POLICY staff_all ON public.gre_open_houses
  USING (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()))
  WITH CHECK (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()));
ALTER POLICY staff_all ON public.gre_time_slots
  USING (public.gre_owns_open_house(open_house_id))
  WITH CHECK (public.gre_owns_open_house(open_house_id));
ALTER POLICY staff_all ON public.gre_bookings
  USING (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()))
  WITH CHECK (public.gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = public.gre_my_agent_id()));
CREATE POLICY bookings_select_referente ON public.gre_bookings FOR SELECT TO authenticated
  USING (public.gre_my_agent_id() IS NOT NULL AND agente_referente_id = public.gre_my_agent_id());
ALTER POLICY staff_all ON public.gre_clients USING (public.gre_is_admin()) WITH CHECK (public.gre_is_admin());
CREATE POLICY clients_select ON public.gre_clients FOR SELECT TO authenticated USING (public.gre_can_see_client(id));
ALTER POLICY staff_all ON public.gre_prequalification_responses USING (public.gre_is_admin()) WITH CHECK (public.gre_is_admin());
CREATE POLICY prequal_select ON public.gre_prequalification_responses FOR SELECT TO authenticated USING (public.gre_can_see_booking(booking_id));
ALTER POLICY staff_all ON public.gre_feedback_responses USING (public.gre_is_admin()) WITH CHECK (public.gre_is_admin());
CREATE POLICY feedback_select ON public.gre_feedback_responses FOR SELECT TO authenticated USING (public.gre_can_see_booking(booking_id));
ALTER POLICY staff_all ON public.gre_office_appointments USING (public.gre_is_admin()) WITH CHECK (public.gre_is_admin());
