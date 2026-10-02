import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'
import { validateFeedback, isOffertaQuando } from '@/lib/feedback'
import { agentAlertEmail, sendAsAgent } from '@/lib/feedback-emails'

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Feedback del cliente dopo la visita (dal link nell'email o su WhatsApp)
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })

  const bookingId = typeof body.bookingId === 'string' ? body.bookingId : ''
  if (!UUID_RE.test(bookingId)) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })

  const answers = validateFeedback(body.risposte)
  if (!answers) {
    return NextResponse.json({ error: 'Rispondi a tutte le domande per inviare.' }, { status: 400 })
  }
  const commenti = typeof body.commenti === 'string' ? body.commenti.trim().slice(0, 2000) : ''
  const quando = answers.prossimo_passo === 'offerta' && isOffertaQuando(body.offerta_quando) ? body.offerta_quando : null
  if (answers.prossimo_passo === 'offerta' && !quando) {
    return NextResponse.json({ error: 'Indica quando puoi passare in ufficio.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: booking } = await supabase
    .from('gre_bookings')
    .select(`
      id, feedback_completed, agente_referente_id,
      gre_clients (nome, cognome, email, telefono),
      gre_open_houses (id, gre_properties (titolo, zona, indirizzo), gre_agents (id, nome, cognome, email))
    `)
    .eq('id', bookingId)
    .maybeSingle()

  if (!booking) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
  if (booking.feedback_completed) {
    return NextResponse.json({ error: 'Hai già inviato il tuo feedback per questa visita. Grazie!' }, { status: 409 })
  }

  const { error: insertError } = await supabase.from('gre_feedback_responses').insert({
    booking_id: bookingId,
    rating: answers.voto,
    commenti,
    interesse_acquisto: answers.prossimo_passo === 'offerta',
    richiesta_appuntamento: answers.prossimo_passo === 'rivedere',
    risposte: answers,
    offerta_quando: quando,
  })
  if (insertError) {
    console.error('Errore salvataggio feedback:', insertError)
    return NextResponse.json({ error: 'Non siamo riusciti a salvare. Riprova.' }, { status: 500 })
  }
  await supabase.from('gre_bookings').update({ feedback_completed: true }).eq('id', bookingId)

  // Offerta o richiesta di rivedere: avviso immediato all'agente
  if (answers.prossimo_passo === 'offerta' || answers.prossimo_passo === 'rivedere') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oh = booking.gre_open_houses as any
    // avvisa chi organizza l'Open House e, se diverso, l'agente di riferimento del cliente
    const destinatari = [oh?.gre_agents].filter(Boolean) as { id: string; nome: string; cognome: string; email: string }[]
    if (booking.agente_referente_id && booking.agente_referente_id !== oh?.gre_agents?.id) {
      const { data: ref } = await supabase
        .from('gre_agents').select('id, nome, cognome, email').eq('id', booking.agente_referente_id).maybeSingle()
      if (ref) destinatari.push(ref)
    }
    for (const agent of destinatari) {
      if (!agent.email) continue
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mail = agentAlertEmail({ client: booking.gre_clients as any, agent, property: oh.gre_properties, answers, commenti, quando })
        await sendAsAgent(agent.email, mail, agent.id)
      } catch (e) {
        console.error('Avviso all\'agente non inviato:', e)
      }
    }
  }

  return NextResponse.json({ success: true })
}
