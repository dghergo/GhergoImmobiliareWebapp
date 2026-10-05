import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'
import { loadTeam } from '@/lib/oh-access'

// Dati pubblici di un Open House: immobile, agente, orari con posti occupati.
// Nessun dato dei clienti viene restituito.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getSupabaseAdmin()

  const { data: oh, error } = await supabase
    .from('gre_open_houses')
    .select(`
      *,
      gre_properties (id, titolo, descrizione, prezzo, tipologia, zona, indirizzo, caratteristiche, immagini, brochure_url),
      gre_agents (id, nome, cognome, email)
    `)
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('public open-house error:', error)
    return NextResponse.json({ error: 'Errore nel caricamento' }, { status: 500 })
  }
  if (!oh) {
    return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })
  }

  const [{ data: slots }, { data: bookings }, { data: agents }, aperti] = await Promise.all([
    supabase
      .from('gre_time_slots')
      .select('id, open_house_id, ora_inizio, ora_fine, max_partecipanti, is_available')
      .eq('open_house_id', id)
      .order('ora_inizio'),
    supabase
      .from('gre_bookings')
      .select('time_slot_id, status')
      .eq('open_house_id', id)
      .in('status', ['confirmed', 'completed']),
    supabase
      .from('gre_agents')
      .select('id, nome, cognome')
      .eq('is_active', true)
      // come agente di riferimento si sceglie solo un agente immobiliare abilitato
      .neq('qualifica', 'assistente')
      .order('cognome'),
    // Orari prenotabili adesso (riempimento graduale): stessa regola usata alla prenotazione
    supabase.rpc('gre_slot_aperti', { p_open_house_id: id })
  ])
  const apertiIds = aperti.error ? null : new Set(((aperti.data || []) as unknown[]).map(r => String(typeof r === 'object' && r ? Object.values(r)[0] : r)))

  const occupiedBySlot = new Map<string, number>()
  for (const b of bookings || []) {
    if (b.time_slot_id) occupiedBySlot.set(b.time_slot_id, (occupiedBySlot.get(b.time_slot_id) || 0) + 1)
  }

  const timeSlots = (slots || [])
    .filter(s => s.is_available !== false)
    .map(s => {
      const occ = occupiedBySlot.get(s.id) || 0
      const cap = s.max_partecipanti || 1
      return {
        ...s,
        posti_occupati: occ,
        posti_disponibili: cap,
        // completo = tutti i posti presi; aperto = prenotabile adesso
        completo: occ >= cap,
        aperto: occ < cap && (apertiIds ? apertiIds.has(s.id) : true),
      }
    })
    // gli orari non ancora aperti (giro successivo) non si mostrano
    .filter(s => s.aperto || s.completo)

  // chi accoglie: gli organizzatori (gli assistenti indicati come tali); il contatto è l'agente abilitato
  const team = await loadTeam(oh)
  const lead = team.lead || team.members[0] || null
  const { gre_properties, gre_agents, ...rest } = oh
  // La brochure si scarica solo dopo la prenotazione: qui si dice soltanto se esiste
  const { brochure_url, ...propertyPublic } = (gre_properties || {}) as Record<string, unknown>
  return NextResponse.json({
    openHouse: { ...rest, property: { ...propertyPublic, has_brochure: !!brochure_url }, agent: lead ? { nome: lead.nome, cognome: lead.cognome, email: lead.email } : gre_agents, accoglienza: team.members.map(m => ({ nome: m.nome, cognome: m.cognome, qualifica: m.qualifica })) },
    timeSlots,
    totalBookings: (bookings || []).length,
    referenceAgents: agents || []
  }, { headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' } })
}
