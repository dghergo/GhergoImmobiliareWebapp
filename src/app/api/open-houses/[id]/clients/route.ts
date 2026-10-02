import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { followsClient, openHouseAccess } from '@/lib/oh-access'

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
      id, status, cancellation_reason, questionnaire_completed, note_cliente, agente_referente_id,
      gre_clients (nome, cognome, email, telefono),
      gre_time_slots (ora_inizio, ora_fine),
      gre_prequalification_responses (response_data),
      referente:gre_agents!gre_bookings_agente_referente_id_fkey (id, nome, cognome)
    `)
    .eq('open_house_id', id)

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
  if (!['confirmed', 'completed', 'no_show'].includes(body.status)) {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  const supabase = getSupabaseAdmin()
  const { data: b } = await supabase
    .from('gre_bookings').select('id, status, cancellation_reason, agente_referente_id')
    .eq('id', String(body.bookingId || '')).eq('open_house_id', id).maybeSingle()
  if (!b || (b.status === 'no_show' && b.cancellation_reason === 'cancelled_by_agent')) {
    return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
  }
  if (access.role === 'collega' && !followsClient(b, access.oh.agent_id, auth.agent, access.role)) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }
  const { error } = await supabase.from('gre_bookings').update({ status: body.status }).eq('id', b.id)
  if (error) return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
