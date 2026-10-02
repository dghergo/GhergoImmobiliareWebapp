'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAgent, isAdmin } from '@/lib/auth'
import DashboardHeader from '@/components/DashboardHeader'
import DashboardNav from '@/components/DashboardNav'
import { niceText } from '@/lib/text'
import Photo from '@/components/public/Photo'

interface UpcomingOpenHouse {
  id: string
  data_evento: string
  ora_inizio: string
  ora_fine: string
  property: {
    titolo: string
    zona: string
    prezzo: number | null
    tipologia: string
    immagini: string[] | null
  }
  agent: { nome: string; cognome: string; email: string }
}

const formatPrice = (n: number | null) =>
  n ? n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : ''

export default function ProssimiOpenHouse() {
  const { agent, loading, signOut } = useAuth()
  const router = useRouter()
  const [openHouses, setOpenHouses] = useState<UpcomingOpenHouse[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const admin = agent ? isAdmin(agent) : false

  useEffect(() => {
    if (!loading && (!agent || (!isAgent(agent) && !isAdmin(agent)))) {
      router.push('/dashboard/login')
    }
  }, [agent, loading, router])

  useEffect(() => {
    if (!agent) return
    ;(async () => {
      try {
        // Stessi dati della homepage pubblica: nessun dato dei clienti
        const res = await fetch('/api/public/open-houses', { cache: 'no-store' })
        const data = res.ok ? await res.json() : { openHouses: [] }
        const now = new Date()
        const upcoming = (data.openHouses as UpcomingOpenHouse[])
          .filter(oh => new Date(`${oh.data_evento}T${oh.ora_fine}`) >= now)
          .sort((a, b) => `${a.data_evento}${a.ora_inizio}`.localeCompare(`${b.data_evento}${b.ora_inizio}`))
        setOpenHouses(upcoming)
      } catch (e) {
        console.error('Errore caricamento prossimi open house:', e)
      } finally {
        setLoadingData(false)
      }
    })()
  }, [agent])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return openHouses
    return openHouses.filter(oh =>
      `${oh.property.titolo} ${niceText(oh.property.zona)} ${oh.agent.nome} ${oh.agent.cognome}`.toLowerCase().includes(q)
    )
  }, [openHouses, search])

  // Il link contiene il codice dell'agente che lo invia: il cliente lo troverà già selezionato
  const linkFor = (id: string) => `${window.location.origin}/oh/${id}?ref=${agent?.id ?? ''}`

  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  const inviteText = (oh: UpcomingOpenHouse) =>
    `Ciao! Ti invito all'Open House "${niceText(oh.property.titolo)}" (${niceText(oh.property.zona)}) ` +
    `${formatDate(oh.data_evento)} dalle ${oh.ora_inizio.slice(0, 5)} alle ${oh.ora_fine.slice(0, 5)}. ` +
    `Puoi prenotare il tuo orario qui: ${linkFor(oh.id)}`

  const copyLink = async (oh: UpcomingOpenHouse) => {
    try {
      await navigator.clipboard.writeText(linkFor(oh.id))
      setCopiedId(oh.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      window.prompt('Copia il link:', linkFor(oh.id))
    }
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
        { label: 'OPEN HOUSE', href: '/dashboard/open-houses' },
        { label: 'PRENOTAZIONI', href: '/dashboard/bookings' },
        { label: 'REPORT', href: '/dashboard/reports' },
      ]
    : [
        { label: 'DASHBOARD', href: '/dashboard' },
        { label: 'I MIEI IMMOBILI', href: '/dashboard/properties' },
        { label: 'OPEN HOUSE', href: '/dashboard/open-houses' },
        { label: 'PRENOTAZIONI', href: '/dashboard/bookings' },
        { label: 'REPORT', href: '/dashboard/reports' },
      ]

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
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--primary-blue)' }}>
              Prossimi Open House ({visible.length})
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-gray)' }}>
              Tutti gli eventi in programma dell&apos;agenzia. Invia il link ai tuoi clienti per farli prenotare.
            </p>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca immobile, zona o agente..."
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 md:w-72"
          />
        </div>

        {loadingData ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center" style={{ color: 'var(--text-gray)' }}>
            Nessun Open House in programma.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map(oh => (
              <div key={oh.id} className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
                {oh.property.immagini?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <Photo src={oh.property.immagini[0]} width={700} alt="" className="w-full h-40 object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-40" style={{ background: 'var(--light-gray)' }} />
                )}
                <div className="p-4 flex-1 flex flex-col">
                  <div className="text-xs font-semibold tracking-wide mb-1 capitalize" style={{ color: 'var(--accent-blue)' }}>
                    {formatDate(oh.data_evento)} · {oh.ora_inizio.slice(0, 5)}–{oh.ora_fine.slice(0, 5)}
                  </div>
                  <h2 className="font-semibold text-lg leading-snug" style={{ color: 'var(--primary-blue)' }}>
                    {niceText(oh.property.titolo)}
                  </h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-gray)' }}>
                    📍 {niceText(oh.property.zona)}
                    {oh.property.prezzo ? ` · ${formatPrice(oh.property.prezzo)}` : ''}
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-gray)' }}>
                    Agente: {oh.agent.nome} {oh.agent.cognome}
                  </p>

                  <div className="mt-4 pt-3 border-t flex flex-wrap gap-2">
                    <button onClick={() => copyLink(oh)} className="btn-primary px-3 py-2 text-sm flex-1 min-w-[120px]">
                      {copiedId === oh.id ? '✓ Link copiato' : 'Copia link'}
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(inviteText(oh))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 text-sm rounded bg-green-100 text-green-700 hover:bg-green-200 text-center flex-1 min-w-[120px]"
                    >
                      Invia su WhatsApp
                    </a>
                    <a
                      href={`/oh/${oh.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200 text-center"
                    >
                      Apri
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
