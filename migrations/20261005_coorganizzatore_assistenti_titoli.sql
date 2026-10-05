-- 1) Open House gestito da due agenti (co_agent_id): entrambi vedono tutto e ricevono le comunicazioni.
--    Niente foreign key su co_agent_id: una seconda FK verso gre_agents renderebbe ambigue le join
--    "gre_agents (...)" già usate in tutta l'app. Il valore è controllato dall'app.
-- 2) Qualifica dell'account: 'agente' (agente immobiliare abilitato) o 'assistente' (assistente immobiliare).
--    L'assistente fa backoffice e organizza, ma non è mai indicato come agente di riferimento.
-- 3) Titolo dell'immobile generato (Comune, indirizzo e civico): unico tra gli immobili attivi.

ALTER TABLE gre_open_houses ADD COLUMN IF NOT EXISTS co_agent_id uuid;
ALTER TABLE gre_agents ADD COLUMN IF NOT EXISTS qualifica text NOT NULL DEFAULT 'agente';
DO $$ BEGIN
  ALTER TABLE gre_agents ADD CONSTRAINT gre_agents_qualifica_check CHECK (qualifica IN ('agente', 'assistente'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Chi gestisce un Open House (organizzatore o co-organizzatore)
CREATE OR REPLACE FUNCTION public.gre_manages_open_house(p_open_house_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.gre_my_agent_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM gre_open_houses o
     WHERE o.id = p_open_house_id
       AND (o.agent_id = public.gre_my_agent_id() OR o.co_agent_id = public.gre_my_agent_id())
  );
$$;

CREATE OR REPLACE FUNCTION public.gre_owns_open_house(p_open_house_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.gre_is_admin() OR public.gre_manages_open_house(p_open_house_id);
$$;

-- Il cliente è di chi lo porta; i clienti senza referente (o con referente uno dei due organizzatori)
-- sono di entrambi gli organizzatori.
CREATE OR REPLACE FUNCTION public.gre_follows_booking_oh(p_open_house_id uuid, p_referente_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.gre_my_agent_id() IS NOT NULL AND (
    p_referente_id = public.gre_my_agent_id()
    OR EXISTS (
      SELECT 1 FROM gre_open_houses o
       WHERE o.id = p_open_house_id
         AND (o.agent_id = public.gre_my_agent_id() OR o.co_agent_id = public.gre_my_agent_id())
         AND (p_referente_id IS NULL OR p_referente_id = o.agent_id OR p_referente_id = o.co_agent_id)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.gre_can_see_booking(p_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.gre_is_admin() OR EXISTS (
    SELECT 1 FROM gre_bookings b
     WHERE b.id = p_booking_id AND public.gre_follows_booking_oh(b.open_house_id, b.agente_referente_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.gre_can_see_client(p_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.gre_is_admin() OR EXISTS (
    SELECT 1 FROM gre_bookings b
     WHERE b.client_id = p_client_id AND public.gre_follows_booking_oh(b.open_house_id, b.agente_referente_id)
  );
$$;

ALTER POLICY staff_all ON gre_bookings
  USING (gre_is_admin() OR gre_follows_booking_oh(open_house_id, agente_referente_id))
  WITH CHECK (gre_is_admin() OR gre_follows_booking_oh(open_house_id, agente_referente_id));

ALTER POLICY staff_all ON gre_open_houses
  USING (gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = gre_my_agent_id()) OR (co_agent_id IS NOT NULL AND co_agent_id = gre_my_agent_id()))
  WITH CHECK (gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = gre_my_agent_id()) OR (co_agent_id IS NOT NULL AND co_agent_id = gre_my_agent_id()));

-- Il co-organizzatore vede (e aggiorna) l'immobile dell'Open House che gestisce
ALTER POLICY staff_all ON gre_properties
  USING (gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = gre_my_agent_id())
         OR EXISTS (SELECT 1 FROM gre_open_houses o WHERE o.property_id = gre_properties.id AND o.co_agent_id = gre_my_agent_id()))
  WITH CHECK (gre_is_admin() OR (agent_id IS NOT NULL AND agent_id = gre_my_agent_id())
         OR EXISTS (SELECT 1 FROM gre_open_houses o WHERE o.property_id = gre_properties.id AND o.co_agent_id = gre_my_agent_id()));

-- Titoli unici tra gli immobili attivi
CREATE UNIQUE INDEX IF NOT EXISTS gre_properties_titolo_attivo_unico
  ON gre_properties (lower(trim(titolo))) WHERE is_active;

-- Ruolo, qualifica ed email di un account li cambia solo l'admin
-- (prima un utente poteva modificare la propria riga, compreso il ruolo).
CREATE OR REPLACE FUNCTION public.gre_agents_protect_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.jwt() IS NOT NULL
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND NOT public.gre_is_admin()
     AND (NEW.role IS DISTINCT FROM OLD.role
          OR NEW.qualifica IS DISTINCT FROM OLD.qualifica
          OR lower(NEW.email) IS DISTINCT FROM lower(OLD.email)
          OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    RAISE EXCEPTION 'Solo l''amministratore può modificare ruolo, qualifica, email o stato dell''account';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gre_agents_protect_fields ON gre_agents;
CREATE TRIGGER gre_agents_protect_fields BEFORE UPDATE ON gre_agents
  FOR EACH ROW EXECUTE FUNCTION public.gre_agents_protect_fields();
