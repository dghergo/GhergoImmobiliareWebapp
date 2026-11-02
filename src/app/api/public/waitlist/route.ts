import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'
import { followerId, loadTeam } from '@/lib/oh-access'
import { sendAsAgent, waitlistAgentEmail, waitlistClientEmail } from '@/lib/feedback-emails'

export const maxDuration = 60

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// Lista d'attesa pubblica: si iscrive chi trova l'Open House in Sold Out.
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const openHouseId = clean(body.openHouseId, 40)
  const nome = clean(body.nome, 80)
  const cognome = clean(body.cognome, 80)
  const email = clean(body.email, 160).toLowerCase()
  const telefono = clean(body.telefono, 30)
  const messaggio = clean(body.messaggio, 1000)
  const ref = clean(body.agente_referente_id, 40)

  if (!UUID_RE.test(openHouseId)) return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  if (!nome || !cognome) return NextResponse.json({ error: 'Inserisci nome e cognome.' }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Inserisci un indirizzo email valido.' }, { status: 400 })
  if (telefono.replace(/\D/g, '').length < 6) return NextResponse.json({ error: 'Inserisci un numero di telefono valido.' }, { status: 400 })
  if (body.privacy_accepted !== true) {
    return NextResponse.json({ error: 'È necessario accettare l\'informativa privacy per procedere.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: oh } = await supabase
    .from('gre_open_houses')
    .select('id, agent_id, co_agent_id, data_evento, sold_out, is_active, gre_properties (titolo, zona, indirizzo)')
    .eq('id', openHouseId)
    .maybeSingle()
  if (!oh || !oh.is_active) return NextResponse.json({ error: 'Questo Open House non è più attivo.' }, { status: 409 })
  if (!oh.sold_out) return NextResponse.json({ error: 'Le prenotazioni sono di nuovo aperte: scegli un orario.', code: 'reopened' }, { status: 409 })

  // l'agente di riferimento vale solo se è un agente abilitato attivo
  let referente: string | null = null
  if (UUID_RE.test(ref)) {
    const { data: a } = await supabase.from('gre_agents').select('id').eq('id', ref).eq('is_active', true).neq('qualifica', 'assistente').maybeSingle()
    referente = a?.id || null
  }

  const { error } = await supabase.from('gre_waitlist').insert({
    open_house_id: openHouseId,
    nome, cognome, email, telefono,
    messaggio: messaggio || null,
    agente_referente_id: referente,
    privacy_consent: true,
    marketing_consent: body.marketing_accepted === true,
  })
  if (error) {
    // già iscritto con la stessa email: per il cliente va bene così
    if (error.code === '23505') return NextResponse.json({ ok: true, gia_iscritto: true })
    console.error('waitlist insert error:', error)
    return NextResponse.json({ error: 'Iscrizione non riuscita. Riprova.' }, { status: 500 })
  }

  // Conferma al cliente e avviso a chi lo segue (stessa regola delle prenotazioni)
  try {
    const team = await loadTeam(oh)
    const segueId = followerId({ agente_referente_id: referente }, team)
    const { data: segue } = segueId
      ? await supabase.from('gre_agents').select('id, nome, cognome, email').eq('id', segueId).maybeSingle()
      : { data: null }
    const property = (oh.gre_properties || { titolo: "" }) as unknown as { titolo: string; zona?: string; indirizzo?: string | null }
    const client = { nome, cognome, email, telefono }
    if (segue) {
      await Promise.all([
        sendAsAgent(email, waitlistClientEmail({ client, agent: segue, property, dataEvento: oh.data_evento }), segue.id),
        sendAsAgent(segue.email, waitlistAgentEmail({ destinatario: segue, client, property, dataEvento: oh.data_evento, messaggio: messaggio || null, openHouseId }), segue.id),
      ])
    }
  } catch (e) {
    console.error('waitlist email error:', e)
  }

  return NextResponse.json({ ok: true })
}
