import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { followerId, followsClient, isTeamClient, openHouseAccess, teamNames } from '@/lib/oh-access'
import { brochureEmail, sendAsAgent } from '@/lib/feedback-emails'

export const maxDuration = 60
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Clienti di un Open House per cruscotto e check-in.
// Chi segue il cliente vede tutto; l'organizzatore, per i clienti portati dai colleghi, vede solo nome e orario.
// Il collega vede soltanto i propri clienti.

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return NextResponse.json({ error: 'Open House non trovato o non accessibile' }, { status: 404 })
  const { oh, role, team } = access

  const { data: bookings } = await getSupabaseAdmin()
    .from('gre_bookings')
    .select(`
      id, status, cancellation_reason, questionnaire_completed, note_cliente, agente_referente_id, client_id, senza_prenotazione, foglio_visita_firmato_at,
      gre_clients (nome, cognome, email, telefono),
      gre_time_slots (ora_inizio, ora_fine),
      gre_prequalification_responses (response_data),
      referente:gre_agents!gre_bookings_agente_referente_id_fkey (id, nome, cognome)
    `)
    .eq('open_house_id', id)

  const organizerName = team.lead ? `${team.lead.nome} ${team.lead.cognome}` : teamNames(team)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (bookings || []).flatMap((b: any) => {
    const mine = followsClient(b, team, auth.agent, role)
    if (role === 'collega' && !mine) return []
    const ref = b.referente && !isTeamClient(b, team) ? b.referente : null
    const qq = b.gre_prequalification_responses?.[0]?.response_data || null
    return [{
      id: b.id,
      status: b.status,
      cancellation_reason: b.cancellation_reason,
      senza_prenotazione: !!b.senza_prenotazione,
      foglio_firmato_at: b.foglio_visita_firmato_at,
      questionnaire_completed: mine ? b.questionnaire_completed : null,
      mine,
      // cliente seguito da chi sta guardando (per distinguere "tuo" / "mandato da un collega")
      tuo: isTeamClient(b, team) ? team.ids.includes(auth.agent.id) : b.agente_referente_id === auth.agent.id,
      // indicatori minimi visibili a tutti al check-in (nessun recapito né condizioni)
      senza_mutuo: qq?.necessita_mutuo === 'no',
      deve_vendere: typeof qq?.vendita_immobile === 'string' && qq.vendita_immobile.startsWith('si'),
      portato_da: ref ? `${ref.nome} ${ref.cognome}` : null,
      // agente con cui il cliente ha prenotato (chi lo segue)
      agente: ref ? `${ref.nome} ${ref.cognome}` : organizerName,
      client: {
        nome: b.gre_clients?.nome || '',
        cognome: b.gre_clients?.cognome || '',
        email: mine ? b.gre_clients?.email || '' : '',
        telefono: mine ? b.gre_clients?.telefono || '' : '',
      },
      note_cliente: mine ? b.note_cliente : null,
      slot: b.gre_time_slots || null,
      q: mine ? qq : null,
    }]
  })

  return NextResponse.json({ openHouse: oh, role, team: { nomi: teamNames(team), lead: organizerName }, rows }, { headers: { 'Cache-Control': 'no-store' } })
}

// Check-in: arrivato / non venuto / annulla. L'organizzatore può segnare tutti (è alla porta), il collega solo i suoi.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return NextResponse.json({ error: 'Open House non trovato o non accessibile' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const action = body.action || 'status'
  const supabase = getSupabaseAdmin()

  // Cliente arrivato senza prenotazione: lo inserisce l'agente al check-in
  if (action === 'walk_in') return walkIn(body, access, auth.agent)

  const { data: b } = await supabase
    .from('gre_bookings').select('id, status, cancellation_reason, agente_referente_id, client_id, gre_clients (nome, cognome, email, telefono)')
    .eq('id', String(body.bookingId || '')).eq('open_house_id', id).maybeSingle()
  if (!b || (b.status === 'no_show' && b.cancellation_reason === 'cancelled_by_agent')) {
    return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
  }
  const mine = followsClient(b, access.team, auth.agent, access.role)
  if (access.role === 'collega' && !mine) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  // Modifica di telefono / email del cliente (solo chi lo segue)
  if (action === 'update_contact') {
    if (!mine) return NextResponse.json({ error: 'I contatti li modifica l\'agente che segue il cliente' }, { status: 403 })
    const email = String(body.email || '').trim().toLowerCase().slice(0, 160)
    const telefono = String(body.telefono || '').trim().slice(0, 30)
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Email non valida' }, { status: 400 })
    if (telefono.replace(/\D/g, '').length < 6) return NextResponse.json({ error: 'Telefono non valido' }, { status: 400 })
    const { data: other } = await supabase.from('gre_clients').select('id').eq('email', email).neq('id', b.client_id).maybeSingle()
    if (other) return NextResponse.json({ error: 'Questa email è già usata da un altro cliente' }, { status: 409 })
    const { error } = await supabase.from('gre_clients').update({ email, telefono }).eq('id', b.client_id)
    if (error) return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 })
    return NextResponse.json({ ok: true, email, telefono })
  }

  // Invio della brochure al cliente (dalla casella di chi lo segue)
  if (action === 'send_brochure') {
    if (!mine) return NextResponse.json({ error: 'La brochure la invia l\'agente che segue il cliente' }, { status: 403 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = access.oh.gre_properties as any
    if (!property?.brochure_url) return NextResponse.json({ error: 'Nessuna brochure caricata per questo immobile' }, { status: 400 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = b.gre_clients as any
    const agentId = followerId(b, access.team)
    const { data: agent } = await supabase.from('gre_agents').select('id, nome, cognome, email').eq('id', agentId).maybeSingle()
    if (!client?.email || !agent) return NextResponse.json({ error: 'Email del cliente mancante' }, { status: 400 })
    try {
      await sendAsAgent(client.email, brochureEmail({ client, agent, property }), agent.id)
    } catch (e) {
      console.error('Brochure non inviata:', e)
      return NextResponse.json({ error: 'Invio non riuscito, riprova' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, to: client.email })
  }

  if (!['confirmed', 'completed', 'no_show'].includes(body.status)) {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  const { error } = await supabase.from('gre_bookings').update({ status: body.status }).eq('id', b.id)
  if (error) return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function walkIn(body: any, access: NonNullable<Awaited<ReturnType<typeof openHouseAccess>>>, me: { id: string; qualifica?: string }) {
  const supabase = getSupabaseAdmin()
  const clean = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '')
  const nome = clean(body.nome, 80)
  const cognome = clean(body.cognome, 80)
  const email = clean(body.email, 160).toLowerCase()
  const telefono = clean(body.telefono, 30)
  if (!nome || !cognome) return NextResponse.json({ error: 'Inserisci nome e cognome' }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Email non valida' }, { status: 400 })
  if (telefono.replace(/\D/g, '').length < 6) return NextResponse.json({ error: 'Telefono non valido' }, { status: 400 })
  if (body.privacy !== true) return NextResponse.json({ error: 'Il cliente deve accettare l\'informativa privacy' }, { status: 400 })

  const { oh } = access
  const now = new Date().toISOString()

  // cliente: se esiste già (stessa email) lo riuso, altrimenti lo creo
  let { data: client } = await supabase.from('gre_clients').select('id, nome, cognome, email, telefono').eq('email', email).maybeSingle()
  if (!client) {
    const { data: created, error } = await supabase
      .from('gre_clients')
      .insert({ nome, cognome, email, telefono, gdpr_consent: true, gdpr_consent_at: now, marketing_consent: false })
      .select('id, nome, cognome, email, telefono')
      .single()
    if (error || !created) return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 })
    client = created
  } else if (!client.telefono) {
    await supabase.from('gre_clients').update({ telefono }).eq('id', client.id)
  }

  const { data: existing } = await supabase
    .from('gre_bookings').select('id').eq('open_house_id', oh.id).eq('client_id', client.id).neq('status', 'no_show').maybeSingle()
  if (existing) return NextResponse.json({ error: `${client.nome} ${client.cognome} è già nell'elenco: cercalo e segnalo come arrivato` }, { status: 409 })

  // il cliente è di chi lo inserisce (se è un collega abilitato), altrimenti degli organizzatori
  const referente = !access.team.ids.includes(me.id) && me.qualifica !== 'assistente' ? me.id : null
  const { data: booking, error: bErr } = await supabase
    .from('gre_bookings')
    .insert({
      open_house_id: oh.id,
      client_id: client.id,
      agent_id: oh.agent_id,
      agente_referente_id: referente,
      status: 'completed',
      senza_prenotazione: true,
      inserito_da: me.id,
      questionnaire_completed: false,
    })
    .select('id')
    .single()
  if (bErr || !booking) {
    console.error('walk-in booking error:', bErr)
    return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 })
  }

  // email di benvenuto con la brochure, dalla casella di chi segue il cliente
  let brochureInviata = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const property = oh.gre_properties as any
  if (property?.brochure_url) {
    const { data: agent } = await supabase.from('gre_agents').select('id, nome, cognome, email').eq('id', followerId({ agente_referente_id: referente }, access.team) || '').maybeSingle()
    if (agent) {
      try {
        await sendAsAgent(client.email, brochureEmail({ client, agent, property, benvenuto: true }), agent.id)
        brochureInviata = true
      } catch (e) {
        console.error('Brochure walk-in non inviata:', e)
      }
    }
  }

  return NextResponse.json({ ok: true, bookingId: booking.id, brochureInviata })
}
