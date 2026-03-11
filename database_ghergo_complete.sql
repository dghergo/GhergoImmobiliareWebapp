-- ============================================
-- SCHEMA DATABASE GHERGO IMMOBILIARE WEBAPP
-- Esportato il 11 Marzo 2026
-- ============================================

-- Nota: Questo include SOLO le tabelle dell'app Ghergo (prefisso gre_)
-- Esegui questo script nel SQL Editor di Supabase del progetto di PRODUZIONE

-- ============================================
-- PARTE 1: TABELLE
-- ============================================

-- Tabella: gre_agents
CREATE TABLE gre_agents (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  nome TEXT NOT NULL,
  cognome TEXT NOT NULL,
  role TEXT DEFAULT 'agent'::text,
  google_access_token TEXT,
  google_refresh_token TEXT,
  gmail_settings JSONB DEFAULT '{}'::jsonb,
  calendar_settings JSONB DEFAULT '{}'::jsonb,
  notification_preferences JSONB DEFAULT '{"new_bookings": true, "cancellations": true, "reminder_timing": 24, "email_notifications": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  password_changed BOOLEAN DEFAULT false,
  google_oauth_enabled BOOLEAN DEFAULT false,
  google_tokens JSONB
);

-- Tabella: gre_clients
CREATE TABLE gre_clients (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  nome TEXT NOT NULL,
  cognome TEXT NOT NULL,
  telefono TEXT,
  gdpr_consent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabella: gre_properties
CREATE TABLE gre_properties (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  agent_id UUID,
  titolo TEXT NOT NULL,
  descrizione TEXT,
  prezzo NUMERIC,
  tipologia TEXT,
  zona TEXT NOT NULL,
  indirizzo TEXT,
  caratteristiche JSONB DEFAULT '{}'::jsonb,
  immagini TEXT[] DEFAULT ARRAY[]::TEXT[],
  brochure_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabella: gre_open_houses
CREATE TABLE gre_open_houses (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  property_id UUID,
  agent_id UUID,
  data_evento DATE NOT NULL,
  ora_inizio TIME WITHOUT TIME ZONE NOT NULL,
  ora_fine TIME WITHOUT TIME ZONE NOT NULL,
  durata_slot INTEGER DEFAULT 20,
  max_partecipanti_slot INTEGER DEFAULT 1,
  descrizione_evento TEXT,
  is_active BOOLEAN DEFAULT true,
  google_calendar_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabella: gre_time_slots
CREATE TABLE gre_time_slots (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  open_house_id UUID,
  ora_inizio TIME WITHOUT TIME ZONE NOT NULL,
  ora_fine TIME WITHOUT TIME ZONE NOT NULL,
  max_partecipanti INTEGER DEFAULT 1,
  partecipanti_attuali INTEGER DEFAULT 0,
  is_available BOOLEAN DEFAULT true
);

-- Tabella: gre_bookings
CREATE TABLE gre_bookings (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  open_house_id UUID,
  time_slot_id UUID,
  client_id UUID,
  agent_id UUID,
  status TEXT DEFAULT 'confirmed'::text,
  cancellation_reason TEXT,
  prequalification_completed BOOLEAN DEFAULT false,
  prequalification_score INTEGER,
  feedback_completed BOOLEAN DEFAULT false,
  google_calendar_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  questionnaire_completed BOOLEAN DEFAULT false,
  confirmation_email_sent BOOLEAN DEFAULT false,
  brochure_email_sent BOOLEAN DEFAULT false,
  feedback_email_sent BOOLEAN DEFAULT false
);

-- Tabella: gre_prequalification_responses
CREATE TABLE gre_prequalification_responses (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  booking_id UUID,
  google_form_response_id TEXT,
  response_data JSONB DEFAULT '{}'::jsonb,
  score_calculated INTEGER,
  completed_at TIMESTAMPTZ DEFAULT now()
);

-- Tabella: gre_feedback_responses
CREATE TABLE gre_feedback_responses (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  booking_id UUID,
  rating INTEGER,
  commenti TEXT,
  interesse_acquisto BOOLEAN,
  richiesta_appuntamento BOOLEAN,
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- Tabella: gre_office_appointments
CREATE TABLE gre_office_appointments (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  client_id UUID,
  agent_id UUID,
  booking_id UUID,
  data_appuntamento DATE NOT NULL,
  ora_appuntamento TIME WITHOUT TIME ZONE NOT NULL,
  durata_minuti INTEGER DEFAULT 60,
  status TEXT DEFAULT 'scheduled'::text,
  note TEXT,
  google_calendar_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- PARTE 2: PRIMARY KEYS
-- ============================================

ALTER TABLE gre_agents ADD CONSTRAINT gre_agents_pkey PRIMARY KEY (id);
ALTER TABLE gre_clients ADD CONSTRAINT gre_clients_pkey PRIMARY KEY (id);
ALTER TABLE gre_properties ADD CONSTRAINT gre_properties_pkey PRIMARY KEY (id);
ALTER TABLE gre_open_houses ADD CONSTRAINT gre_open_houses_pkey PRIMARY KEY (id);
ALTER TABLE gre_time_slots ADD CONSTRAINT gre_time_slots_pkey PRIMARY KEY (id);
ALTER TABLE gre_bookings ADD CONSTRAINT gre_bookings_pkey PRIMARY KEY (id);
ALTER TABLE gre_prequalification_responses ADD CONSTRAINT gre_prequalification_responses_pkey PRIMARY KEY (id);
ALTER TABLE gre_feedback_responses ADD CONSTRAINT gre_feedback_responses_pkey PRIMARY KEY (id);
ALTER TABLE gre_office_appointments ADD CONSTRAINT gre_office_appointments_pkey PRIMARY KEY (id);

-- ============================================
-- PARTE 3: UNIQUE CONSTRAINTS
-- ============================================

ALTER TABLE gre_agents ADD CONSTRAINT gre_agents_email_key UNIQUE (email);
ALTER TABLE gre_clients ADD CONSTRAINT gre_clients_email_key UNIQUE (email);

-- ============================================
-- PARTE 4: FOREIGN KEYS
-- ============================================

-- Properties
ALTER TABLE gre_properties
  ADD CONSTRAINT gre_properties_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES gre_agents(id) ON DELETE SET NULL;

-- Open Houses
ALTER TABLE gre_open_houses
  ADD CONSTRAINT gre_open_houses_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES gre_properties(id) ON DELETE CASCADE;

ALTER TABLE gre_open_houses
  ADD CONSTRAINT gre_open_houses_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES gre_agents(id) ON DELETE SET NULL;

-- Time Slots
ALTER TABLE gre_time_slots
  ADD CONSTRAINT gre_time_slots_open_house_id_fkey
  FOREIGN KEY (open_house_id) REFERENCES gre_open_houses(id) ON DELETE CASCADE;

-- Bookings
ALTER TABLE gre_bookings
  ADD CONSTRAINT gre_bookings_open_house_id_fkey
  FOREIGN KEY (open_house_id) REFERENCES gre_open_houses(id) ON DELETE CASCADE;

ALTER TABLE gre_bookings
  ADD CONSTRAINT gre_bookings_time_slot_id_fkey
  FOREIGN KEY (time_slot_id) REFERENCES gre_time_slots(id) ON DELETE SET NULL;

ALTER TABLE gre_bookings
  ADD CONSTRAINT gre_bookings_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES gre_clients(id) ON DELETE CASCADE;

ALTER TABLE gre_bookings
  ADD CONSTRAINT gre_bookings_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES gre_agents(id) ON DELETE SET NULL;

-- Prequalification Responses
ALTER TABLE gre_prequalification_responses
  ADD CONSTRAINT gre_prequalification_responses_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES gre_bookings(id) ON DELETE CASCADE;

-- Feedback Responses
ALTER TABLE gre_feedback_responses
  ADD CONSTRAINT gre_feedback_responses_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES gre_bookings(id) ON DELETE CASCADE;

-- Office Appointments
ALTER TABLE gre_office_appointments
  ADD CONSTRAINT gre_office_appointments_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES gre_clients(id) ON DELETE CASCADE;

ALTER TABLE gre_office_appointments
  ADD CONSTRAINT gre_office_appointments_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES gre_agents(id) ON DELETE SET NULL;

ALTER TABLE gre_office_appointments
  ADD CONSTRAINT gre_office_appointments_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES gre_bookings(id) ON DELETE SET NULL;

-- ============================================
-- PARTE 5: INDICI
-- ============================================

-- Indici per performance
CREATE INDEX idx_gre_properties_agent_id ON gre_properties(agent_id);
CREATE INDEX idx_gre_properties_is_active ON gre_properties(is_active);
CREATE INDEX idx_gre_open_houses_property_id ON gre_open_houses(property_id);
CREATE INDEX idx_gre_open_houses_agent_id ON gre_open_houses(agent_id);
CREATE INDEX idx_gre_open_houses_data_evento ON gre_open_houses(data_evento);
CREATE INDEX idx_gre_time_slots_open_house_id ON gre_time_slots(open_house_id);
CREATE INDEX idx_gre_bookings_open_house_id ON gre_bookings(open_house_id);
CREATE INDEX idx_gre_bookings_client_id ON gre_bookings(client_id);
CREATE INDEX idx_gre_bookings_agent_id ON gre_bookings(agent_id);
CREATE INDEX idx_gre_bookings_status ON gre_bookings(status);
CREATE INDEX idx_gre_agents_google_oauth_enabled ON gre_agents(google_oauth_enabled) WHERE google_oauth_enabled = true;

-- ============================================
-- PARTE 6: FUNZIONI E TRIGGER
-- ============================================

-- Funzione per aggiornare automaticamente updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger per gre_properties
CREATE TRIGGER update_gre_properties_updated_at
    BEFORE UPDATE ON gre_properties
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Funzione per gestire occupancy degli slot
CREATE OR REPLACE FUNCTION update_time_slot_occupancy(slot_id UUID, increment INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE gre_time_slots
  SET partecipanti_attuali = partecipanti_attuali + increment
  WHERE id = slot_id;

  UPDATE gre_time_slots
  SET is_available = (partecipanti_attuali < max_partecipanti)
  WHERE id = slot_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PARTE 7: COMMENTI SULLE COLONNE
-- ============================================

COMMENT ON COLUMN gre_agents.google_oauth_enabled IS
  'Flag per abilitare/disabilitare Google OAuth login per questo agente. Deve essere abilitato dall''admin.';

COMMENT ON COLUMN gre_agents.google_tokens IS
  'Stores Google OAuth tokens (access_token, refresh_token, expiry_date) per Gmail e Calendar.';

COMMENT ON COLUMN gre_bookings.feedback_email_sent IS
  'Flag per tracciare se l''email di richiesta feedback è stata inviata dopo la visita.';

-- ============================================
-- PARTE 8: DISABILITA RLS (Row Level Security)
-- ============================================

-- NOTA: RLS è temporaneamente disabilitato per semplificare la configurazione iniziale
-- In futuro può essere riabilitato con policy corrette

ALTER TABLE gre_agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE gre_clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE gre_properties DISABLE ROW LEVEL SECURITY;
ALTER TABLE gre_open_houses DISABLE ROW LEVEL SECURITY;
ALTER TABLE gre_time_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE gre_bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE gre_prequalification_responses DISABLE ROW LEVEL SECURITY;
ALTER TABLE gre_feedback_responses DISABLE ROW LEVEL SECURITY;
ALTER TABLE gre_office_appointments DISABLE ROW LEVEL SECURITY;

-- ============================================
-- PARTE 9: DATI INIZIALI (ADMIN)
-- ============================================

-- Crea l'agente admin principale
INSERT INTO gre_agents (email, nome, cognome, role, is_active, password_changed, google_oauth_enabled)
VALUES ('dghergo@ghergoimmobiliare.com', 'Daniele', 'Ghergo', 'admin', true, true, true)
ON CONFLICT (email) DO UPDATE SET
  role = 'admin',
  is_active = true,
  password_changed = true,
  google_oauth_enabled = true;

-- ============================================
-- FINE SCRIPT
-- ============================================

-- ISTRUZIONI POST-ESECUZIONE:
-- 1. Vai su Authentication > Users
-- 2. Crea utente con email: dghergo@ghergoimmobiliare.com
-- 3. Password temporanea: Ghergo2024!
-- 4. Spunta "Auto Confirm User"
-- 5. Vai su Storage e crea i bucket:
--    - gre_property_images (public)
--    - gre_property_documents (public)
