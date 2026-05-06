-- Migrazione: Aggiunge colonna agente_referente_id alla tabella gre_bookings
-- Permette al cliente di selezionare un agente di riferimento personale durante la prenotazione
-- Questo campo e' separato da agent_id (agente dell'immobile)

ALTER TABLE gre_bookings
ADD COLUMN IF NOT EXISTS agente_referente_id UUID REFERENCES gre_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gre_bookings_agente_referente_id
ON gre_bookings(agente_referente_id);
