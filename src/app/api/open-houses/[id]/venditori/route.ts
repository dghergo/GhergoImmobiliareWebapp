import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { followsClient, openHouseAccess } from '@/lib/oh-access'

// Clienti dell'Open House che devono vendere casa: per i messaggi WhatsApp con grafica.
// Ognuno vede solo i clienti che segue (come per il resto del cruscotto).

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })
  const { oh, role, team } = access
  const supabase = getSupabaseAdmin()

  const { data: bookings } = await supabase
    .from('gre_bookings')
    .select('id, status, cancellation_reason, agente_referente_id, wa_vendita_at, wa_venduto_at, gre_clients (nome, cognome, telefono), gre_prequalification_responses (response_data)')
    .eq('open_house_id', id)

  const tutti = (bookings || []).filter(b => !(b.status === 'no_show' && b.cancellation_reason === 'cancelled_by_agent'))
  const visitatori = tutti.filter(b => b.status === 'completed').length || tutti.filter(b => b.status === 'confirmed').length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vend = (b: any) => String(b.gre_prequalification_responses?.[0]?.response_data?.vendita_immobile || '')
  const rows = tutti
    .filter(b => vend(b).startsWith('si') && followsClient(b, team, auth.agent, role))
    .map(b => {
      const c = b.gre_clients as unknown as { nome: string; cognome: string; telefono: string } | null
      return {
        id: b.id,
        status: b.status,
        situazione: vend(b),
        client: { nome: c?.nome || '', cognome: c?.cognome || '', telefono: c?.telefono || '' },
        wa_vendita_at: b.wa_vendita_at,
        wa_venduto_at: b.wa_venduto_at,
      }
    })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = oh.gre_properties as any
  const { data: prop } = await supabase.from('gre_open_houses').select('property_id, gre_properties (venduto_il)').eq('id', id).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendutoIl = (prop?.gre_properties as any)?.venduto_il || null

  return NextResponse.json({
    rows,
    puoSegnareVenduto: role !== 'collega',
    immobile: { titolo: p?.titolo || '', zona: p?.zona || '', foto: p?.immagini?.[0] || null, venduto_il: vendutoIl },
    open_house: { data_evento: oh.data_evento, visitatori, prenotati: tutti.filter(b => b.status !== 'no_show').length },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const supabase = getSupabaseAdmin()

  // immobile venduto (o annullato): lo segnano gli organizzatori
  if (body.action === 'venduto') {
    if (access.role === 'collega') return NextResponse.json({ error: 'Lo segna chi organizza l\'Open House' }, { status: 403 })
    const data = body.data === null ? null : /^\d{4}-\d{2}-\d{2}$/.test(body.data) ? body.data : null
    if (body.data !== null && !data) return NextResponse.json({ error: 'Data non valida' }, { status: 400 })
    const { data: o } = await supabase.from('gre_open_houses').select('property_id').eq('id', id).maybeSingle()
    if (!o?.property_id) return NextResponse.json({ error: 'Immobile non trovato' }, { status: 404 })
    const { error } = await supabase.from('gre_properties').update({ venduto_il: data }).eq('id', o.property_id)
    if (error) return NextResponse.json({ error: 'Non salvato' }, { status: 500 })
    return NextResponse.json({ ok: true, venduto_il: data })
  }

  // messaggio WhatsApp inviato
  if (body.action === 'inviato' && (body.tipo === 'vendita' || body.tipo === 'venduto')) {
    const { data: b } = await supabase.from('gre_bookings').select('id, agente_referente_id').eq('id', String(body.bookingId || '')).eq('open_house_id', id).maybeSingle()
    if (!b || !followsClient(b, access.team, auth.agent, access.role)) return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 })
    const at = new Date().toISOString()
    await supabase.from('gre_bookings').update(body.tipo === 'vendita' ? { wa_vendita_at: at } : { wa_venduto_at: at }).eq('id', b.id)
    return NextResponse.json({ ok: true, at })
  }

  return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
}
