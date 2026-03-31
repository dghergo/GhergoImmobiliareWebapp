'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { isAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'
import DashboardNav from '@/components/DashboardNav'

export default function AdminDashboard() {
  const { user, agent, loading, signOut } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState({
    totalAgents: 0,
    activeAgents: 0,
    totalProperties: 0,
    totalOpenHouses: 0
  })
  const [sendingFeedback, setSendingFeedback] = useState(false)

  // Redirect se non è admin
  useEffect(() => {
    if (!loading && (!agent || !isAdmin(agent))) {
      router.push('/admin/login')
    }
  }, [agent, loading, router])

  // Carica statistiche admin
  useEffect(() => {
    if (agent && isAdmin(agent)) {
      loadAdminStats()
    }
  }, [agent])

  const loadAdminStats = async () => {
    try {
      // Conta tutti gli agenti
      const { count: totalAgents } = await supabase
        .from('gre_agents')
        .select('*', { count: 'exact', head: true })

      // Conta agenti attivi
      const { count: activeAgents } = await supabase
        .from('gre_agents')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      // Conta tutte le proprietà
      const { count: totalProperties } = await supabase
        .from('gre_properties')
        .select('*', { count: 'exact', head: true })

      // Conta tutti gli Open House
      const { count: totalOpenHouses } = await supabase
        .from('gre_open_houses')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      setStats({
        totalAgents: totalAgents || 0,
        activeAgents: activeAgents || 0,
        totalProperties: totalProperties || 0,
        totalOpenHouses: totalOpenHouses || 0
      })
    } catch (error) {
      console.error('Error loading admin stats:', error)
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
        { label: 'ADMIN DASHBOARD', href: '/admin/dashboard', active: true },
        { label: 'GESTIONE AGENTI', href: '/admin/agents' },
        { label: 'TUTTI GLI IMMOBILI', href: '/dashboard/properties' },
        { label: 'OPEN HOUSE', href: '/dashboard/open-houses' },
        { label: 'PRENOTAZIONI', href: '/dashboard/bookings' },
        { label: 'REPORT', href: '/dashboard/reports' },
      ]} />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4 md:py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Link href="/admin/agents" className="group">
            <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer">
              <h3 className="text-lg font-semibold mb-2 group-hover:text-blue-600" style={{ color: 'var(--text-dark)' }}>
                👥 Agenti Totali
              </h3>
              <p className="text-3xl font-bold" style={{ color: 'var(--primary-blue)' }}>
                {stats.totalAgents}
              </p>
              <p className="text-xs mt-2 text-gray-500 group-hover:text-blue-500">
                Clicca per gestire →
              </p>
            </div>
          </Link>

          <Link href="/admin/agents" className="group">
            <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer">
              <h3 className="text-lg font-semibold mb-2 group-hover:text-green-600" style={{ color: 'var(--text-dark)' }}>
                ✅ Agenti Attivi
              </h3>
              <p className="text-3xl font-bold" style={{ color: 'var(--accent-blue)' }}>
                {stats.activeAgents}
              </p>
              <p className="text-xs mt-2 text-gray-500 group-hover:text-green-500">
                Clicca per gestire →
              </p>
            </div>
          </Link>

          <Link href="/dashboard/properties" className="group">
            <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer">
              <h3 className="text-lg font-semibold mb-2 group-hover:text-purple-600" style={{ color: 'var(--text-dark)' }}>
                🏠 Immobili
              </h3>
              <p className="text-3xl font-bold" style={{ color: 'var(--primary-blue)' }}>
                {stats.totalProperties}
              </p>
              <p className="text-xs mt-2 text-gray-500 group-hover:text-purple-500">
                Clicca per gestire →
              </p>
            </div>
          </Link>

          <Link href="/dashboard/open-houses" className="group">
            <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer">
              <h3 className="text-lg font-semibold mb-2 group-hover:text-orange-600" style={{ color: 'var(--text-dark)' }}>
                📅 Open Houses
              </h3>
              <p className="text-3xl font-bold" style={{ color: 'var(--accent-blue)' }}>
                {stats.totalOpenHouses}
              </p>
              <p className="text-xs mt-2 text-gray-500 group-hover:text-orange-500">
                Clicca per gestire →
              </p>
            </div>
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-dark)' }}>
            Azioni Rapide
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button className="btn-primary p-4 text-left">
              <h3 className="font-semibold mb-2">Nuovo Agente</h3>
              <p className="text-sm opacity-90">Aggiungi un nuovo collaboratore</p>
            </button>

            <button
              onClick={() => router.push('/dashboard/properties')}
              className="btn-secondary p-4 text-left hover:opacity-90 transition-opacity"
            >
              <h3 className="font-semibold mb-2">Gestisci Immobili</h3>
              <p className="text-sm opacity-90">Visualizza e gestisci tutti gli immobili</p>
            </button>

            <button
              onClick={() => router.push('/dashboard/reports')}
              className="btn-primary p-4 text-left"
            >
              <h3 className="font-semibold mb-2">Report Globale</h3>
              <p className="text-sm opacity-90">Statistiche complete</p>
            </button>

            <button
              onClick={async () => {
                setSendingFeedback(true)
                try {
                  const response = await fetch('/api/cron/send-feedback-requests', {
                    headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ''}` }
                  })
                  const result = await response.json()
                  if (response.ok) {
                    alert(`Email feedback inviate: ${result.emailsSent}\nErrori: ${result.errors}`)
                  } else {
                    alert('Errore: ' + (result.error || 'Errore sconosciuto'))
                  }
                } catch (error) {
                  alert('Errore nell\'invio delle email feedback')
                } finally {
                  setSendingFeedback(false)
                }
              }}
              disabled={sendingFeedback}
              className="btn-primary p-4 text-left disabled:opacity-50"
            >
              <h3 className="font-semibold mb-2">{sendingFeedback ? 'Invio in corso...' : 'Invia Email Feedback'}</h3>
              <p className="text-sm opacity-90">Trigger manuale email post-visita</p>
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-dark)' }}>
            Attività Recenti
          </h2>
          <div className="text-center py-8" style={{ color: 'var(--text-gray)' }}>
            <p>Nessuna attività recente da mostrare</p>
          </div>
        </div>
      </main>
    </div>
  )
}