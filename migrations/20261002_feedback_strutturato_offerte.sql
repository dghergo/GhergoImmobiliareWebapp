-- Feedback strutturato dopo la visita e gestione delle richieste di offerta (applicata il 2/10/2026)
alter table public.gre_feedback_responses
  add column if not exists risposte jsonb,
  add column if not exists offerta_quando text,
  add column if not exists offerta_gestita_at timestamptz;
alter table public.gre_bookings
  add column if not exists feedback_whatsapp_at timestamptz;
