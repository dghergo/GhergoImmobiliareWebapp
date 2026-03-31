'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAgent, isAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'
import DashboardNav from '@/components/DashboardNav'

interface QuestionnaireResponse {
  vendita_immobile: string
  necessita_mutuo: string
  stato_mutuo: string
  tempistiche_acquisto: string
  corrispondenza_immobile: string
}

interface Booking {
  id: string
  open_house_id: string
  time_slot_id: string
  client_id: string
  agent_id: string
  status: 'confirmed' | 'completed' | 'no_show'
  created_at: string
  cancellation_reason: string | null
  cancelled_at: string | null
  questionnaire_completed: boolean
  confirmation_email_sent: boolean
  brochure_email_sent: boolean
  questionnaire_data?: QuestionnaireResponse | null
  client: {
    id: string
    nome: string
    cognome: string
    email: string
    telefono: string
  }
  time_slot: {
    id: string
    data_slot: string
    ora_inizio: string
    ora_fine: string
  }
  open_house: {
    id: string
    data_evento: string
    ora_inizio: string
    ora_fine: string
    property: {
      titolo: string
      zona: string
    }
  }
  prequalification: {
    vendita_immobile: string
    necessita_mutuo: string
  } | null
  agent_info?: {
    nome: string
    cognome: string
  }
}

interface AgentOption {
  id: string
  nome: string
  cognome: string
}

export default function AgentBookings() {
  const { agent, loading, signOut } = useAuth()
  const router = useRouter()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'completed' | 'no_show' | 'cancelled'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [hoveredBookingId, setHoveredBookingId] = useState<string | null>(null)
  const [filterAgentId, setFilterAgentId] = useState<string>('all')
  const [agents, setAgents] = useState<AgentOption[]>([])

  const admin = agent ? isAdmin(agent) : false

  // Redirect se non è agente
  useEffect(() => {
    if (!loading && (!agent || (!isAgent(agent) && !isAdmin(agent)))) {
      router.push('/dashboard/login')
    }
  }, [agent, loading, router])

  // Carica prenotazioni e agenti
  useEffect(() => {
    if (agent) {
      loadBookings()
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

  const loadBookings = async () => {
    if (!agent) return

    setLoadingData(true)
    try {
      let query = supabase
        .from('gre_bookings')
        .select(`
          id,
          open_house_id,
          time_slot_id,
          client_id,
          agent_id,
          status,
          created_at,
          cancellation_reason,
          cancelled_at,
          questionnaire_completed,
          confirmation_email_sent,
          brochure_email_sent,
          gre_clients!inner (id, nome, cognome, email, telefono),
          gre_time_slots!inner (id, ora_inizio, ora_fine),
          gre_open_houses!inner (
            id, data_evento, ora_inizio, ora_fine,
            gre_properties!inner (titolo, zona)
          ),
          gre_prequalification_responses (response_data),
          gre_agents (nome, cognome)
        `)
        .order('created_at', { ascending: false })

      if (!admin) {
        query = query.eq('agent_id', agent.id)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error loading bookings:', error)
        return
      }

      const transformedData = data.map((booking: any) => ({
        ...booking,
        client: booking.gre_clients,
        time_slot: booking.gre_time_slots,
        open_house: {
          ...booking.gre_open_houses,
          property: booking.gre_open_houses.gre_properties
        },
        questionnaire_data: booking.gre_prequalification_responses?.[0]?.response_data || null,
        agent_info: booking.gre_agents || null
      }))

      setBookings(transformedData)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoadingData(false)
    }
  }

  const getQuestionLabel = (key: string): string => {
    const labels: { [key: string]: string } = {
      vendita_immobile: 'Deve vendere un altro immobile?',
      necessita_mutuo: 'Necessita di mutuo?',
      stato_mutuo: 'Ha già parlato con una banca?',
      tempistiche_acquisto: 'Tempistiche di acquisto',
      corrispondenza_immobile: 'L\'immobile corrisponde alle aspettative?'
    }
    return labels[key] || key
  }

  const updateBookingStatus = async (bookingId: string, newStatus: string) => {
    try {
      let query = supabase
        .from('gre_bookings')
        .update({ status: newStatus })
        .eq('id', bookingId)

      if (!admin) {
        query = query.eq('agent_id', agent!.id)
      }

      const { error } = await query

      if (error) {
        console.error('Error updating booking:', error)
        alert(`Errore durante l'aggiornamento: ${error.message || 'Errore sconosciuto'}`)
        return
      }

      loadBookings()
    } catch (error) {
      console.error('Error:', error)
      alert('Errore durante l\'aggiornamento.')
    }
  }

  const cancelBooking = async (bookingId: string) => {
    if (!confirm('Sei sicuro di voler cancellare questa prenotazione? Lo slot tornerà disponibile.')) {
      return
    }

    try {
      let query = supabase
        .from('gre_bookings')
        .update({
          status: 'no_show',
          cancellation_reason: 'cancelled_by_agent',
          cancelled_at: new Date().toISOString()
        })
        .eq('id', bookingId)

      if (!admin) {
        query = query.eq('agent_id', agent!.id)
      }

      const { error } = await query

      if (error) {
        console.error('Error cancelling booking:', error)
        alert(`Errore durante la cancellazione: ${error.message || 'Errore sconosciuto'}`)
        return
      }

      loadBookings()
    } catch (error) {
      console.error('Error:', error)
      alert('Errore durante la cancellazione.')
    }
  }

  const filteredBookings = bookings.filter(booking => {
    let matchesFilter = false

    if (filter === 'all') {
      matchesFilter = true
    } else if (filter === 'cancelled') {
      matchesFilter = booking.status === 'no_show' && booking.cancellation_reason === 'cancelled_by_agent'
    } else if (filter === 'no_show') {
      matchesFilter = booking.status === 'no_show' && (!booking.cancellation_reason || booking.cancellation_reason !== 'cancelled_by_agent')
    } else {
      matchesFilter = booking.status === filter
    }

    const matchesSearch =
      booking.client.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.client.cognome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.open_house.property.titolo.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesAgent = !admin || filterAgentId === 'all' || booking.agent_id === filterAgentId

    return matchesFilter && matchesSearch && matchesAgent
  })

  const getStatusBadge = (booking: Booking) => {
    const styles = {
      confirmed: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800',
      no_show: 'bg-orange-100 text-orange-800',
      cancelled: 'bg-red-100 text-red-800'
    }

    let status: 'confirmed' | 'completed' | 'no_show' | 'cancelled' = booking.status
    let label = ''

    if (status === 'confirmed') {
      label = 'Confermata'
    } else if (status === 'completed') {
      label = 'Completata'
    } else if (status === 'no_show') {
      if (booking.cancellation_reason === 'cancelled_by_agent') {
        status = 'cancelled'
        label = 'Cancellata'
      } else {
        label = 'Non presentato'
      }
    }

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status as keyof typeof styles]}`}>
        {label}
      </span>
    )
  }

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
        { label: 'PRENOTAZIONI', href: '/dashboard/bookings', active: true },
        { label: 'REPORT', href: '/dashboard/reports' },
      ]
    : [
        { label: 'DASHBOARD', href: '/dashboard' },
        { label: 'I MIEI IMMOBILI', href: '/dashboard/properties' },
        { label: 'OPEN HOUSE', href: '/dashboard/open-houses' },
        { label: 'PRENOTAZIONI', href: '/dashboard/bookings', active: true },
        { label: 'REPORT', href: '/dashboard/reports' },
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
        {/* Header with Filters */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-dark)' }}>
            {admin ? 'Tutte le Prenotazioni' : 'Le mie Prenotazioni'} ({filteredBookings.length})
          </h1>

          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <input
              type="text"
              placeholder="Cerca cliente o immobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />

            {/* Agent Filter (admin only) */}
            {admin && (
              <select
                value={filterAgentId}
                onChange={(e) => setFilterAgentId(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Tutti gli agenti</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nome} {a.cognome}
                  </option>
                ))}
              </select>
            )}

            {/* Status Filter */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tutti gli stati</option>
              <option value="confirmed">Confermate</option>
              <option value="completed">Completate</option>
              <option value="cancelled">Cancellate</option>
              <option value="no_show">Non presentati</option>
            </select>
          </div>
        </div>

        {/* Loading */}
        {loadingData && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
          </div>
        )}

        {/* Bookings List */}
        {!loadingData && (
          <div className="space-y-4">
            {filteredBookings.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">📅</div>
                <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                  Nessuna prenotazione trovata
                </h3>
                <p style={{ color: 'var(--text-gray)' }}>
                  {bookings.length === 0
                    ? 'Non hai ancora ricevuto prenotazioni'
                    : 'Prova a modificare i filtri di ricerca'
                  }
                </p>
              </div>
            ) : (
              filteredBookings.map((booking) => (
                <div key={booking.id} className="bg-white rounded-lg shadow-md p-4 md:p-6">
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">

                    {/* Booking Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        {getStatusBadge(booking)}
                        {/* Agent Badge (admin only) */}
                        {admin && booking.agent_info && (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                            👤 {booking.agent_info.nome} {booking.agent_info.cognome}
                          </span>
                        )}
                        <span className="text-sm text-gray-500">
                          Prenotato il {new Date(booking.created_at).toLocaleDateString('it-IT')}
                        </span>
                      </div>

                      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-dark)' }}>
                        {booking.open_house.property.titolo}
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="font-medium" style={{ color: 'var(--primary-blue)' }}>Cliente:</span>
                          <p style={{ color: 'var(--text-dark)' }}>
                            {booking.client.nome} {booking.client.cognome}
                          </p>
                          <p className="text-gray-600">{booking.client.email}</p>
                          <p className="text-gray-600">{booking.client.telefono}</p>
                        </div>

                        <div>
                          <span className="font-medium" style={{ color: 'var(--primary-blue)' }}>Open House:</span>
                          <p style={{ color: 'var(--text-dark)' }}>
                            {new Date(booking.open_house.data_evento).toLocaleDateString('it-IT')}
                          </p>
                          <p style={{ color: 'var(--text-dark)' }}>
                            {booking.open_house.ora_inizio} - {booking.open_house.ora_fine}
                          </p>
                        </div>

                        <div>
                          <span className="font-medium" style={{ color: 'var(--primary-blue)' }}>Slot prenotato:</span>
                          <p style={{ color: 'var(--text-dark)' }}>
                            {booking.time_slot.ora_inizio} - {booking.time_slot.ora_fine}
                          </p>
                          <p className="text-gray-600">
                            {booking.open_house.property.zona}
                          </p>
                        </div>
                      </div>

                      {/* Status tracking */}
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                        <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--primary-blue)' }}>
                          Status del processo
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                          <div className={`flex items-center gap-2 ${booking.confirmation_email_sent ? 'text-green-600' : 'text-gray-500'}`}>
                            {booking.confirmation_email_sent ? '✅' : '⏳'} Email di conferma
                          </div>
                          <div
                            className={`flex items-center gap-2 relative ${booking.questionnaire_completed ? 'text-green-600' : 'text-gray-500'}`}
                            onMouseEnter={() => booking.questionnaire_completed && booking.questionnaire_data && setHoveredBookingId(booking.id)}
                            onMouseLeave={() => setHoveredBookingId(null)}
                          >
                            <span className={booking.questionnaire_completed && booking.questionnaire_data ? 'cursor-pointer underline decoration-dotted' : ''}>
                              {booking.questionnaire_completed ? '✅' : '⏳'} Questionario completato
                            </span>

                            {/* Icons for key prequalification answers */}
                            {booking.questionnaire_completed && booking.questionnaire_data && (
                              <span className="flex items-center gap-1 ml-1">
                                {booking.questionnaire_data.vendita_immobile?.startsWith('si') && (
                                  <span title="Deve vendere un immobile" className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-sm cursor-help">🏠</span>
                                )}
                                {booking.questionnaire_data.necessita_mutuo === 'no' && (
                                  <span title="Non necessita di mutuo" className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-sm font-bold cursor-help">€</span>
                                )}
                              </span>
                            )}

                            {/* Tooltip with questionnaire answers */}
                            {booking.questionnaire_completed && booking.questionnaire_data && hoveredBookingId === booking.id && (
                              <div
                                className="absolute z-50 bg-white border-2 border-blue-200 rounded-lg shadow-2xl p-4 w-80"
                                style={{
                                  bottom: '100%',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  marginBottom: '8px'
                                }}
                              >
                                <div className="text-sm font-semibold mb-3 pb-2 border-b" style={{ color: 'var(--primary-blue)' }}>
                                  Risposte questionario
                                </div>
                                <div className="space-y-2 text-xs">
                                  {Object.entries(booking.questionnaire_data).map(([key, value]) => (
                                    <div key={key} className="border-l-2 border-gray-200 pl-2">
                                      <div className="font-medium text-gray-700">{getQuestionLabel(key)}</div>
                                      <div className="text-gray-900 mt-0.5">{value as string}</div>
                                    </div>
                                  ))}
                                </div>
                                {/* Arrow pointer */}
                                <div
                                  className="absolute w-3 h-3 bg-white border-r-2 border-b-2 border-blue-200"
                                  style={{
                                    bottom: '-7px',
                                    left: '50%',
                                    transform: 'translateX(-50%) rotate(45deg)'
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          <div className={`flex items-center gap-2 ${booking.brochure_email_sent ? 'text-green-600' : 'text-gray-500'}`}>
                            {booking.brochure_email_sent ? '✅' : '⏳'} Brochure inviata
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-row flex-wrap lg:flex-col gap-2 lg:min-w-[150px]">
                      {booking.status === 'confirmed' && (
                        <>
                          <button
                            onClick={() => updateBookingStatus(booking.id, 'completed')}
                            className="px-3 py-2 bg-green-100 text-green-700 rounded text-sm font-medium hover:bg-green-200"
                          >
                            Segna completata
                          </button>
                          <button
                            onClick={() => updateBookingStatus(booking.id, 'no_show')}
                            className="px-3 py-2 bg-orange-100 text-orange-700 rounded text-sm font-medium hover:bg-orange-200"
                          >
                            Non presentato
                          </button>
                          <button
                            onClick={() => cancelBooking(booking.id)}
                            className="px-3 py-2 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200"
                          >
                            Cancella
                          </button>
                        </>
                      )}

                      <a
                        href={`mailto:${booking.client.email}?subject=Open House ${booking.open_house.property.titolo}&body=Gentile ${booking.client.nome},`}
                        className="px-3 py-2 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200 text-center"
                      >
                        📧 Contatta
                      </a>

                      <a
                        href={`tel:${booking.client.telefono}`}
                        className="px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm font-medium hover:bg-gray-200 text-center"
                      >
                        📞 Chiama
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  )
}
