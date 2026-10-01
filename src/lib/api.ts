import { supabase } from './supabase'

/**
 * fetch verso le API interne con il token della sessione dell'agente,
 * così il server può verificare chi sta facendo la richiesta.
 */
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return fetch(url, { ...init, headers })
}
