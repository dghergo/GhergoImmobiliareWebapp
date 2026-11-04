import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { openHouseAccess } from '@/lib/oh-access'
import { presentationEmail, sendAsAgent } from '@/lib/feedback-emails'
import { sendPresentation, URL_RE } from '@/lib/presentazione'

export const maxDuration = 300

// "Prepara la tua visita": facoltativa per ogni Open House. La gestisce chi organizza (e l'admin).
async function load(id: string) {
  const supabase = getSupabaseAdmin()
  const [{ data: oh }, { data: bookings }, { data: ultimo }] = await Promise.all([
    supabase.from('gre_open_houses').select('presentazione_attiva, video_casa_url, video_proposta_url').eq('id', id).maybeSingle(),
    supabase.from('gre_bookings').select('presentazione_inviata_at').eq('open_house_id', id).eq('status', 'confirmed'),
    // il video della proposta è uguale per tutti: si propone l'ultimo usato
    supabase.from('gre_open_houses').select('video_proposta_url').not('video_proposta_url', 'is', null).neq('id', id).order('created_at', { ascending: false }).limit(1),
  ])
  const all = bookings || []
  return {
    attiva: !!oh?.presentazione_attiva,
    video_casa_url: oh?.video_casa_url || '',
    video_proposta_url: oh?.video_proposta_url || '',
    video_proposta_suggerito: ultimo?.[0]?.video_proposta_url || '',
    prenotati: all.length,
    inviate: all.filter(b => b.presentazione_inviata_at).length,
  }
}

async function guard(request: Request, id: string) {
  const auth = await requireStaff(request)
  if (auth.error) return { error: auth.error }
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return { error: NextResponse.json({ error: 'Open House non trovato' }, { status: 404 }) }
  if (access.role === 'collega') return { error: NextResponse.json({ error: 'La presentazione la gestisce chi organizza l\'Open House' }, { status: 403 }) }
  return { access, agent: auth.agent }
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
  const link = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 1000) : '')

  if (body.action === 'salva') {
    const casa = link(body.video_casa_url), proposta = link(body.video_proposta_url)
    if (casa && !URL_RE.test(casa)) return bad('Il link del video della casa deve iniziare con https://')
    if (proposta && !URL_RE.test(proposta)) return bad('Il link del video della proposta deve iniziare con https://')
    if (body.attiva && !casa) return bad('Per attivare la presentazione serve il link del video della casa.')
    const { error } = await supabase.from('gre_open_houses').update({ presentazione_attiva: !!body.attiva, video_casa_url: casa || null, video_proposta_url: proposta || null }).eq('id', id)
    if (error) return bad('Non salvato, riprova')
    return NextResponse.json({ ...(await load(id)), ok: 'Salvato' })
  }

  if (body.action === 'invia') {
    const oh = g.access.oh
    if (new Date(`${oh.data_evento}T${oh.ora_fine}`) < new Date(Date.now() - 2 * 3600 * 1000)) return bad('Questo Open House è già concluso.')
    const r = await sendPresentation(id)
    if (r.error) return bad(r.error)
    return NextResponse.json({ ...(await load(id)), ok: `Inviata a ${r.sent} client${r.sent === 1 ? 'e' : 'i'}${r.failed.length ? ` · non riuscite: ${r.failed.join(', ')}` : ''}` })
  }

  if (body.action === 'prova') {
    // anteprima a sé stessi, con i link salvati
    const s = await load(id)
    if (!s.video_casa_url) return bad('Salva prima il link del video della casa.')
    const oh = g.access.oh
    const me = g.agent
    const { data: a } = await supabase.from('gre_agents').select('id, nome, cognome, email, qualifica').eq('id', me.id).maybeSingle()
    if (!a?.email) return bad('Email non trovata')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mail = presentationEmail({ client: { nome: a.nome, cognome: a.cognome }, agent: a, property: oh.gre_properties as any, dataEvento: oh.data_evento, ora: oh.ora_inizio, videoCasa: s.video_casa_url, videoProposta: s.video_proposta_url || null })
    try {
      await sendAsAgent(a.email, { ...mail, subject: `[Prova] ${mail.subject}` }, a.id)
    } catch {
      return bad('Email di prova non inviata, riprova')
    }
    return NextResponse.json({ ...s, ok: `Email di prova inviata a ${a.email}` })
  }

  return bad('Azione non valida')
}
