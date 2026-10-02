import { NextResponse } from 'next/server'
import { createOAuth2Client, getAuthUrl, LOGIN_SCOPES, loginBaseUrl } from '@/lib/google-auth'

export async function GET(request: Request) {
  try {
    console.log('🔐 Initiating Google OAuth login flow')

    // Determina il redirect URI basato sull'ambiente
    const baseUrl = loginBaseUrl(request)
    const redirectUri = `${baseUrl}/api/auth/google/login-callback`

    const oauth2Client = createOAuth2Client(redirectUri)

    // Genera URL con LOGIN_SCOPES (include email, profile, gmail, calendar)
    const authUrl = getAuthUrl(oauth2Client, LOGIN_SCOPES)

    console.log('🔗 Generated login auth URL with redirect:', redirectUri)

    // Redirect direttamente invece di restituire JSON
    return NextResponse.redirect(authUrl)

  } catch (error) {
    console.error('❌ OAuth login initiation error:', error)
    return NextResponse.json({
      error: 'Failed to initiate OAuth login',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
