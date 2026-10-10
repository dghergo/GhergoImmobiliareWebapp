import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'

// Gestionale immobili: offerte ricevute agli Open House e stato di vendita.
// Admin: tutti gli immobili. Agente: i suoi immobili.

export async function GET(request: Request) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const supabase = getSupabaseAdmin()
  const admin = auth.agent.role === 'admin'

  let pq = supabase.from('gre_properties').select('id')
  if (!admin) pq = pq.eq('agent_id', auth.agent.id)
  const { data: props } = await pq
  const ids = (props || []).map(p => p.id)
  if (!ids.length) return NextResponse.json({ offerte: {} })

  const { data, error } = await supabase
    .from('gre_offerte')
    .select('id, property_id, importo, data, stato, condizioni, gre_bookings (agente_referente_id, gre_clients (nome, cognome), gre_open_houses (data_evento), referente:gre_agents!gre_bookings_agente_referente_id_fkey (nome, cognome))')
    .in('property_id', ids)
    .order('importo', { ascending: false })
  if (error) return NextResponse.json({ offerte: {} })

  const offerte: Record<string, unknown[]> = {}
  for (const x of data || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = x.gre_bookings as any
    ;(offerte[x.property_id] ||= []).push({
      id: x.id,
      importo: Number(x.importo),
      data: x.data,
      stato: x.stato,
      condizioni: x.condizioni,
      cliente: `${b?.gre_clients?.nome || ''} ${b?.gre_clients?.cognome || ''}`.trim() || 'Cliente',
      agente: b?.referente ? `${b.referente.nome} ${b.referente.cognome}` : null,
      open_house: b?.gre_open_houses?.data_evento || null,
    })
  }
  return NextResponse.json({ offerte }, { headers: { 'Cache-Control': 'no-store' } })
}

// Segna venduto / annulla dalla scheda immobile
export async function POST(request: Request) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))
  const supabase = getSupabaseAdmin()
  if (body.action !== 'venduto') return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
  const data = body.data === null ? null : /^\d{4}-\d{2}-\d{2}$/.test(body.data || '') ? body.data : undefined
  if (data === undefined) return NextResponse.json({ error: 'Data non valida' }, { status: 400 })
  const { data: p } = await supabase.from('gre_properties').select('id, agent_id').eq('id', String(body.propertyId || '')).maybeSingle()
  if (!p || (auth.agent.role !== 'admin' && p.agent_id !== auth.agent.id)) return NextResponse.json({ error: 'Immobile non trovato' }, { status: 404 })
  const { error } = await supabase.from('gre_properties').update({ venduto_il: data }).eq('id', p.id)
  if (error) return NextResponse.json({ error: 'Non salvato' }, { status: 500 })
  return NextResponse.json({ ok: true, venduto_il: data })
}
