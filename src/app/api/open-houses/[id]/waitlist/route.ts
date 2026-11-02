import { NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff, type StaffAgent } from '@/lib/server-auth'
import { followsClient, isTeamClient, openHouseAccess, type OhRole, type Team } from '@/lib/oh-access'

// Sold Out e lista d'attesa di un Open House.
// Chiudere/riaprire le prenotazioni: organizzatori e admin.
// Lista d'attesa: stessa regola dei clienti prenotati (il cliente è di chi lo porta).

async function load(id: string, agent: StaffAgent, role: OhRole, team: Team) {
  const supabase = getSupabaseAdmin()
  const [{ data: oh }, { data: rows }, { count: prenotati }] = await Promise.all([
    supabase.from('gre_open_houses').select('sold_out, created_at, gre_properties (titolo, zona, immagini)').eq('id', id).maybeSingle(),
    supabase
      .from('gre_waitlist')
      .select('id, nome, cognome, email, telefono, messaggio, agente_referente_id, created_at, contattato_at, referente:gre_agents!gre_waitlist_agente_referente_id_fkey (nome, cognome)')
      .eq('open_house_id', id)
      .order('created_at'),
    supabase.from('gre_bookings').select('id', { count: 'exact', head: true }).eq('open_house_id', id).in('status', ['confirmed', 'completed']),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lista = (rows || []).flatMap((r: any) => {
    const mine = followsClient(r, team, agent, role)
    if (role === 'collega' && !mine) return []
    const ref = r.referente && !isTeamClient(r, team) ? r.referente : null
    return [{
      id: r.id,
      nome: r.nome,
      cognome: r.cognome,
      email: mine ? r.email : '',
      telefono: mine ? r.telefono : '',
      messaggio: mine ? r.messaggio : null,
      mine,
      portato_da: ref ? `${ref.nome} ${ref.cognome}` : null,
      created_at: r.created_at,
      contattato_at: r.contattato_at,
    }]
  })
  // dati per la storia Sold Out: visite prenotate e giorni dalla pubblicazione
  const prop = (oh?.gre_properties || {}) as unknown as { titolo?: string; zona?: string; immagini?: string[] | null }
  const giorni = oh?.created_at ? Math.floor((Date.now() - new Date(oh.created_at).getTime()) / 86400000) : null
  const storia = { titolo: prop.titolo || '', zona: prop.zona || '', immagini: prop.immagini || [], prenotati: prenotati || 0, giorni }
  return { sold_out: !!oh?.sold_out, puo_gestire: role !== 'collega', lista, storia, io: { nome: agent.nome, qualifica: agent.qualifica === 'assistente' ? 'assistente' : 'agente' } }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })
  return NextResponse.json(await load(id, auth.agent, access.role, access.team), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request)
  if (auth.error) return auth.error
  const { id } = await params
  const access = await openHouseAccess(id, auth.agent)
  if (!access) return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })
  const { role, team } = access
  const body = await request.json().catch(() => ({}))
  const supabase = getSupabaseAdmin()
  const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

  switch (body.action) {
    case 'sold_out': {
      if (role === 'collega') return bad('Il Sold Out lo gestisce chi organizza l\'Open House', 403)
      const { error } = await supabase.from('gre_open_houses').update({ sold_out: !!body.on }).eq('id', id)
      if (error) return bad('Non salvato')
      break
    }
    case 'contattato': {
      if (typeof body.waitId !== 'string') return bad('Contatto non trovato')
      const { data: r } = await supabase.from('gre_waitlist').select('id, agente_referente_id').eq('id', body.waitId).eq('open_house_id', id).maybeSingle()
      if (!r) return bad('Contatto non trovato')
      if (!followsClient(r, team, auth.agent, role)) return bad('Questo contatto lo segue un collega', 403)
      await supabase.from('gre_waitlist')
        .update(body.on ? { contattato_at: new Date().toISOString(), contattato_da: auth.agent.id } : { contattato_at: null, contattato_da: null })
        .eq('id', r.id)
      break
    }
    default:
      return bad('Azione non valida')
  }
  return NextResponse.json(await load(id, auth.agent, role, team))
}
