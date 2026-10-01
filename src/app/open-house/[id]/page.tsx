'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAdmin } from '@/lib/auth'
import Logo from '@/components/Logo'

// Helper function per rimuovere i secondi dagli orari
const formatTime = (timeString: string): string => {
  return timeString.slice(0, 5) // Prende solo HH:MM
}

interface Property {
  id: string
  titolo: string
  descrizione: string
  prezzo: number
  tipologia: string
  zona: string
  indirizzo: string
  caratteristiche: any
  immagini: string[]
  brochure_url?: string
}

interface OpenHouse {
  id: string
  property_id: string
  agent_id: string
  data_evento: string
  ora_inizio: string
  ora_fine: string
  durata_slot_minuti: number
  max_partecipanti_slot: number
  descrizione: string
  is_active: boolean
  property: Property
  agent: {
    id: string
    nome: string
    cognome: string
    email: string
  }
}

interface TimeSlot {
  id: string
  open_house_id: string
  data_slot: string
  ora_inizio: string
  ora_fine: string
  posti_disponibili: number
  posti_occupati: number
  is_available: boolean
  max_partecipanti?: number
  gre_bookings?: Array<{
    id: string
    status: string
    client_id: string
  }>
}

interface BookingForm {
  nome: string
  cognome: string
  email: string
  telefono: string
  messaggio: string
  agente_referente_id: string
  privacy_accepted: boolean
  marketing_accepted: boolean
}

interface QuestionnaireData {
  vendita_immobile: string
  necessita_mutuo: string
  stato_mutuo: string
  tempistiche_acquisto: string
  corrispondenza_immobile: string
}

export default function OpenHouseDetail() {
  const params = useParams()
  const router = useRouter()
  const openHouseId = params.id as string
  const searchParams = useSearchParams()
  const refAgentId = searchParams.get('ref') || ''
  const { agent } = useAuth()

  const [openHouse, setOpenHouse] = useState<OpenHouse | null>(null)
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [totalBookings, setTotalBookings] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [showBookingForm, setShowBookingForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [formData, setFormData] = useState<BookingForm>({
    nome: '',
    cognome: '',
    email: '',
    telefono: '',
    messaggio: '',
    agente_referente_id: '',
    privacy_accepted: false,
    marketing_accepted: false
  })
  const [referenceAgents, setReferenceAgents] = useState<Array<{ id: string; nome: string; cognome: string }>>([])
  const [loadingAgents, setLoadingAgents] = useState(false)

  // Modal questionnaire state
  const [showQuestionnaire, setShowQuestionnaire] = useState(false)
  const [submittingQuestionnaire, setSubmittingQuestionnaire] = useState(false)
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [shareTooltip, setShareTooltip] = useState('')
  const [questionnaireData, setQuestionnaireData] = useState<QuestionnaireData>({
    vendita_immobile: '',
    necessita_mutuo: '',
    stato_mutuo: '',
    tempistiche_acquisto: '',
    corrispondenza_immobile: ''
  })

  const getShareUrl = () => {
    const base = window.location.origin
    return refAgentId ? `${base}/oh/${openHouseId}?ref=${refAgentId}` : `${base}/oh/${openHouseId}`
  }

  const handleShare = async () => {
    const shortUrl = getShareUrl()
    const shareData = {
      title: openHouse ? `Open House - ${openHouse.property.titolo}` : 'Open House',
      text: openHouse ? `Visita l'Open House: ${openHouse.property.titolo} - ${openHouse.property.zona}` : '',
      url: shortUrl
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        // L'utente ha annullato la condivisione, ignora
      }
    } else {
      await navigator.clipboard.writeText(shortUrl)
      setShareTooltip('Link copiato!')
      setTimeout(() => setShareTooltip(''), 2000)
    }
  }

  useEffect(() => {
    if (openHouseId) {
      loadOpenHouseData()
    }
  }, [openHouseId])

  // Carosello automatico delle immagini
  useEffect(() => {
    if (openHouse?.property.immagini && openHouse.property.immagini.length > 1) {
      const interval = setInterval(() => {
        setCurrentImageIndex(prevIndex =>
          prevIndex === openHouse.property.immagini.length - 1 ? 0 : prevIndex + 1
        )
      }, 4000) // Cambia immagine ogni 4 secondi

      return () => clearInterval(interval)
    }
  }, [openHouse?.property.immagini])

  const loadOpenHouseData = async () => {
    try {
      const response = await fetch(`/api/public/open-house/${openHouseId}`, { cache: 'no-store' })
      if (!response.ok) {
        console.error('Error loading open house:', response.status)
        return
      }
      const data = await response.json()
      setOpenHouse(data.openHouse)
      setTimeSlots(data.timeSlots || [])
      setTotalBookings(data.totalBookings || 0)
      setReferenceAgents(data.referenceAgents || [])
      // Se il link è stato inviato da un agente, lo preseleziono come agente di riferimento
      if (refAgentId && (data.referenceAgents || []).some((a: { id: string }) => a.id === refAgentId)) {
        setFormData(prev => (prev.agente_referente_id ? prev : { ...prev, agente_referente_id: refAgentId }))
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
      setLoadingAgents(false)
    }
  }

  const bookingFormRef = useRef<HTMLDivElement>(null)

  const handleSlotSelection = (slotId: string) => {
    setSelectedSlot(slotId)
    setShowBookingForm(true)
    setTimeout(() => {
      bookingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedSlot || !openHouse) return

    if (!formData.privacy_accepted) {
      alert('È necessario accettare l\'informativa privacy per procedere.')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openHouseId,
          slotId: selectedSlot,
          nome: formData.nome,
          cognome: formData.cognome,
          email: formData.email,
          telefono: formData.telefono,
          messaggio: formData.messaggio,
          agente_referente_id: formData.agente_referente_id || null,
          privacy_accepted: formData.privacy_accepted,
          marketing_accepted: formData.marketing_accepted
        })
      })
      const result = await response.json()

      if (!response.ok) {
        alert(result.error || 'Errore durante la prenotazione. Riprova.')
        // Aggiorna gli orari: potrebbe essere stato preso da un altro
        await loadOpenHouseData()
        return
      }

      // Ricarica gli slot per aggiornare la disponibilità
      await loadOpenHouseData()

      // Apri il modal del questionario
      setCurrentBookingId(result.bookingId)
      setShowBookingForm(false)
      setShowQuestionnaire(true)

    } catch (error) {
      console.error('Error:', error)
      alert('Errore durante la prenotazione. Riprova.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleQuestionnaireSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentBookingId) return

    setSubmittingQuestionnaire(true)

    try {
      // Salva le risposte e invia le email di conferma (tutto lato server)
      const response = await fetch(`/api/public/bookings/${currentBookingId}/questionnaire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(questionnaireData)
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        console.error('Questionnaire error:', result.error)
      }

      // 4. Chiudi modal e mostra successo
      setShowQuestionnaire(false)
      setShowSuccess(true)

      // Reset form
      setSelectedSlot(null)
      setFormData({
        nome: '',
        cognome: '',
        email: '',
        telefono: '',
        messaggio: '',
        agente_referente_id: refAgentId,
        privacy_accepted: false,
        marketing_accepted: false
      })
      setQuestionnaireData({
        vendita_immobile: '',
        necessita_mutuo: '',
        stato_mutuo: '',
        tempistiche_acquisto: '',
        corrispondenza_immobile: ''
      })

    } catch (error) {
      console.error('Error submitting questionnaire:', error)
      alert('Errore nell\'invio del questionario. La prenotazione è comunque confermata.')
    } finally {
      setSubmittingQuestionnaire(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
      </div>
    )
  }

  if (!openHouse) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-dark)' }}>Open House non trovato</h1>
          <button
            onClick={() => router.push('/')}
            className="btn-primary"
          >
            Torna alla Homepage
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header style={{ backgroundColor: 'var(--primary-blue)' }} className="text-white py-1 md:py-0 md:h-16">
        <div className="container mx-auto px-4 h-full">
          <div className="flex justify-between items-center h-full">
            <Logo height={56} />
            <div className="flex items-center gap-2 md:gap-3">
              <div className="relative">
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 md:gap-2 bg-white/15 hover:bg-white/25 text-white px-3 py-2 md:px-4 rounded-lg transition-all text-sm font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  <span className="hidden sm:inline">Condividi</span>
                </button>
                {shareTooltip && (
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                    {shareTooltip}
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                )}
              </div>
              <button
                onClick={() => router.push(agent && isAdmin(agent) ? '/admin/dashboard' : '/')}
                className="text-white hover:text-gray-200 transition-colors nav-text text-sm"
              >
                <span className="hidden sm:inline">← {agent && isAdmin(agent) ? 'DASHBOARD' : 'TORNA AGLI OPEN HOUSE'}</span>
                <span className="sm:hidden">← INDIETRO</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4 md:py-8">
        <div className="max-w-6xl mx-auto">

          {/* Property Header */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
            {/* Property Images Carousel */}
            <div className="h-56 md:h-96 relative overflow-hidden">
              {openHouse.property.immagini && openHouse.property.immagini.length > 0 ? (
                <div className="relative h-full">
                  {/* Main carousel container */}
                  <div className="relative h-full">
                    {openHouse.property.immagini.map((image, index) => (
                      <div
                        key={index}
                        className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                          index === currentImageIndex ? 'opacity-100' : 'opacity-0'
                        }`}
                      >
                        <img
                          src={image}
                          alt={`${openHouse.property.titolo} - Foto ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Navigation arrows */}
                  {openHouse.property.immagini.length > 1 && (
                    <>
                      <button
                        onClick={() => setCurrentImageIndex(prev =>
                          prev === 0 ? openHouse.property.immagini.length - 1 : prev - 1
                        )}
                        className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all"
                      >
                        ‹
                      </button>
                      <button
                        onClick={() => setCurrentImageIndex(prev =>
                          prev === openHouse.property.immagini.length - 1 ? 0 : prev + 1
                        )}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all"
                      >
                        ›
                      </button>
                    </>
                  )}

                  {/* Image navigation indicators */}
                  {openHouse.property.immagini.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
                      {openHouse.property.immagini.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentImageIndex(index)}
                          className={`w-3 h-3 rounded-full transition-all ${
                            index === currentImageIndex ? 'bg-white' : 'bg-white/50 hover:bg-white/70'
                          }`}
                        />
                      ))}
                    </div>
                  )}

                  {/* Image count indicator */}
                  <div className="absolute top-4 right-4 bg-black bg-opacity-70 text-white text-sm px-3 py-1 rounded">
                    {currentImageIndex + 1} / {openHouse.property.immagini.length}
                  </div>
                </div>
              ) : null}

              {/* Fallback placeholder */}
              <div
                className="w-full h-full bg-gradient-to-r from-gray-200 to-gray-300 flex items-center justify-center"
                style={{ display: openHouse.property.immagini?.length > 0 ? 'none' : 'flex' }}
              >
                <span style={{ color: 'var(--text-gray)' }}>Immagine non disponibile</span>
              </div>
            </div>

            <div className="p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2" style={{ color: 'var(--text-dark)' }}>
                    {openHouse.property.titolo}
                  </h1>
                  <p className="text-base md:text-lg" style={{ color: 'var(--text-gray)' }}>
                    {openHouse.property.zona}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-2xl md:text-4xl font-bold" style={{ color: 'var(--primary-blue)' }}>
                    {openHouse.property.caratteristiche?.cantiere && openHouse.property.prezzo
                      ? <>Prezzo a partire da {openHouse.property.prezzo.toLocaleString('it-IT')} &euro;</>
                      : <>{openHouse.property.prezzo?.toLocaleString('it-IT')} &euro;</>
                    }
                  </p>
                  <p className="text-sm capitalize" style={{ color: 'var(--text-gray)' }}>
                    {openHouse.property.tipologia}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
                {openHouse.property.caratteristiche?.mq && (
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className="font-semibold" style={{ color: 'var(--primary-blue)' }}>
                      {openHouse.property.caratteristiche.mq} m²
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-gray)' }}>Superficie</div>
                  </div>
                )}
                {openHouse.property.caratteristiche?.locali && (
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className="font-semibold" style={{ color: 'var(--primary-blue)' }}>
                      {openHouse.property.caratteristiche.locali}
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-gray)' }}>Locali</div>
                  </div>
                )}
                {openHouse.property.caratteristiche?.bagni && (
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className="font-semibold" style={{ color: 'var(--primary-blue)' }}>
                      {openHouse.property.caratteristiche.bagni}
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-gray)' }}>Bagni</div>
                  </div>
                )}
                {openHouse.property.caratteristiche?.piano && (
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className="font-semibold" style={{ color: 'var(--primary-blue)' }}>
                      Piano {openHouse.property.caratteristiche.piano}
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-gray)' }}>Piano</div>
                  </div>
                )}
                {openHouse.property.caratteristiche?.cantiere && openHouse.property.caratteristiche?.unita_totali && (
                  <div className="text-center p-3 bg-yellow-50 rounded">
                    <div className="font-semibold" style={{ color: 'var(--primary-blue)' }}>
                      {openHouse.property.caratteristiche.unita_totali}
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-gray)' }}>{`Unit\u00E0 in vendita`}</div>
                  </div>
                )}
              </div>

              <p className="text-lg leading-relaxed" style={{ color: 'var(--text-dark)' }}>
                {openHouse.property.descrizione}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">

            {/* Open House Info */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-md p-4 md:p-6">
                <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-dark)' }}>
                  Informazioni Open House
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--primary-blue)' }}>
                      Data e Orario
                    </h3>
                    <p style={{ color: 'var(--text-dark)' }}>
                      {new Date(openHouse.data_evento).toLocaleDateString('it-IT', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                    <p className="font-medium" style={{ color: 'var(--text-dark)' }}>
                      {formatTime(openHouse.ora_inizio)} - {formatTime(openHouse.ora_fine)}
                    </p>
                  </div>

                  <div className="p-4 bg-green-50 rounded-lg">
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--primary-blue)' }}>
                      Agente di riferimento
                    </h3>
                    <p className="font-medium" style={{ color: 'var(--text-dark)' }}>
                      {openHouse.agent.nome} {openHouse.agent.cognome}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-gray)' }}>
                      {openHouse.agent.email}
                    </p>
                  </div>
                </div>

                {openHouse.descrizione && (
                  <div className="mb-6">
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--primary-blue)' }}>
                      Note aggiuntive
                    </h3>
                    <p style={{ color: 'var(--text-dark)' }}>{openHouse.descrizione}</p>
                  </div>
                )}

                {/* Time Slots */}
                <div>
                  <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-dark)' }}>
                    Scegli il tuo slot di visita
                  </h3>

                  {/* Riprova sociale: numero reale di prenotati, mostrato oltre le 5 prenotazioni */}
                  {totalBookings > 5 && (
                    <div className="mb-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: '#fff4e5', color: '#b45309' }}>
                      🔥 Già {totalBookings} persone prenotate per questo Open House
                    </div>
                  )}

                  {timeSlots.length === 0 ? (
                    <div className="text-center py-8">
                      <p style={{ color: 'var(--text-gray)' }}>
                        Nessuno slot disponibile per questo Open House.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {timeSlots.map((slot) => {
                        const isSlotOccupied = slot.posti_occupati >= slot.posti_disponibili

                        return (
                        <button
                          key={slot.id}
                          onClick={() => handleSlotSelection(slot.id)}
                          disabled={isSlotOccupied}
                          className={`p-4 md:p-4 min-h-[56px] rounded-lg border-2 transition-all ${
                            isSlotOccupied
                              ? 'bg-red-50 border-red-300 cursor-not-allowed opacity-70'
                              : selectedSlot === slot.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          <div className={`font-medium ${
                            isSlotOccupied
                              ? 'text-red-600'
                              : 'text-gray-900'
                          }`}>
                            {formatTime(slot.ora_inizio)} - {formatTime(slot.ora_fine)}
                          </div>
                          <div className={`text-sm mt-1 ${
                            isSlotOccupied
                              ? 'text-red-500'
                              : 'text-gray-600'
                          }`}>
                            {isSlotOccupied
                              ? 'Non Disponibile'
                              : 'Disponibile'
                            }
                          </div>
                        </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Booking Form */}
            <div ref={bookingFormRef}>
              {showBookingForm && selectedSlot && (
                <div className="bg-white rounded-lg shadow-md p-4 md:p-6 lg:sticky lg:top-6">
                  <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-dark)' }}>
                    Completa la prenotazione
                  </h3>

                  <form onSubmit={handleFormSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-dark)' }}>
                          Nome *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.nome}
                          onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-dark)' }}>
                          Cognome *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.cognome}
                          onChange={(e) => setFormData({ ...formData, cognome: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-dark)' }}>
                        Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-dark)' }}>
                        Telefono *
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.telefono}
                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-dark)' }}>
                        Messaggio (opzionale)
                      </label>
                      <textarea
                        rows={3}
                        value={formData.messaggio}
                        onChange={(e) => setFormData({ ...formData, messaggio: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Domande o richieste speciali..."
                      />
                    </div>

                    {/* Agente di riferimento */}
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-dark)' }}>
                        Agente di riferimento (opzionale)
                      </label>
                      <select
                        value={formData.agente_referente_id}
                        onChange={(e) => setFormData({ ...formData, agente_referente_id: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        disabled={loadingAgents}
                      >
                        <option value="">Nessuno / Non so</option>
                        {referenceAgents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nome} {a.cognome}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-gray)' }}>
                        {`Se ha gi\u00E0 un agente di riferimento, lo selezioni qui`}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={formData.privacy_accepted}
                          onChange={(e) => setFormData({ ...formData, privacy_accepted: e.target.checked })}
                          className="mt-1"
                        />
                        <span className="text-sm" style={{ color: 'var(--text-dark)' }}>
                          Accetto l&apos;<a href="#" className="text-blue-600 underline">informativa privacy</a> e
                          autorizzo il trattamento dei dati personali per la gestione della prenotazione. *
                        </span>
                      </label>

                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={formData.marketing_accepted}
                          onChange={(e) => setFormData({ ...formData, marketing_accepted: e.target.checked })}
                          className="mt-1"
                        />
                        <span className="text-sm" style={{ color: 'var(--text-dark)' }}>
                          Accetto di ricevere comunicazioni commerciali e newsletter da Ghergo Immobiliare.
                        </span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full btn-primary py-3 font-semibold disabled:opacity-50"
                    >
                      {submitting ? 'Prenotazione in corso...' : 'CONTINUA'}
                    </button>

                    <p className="text-xs text-center" style={{ color: 'var(--text-gray)' }}>
                      Ultimo passaggio: alcune domande veloci, obbligatorie per confermare la prenotazione
                      e riceverai via email la conferma con la brochure dell&apos;immobile.
                    </p>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Questionnaire Modal */}
      {showQuestionnaire && (() => {
        const answeredCount = [
          questionnaireData.vendita_immobile,
          questionnaireData.necessita_mutuo,
          questionnaireData.stato_mutuo,
          questionnaireData.tempistiche_acquisto,
          questionnaireData.corrispondenza_immobile
        ].filter(v => v !== '').length
        // Chi compra senza mutuo non vede la domanda sulla banca
        const totalQuestions = questionnaireData.necessita_mutuo === 'no' ? 4 : 5
        const shownAnswered = questionnaireData.necessita_mutuo === 'no' ? answeredCount - (questionnaireData.stato_mutuo ? 1 : 0) : answeredCount
        const progressPercent = (shownAnswered / totalQuestions) * 100

        return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <style>{`
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes scaleIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
            .q-radio-option { transition: all 0.15s ease; }
            .q-radio-option:hover { transform: translateX(4px); }
            .q-radio-option input[type="radio"]:checked + span { font-weight: 600; }
          `}</style>
          <div
            className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full max-w-2xl md:mx-4 max-h-[95vh] md:max-h-[90vh] overflow-y-auto"
            style={{ animation: 'slideUp 0.4s ease-out' }}
          >
            {/* Modal Header */}
            <div className="sticky top-0 z-10 rounded-t-2xl px-6 pt-6 pb-4" style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Ultimo passaggio per confermare</h2>
                  <p className="text-sm text-blue-100 mt-1">
                    Il suo orario è riservato. Per confermare la prenotazione risponda a queste domande: sono obbligatorie e ci servono per preparare al meglio la visita.
                  </p>
                </div>
                <div className="flex-shrink-0 ml-4 bg-white/20 rounded-full px-3 py-1">
                  <span className="text-sm font-semibold text-white">{shownAnswered}/{totalQuestions}</span>
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-4 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%`, backgroundColor: '#34d399' }}
                />
              </div>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleQuestionnaireSubmit} className="p-6 space-y-5">
              {/* Domanda 1 - Vendita immobile */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: questionnaireData.vendita_immobile ? '#34d399' : '#94a3b8' }}>
                      {questionnaireData.vendita_immobile ? '\u2713' : '1'}
                    </span>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-dark)' }}>
                      Per procedere con l&apos;acquisto, deve prima vendere un altro immobile?
                    </h3>
                  </div>
                </div>
                <div className="p-4 space-y-1">
                  {[
                    { value: 'no', label: 'No, non devo vendere nulla' },
                    { value: 'si_in_vendita', label: 'S\u00ec, devo vendere ma l\'immobile \u00e8 gi\u00e0 in vendita' },
                    { value: 'si_non_in_vendita', label: 'S\u00ec, devo vendere ma non \u00e8 ancora in vendita' },
                    { value: 'si_posso_acquistare_prima', label: 'S\u00ec, ma posso acquistare anche prima di vendere' }
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`q-radio-option flex items-center gap-3 px-3 md:px-4 py-3 md:py-2.5 rounded-lg cursor-pointer border ${
                        questionnaireData.vendita_immobile === option.value
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-transparent hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="vendita_immobile"
                        value={option.value}
                        checked={questionnaireData.vendita_immobile === option.value}
                        onChange={(e) => setQuestionnaireData({ ...questionnaireData, vendita_immobile: e.target.value })}
                        required
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm" style={{ color: 'var(--text-dark)' }}>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Domanda 2 - Necessità mutuo */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: questionnaireData.necessita_mutuo ? '#34d399' : '#94a3b8' }}>
                      {questionnaireData.necessita_mutuo ? '\u2713' : '2'}
                    </span>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-dark)' }}>
                      Per l&apos;acquisto è necessario accedere ad un mutuo?
                    </h3>
                  </div>
                </div>
                <div className="p-4 space-y-1">
                  {[
                    { value: 'no', label: 'No, acquisto senza mutuo' },
                    { value: 'si_parziale', label: 'S\u00ec, per una parte dell\'importo (non superiore all\' 80%)' },
                    { value: 'si_maggior_parte', label: 'S\u00ec, per la maggior parte dell\'importo (superiore all\' 80%)' }
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`q-radio-option flex items-center gap-3 px-3 md:px-4 py-3 md:py-2.5 rounded-lg cursor-pointer border ${
                        questionnaireData.necessita_mutuo === option.value
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-transparent hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="necessita_mutuo"
                        value={option.value}
                        checked={questionnaireData.necessita_mutuo === option.value}
                        onChange={(e) => {
                          const v = e.target.value
                          setQuestionnaireData({
                            ...questionnaireData,
                            necessita_mutuo: v,
                            // senza mutuo la domanda sulla banca non serve
                            stato_mutuo: v === 'no' ? 'non_richiedo' : (questionnaireData.stato_mutuo === 'non_richiedo' ? '' : questionnaireData.stato_mutuo)
                          })
                        }}
                        required
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm" style={{ color: 'var(--text-dark)' }}>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {questionnaireData.necessita_mutuo !== 'no' && (<>
              {/* Domanda 3 - Stato mutuo */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: questionnaireData.stato_mutuo ? '#34d399' : '#94a3b8' }}>
                      {questionnaireData.stato_mutuo ? '\u2713' : '3'}
                    </span>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-dark)' }}>
                      Se necessita di mutuo, ha già parlato con una banca o un consulente del credito?
                    </h3>
                  </div>
                </div>
                <div className="p-4 space-y-1">
                  {[
                    { value: 'pre_delibera', label: 'S\u00ec, ho gi\u00e0 una pre-delibera' },
                    { value: 'simulazione', label: 'S\u00ec, ho fatto una simulazione ma non ho ancora una pre-delibera' },
                    { value: 'appuntamento', label: 'Ho un appuntamento fissato' },
                    { value: 'non_informato', label: 'No, non mi sono ancora informato' },
                    { value: 'ricontatto_consulente', label: 'Vorrei essere ricontattato da un consulente mutui' }
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`q-radio-option flex items-center gap-3 px-3 md:px-4 py-3 md:py-2.5 rounded-lg cursor-pointer border ${
                        questionnaireData.stato_mutuo === option.value
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-transparent hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="stato_mutuo"
                        value={option.value}
                        checked={questionnaireData.stato_mutuo === option.value}
                        onChange={(e) => setQuestionnaireData({ ...questionnaireData, stato_mutuo: e.target.value })}
                        required
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm" style={{ color: 'var(--text-dark)' }}>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              </>)}

              {/* Domanda 4 - Tempistiche */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: questionnaireData.tempistiche_acquisto ? '#34d399' : '#94a3b8' }}>
                      {questionnaireData.tempistiche_acquisto ? '\u2713' : '4'}
                    </span>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-dark)' }}>
                      In che tempi prevede di acquistare?
                    </h3>
                  </div>
                </div>
                <div className="p-4 space-y-1">
                  {[
                    { value: 'entro_30_giorni', label: 'Entro 30 giorni' },
                    { value: 'entro_3_mesi', label: 'Entro 3 mesi' },
                    { value: 'entro_6_mesi', label: 'Entro 6 mesi' },
                    { value: 'oltre_6_mesi', label: 'Oltre 6 mesi' },
                    { value: 'solo_valutando', label: 'Sto solo valutando' }
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`q-radio-option flex items-center gap-3 px-3 md:px-4 py-3 md:py-2.5 rounded-lg cursor-pointer border ${
                        questionnaireData.tempistiche_acquisto === option.value
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-transparent hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tempistiche_acquisto"
                        value={option.value}
                        checked={questionnaireData.tempistiche_acquisto === option.value}
                        onChange={(e) => setQuestionnaireData({ ...questionnaireData, tempistiche_acquisto: e.target.value })}
                        required
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm" style={{ color: 'var(--text-dark)' }}>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Domanda 5 - Corrispondenza immobile */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: questionnaireData.corrispondenza_immobile ? '#34d399' : '#94a3b8' }}>
                      {questionnaireData.corrispondenza_immobile ? '\u2713' : '5'}
                    </span>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-dark)' }}>
                      L&apos;immobile proposto rispecchia le caratteristiche che sta cercando?
                    </h3>
                  </div>
                </div>
                <div className="p-4 space-y-1">
                  {[
                    { value: '100_percento', label: 'S\u00ec, corrisponde al 100%' },
                    { value: '80_90_percento', label: 'Corrisponde in gran parte (80\u201390%)' },
                    { value: 'parzialmente', label: 'Parzialmente (mancano alcuni elementi importanti)' },
                    { value: 'no_altro', label: 'No, sto ancora cercando altro' }
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`q-radio-option flex items-center gap-3 px-3 md:px-4 py-3 md:py-2.5 rounded-lg cursor-pointer border ${
                        questionnaireData.corrispondenza_immobile === option.value
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-transparent hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="corrispondenza_immobile"
                        value={option.value}
                        checked={questionnaireData.corrispondenza_immobile === option.value}
                        onChange={(e) => setQuestionnaireData({ ...questionnaireData, corrispondenza_immobile: e.target.value })}
                        required
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm" style={{ color: 'var(--text-dark)' }}>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submittingQuestionnaire || answeredCount < 5}
                  className="w-full py-4 font-bold text-lg text-white rounded-xl disabled:opacity-40 transition-all duration-200 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
                  style={{ background: answeredCount >= 5 ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' : '#94a3b8' }}
                >
                  {submittingQuestionnaire ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full"></span>
                      Invio in corso...
                    </span>
                  ) : answeredCount < 5 ? (
                    `COMPLETA TUTTE LE DOMANDE (${answeredCount}/5)`
                  ) : (
                    'CONFERMA PRENOTAZIONE'
                  )}
                </button>
                <p className="text-xs text-center mt-3" style={{ color: 'var(--text-gray)' }}>
                  Dopo l&apos;invio riceverai un&apos;email di conferma con la brochure dell&apos;immobile.
                </p>
              </div>
            </form>
          </div>
        </div>
        )
      })()}

      {/* Success Message */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
            style={{ animation: 'scaleIn 0.4s ease-out' }}
          >
            <div className="px-8 pt-10 pb-6 text-center" style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' }}>
              <div className="w-20 h-20 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">
                Prenotazione Confermata!
              </h2>
              <p className="text-blue-100 text-sm">
                Grazie per aver completato il questionario
              </p>
            </div>
            <div className="px-8 py-6 text-center">
              <p className="mb-1" style={{ color: 'var(--text-dark)' }}>
                Ti abbiamo inviato un&apos;email di conferma
              </p>
              <p className="mb-6 text-sm" style={{ color: 'var(--text-gray)' }}>
                con tutti i dettagli della prenotazione e la brochure dell&apos;immobile.
              </p>
              <button
                onClick={() => setShowSuccess(false)}
                className="w-full py-3 font-semibold text-white rounded-xl transition-all duration-200 hover:shadow-lg"
                style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' }}
              >
                CHIUDI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
