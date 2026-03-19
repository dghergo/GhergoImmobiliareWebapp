'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { isAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'
import DashboardNav from '@/components/DashboardNav'

interface OpenHouse {
  id: string
  data_evento: string
  ora_inizio: string
  ora_fine: string
  max_partecipanti: number
  status: 'draft' | 'published' | 'completed' | 'cancelled'
  created_at: string
  gre_properties: {
    id: string
    titolo: string
    zona: string
    indirizzo: string
    tipologia: string
    prezzo: number
  }
  gre_agents: {
    id: string
    nome: string
    cognome: string
  }
  _count?: {
    bookings: number
  }
}

export default function AdminOpenHouses() {
  const { user, agent, loading, signOut } = useAuth()
  const router = useRouter()
  const [openHouses, setOpenHouses] = useState<OpenHouse[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [filter, setFilter] = useState<'all' | 'draft' | 'published' | 'completed' | 'cancelled'>('all')

  // Redirect se non è admin
  useEffect(() => {
    if (!loading && (!agent || !isAdmin(agent))) {
      router.push('/admin/login')
    }
  }, [agent, loading, router])

  const loadOpenHouses = async () => {
    try {
      setLoadingData(true)

      let query = supabase
        .from('gre_open_houses')
        .select(`
          *,
          gre_properties!inner (
            id,
            titolo,
            zona,
            indirizzo,
            tipologia,
            prezzo
          ),
          gre_agents!inner (
            id,
            nome,
            cognome
          )
        `)
        .order('data_evento', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error loading open houses:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        return
      }

      console.log('Open houses data:', data)

      // Per ogni open house, conta le prenotazioni
      const openHousesWithCounts = await Promise.all(
        (data || []).map(async (oh) => {
          const { count } = await supabase
            .from('gre_bookings')
            .select('*', { count: 'exact', head: true })
            .eq('open_house_id', oh.id)
            .neq('status', 'cancelled')

          return {
            ...oh,
            _count: {
              bookings: count || 0
            }
          }
        })
      )

      setOpenHouses(openHousesWithCounts)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    if (agent && isAdmin(agent)) {
      loadOpenHouses()
    }
  }, [agent, filter])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800'
      case 'published': return 'bg-green-100 text-green-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft': return 'Bozza'
      case 'published': return 'Pubblicato'
      case 'completed': return 'Completato'
      case 'cancelled': return 'Cancellato'
      default: return status
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
      </div>
    )
  }

  if (!agent || !isAdmin(agent)) {
    return null
  }

  return (
    <div className="min-h-screen">
      <DashboardHeader agentName={`${agent.nome} ${agent.cognome}`}>
        <button
          onClick={signOut}
          className="btn-primary text-sm px-3 md:px-4 py-2"
        >
          Logout
        </button>
      </DashboardHeader>

      <DashboardNav items={[
        { label: 'DASHBOARD', href: '/admin/dashboard' },
        { label: 'GESTIONE AGENTI', href: '/admin/agents' },
        { label: 'IMMOBILI', href: '/admin/properties' },
        { label: 'REPORT', href: '/admin/reports' },
      ]} />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4 md:py-8">
        {/* Header con filtri */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--text-dark)' }}>
              Open Houses
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-gray)' }}>
              Gestisci tutti gli Open Houses creati da agenti e admin
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">Tutti</option>
              <option value="draft">Bozze</option>
              <option value="published">Pubblicati</option>
              <option value="completed">Completati</option>
              <option value="cancelled">Cancellati</option>
            </select>
          </div>
        </div>

        {/* Lista Open Houses */}
        {loadingData ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
          </div>
        ) : openHouses.length === 0 ? (
          <div className="text-center py-8">
            <p style={{ color: 'var(--text-gray)' }}>
              {filter === 'all' ? 'Nessun Open House trovato' : `Nessun Open House ${getStatusText(filter).toLowerCase()} trovato`}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Immobile
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data e Orario
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Agente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prenotazioni
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Azioni
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {openHouses.map((oh) => (
                    <tr key={oh.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {oh.gre_properties.titolo}
                          </div>
                          <div className="text-sm text-gray-500">
                            {oh.gre_properties.tipologia} • {oh.gre_properties.zona}
                          </div>
                          {oh.gre_properties.indirizzo && (
                            <div className="text-xs text-gray-400">
                              {oh.gre_properties.indirizzo}
                            </div>
                          )}
                          <div className="text-sm font-medium" style={{ color: 'var(--accent-blue)' }}>
                            €{oh.gre_properties.prezzo?.toLocaleString()}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(oh.data_evento).toLocaleDateString('it-IT', {
                            weekday: 'short',
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="text-sm text-gray-500">
                          {oh.ora_inizio} - {oh.ora_fine}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {oh.gre_agents.nome} {oh.gre_agents.cognome}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {oh._count?.bookings || 0} / {oh.max_partecipanti}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(oh.status)}`}>
                          {getStatusText(oh.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Link
                          href={`/open-house/${oh.id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Visualizza
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}