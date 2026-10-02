import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { reminderEmail, sendAsAgent } from '@/lib/feedback-emails'

export const maxDuration = 300

// Promemoria dell'appuntamento + brochure aggiornata a tutti i prenotati confermati.
// Solo l'agente dell'Open House (o l'admin). { soloNonInviati: true } salta chi l'ha già ricevuto.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const supabase = getSupabaseAdmin()
  const { data: oh } = await supabase
    .from('gre_open_houses')
    .select('id, agent_id, data_evento, ora_fine, gre_properties (titolo, zona, indirizzo, brochure_url), gre_agents (id, nome, cognome, email)')
    .eq('id', id)
    .maybeSingle()
  if (!oh || (auth.agent.role !== 'admin' && oh.agent_id !== auth.agent.id)) {
    return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })
  }
  if (new Date(`${oh.data_evento}T${oh.ora_fine}`) < new Date(Date.now() - 2 * 3600 * 1000)) {
    return NextResponse.json({ error: 'Questo Open House è già concluso.' }, { status: 400 })
  }

  let query = supabase
    .from('gre_bookings')
    .select('id, promemoria_inviato_at, gre_clients (nome, cognome, email), gre_time_slots (ora_inizio)')
    .eq('open_house_id', id)
    .eq('status', 'confirmed')
  if (body.soloNonInviati) query = query.is('promemoria_inviato_at', null)
  const { data: bookings } = await query

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = oh.gre_agents as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const property = oh.gre_properties as any
  let sent = 0
  const failed: string[] = []

  for (const b of bookings || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = b.gre_clients as any
    if (!client?.email) continue
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mail = reminderEmail({ client, agent, property, dataEvento: oh.data_evento, ora: (b.gre_time_slots as any)?.ora_inizio || null })
      await sendAsAgent(client.email, mail, agent?.id)
      await supabase.from('gre_bookings').update({ promemoria_inviato_at: new Date().toISOString() }).eq('id', b.id)
      sent++
    } catch (e) {
      console.error(`Promemoria non inviato (${b.id}):`, e)
      failed.push(`${client.nome} ${client.cognome}`)
    }
  }

  return NextResponse.json({ sent, failed })
}
