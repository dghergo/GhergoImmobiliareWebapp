-- Clienti che devono vendere casa: messaggi WhatsApp con grafica.
-- 1) dopo l'Open House: "ti è piaciuto il nostro metodo? fissiamo un appuntamento per la tua casa"
-- 2) quando l'immobile visitato è venduto: "è stato venduto, ecco i risultati: facciamo lo stesso per la tua?"
ALTER TABLE gre_properties ADD COLUMN IF NOT EXISTS venduto_il date;
ALTER TABLE gre_bookings ADD COLUMN IF NOT EXISTS wa_vendita_at timestamptz;
ALTER TABLE gre_bookings ADD COLUMN IF NOT EXISTS wa_venduto_at timestamptz;
