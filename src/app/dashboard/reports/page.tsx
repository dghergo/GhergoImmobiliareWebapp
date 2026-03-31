'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAgent, isAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'
import DashboardNav from '@/components/DashboardNav'

interface FeedbackEntry {
  id: string
  booking_id: string
  commenti: string
  vuole_fare_offerta: boolean
  created_at: string
  gre_bookings: {
    id: string
    agent_id: string
    gre_clients: {
      id: string
      nome: string
      cognome: string
      email: string
      telefono: string
    }
    gre_open_houses: {
      id: string
      data_evento: string
      gre_properties: {
        id: string
        titolo: string
        zona: string
      }
    }
    gre_agents?: {
      nome: string
      cognome: string
    }
  }
}

interface OpenHouseOption {
  id: string
  data_evento: string
  gre_properties: {
    titolo: string
  }
}

interface AgentOption {
  id: string
  nome: string
  cognome: string
}

export default function ReportsPage() {
  const { user, agent, loading, signOut } = useAuth()
  const router = useRouter()
  const [feedbacks, setFeedbacks] = useState<FeedbackEntry[]>([])
  const [openHouses, setOpenHouses] = useState<OpenHouseOption[]>([])
  const [loadingData, setLoadingData] = useState(true)

  // Filtri
  const [filterOpenHouse, setFilterOpenHouse] = useState<string>('all')
  const [filterInteresse, setFilterInteresse] = useState<string>('all')
  const [filterAgentId, setFilterAgentId] = useState<string>('all')
  const [agents, setAgents] = useState<AgentOption[]>([])

  // Statistiche
  const [stats, setStats] = useState({
    totalFeedback: 0,
    interessatiAcquisto: 0,
    tassoRisposta: 0
  })

  const admin = agent ? isAdmin(agent) : false

  useEffect(() => {
    if (!loading && (!agent || (!isAgent(agent) && !isAdmin(agent)))) {
      router.push('/dashboard/login')
    }
  }, [agent, loading, router])

  useEffect(() => {
    if (agent) {
      loadData()
      if (admin) {
        loadAgents()
      }
    }
  }, [agent])

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('gre_agents')
        .select('id, nome, cognome')
        .eq('is_active', true)
        .order('cognome')

      if (error) throw error
      setAgents(data || [])
    } catch (error) {
      console.error('Error loading agents:', error)
    }
  }

  const loadData = async () => {
    if (!agent) return

    try {
      // Carica open houses per il filtro
      let ohQuery = supabase
        .from('gre_open_houses')
        .select('id, data_evento, gre_properties (titolo)')
        .order('data_evento', { ascending: false })

      if (!admin) {
        ohQuery = ohQuery.eq('agent_id', agent.id)
      }

      const { data: ohData } = await ohQuery

      setOpenHouses((ohData || []).map((oh: any) => ({
        ...oh,
        gre_properties: oh.gre_properties
      })) as OpenHouseOption[])

      // Carica feedback
      let feedbackQuery = supabase
        .from('gre_feedback_responses')
        .select(`
          id,
          booking_id,
          commenti,
          vuole_fare_offerta,
          created_at,
          gre_bookings!inner (
            id,
            agent_id,
            gre_clients (id, nome, cognome, email, telefono),
            gre_open_houses (
              id,
              data_evento,
              gre_properties (id, titolo, zona)
            ),
            gre_agents (nome, cognome)
          )
        `)
        .order('created_at', { ascending: false })

      if (!admin) {
        feedbackQuery = feedbackQuery.eq('gre_bookings.agent_id', agent.id)
      }

      const { data: feedbackData, error: feedbackError } = await feedbackQuery

      if (feedbackError) {
        console.error('Error loading feedbacks:', feedbackError)
        setFeedbacks([])
      } else {
        setFeedbacks((feedbackData || []) as unknown as FeedbackEntry[])
      }

      // Calcola statistiche
      const totalFeedback = feedbackData?.length || 0
      const interessati = feedbackData?.filter(f => f.vuole_fare_offerta).length || 0

      // Conta totale bookings per tasso risposta
      let bookingsCountQuery = supabase
        .from('gre_bookings')
        .select('*', { count: 'exact', head: true })
        .in('status', ['confirmed', 'completed'])

      if (!admin) {
        bookingsCountQuery = bookingsCountQuery.eq('agent_id', agent.id)
      }

      const { count: totalBookings } = await bookingsCountQuery

      setStats({
        totalFeedback,
        interessatiAcquisto: interessati,
        tassoRisposta: totalBookings ? Math.round((totalFeedback / totalBookings) * 100) : 0
      })

    } catch (error) {
      console.error('Error loading report data:', error)
    } finally {
      setLoadingData(false)
    }
  }

  // Filtra feedback
  const filteredFeedbacks = feedbacks.filter(f => {
    if (filterOpenHouse !== 'all' && f.gre_bookings.gre_open_houses.id !== filterOpenHouse) return false
    if (filterInteresse === 'yes' && !f.vuole_fare_offerta) return false
    if (filterInteresse === 'no' && f.vuole_fare_offerta) return false
    if (admin && filterAgentId !== 'all' && f.gre_bookings.agent_id !== filterAgentId) return false
    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
      </div>
    )
  }

  if (!agent || (!isAgent(agent) && !isAdmin(agent))) {
    return null
  }

  const navItems = admin
    ? [
        { label: 'ADMIN DASHBOARD', href: '/admin/dashboard' },
        { label: 'GESTIONE AGENTI', href: '/admin/agents' },
        { label: 'TUTTI GLI IMMOBILI', href: '/dashboard/properties' },
        { label: 'OPEN HOUSE', href: '/dashboard/open-houses' },
        { label: 'PRENOTAZIONI', href: '/dashboard/bookings' },
        { label: 'REPORT', href: '/dashboard/reports', active: true },
      ]
    : [
        { label: 'DASHBOARD', href: '/dashboard' },
        { label: 'I MIEI IMMOBILI', href: '/dashboard/properties' },
        { label: 'OPEN HOUSE', href: '/dashboard/open-houses' },
        { label: 'PRENOTAZIONI', href: '/dashboard/bookings' },
        { label: 'REPORT', href: '/dashboard/reports', active: true },
      ]

  return (
    <div className="min-h-screen">
      <DashboardHeader agentName={`${agent.nome} ${agent.cognome}`}>
        {admin && (
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="btn-secondary text-sm px-3 md:px-4 py-2"
          >
            Admin
          </button>
        )}
        <button
          onClick={signOut}
          className="btn-primary text-sm px-3 md:px-4 py-2"
        >
          Logout
        </button>
      </DashboardHeader>

      <DashboardNav items={navItems} />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4 md:py-8">
        <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-dark)' }}>
          {admin ? 'Report Feedback Globale' : 'Report Feedback'}
        </h2>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-gray)' }}>
              Feedback Ricevuti
            </h3>
            <p className="text-3xl font-bold" style={{ color: 'var(--primary-blue)' }}>
              {stats.totalFeedback}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-gray)' }}>
              Interessati all&apos;Acquisto
            </h3>
            <p className="text-3xl font-bold" style={{ color: '#16a34a' }}>
              {stats.interessatiAcquisto}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-gray)' }}>
              Tasso di Risposta
            </h3>
            <p className="text-3xl font-bold" style={{ color: 'var(--accent-blue)' }}>
              {stats.tassoRisposta}%
            </p>
          </div>
        </div>

        {/* Filtri */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Agent Filter (admin only) */}
            {admin && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-gray)' }}>
                  Agente
                </label>
                <select
                  value={filterAgentId}
                  onChange={(e) => setFilterAgentId(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Tutti gli agenti</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.nome} {a.cognome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-gray)' }}>
                Open House
              </label>
              <select
                value={filterOpenHouse}
                onChange={(e) => setFilterOpenHouse(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tutti gli Open House</option>
                {openHouses.map(oh => (
                  <option key={oh.id} value={oh.id}>
                    {oh.gre_properties.titolo} - {new Date(oh.data_evento).toLocaleDateString('it-IT')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-gray)' }}>
                Interesse Acquisto
              </label>
              <select
                value={filterInteresse}
                onChange={(e) => setFilterInteresse(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tutti</option>
                <option value="yes">Interessati</option>
                <option value="no">Non interessati</option>
              </select>
            </div>
          </div>
        </div>

        {/* Feedback List */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {loadingData ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: 'var(--accent-blue)' }}></div>
              <p className="mt-2" style={{ color: 'var(--text-gray)' }}>Caricamento report...</p>
            </div>
          ) : filteredFeedbacks.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--text-gray)' }}>
              <h3 className="text-lg font-medium mb-2">Nessun feedback disponibile</h3>
              <p>I feedback dei clienti appariranno qui dopo le visite.</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredFeedbacks.map((feedback) => {
                const client = feedback.gre_bookings.gre_clients
                const oh = feedback.gre_bookings.gre_open_houses
                const property = oh.gre_properties
                const feedbackAgent = feedback.gre_bookings.gre_agents

                return (
                  <div key={feedback.id} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold" style={{ color: 'var(--text-dark)' }}>
                            {client.nome} {client.cognome}
                          </span>
                          {feedback.vuole_fare_offerta && (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              INTERESSATO ALL&apos;ACQUISTO
                            </span>
                          )}
                          {/* Agent Badge (admin only) */}
                          {admin && feedbackAgent && (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                              👤 {feedbackAgent.nome} {feedbackAgent.cognome}
                            </span>
                          )}
                        </div>
                        <p className="text-sm" style={{ color: 'var(--text-gray)' }}>
                          {property.titolo} - {property.zona}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-gray)' }}>
                          Visita del {new Date(oh.data_evento).toLocaleDateString('it-IT')}
                        </p>
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-gray)' }}>
                        {new Date(feedback.created_at).toLocaleDateString('it-IT')}
                      </span>
                    </div>

                    {feedback.commenti && (
                      <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm italic" style={{ color: 'var(--text-dark)' }}>
                          &ldquo;{feedback.commenti}&rdquo;
                        </p>
                      </div>
                    )}

                    <div className="mt-2 flex gap-4 text-xs" style={{ color: 'var(--text-gray)' }}>
                      <span>Email: {client.email}</span>
                      {client.telefono && <span>Tel: {client.telefono}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
