import { NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Client con service role: SOLO lato server
let adminClient: SupabaseClient | null = null
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return adminClient
}

export interface StaffAgent {
  id: string
  email: string
  role: 'admin' | 'agent' | 'collaborator'
  nome: string
  cognome: string
}

/**
 * Verifica che la richiesta arrivi da un agente/admin loggato.
 * Il browser deve inviare l'header "Authorization: Bearer <access_token>" (vedi lib/api.ts).
 * Ritorna l'agente, oppure una risposta 401/403 da restituire subito.
 */
export async function requireStaff(
  request: Request,
  options: { adminOnly?: boolean } = {}
): Promise<{ agent: StaffAgent; error?: undefined } | { agent?: undefined; error: NextResponse }> {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''

  if (!token) {
    return { error: NextResponse.json({ error: 'Accesso non autorizzato' }, { status: 401 }) }
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  const email = userData?.user?.email

  if (userError || !email) {
    return { error: NextResponse.json({ error: 'Sessione non valida, effettua di nuovo il login' }, { status: 401 }) }
  }

  const { data: agent } = await supabaseAdmin
    .from('gre_agents')
    .select('id, email, role, nome, cognome, is_active')
    .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
    .eq('is_active', true)
    .maybeSingle()

  if (!agent) {
    return { error: NextResponse.json({ error: 'Accesso non autorizzato' }, { status: 403 }) }
  }

  if (options.adminOnly && agent.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Operazione riservata all\'amministratore' }, { status: 403 }) }
  }

  return { agent: agent as StaffAgent }
}

/** true se la richiesta porta il segreto dei controlli automatici (cron di Vercel). Fallisce in modo sicuro se il segreto non è configurato. */
export function hasCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}
