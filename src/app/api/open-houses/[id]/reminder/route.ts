import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { reminderEmail, sendAsAgent } from '@/lib/feedback-emails'
import { followerId, followsClient, openHouseAccess } from '@/lib/oh-access'

export const maxDuration = 300

// Promemoria dell'appuntamento + brochure aggiornata ai prenotati confermati che chi invia segue.
// Ogni email parte dalla casella dell'agente che segue il cliente ed è firmata da lui.
// { soloNonInviati: true } salta chi l'ha già ricevuto.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })
  const { oh, role } = access
  if (new Date(`${oh.data_evento}T${oh.ora_fine}`) < new Date(Date.now() - 2 * 3600 * 1000)) {
    return NextResponse.json({ error: 'Questo Open House è già concluso.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('gre_bookings')
    .select('id, agente_referente_id, promemoria_inviato_at, gre_clients (nome, cognome, email), gre_time_slots (ora_inizio)')
    .eq('open_house_id', id)
    .eq('status', 'confirmed')
  if (body.soloNonInviati) query = query.is('promemoria_inviato_at', null)
  const { data: all } = await query
  const bookings = (all || []).filter(b => followsClient(b, oh.agent_id, auth.agent, role))

  // agenti che firmano le email (chi segue ciascun cliente)
  const ids = [...new Set(bookings.map(b => followerId(b, oh.agent_id)).filter(Boolean))] as string[]
  const { data: agents } = await supabase.from('gre_agents').select('id, nome, cognome, email').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  const byId = new Map((agents || []).map(a => [a.id, a]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const property = oh.gre_properties as any
  let sent = 0
  const failed: string[] = []

  for (const b of bookings) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = b.gre_clients as any
    const agent = byId.get(followerId(b, oh.agent_id) || '')
    if (!client?.email || !agent) continue
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mail = reminderEmail({ client, agent, property, dataEvento: oh.data_evento, ora: (b.gre_time_slots as any)?.ora_inizio || null })
      await sendAsAgent(client.email, mail, agent.id)
      await supabase.from('gre_bookings').update({ promemoria_inviato_at: new Date().toISOString() }).eq('id', b.id)
      sent++
    } catch (e) {
      console.error(`Promemoria non inviato (${b.id}):`, e)
      failed.push(`${client.nome} ${client.cognome}`)
    }
  }

  return NextResponse.json({ sent, failed })
}
