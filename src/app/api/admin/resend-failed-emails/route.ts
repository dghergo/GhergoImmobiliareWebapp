import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, createEmailTemplate } from '@/lib/gmail'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  try {
    // Auth via CRON_SECRET
    const authHeader = request.headers.get('Authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Trova tutte le booking con questionario completato ma email non inviata
    const { data: bookings, error } = await supabaseAdmin
      .from('gre_bookings')
      .select(`
        id,
        confirmation_email_sent,
        brochure_email_sent,
        questionnaire_completed,
        gre_clients (id, nome, cognome, email, telefono),
        gre_time_slots (ora_inizio, ora_fine),
        gre_open_houses (
          *,
          gre_properties (*),
          gre_agents (id, nome, cognome, email)
        )
      `)
      .eq('questionnaire_completed', true)
      .eq('confirmation_email_sent', false)

    if (error) {
      throw error
    }

    if (!bookings || bookings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nessuna email da re-inviare',
        found: 0,
        sent: 0,
        errors: 0
      })
    }

    let sent = 0
    let errors = 0
    const results: Array<{ bookingId: string; client: string; status: string; error?: string }> = []

    for (const booking of bookings) {
      const client = booking.gre_clients as any
      const timeSlot = booking.gre_time_slots as any
      const openHouse = booking.gre_open_houses as any
      const property = openHouse?.gre_properties
      const agent = openHouse?.gre_agents

      if (!client?.email || !agent?.id) {
        results.push({
          bookingId: booking.id,
          client: client?.email || 'N/A',
          status: 'skipped',
          error: 'Dati mancanti (client email o agent id)'
        })
        errors++
        continue
      }

      try {
        // 1. Email conferma + brochure al cliente
        const template = createEmailTemplate('confirmation_with_brochure', {
          client,
          property,
          openHouse,
          timeSlot,
          agent
        })

        await sendEmail({
          to: client.email,
          subject: template.subject,
          html: template.html,
          agentId: agent.id
        })

        // 2. Aggiorna flag
        await supabaseAdmin
          .from('gre_bookings')
          .update({
            confirmation_email_sent: true,
            brochure_email_sent: true
          })
          .eq('id', booking.id)

        // 3. Email notifica all'agente
        try {
          await sendEmail({
            to: agent.email,
            subject: `Prenotazione Open House - ${property.titolo} (email re-inviata)`,
            agentId: agent.id,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
                  <h1 style="margin: 0;">GHERGO IMMOBILIARE</h1>
                  <h2 style="margin: 10px 0 0 0;">Prenotazione (email re-inviata)</h2>
                </div>
                <div style="padding: 20px; background-color: #f8fafc;">
                  <p>Gentile <strong>${agent.nome}</strong>,</p>
                  <p>Questa è una notifica re-inviata per una prenotazione precedente.</p>
                  <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Cliente:</strong> ${client.nome} ${client.cognome}</p>
                    <p><strong>Email:</strong> ${client.email}</p>
                    <p><strong>Telefono:</strong> ${client.telefono}</p>
                    <p><strong>Immobile:</strong> ${property.titolo}</p>
                  </div>
                </div>
              </div>
            `
          })
        } catch (agentEmailError) {
          console.error(`Errore invio notifica agente per booking ${booking.id}:`, agentEmailError)
        }

        sent++
        results.push({
          bookingId: booking.id,
          client: `${client.nome} ${client.cognome} (${client.email})`,
          status: 'sent'
        })

        console.log(`✅ Re-invio email a ${client.email} per booking ${booking.id}`)
      } catch (emailError) {
        errors++
        results.push({
          bookingId: booking.id,
          client: `${client.nome} ${client.cognome} (${client.email})`,
          status: 'failed',
          error: emailError instanceof Error ? emailError.message : 'Unknown error'
        })
        console.error(`❌ Errore re-invio per booking ${booking.id}:`, emailError)
      }
    }

    return NextResponse.json({
      success: true,
      found: bookings.length,
      sent,
      errors,
      results
    })

  } catch (error) {
    console.error('Error in resend-failed-emails:', error)
    return NextResponse.json({
      error: 'Errore interno',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
