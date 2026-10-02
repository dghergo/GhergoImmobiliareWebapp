import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { followsClient, openHouseAccess } from '@/lib/oh-access'

// Dati per il report al venditore: anonimi (nessun nome, contatto o identificativo).
// Comprende le scelte di tutti i visitatori; i commenti scritti solo dei clienti seguiti da chi organizza,
// così le parole dei clienti dei colleghi restano al collega.

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const access = await openHouseAccess(id, auth.agent)
  if (!access || access.role === 'collega') return NextResponse.json({ error: 'Report riservato a chi organizza l\'Open House' }, { status: 403 })
  const { oh, role } = access

  const { data: bookings } = await getSupabaseAdmin()
    .from('gre_bookings')
    .select('status, cancellation_reason, agente_referente_id, gre_prequalification_responses (response_data), gre_feedback_responses (rating, commenti, interesse_acquisto, richiesta_appuntamento, risposte)')
    .eq('open_house_id', id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (bookings || []).filter((b: any) => !(b.status === 'no_show' && b.cancellation_reason === 'cancelled_by_agent')).map((b: any) => {
    const f = b.gre_feedback_responses?.[0] || null
    const mine = followsClient(b, oh.agent_id, auth.agent, role)
    return {
      status: b.status,
      q: b.gre_prequalification_responses?.[0]?.response_data || null,
      feedback: f ? { ...f, commenti: mine ? f.commenti : null } : null,
    }
  })
  // ordine casuale: nessun collegamento con la lista delle prenotazioni
  rows.sort(() => Math.random() - 0.5)

  return NextResponse.json({ openHouse: oh, rows }, { headers: { 'Cache-Control': 'no-store' } })
}
