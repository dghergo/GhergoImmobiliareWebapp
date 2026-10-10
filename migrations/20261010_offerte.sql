-- Offerte ricevute sugli immobili degli Open House: chi l'ha fatta, quanto, stato.
-- Si leggono e scrivono solo dal server (API con controlli per ruolo): RLS attiva senza policy per i client.
CREATE TABLE IF NOT EXISTS gre_offerte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES gre_bookings(id) ON DELETE CASCADE,
  open_house_id uuid NOT NULL,
  property_id uuid NOT NULL,
  importo numeric NOT NULL CHECK (importo > 0),
  data date NOT NULL DEFAULT current_date,
  stato text NOT NULL DEFAULT 'presentata' CHECK (stato IN ('presentata', 'accettata', 'rifiutata', 'ritirata')),
  condizioni text,
  inserita_da uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gre_offerte_property_idx ON gre_offerte (property_id);
CREATE INDEX IF NOT EXISTS gre_offerte_oh_idx ON gre_offerte (open_house_id);
ALTER TABLE gre_offerte ENABLE ROW LEVEL SECURITY;
