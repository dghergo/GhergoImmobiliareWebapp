import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Dati minimi per la pagina di feedback (link nell'email o su WhatsApp): solo nomi di battesimo e immobile.
export async function GET(_request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params
  if (!UUID_RE.test(bookingId)) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })

  const { data, error } = await getSupabaseAdmin()
    .from('gre_bookings')
    .select(`
      id, feedback_completed,
      gre_clients (nome),
      gre_open_houses (data_evento, gre_properties (titolo, zona, immagini), gre_agents (nome, cognome))
    `)
    .eq('id', bookingId)
    .maybeSingle()

  if (error || !data) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oh = data.gre_open_houses as any
  return NextResponse.json({
    booking: {
      id: data.id,
      feedback_completed: data.feedback_completed,
      cliente: (data.gre_clients as { nome?: string } | null)?.nome || '',
      data_evento: oh?.data_evento,
      immobile: { titolo: oh?.gre_properties?.titolo || '', zona: oh?.gre_properties?.zona || '', foto: oh?.gre_properties?.immagini?.[0] || null },
      agente: oh?.gre_agents ? `${oh.gre_agents.nome} ${oh.gre_agents.cognome}` : '',
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
