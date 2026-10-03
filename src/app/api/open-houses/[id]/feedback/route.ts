import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { followsClient, openHouseAccess } from '@/lib/oh-access'

// Feedback di un Open House per il cruscotto: solo dei clienti che chi guarda segue.
// I clienti portati da un collega li vede (e li sollecita) solo il collega.

const SELECT = `
  id, status, cancellation_reason, agente_referente_id, promemoria_inviato_at, feedback_email_sent, feedback_completed, feedback_whatsapp_at,
  gre_clients (nome, cognome, telefono, email),
  gre_time_slots (ora_inizio),
  gre_feedback_responses (id, rating, commenti, interesse_acquisto, richiesta_appuntamento, risposte, offerta_quando, offerta_gestita_at, submitted_at)
`

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })
  const { oh, role } = access

  const { data: bookings } = await getSupabaseAdmin().from('gre_bookings').select(SELECT).eq('open_house_id', id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (bookings || []).filter((b: any) =>
    !(b.status === 'no_show' && b.cancellation_reason === 'cancelled_by_agent') && followsClient(b, oh.agent_id, auth.agent, role)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).map((b: any) => ({
    id: b.id,
    status: b.status,
    promemoria_inviato_at: b.promemoria_inviato_at,
    feedback_email_sent: b.feedback_email_sent,
    feedback_completed: b.feedback_completed,
    feedback_whatsapp_at: b.feedback_whatsapp_at,
    client: b.gre_clients,
    ora: b.gre_time_slots?.ora_inizio || null,
    feedback: b.gre_feedback_responses?.[0] || null,
  }))

  return NextResponse.json({ openHouse: oh, role, rows }, { headers: { 'Cache-Control': 'no-store' } })
}

// Azioni: sollecito WhatsApp inviato, richiesta di offerta gestita (solo sui propri clienti)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const supabase = getSupabaseAdmin()
  const { data: booking } = await supabase
    .from('gre_bookings').select('id, agente_referente_id').eq('id', String(body.bookingId || '')).eq('open_house_id', id).maybeSingle()
  if (!booking || !followsClient(booking, access.oh.agent_id, auth.agent, access.role)) {
    return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
  }

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
