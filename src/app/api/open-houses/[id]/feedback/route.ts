import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff, type StaffAgent } from '@/lib/server-auth'

// Feedback di un Open House per il cruscotto e il report venditore.
// Solo l'agente dell'Open House (o l'admin).

async function loadOpenHouse(id: string, agent: StaffAgent) {
  const { data: oh } = await getSupabaseAdmin()
    .from('gre_open_houses')
    .select('id, agent_id, data_evento, ora_inizio, ora_fine, gre_properties (titolo, zona, indirizzo, prezzo, immagini), gre_agents (nome, cognome, email)')
    .eq('id', id)
    .maybeSingle()
  if (!oh || (agent.role !== 'admin' && oh.agent_id !== agent.id)) return null
  return oh
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const oh = await loadOpenHouse(id, auth.agent)
  if (!oh) return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })

  const { data: bookings } = await getSupabaseAdmin()
    .from('gre_bookings')
    .select(`
      id, status, cancellation_reason, feedback_email_sent, feedback_completed, feedback_whatsapp_at,
      gre_clients (nome, cognome, telefono, email),
      gre_time_slots (ora_inizio),
      gre_prequalification_responses (response_data),
      gre_feedback_responses (id, rating, commenti, interesse_acquisto, richiesta_appuntamento, risposte, offerta_quando, offerta_gestita_at, submitted_at)
    `)
    .eq('open_house_id', id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (bookings || []).filter((b: any) => !(b.status === 'no_show' && b.cancellation_reason === 'cancelled_by_agent')).map((b: any) => ({
    id: b.id,
    status: b.status,
    feedback_email_sent: b.feedback_email_sent,
    feedback_completed: b.feedback_completed,
    feedback_whatsapp_at: b.feedback_whatsapp_at,
    client: b.gre_clients,
    ora: b.gre_time_slots?.ora_inizio || null,
    feedback: b.gre_feedback_responses?.[0] || null,
    q: b.gre_prequalification_responses?.[0]?.response_data || null,
  }))

  return NextResponse.json({ openHouse: oh, rows }, { headers: { 'Cache-Control': 'no-store' } })
}

// Azioni: sollecito WhatsApp inviato, richiesta di offerta gestita
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const oh = await loadOpenHouse(id, auth.agent)
  if (!oh) return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const supabase = getSupabaseAdmin()
  const { data: booking } = await supabase
    .from('gre_bookings').select('id').eq('id', String(body.bookingId || '')).eq('open_house_id', id).maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })

  const now = new Date().toISOString()
  if (body.action === 'whatsapp_sent') {
    await supabase.from('gre_bookings').update({ feedback_whatsapp_at: now }).eq('id', booking.id)
  } else if (body.action === 'offer_handled' || body.action === 'offer_reopen') {
    await supabase
      .from('gre_feedback_responses')
      .update({ offerta_gestita_at: body.action === 'offer_handled' ? now : null })
      .eq('booking_id', booking.id)
  } else {
    return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, at: now })
}
