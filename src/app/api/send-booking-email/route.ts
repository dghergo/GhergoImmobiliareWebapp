import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendEmail, createEmailTemplate } from '@/lib/gmail'
import { createOpenHouseEvent } from '@/lib/calendar'

export async function POST(request: Request) {
  try {
    const { bookingId, type } = await request.json()

    // Recupera i dati della prenotazione
    const { data: bookingData, error } = await supabase
      .from('gre_bookings')
      .select(`
        *,
        gre_clients (*),
        gre_time_slots (*),
        gre_open_houses (
          *,
          gre_properties (*),
          gre_agents (*)
        )
      `)
      .eq('id', bookingId)
      .single()

    if (error || !bookingData) {
      return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
    }

    const client = bookingData.gre_clients
    const timeSlot = bookingData.gre_time_slots
    const openHouse = bookingData.gre_open_houses
    const property = openHouse.gre_properties
    const agent = openHouse.gre_agents

    // Template email di conferma per il cliente
    if (type === 'client_confirmation') {
      const template = createEmailTemplate('confirmation', {
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

      // Crea evento calendario se non esiste già
      try {
        if (!bookingData.calendar_event_id) {
          console.log('📅 Creating calendar event for Open House...')

          const calendarResult = await createOpenHouseEvent({
            client,
            property,
            openHouse,
            timeSlot,
            agent
          })

          if (calendarResult.success) {
            await supabase
              .from('gre_bookings')
              .update({
                confirmation_email_sent: true,
                calendar_event_id: calendarResult.eventId,
                calendar_event_link: calendarResult.eventLink
              })
              .eq('id', bookingId)

            console.log(`✅ Calendar event created: ${calendarResult.eventId}`)
          } else {
            await supabase
              .from('gre_bookings')
              .update({ confirmation_email_sent: true })
              .eq('id', bookingId)
          }
        } else {
          await supabase
            .from('gre_bookings')
            .update({ confirmation_email_sent: true })
            .eq('id', bookingId)
        }
      } catch (calendarError) {
        console.error('❌ Calendar creation error:', calendarError)
        await supabase
          .from('gre_bookings')
          .update({ confirmation_email_sent: true })
          .eq('id', bookingId)
      }

      console.log(`✅ Email di conferma inviata a ${client.email}`)
    }

    // Template email di conferma unificata (conferma + brochure)
    if (type === 'client_confirmation_with_brochure') {
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

      // Crea evento calendario se non esiste già
      try {
        if (!bookingData.calendar_event_id) {
          console.log('📅 Creating calendar event for Open House...')

          const calendarResult = await createOpenHouseEvent({
            client,
            property,
            openHouse,
            timeSlot,
            agent
          })

          if (calendarResult.success) {
            await supabase
              .from('gre_bookings')
              .update({
                confirmation_email_sent: true,
                brochure_email_sent: true,
                calendar_event_id: calendarResult.eventId,
                calendar_event_link: calendarResult.eventLink
              })
              .eq('id', bookingId)

            console.log(`✅ Calendar event created: ${calendarResult.eventId}`)
          } else {
            await supabase
              .from('gre_bookings')
              .update({
                confirmation_email_sent: true,
                brochure_email_sent: true
              })
              .eq('id', bookingId)
          }
        } else {
          await supabase
            .from('gre_bookings')
            .update({
              confirmation_email_sent: true,
              brochure_email_sent: true
            })
            .eq('id', bookingId)
        }
      } catch (calendarError) {
        console.error('❌ Calendar creation error:', calendarError)
        await supabase
          .from('gre_bookings')
          .update({
            confirmation_email_sent: true,
            brochure_email_sent: true
          })
          .eq('id', bookingId)
      }

      console.log(`✅ Email conferma + brochure inviata a ${client.email}`)
    }

    // Template email di notifica per l'agente
    if (type === 'agent_notification') {
      await sendEmail({
        to: agent.email,
        subject: `Nuova prenotazione Open House - ${property.titolo}`,
        agentId: agent.id,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">GHERGO IMMOBILIARE</h1>
              <h2 style="margin: 10px 0 0 0;">Nuova Prenotazione Ricevuta</h2>
            </div>

            <div style="padding: 20px; background-color: #f8fafc;">
              <p>Gentile <strong>${agent.nome}</strong>,</p>

              <p>Ha ricevuto una nuova prenotazione per il suo Open House!</p>

              <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #1e40af; margin-top: 0;">Dettagli della prenotazione</h3>

                <p><strong>Cliente:</strong> ${client.nome} ${client.cognome}</p>
                <p><strong>Email:</strong> <a href="mailto:${client.email}">${client.email}</a></p>
                <p><strong>Telefono:</strong> <a href="tel:${client.telefono}">${client.telefono}</a></p>

                <hr style="margin: 20px 0;">

                <p><strong>Immobile:</strong> ${property.titolo}</p>
                <p><strong>Data Open House:</strong> ${new Date(openHouse.data_evento).toLocaleDateString('it-IT')}</p>
                <p><strong>Slot prenotato:</strong> ${timeSlot.ora_inizio} - ${timeSlot.ora_fine}</p>

                ${bookingData.note_cliente ? `
                  <hr style="margin: 20px 0;">
                  <h4 style="color: #1e40af;">Note del cliente</h4>
                  <p style="font-style: italic;">${bookingData.note_cliente}</p>
                ` : ''}
              </div>

              <div style="text-align: center; margin: 20px 0;">
                <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/bookings"
                   style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Visualizza nella Dashboard
                </a>
              </div>

              <p>Cordiali saluti,<br>
              <strong>Sistema Ghergo Immobiliare</strong></p>
            </div>
          </div>
        `
      })

      console.log(`✅ Email notifica inviata all'agente ${agent.email}`)
    }

    // Template email per richiesta feedback
    if (type === 'feedback_request') {
      const template = createEmailTemplate('feedback_request', {
        client,
        property,
        openHouse,
        agent,
        bookingId
      })

      await sendEmail({
        to: client.email,
        subject: template.subject,
        html: template.html,
        agentId: agent.id
      })

      console.log(`✅ Email richiesta feedback inviata a ${client.email}`)
    }

    // Template email per notifica offerta all'agente
    if (type === 'agent_offer_notification') {
      const { commenti } = await request.json().catch(() => ({ commenti: '' }))

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
    }

    return NextResponse.json({
      success: true,
      message: 'Email inviata con successo tramite Gmail API'
    })

  } catch (error) {
    console.error('Error in send-booking-email:', error)
    return NextResponse.json({
      error: 'Errore nell\'invio email',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
