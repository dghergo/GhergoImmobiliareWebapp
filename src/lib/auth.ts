import { supabase } from './supabase'

export interface AuthUser {
  id: string
  email: string
  role: 'admin' | 'agent' | 'collaborator'
  nome: string
  cognome: string
  password_changed?: boolean
  is_active?: boolean
  google_oauth_enabled?: boolean
}

// Login con email e password
export async function signIn(email: string, password: string) {
  console.log('Attempting login with:', email)

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  console.log('Auth result:', { data, error })

  if (error) {
    console.error('Auth error:', error)
    throw error
  }

  // Verifica se l'utente è un agente valido
  if (data.user) {
    console.log('User logged in:', data.user.email)

    const { data: agent, error: agentError } = await supabase
      .from('gre_agents')
      .select('*')
      .eq('email', data.user.email)
      .eq('is_active', true)
      .single()

    console.log('Agent query result:', { agent, agentError })

    if (agentError) {
      console.error('Agent query error:', agentError)
      // Prova senza policy RLS per debug
      const { data: agentDebug } = await supabase
        .from('gre_agents')
        .select('*')
        .eq('email', data.user.email)

      console.log('Agent debug (no RLS):', agentDebug)
      await signOut()
      throw new Error(`Errore database: ${agentError.message}`)
    }

    if (!agent) {
      await signOut()
      throw new Error('Account non trovato nella tabella agenti')
    }

    return {
      user: data.user,
      agent: agent as AuthUser
    }
  }

  return { user: data.user, agent: null }
}

// Logout
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Ottieni utente corrente
export async function getCurrentUser(): Promise<{ user: any; agent: AuthUser | null }> {
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error) throw error

  if (!user) {
    return { user: null, agent: null }
  }

  // Ottieni dati agente
  const { data: agent } = await supabase
    .from('gre_agents')
    .select('*')
    .eq('email', user.email)
    .eq('is_active', true)
    .single()

  return {
    user,
    agent: agent as AuthUser | null
  }
}

// Verifica se è admin
export function isAdmin(agent: AuthUser | null): boolean {
  return agent?.role === 'admin'
}

// Verifica se è agente
export function isAgent(agent: AuthUser | null): boolean {
  return agent?.role === 'agent' || agent?.role === 'collaborator'
}