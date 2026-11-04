import { getSupabaseAdmin } from './server-auth'
import { followerId, loadTeam } from './oh-access'
import { presentationEmail, sendAsAgent } from './feedback-emails'

// Email "Prepara la tua visita" (video della casa + video della proposta) ai prenotati confermati.
// Usata dall'invio automatico (24 ore prima) e dal pulsante "Invia adesso".
// Ogni cliente la riceve una volta sola: la prenotazione viene segnata prima dell'invio.

export const URL_RE = /^https:\/\/[^\s<>"']+$/i

export async function sendPresentation(openHouseId: string) {
  const supabase = getSupabaseAdmin()
  const { data: oh } = await supabase
    .from('gre_open_houses')
    .select('id, agent_id, co_agent_id, data_evento, ora_inizio, presentazione_attiva, video_casa_url, video_proposta_url, gre_properties (titolo, zona, indirizzo)')
    .eq('id', openHouseId)
    .maybeSingle()
  if (!oh || !oh.presentazione_attiva || !oh.video_casa_url || !URL_RE.test(oh.video_casa_url)) {
    return { sent: 0, failed: [] as string[], error: 'Inserisci il link del video della casa e attiva la presentazione.' }
  }

  const { data: bookings } = await supabase
    .from('gre_bookings')
    .select('id, agente_referente_id, gre_clients (nome, cognome, email), gre_time_slots (ora_inizio)')
    .eq('open_house_id', openHouseId)
    .eq('status', 'confirmed')
    .is('presentazione_inviata_at', null)

  const team = await loadTeam(oh)
  const ids = [...new Set((bookings || []).map(b => followerId(b, team)).filter(Boolean))] as string[]
  const { data: agents } = await supabase.from('gre_agents').select('id, nome, cognome, email, qualifica').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  const byId = new Map((agents || []).map(a => [a.id, a]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const property = oh.gre_properties as any
  const videoProposta = oh.video_proposta_url && URL_RE.test(oh.video_proposta_url) ? oh.video_proposta_url : null

  let sent = 0
  const failed: string[] = []
  for (const b of bookings || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = b.gre_clients as any
    const agent = byId.get(followerId(b, team) || '')
    if (!client?.email || !agent) continue
    // segno prima di inviare: un secondo invio contemporaneo salta questo cliente
    const { data: claimed } = await supabase
      .from('gre_bookings').update({ presentazione_inviata_at: new Date().toISOString() })
      .eq('id', b.id).is('presentazione_inviata_at', null).select('id')
    if (!claimed?.length) continue
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mail = presentationEmail({ client, agent, property, dataEvento: oh.data_evento, ora: (b.gre_time_slots as any)?.ora_inizio || null, videoCasa: oh.video_casa_url, videoProposta })
      await sendAsAgent(client.email, mail, agent.id)
      sent++
    } catch (e) {
      console.error(`Presentazione non inviata (${b.id}):`, e)
      await supabase.from('gre_bookings').update({ presentazione_inviata_at: null }).eq('id', b.id)
      failed.push(`${client.nome} ${client.cognome}`)
    }
  }
  return { sent, failed, error: null as string | null }
}
