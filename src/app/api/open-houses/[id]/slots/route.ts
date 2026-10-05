import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { openHouseAccess } from '@/lib/oh-access'

// Gestione manuale degli orari di un Open House (organizzatore o admin).
// Le prenotazioni non vengono mai cancellate né spostate da qui.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

async function load(id: string) {
  const supabase = getSupabaseAdmin()
  const [{ data: oh }, { data: slots }, { data: bookings }, aperti] = await Promise.all([
    supabase.from('gre_open_houses').select('id, riempimento_graduale, max_partecipanti_slot').eq('id', id).maybeSingle(),
    supabase.from('gre_time_slots').select('id, ora_inizio, ora_fine, max_partecipanti, is_available, manuale').eq('open_house_id', id).order('ora_inizio'),
    supabase.from('gre_bookings').select('time_slot_id, status').eq('open_house_id', id),
    supabase.rpc('gre_slot_aperti', { p_open_house_id: id }),
  ])
  const occ = new Map<string, number>()
  const any = new Set<string>()
  for (const b of bookings || []) {
    if (!b.time_slot_id) continue
    any.add(b.time_slot_id)
    if (b.status === 'confirmed' || b.status === 'completed') occ.set(b.time_slot_id, (occ.get(b.time_slot_id) || 0) + 1)
  }
  const apertiIds = aperti.error ? null : new Set(((aperti.data || []) as unknown[]).map(r => String(typeof r === 'object' && r ? Object.values(r)[0] : r)))
  return {
    graduale: oh?.riempimento_graduale !== false,
    slots: (slots || []).map(s => {
      const o = occ.get(s.id) || 0
      const cap = s.max_partecipanti || 1
      return {
        id: s.id,
        ora_inizio: s.ora_inizio.slice(0, 5),
        ora_fine: s.ora_fine.slice(0, 5),
        capienza: cap,
        prenotati: o,
        chiuso: s.is_available === false,
        manuale: !!s.manuale,
        con_prenotazioni: any.has(s.id),
        stato: s.is_available === false ? 'chiuso' : o >= cap ? 'completo' : apertiIds && !apertiIds.has(s.id) ? 'in_attesa' : 'aperto',
      }
    }),
  }
}

async function guard(request: Request, id: string) {
  const auth = await requireStaff(request)
  if (auth.error) return { error: auth.error }
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return { error: NextResponse.json({ error: 'Open House non trovato' }, { status: 404 }) }
  if (access.role === 'collega') return { error: NextResponse.json({ error: 'Gli orari li gestisce chi organizza l\'Open House' }, { status: 403 }) }
  return { access }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard(request, id)
  if (g.error) return g.error
  return NextResponse.json(await load(id), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard(request, id)
  if (g.error) return g.error
  const body = await request.json().catch(() => ({}))
  const supabase = getSupabaseAdmin()
  const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

  const slotOf = async () => {
    if (typeof body.slotId !== 'string') return null
    const { data } = await supabase.from('gre_time_slots').select('id').eq('id', body.slotId).eq('open_house_id', id).maybeSingle()
    return data
  }
  const prenotati = async (slotId: string, soloAttive = true) => {
    let q = supabase.from('gre_bookings').select('id', { count: 'exact', head: true }).eq('time_slot_id', slotId)
    if (soloAttive) q = q.in('status', ['confirmed', 'completed'])
    const { count } = await q
    return count || 0
  }

  switch (body.action) {
    case 'graduale': {
      const { error } = await supabase.from('gre_open_houses').update({ riempimento_graduale: !!body.on }).eq('id', id)
      if (error) return bad('Non salvato')
      break
    }
    case 'capienza': {
      const slot = await slotOf()
      const max = Number(body.max)
      if (!slot || !Number.isInteger(max) || max < 1 || max > 20) return bad('Capienza non valida')
      const occ = await prenotati(slot.id)
      if (max < occ) return bad(`In questo orario ci sono già ${occ} prenotati`)
      await supabase.from('gre_time_slots').update({ max_partecipanti: max, manuale: true }).eq('id', slot.id)
      break
    }
    case 'capienza_tutti': {
      const max = Number(body.max)
      if (!Number.isInteger(max) || max < 1 || max > 20) return bad('Capienza non valida')
      const { slots } = await load(id)
      // non si scende sotto i prenotati di ciascun orario
      for (const s of slots) {
        await supabase.from('gre_time_slots').update({ max_partecipanti: Math.max(max, s.prenotati) }).eq('id', s.id)
      }
      await supabase.from('gre_open_houses').update({ max_partecipanti_slot: max }).eq('id', id)
      break
    }
    case 'chiudi':
    case 'apri': {
      const slot = await slotOf()
      if (!slot) return bad('Orario non trovato')
      await supabase.from('gre_time_slots').update({ is_available: body.action === 'apri', manuale: true }).eq('id', slot.id)
      break
    }
    case 'orario': {
      const slot = await slotOf()
      if (!slot || !TIME_RE.test(body.ora_inizio) || !TIME_RE.test(body.ora_fine) || body.ora_fine <= body.ora_inizio) return bad('Orario non valido')
      if (await prenotati(slot.id)) return bad('Ci sono prenotati: per non confondere i clienti l\'orario non si sposta. Chiudilo e aggiungine uno nuovo.')
      await supabase.from('gre_time_slots').update({ ora_inizio: body.ora_inizio, ora_fine: body.ora_fine, manuale: true }).eq('id', slot.id)
      break
    }
    case 'aggiungi': {
      const max = Number(body.max) || 3
      if (!TIME_RE.test(body.ora_inizio) || !TIME_RE.test(body.ora_fine) || body.ora_fine <= body.ora_inizio) return bad('Orario non valido')
      if (max < 1 || max > 20) return bad('Capienza non valida')
      const { error } = await supabase.from('gre_time_slots').insert({
        open_house_id: id, ora_inizio: body.ora_inizio, ora_fine: body.ora_fine,
        max_partecipanti: max, partecipanti_attuali: 0, is_available: true, manuale: true,
      })
      if (error) return bad('Non aggiunto')
      break
    }
    case 'elimina': {
      const slot = await slotOf()
      if (!slot) return bad('Orario non trovato')
      if (await prenotati(slot.id, false)) return bad('Questo orario ha prenotazioni: puoi solo chiuderlo.')
      await supabase.from('gre_time_slots').delete().eq('id', slot.id)
      break
    }
    default:
      return bad('Azione non valida')
  }
  return NextResponse.json(await load(id))
}
