import { google } from 'googleapis'
import { createOAuth2Client } from './google-auth'
import { getAgentGoogleTokens } from './agent-tokens'

interface EmailOptions {
  to: string
  subject: string
  html: string
  from?: string
  agentId?: string  // ID dell'agente per recuperare i token OAuth
  attachments?: Array<{
    filename: string
    path?: string
    content?: Buffer | string
    contentType?: string
  }>
}

export async function sendEmail(options: EmailOptions) {
  try {
    console.log(`📧 Sending email to: ${options.to}`)
    console.log(`📧 Subject: ${options.subject}`)

    const oauth2Client = createOAuth2Client()

    // Usa i tokens dell'agente se fornito agentId, altrimenti usa tokens da env (fallback admin)
    let tokens
    if (options.agentId) {
      console.log(`🔑 Using tokens for agent: ${options.agentId}`)
      tokens = await getAgentGoogleTokens(options.agentId)
    } else {
      console.log(`⚠️  No agentId provided, using env tokens (admin fallback)`)
      tokens = {
        access_token: process.env.GOOGLE_ACCESS_TOKEN,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      }
    }

    if (!tokens.access_token) {
      throw new Error('Google access token not available. Please authenticate first.')
    }

    oauth2Client.setCredentials(tokens)

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Crea il messaggio email in formato RFC 2822
    const emailLines = [
      `To: ${options.to}`,
      `Subject: ${options.subject}`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      options.html
    ]

    const email = emailLines.join('\n')
    const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    // Invia l'email
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail
      }
    })

    console.log('✅ Email sent successfully:', result.data.id)

    return {
      success: true,
      messageId: result.data.id,
      to: options.to,
      subject: options.subject
    }

  } catch (error) {
    console.error('❌ Failed to send email:', error)

    if (error instanceof Error && error.message.includes('access_token')) {
      throw new Error('Gmail authentication required. Please authorize the application first.')
    }

    throw error
  }
}

// Helper per creare template email
export function createEmailTemplate(
  type: 'confirmation' | 'confirmation_with_brochure' | 'brochure' | 'feedback_request' | 'agent_offer_notification',
  data: any
) {
  const templates: Record<string, { subject: string; html: string }> = {
    confirmation: {
      subject: `Conferma prenotazione Open House - ${data.property.titolo}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">GHERGO IMMOBILIARE</h1>
            <h2 style="margin: 10px 0 0 0;">Conferma Prenotazione Open House</h2>
          </div>

          <div style="padding: 20px; background-color: #f8fafc;">
            <p>Gentile <strong>${data.client.nome} ${data.client.cognome}</strong>,</p>

            <p>La sua prenotazione per l'Open House è stata confermata con successo!</p>

            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1e40af; margin-top: 0;">Dettagli della prenotazione</h3>

              <p><strong>Immobile:</strong> ${data.property.titolo}</p>
              <p><strong>Indirizzo:</strong> ${data.property.zona}</p>
              <p><strong>Data:</strong> ${new Date(data.openHouse.data_evento).toLocaleDateString('it-IT', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</p>
              <p><strong>Orario slot:</strong> ${data.timeSlot.ora_inizio} - ${data.timeSlot.ora_fine}</p>

              <hr style="margin: 20px 0;">

              <h4 style="color: #1e40af;">Agente di riferimento</h4>
              <p><strong>${data.agent.nome} ${data.agent.cognome}</strong></p>
              <p>Email: <a href="mailto:${data.agent.email}">${data.agent.email}</a></p>
            </div>

            <div style="background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #1e40af;">Prossimi passi</h4>
              <ol>
                <li>Si presenti all'appuntamento con un documento di identità</li>
                <li>L'agente la contatterà per eventuali dettagli</li>
              </ol>
            </div>

            <p>Cordiali saluti,<br>
            <strong>Team Ghergo Immobiliare</strong></p>
          </div>
        </div>
      `
    },

    confirmation_with_brochure: {
      subject: `Conferma prenotazione Open House - ${data.property.titolo}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">GHERGO IMMOBILIARE</h1>
            <h2 style="margin: 10px 0 0 0;">Conferma Prenotazione Open House</h2>
          </div>

          <div style="padding: 20px; background-color: #f8fafc;">
            <p>Gentile <strong>${data.client.nome} ${data.client.cognome}</strong>,</p>

            <p>Grazie per aver completato il questionario! La sua prenotazione per l'Open House è confermata.</p>

            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1e40af; margin-top: 0;">Dettagli della prenotazione</h3>

              <p><strong>Immobile:</strong> ${data.property.titolo}</p>
              <p><strong>Indirizzo:</strong> ${data.property.zona}</p>
              <p><strong>Data:</strong> ${new Date(data.openHouse.data_evento).toLocaleDateString('it-IT', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</p>
              <p><strong>Orario slot:</strong> ${data.timeSlot.ora_inizio} - ${data.timeSlot.ora_fine}</p>

              <hr style="margin: 20px 0;">

              <h4 style="color: #1e40af;">Agente di riferimento</h4>
              <p><strong>${data.agent.nome} ${data.agent.cognome}</strong></p>
              <p>Email: <a href="mailto:${data.agent.email}">${data.agent.email}</a></p>
            </div>

            ${data.property.brochure_url ? `
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <h3 style="color: #1e40af; margin-top: 0;">Brochure Immobile</h3>
              <p>Come promesso, ecco la brochure completa dell'immobile.</p>
              <a href="${data.property.brochure_url}"
                 style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;"
                 target="_blank">
                Scarica Brochure PDF
              </a>
            </div>
            ` : ''}

            <div style="background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #1e40af;">Prossimi passi</h4>
              <ol>
                <li>Si presenti all'appuntamento con un documento di identità</li>
                <li>L'agente la contatterà per eventuali dettagli</li>
              </ol>
            </div>

            <p>Cordiali saluti,<br>
            <strong>Team Ghergo Immobiliare</strong></p>
          </div>

          <div style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 12px; color: #64748b;">
            <p>Ghergo Immobiliare - Open House Management System</p>
          </div>
        </div>
      `
    },

    brochure: {
      subject: `Brochure - ${data.property.titolo}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">GHERGO IMMOBILIARE</h1>
            <h2 style="margin: 10px 0 0 0;">Brochure dell'Immobile</h2>
          </div>

          <div style="padding: 20px; background-color: #f8fafc;">
            <p>Gentile <strong>${data.client.nome} ${data.client.cognome}</strong>,</p>

            <p>Grazie per aver completato il questionario di prequalifica!</p>
            <p>Come promesso, trova di seguito la brochure completa dell'immobile <strong>${data.property.titolo}</strong>.</p>

            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <h3 style="color: #1e40af; margin-top: 0;">Brochure Immobile</h3>
              <a href="${data.property.brochure_url}"
                 style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;"
                 target="_blank">
                Scarica Brochure PDF
              </a>
            </div>

            <p>Per qualsiasi domanda, non esiti a contattare il suo agente di riferimento:</p>
            <p><strong>${data.agent.nome} ${data.agent.cognome}</strong><br>
            Email: <a href="mailto:${data.agent.email}">${data.agent.email}</a></p>

            <p>Cordiali saluti,<br>
            <strong>Team Ghergo Immobiliare</strong></p>
          </div>

          <div style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 12px; color: #64748b;">
            <p>Email automatica inviata dopo il completamento del questionario di prequalifica</p>
          </div>
        </div>
      `
    },

    feedback_request: {
      subject: `La sua opinione conta - Open House ${data.property.titolo}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">GHERGO IMMOBILIARE</h1>
            <h2 style="margin: 10px 0 0 0;">La sua opinione per noi è importante</h2>
          </div>

          <div style="padding: 20px; background-color: #f8fafc;">
            <p>Gentile <strong>${data.client.nome} ${data.client.cognome}</strong>,</p>

            <p>Grazie per aver partecipato all'Open House dell'immobile <strong>${data.property.titolo}</strong> in zona <strong>${data.property.zona}</strong>.</p>

            <p>Che l'immobile le sia piaciuto o meno, il suo feedback ci aiuta a migliorare il nostro servizio e a comprendere meglio le sue esigenze.</p>

            <p>Le chiediamo solo un minuto del suo tempo per condividere le sue impressioni.</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXT_PUBLIC_SITE_URL}/feedback/${data.bookingId}"
                 style="background-color: #1e40af; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 16px; font-weight: bold;">
                Lascia il tuo feedback
              </a>
            </div>

            <p>La ringraziamo per la fiducia accordataci.</p>

            <p>Cordiali saluti,<br>
            <strong>${data.agent.nome} ${data.agent.cognome}</strong><br>
            Ghergo Immobiliare</p>
          </div>

          <div style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 12px; color: #64748b;">
            <p>Questa email è stata inviata automaticamente dopo la sua visita all'Open House.</p>
          </div>
        </div>
      `
    },

    agent_offer_notification: {
      subject: `Interesse acquisto - ${data.client.nome} ${data.client.cognome} per ${data.property.titolo}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">GHERGO IMMOBILIARE</h1>
            <h2 style="margin: 10px 0 0 0;">Interesse all'Acquisto</h2>
          </div>

          <div style="padding: 20px; background-color: #f8fafc;">
            <p>Gentile <strong>${data.agent.nome}</strong>,</p>

            <p>Il cliente <strong>${data.client.nome} ${data.client.cognome}</strong> ha espresso interesse a fare un'offerta per l'immobile <strong>${data.property.titolo}</strong> (${data.property.zona}).</p>

            <div style="background-color: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
              <h3 style="color: #16a34a; margin-top: 0;">Azione richiesta</h3>
              <p>Contatti il cliente al più presto per discutere i dettagli dell'offerta.</p>

              <p><strong>Contatti del cliente:</strong></p>
              <p>Email: <a href="mailto:${data.client.email}">${data.client.email}</a></p>
              ${data.client.telefono ? `<p>Telefono: <a href="tel:${data.client.telefono}">${data.client.telefono}</a></p>` : ''}
            </div>

            ${data.commenti ? `
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #1e40af; margin-top: 0;">Commento del cliente</h4>
              <p style="font-style: italic;">"${data.commenti}"</p>
            </div>
            ` : ''}

            <div style="text-align: center; margin: 20px 0;">
              <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/reports"
                 style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Visualizza Report Completo
              </a>
            </div>

            <p>Cordiali saluti,<br>
            <strong>Sistema Ghergo Immobiliare</strong></p>
          </div>
        </div>
      `
    }
  }

  return templates[type]
}
