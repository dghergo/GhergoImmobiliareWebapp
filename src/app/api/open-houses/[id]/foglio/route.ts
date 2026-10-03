import { NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { followerId, followsClient, openHouseAccess } from '@/lib/oh-access'
import { ANAGRAFICA_VUOTA, creaFoglioPdf, dichiarazioni, FOGLIO_VERSIONE, type FoglioDati } from '@/lib/foglio-visita'
import { foglioEmail, sendAsAgent } from '@/lib/feedback-emails'
import { niceText } from '@/lib/text'

export const maxDuration = 60
const BUCKET = 'gre_fogli_visita'

const maskEmail = (e: string) => e.replace(/^(.).*?(@.*)$/, '$1•••$2')
const maskTel = (t: string) => (t.length > 4 ? `•••• ${t.slice(-3)}` : t)

async function load(request: Request, id: string, bookingId: string) {
  const auth = await requireStaff(request)
  if (auth.error) return { error: auth.error }
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return { error: NextResponse.json({ error: 'Open House non trovato' }, { status: 404 }) }
  const { data: b } = await getSupabaseAdmin()
    .from('gre_bookings')
    .select('id, status, agente_referente_id, foglio_visita_firmato_at, foglio_visita_path, client_id, gre_clients (nome, cognome, email, telefono, anagrafica), gre_time_slots (ora_inizio)')
    .eq('id', bookingId).eq('open_house_id', id).maybeSingle()
  if (!b) return { error: NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 }) }
  const mine = followsClient(b, access.oh.agent_id, auth.agent, access.role)
  // il collega lavora solo sui suoi clienti; l'organizzatore può far firmare tutti alla porta
  if (access.role === 'collega' && !mine) return { error: NextResponse.json({ error: 'Non autorizzato' }, { status: 403 }) }
  const supabase = getSupabaseAdmin()
  const { data: agent } = await supabase.from('gre_agents').select('id, nome, cognome, email').eq('id', followerId(b, access.oh.agent_id)).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = access.oh.gre_properties as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = b.gre_clients as any
  const f = p?.dati_foglio || {}
  const dati: FoglioDati = {
    cliente: { nome: c?.nome || '', cognome: c?.cognome || '', email: c?.email || '', telefono: c?.telefono || '' },
    anagrafica: { ...ANAGRAFICA_VUOTA, ...(c?.anagrafica || {}), residenza: { ...ANAGRAFICA_VUOTA.residenza, ...(c?.anagrafica?.residenza || {}) } },
    immobile: {
      titolo: niceText(p?.titolo || ''),
      riferimento: f.riferimento || '',
      comune: f.comune || '',
      provincia: f.provincia || '',
      indirizzo: p?.indirizzo || niceText(p?.zona || ''),
      scala: f.scala || '',
      piano: p?.caratteristiche?.piano || '',
      interno: f.interno || '',
      catasto: { foglio: f.catasto_foglio || '', particella: f.catasto_particella || '', sub: f.catasto_sub || '', categoria: f.catasto_categoria || '' },
      prezzo: p?.prezzo || null,
    },
    visita: {
      data: new Date(access.oh.data_evento + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ora: ((b.gre_time_slots as any)?.ora_inizio || '').slice(0, 5),
    },
    agente: agent ? `${agent.nome} ${agent.cognome}` : '',
  }
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
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// Firma: crea il PDF, lo archivia, segna il cliente come arrivato e glielo manda per email
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const r = await load(request, id, String(body.bookingId || ''))
  if (r.error) return r.error
  const { b, agent, dati, auth, access } = r

  // conferma unica: il cliente accetta in blocco le condizioni mostrate e firma
  if (body.accettata !== true) {
    return NextResponse.json({ error: 'Il cliente deve confermare la visita e accettare le condizioni' }, { status: 400 })
  }
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.firma || ''))
  if (!m || m[1].length < 2000 || m[1].length > 3_000_000) return NextResponse.json({ error: 'Firma mancante' }, { status: 400 })
  const firmaPng = Buffer.from(m[1], 'base64')
  if (!dati.cliente.email) return NextResponse.json({ error: 'Il cliente non ha un\'email: aggiungila dai contatti' }, { status: 400 })

  const firmatoIl = new Date()
  const codice = randomBytes(5).toString('hex').toUpperCase()
  let logoPng: Uint8Array | null = null
  try {
    const res = await fetch(new URL('/logo-ghergo-blu.png', request.url))
    if (res.ok) logoPng = new Uint8Array(await res.arrayBuffer())
  } catch { /* senza logo */ }

  const pdf = await creaFoglioPdf({ dati, firmaPng, firmatoIl, codice, logoPng })
  const hash = createHash('sha256').update(pdf).digest('hex')
  const path = `${id}/${b.id}-${firmatoIl.getTime()}.pdf`

  const supabase = getSupabaseAdmin()
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false })
  if (upErr) {
    console.error('Upload foglio visita:', upErr)
    return NextResponse.json({ error: 'Salvataggio non riuscito, riprova' }, { status: 500 })
  }
  const fwd = request.headers.get('x-forwarded-for') || ''
  await supabase.from('gre_bookings').update({
    status: 'completed',
    foglio_visita_firmato_at: firmatoIl.toISOString(),
    foglio_visita_path: path,
    foglio_visita_dati: {
      versione: FOGLIO_VERSIONE, codice, sha256: hash, dichiarazioni: dichiarazioni(dati),
      dati, ip: fwd.split(',')[0].trim() || null, user_agent: request.headers.get('user-agent'),
      raccolto_da: auth.agent.id, ruolo: access.role,
    },
  }).eq('id', b.id)

  // copia al cliente e all'agente che lo segue
  const filename = `Conferma di visita - ${dati.cliente.nome} ${dati.cliente.cognome}.pdf`
  let emailOk = false
  if (agent) {
    try {
      await sendAsAgent(dati.cliente.email, { ...foglioEmail({ dati, perAgente: false }), attachments: [{ filename, content: Buffer.from(pdf), contentType: 'application/pdf' }] }, agent.id)
      emailOk = true
      await sendAsAgent(agent.email, { ...foglioEmail({ dati, perAgente: true }), attachments: [{ filename, content: Buffer.from(pdf), contentType: 'application/pdf' }] }, agent.id)
    } catch (e) {
      console.error('Email foglio visita:', e)
    }
  }

  return NextResponse.json({ ok: true, firmatoIl: firmatoIl.toISOString(), emailOk, codice })
}
