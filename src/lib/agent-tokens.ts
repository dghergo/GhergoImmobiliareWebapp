import { supabase } from './supabase'

/**
 * Recupera i token Google OAuth di un agente dal database
 * @param agentId - ID dell'agente
 * @returns Token OAuth (access_token, refresh_token, etc.)
 */
export async function getAgentGoogleTokens(agentId: string) {
  const { data: agent, error } = await supabase
    .from('gre_agents')
    .select('google_tokens')
    .eq('id', agentId)
    .single()

  if (error || !agent?.google_tokens) {
    throw new Error(`Google tokens not found for agent ${agentId}. Agent must login with Google first.`)
  }

  const tokens = agent.google_tokens as {
    access_token?: string
    refresh_token?: string
    expiry_date?: number
    token_type?: string
    scope?: string
  }

  if (!tokens.access_token) {
    throw new Error(`Invalid Google tokens for agent ${agentId}`)
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token
  }
}
