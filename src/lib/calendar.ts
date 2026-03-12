import { google } from 'googleapis'
import { createOAuth2Client } from './google-auth'
import { getAgentGoogleTokens } from './agent-tokens'

interface CalendarEventData {
  summary: string
  description: string
  location?: string
  startDateTime: string  // ISO string
  endDateTime: string    // ISO string
  attendees?: Array<{
    email: string
    displayName?: string
  }>
  timeZone?: string
  agentId?: string  // ID dell'agente per recuperare i token OAuth
}

interface BookingEventData {
  client: {
    nome: string
    cognome: string
    email: string
    telefono?: string
  }
  property: {
    titolo: string
    indirizzo?: string
    citta?: string
    provincia?: string
  }
  openHouse: {
    data_evento: string
  }
  timeSlot: {
    ora_inizio: string
    ora_fine: string
  }
  agent: {
    id: string
    nome: string
    cognome: string
    email: string
  }
}

export async function createCalendarEvent(eventData: CalendarEventData) {
  try {
    console.log(`📅 Creating calendar event: ${eventData.summary}`)

    const oauth2Client = createOAuth2Client()

    // Usa i tokens dell'agente se fornito agentId, altrimenti usa tokens da env (fallback admin)
    let tokens
    if (eventData.agentId) {
      console.log(`🔑 Using tokens for agent: ${eventData.agentId}`)
      tokens = await getAgentGoogleTokens(eventData.agentId)
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

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Crea l'evento nel calendario
    const event = {
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
      start: {
        dateTime: eventData.startDateTime,
        timeZone: eventData.timeZone || 'Europe/Rome'
      },
      end: {
        dateTime: eventData.endDateTime,
        timeZone: eventData.timeZone || 'Europe/Rome'
      },
      attendees: eventData.attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 giorno prima
          { method: 'popup', minutes: 30 }       // 30 minuti prima
        ]
      }
    }

    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all'  // Invia inviti ai partecipanti
    })

    console.log('✅ Calendar event created:', result.data.id)
    console.log('🔗 Event link:', result.data.htmlLink)

    return {
      success: true,
      eventId: result.data.id,
      eventLink: result.data.htmlLink,
      summary: eventData.summary
    }

  } catch (error) {
    console.error('❌ Failed to create calendar event:', error)

    if (error instanceof Error && error.message.includes('access_token')) {
      throw new Error('Calendar authentication required. Please authorize the application first.')
    }

    throw error
  }
}

// Helper per creare eventi Open House dalla prenotazione
export function createOpenHouseEvent(data: BookingEventData) {
  const { client, property, openHouse, timeSlot, agent } = data

  // Combina data e ora per creare ISO strings
  const eventDate = new Date(openHouse.data_evento).toISOString().split('T')[0] // YYYY-MM-DD
  const startDateTime = `${eventDate}T${timeSlot.ora_inizio}`
  const endDateTime = `${eventDate}T${timeSlot.ora_fine}`

  const eventData: CalendarEventData = {
    summary: `Open House - ${property.titolo}`,
    description: `
🏠 Open House Prenotazione

🏡 Immobile: ${property.titolo}
📍 Indirizzo: ${property.indirizzo || property.citta || 'Da definire'}

👤 Cliente: ${client.nome} ${client.cognome}
📧 Email: ${client.email}
${client.telefono ? `📞 Telefono: ${client.telefono}` : ''}

🕒 Slot: ${timeSlot.ora_inizio} - ${timeSlot.ora_fine}

👨‍💼 Agente: ${agent.nome} ${agent.cognome}

Evento creato automaticamente dal sistema Ghergo Immobiliare.
    `.trim(),
    location: property.indirizzo || `${property.citta}, ${property.provincia}` || '',
    startDateTime,
    endDateTime,
    attendees: [
      {
        email: client.email,
        displayName: `${client.nome} ${client.cognome}`
      }
    ],
    timeZone: 'Europe/Rome',
    agentId: agent.id  // Passa l'ID dell'agente per usare i suoi token OAuth
  }

  return createCalendarEvent(eventData)
}

// Helper per aggiornare/cancellare eventi
export async function updateCalendarEvent(eventId: string, updates: Partial<CalendarEventData>) {
  try {
    console.log(`📅 Updating calendar event: ${eventId}`)

    const oauth2Client = createOAuth2Client()
    const tokens = {
      access_token: process.env.GOOGLE_ACCESS_TOKEN,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    }

    if (!tokens.access_token) {
      throw new Error('Google access token not available.')
    }

    oauth2Client.setCredentials(tokens)
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Prepara i dati di aggiornamento
    const updateData: any = {}

    if (updates.summary) updateData.summary = updates.summary
    if (updates.description) updateData.description = updates.description
    if (updates.location) updateData.location = updates.location
    if (updates.startDateTime) {
      updateData.start = {
        dateTime: updates.startDateTime,
        timeZone: updates.timeZone || 'Europe/Rome'
      }
    }
    if (updates.endDateTime) {
      updateData.end = {
        dateTime: updates.endDateTime,
        timeZone: updates.timeZone || 'Europe/Rome'
      }
    }

    const result = await calendar.events.patch({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: updateData,
      sendUpdates: 'all'
    })

    console.log('✅ Calendar event updated:', result.data.id)

    return {
      success: true,
      eventId: result.data.id,
      eventLink: result.data.htmlLink
    }

  } catch (error) {
    console.error('❌ Failed to update calendar event:', error)
    throw error
  }
}

export async function deleteCalendarEvent(eventId: string) {
  try {
    console.log(`🗑️ Deleting calendar event: ${eventId}`)

    const oauth2Client = createOAuth2Client()
    const tokens = {
      access_token: process.env.GOOGLE_ACCESS_TOKEN,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    }

    if (!tokens.access_token) {
      throw new Error('Google access token not available.')
    }

    oauth2Client.setCredentials(tokens)
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
      sendUpdates: 'all'
    })

    console.log('✅ Calendar event deleted:', eventId)

    return {
      success: true,
      eventId
    }

  } catch (error) {
    console.error('❌ Failed to delete calendar event:', error)
    throw error
  }
}