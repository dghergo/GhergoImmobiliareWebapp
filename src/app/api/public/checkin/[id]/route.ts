import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'
import { verifyCheckinToken } from '@/lib/checkin-link'
import { isTeamClient, loadTeam, teamNames } from '@/lib/oh-access'

// Check-in alla porta per i colleghi che hanno il link: solo nome, orario, telefono e due indicatori (senza mutuo / deve vendere).
// Niente questionario completo, niente note, nessun altro Open House.

function denied(check: string) {
  return NextResponse.json(
    { error: check === 'expired' ? 'Questo link è scaduto. Chiedi un nuovo link all\'agente.' : 'Link non valido.' },
    { status: 403 }
  )
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const k = new URL(request.url).searchParams.get('k')
  const check = verifyCheckinToken(id, k)
  if (check !== 'ok') return denied(check)

  const supabase = getSupabaseAdmin()
  const [{ data: oh }, { data: bookings, error }] = await Promise.all([
    supabase
      .from('gre_open_houses')
      .select('id, agent_id, co_agent_id, data_evento, ora_inizio, ora_fine, gre_properties (titolo, zona), gre_agents (nome, cognome)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('gre_bookings')
      .select('id, status, cancellation_reason, agente_referente_id, gre_clients!inner (nome, cognome, telefono), gre_time_slots (ora_inizio, ora_fine), gre_prequalification_responses (response_data), referente:gre_agents!gre_bookings_agente_referente_id_fkey (nome, cognome)')
      .eq('open_house_id', id)
  ])
  if (!oh || error) return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })
  const team = await loadTeam(oh)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (bookings || []).filter((b: any) => !(b.status === 'no_show' && b.cancellation_reason === 'cancelled_by_agent')).map((b: any) => ({
    id: b.id,
    status: b.status,
    // i telefoni dei clienti portati dai colleghi restano ai colleghi
    client: {
      nome: b.gre_clients.nome,
      cognome: b.gre_clients.cognome,
      telefono: isTeamClient(b, team) ? b.gre_clients.telefono : '',
    },
    portato_da: !isTeamClient(b, team) && b.referente ? `${b.referente.nome} ${b.referente.cognome}` : null,
    senza_mutuo: b.gre_prequalification_responses?.[0]?.response_data?.necessita_mutuo === 'no',
    deve_vendere: String(b.gre_prequalification_responses?.[0]?.response_data?.vendita_immobile || '').startsWith('si'),
    slot: b.gre_time_slots
  }))

  return NextResponse.json({ openHouse: { ...oh, gestori: teamNames(team) }, rows }, { headers: { 'Cache-Control': 'no-store' } })
}

const ALLOWED = ['confirmed', 'completed', 'no_show'] as const

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const check = verifyCheckinToken(id, body.k)
  if (check !== 'ok') return denied(check)

  const status = body.status
  if (!ALLOWED.includes(status) || typeof body.bookingId !== 'string') {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: booking } = await supabase
    .from('gre_bookings')
    .select('id, status, cancellation_reason')
    .eq('id', body.bookingId)
    .eq('open_house_id', id)
    .maybeSingle()
  // Solo prenotazioni di questo Open House; quelle annullate dall'agente non si toccano
  if (!booking || (booking.status === 'no_show' && booking.cancellation_reason === 'cancelled_by_agent')) {
    return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
  }

  const { error } = await supabase.from('gre_bookings').update({ status }).eq('id', booking.id)
  if (error) return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
