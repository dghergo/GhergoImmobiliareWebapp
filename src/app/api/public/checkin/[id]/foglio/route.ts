import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'
import { verifyCheckinToken } from '@/lib/checkin-link'
import { followerId, loadTeam, OH_SELECT } from '@/lib/oh-access'
import { ANAGRAFICA_VUOTA, dichiarazioni } from '@/lib/foglio-visita'
import { agenteDi, BOOKING_FOGLIO_SELECT, datiFoglio, firmaFoglio, maskEmail, maskTel } from '@/lib/foglio-server'

// Conferma di visita firmata dal link di check-in dato al collega (nessun login).
// Il link vale solo per questo Open House e fino a fine giornata. I contatti del cliente restano nascosti.

export const maxDuration = 60

async function load(id: string, k: string | null, bookingId: string) {
  const check = verifyCheckinToken(id, k)
  if (check !== 'ok') {
    return { error: NextResponse.json({ error: check === 'expired' ? 'Questo link è scaduto. Chiedi un nuovo link all\'agente.' : 'Link non valido.' }, { status: 403 }) }
  }
  const supabase = getSupabaseAdmin()
  const [{ data: oh }, { data: b }] = await Promise.all([
    supabase.from('gre_open_houses').select(OH_SELECT).eq('id', id).maybeSingle(),
    supabase.from('gre_bookings').select(BOOKING_FOGLIO_SELECT).eq('id', bookingId).eq('open_house_id', id).maybeSingle(),
  ])
  if (!oh) return { error: NextResponse.json({ error: 'Open House non trovato' }, { status: 404 }) }
  if (!b || (b.status === 'no_show' && b.cancellation_reason === 'cancelled_by_agent')) {
    return { error: NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 }) }
  }
  const team = await loadTeam(oh)
  const agent = await agenteDi(followerId(b, team))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dati = datiFoglio(oh as any, b, agent)
  return { b, agent, dati }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const r = await load(id, url.searchParams.get('k'), url.searchParams.get('bookingId') || '')
  if (r.error) return r.error
  const { b, dati } = r
  return NextResponse.json({
    dati: { ...dati, cliente: { ...dati.cliente, email: maskEmail(dati.cliente.email), telefono: maskTel(dati.cliente.telefono) }, anagrafica: ANAGRAFICA_VUOTA },
    dichiarazioni: dichiarazioni(dati),
    firmatoIl: b.foglio_visita_firmato_at,
    serveEmail: !dati.cliente.email,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const r = await load(id, body.k, String(body.bookingId || ''))
  if (r.error) return r.error
  return firmaFoglio({ request, openHouseId: id, b: r.b, agent: r.agent, dati: r.dati, body, raccoltoDa: null, ruolo: 'link_check_in' })
}
