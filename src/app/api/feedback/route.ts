import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, createEmailTemplate } from '@/lib/gmail'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { bookingId, commenti, vuole_fare_offerta } = await request.json()

    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID mancante' }, { status: 400 })
    }

    // Verifica che il booking esista e non abbia già feedback
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('gre_bookings')
      .select(`
        id,
        feedback_completed,
        gre_clients (id, nome, cognome, email, telefono),
        gre_open_houses (
          id,
          gre_properties (id, titolo, zona),
          gre_agents (id, nome, cognome, email)
        )
      `)
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
    }

    if (booking.feedback_completed) {
      return NextResponse.json({ error: 'Feedback già inviato per questa prenotazione' }, { status: 400 })
    }

    // Salva il feedback in gre_feedback_responses
    const { error: feedbackError } = await supabaseAdmin
      .from('gre_feedback_responses')
      .insert({
        booking_id: bookingId,
        commenti: commenti || '',
        interesse_acquisto: vuole_fare_offerta || false
      })

    if (feedbackError) {
      console.error('Error saving feedback:', feedbackError)
      return NextResponse.json({ error: 'Errore nel salvataggio del feedback' }, { status: 500 })
    }

    // Aggiorna booking come feedback_completed
    await supabaseAdmin
      .from('gre_bookings')
      .update({ feedback_completed: true })
      .eq('id', bookingId)

    // Se vuole fare offerta, invia email all'agente
    if (vuole_fare_offerta) {
      try {
        const client = booking.gre_clients as any
        const openHouseData = booking.gre_open_houses as any
        const property = openHouseData.gre_properties
        const agent = openHouseData.gre_agents

        const template = createEmailTemplate('agent_offer_notification', {
          client,
          property,
          agent,
          commenti
        })

        await sendEmail({
          to: agent.email,
          subject: template.subject,
          html: template.html,
          agentId: agent.id
        })

        console.log(`✅ Email notifica offerta inviata all'agente ${agent.email}`)
      } catch (emailError) {
        console.error('Error sending offer notification email:', emailError)
        // Non bloccare la risposta se l'email fallisce
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Feedback salvato con successo'
    })

  } catch (error) {
    console.error('Error in feedback API:', error)
    return NextResponse.json({
      error: 'Errore interno del server',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
