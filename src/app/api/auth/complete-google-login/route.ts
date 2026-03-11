import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const loginPending = cookieStore.get('google_login_pending')

    if (!loginPending) {
      return NextResponse.json({
        error: 'No pending Google login found'
      }, { status: 400 })
    }

    const { agent_id, email } = JSON.parse(loginPending.value)

    // Usa Supabase Admin per creare una sessione senza password
    // Nota: questo richiede il service role key
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

    // Verifica che l'utente esista in Supabase Auth
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()

    if (listError) {
      console.error('Error listing users:', listError)
      return NextResponse.json({ error: 'Failed to verify user' }, { status: 500 })
    }

    let authUser = users?.find(u => u.email === email)

    // Se l'utente non esiste in Supabase Auth, crealo
    if (!authUser) {
      console.log('Creating new auth user for:', email)

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          agent_id,
          provider: 'google'
        }
      })

      if (createError) {
        console.error('Error creating user:', createError)
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
      }

      authUser = newUser.user
    }

    // Genera un link di accesso magico per creare la sessione
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email
    })

    if (linkError || !linkData) {
      console.error('Error generating magic link:', linkError)
      return NextResponse.json({ error: 'Failed to generate session' }, { status: 500 })
    }

    // Rimuovi il cookie pending
    const response = NextResponse.json({
      success: true,
      session_url: linkData.properties.action_link
    })

    response.cookies.delete('google_login_pending')

    return response

  } catch (error) {
    console.error('❌ Complete Google login error:', error)
    return NextResponse.json({
      error: 'Failed to complete Google login',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
