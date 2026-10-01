import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'

// Dati minimi per la pagina di feedback (raggiunta dal link nell'email del cliente).
export async function GET(_request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('gre_bookings')
    .select(`
      id,
      feedback_completed,
      gre_open_houses (id, data_evento, gre_properties (id, titolo, zona))
    `)
    .eq('id', bookingId)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
  }

  return NextResponse.json({ booking: data })
}
