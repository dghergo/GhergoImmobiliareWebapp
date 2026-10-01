-- Applicata il 1 ottobre 2026.
-- Prenotazione sicura lato server:
--  * colonne per messaggio del cliente e consensi privacy/marketing con data
--  * funzione gre_create_booking: crea cliente + prenotazione in un'unica operazione,
--    bloccando l'orario per evitare di superare i posti, rifiutando Open House passati
--    o disattivati e doppie prenotazioni della stessa persona.
--    Eseguibile solo dal server (service role).

ALTER TABLE public.gre_bookings ADD COLUMN IF NOT EXISTS note_cliente text;
ALTER TABLE public.gre_clients ADD COLUMN IF NOT EXISTS gdpr_consent_at timestamptz;
ALTER TABLE public.gre_clients ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.gre_clients ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz;

CREATE OR REPLACE FUNCTION public.gre_create_booking(
  p_open_house_id uuid,
  p_slot_id uuid,
  p_nome text,
  p_cognome text,
  p_email text,
  p_telefono text,
  p_messaggio text,
  p_agente_referente_id uuid,
  p_marketing boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot gre_time_slots%ROWTYPE;
  v_oh gre_open_houses%ROWTYPE;
  v_occupied int;
  v_client_id uuid;
  v_existing record;
  v_booking_id uuid;
  v_email text := lower(trim(p_email));
  v_referente uuid;
BEGIN
  -- Blocca l'orario: due prenotazioni simultanee vengono servite una alla volta
  SELECT * INTO v_slot FROM gre_time_slots
   WHERE id = p_slot_id AND open_house_id = p_open_house_id
   FOR UPDATE;
  IF NOT FOUND OR v_slot.is_available IS FALSE THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  SELECT * INTO v_oh FROM gre_open_houses WHERE id = p_open_house_id;
  IF NOT FOUND OR v_oh.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('error', 'open_house_not_active');
  END IF;

  -- Open House già concluso (ora italiana)
  IF (v_oh.data_evento + v_oh.ora_fine) < (now() AT TIME ZONE 'Europe/Rome') THEN
    RETURN jsonb_build_object('error', 'open_house_past');
  END IF;

  -- Già prenotato a questo Open House? (controllato prima dei posti, per un messaggio più chiaro)
  SELECT b.id, s.ora_inizio, s.ora_fine INTO v_existing
    FROM gre_bookings b
    JOIN gre_clients c ON c.id = b.client_id
    LEFT JOIN gre_time_slots s ON s.id = b.time_slot_id
   WHERE lower(c.email) = v_email AND b.open_house_id = p_open_house_id
     AND b.status IN ('confirmed', 'completed')
   LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_booked',
      'ora_inizio', v_existing.ora_inizio, 'ora_fine', v_existing.ora_fine);
  END IF;

  SELECT count(*) INTO v_occupied FROM gre_bookings
   WHERE time_slot_id = p_slot_id AND status IN ('confirmed', 'completed');
  IF v_occupied >= COALESCE(v_slot.max_partecipanti, 1) THEN
    RETURN jsonb_build_object('error', 'slot_full');
  END IF;

  -- Cliente: cerca per email; non sovrascrive i dati già presenti
  SELECT id INTO v_client_id FROM gre_clients WHERE lower(email) = v_email ORDER BY created_at LIMIT 1;
  IF v_client_id IS NULL THEN
    INSERT INTO gre_clients (email, nome, cognome, telefono, gdpr_consent, gdpr_consent_at, marketing_consent, marketing_consent_at)
    VALUES (v_email, trim(p_nome), trim(p_cognome), trim(p_telefono), true, now(),
            COALESCE(p_marketing, false), CASE WHEN p_marketing THEN now() END)
    RETURNING id INTO v_client_id;
  ELSE
    UPDATE gre_clients SET
      nome = COALESCE(NULLIF(nome, ''), trim(p_nome)),
      cognome = COALESCE(NULLIF(cognome, ''), trim(p_cognome)),
      telefono = COALESCE(NULLIF(telefono, ''), trim(p_telefono)),
      gdpr_consent = true,
      gdpr_consent_at = now(),
      marketing_consent = CASE WHEN p_marketing THEN true ELSE marketing_consent END,
      marketing_consent_at = CASE WHEN p_marketing THEN now() ELSE marketing_consent_at END
    WHERE id = v_client_id;
  END IF;

  -- Agente di riferimento solo se esiste ed è attivo
  SELECT id INTO v_referente FROM gre_agents WHERE id = p_agente_referente_id AND is_active;

  INSERT INTO gre_bookings (open_house_id, time_slot_id, client_id, agent_id, agente_referente_id,
                            status, questionnaire_completed, confirmation_email_sent, brochure_email_sent, note_cliente)
  VALUES (p_open_house_id, p_slot_id, v_client_id, v_oh.agent_id, v_referente,
          'confirmed', false, false, false, NULLIF(trim(p_messaggio), ''))
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id);
END;
$$;

REVOKE ALL ON FUNCTION public.gre_create_booking(uuid, uuid, text, text, text, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gre_create_booking(uuid, uuid, text, text, text, text, text, uuid, boolean) TO service_role;
