import { getSupabaseAdmin, type StaffAgent } from './server-auth'

// Chi può vedere cosa in un Open House.
// Un Open House può essere gestito da due persone (organizzatore + co-organizzatore): entrambe vedono tutto.
// Regola dell'agenzia: il cliente è di chi lo porta. Se il cliente ha indicato come agente di riferimento
// un collega che non gestisce l'Open House, solo quel collega ne vede contatti, questionario e feedback.
// Gli organizzatori vedono comunque nome, cognome e orario (serve alla porta). L'admin vede tutto.
// Un assistente immobiliare può organizzare, ma verso il cliente l'agente di riferimento è sempre un agente abilitato.

export type OhRole = 'admin' | 'organizzatore' | 'collega'
export type Qualifica = 'agente' | 'assistente'

export interface BookingOwnership { agente_referente_id: string | null }

export interface TeamMember { id: string; nome: string; cognome: string; email: string; qualifica: Qualifica }

/** Chi gestisce l'Open House e chi è l'agente abilitato di riferimento verso i clienti. */
export interface Team {
  ids: string[]
  members: TeamMember[]
  /** agente abilitato di riferimento (organizzatore se abilitato, altrimenti il co-organizzatore) */
  lead: TeamMember | null
  /** assistenti che accolgono all'Open House (mai presentati come agenti) */
  assistenti: TeamMember[]
}

export const OH_SELECT = 'id, agent_id, co_agent_id, data_evento, ora_inizio, ora_fine, gre_properties (titolo, zona, indirizzo, prezzo, immagini, brochure_url, caratteristiche, dati_foglio), gre_agents (id, nome, cognome, email)'

export async function loadTeam(oh: { agent_id: string | null; co_agent_id?: string | null }): Promise<Team> {
  const ids = [oh.agent_id, oh.co_agent_id].filter((x, i, a): x is string => !!x && a.indexOf(x) === i)
  if (!ids.length) return { ids, members: [], lead: null, assistenti: [] }
  const { data } = await getSupabaseAdmin().from('gre_agents').select('id, nome, cognome, email, qualifica').in('id', ids)
  const members = ids
    .map(id => (data || []).find(a => a.id === id))
    .filter(Boolean)
    .map(a => ({ ...a!, qualifica: (a!.qualifica === 'assistente' ? 'assistente' : 'agente') as Qualifica }))
  return {
    ids,
    members,
    lead: members.find(m => m.qualifica === 'agente') || null,
    assistenti: members.filter(m => m.qualifica === 'assistente'),
  }
}

export async function openHouseAccess(openHouseId: string, agent: StaffAgent) {
  const supabase = getSupabaseAdmin()
  const { data: oh } = await supabase.from('gre_open_houses').select(OH_SELECT).eq('id', openHouseId).maybeSingle()
  if (!oh) return null
  const team = await loadTeam(oh)
  let role: OhRole | null = null
  if (agent.role === 'admin') role = 'admin'
  else if (team.ids.includes(agent.id)) role = 'organizzatore'
  else {
    const { count } = await supabase
      .from('gre_bookings').select('id', { count: 'exact', head: true })
      .eq('open_house_id', openHouseId).eq('agente_referente_id', agent.id)
    if (count) role = 'collega'
  }
  if (!role) return null
  return { oh, role, team }
}

/** true se il cliente è degli organizzatori (nessun referente, o referente = uno dei due). */
export const isTeamClient = (b: BookingOwnership, team: Team) => !b.agente_referente_id || team.ids.includes(b.agente_referente_id)

/**
 * Chi segue il cliente verso l'esterno (casella da cui partono le email, firma, avvisi offerte):
 * il collega che l'ha portato; per i clienti degli organizzatori il referente scelto se è un agente abilitato,
 * altrimenti l'agente abilitato di riferimento dell'Open House.
 */
export function followerId(b: BookingOwnership, team: Team): string | null {
  if (!isTeamClient(b, team)) return b.agente_referente_id
  const scelto = team.members.find(m => m.id === b.agente_referente_id && m.qualifica === 'agente')
  return scelto?.id || team.lead?.id || team.ids[0] || null
}

/** true se chi guarda segue questo cliente (ne può vedere i dettagli). */
export function followsClient(b: BookingOwnership, team: Team, agent: StaffAgent, role: OhRole) {
  if (role === 'admin') return true
  return isTeamClient(b, team) ? team.ids.includes(agent.id) : b.agente_referente_id === agent.id
}

/** "Mario Rossi" oppure "Mario Rossi e Laura Bianchi" (organizzatori interni). */
export const teamNames = (team: Team) => team.members.map(m => `${m.nome} ${m.cognome}`).join(' e ')
