import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, createEmailTemplate } from '@/lib/gmail'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  try {
    // Auth via header per cron job o trigger manuale
    const authHeader = request.headers.get('Authorization')
    const cronSecret = process.env.CRON_SECRET

    // In development, accetta anche senza auth
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Trova open house terminati da almeno 4 ore
    const now = new Date()
    const { data: openHouses, error: ohError } = await supabaseAdmin
      .from('gre_open_houses')
      .select(`
        id,
        data_evento,
        ora_fine,
        gre_properties (id, titolo, zona)
      `)

    if (ohError) {
      throw ohError
    }

    let emailsSent = 0
    let errors = 0

    for (const oh of (openHouses || [])) {
      // Calcola quando l'open house è finito + 4 ore
      const eventEnd = new Date(`${oh.data_evento}T${oh.ora_fine}`)
      const feedbackThreshold = new Date(eventEnd.getTime() + 4 * 60 * 60 * 1000) // +4 ore

      if (feedbackThreshold >= now) {
        continue
      }

      // Trova bookings da notificare
      const { data: bookings, error: bookingsError } = await supabaseAdmin
        .from('gre_bookings')
        .select(`
          id,
          feedback_email_sent,
          feedback_completed,
          gre_clients (id, nome, cognome, email, telefono),
          gre_open_houses (
            id,
            gre_properties (id, titolo, zona),
            gre_agents (id, nome, cognome, email)
          )
        `)
        .eq('open_house_id', oh.id)
        .eq('feedback_email_sent', false)
        .eq('feedback_completed', false)

      if (bookingsError) {
        console.error(`Error fetching bookings for OH ${oh.id}:`, bookingsError)
        errors++
        continue
      }

      for (const booking of (bookings || [])) {
        try {
          const client = booking.gre_clients as any
          const openHouseData = booking.gre_open_houses as any
          const property = openHouseData.gre_properties
          const agent = openHouseData.gre_agents

          const template = createEmailTemplate('feedback_request', {
            client,
            property,
            agent,
            bookingId: booking.id
          })

          await sendEmail({
            to: client.email,
            subject: template.subject,
            html: template.html
          })

          // Segna come inviata
          await supabaseAdmin
            .from('gre_bookings')
            .update({ feedback_email_sent: true })
            .eq('id', booking.id)

          emailsSent++
          console.log(`✅ Feedback email sent to ${client.email} for booking ${booking.id}`)
        } catch (emailError) {
          console.error(`Error sending feedback email for booking ${booking.id}:`, emailError)
          errors++
        }
      }
    }

    return NextResponse.json({
      success: true,
      emailsSent,
      errors,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error in send-feedback-requests cron:', error)
    return NextResponse.json({
      error: 'Errore interno',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
