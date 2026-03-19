'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAgent, isAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'
import DashboardNav from '@/components/DashboardNav'

export default function AgentDashboard() {
  const { user, agent, loading, signOut } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState({
    myProperties: 0,
    myOpenHouses: 0,
    totalBookings: 0,
    pendingBookings: 0
  })

  // Redirect se non è agente
  useEffect(() => {
    if (!loading && (!agent || (!isAgent(agent) && !isAdmin(agent)))) {
      router.push('/dashboard/login')
    }
  }, [agent, loading, router])

  // Carica statistiche
  useEffect(() => {
    if (agent) {
      loadStats()
    }
  }, [agent])

  const loadStats = async () => {
    if (!agent) return

    try {
      // Conta le proprietà dell'agente
      const { count: propertiesCount } = await supabase
        .from('gre_properties')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id)

      // Conta gli Open House dell'agente
      const { count: openHousesCount } = await supabase
        .from('gre_open_houses')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .eq('is_active', true)

      // Conta le prenotazioni per i propri Open House
      const { count: bookingsCount } = await supabase
        .from('gre_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id)

      // Conta le prenotazioni in attesa
      const { count: pendingCount } = await supabase
        .from('gre_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .eq('status', 'confirmed')

      setStats({
        myProperties: propertiesCount || 0,
        myOpenHouses: openHousesCount || 0,
        totalBookings: bookingsCount || 0,
        pendingBookings: pendingCount || 0
      })
    } catch (error) {
      console.error('Error loading stats:', error)
    }
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

  return (
    <div className="min-h-screen">
      <DashboardHeader agentName={`${agent.nome} ${agent.cognome}`}>
        {isAdmin(agent) && (
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

      <DashboardNav items={[
        { label: 'DASHBOARD', href: '/dashboard', active: true },
        { label: 'I MIEI IMMOBILI', href: '/dashboard/properties' },
        { label: 'OPEN HOUSE', href: '/dashboard/open-houses' },
        { label: 'PRENOTAZIONI', href: '/dashboard/bookings' },
        { label: 'REPORT', href: '/dashboard/reports' },
      ]} />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4 md:py-8">
        {/* Welcome Message */}
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 md:p-6 mb-4 md:mb-8">
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--primary-blue)' }}>
            Benvenuto nella tua Dashboard, {agent.nome}!
          </h2>
          <p style={{ color: 'var(--text-gray)' }}>
            Gestisci i tuoi immobili, Open House e prenotazioni da qui.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <a href="/dashboard/properties" className="group">
            <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer">
              <h3 className="text-lg font-semibold mb-2 group-hover:text-blue-600" style={{ color: 'var(--text-dark)' }}>
                I Miei Immobili
              </h3>
              <p className="text-3xl font-bold" style={{ color: 'var(--primary-blue)' }}>
                {stats.myProperties}
              </p>
              <p className="text-sm mt-1 text-gray-500 group-hover:text-blue-500">
                Proprietà gestite → Clicca per visualizzare
              </p>
            </div>
          </a>

          <a href="/dashboard/open-houses" className="group">
            <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer">
              <h3 className="text-lg font-semibold mb-2 group-hover:text-green-600" style={{ color: 'var(--text-dark)' }}>
                Open House Attivi
              </h3>
              <p className="text-3xl font-bold" style={{ color: 'var(--accent-blue)' }}>
                {stats.myOpenHouses}
              </p>
              <p className="text-sm mt-1 text-gray-500 group-hover:text-green-500">
                Eventi programmati → Clicca per gestire
              </p>
            </div>
          </a>

          <a href="/dashboard/bookings" className="group">
            <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer">
              <h3 className="text-lg font-semibold mb-2 group-hover:text-purple-600" style={{ color: 'var(--text-dark)' }}>
                Prenotazioni Totali
              </h3>
              <p className="text-3xl font-bold" style={{ color: 'var(--primary-blue)' }}>
                {stats.totalBookings}
              </p>
              <p className="text-sm mt-1 text-gray-500 group-hover:text-purple-500">
                Tutte le prenotazioni → Clicca per visualizzare
              </p>
            </div>
          </a>

          <a href="/dashboard/bookings" className="group">
            <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer">
              <h3 className="text-lg font-semibold mb-2 group-hover:text-orange-600" style={{ color: 'var(--text-dark)' }}>
                In Attesa
              </h3>
              <p className="text-3xl font-bold" style={{ color: 'var(--accent-blue)' }}>
                {stats.pendingBookings}
              </p>
              <p className="text-sm mt-1 text-gray-500 group-hover:text-orange-500">
                Da gestire → Clicca per visualizzare
              </p>
            </div>
          </a>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-dark)' }}>
            Azioni Rapide
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/dashboard/properties?action=new')}
              className="btn-primary p-4 text-left hover:opacity-90 transition-opacity"
            >
              <h3 className="font-semibold mb-2">🏠 Nuovo Immobile</h3>
              <p className="text-sm opacity-90">Aggiungi una nuova proprietà</p>
            </button>

            <button
              onClick={() => router.push('/dashboard/open-houses?action=new')}
              className="btn-secondary p-4 text-left hover:opacity-90 transition-opacity"
            >
              <h3 className="font-semibold mb-2">📅 Nuovo Open House</h3>
              <p className="text-sm opacity-90">Programma un evento</p>
            </button>

            <button
              onClick={() => router.push('/dashboard/reports')}
              className="btn-primary p-4 text-left hover:opacity-90 transition-opacity"
            >
              <h3 className="font-semibold mb-2">📊 I Miei Report</h3>
              <p className="text-sm opacity-90">Visualizza statistiche</p>
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-dark)' }}>
            Attività Recenti
          </h2>
          <div className="text-center py-8" style={{ color: 'var(--text-gray)' }}>
            <p>Nessuna attività recente da mostrare</p>
            <p className="text-sm mt-2">Le tue prossime azioni appariranno qui</p>
          </div>
        </div>
      </main>
    </div>
  )
}