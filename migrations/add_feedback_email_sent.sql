-- Migrazione: Aggiunge colonna feedback_email_sent alla tabella gre_bookings
-- Necessaria per il sistema di feedback post-visita (FASE 3)

ALTER TABLE gre_bookings ADD COLUMN IF NOT EXISTS feedback_email_sent BOOLEAN DEFAULT false;
