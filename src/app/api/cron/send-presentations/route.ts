import { NextResponse } from 'next/server'
import { getSupabaseAdmin, hasCronSecret, requireStaff } from '@/lib/server-auth'
import { sendPresentation } from '@/lib/presentazione'

export const maxDuration = 300

// Invio automatico di "Prepara la tua visita" 24 ore prima dell'inizio, solo dove è attiva.
// Chi prenota dopo la riceve al giro successivo, fino all'inizio dell'Open House. Mai di notte.
const romeNow = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date()).replace(' ', 'T')

export async function GET(request: Request) {
  if (!hasCronSecret(request)) {
    const auth = await requireStaff(request, { adminOnly: true })
    if (auth.error) return auth.error
  }
  const now = romeNow()
  const hour = Number(now.slice(11, 13))
  if (hour < 8 || hour >= 21) return NextResponse.json({ success: true, skipped: 'fuori orario', sent: 0 })

  const today = now.slice(0, 10)
  const dopodomani = new Date(Date.parse(today + 'T00:00:00Z') + 2 * 86400000).toISOString().slice(0, 10)
  const { data: ohs } = await getSupabaseAdmin()
    .from('gre_open_houses')
    .select('id, data_evento, ora_inizio')
    .eq('presentazione_attiva', true)
    .eq('is_active', true)
    .not('video_casa_url', 'is', null)
    .gte('data_evento', today)
    .lte('data_evento', dopodomani)

  let sent = 0
  for (const oh of ohs || []) {
    // finestra in ora italiana: da 24 ore prima dell'inizio fino all'inizio
    const start = new Date(`${oh.data_evento}T${String(oh.ora_inizio).slice(0, 5)}:00Z`)
    const from = new Date(start.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 16)
    const to = start.toISOString().slice(0, 16)
    if (now < from || now >= to) continue
    const r = await sendPresentation(oh.id)
    sent += r.sent
  }
  return NextResponse.json({ success: true, sent, at: now })
}
