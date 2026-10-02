import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'

// Elenco pubblico degli Open House attivi (homepage). Nessun dato dei clienti.
export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('gre_open_houses')
    .select(`
      id,
      data_evento,
      ora_inizio,
      ora_fine,
      gre_properties!inner (titolo, descrizione, prezzo, tipologia, zona, caratteristiche, immagini, is_active),
      gre_agents!inner (nome, cognome, email)
    `)
    .eq('is_active', true)
    .eq('gre_properties.is_active', true)
    .order('data_evento', { ascending: true })

  if (error) {
    console.error('public open-houses error:', error)
    return NextResponse.json({ error: 'Errore nel caricamento' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openHouses = (data || []).map((item: any) => ({
    id: item.id,
    data_evento: item.data_evento,
    ora_inizio: item.ora_inizio,
    ora_fine: item.ora_fine,
    property: item.gre_properties,
    agent: item.gre_agents
  }))

  // Cache breve sulla rete Vercel: pagina più veloce, dati aggiornati entro un minuto
  return NextResponse.json({ openHouses }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } })
}
