import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'

// Password temporanea casuale (es. "Ghergo-k7Qp2xMz9a")
function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(10)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return `Ghergo-${out}`
}

export async function POST(request: NextRequest) {
  try {
    // Solo l'amministratore può creare nuovi agenti
    const auth = await requireStaff(request, { adminOnly: true })
    if (auth.error) return auth.error

    const supabaseAdmin = getSupabaseAdmin()
    const { email, nome, cognome, role } = await request.json()

    if (!['admin', 'agent', 'collaborator'].includes(role)) {
      return NextResponse.json({ error: 'Ruolo non valido' }, { status: 400 })
    }

    if (!email || !nome || !cognome || !role) {
      return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })
    }

    const defaultPassword = generateTemporaryPassword()

    // 1. Crea utente auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: defaultPassword,
      email_confirm: true
    })

    if (authError) {
      throw authError
    }

    // 2. Crea record agente
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('gre_agents')
      .insert({
        email,
        nome,
        cognome,
        role,
        is_active: true,
        password_changed: false
      })
      .select()
      .single()

    if (agentError) {
      // Se fallisce, elimina l'utente auth creato
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
      throw agentError
    }

    return NextResponse.json({
      success: true,
      agent,
      temporaryPassword: defaultPassword
    })

  } catch (error: any) {
    console.error('Error creating agent:', error)
    return NextResponse.json(
      { error: error.message || 'Errore interno del server' },
      { status: 500 }
    )
  }
}