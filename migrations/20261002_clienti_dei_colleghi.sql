-- Il cliente è di chi lo porta (2/10/2026).
-- Se un cliente indica come agente di riferimento un collega diverso da chi organizza l'Open House,
-- l'organizzatore NON vede i suoi dati (contatti, note, questionario, feedback): li vede solo il collega.
-- L'organizzatore continua a vedere i propri clienti; l'amministratore vede tutto.
-- Per l'organizzatore il nome del cliente e l'orario arrivano dal server (cruscotto e check-in), senza contatti.

create or replace function public.gre_follows_booking(p_agent_id uuid, p_referente_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.gre_my_agent_id() is not null and (
    p_referente_id = public.gre_my_agent_id()
    or (p_agent_id = public.gre_my_agent_id() and (p_referente_id is null or p_referente_id = p_agent_id))
  );
$$;
revoke execute on function public.gre_follows_booking(uuid, uuid) from public, anon;
grant execute on function public.gre_follows_booking(uuid, uuid) to authenticated;

alter policy staff_all on public.gre_bookings
  using (public.gre_is_admin() or public.gre_follows_booking(agent_id, agente_referente_id))
  with check (public.gre_is_admin() or public.gre_follows_booking(agent_id, agente_referente_id));

create or replace function public.gre_can_see_booking(p_booking_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.gre_is_admin() or exists (
    select 1 from gre_bookings b
     where b.id = p_booking_id and public.gre_follows_booking(b.agent_id, b.agente_referente_id)
  );
$$;

create or replace function public.gre_can_see_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.gre_is_admin() or exists (
    select 1 from gre_bookings b
     where b.client_id = p_client_id and public.gre_follows_booking(b.agent_id, b.agente_referente_id)
  );
$$;

-- (3/10/2026) già applicate: walk-in e foglio visita
-- alter table gre_bookings add senza_prenotazione, inserito_da, foglio_visita_firmato_at, foglio_visita_path, foglio_visita_dati;
-- bucket privato gre_fogli_visita; alter table gre_properties add dati_foglio jsonb;
