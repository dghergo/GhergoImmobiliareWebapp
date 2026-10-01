import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'
import { sendBookingEmail } from '@/lib/booking-emails'
import { validateQuestionnaire } from '@/lib/questionnaire'

export const maxDuration = 60

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

  const answers = validateQuestionnaire(body)
  if (!answers) {
    return NextResponse.json({ error: 'Rispondi a tutte le domande.' }, { status: 400 })
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
