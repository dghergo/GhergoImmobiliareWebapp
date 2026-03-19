'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'
import DashboardNav from '@/components/DashboardNav'

interface Property {
  id: string
  titolo: string
  tipologia: string
  prezzo: number
  citta: string
  provincia: string
  superficie: number
  camere: number
  bagni: number
  descrizione: string
  is_active: boolean
  created_at: string
  agent_id: string
  agent: {
    nome: string
    cognome: string
    email: string
  }
}

export default function AdminProperties() {
  const { agent, loading, signOut } = useAuth()
  const router = useRouter()
  const [properties, setProperties] = useState<Property[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  // Redirect se non è admin
  useEffect(() => {
    if (!loading && (!agent || !isAdmin(agent))) {
      router.push('/admin/login')
    }
  }, [agent, loading, router])

  // Carica proprietà
  useEffect(() => {
    if (agent && isAdmin(agent)) {
      loadProperties()
    }
  }, [agent])

  const loadProperties = async () => {
    setLoadingData(true)
    try {
      const { data, error } = await supabase
        .from('gre_properties')
        .select(`
          *,
          agent:gre_agents(nome, cognome, email)
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading properties:', error)
        return
      }

      setProperties(data || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoadingData(false)
    }
  }

  const togglePropertyStatus = async (propertyId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('gre_properties')
        .update({ is_active: !currentStatus })
        .eq('id', propertyId)

      if (error) {
        console.error('Error updating property:', error)
        return
      }

      // Ricarica le proprietà
      loadProperties()
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const filteredProperties = properties.filter(property => {
    const matchesSearch =
      property.titolo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.citta.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.agent.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.agent.cognome.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'active' && property.is_active) ||
      (filterStatus === 'inactive' && !property.is_active)

    return matchesSearch && matchesStatus
  })

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
        { label: 'IMMOBILI', href: '/admin/properties', active: true },
        { label: 'REPORT', href: '/admin/reports' },
      ]} />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4 md:py-8">
        {/* Header with Search and Filters */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-dark)' }}>
            Gestione Immobili ({filteredProperties.length})
          </h1>

          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <input
              type="text"
              placeholder="Cerca per titolo, città, agente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tutti gli stati</option>
              <option value="active">Solo attivi</option>
              <option value="inactive">Solo disattivi</option>
            </select>
          </div>
        </div>

        {/* Loading */}
        {loadingData && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
          </div>
        )}

        {/* Properties Grid */}
        {!loadingData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProperties.map((property) => (
              <div key={property.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-6">
                  {/* Status Badge */}
                  <div className="flex justify-between items-start mb-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        property.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {property.is_active ? 'ATTIVO' : 'DISATTIVO'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(property.created_at).toLocaleDateString('it-IT')}
                    </span>
                  </div>

                  {/* Property Info */}
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-dark)' }}>
                    {property.titolo}
                  </h3>

                  <div className="space-y-2 text-sm" style={{ color: 'var(--text-gray)' }}>
                    <div className="flex justify-between">
                      <span>Tipologia:</span>
                      <span className="font-medium">{property.tipologia}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Prezzo:</span>
                      <span className="font-medium">€ {property.prezzo?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Località:</span>
                      <span className="font-medium">{property.citta}, {property.provincia}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Superficie:</span>
                      <span className="font-medium">{property.superficie} m²</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Camere/Bagni:</span>
                      <span className="font-medium">{property.camere}/{property.bagni}</span>
                    </div>
                  </div>

                  {/* Agent Info */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-dark)' }}>
                          Agente: {property.agent.nome} {property.agent.cognome}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-gray)' }}>
                          {property.agent.email}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2">
                    <button
                      onClick={() => togglePropertyStatus(property.id, property.is_active)}
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        property.is_active
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {property.is_active ? 'Disattiva' : 'Attiva'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No Results */}
        {!loadingData && filteredProperties.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">🏠</div>
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
              Nessun immobile trovato
            </h3>
            <p style={{ color: 'var(--text-gray)' }}>
              {properties.length === 0
                ? 'Non ci sono ancora immobili nel sistema'
                : 'Prova a modificare i filtri di ricerca'
              }
            </p>
          </div>
        )}
      </main>
    </div>
  )
}