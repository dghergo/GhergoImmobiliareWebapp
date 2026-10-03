import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { followerId } from '@/lib/oh-access'
import { sendBookingEmail, BookingEmailType } from '@/lib/booking-emails'

const ALLOWED: BookingEmailType[] = [
  'client_confirmation',
  'client_confirmation_with_brochure',
  'agent_notification',
  'feedback_request',
  'agent_offer_notification'
]

// Invio manuale di email dal pannello (es. "Reinvia feedback"): solo agenti loggati.
// Le email automatiche della prenotazione partono direttamente dal server (vedi /api/public/bookings).
export async function POST(request: Request) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error

  const { bookingId, type, commenti } = await request.json()
  if (!bookingId || !ALLOWED.includes(type)) {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  // Solo chi segue il cliente (o l'admin) può inviargli email
  if (auth.agent.role !== 'admin') {
    const { data: b } = await getSupabaseAdmin()
      .from('gre_bookings').select('agente_referente_id, gre_open_houses (agent_id)').eq('id', String(bookingId)).maybeSingle()
    const organizer = (b?.gre_open_houses as { agent_id?: string } | null)?.agent_id || null
    if (!b || followerId(b, organizer) !== auth.agent.id) {
      return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
    }
  }

  const result = await sendBookingEmail(bookingId, type, { commenti })
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status || 500 })
  }
  return NextResponse.json({ success: true, message: 'Email inviata' })
}
