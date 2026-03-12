import { NextResponse } from 'next/server'
import { createOAuth2Client } from '@/lib/google-auth'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

export async function GET(request: Request) {
  try {
    console.log('🔄 Processing Google login callback')

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
      console.error('❌ OAuth error:', error)
      // Redirect to login with error
      return NextResponse.redirect(
        new URL(`/admin/login?error=${encodeURIComponent('Autenticazione Google fallita')}`, request.url)
      )
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/admin/login?error=' + encodeURIComponent('Codice autorizzazione mancante'), request.url)
      )
    }

    console.log('🔑 Received authorization code')

    // Ottieni i token da Google
    const oauth2Client = createOAuth2Client(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/google/login-callback`
    )

    const { tokens } = await oauth2Client.getToken(code)
    console.log('✅ Tokens received')

    oauth2Client.setCredentials(tokens)

    // Ottieni informazioni utente da Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: userInfo } = await oauth2.userinfo.get()

    console.log('👤 User info from Google:', {
      email: userInfo.email,
      name: userInfo.name
    })

    if (!userInfo.email) {
      return NextResponse.redirect(
        new URL('/admin/login?error=' + encodeURIComponent('Email non disponibile da Google'), request.url)
      )
    }

    // Cerca l'agente nel database
    const { data: agent, error: agentError } = await supabase
      .from('gre_agents')
      .select('*')
      .eq('email', userInfo.email)
      .eq('is_active', true)
      .single()

    if (agentError || !agent) {
      console.error('❌ Agent not found or inactive:', userInfo.email)
      return NextResponse.redirect(
        new URL('/admin/login?error=' + encodeURIComponent('Account non trovato o non attivo'), request.url)
      )
    }

    console.log('✅ Agent found:', agent.email)

    // Verifica che il login Google sia abilitato per questo agente
    if (!agent.google_oauth_enabled) {
      console.error('❌ Google OAuth not enabled for agent:', userInfo.email)
      return NextResponse.redirect(
        new URL('/admin/login?error=' + encodeURIComponent('Login con Google non abilitato per questo account. Contatta l\'amministratore.'), request.url)
      )
    }

    console.log('✅ Google OAuth enabled for agent:', agent.email)

    // Salva i token Google nel database
    const googleTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
      scope: tokens.scope,
      updated_at: new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('gre_agents')
      .update({ google_tokens: googleTokens })
      .eq('id', agent.id)

    if (updateError) {
      console.error('⚠️  Warning: Could not save Google tokens:', updateError)
      // Non blocchiamo il login se non riusciamo a salvare i token
    } else {
      console.log('💾 Google tokens saved to database')
    }

    // Crea sessione Supabase usando Admin API
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verifica se l'utente esiste in Supabase Auth
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()

    if (listError) {
      console.error('❌ Error listing users:', listError)
      return NextResponse.redirect(
        new URL('/admin/login?error=' + encodeURIComponent('Errore creazione sessione'), request.url)
      )
    }

    let authUser = users?.find(u => u.email === userInfo.email)

    // Se l'utente non esiste in Supabase Auth, crealo
    if (!authUser) {
      console.log('Creating new auth user for:', userInfo.email)
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: userInfo.email,
        email_confirm: true,
        user_metadata: {
          agent_id: agent.id,
          provider: 'google',
          nome: agent.nome,
          cognome: agent.cognome
        }
      })

      if (createError) {
        console.error('❌ Error creating user:', createError)
        return NextResponse.redirect(
          new URL('/admin/login?error=' + encodeURIComponent('Errore creazione utente'), request.url)
        )
      }

      authUser = newUser.user
    }

    // Genera un link di accesso magico per creare la sessione
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userInfo.email
    })

    if (linkError || !linkData) {
      console.error('❌ Error generating magic link:', linkError)
      return NextResponse.redirect(
        new URL('/admin/login?error=' + encodeURIComponent('Errore generazione sessione'), request.url)
      )
    }

    console.log('✅ Session created successfully for:', userInfo.email)

    // Determina la dashboard appropriata
    const dashboardUrl = agent.role === 'admin' ? '/admin/dashboard' : '/dashboard'

    // Redirect al magic link che creerà la sessione, poi alla dashboard
    // Il magic link automaticamente fa login e poi redirect
    const magicLinkUrl = new URL(linkData.properties.action_link)
    magicLinkUrl.searchParams.set('redirect_to', dashboardUrl)

    return NextResponse.redirect(magicLinkUrl.toString())

  } catch (error) {
    console.error('❌ Login callback error:', error)
    return NextResponse.redirect(
      new URL(
        '/admin/login?error=' + encodeURIComponent('Errore durante il login con Google'),
        request.url
      )
    )
  }
}
