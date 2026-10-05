import { followerId, isTeamClient, loadTeam } from '@/lib/oh-access'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin, hasCronSecret, requireStaff } from '@/lib/server-auth'
import { feedbackRequestEmail, sendAsAgent } from '@/lib/feedback-emails'

export const maxDuration = 300

// Richiesta di feedback lo stesso giorno: parte 1 ora dopo la fine dell'Open House,
// solo a chi non è stato segnato "Non venuto", dalla casella dell'agente. Mai di notte.
const HOURS_AFTER_END = 1

const romeNow = () => {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
  return parts.replace(' ', 'T') // "YYYY-MM-DDTHH:MM" ora italiana
}

export async function GET(request: Request) {
  if (!hasCronSecret(request)) {
    const auth = await requireStaff(request, { adminOnly: true })
    if (auth.error) return auth.error
  }

  const nowRome = romeNow()
  const hour = Number(nowRome.slice(11, 13))
  if (hour < 8 || hour >= 21) {
    return NextResponse.json({ success: true, skipped: 'fuori orario', emailsSent: 0 })
  }

  const supabase = getSupabaseAdmin()
  const today = nowRome.slice(0, 10)
  // solo gli ultimi 7 giorni: niente richieste per visite vecchie
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  const { data: openHouses, error } = await supabase
    .from('gre_open_houses')
    .select('id, agent_id, co_agent_id, data_evento, ora_fine, gre_properties (titolo, zona, indirizzo), gre_agents (id, nome, cognome, email)')
    .gte('data_evento', since)
    .lte('data_evento', today)
  if (error) return NextResponse.json({ error: 'Errore caricamento' }, { status: 500 })

  let emailsSent = 0
  let errors = 0

  for (const oh of openHouses || []) {
    // fine evento + 1 ora, confrontata in ora italiana
    const [h, m] = String(oh.ora_fine).split(':').map(Number)
    const end = new Date(`${oh.data_evento}T00:00:00Z`)
    end.setUTCMinutes(h * 60 + m + HOURS_AFTER_END * 60)
    const threshold = end.toISOString().slice(0, 16)
    if (threshold > nowRome) continue

    const { data: bookings } = await supabase
      .from('gre_bookings')
      .select('id, agente_referente_id, gre_clients (nome, cognome, email), referente:gre_agents!gre_bookings_agente_referente_id_fkey (id, nome, cognome, email)')
      .eq('open_house_id', oh.id)
      .eq('feedback_email_sent', false)
      .eq('feedback_completed', false)
      .in('status', ['confirmed', 'completed'])

    const team = await loadTeam(oh)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = oh.gre_properties as any

    for (const b of bookings || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = b.gre_clients as any
      if (!client?.email) continue
      // la richiesta parte da chi segue il cliente (il collega che l'ha portato, altrimenti l'agente abilitato dell'Open House)
      const fid = followerId(b, team)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const follower = isTeamClient(b, team) ? team.members.find(m => m.id === fid) : (b as any).referente
      try {
        const mail = feedbackRequestEmail({ client, agent: follower, property, bookingId: b.id })
        await sendAsAgent(client.email, mail, follower?.id)
        await supabase.from('gre_bookings').update({ feedback_email_sent: true }).eq('id', b.id)
        emailsSent++
      } catch (e) {
        console.error(`Richiesta feedback non inviata (${b.id}):`, e)
        errors++
      }
    }
  }

  return NextResponse.json({ success: true, emailsSent, errors, at: nowRome })
}
