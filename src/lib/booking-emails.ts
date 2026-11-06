import { bookingAlertEmail, feedbackRequestEmail, sendAsAgent } from './feedback-emails'
import { sendEmail, createEmailTemplate } from './gmail'
import { createOpenHouseEvent } from './calendar'
import { getSupabaseAdmin } from './server-auth'
import { followerId, isTeamClient, loadTeam, teamRecipients, teamReplyTo } from './oh-access'

const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export type BookingEmailType =
  | 'client_confirmation'
  | 'client_confirmation_with_brochure'
  | 'agent_notification'
  | 'feedback_request'
  | 'agent_offer_notification'

/**
 * Invia una delle email legate a una prenotazione. Solo lato server.
 */
export async function sendBookingEmail(
  bookingId: string,
  type: BookingEmailType,
  extra: { commenti?: string } = {}
): Promise<{ success: boolean; error?: string; status?: number }> {
  const supabase = getSupabaseAdmin()
  try {

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
      return { success: false, error: 'Prenotazione non trovata', status: 404 }
    }

    const client = bookingData.gre_clients
    const timeSlot = bookingData.gre_time_slots
    const openHouse = bookingData.gre_open_houses
    const property = openHouse.gre_properties
    const organizer = openHouse.gre_agents
    // Chi gestisce l'Open House (fino a due persone) e chi è l'agente abilitato di riferimento
    const team = await loadTeam(openHouse)
    // Il cliente è di chi lo porta: tutto ciò che riguarda il cliente parte dall'agente che lo segue
    let referente: { id: string; nome: string; cognome: string; email: string; qualifica?: string | null } | null = null
    if (bookingData.agente_referente_id) {
      const { data: ref } = await supabase
        .from('gre_agents').select('id, nome, cognome, email, qualifica').eq('id', bookingData.agente_referente_id).maybeSingle()
      referente = ref
    }
    const stessoAgente = isTeamClient(bookingData, team)
    // verso il cliente: chi lo segue (un assistente è indicato come assistente immobiliare, mai come agente)
    const fid = followerId(bookingData, team)
    const agent = (stessoAgente ? team.members.find(m => m.id === fid) : referente) || organizer
    // gli assistenti che lo accolgono all'Open House (indicati come assistenti, non come agenti; non chi firma)
    const assistenti = stessoAgente ? team.assistenti.filter(a => a.id !== agent.id) : []
    // le risposte del cliente arrivano a entrambi gli organizzatori
    const { replyTo } = teamReplyTo(bookingData, team)

    // Template email di conferma per il cliente
    if (type === 'client_confirmation') {
      const template = createEmailTemplate('confirmation', {
        client,
        property,
        openHouse,
        timeSlot,
        agent,
        assistenti
      })

      await sendEmail({
        to: client.email,
        subject: template.subject,
        html: template.html,
        replyTo,
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
        agent,
        assistenti
      })

      await sendEmail({
        to: client.email,
        subject: template.subject,
        html: template.html,
        replyTo,
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
      // Avvisa l'agente che organizza (senza dati se il cliente è di un collega) e il collega che lo segue
      const base = {
        stessoAgente,
        organizzatore: organizer,
        referente,
        client,
        property,
        dataEvento: openHouse.data_evento,
        slot: timeSlot,
        note: bookingData.note_cliente,
      }
      // entrambi gli organizzatori ricevono l'avviso
      const organizzatori = team.members.length ? team.members : [organizer]
      for (const o of organizzatori) {
        if (!o?.email) continue
        await sendAsAgent(o.email, bookingAlertEmail({ ...base, organizzatore: o, ruolo: 'organizzatore', destinatario: o }), o.id)
      }
      if (referente?.email && !stessoAgente) {
        await sendAsAgent(referente.email, bookingAlertEmail({ ...base, ruolo: 'referente', destinatario: referente }), referente.id)
      }
      console.log(`✅ Avviso prenotazione inviato (${organizzatori.map(o => o.email).join(', ')}${referente && !stessoAgente ? ` + ${referente.email}` : ''})`)
    }

    // Template email per richiesta feedback
    if (type === 'feedback_request') {
      const template = feedbackRequestEmail({ client, agent, property, bookingId })
      await sendAsAgent(client.email, { ...template, replyTo }, agent.id)

      console.log(`✅ Email richiesta feedback inviata a ${client.email}`)
    }

    // Template email per notifica offerta all'agente
    if (type === 'agent_offer_notification') {
      const commenti = extra.commenti || ''

      const template = createEmailTemplate('agent_offer_notification', {
        client,
        property,
        agent,
        commenti
      })

      // per i clienti degli organizzatori l'avviso arriva a entrambi, mai a uno solo
      const destinatari = stessoAgente && team.members.length ? teamRecipients(team) : [agent]
      for (const d of destinatari) {
        await sendAsAgent(d.email, template, d.id)
      }

      console.log(`✅ Email notifica offerta inviata a ${destinatari.map(d => d.email).join(', ')}`)
    }

    return { success: true }
  } catch (error) {
    console.error('Error in sendBookingEmail:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Errore nell\'invio email',
      status: 500
    }
  }
}
