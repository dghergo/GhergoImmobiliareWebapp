import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'
import { openHouseAccess } from '@/lib/oh-access'
import { presentationEmail, sendAsAgent } from '@/lib/feedback-emails'
import { sendPresentation, URL_RE, videoPropostaStandard } from '@/lib/presentazione'

export const maxDuration = 300

// "Prepara la tua visita": facoltativa per ogni Open House. La gestisce chi organizza (e l'admin).
async function load(id: string, admin = false) {
  const supabase = getSupabaseAdmin()
  const [{ data: oh }, { data: bookings }, proposta] = await Promise.all([
    supabase.from('gre_open_houses').select('presentazione_attiva, video_casa_url').eq('id', id).maybeSingle(),
    supabase.from('gre_bookings').select('presentazione_inviata_at').eq('open_house_id', id).eq('status', 'confirmed'),
    videoPropostaStandard(),
  ])
  const all = bookings || []
  return {
    attiva: !!oh?.presentazione_attiva,
    video_casa_url: oh?.video_casa_url || '',
    // il video della proposta è lo standard dell'agenzia: arriva in automatico, lo cambia solo l'admin
    video_proposta_url: proposta || '',
    puo_cambiare_proposta: admin,
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
  return NextResponse.json(await load(id, g.agent.role === 'admin'), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard(request, id)
  if (g.error) return g.error
  const body = await request.json().catch(() => ({}))
  const supabase = getSupabaseAdmin()
  const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })
  const link = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 1000) : '')

  const admin = g.agent.role === 'admin'

  if (body.action === 'salva') {
    const casa = link(body.video_casa_url)
    if (casa && !URL_RE.test(casa)) return bad('Il link del video della casa deve iniziare con https://')
    if (body.attiva && !casa) return bad('Per attivare la presentazione serve il link del video della casa.')
    const { error } = await supabase.from('gre_open_houses').update({ presentazione_attiva: !!body.attiva, video_casa_url: casa || null }).eq('id', id)
    if (error) return bad('Non salvato, riprova')
    return NextResponse.json({ ...(await load(id, admin)), ok: 'Salvato' })
  }

  if (body.action === 'video_proposta') {
    // video standard per tutti gli Open House: solo l'admin
    if (!admin) return NextResponse.json({ error: 'Il video della proposta è quello standard dell\'agenzia: lo cambia solo l\'amministratore.' }, { status: 403 })
    const url = link(body.video_proposta_url)
    if (!URL_RE.test(url)) return bad('Il link deve iniziare con https://')
    const { error } = await supabase.from('gre_settings').upsert({ key: 'video_proposta_url', value: url, updated_at: new Date().toISOString() })
    if (error) return bad('Non salvato, riprova')
    return NextResponse.json({ ...(await load(id, admin)), ok: 'Video standard della proposta aggiornato per tutti gli Open House' })
  }

  if (body.action === 'invia') {
    const oh = g.access.oh
    if (new Date(`${oh.data_evento}T${oh.ora_fine}`) < new Date(Date.now() - 2 * 3600 * 1000)) return bad('Questo Open House è già concluso.')
    const r = await sendPresentation(id)
    if (r.error) return bad(r.error)
    return NextResponse.json({ ...(await load(id, admin)), ok: `Inviata a ${r.sent} client${r.sent === 1 ? 'e' : 'i'}${r.failed.length ? ` · non riuscite: ${r.failed.join(', ')}` : ''}` })
  }

  if (body.action === 'prova') {
    // anteprima a sé stessi, con i link salvati
    const s = await load(id, admin)
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
