import { supabase } from './supabase'

// Colonne leggibili dal browser (i token Google restano solo sul server)
export const AGENT_COLUMNS = 'id, email, nome, cognome, role, qualifica, is_active, password_changed, google_oauth_enabled, created_at'

export interface AuthUser {
  id: string
  email: string
  role: 'admin' | 'agent' | 'collaborator'
  nome: string
  cognome: string
  qualifica?: 'agente' | 'assistente'
  password_changed?: boolean
  is_active?: boolean
  google_oauth_enabled?: boolean
}

// Login con email e password
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    console.error('Auth error:', error)
    throw error
  }

  // Verifica se l'utente è un agente valido
  if (data.user) {
    const { data: agent, error: agentError } = await supabase
      .from('gre_agents')
      .select(AGENT_COLUMNS)
      .eq('email', data.user.email)
      .eq('is_active', true)
      .single()

    if (agentError) {
      console.error('Agent query error:', agentError)
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
    .select(AGENT_COLUMNS)
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