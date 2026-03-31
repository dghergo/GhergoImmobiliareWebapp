'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'
import DashboardNav from '@/components/DashboardNav'

interface Agent {
  id: string
  email: string
  nome: string
  cognome: string
  role: 'admin' | 'agent' | 'collaborator'
  is_active: boolean
  google_oauth_enabled: boolean
  created_at: string
}

export default function AgentsManagement() {
  const { user, agent, loading, signOut } = useAuth()
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)

  // Form state
  const [formData, setFormData] = useState<{
    email: string
    nome: string
    cognome: string
    role: 'admin' | 'agent' | 'collaborator'
  }>({
    email: '',
    nome: '',
    cognome: '',
    role: 'agent'
  })

  // Redirect se non è admin
  useEffect(() => {
    if (!loading && (!agent || !isAdmin(agent))) {
      router.push('/admin/login')
    }
  }, [agent, loading, router])

  // Carica agenti
  useEffect(() => {
    loadAgents()
  }, [])

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('gre_agents')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setAgents(data || [])
    } catch (error) {
      console.error('Error loading agents:', error)
    } finally {
      setLoadingAgents(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (editingAgent) {
        // Update existing agent
        const { error } = await supabase
          .from('gre_agents')
          .update({
            nome: formData.nome,
            cognome: formData.cognome,
            role: formData.role
          })
          .eq('id', editingAgent.id)

        if (error) throw error
      } else {
        // Create new agent via API route
        const response = await fetch('/api/admin/create-agent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: formData.email,
            nome: formData.nome,
            cognome: formData.cognome,
            role: formData.role
          })
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Errore nella creazione agente')
        }

        alert(`Agente creato! Password temporanea: ${result.temporaryPassword}\nL'agente dovrà cambiarla al primo login.`)
      }

      // Reset form and reload
      setFormData({ email: '', nome: '', cognome: '', role: 'agent' })
      setShowAddForm(false)
      setEditingAgent(null)
      loadAgents()
    } catch (error: any) {
      alert('Errore: ' + error.message)
    }
  }

  const toggleActive = async (agentId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('gre_agents')
        .update({ is_active: !currentStatus })
        .eq('id', agentId)

      if (error) throw error
      loadAgents()
    } catch (error: any) {
      alert('Errore: ' + error.message)
    }
  }

  const toggleGoogleOAuth = async (agentId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('gre_agents')
        .update({ google_oauth_enabled: !currentStatus })
        .eq('id', agentId)

      if (error) throw error
      loadAgents()
    } catch (error: any) {
      alert('Errore: ' + error.message)
    }
  }

  const deleteAgent = async (agentId: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo agente?\nQuesto rimuoverà anche l\'accesso al sistema.')) return

    try {
      // Ottieni l'email dell'agente prima di eliminarlo
      const { data: agentData } = await supabase
        .from('gre_agents')
        .select('email')
        .eq('id', agentId)
        .single()

      // Elimina l'agente dal database
      const { error: deleteError } = await supabase
        .from('gre_agents')
        .delete()
        .eq('id', agentId)

      if (deleteError) throw deleteError

      // Prova a eliminare l'utente auth (se possibile)
      if (agentData?.email) {
        try {
          // Questo potrebbe non funzionare dal client, ma proviamo
          await supabase.auth.admin.deleteUser(agentData.email)
        } catch (authError) {
          console.log('Could not delete auth user:', authError)
          // Non è un errore fatale, l'agente è comunque eliminato dalla tabella
        }
      }

      loadAgents()
      alert('Agente eliminato. Nota: potrebbe essere necessario eliminare manualmente l\'utente dal pannello Authentication di Supabase.')
    } catch (error: any) {
      alert('Errore: ' + error.message)
    }
  }

  const startEdit = (agent: Agent) => {
    setEditingAgent(agent)
    setFormData({
      email: agent.email,
      nome: agent.nome,
      cognome: agent.cognome,
      role: agent.role
    })
    setShowAddForm(true)
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
        { label: 'ADMIN DASHBOARD', href: '/admin/dashboard' },
        { label: 'GESTIONE AGENTI', href: '/admin/agents', active: true },
        { label: 'TUTTI GLI IMMOBILI', href: '/dashboard/properties' },
        { label: 'OPEN HOUSE', href: '/dashboard/open-houses' },
        { label: 'PRENOTAZIONI', href: '/dashboard/bookings' },
        { label: 'REPORT', href: '/dashboard/reports' },
      ]} />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4 md:py-8">
        {/* Header with Add Button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-dark)' }}>
            Gestione Agenti ({agents.length})
          </h2>
          <button
            onClick={() => {
              setShowAddForm(true)
              setEditingAgent(null)
              setFormData({ email: '', nome: '', cognome: '', role: 'agent' })
            }}
            className="btn-primary px-6 py-3 nav-text"
          >
            ➕ NUOVO AGENTE
          </button>
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-dark)' }}>
              {editingAgent ? 'Modifica Agente' : 'Nuovo Agente'}
            </h3>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={!!editingAgent}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                  Ruolo
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="agent">Agente</option>
                  <option value="collaborator">Collaboratore</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                  Nome
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                  Cognome
                </label>
                <input
                  type="text"
                  value={formData.cognome}
                  onChange={(e) => setFormData({ ...formData, cognome: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="md:col-span-2 flex space-x-4">
                <button
                  type="submit"
                  className="btn-primary px-6 py-2 nav-text"
                >
                  {editingAgent ? 'AGGIORNA' : 'CREA AGENTE'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false)
                    setEditingAgent(null)
                  }}
                  className="btn-secondary px-6 py-2 nav-text"
                >
                  ANNULLA
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Agents Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {loadingAgents ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: 'var(--accent-blue)' }}></div>
              <p className="mt-2" style={{ color: 'var(--text-gray)' }}>Caricamento agenti...</p>
            </div>
          ) : agents.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--text-gray)' }}>
              <p>Nessun agente trovato</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead style={{ backgroundColor: 'var(--light-gray)' }}>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-dark)' }}>
                      Agente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-dark)' }}>
                      Ruolo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-dark)' }}>
                      Stato
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-dark)' }}>
                      Google OAuth
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-dark)' }}>
                      Data Creazione
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-dark)' }}>
                      Azioni
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {agents.map((agentItem) => (
                    <tr key={agentItem.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium" style={{ color: 'var(--text-dark)' }}>
                            {agentItem.nome} {agentItem.cognome}
                          </div>
                          <div className="text-sm" style={{ color: 'var(--text-gray)' }}>
                            {agentItem.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          agentItem.role === 'admin' ? 'bg-red-100 text-red-800' :
                          agentItem.role === 'agent' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {agentItem.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          agentItem.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {agentItem.is_active ? 'ATTIVO' : 'DISATTIVO'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleGoogleOAuth(agentItem.id, agentItem.google_oauth_enabled)}
                          className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                            agentItem.google_oauth_enabled
                              ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {agentItem.google_oauth_enabled ? '✓ Abilitato' : '○ Disabilitato'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-gray)' }}>
                        {new Date(agentItem.created_at).toLocaleDateString('it-IT')}
                      </td>
                      <td className="px-6 py-4 text-right text-sm space-x-2">
                        <button
                          onClick={() => startEdit(agentItem)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          ✏️ Modifica
                        </button>
                        <button
                          onClick={() => toggleActive(agentItem.id, agentItem.is_active)}
                          className={agentItem.is_active ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900"}
                        >
                          {agentItem.is_active ? '❌ Disattiva' : '✅ Attiva'}
                        </button>
                        {agentItem.id !== agent.id && (
                          <button
                            onClick={() => deleteAgent(agentItem.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            🗑️ Elimina
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}