'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAgent, isAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'
import DashboardNav from '@/components/DashboardNav'
import AgentSelector from '@/components/AgentSelector'

interface Property {
  id: string
  titolo: string
  zona: string
  indirizzo: string
  agent_id?: string
  gre_agents?: {
    nome: string
    cognome: string
  }
}

interface OpenHouse {
  id: string
  property_id: string
  agent_id: string
  data_evento: string
  ora_inizio: string
  ora_fine: string
  durata_slot: number
  max_partecipanti_slot: number
  descrizione_evento: string | null
  is_active: boolean
  created_at: string
  gre_properties: Property
  gre_agents?: {
    nome: string
    cognome: string
  }
}

function OpenHousesManagementContent() {
  const { user, agent, loading, signOut } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [openHouses, setOpenHouses] = useState<OpenHouse[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loadingOpenHouses, setLoadingOpenHouses] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingOpenHouse, setEditingOpenHouse] = useState<OpenHouse | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    property_id: '',
    data_evento: '',
    ora_inizio: '',
    ora_fine: '',
    durata_slot: 20,
    max_partecipanti_slot: 1,
    descrizione_evento: ''
  })

  const admin = agent ? isAdmin(agent) : false

  // Redirect se non è agente
  useEffect(() => {
    if (!loading && (!agent || (!isAgent(agent) && !isAdmin(agent)))) {
      router.push('/dashboard/login')
    }
  }, [agent, loading, router])

  // Carica dati
  useEffect(() => {
    if (agent) {
      loadOpenHouses()
      loadProperties()
    }
  }, [agent])

  // Controlla se deve aprire il form automaticamente
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setShowAddForm(true)
      setEditingOpenHouse(null)
    }
  }, [searchParams])

  const loadProperties = async () => {
    if (!agent) return

    try {
      let query = supabase
        .from('gre_properties')
        .select('id, titolo, zona, indirizzo, agent_id, gre_agents(nome, cognome)')
        .eq('is_active', true)
        .order('titolo')

      if (!admin) {
        query = query.eq('agent_id', agent.id)
      }

      const { data, error } = await query

      if (error) throw error
      setProperties((data || []) as unknown as Property[])
    } catch (error) {
      console.error('Error loading properties:', error)
    }
  }

  const loadOpenHouses = async () => {
    if (!agent) return

    try {
      let query = supabase
        .from('gre_open_houses')
        .select(`
          *,
          gre_properties (
            id,
            titolo,
            zona,
            indirizzo
          ),
          gre_agents (
            nome,
            cognome
          )
        `)
        .order('data_evento', { ascending: false })

      if (!admin) {
        query = query.eq('agent_id', agent.id)
      }

      const { data, error } = await query

      if (error) throw error
      setOpenHouses(data || [])
    } catch (error) {
      console.error('Error loading open houses:', error)
    } finally {
      setLoadingOpenHouses(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Determine agent_id: for admin, derive from selected property or manual selection
    let agentId = agent!.id
    if (admin) {
      if (selectedAgentId) {
        agentId = selectedAgentId
      } else {
        // Derive from the selected property
        const selectedProperty = properties.find(p => p.id === formData.property_id)
        if (selectedProperty?.agent_id) {
          agentId = selectedProperty.agent_id
        }
      }
    }

    try {
      const openHouseData = {
        agent_id: agentId,
        property_id: formData.property_id,
        data_evento: formData.data_evento,
        ora_inizio: formData.ora_inizio,
        ora_fine: formData.ora_fine,
        durata_slot: formData.durata_slot,
        max_partecipanti_slot: formData.max_partecipanti_slot,
        descrizione_evento: formData.descrizione_evento || null,
        is_active: true
      }

      let openHouseId: string

      if (editingOpenHouse) {
        // Update existing open house
        let updateQuery = supabase
          .from('gre_open_houses')
          .update(openHouseData)
          .eq('id', editingOpenHouse.id)

        if (!admin) {
          updateQuery = updateQuery.eq('agent_id', agent!.id)
        }

        const { error } = await updateQuery

        if (error) throw error
        openHouseId = editingOpenHouse.id
      } else {
        // Create new open house
        const { data, error } = await supabase
          .from('gre_open_houses')
          .insert(openHouseData)
          .select()
          .single()

        if (error) throw error
        openHouseId = data.id
      }

      // Generate time slots automatically
      try {
        const response = await fetch('/api/generate-time-slots', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ openHouseId })
        })

        const result = await response.json()

        if (!response.ok) {
          console.error('Error generating slots:', result.error)
          alert('Open House salvato ma errore nella generazione slot: ' + result.error)
        } else if (result.action === 'warning') {
          // Timing cambiato con prenotazioni attive: chiedi conferma
          const conferma = confirm(
            `Attenzione: ci sono ${result.activeBookings} prenotazioni attive per questo Open House.\n\n` +
            `Modificando gli orari o la durata degli slot, tutte le prenotazioni esistenti verranno eliminate.\n\n` +
            `Vuoi procedere con la rigenerazione degli slot?`
          )

          if (conferma) {
            // Retry con forceRegenerate
            const retryResponse = await fetch('/api/generate-time-slots', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ openHouseId, forceRegenerate: true })
            })
            const retryResult = await retryResponse.json()

            if (!retryResponse.ok) {
              alert('Errore nella rigenerazione slot: ' + retryResult.error)
            } else {
              console.log(`Regenerated ${retryResult.slotsCreated} time slots (forced)`)
            }
          } else {
            alert('Modifica annullata. Le prenotazioni esistenti sono state mantenute.\nNota: la capacità è stata comunque aggiornata se modificata.')
          }
        } else if (result.action === 'updated_capacity') {
          console.log(`Updated capacity for ${result.slotsUpdated} slots`)
        } else {
          console.log(`Generated ${result.slotsCreated} time slots`)
        }
      } catch (slotError) {
        console.error('Error calling generate-time-slots API:', slotError)
        alert('Open House salvato ma errore nella generazione automatica slot')
      }

      // Reset form and reload
      resetForm()
      loadOpenHouses()
      alert(editingOpenHouse ? 'Open House e slot aggiornati con successo!' : 'Open House e slot creati con successo!')
    } catch (error: any) {
      alert('Errore: ' + error.message)
    }
  }

  const resetForm = () => {
    setFormData({
      property_id: '',
      data_evento: '',
      ora_inizio: '',
      ora_fine: '',
      durata_slot: 20,
      max_partecipanti_slot: 1,
      descrizione_evento: ''
    })
    setShowAddForm(false)
    setEditingOpenHouse(null)
    setSelectedAgentId('')
  }

  const toggleActive = async (openHouseId: string, currentStatus: boolean) => {
    try {
      let query = supabase
        .from('gre_open_houses')
        .update({ is_active: !currentStatus })
        .eq('id', openHouseId)

      if (!admin) {
        query = query.eq('agent_id', agent!.id)
      }

      const { error } = await query

      if (error) throw error
      loadOpenHouses()
    } catch (error: any) {
      alert('Errore: ' + error.message)
    }
  }

  const deleteOpenHouse = async (openHouseId: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo Open House?\nQuesta azione eliminerà anche tutte le prenotazioni collegate.')) return

    try {
      let query = supabase
        .from('gre_open_houses')
        .delete()
        .eq('id', openHouseId)

      if (!admin) {
        query = query.eq('agent_id', agent!.id)
      }

      const { error } = await query

      if (error) throw error
      loadOpenHouses()
      alert('Open House eliminato con successo!')
    } catch (error: any) {
      alert('Errore: ' + error.message)
    }
  }

  const startEdit = (openHouse: OpenHouse) => {
    setEditingOpenHouse(openHouse)
    setSelectedAgentId(openHouse.agent_id)
    setFormData({
      property_id: openHouse.property_id,
      data_evento: openHouse.data_evento,
      ora_inizio: openHouse.ora_inizio,
      ora_fine: openHouse.ora_fine,
      durata_slot: openHouse.durata_slot,
      max_partecipanti_slot: openHouse.max_partecipanti_slot,
      descrizione_evento: openHouse.descrizione_evento || ''
    })
    setShowAddForm(true)
  }

  const duplicateOpenHouse = (openHouse: OpenHouse) => {
    setEditingOpenHouse(null) // È una creazione, non una modifica
    setSelectedAgentId(openHouse.agent_id)
    setFormData({
      property_id: openHouse.property_id,
      data_evento: '', // Data vuota — l'agente la imposta
      ora_inizio: openHouse.ora_inizio,
      ora_fine: openHouse.ora_fine,
      durata_slot: openHouse.durata_slot,
      max_partecipanti_slot: openHouse.max_partecipanti_slot,
      descrizione_evento: openHouse.descrizione_evento || ''
    })
    setShowAddForm(true)
    // Scroll in cima per mostrare il form
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('it-IT', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatTime = (timeString: string) => {
    return timeString.slice(0, 5)
  }

  const getEventStatus = (dateString: string, oraFine: string): 'upcoming' | 'past' => {
    const endDateTime = new Date(`${dateString}T${oraFine}`)
    return endDateTime > new Date() ? 'upcoming' : 'past'
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
        {/* Header with Add Button */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
          <h2 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-dark)' }}>
            {admin ? 'Tutti gli Open House' : 'I Miei Open House'} ({openHouses.length})
          </h2>
          <button
            onClick={() => {
              if (properties.length === 0) {
                alert('Prima devi creare almeno un immobile per programmare un Open House!')
                return
              }
              setShowAddForm(true)
              setEditingOpenHouse(null)
              // Reset only the form data, not the showAddForm state
              setFormData({
                property_id: '',
                data_evento: '',
                ora_inizio: '',
                ora_fine: '',
                durata_slot: 20,
                max_partecipanti_slot: 1,
                descrizione_evento: ''
              })
              setSelectedAgentId('')
            }}
            className="btn-primary w-full sm:w-auto px-6 py-3 nav-text"
          >
            NUOVO OPEN HOUSE
          </button>
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-md p-4 md:p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-dark)' }}>
              {editingOpenHouse ? 'Modifica Open House' : 'Nuovo Open House'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Agent Selector for Admin */}
              {admin && (
                <AgentSelector
                  agent={agent}
                  selectedAgentId={selectedAgentId}
                  onChange={setSelectedAgentId}
                  required={false}
                  label="Agente (opzionale - derivato dall'immobile se non selezionato)"
                />
              )}

              {/* Property Selection */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                  Immobile *
                </label>
                <select
                  value={formData.property_id}
                  onChange={(e) => setFormData({ ...formData, property_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Seleziona un immobile...</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.titolo} - {property.zona}
                      {admin && property.gre_agents ? ` (${property.gre_agents.nome} ${property.gre_agents.cognome})` : ''}
                    </option>
                  ))}
                </select>
                {properties.length === 0 && (
                  <p className="text-xs mt-1 text-red-600">
                    Nessun immobile disponibile. <a href="/dashboard/properties" className="underline">Crea prima un immobile</a>
                  </p>
                )}
              </div>

              {/* Event Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                    Data Evento *
                  </label>
                  <input
                    type="date"
                    value={formData.data_evento}
                    onChange={(e) => setFormData({ ...formData, data_evento: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                      Ora Inizio *
                    </label>
                    <input
                      type="time"
                      value={formData.ora_inizio}
                      onChange={(e) => setFormData({ ...formData, ora_inizio: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                      Ora Fine *
                    </label>
                    <input
                      type="time"
                      value={formData.ora_fine}
                      onChange={(e) => setFormData({ ...formData, ora_fine: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Slot Configuration */}
              <div>
                <h4 className="text-md font-semibold mb-4" style={{ color: 'var(--text-dark)' }}>
                  Configurazione Slot
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                      Durata Slot (minuti) *
                    </label>
                    <select
                      value={formData.durata_slot}
                      onChange={(e) => setFormData({ ...formData, durata_slot: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value={10}>10 minuti</option>
                      <option value={15}>15 minuti</option>
                      <option value={20}>20 minuti</option>
                      <option value={30}>30 minuti</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                      Max Partecipanti per Slot *
                    </label>
                    <select
                      value={formData.max_partecipanti_slot}
                      onChange={(e) => setFormData({ ...formData, max_partecipanti_slot: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value={1}>1 gruppo alla volta</option>
                      <option value={2}>2 gruppi alla volta</option>
                      <option value={3}>3 gruppi alla volta</option>
                      <option value={4}>4 gruppi alla volta</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                  Descrizione Evento
                </label>
                <textarea
                  value={formData.descrizione_evento}
                  onChange={(e) => setFormData({ ...formData, descrizione_evento: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Informazioni aggiuntive per i visitatori..."
                />
              </div>

              {/* Buttons */}
              <div className="flex space-x-4">
                <button
                  type="submit"
                  className="btn-primary px-6 py-2 nav-text"
                >
                  {editingOpenHouse ? 'AGGIORNA OPEN HOUSE' : 'CREA OPEN HOUSE'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-secondary px-6 py-2 nav-text"
                >
                  ANNULLA
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Open Houses List */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {loadingOpenHouses ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: 'var(--accent-blue)' }}></div>
              <p className="mt-2" style={{ color: 'var(--text-gray)' }}>Caricamento Open House...</p>
            </div>
          ) : openHouses.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--text-gray)' }}>
              <h3 className="text-lg font-medium mb-2">Nessun Open House programmato</h3>
              <p>Inizia creando il tuo primo evento Open House</p>
            </div>
          ) : (
            <div className="space-y-4 p-6">
              {openHouses.map((openHouse) => {
                const eventStatus = getEventStatus(openHouse.data_evento, openHouse.ora_fine)

                return (
                <div
                  key={openHouse.id}
                  className={`border rounded-lg p-4 ${
                    eventStatus === 'upcoming'
                      ? openHouse.is_active
                        ? 'border-green-200 bg-green-50'
                        : 'border-yellow-200 bg-yellow-50'
                      : 'border-gray-300 bg-gray-100'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="font-semibold text-base md:text-lg" style={{ color: 'var(--text-dark)' }}>
                          {openHouse.gre_properties.titolo}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          openHouse.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {openHouse.is_active ? 'ATTIVO' : 'DISATTIVO'}
                        </span>
                        {eventStatus === 'upcoming' ? (
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 text-xs font-semibold rounded-full">
                            PROSSIMO
                          </span>
                        ) : (
                          <span className="bg-gray-200 text-gray-600 px-2 py-1 text-xs font-semibold rounded-full">
                            CONCLUSO
                          </span>
                        )}
                      </div>

                      {/* Agent Badge (admin only) */}
                      {admin && openHouse.gre_agents && (
                        <div className="mb-2">
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                            👤 {openHouse.gre_agents.nome} {openHouse.gre_agents.cognome}
                          </span>
                        </div>
                      )}

                      <p className="text-sm mb-2" style={{ color: 'var(--text-gray)' }}>
                        📍 {openHouse.gre_properties.zona} - {openHouse.gre_properties.indirizzo}
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="font-medium" style={{ color: 'var(--text-dark)' }}>Data:</span>
                          <p style={{ color: 'var(--text-gray)' }}>{formatDate(openHouse.data_evento)}</p>
                        </div>
                        <div>
                          <span className="font-medium" style={{ color: 'var(--text-dark)' }}>Orario:</span>
                          <p style={{ color: 'var(--text-gray)' }}>
                            {formatTime(openHouse.ora_inizio)} - {formatTime(openHouse.ora_fine)}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium" style={{ color: 'var(--text-dark)' }}>Slot:</span>
                          <p style={{ color: 'var(--text-gray)' }}>
                            {openHouse.durata_slot} min, max {openHouse.max_partecipanti_slot} {openHouse.max_partecipanti_slot === 1 ? 'gruppo' : 'gruppi'}
                          </p>
                        </div>
                      </div>

                      {openHouse.descrizione_evento && (
                        <div className="mt-3 p-2 bg-blue-50 rounded">
                          <p className="text-sm" style={{ color: 'var(--text-dark)' }}>
                            <strong>Descrizione:</strong> {openHouse.descrizione_evento}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-sm pt-3 border-t gap-2">
                    <div className="flex flex-wrap gap-3 md:gap-4">
                      <button
                        onClick={() => startEdit(openHouse)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Modifica
                      </button>
                      <button
                        onClick={() => toggleActive(openHouse.id, openHouse.is_active)}
                        className={openHouse.is_active ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900"}
                      >
                        {openHouse.is_active ? 'Disattiva' : 'Attiva'}
                      </button>
                      <button
                        onClick={() => duplicateOpenHouse(openHouse)}
                        className="text-purple-600 hover:text-purple-900"
                      >
                        Duplica
                      </button>
                      <button
                        onClick={() => deleteOpenHouse(openHouse.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Elimina
                      </button>
                      <button
                        onClick={() => router.push(`/dashboard/bookings?open_house=${openHouse.id}`)}
                        className="text-green-600 hover:text-green-900"
                      >
                        Prenotazioni
                      </button>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-gray)' }}>
                      Creato: {new Date(openHouse.created_at).toLocaleDateString('it-IT')}
                    </span>
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

export default function OpenHousesManagement() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <OpenHousesManagementContent />
    </Suspense>
  )
}
