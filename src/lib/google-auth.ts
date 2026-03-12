import { google } from 'googleapis'

// Configurazione OAuth2
export function createOAuth2Client(redirectUri?: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_REDIRECT_URI
  )

  return oauth2Client
}

// Genera URL di autorizzazione
export function getAuthUrl(oauth2Client: any, scopes: string[]) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'select_account' // Mostra selezione account ma non richiede consenso ogni volta
  })

  return authUrl
}

// Scopes necessari per Gmail e Calendar
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly'
]

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
]

// Scopes per autenticazione (profilo e email)
export const AUTH_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid'
]

// Start with basic scopes only
export const BASIC_SCOPES = ['https://www.googleapis.com/auth/gmail.send']
export const ALL_SCOPES = [...AUTH_SCOPES, ...GMAIL_SCOPES, ...CALENDAR_SCOPES]
export const LOGIN_SCOPES = [...AUTH_SCOPES, ...GMAIL_SCOPES, ...CALENDAR_SCOPES]