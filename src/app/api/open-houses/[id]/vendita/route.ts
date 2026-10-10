import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff, type StaffAgent } from '@/lib/server-auth'
import { followsClient, openHouseAccess } from '@/lib/oh-access'

// Vendita e offerte di un Open House:
// - immobile venduto (data) e avviso ai partecipanti
// - offerte ricevute: chi, quanto, stato.
// Gli organizzatori vedono tutte le offerte (servono per presentarle al proprietario); il collega solo quelle dei suoi clienti.
// I contatti dei clienti dei colleghi restano visibili solo a chi li segue.

const STATI = ['presentata', 'accettata', 'rifiutata', 'ritirata'] as const

async function load(id: string, access: NonNullable<Awaited<ReturnType<typeof openHouseAccess>>>, me: StaffAgent) {
  const { oh, role, team } = access
  const supabase = getSupabaseAdmin()
  const [{ data: o }, { data: bookings }, { data: offerte }] = await Promise.all([
    supabase.from('gre_open_houses').select('property_id, gre_properties (venduto_il)').eq('id', id).maybeSingle(),
    supabase
      .from('gre_bookings')
      .select('id, status, cancellation_reason, agente_referente_id, wa_venduto_at, gre_clients (nome, cognome, telefono), gre_prequalification_responses (response_data), referente:gre_agents!gre_bookings_agente_referente_id_fkey (nome, cognome)')
      .eq('open_house_id', id),
    supabase.from('gre_offerte').select('*').eq('open_house_id', id).order('data', { ascending: false }),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendutoIl = (o?.gre_properties as any)?.venduto_il || null
  const attivi = (bookings || []).filter(b => !(b.status === 'no_show' && b.cancellation_reason === 'cancelled_by_agent'))
  const conCheckin = attivi.some(b => b.status === 'completed')
  const partecipanti = attivi.filter(b => (conCheckin ? b.status === 'completed' : b.status === 'confirmed'))
  const byId = new Map(attivi.map(b => [b.id, b]))
  const acquirenti = new Set((offerte || []).filter(x => x.stato === 'accettata').map(x => x.booking_id))
  const segue = (b: { agente_referente_id: string | null }) => followsClient(b, team, me, role)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cl = (b: any) => (b?.gre_clients || {}) as { nome?: string; cognome?: string; telefono?: string }

  return {
    role,
    puoSegnareVenduto: role !== 'collega',
    venduto_il: vendutoIl,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    immobile: { titolo: (oh.gre_properties as any)?.titolo || '', zona: (oh.gre_properties as any)?.zona || '', foto: (oh.gre_properties as any)?.immagini?.[0] || null },
    open_house: { data_evento: oh.data_evento, visitatori: partecipanti.length },
    // a chi comunicare la vendita: i partecipanti che segui (escluso chi ha comprato)
    partecipanti: partecipanti
      .filter(b => segue(b) && !acquirenti.has(b.id))
      .map(b => ({
        id: b.id,
        nome: cl(b).nome || '',
        cognome: cl(b).cognome || '',
        telefono: cl(b).telefono || '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        deve_vendere: String((b as any).gre_prequalification_responses?.[0]?.response_data?.vendita_immobile || '').startsWith('si'),
        wa_venduto_at: b.wa_venduto_at,
      })),
    // clienti per cui si può registrare un'offerta
    clienti: attivi
      .filter(b => b.status !== 'no_show' && (role !== 'collega' || segue(b)))
      .map(b => ({ id: b.id, nome: `${cl(b).nome || ''} ${cl(b).cognome || ''}`.trim() }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    offerte: (offerte || [])
      .filter(x => role !== 'collega' || (byId.get(x.booking_id) && segue(byId.get(x.booking_id)!)))
      .map(x => {
        const b = byId.get(x.booking_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ref = (b as any)?.referente
        return {
          id: x.id,
          booking_id: x.booking_id,
          cliente: b ? `${cl(b).nome || ''} ${cl(b).cognome || ''}`.trim() : 'Cliente',
          portato_da: b?.agente_referente_id && !team.ids.includes(b.agente_referente_id) && ref ? `${ref.nome} ${ref.cognome}` : null,
          importo: Number(x.importo),
          data: x.data,
          stato: x.stato,
          condizioni: x.condizioni,
        }
      }),
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })
  return NextResponse.json(await load(id, access, auth.agent), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const supabase = getSupabaseAdmin()
  const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
  const { data: o } = await supabase.from('gre_open_houses').select('property_id').eq('id', id).maybeSingle()
  if (!o?.property_id) return bad('Immobile non trovato', 404)
  const segueBooking = async (bookingId: string) => {
    const { data: b } = await supabase.from('gre_bookings').select('id, agente_referente_id').eq('id', bookingId).eq('open_house_id', id).maybeSingle()
    if (!b) return null
    return access.role !== 'collega' || followsClient(b, access.team, auth.agent, access.role) ? b : null
  }

  switch (body.action) {
    case 'venduto': {
      if (access.role === 'collega') return bad('Lo segna chi organizza l\'Open House', 403)
      const data = body.data === null ? null : /^\d{4}-\d{2}-\d{2}$/.test(body.data) ? body.data : undefined
      if (data === undefined) return bad('Data non valida')
      await supabase.from('gre_properties').update({ venduto_il: data }).eq('id', o.property_id)
      break
    }
    case 'inviato': {
      const b = await supabase.from('gre_bookings').select('id, agente_referente_id').eq('id', String(body.bookingId || '')).eq('open_house_id', id).maybeSingle()
      if (!b.data || !followsClient(b.data, access.team, auth.agent, access.role)) return bad('Cliente non trovato', 404)
      await supabase.from('gre_bookings').update({ wa_venduto_at: new Date().toISOString() }).eq('id', b.data.id)
      break
    }
    case 'offerta_add':
    case 'offerta_update': {
      const importo = Number(String(body.importo ?? '').replace(/\./g, '').replace(',', '.'))
      if (!Number.isFinite(importo) || importo <= 0 || importo > 100_000_000) return bad('Importo non valido')
      const stato = STATI.includes(body.stato) ? body.stato : 'presentata'
      const data = /^\d{4}-\d{2}-\d{2}$/.test(body.data || '') ? body.data : new Date().toLocaleDateString('sv-SE')
      const condizioni = typeof body.condizioni === 'string' ? body.condizioni.trim().slice(0, 1000) || null : null
      let bookingId = String(body.bookingId || '')
      if (body.action === 'offerta_update') {
        const { data: x } = await supabase.from('gre_offerte').select('booking_id').eq('id', String(body.id || '')).eq('open_house_id', id).maybeSingle()
        if (!x) return bad('Offerta non trovata', 404)
        bookingId = x.booking_id
      }
      if (!(await segueBooking(bookingId))) return bad('Cliente non trovato', 404)
      const row = { importo, stato, data, condizioni }
      const { error } = body.action === 'offerta_add'
        ? await supabase.from('gre_offerte').insert({ ...row, booking_id: bookingId, open_house_id: id, property_id: o.property_id, inserita_da: auth.agent.id })
        : await supabase.from('gre_offerte').update(row).eq('id', String(body.id))
      if (error) return bad('Non salvato', 500)
      // offerta accettata: l'immobile risulta venduto (se non lo era già)
      if (stato === 'accettata') {
        const { data: p } = await supabase.from('gre_properties').select('venduto_il').eq('id', o.property_id).maybeSingle()
        if (!p?.venduto_il) await supabase.from('gre_properties').update({ venduto_il: data }).eq('id', o.property_id)
      }
      break
    }
    case 'offerta_delete': {
      const { data: x } = await supabase.from('gre_offerte').select('booking_id').eq('id', String(body.id || '')).eq('open_house_id', id).maybeSingle()
      if (!x || !(await segueBooking(x.booking_id))) return bad('Offerta non trovata', 404)
      await supabase.from('gre_offerte').delete().eq('id', String(body.id))
      break
    }
    default:
      return bad('Azione non valida')
  }
  return NextResponse.json(await load(id, access, auth.agent))
}
