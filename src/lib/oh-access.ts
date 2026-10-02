import { getSupabaseAdmin, type StaffAgent } from './server-auth'

// Chi può vedere cosa in un Open House.
// Regola dell'agenzia: il cliente è di chi lo porta. Se il cliente ha indicato come agente di riferimento
// un collega diverso dall'organizzatore, solo quel collega ne vede contatti, questionario e feedback.
// L'organizzatore vede comunque nome, cognome e orario (serve alla porta). L'admin vede tutto.

export type OhRole = 'admin' | 'organizzatore' | 'collega'

export interface BookingOwnership { agente_referente_id: string | null }

export async function openHouseAccess(openHouseId: string, agent: StaffAgent) {
  const supabase = getSupabaseAdmin()
  const { data: oh } = await supabase
    .from('gre_open_houses')
    .select('id, agent_id, data_evento, ora_inizio, ora_fine, gre_properties (titolo, zona, indirizzo, prezzo, immagini, brochure_url), gre_agents (id, nome, cognome, email)')
    .eq('id', openHouseId)
    .maybeSingle()
  if (!oh) return null
  let role: OhRole | null = null
  if (agent.role === 'admin') role = 'admin'
  else if (oh.agent_id === agent.id) role = 'organizzatore'
  else {
    const { count } = await supabase
      .from('gre_bookings').select('id', { count: 'exact', head: true })
      .eq('open_house_id', openHouseId).eq('agente_referente_id', agent.id)
    if (count) role = 'collega'
  }
  if (!role) return null
  return { oh, role }
}

/** L'agente di chi è il cliente: il referente scelto, altrimenti l'organizzatore. */
export const followerId = (b: BookingOwnership, organizerId: string | null) => b.agente_referente_id || organizerId

/** true se chi guarda segue questo cliente (ne può vedere i dettagli). */
export function followsClient(b: BookingOwnership, organizerId: string | null, agent: StaffAgent, role: OhRole) {
  if (role === 'admin') return true
  return followerId(b, organizerId) === agent.id
}
