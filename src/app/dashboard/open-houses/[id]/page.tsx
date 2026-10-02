'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAgent, isAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'
import DashboardNav from '@/components/DashboardNav'
import FeedbackPanel from '@/components/dashboard/FeedbackPanel'

interface Questionnaire {
  vendita_immobile?: string
  necessita_mutuo?: string
  stato_mutuo?: string
  tempistiche_acquisto?: string
  corrispondenza_immobile?: string
}

interface OpenHouseDetail {
  id: string
  agent_id: string
  data_evento: string
  ora_inizio: string
  ora_fine: string
  is_active: boolean
  gre_properties: {
    id: string
    titolo: string
    zona: string
    indirizzo: string | null
    prezzo: number | null
  }
  gre_agents?: { nome: string; cognome: string } | null
}

interface BookingRow {
  id: string
  status: 'confirmed' | 'completed' | 'no_show'
  cancellation_reason: string | null
  questionnaire_completed: boolean
  client: { nome: string; cognome: string; email: string; telefono: string }
  slot: { ora_inizio: string; ora_fine: string } | null
  q: Questionnaire | null
}

type Category =
  | 'tutte'
  | 'senza_mutuo'
  | 'mutuo_banca'
  | 'mutuo_da_sentire'
  | 'deve_vendere'
  | 'senza_questionario'
  | 'presentati'
  | 'non_presentati'
  | 'cancellate'

// --- Regole di classificazione (basate sulle risposte del questionario) ---
const isCancelled = (b: BookingRow) => b.status === 'no_show' && b.cancellation_reason === 'cancelled_by_agent'
const isSenzaMutuo = (b: BookingRow) => b.q?.necessita_mutuo === 'no'
const isMutuoBanca = (b: BookingRow) =>
  !!b.q?.necessita_mutuo && b.q.necessita_mutuo !== 'no' &&
  (b.q.stato_mutuo === 'pre_delibera' || b.q.stato_mutuo === 'simulazione')
const isMutuoDaSentire = (b: BookingRow) =>
  !!b.q?.necessita_mutuo && b.q.necessita_mutuo !== 'no' && !isMutuoBanca(b)
const isDeveVendere = (b: BookingRow) => !!b.q?.vendita_immobile?.startsWith('si')
const hasNoQuestionario = (b: BookingRow) => !b.q

const LABELS: Record<string, Record<string, string>> = {
  vendita_immobile: {
    no: 'Non deve vendere',
    si_in_vendita: 'Deve vendere – già in vendita',
    si_non_in_vendita: 'Deve vendere – non ancora in vendita',
    si_posso_acquistare_prima: 'Deve vendere – può comprare prima',
  },
  necessita_mutuo: {
    no: 'Senza mutuo',
    si_parziale: 'Mutuo fino all’80%',
    si_maggior_parte: 'Mutuo oltre l’80%',
  },
  stato_mutuo: {
    pre_delibera: 'Ha la pre-delibera',
    simulazione: 'Ha fatto la simulazione',
    appuntamento: 'Appuntamento in banca fissato',
    non_informato: 'Non si è ancora informato',
    ricontatto_consulente: 'Vuole un consulente mutui',
    non_richiedo: '',
  },
  tempistiche_acquisto: {
    entro_30_giorni: 'Compra entro 30 giorni',
    entro_3_mesi: 'Compra entro 3 mesi',
    entro_6_mesi: 'Compra entro 6 mesi',
    oltre_6_mesi: 'Compra oltre 6 mesi',
    solo_valutando: 'Sta solo valutando',
  },
}

const formatWhatsAppNumber = (phone: string): string => {
  let cleaned = phone.replace(/\D/g, '')
  if (!cleaned.startsWith('39')) cleaned = '39' + cleaned
  return cleaned
}

export default function OpenHouseCruscotto() {
  const { agent, loading, signOut } = useAuth()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const openHouseId = params?.id

  const [openHouse, setOpenHouse] = useState<OpenHouseDetail | null>(null)
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [category, setCategory] = useState<Category>('tutte')

  const admin = agent ? isAdmin(agent) : false

  useEffect(() => {
    if (!loading && (!agent || (!isAgent(agent) && !isAdmin(agent)))) {
      router.push('/dashboard/login')
    }
  }, [agent, loading, router])

  useEffect(() => {
    if (agent && openHouseId) loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, openHouseId])

  const loadData = async () => {
    if (!agent || !openHouseId) return
    setLoadingData(true)
    try {
      let ohQuery = supabase
        .from('gre_open_houses')
        .select(`
          id, agent_id, data_evento, ora_inizio, ora_fine, is_active,
          gre_properties (id, titolo, zona, indirizzo, prezzo),
          gre_agents (nome, cognome)
        `)
        .eq('id', openHouseId)

      if (!admin) ohQuery = ohQuery.eq('agent_id', agent.id)

      const { data: ohData, error: ohError } = await ohQuery.maybeSingle()
      if (ohError) throw ohError
      if (!ohData) {
        setNotFound(true)
        return
      }
      setOpenHouse(ohData as unknown as OpenHouseDetail)

      const { data: bData, error: bError } = await supabase
        .from('gre_bookings')
        .select(`
          id, status, cancellation_reason, questionnaire_completed,
          gre_clients!inner (nome, cognome, email, telefono),
          gre_time_slots (ora_inizio, ora_fine),
          gre_prequalification_responses (response_data)
        `)
        .eq('open_house_id', openHouseId)

      if (bError) throw bError

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: BookingRow[] = (bData || []).map((b: any) => ({
        id: b.id,
        status: b.status,
        cancellation_reason: b.cancellation_reason,
        questionnaire_completed: b.questionnaire_completed,
        client: b.gre_clients,
        slot: b.gre_time_slots || null,
        q: b.gre_prequalification_responses?.[0]?.response_data || null,
      }))

      rows.sort((a, b) => (a.slot?.ora_inizio || '').localeCompare(b.slot?.ora_inizio || ''))
      setBookings(rows)
    } catch (error) {
      console.error('Errore caricamento cruscotto:', error)
    } finally {
      setLoadingData(false)
    }
  }

  // Le statistiche contano solo le prenotazioni non cancellate
  const attive = useMemo(() => bookings.filter(b => !isCancelled(b)), [bookings])

  const stats = useMemo(() => ({
    tutte: attive.length,
    senza_mutuo: attive.filter(isSenzaMutuo).length,
    mutuo_banca: attive.filter(isMutuoBanca).length,
    mutuo_da_sentire: attive.filter(isMutuoDaSentire).length,
    deve_vendere: attive.filter(isDeveVendere).length,
    senza_questionario: attive.filter(hasNoQuestionario).length,
    presentati: attive.filter(b => b.status === 'completed').length,
    non_presentati: attive.filter(b => b.status === 'no_show').length,
    cancellate: bookings.filter(isCancelled).length,
    pre_delibera: attive.filter(b => isMutuoBanca(b) && b.q?.stato_mutuo === 'pre_delibera').length,
    simulazione: attive.filter(b => isMutuoBanca(b) && b.q?.stato_mutuo === 'simulazione').length,
    vende_in_vendita: attive.filter(b => b.q?.vendita_immobile === 'si_in_vendita').length,
    vende_non_in_vendita: attive.filter(b => b.q?.vendita_immobile === 'si_non_in_vendita').length,
    vende_compra_prima: attive.filter(b => b.q?.vendita_immobile === 'si_posso_acquistare_prima').length,
  }), [attive, bookings])

  const visibleBookings = useMemo(() => {
    switch (category) {
      case 'senza_mutuo': return attive.filter(isSenzaMutuo)
      case 'mutuo_banca': return attive.filter(isMutuoBanca)
      case 'mutuo_da_sentire': return attive.filter(isMutuoDaSentire)
      case 'deve_vendere': return attive.filter(isDeveVendere)
      case 'senza_questionario': return attive.filter(hasNoQuestionario)
      case 'presentati': return attive.filter(b => b.status === 'completed')
      case 'non_presentati': return attive.filter(b => b.status === 'no_show')
      case 'cancellate': return bookings.filter(isCancelled)
      default: return attive
    }
  }, [category, attive, bookings])

  const pct = (n: number) => (stats.tutte > 0 ? Math.round((n / stats.tutte) * 100) : 0)

  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const t = (s?: string | null) => (s ? s.slice(0, 5) : '')

  const statusBadge = (b: BookingRow) => {
    if (isCancelled(b)) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">Cancellata</span>
    if (b.status === 'completed') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Presentato</span>
    if (b.status === 'no_show') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">Non presentato</span>
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Confermata</span>
  }

  const tags = (b: BookingRow) => {
    if (!b.q) return [{ text: 'Questionario non compilato', cls: 'bg-gray-100 text-gray-600' }]
    const out: { text: string; cls: string }[] = []
    if (isSenzaMutuo(b)) out.push({ text: 'Senza mutuo', cls: 'bg-green-100 text-green-800' })
    else {
      const m = LABELS.necessita_mutuo[b.q.necessita_mutuo || '']
      if (m) out.push({ text: m, cls: 'bg-sky-100 text-sky-800' })
      const s = LABELS.stato_mutuo[b.q.stato_mutuo || '']
      if (s) out.push({ text: s, cls: isMutuoBanca(b) ? 'bg-sky-100 text-sky-800' : 'bg-yellow-100 text-yellow-800' })
    }
    if (isDeveVendere(b)) out.push({ text: LABELS.vendita_immobile[b.q.vendita_immobile || ''] || 'Deve vendere', cls: 'bg-orange-100 text-orange-800' })
    const tm = LABELS.tempistiche_acquisto[b.q.tempistiche_acquisto || '']
    if (tm) out.push({ text: tm, cls: 'bg-purple-100 text-purple-800' })
    return out
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
      </div>
    )
  }

  if (!agent || (!isAgent(agent) && !isAdmin(agent))) return null

  const navItems = admin
    ? [
        { label: 'ADMIN DASHBOARD', href: '/admin/dashboard' },
        { label: 'GESTIONE AGENTI', href: '/admin/agents' },
        { label: 'TUTTI GLI IMMOBILI', href: '/dashboard/properties' },
        { label: 'OPEN HOUSE', href: '/dashboard/open-houses', active: true },
        { label: 'PRENOTAZIONI', href: '/dashboard/bookings' },
        { label: 'REPORT', href: '/dashboard/reports' },
      ]
    : [
        { label: 'DASHBOARD', href: '/dashboard' },
        { label: 'I MIEI IMMOBILI', href: '/dashboard/properties' },
        { label: 'OPEN HOUSE', href: '/dashboard/open-houses', active: true },
        { label: 'PRENOTAZIONI', href: '/dashboard/bookings' },
        { label: 'REPORT', href: '/dashboard/reports' },
      ]

  const MainCard = ({ cat, title, value, color, children }: { cat: Category; title: string; value: number; color: string; children?: React.ReactNode }) => (
    <button
      onClick={() => setCategory(category === cat ? 'tutte' : cat)}
      className={`text-left bg-white rounded-lg shadow-md p-4 md:p-5 border-t-4 transition hover:shadow-lg ${category === cat ? 'ring-2 ring-offset-2' : ''}`}
      style={{ borderTopColor: color, ...(category === cat ? { ['--tw-ring-color' as string]: color } : {}) }}
    >
      <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-gray)' }}>{title}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold" style={{ color }}>{value}</span>
        {cat !== 'tutte' && stats.tutte > 0 && (
          <span className="text-sm" style={{ color: 'var(--text-gray)' }}>{pct(value)}%</span>
        )}
      </div>
      {children && <div className="mt-2 text-xs space-y-0.5" style={{ color: 'var(--text-gray)' }}>{children}</div>}
    </button>
  )

  const SmallStat = ({ cat, label, value }: { cat: Category; label: string; value: number }) => (
    <button
      onClick={() => setCategory(category === cat ? 'tutte' : cat)}
      className={`flex items-center justify-between gap-3 bg-white rounded-lg shadow-sm px-4 py-2 text-sm hover:shadow ${category === cat ? 'ring-2 ring-blue-400' : ''}`}
    >
      <span style={{ color: 'var(--text-gray)' }}>{label}</span>
      <span className="font-bold" style={{ color: 'var(--text-dark)' }}>{value}</span>
    </button>
  )

  const categoryTitle: Record<Category, string> = {
    tutte: 'Tutti i clienti prenotati',
    senza_mutuo: 'Clienti che comprano senza mutuo',
    mutuo_banca: 'Clienti con mutuo che hanno già sentito la banca',
    mutuo_da_sentire: 'Clienti con mutuo che non hanno ancora sentito la banca',
    deve_vendere: 'Clienti che devono vendere casa',
    senza_questionario: 'Clienti senza questionario compilato',
    presentati: 'Clienti presentati',
    non_presentati: 'Clienti non presentati',
    cancellate: 'Prenotazioni cancellate',
  }

  return (
    <div className="min-h-screen">
      <DashboardHeader agentName={`${agent.nome} ${agent.cognome}`}>
        {admin && (
          <button onClick={() => router.push('/admin/dashboard')} className="btn-secondary text-sm px-3 md:px-4 py-2">
            Admin
          </button>
        )}
        <button onClick={signOut} className="btn-primary text-sm px-3 md:px-4 py-2">Logout</button>
      </DashboardHeader>

      <DashboardNav items={navItems} />

      <main className="container mx-auto px-4 py-4 md:py-8">
        <button
          onClick={() => router.push('/dashboard/open-houses')}
          className="text-sm mb-4 hover:underline"
          style={{ color: 'var(--primary-blue)' }}
        >
          ← Torna agli Open House
        </button>

        {loadingData ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
          </div>
        ) : notFound || !openHouse ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center" style={{ color: 'var(--text-gray)' }}>
            Open House non trovato o non accessibile.
          </div>
        ) : (
          <>
            {/* Intestazione */}
            <div className="bg-white rounded-lg shadow-md p-4 md:p-6 mb-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-wide mb-1" style={{ color: 'var(--accent-blue)' }}>CRUSCOTTO OPEN HOUSE</div>
                  <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--primary-blue)' }}>
                    {openHouse.gre_properties.titolo}
                  </h1>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-gray)' }}>
                    📍 {openHouse.gre_properties.zona}{openHouse.gre_properties.indirizzo ? ` – ${openHouse.gre_properties.indirizzo}` : ''}
                  </p>
                  <p className="text-sm mt-1 capitalize" style={{ color: 'var(--text-dark)' }}>
                    📅 {formatDate(openHouse.data_evento)} · {t(openHouse.ora_inizio)}–{t(openHouse.ora_fine)}
                  </p>
                  {admin && openHouse.gre_agents && (
                    <span className="inline-flex mt-2 items-center px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                      👤 {openHouse.gre_agents.nome} {openHouse.gre_agents.cognome}
                    </span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => router.push(`/dashboard/open-houses/${openHouse.id}/check-in`)}
                    className="btn-primary px-4 py-2 text-sm whitespace-nowrap"
                  >
                    📱 Check-in alla porta
                  </button>
                  <button
                    onClick={() => router.push(`/dashboard/bookings?open_house=${openHouse.id}`)}
                    className="btn-secondary px-4 py-2 text-sm whitespace-nowrap"
                  >
                    Gestisci prenotazioni →
                  </button>
                </div>
              </div>
            </div>

            {/* Card principali */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <MainCard cat="tutte" title="Prenotazioni" value={stats.tutte} color="#203162">
                <div>{stats.presentati} presentati · {stats.non_presentati} non presentati</div>
                {stats.cancellate > 0 && <div>{stats.cancellate} cancellate (escluse)</div>}
              </MainCard>
              <MainCard cat="senza_mutuo" title="Comprano senza mutuo" value={stats.senza_mutuo} color="#16a34a" />
              <MainCard cat="mutuo_banca" title="Mutuo, banca già sentita" value={stats.mutuo_banca} color="#00AEEF">
                <div>{stats.pre_delibera} con pre-delibera</div>
                <div>{stats.simulazione} con simulazione</div>
              </MainCard>
              <MainCard cat="deve_vendere" title="Devono vendere casa" value={stats.deve_vendere} color="#ea580c">
                <div>{stats.vende_in_vendita} già in vendita</div>
                <div>{stats.vende_non_in_vendita} non ancora in vendita</div>
                <div>{stats.vende_compra_prima} possono comprare prima</div>
              </MainCard>
            </div>

            {/* Indicatori secondari */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-6">
              <SmallStat cat="mutuo_da_sentire" label="Mutuo, banca non ancora sentita" value={stats.mutuo_da_sentire} />
              <SmallStat cat="senza_questionario" label="Questionario non compilato" value={stats.senza_questionario} />
              <SmallStat cat="non_presentati" label="Non presentati" value={stats.non_presentati} />
              <SmallStat cat="cancellate" label="Cancellate" value={stats.cancellate} />
            </div>

            <FeedbackPanel
              openHouseId={openHouse.id}
              titolo={openHouse.gre_properties.titolo}
              agentName={openHouse.gre_agents ? `${openHouse.gre_agents.nome} ${openHouse.gre_agents.cognome}` : `${agent.nome} ${agent.cognome}`}
              eventDate={openHouse.data_evento}
              eventEnd={openHouse.ora_fine}
            />

            {/* Elenco clienti */}
            <div className="bg-white rounded-lg shadow-md">
              <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b">
                <h2 className="font-semibold" style={{ color: 'var(--text-dark)' }}>
                  {categoryTitle[category]} ({visibleBookings.length})
                </h2>
                {category !== 'tutte' && (
                  <button onClick={() => setCategory('tutte')} className="text-sm text-red-600 hover:text-red-800">
                    Mostra tutti
                  </button>
                )}
              </div>

              {visibleBookings.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: 'var(--text-gray)' }}>
                  Nessun cliente in questa categoria.
                </div>
              ) : (
                <ul className="divide-y">
                  {visibleBookings.map(b => (
                    <li key={b.id} className="px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                      <div className="w-14 text-sm font-semibold" style={{ color: 'var(--primary-blue)' }}>
                        {t(b.slot?.ora_inizio)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium" style={{ color: 'var(--text-dark)' }}>
                            {b.client.nome} {b.client.cognome}
                          </span>
                          {statusBadge(b)}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {tags(b).map((tg, i) => (
                            <span key={i} className={`px-2 py-0.5 rounded text-xs ${tg.cls}`}>{tg.text}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 text-sm">
                        <a href={`tel:${b.client.telefono}`} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">📞</a>
                        <a
                          href={`https://wa.me/${formatWhatsAppNumber(b.client.telefono)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                          💬
                        </a>
                        <a href={`mailto:${b.client.email}`} className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">📧</a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
