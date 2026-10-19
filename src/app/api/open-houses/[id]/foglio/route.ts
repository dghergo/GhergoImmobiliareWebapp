import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { followerId, followsClient, openHouseAccess } from '@/lib/oh-access'
import { ANAGRAFICA_VUOTA, dichiarazioni } from '@/lib/foglio-visita'
import { agenteDi, BOOKING_FOGLIO_SELECT, BUCKET, datiFoglio, firmaFoglio, maskEmail, maskTel } from '@/lib/foglio-server'

export const maxDuration = 60

async function load(request: Request, id: string, bookingId: string) {
  const auth = await requireStaff(request)
  if (auth.error) return { error: auth.error }
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return { error: NextResponse.json({ error: 'Open House non trovato' }, { status: 404 }) }
  const { data: b } = await getSupabaseAdmin()
    .from('gre_bookings')
    .select(BOOKING_FOGLIO_SELECT)
    .eq('id', bookingId).eq('open_house_id', id).maybeSingle()
  if (!b) return { error: NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 }) }
  const mine = followsClient(b, access.team, auth.agent, access.role)
  // il collega lavora solo sui suoi clienti; l'organizzatore può far firmare tutti alla porta
  if (access.role === 'collega' && !mine) return { error: NextResponse.json({ error: 'Non autorizzato' }, { status: 403 }) }
  const agent = await agenteDi(followerId(b, access.team))
  const dati = datiFoglio(access.oh, b, agent)
  return { auth, access, b, mine, agent, dati }
}

// Dati precompilati per la firma, oppure (download=1) il PDF firmato
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const r = await load(request, id, url.searchParams.get('bookingId') || '')
  if (r.error) return r.error
  const { b, mine, dati } = r

  if (url.searchParams.get('download')) {
    if (!mine || !b.foglio_visita_path) return NextResponse.json({ error: 'Documento non disponibile' }, { status: 404 })
    const { data } = await getSupabaseAdmin().storage.from(BUCKET).createSignedUrl(b.foglio_visita_path, 300)
    if (!data?.signedUrl) return NextResponse.json({ error: 'Documento non disponibile' }, { status: 404 })
    return NextResponse.json({ url: data.signedUrl })
  }

  // a chi non segue il cliente i contatti arrivano mascherati
  const cliente = mine ? dati.cliente : { ...dati.cliente, email: maskEmail(dati.cliente.email), telefono: maskTel(dati.cliente.telefono) }
  const datiCatastaliMancanti = !dati.immobile.catasto.foglio || !dati.immobile.comune
  return NextResponse.json({
    datiCatastaliMancanti,
    dati: { ...dati, cliente, anagrafica: mine ? dati.anagrafica : ANAGRAFICA_VUOTA },
    dichiarazioni: dichiarazioni(dati),
    firmatoIl: b.foglio_visita_firmato_at,
    puoScaricare: mine && !!b.foglio_visita_path,
    serveEmail: !dati.cliente.email,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// Firma: crea il PDF, lo archivia, segna il cliente come arrivato e glielo manda per email
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const r = await load(request, id, String(body.bookingId || ''))
  if (r.error) return r.error
  return firmaFoglio({ request, openHouseId: id, b: r.b, agent: r.agent, dati: r.dati, body, raccoltoDa: r.auth.agent.id, ruolo: r.access.role })
}
