import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/server-auth'
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

  const result = await sendBookingEmail(bookingId, type, { commenti })
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status || 500 })
  }
  return NextResponse.json({ success: true, message: 'Email inviata' })
}
