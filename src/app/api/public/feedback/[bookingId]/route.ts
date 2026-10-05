import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'
import { followerId, isTeamClient, loadTeam } from '@/lib/oh-access'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Dati minimi per la pagina di feedback (link nell'email o su WhatsApp): solo nomi di battesimo e immobile.
export async function GET(_request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params
  if (!UUID_RE.test(bookingId)) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })

  const { data, error } = await getSupabaseAdmin()
    .from('gre_bookings')
    .select(`
      id, feedback_completed, agente_referente_id,
      gre_clients (nome),
      referente:gre_agents!gre_bookings_agente_referente_id_fkey (nome, cognome),
      gre_open_houses (data_evento, agent_id, co_agent_id, gre_properties (titolo, zona, immagini), gre_agents (nome, cognome))
    `)
    .eq('id', bookingId)
    .maybeSingle()

  if (error || !data) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oh = data.gre_open_houses as any
  // l'agente che segue il cliente: chi l'ha portato, altrimenti l'agente abilitato di riferimento dell'Open House
  const team = await loadTeam(oh || { agent_id: null })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = (data as any).referente
  const lead = team.members.find(m => m.id === followerId(data, team))
  const agente = !isTeamClient(data, team) && ref ? `${ref.nome} ${ref.cognome}` : lead ? `${lead.nome} ${lead.cognome}` : ''
  return NextResponse.json({
    booking: {
      id: data.id,
      feedback_completed: data.feedback_completed,
      cliente: (data.gre_clients as { nome?: string } | null)?.nome || '',
      data_evento: oh?.data_evento,
      immobile: { titolo: oh?.gre_properties?.titolo || '', zona: oh?.gre_properties?.zona || '', foto: oh?.gre_properties?.immagini?.[0] || null },
      agente,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
