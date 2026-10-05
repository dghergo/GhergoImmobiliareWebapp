-- Riempimento graduale degli orari + gestione manuale degli slot.
-- 1) Di default 3 posti per orario; i posti si aprono "a giri": prima un posto per ogni orario,
--    poi il secondo, poi il terzo. Così i prenotati si distribuiscono su tutto l'Open House.
--    Per lasciare scelta al cliente, quando nel giro in corso restano meno di 3 orari liberi
--    si apre anche il giro successivo (mai più di 2 prenotati di differenza tra un orario e l'altro).
-- 2) L'agente può modificare a mano capienza, orario, aprire/chiudere e aggiungere singoli slot:
--    gli slot toccati a mano (manuale = true) non vengono più riscritti quando si salva l'Open House.

ALTER TABLE gre_open_houses ADD COLUMN IF NOT EXISTS riempimento_graduale boolean NOT NULL DEFAULT true;
ALTER TABLE gre_open_houses ALTER COLUMN max_partecipanti_slot SET DEFAULT 3;
ALTER TABLE gre_time_slots ADD COLUMN IF NOT EXISTS manuale boolean NOT NULL DEFAULT false;

-- Orari prenotabili adesso (regola unica, usata sia dalla pagina pubblica sia dalla prenotazione)
CREATE OR REPLACE FUNCTION public.gre_slot_aperti(p_open_house_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH oh AS (
    SELECT data_evento, riempimento_graduale FROM gre_open_houses WHERE id = p_open_house_id
  ),
  s AS (
    SELECT t.id, COALESCE(t.max_partecipanti, 1) AS cap,
           (SELECT count(*) FROM gre_bookings b
             WHERE b.time_slot_id = t.id AND b.status IN ('confirmed', 'completed')) AS occ
      FROM gre_time_slots t, oh
     WHERE t.open_house_id = p_open_house_id
       AND t.is_available IS NOT FALSE
       AND (oh.data_evento + t.ora_fine) > (now() AT TIME ZONE 'Europe/Rome')
  ),
  liberi AS (SELECT * FROM s WHERE occ < cap),
  lv AS (SELECT min(occ) AS m FROM liberi),
  giro AS (SELECT l.id FROM liberi l, lv WHERE l.occ = lv.m)
  SELECT id FROM liberi WHERE NOT (SELECT riempimento_graduale FROM oh)
  UNION
  SELECT id FROM giro WHERE (SELECT riempimento_graduale FROM oh)
  UNION
  SELECT l.id FROM liberi l, lv
   WHERE (SELECT riempimento_graduale FROM oh)
     AND l.occ = lv.m + 1
     AND (SELECT count(*) FROM giro) < 3
$$;

REVOKE ALL ON FUNCTION public.gre_slot_aperti(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gre_slot_aperti(uuid) TO service_role;

-- Prenotazione: stessa logica di prima + controllo del riempimento graduale.
-- Si blocca la riga dell'Open House così due prenotazioni simultanee non saltano la regola.
CREATE OR REPLACE FUNCTION public.gre_create_booking(p_open_house_id uuid, p_slot_id uuid, p_nome text, p_cognome text, p_email text, p_telefono text, p_messaggio text, p_agente_referente_id uuid, p_marketing boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  SELECT * INTO v_oh FROM gre_open_houses WHERE id = p_open_house_id FOR UPDATE;
  IF NOT FOUND OR v_oh.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('error', 'open_house_not_active');
  END IF;

  SELECT * INTO v_slot FROM gre_time_slots
   WHERE id = p_slot_id AND open_house_id = p_open_house_id
   FOR UPDATE;
  IF NOT FOUND OR v_slot.is_available IS FALSE THEN
    RETURN jsonb_build_object('error', 'slot_not_found');
  END IF;

  IF (v_oh.data_evento + v_oh.ora_fine) < (now() AT TIME ZONE 'Europe/Rome') THEN
    RETURN jsonb_build_object('error', 'open_house_past');
  END IF;

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

  IF NOT EXISTS (SELECT 1 FROM gre_slot_aperti(p_open_house_id) a WHERE a = p_slot_id) THEN
    RETURN jsonb_build_object('error', 'slot_full');
  END IF;

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

  SELECT id INTO v_referente FROM gre_agents WHERE id = p_agente_referente_id AND is_active;

  INSERT INTO gre_bookings (open_house_id, time_slot_id, client_id, agent_id, agente_referente_id,
                            status, questionnaire_completed, confirmation_email_sent, brochure_email_sent, note_cliente)
  VALUES (p_open_house_id, p_slot_id, v_client_id, v_oh.agent_id, v_referente,
          'confirmed', false, false, false, NULLIF(trim(p_messaggio), ''))
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id);
END;
$function$;
