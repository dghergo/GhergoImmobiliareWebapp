'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAgent, isAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'
import DashboardNav from '@/components/DashboardNav'

interface Property {
  id: string
  agent_id: string
  titolo: string
  descrizione: string | null
  prezzo: number | null
  tipologia: 'appartamento' | 'villa' | 'ufficio' | 'locale_commerciale' | 'terreno'
  zona: string
  indirizzo: string | null
  caratteristiche: any
  immagini: string[]
  brochure_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function PropertiesManagement() {
  const { user, agent, loading, signOut } = useAuth()
  const router = useRouter()
  // Rimosso searchParams per ora a causa di problemi con Next.js 15
  // const searchParams = useSearchParams()
  const [properties, setProperties] = useState<Property[]>([])
  const [loadingProperties, setLoadingProperties] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingProperty, setEditingProperty] = useState<Property | null>(null)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [brochureFile, setBrochureFile] = useState<File | null>(null)
  const [brochureUrl, setBrochureUrl] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    titolo: '',
    descrizione: '',
    prezzo: '',
    tipologia: 'appartamento' as 'appartamento' | 'villa' | 'ufficio' | 'locale_commerciale' | 'terreno',
    zona: '',
    indirizzo: '',
    mq: '',
    locali: '',
    piano: '',
    bagni: '',
    posto_auto: false,
    ascensore: false,
    terrazzo: false,
    giardino: false
  })

  // Redirect se non è agente
  useEffect(() => {
    if (!loading && (!agent || (!isAgent(agent) && !isAdmin(agent)))) {
      router.push('/dashboard/login')
    }
  }, [agent, loading, router])

  // Carica immobili dell'agente
  useEffect(() => {
    if (agent) {
      loadProperties()
    }
  }, [agent])

  // Controlla se deve aprire il form automaticamente
  // Temporaneamente disabilitato per debug
  // useEffect(() => {
  //   console.log('searchParams effect:', searchParams.get('action'))
  //   if (searchParams.get('action') === 'new') {
  //     setShowAddForm(true)
  //     setEditingProperty(null)
  //   }
  // }, [searchParams])

  const loadProperties = async () => {
    if (!agent) return

    try {
      const { data, error } = await supabase
        .from('gre_properties')
        .select('*')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setProperties(data || [])
    } catch (error) {
      console.error('Error loading properties:', error)
    } finally {
      setLoadingProperties(false)
    }
  }

  const uploadBrochure = async (propertyId: string): Promise<string | null> => {
    if (!brochureFile) return null

    try {
      const fileExt = brochureFile.name.split('.').pop()
      const fileName = `brochures/${propertyId}/brochure.${fileExt}`

      const { data, error } = await supabase.storage
        .from('gre_property_documents')
        .upload(fileName, brochureFile, { upsert: true })

      if (error) {
        console.error('Error uploading brochure (bucket might not exist):', error)
        alert('Upload brochure fallito. Per ora salvo solo i dati dell\'immobile.')
        return null
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('gre_property_documents')
        .getPublicUrl(fileName)

      return publicUrlData.publicUrl
    } catch (error) {
      console.error('Error in uploadBrochure:', error)
      alert('Upload brochure fallito. Per ora salvo solo i dati dell\'immobile.')
      return null
    }
  }

  const uploadImages = async (propertyId: string): Promise<string[]> => {
    if (imageFiles.length === 0) return []

    setUploadingImages(true)
    const uploadedUrls: string[] = []

    try {
      for (const file of imageFiles) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${propertyId}/${Date.now()}.${fileExt}`

        const { data, error } = await supabase.storage
          .from('gre_property_images')
          .upload(fileName, file)

        if (error) {
          console.error('Error uploading image (bucket might not exist):', error)
          alert('Upload immagini fallito. Per ora salvo solo i dati dell\'immobile.')
          break
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('gre_property_images')
          .getPublicUrl(fileName)

        uploadedUrls.push(publicUrlData.publicUrl)
      }

      return uploadedUrls
    } catch (error) {
      console.error('Error in uploadImages:', error)
      alert('Upload immagini fallito. Per ora salvo solo i dati dell\'immobile.')
      return uploadedUrls
    } finally {
      setUploadingImages(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const caratteristiche = {
        mq: formData.mq ? parseInt(formData.mq) : null,
        locali: formData.locali ? parseInt(formData.locali) : null,
        piano: formData.piano || null,
        bagni: formData.bagni ? parseInt(formData.bagni) : null,
        posto_auto: formData.posto_auto,
        ascensore: formData.ascensore,
        terrazzo: formData.terrazzo,
        giardino: formData.giardino
      }

      let immagini: string[] = []
      let brochure_url: string | null = null

      if (editingProperty) {
        // Update existing property
        immagini = editingProperty.immagini || []
        brochure_url = brochureUrl || editingProperty.brochure_url

        // Upload new images if any
        if (imageFiles.length > 0) {
          const newImages = await uploadImages(editingProperty.id)
          immagini = [...immagini, ...newImages]
        }

        // Upload new brochure if any
        if (brochureFile) {
          const uploadedBrochure = await uploadBrochure(editingProperty.id)
          if (uploadedBrochure) {
            brochure_url = uploadedBrochure
          }
        }

        const { error } = await supabase
          .from('gre_properties')
          .update({
            titolo: formData.titolo,
            descrizione: formData.descrizione || null,
            prezzo: formData.prezzo ? parseFloat(formData.prezzo) : null,
            tipologia: formData.tipologia,
            zona: formData.zona,
            indirizzo: formData.indirizzo || null,
            caratteristiche,
            immagini,
            brochure_url,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingProperty.id)
          .eq('agent_id', agent!.id)

        if (error) throw error
      } else {
        // Create new property first
        const { data: newProperty, error: insertError } = await supabase
          .from('gre_properties')
          .insert({
            agent_id: agent!.id,
            titolo: formData.titolo,
            descrizione: formData.descrizione || null,
            prezzo: formData.prezzo ? parseFloat(formData.prezzo) : null,
            tipologia: formData.tipologia,
            zona: formData.zona,
            indirizzo: formData.indirizzo || null,
            caratteristiche,
            is_active: true,
            immagini: []
          })
          .select()
          .single()

        if (insertError) throw insertError

        // Upload images and brochure if any
        if ((imageFiles.length > 0 || brochureFile) && newProperty) {
          if (imageFiles.length > 0) {
            immagini = await uploadImages(newProperty.id)
          }

          if (brochureFile) {
            brochure_url = await uploadBrochure(newProperty.id)
          }

          // Update property with file URLs
          const { error: updateError } = await supabase
            .from('gre_properties')
            .update({
              immagini,
              brochure_url
            })
            .eq('id', newProperty.id)

          if (updateError) throw updateError
        }
      }

      // Reset form and reload
      resetForm()
      loadProperties()
      alert(editingProperty ? 'Immobile aggiornato con successo!' : 'Immobile creato con successo!')
    } catch (error: any) {
      alert('Errore: ' + error.message)
      setUploadingImages(false)
    }
  }

  const resetForm = () => {
    setFormData({
      titolo: '',
      descrizione: '',
      prezzo: '',
      tipologia: 'appartamento',
      zona: '',
      indirizzo: '',
      mq: '',
      locali: '',
      piano: '',
      bagni: '',
      posto_auto: false,
      ascensore: false,
      terrazzo: false,
      giardino: false
    })
    setShowAddForm(false)
    setEditingProperty(null)
    setImageFiles([])
    setBrochureFile(null)
    setBrochureUrl('')
  }

  const toggleActive = async (propertyId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('gre_properties')
        .update({ is_active: !currentStatus, updated_at: new Date().toISOString() })
        .eq('id', propertyId)
        .eq('agent_id', agent!.id)

      if (error) throw error
      loadProperties()
    } catch (error: any) {
      alert('Errore: ' + error.message)
    }
  }

  const deleteProperty = async (propertyId: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo immobile?\nQuesta azione eliminerà anche tutti gli Open House collegati.')) return

    try {
      const { error } = await supabase
        .from('gre_properties')
        .delete()
        .eq('id', propertyId)
        .eq('agent_id', agent!.id)

      if (error) throw error
      loadProperties()
      alert('Immobile eliminato con successo!')
    } catch (error: any) {
      alert('Errore: ' + error.message)
    }
  }

  const startEdit = (property: Property) => {
    setEditingProperty(property)
    setFormData({
      titolo: property.titolo,
      descrizione: property.descrizione || '',
      prezzo: property.prezzo?.toString() || '',
      tipologia: property.tipologia,
      zona: property.zona,
      indirizzo: property.indirizzo || '',
      mq: property.caratteristiche?.mq?.toString() || '',
      locali: property.caratteristiche?.locali?.toString() || '',
      piano: property.caratteristiche?.piano || '',
      bagni: property.caratteristiche?.bagni?.toString() || '',
      posto_auto: property.caratteristiche?.posto_auto || false,
      ascensore: property.caratteristiche?.ascensore || false,
      terrazzo: property.caratteristiche?.terrazzo || false,
      giardino: property.caratteristiche?.giardino || false
    })
    setBrochureUrl(property.brochure_url || '')
    setShowAddForm(true)
  }

  const formatPrice = (price: number | null) => {
    if (!price) return 'Prezzo da concordare'
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(price)
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
        { label: 'DASHBOARD', href: '/dashboard' },
        { label: 'I MIEI IMMOBILI', href: '/dashboard/properties', active: true },
        { label: 'OPEN HOUSE', href: '/dashboard/open-houses' },
        { label: 'PRENOTAZIONI', href: '/dashboard/bookings' },
        { label: 'REPORT', href: '/dashboard/reports' },
      ]} />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4 md:py-8">
        {/* Header with Add Button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-dark)' }}>
            I Miei Immobili ({properties.length})
          </h2>
          <button
            onClick={() => {
              setShowAddForm(true)
              setEditingProperty(null)
              // Reset only the form data, not the showAddForm state
              setFormData({
                titolo: '',
                descrizione: '',
                prezzo: '',
                tipologia: 'appartamento',
                zona: '',
                indirizzo: '',
                mq: '',
                locali: '',
                piano: '',
                bagni: '',
                posto_auto: false,
                ascensore: false,
                terrazzo: false,
                giardino: false
              })
              setImageFiles([])
              setBrochureFile(null)
              setBrochureUrl('')
            }}
            className="btn-primary px-6 py-3 nav-text"
          >
            🏠 NUOVO IMMOBILE
          </button>
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-dark)' }}>
              {editingProperty ? 'Modifica Immobile' : 'Nuovo Immobile'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Informazioni Base */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                    Titolo *
                  </label>
                  <input
                    type="text"
                    value={formData.titolo}
                    onChange={(e) => setFormData({ ...formData, titolo: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="es. Appartamento luminoso in centro"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                    Tipologia *
                  </label>
                  <select
                    value={formData.tipologia}
                    onChange={(e) => setFormData({ ...formData, tipologia: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="appartamento">Appartamento</option>
                    <option value="villa">Villa</option>
                    <option value="ufficio">Ufficio</option>
                    <option value="locale_commerciale">Locale Commerciale</option>
                    <option value="terreno">Terreno</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                    Prezzo (€)
                  </label>
                  <input
                    type="number"
                    value={formData.prezzo}
                    onChange={(e) => setFormData({ ...formData, prezzo: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="es. 250000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                    Zona *
                  </label>
                  <input
                    type="text"
                    value={formData.zona}
                    onChange={(e) => setFormData({ ...formData, zona: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="es. Centro Storico"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                    Indirizzo
                  </label>
                  <input
                    type="text"
                    value={formData.indirizzo}
                    onChange={(e) => setFormData({ ...formData, indirizzo: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="es. Via Roma 123"
                  />
                </div>
              </div>

              {/* Descrizione */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                  Descrizione
                </label>
                <textarea
                  value={formData.descrizione}
                  onChange={(e) => setFormData({ ...formData, descrizione: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Descrizione dettagliata dell'immobile..."
                />
              </div>

              {/* Caratteristiche */}
              <div>
                <h4 className="text-md font-semibold mb-4" style={{ color: 'var(--text-dark)' }}>
                  Caratteristiche
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                      Superficie (mq)
                    </label>
                    <input
                      type="number"
                      value={formData.mq}
                      onChange={(e) => setFormData({ ...formData, mq: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="es. 80"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                      Locali
                    </label>
                    <input
                      type="number"
                      value={formData.locali}
                      onChange={(e) => setFormData({ ...formData, locali: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="es. 3"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                      Piano
                    </label>
                    <input
                      type="text"
                      value={formData.piano}
                      onChange={(e) => setFormData({ ...formData, piano: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="es. 2°"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                      Bagni
                    </label>
                    <input
                      type="number"
                      value={formData.bagni}
                      onChange={(e) => setFormData({ ...formData, bagni: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="es. 1"
                    />
                  </div>
                </div>

                {/* Checkbox Features */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.posto_auto}
                      onChange={(e) => setFormData({ ...formData, posto_auto: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-dark)' }}>Posto Auto</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.ascensore}
                      onChange={(e) => setFormData({ ...formData, ascensore: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-dark)' }}>Ascensore</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.terrazzo}
                      onChange={(e) => setFormData({ ...formData, terrazzo: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-dark)' }}>Terrazzo</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.giardino}
                      onChange={(e) => setFormData({ ...formData, giardino: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-dark)' }}>Giardino</span>
                  </label>
                </div>
              </div>

              {/* Image Upload Section */}
              <div>
                <h4 className="text-md font-semibold mb-4" style={{ color: 'var(--text-dark)' }}>
                  Immagini
                </h4>

                {/* Existing Images (for edit mode) */}
                {editingProperty && editingProperty.immagini && editingProperty.immagini.length > 0 && (
                  <div className="mb-4">
                    <h5 className="text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                      Immagini attuali:
                    </h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {editingProperty.immagini.map((imageUrl, index) => (
                        <div key={index} className="relative">
                          <img
                            src={imageUrl}
                            alt={`Immagine ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              // Remove image from editingProperty
                              const updatedImages = editingProperty.immagini.filter((_, i) => i !== index)
                              setEditingProperty({ ...editingProperty, immagini: updatedImages })
                            }}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New Images Upload */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                    {editingProperty ? 'Aggiungi nuove immagini:' : 'Seleziona immagini:'}
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || [])
                      setImageFiles(files)
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-gray)' }}>
                    Seleziona fino a 10 immagini (JPG, PNG, max 5MB ciascuna)
                  </p>

                  {/* Preview new images */}
                  {imageFiles.length > 0 && (
                    <div className="mt-4">
                      <h6 className="text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                        Anteprima nuove immagini:
                      </h6>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {imageFiles.map((file, index) => (
                          <div key={index} className="relative">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`Preview ${index + 1}`}
                              className="w-full h-24 object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updatedFiles = imageFiles.filter((_, i) => i !== index)
                                setImageFiles(updatedFiles)
                              }}
                              className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                            >
                              ×
                            </button>
                            <div className="absolute bottom-1 left-1 bg-black bg-opacity-75 text-white text-xs px-1 rounded">
                              {file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Brochure Section */}
              <div>
                <h4 className="text-md font-semibold mb-4" style={{ color: 'var(--text-dark)' }}>
                  Brochure/Scheda Tecnica
                </h4>

                {/* Current Brochure */}
                {brochureUrl && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl">📄</span>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-dark)' }}>
                          Brochure attuale
                        </span>
                      </div>
                      <div className="flex space-x-2">
                        <a
                          href={brochureUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-900 text-sm"
                        >
                          📖 Visualizza
                        </a>
                        <button
                          type="button"
                          onClick={() => setBrochureUrl('')}
                          className="text-red-600 hover:text-red-900 text-sm"
                        >
                          🗑️ Rimuovi
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Upload New Brochure */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
                    {brochureUrl ? 'Sostituisci brochure:' : 'Carica brochure (PDF):'}
                  </label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      setBrochureFile(file)
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-gray)' }}>
                    Solo file PDF, max 10MB
                  </p>

                  {/* Preview new brochure */}
                  {brochureFile && (
                    <div className="mt-2 p-2 bg-blue-50 rounded flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-blue-600">📄</span>
                        <span className="text-sm text-blue-800 font-medium">
                          {brochureFile.name}
                        </span>
                        <span className="text-xs text-blue-600">
                          ({(brochureFile.size / 1024 / 1024).toFixed(1)}MB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBrochureFile(null)}
                        className="text-red-600 hover:text-red-900 text-sm"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex space-x-4">
                <button
                  type="submit"
                  disabled={uploadingImages}
                  className={`px-6 py-2 nav-text ${uploadingImages ? 'btn-secondary opacity-50 cursor-not-allowed' : 'btn-primary'}`}
                >
                  {uploadingImages ? 'CARICAMENTO...' : (editingProperty ? 'AGGIORNA IMMOBILE' : 'CREA IMMOBILE')}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={uploadingImages}
                  className="btn-secondary px-6 py-2 nav-text"
                >
                  ANNULLA
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Properties Grid */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {loadingProperties ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: 'var(--accent-blue)' }}></div>
              <p className="mt-2" style={{ color: 'var(--text-gray)' }}>Caricamento immobili...</p>
            </div>
          ) : properties.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--text-gray)' }}>
              <h3 className="text-lg font-medium mb-2">Nessun immobile trovato</h3>
              <p>Inizia creando il tuo primo immobile</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
              {properties.map((property) => (
                <div key={property.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                  {/* Property Image */}
                  <div className="h-48 bg-gray-200 flex items-center justify-center relative overflow-hidden">
                    {property.immagini && property.immagini.length > 0 ? (
                      <div className="relative w-full h-full">
                        <img
                          src={property.immagini[0]}
                          alt={property.titolo}
                          className="w-full h-full object-cover"
                        />
                        {property.immagini.length > 1 && (
                          <div className="absolute top-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                            +{property.immagini.length - 1}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-gray-400 text-center">
                        <div className="text-4xl mb-2">🏠</div>
                        <div className="text-sm">Nessuna immagine</div>
                      </div>
                    )}
                  </div>

                  {/* Property Content */}
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-lg" style={{ color: 'var(--text-dark)' }}>
                        {property.titolo}
                      </h3>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        property.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {property.is_active ? 'ATTIVO' : 'DISATTIVO'}
                      </span>
                    </div>

                    <p className="text-sm mb-2" style={{ color: 'var(--text-gray)' }}>
                      {property.tipologia.charAt(0).toUpperCase() + property.tipologia.slice(1)} • {property.zona}
                    </p>

                    <p className="text-lg font-bold mb-3" style={{ color: 'var(--primary-blue)' }}>
                      {formatPrice(property.prezzo)}
                    </p>

                    {/* Features */}
                    {property.caratteristiche && (
                      <div className="flex flex-wrap gap-2 mb-3 text-xs">
                        {property.caratteristiche.mq && (
                          <span className="bg-gray-100 px-2 py-1 rounded">{property.caratteristiche.mq} mq</span>
                        )}
                        {property.caratteristiche.locali && (
                          <span className="bg-gray-100 px-2 py-1 rounded">{property.caratteristiche.locali} locali</span>
                        )}
                        {property.caratteristiche.bagni && (
                          <span className="bg-gray-100 px-2 py-1 rounded">{property.caratteristiche.bagni} bagni</span>
                        )}
                        {property.caratteristiche.posto_auto && (
                          <span className="bg-blue-100 px-2 py-1 rounded text-blue-800">Posto auto</span>
                        )}
                      </div>
                    )}

                    {/* Brochure indicator */}
                    {property.brochure_url && (
                      <div className="mb-3">
                        <a
                          href={property.brochure_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
                        >
                          📄 Brochure disponibile
                        </a>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => startEdit(property)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          ✏️ Modifica
                        </button>
                        <button
                          onClick={() => toggleActive(property.id, property.is_active)}
                          className={property.is_active ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900"}
                        >
                          {property.is_active ? '❌ Disattiva' : '✅ Attiva'}
                        </button>
                        <button
                          onClick={() => deleteProperty(property.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          🗑️ Elimina
                        </button>
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-gray)' }}>
                        {new Date(property.created_at).toLocaleDateString('it-IT')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}