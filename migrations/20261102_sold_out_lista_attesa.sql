-- Sold Out degli Open House + lista d'attesa
-- Solo aggiunte: nessuna colonna o tabella esistente viene modificata.

-- 1. L'organizzatore può chiudere le prenotazioni (Sold Out) senza togliere l'evento dall'elenco
alter table public.gre_open_houses
  add column if not exists sold_out boolean not null default false;

comment on column public.gre_open_houses.sold_out is
  'Prenotazioni chiuse dall''organizzatore: l''evento resta in elenco con la fascia SOLD OUT e raccoglie la lista d''attesa';

-- 2. Lista d'attesa: chi arriva quando l'Open House è al completo lascia i contatti
create table if not exists public.gre_waitlist (
  id uuid primary key default extensions.uuid_generate_v4(),
  open_house_id uuid not null references public.gre_open_houses(id),
  nome text not null,
  cognome text not null,
  email text not null,
  telefono text not null,
  messaggio text,
  agente_referente_id uuid references public.gre_agents(id),
  privacy_consent boolean not null default false,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  contattato_at timestamptz,
  contattato_da uuid references public.gre_agents(id)
);

create unique index if not exists gre_waitlist_oh_email_key on public.gre_waitlist (open_house_id, lower(email));
create index if not exists gre_waitlist_oh_idx on public.gre_waitlist (open_house_id, created_at);

comment on table public.gre_waitlist is
  'Lista d''attesa degli Open House in Sold Out. Accesso solo dal server (API), mai diretto dal browser.';

-- Database chiuso: nessuna policy, quindi niente accesso diretto da browser.
-- Le pagine pubbliche scrivono tramite /api/public/waitlist, la dashboard legge tramite /api/open-houses/[id]/waitlist
alter table public.gre_waitlist enable row level security;
