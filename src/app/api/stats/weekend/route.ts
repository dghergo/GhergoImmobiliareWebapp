import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'

// Numeri dell'agenzia per il video del lunedì: solo conteggi, nessun dato dei clienti.
// Periodo di default: l'ultimo fine settimana (da venerdì a domenica).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function ultimoWeekend() {
  const oggi = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
  const dow = oggi.getDay() // 0 domenica … 6 sabato
  // domenica più recente (oggi se è domenica)
  const dom = new Date(oggi)
  dom.setDate(oggi.getDate() - dow)
  const ven = new Date(dom)
  ven.setDate(dom.getDate() - 2)
  const f = (d: Date) => d.toLocaleDateString('sv-SE')
  return { da: f(ven), a: f(dom) }
}

export async function GET(request: Request) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error

  const url = new URL(request.url)
  const def = ultimoWeekend()
  const da = DATE_RE.test(url.searchParams.get('da') || '') ? url.searchParams.get('da')! : def.da
  const a = DATE_RE.test(url.searchParams.get('a') || '') ? url.searchParams.get('a')! : def.a

  const supabase = getSupabaseAdmin()
  const { data: ohs } = await supabase
    .from('gre_open_houses')
    .select('id, property_id, data_evento')
    .gte('data_evento', da)
    .lte('data_evento', a)
    .eq('is_active', true)
  const ids = (ohs || []).map(o => o.id)
  if (!ids.length) {
    return NextResponse.json({ da, a, openHouse: 0, immobili: 0, visitatori: 0, senzaMutuo: 0, offerte: 0, prenotati: 0 })
  }

  const { data: bookings } = await supabase
    .from('gre_bookings')
    .select('id, open_house_id, status, cancellation_reason, gre_prequalification_responses (response_data), gre_feedback_responses (interesse_acquisto)')
    .in('open_house_id', ids)

  // Open House in cui è stato fatto il check-in: contano gli arrivati.
  // Dove nessuno ha segnato le presenze si contano i prenotati (escluse le cancellazioni).
  const conCheckin = new Set((bookings || []).filter(b => b.status === 'completed').map(b => b.open_house_id))
  const attivi = (bookings || []).filter(b => !(b.status === 'no_show' && b.cancellation_reason === 'cancelled_by_agent'))
  const visitatori = attivi.filter(b => (conCheckin.has(b.open_house_id) ? b.status === 'completed' : b.status === 'confirmed'))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (b: any) => b.gre_prequalification_responses?.[0]?.response_data || {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = (b: any) => b.gre_feedback_responses?.[0] || null

  return NextResponse.json({
    da,
    a,
    openHouse: ids.length,
    immobili: new Set((ohs || []).map(o => o.property_id)).size,
    visitatori: visitatori.length,
    senzaMutuo: visitatori.filter(b => q(b).necessita_mutuo === 'no').length,
    // persone che dal feedback hanno chiesto di fare un'offerta
    offerte: attivi.filter(b => f(b)?.interesse_acquisto).length,
    prenotati: attivi.filter(b => b.status !== 'no_show').length,
    senzaCheckin: ids.filter(id => !conCheckin.has(id)).length,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
