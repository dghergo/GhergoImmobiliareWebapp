import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { createCheckinToken } from '@/lib/checkin-link'

// L'agente dell'Open House (o l'admin) genera il link di check-in da dare a un collega
export async function POST(request: Request) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const openHouseId = typeof body.openHouseId === 'string' ? body.openHouseId : ''

  const { data: oh } = await getSupabaseAdmin()
    .from('gre_open_houses')
    .select('id, agent_id, data_evento')
    .eq('id', openHouseId)
    .maybeSingle()

  if (!oh || (auth.agent.role !== 'admin' && oh.agent_id !== auth.agent.id)) {
    return NextResponse.json({ error: 'Open House non trovato o non accessibile' }, { status: 404 })
  }

  const token = createCheckinToken(oh.id, oh.data_evento)
  return NextResponse.json({ path: `/check-in/${oh.id}?k=${encodeURIComponent(token)}` })
}
