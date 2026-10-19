import { NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { getSupabaseAdmin } from '@/lib/server-auth'
import { ANAGRAFICA_VUOTA, creaFoglioPdf, dichiarazioni, FOGLIO_VERSIONE, type FoglioDati } from '@/lib/foglio-visita'
import { foglioEmail, sendAsAgent } from '@/lib/feedback-emails'
import { niceText } from '@/lib/text'

// Conferma di visita firmata: parte comune al check-in di chi ha l'accesso e al link dato ai colleghi.

export const BUCKET = 'gre_fogli_visita'
export const BOOKING_FOGLIO_SELECT =
  'id, status, cancellation_reason, agente_referente_id, foglio_visita_firmato_at, foglio_visita_path, client_id, gre_clients (nome, cognome, email, telefono, anagrafica), gre_time_slots (ora_inizio)'

export const maskEmail = (e: string) => e.replace(/^(.).*?(@.*)$/, '$1•••$2')
export const maskTel = (t: string) => (t.length > 4 ? `•••• ${t.slice(-3)}` : t)

type Agente = { id: string; nome: string; cognome: string; email: string } | null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function datiFoglio(oh: { data_evento: string; gre_properties: any }, b: any, agent: Agente): FoglioDati {
  const p = oh.gre_properties
  const c = b.gre_clients
  const f = p?.dati_foglio || {}
  return {
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
      data: new Date(oh.data_evento + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      ora: (b.gre_time_slots?.ora_inizio || '').slice(0, 5),
    },
    agente: agent ? `${agent.nome} ${agent.cognome}` : '',
  }
}

export async function agenteDi(agentId: string | null): Promise<Agente> {
  if (!agentId) return null
  const { data } = await getSupabaseAdmin().from('gre_agents').select('id, nome, cognome, email').eq('id', agentId).maybeSingle()
  return data
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Firma: crea il PDF, lo archivia, segna il cliente come arrivato e lo manda per email al cliente e all'agente che lo segue. */
export async function firmaFoglio(opts: {
  request: Request
  openHouseId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b: any
  agent: Agente
  dati: FoglioDati
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
  raccoltoDa: string | null
  ruolo: string
}) {
  const { request, openHouseId, b, agent, body } = opts
  const dati = { ...opts.dati, cliente: { ...opts.dati.cliente } }

  if (body.accettata !== true) {
    return NextResponse.json({ error: 'Il cliente deve confermare la visita e accettare le condizioni' }, { status: 400 })
  }
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.firma || ''))
  if (!m || m[1].length < 2000 || m[1].length > 3_000_000) return NextResponse.json({ error: 'Firma mancante' }, { status: 400 })
  const firmaPng = Buffer.from(m[1], 'base64')

  const supabase = getSupabaseAdmin()
  // email mancante: il cliente la scrive al momento della firma
  if (!dati.cliente.email) {
    const nuova = String(body.email || '').trim().toLowerCase()
    if (!EMAIL_RE.test(nuova)) return NextResponse.json({ error: 'Serve l\'email del cliente per mandargli la copia', serveEmail: true }, { status: 400 })
    if (b.client_id) await supabase.from('gre_clients').update({ email: nuova }).eq('id', b.client_id)
    dati.cliente.email = nuova
  }

  const firmatoIl = new Date()
  const codice = randomBytes(5).toString('hex').toUpperCase()
  let logoPng: Uint8Array | null = null
  try {
    const res = await fetch(new URL('/logo-ghergo-blu.png', request.url))
    if (res.ok) logoPng = new Uint8Array(await res.arrayBuffer())
  } catch { /* senza logo */ }

  const pdf = await creaFoglioPdf({ dati, firmaPng, firmatoIl, codice, logoPng })
  const hash = createHash('sha256').update(pdf).digest('hex')
  const path = `${openHouseId}/${b.id}-${firmatoIl.getTime()}.pdf`

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
      raccolto_da: opts.raccoltoDa, ruolo: opts.ruolo,
    },
  }).eq('id', b.id)

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

  return NextResponse.json({ ok: true, firmatoIl: firmatoIl.toISOString(), emailOk, codice, email: maskEmail(dati.cliente.email) })
}
