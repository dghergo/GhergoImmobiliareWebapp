import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { followerId, followsClient, openHouseAccess } from '@/lib/oh-access'
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
  const { oh, role } = access

  const { data: bookings } = await getSupabaseAdmin()
    .from('gre_bookings')
    .select(`
      id, status, cancellation_reason, questionnaire_completed, note_cliente, agente_referente_id, client_id,
      gre_clients (nome, cognome, email, telefono),
      gre_time_slots (ora_inizio, ora_fine),
      gre_prequalification_responses (response_data),
      referente:gre_agents!gre_bookings_agente_referente_id_fkey (id, nome, cognome)
    `)
    .eq('open_house_id', id)

  const org = oh.gre_agents as unknown as { nome: string; cognome: string } | null
  const organizerName = org ? `${org.nome} ${org.cognome}` : ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (bookings || []).flatMap((b: any) => {
    const mine = followsClient(b, oh.agent_id, auth.agent, role)
    if (role === 'collega' && !mine) return []
    const ref = b.referente && b.referente.id !== oh.agent_id ? b.referente : null
    return [{
      id: b.id,
      status: b.status,
      cancellation_reason: b.cancellation_reason,
      questionnaire_completed: mine ? b.questionnaire_completed : null,
      mine,
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
      q: mine ? b.gre_prequalification_responses?.[0]?.response_data || null : null,
    }]
  })

  return NextResponse.json({ openHouse: oh, role, rows }, { headers: { 'Cache-Control': 'no-store' } })
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
  const { data: b } = await supabase
    .from('gre_bookings').select('id, status, cancellation_reason, agente_referente_id, client_id, gre_clients (nome, cognome, email, telefono)')
    .eq('id', String(body.bookingId || '')).eq('open_house_id', id).maybeSingle()
  if (!b || (b.status === 'no_show' && b.cancellation_reason === 'cancelled_by_agent')) {
    return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
  }
  const mine = followsClient(b, access.oh.agent_id, auth.agent, access.role)
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
    const agentId = followerId(b, access.oh.agent_id)
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
