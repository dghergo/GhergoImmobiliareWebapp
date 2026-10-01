import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'
import { sendBookingEmail } from '@/lib/booking-emails'

export const maxDuration = 60

const ALLOWED: Record<string, string[]> = {
  vendita_immobile: ['no', 'si_in_vendita', 'si_non_in_vendita', 'si_posso_acquistare_prima'],
  necessita_mutuo: ['no', 'si_parziale', 'si_maggior_parte'],
  stato_mutuo: ['pre_delibera', 'simulazione', 'appuntamento', 'non_informato', 'ricontatto_consulente', 'non_richiedo'],
  tempistiche_acquisto: ['entro_30_giorni', 'entro_3_mesi', 'entro_6_mesi', 'oltre_6_mesi', 'solo_valutando'],
  corrispondenza_immobile: ['100_percento', '80_90_percento', 'parzialmente', 'no_altro'],
}

// Il questionario si può inviare una sola volta e solo nelle ore successive alla prenotazione.
const MAX_AGE_MS = 6 * 60 * 60 * 1000

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const answers: Record<string, string> = {}
  for (const [key, values] of Object.entries(ALLOWED)) {
    const v = body[key]
    if (typeof v !== 'string' || !values.includes(v)) {
      return NextResponse.json({ error: 'Rispondi a tutte le domande.' }, { status: 400 })
    }
    answers[key] = v
  }

  const supabase = getSupabaseAdmin()
  const { data: booking } = await supabase
    .from('gre_bookings')
    .select('id, created_at, questionnaire_completed, confirmation_email_sent')
    .eq('id', bookingId)
    .maybeSingle()

  if (!booking) {
    return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
  }
  if (booking.questionnaire_completed) {
    return NextResponse.json({ error: 'Questionario già inviato' }, { status: 409 })
  }
  if (Date.now() - new Date(booking.created_at).getTime() > MAX_AGE_MS) {
    return NextResponse.json({ error: 'Tempo scaduto per questo questionario' }, { status: 409 })
  }

  const { error: insertError } = await supabase
    .from('gre_prequalification_responses')
    .insert({ booking_id: bookingId, response_data: answers })
  if (insertError) {
    console.error('Error saving questionnaire:', insertError)
  }

  await supabase.from('gre_bookings').update({ questionnaire_completed: true }).eq('id', bookingId)

  // Questionario completato = prenotazione confermata: email al cliente e avviso all'agente
  const [clientEmail, agentEmail] = await Promise.all([
    booking.confirmation_email_sent
      ? Promise.resolve({ success: true } as { success: boolean; error?: string })
      : sendBookingEmail(bookingId, 'client_confirmation_with_brochure'),
    sendBookingEmail(bookingId, 'agent_notification'),
  ])
  if (!clientEmail.success) console.error('Client email failed:', clientEmail.error)
  if (!agentEmail.success) console.error('Agent email failed:', agentEmail.error)

  return NextResponse.json({ success: true })
}
