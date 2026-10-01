import { NextResponse, after } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'
import { sendBookingEmail } from '@/lib/booking-emails'

export const maxDuration = 60

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

const ERROR_MESSAGES: Record<string, { message: string; status: number }> = {
  slot_not_found: { message: 'Questo orario non è più disponibile. Scegline un altro.', status: 409 },
  slot_full: { message: 'Questo orario è appena stato prenotato da un\'altra persona. Scegline un altro.', status: 409 },
  open_house_not_active: { message: 'Questo Open House non è più attivo.', status: 409 },
  open_house_past: { message: 'Questo Open House si è già concluso.', status: 409 },
}

// Prenotazione pubblica: tutta la logica (posti, doppioni, consensi) è lato server.
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const openHouseId = clean(body.openHouseId, 40)
  const slotId = clean(body.slotId, 40)
  const nome = clean(body.nome, 80)
  const cognome = clean(body.cognome, 80)
  const email = clean(body.email, 160).toLowerCase()
  const telefono = clean(body.telefono, 30)
  const messaggio = clean(body.messaggio, 2000)
  const referente = clean(body.agente_referente_id, 40)

  if (!UUID_RE.test(openHouseId) || !UUID_RE.test(slotId)) {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  if (!nome || !cognome) {
    return NextResponse.json({ error: 'Inserisci nome e cognome.' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Inserisci un indirizzo email valido.' }, { status: 400 })
  }
  if (telefono.replace(/\D/g, '').length < 6) {
    return NextResponse.json({ error: 'Inserisci un numero di telefono valido.' }, { status: 400 })
  }
  if (body.privacy_accepted !== true) {
    return NextResponse.json({ error: 'È necessario accettare l\'informativa privacy per procedere.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('gre_create_booking', {
    p_open_house_id: openHouseId,
    p_slot_id: slotId,
    p_nome: nome,
    p_cognome: cognome,
    p_email: email,
    p_telefono: telefono,
    p_messaggio: messaggio,
    p_agente_referente_id: UUID_RE.test(referente) ? referente : null,
    p_marketing: body.marketing_accepted === true
  })

  if (error) {
    console.error('gre_create_booking error:', error)
    return NextResponse.json({ error: 'Errore durante la prenotazione. Riprova.' }, { status: 500 })
  }

  const result = data as { booking_id?: string; error?: string; ora_inizio?: string; ora_fine?: string }

  if (result.error === 'already_booked') {
    const orario = result.ora_inizio ? ` alle ${String(result.ora_inizio).slice(0, 5)}` : ''
    return NextResponse.json(
      { error: `Risulti già prenotato a questo Open House${orario}. Se vuoi cambiare orario contatta l'agente.` },
      { status: 409 }
    )
  }
  if (result.error) {
    const e = ERROR_MESSAGES[result.error] || { message: 'Prenotazione non riuscita.', status: 409 }
    return NextResponse.json({ error: e.message }, { status: e.status })
  }

  const bookingId = result.booking_id as string

  // Conferma immediata: email al cliente (con brochure e invito calendario) e avviso all'agente,
  // inviati subito dopo la risposta, così il cliente non aspetta e non dipende dal questionario.
  after(async () => {
    const [clientEmail, agentEmail] = await Promise.all([
      sendBookingEmail(bookingId, 'client_confirmation_with_brochure'),
      sendBookingEmail(bookingId, 'agent_notification'),
    ])
    if (!clientEmail.success) console.error('Client confirmation failed:', clientEmail.error)
    if (!agentEmail.success) console.error('Agent notification failed:', agentEmail.error)
  })

  return NextResponse.json({ bookingId })
}
