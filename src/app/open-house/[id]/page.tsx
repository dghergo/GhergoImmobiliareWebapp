'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAdmin } from '@/lib/auth'
import Image from 'next/image'
import { niceText } from '@/lib/text'
import Countdown from '@/components/public/Countdown'
import Photo from '@/components/public/Photo'

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
  has_brochure?: boolean
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
  descrizione?: string
  descrizione_evento?: string | null
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


// Domande del questionario (obbligatorio per prenotare). I valori devono coincidere con lib/questionnaire.ts
const QUESTIONS: { key: keyof QuestionnaireData; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: 'vendita_immobile',
    label: 'Per acquistare devi prima vendere un altro immobile?',
    options: [
      { value: 'no', label: 'No, non devo vendere' },
      { value: 'si_in_vendita', label: 'Sì, ed è già in vendita' },
      { value: 'si_non_in_vendita', label: 'Sì, ma non è ancora in vendita' },
      { value: 'si_posso_acquistare_prima', label: 'Sì, ma posso comprare anche prima di vendere' },
    ],
  },
  {
    key: 'necessita_mutuo',
    label: 'Ti servirà un mutuo?',
    options: [
      { value: 'no', label: 'No, compro senza mutuo' },
      { value: 'si_parziale', label: 'Sì, fino all\u201980% del prezzo' },
      { value: 'si_maggior_parte', label: 'Sì, per più dell\u201980% del prezzo' },
    ],
  },
  {
    key: 'stato_mutuo',
    label: 'Hai già parlato con una banca?',
    options: [
      { value: 'pre_delibera', label: 'Sì, ho già una pre-delibera' },
      { value: 'simulazione', label: 'Sì, ho fatto una simulazione' },
      { value: 'appuntamento', label: 'Ho un appuntamento fissato' },
      { value: 'non_informato', label: 'Non ancora' },
      { value: 'ricontatto_consulente', label: 'Vorrei essere contattato da un consulente mutui' },
    ],
  },
  {
    key: 'tempistiche_acquisto',
    label: 'Quando vorresti acquistare?',
    options: [
      { value: 'entro_30_giorni', label: 'Entro 30 giorni' },
      { value: 'entro_3_mesi', label: 'Entro 3 mesi' },
      { value: 'entro_6_mesi', label: 'Entro 6 mesi' },
      { value: 'oltre_6_mesi', label: 'Tra più di 6 mesi' },
      { value: 'solo_valutando', label: 'Sto solo valutando' },
    ],
  },
  {
    key: 'corrispondenza_immobile',
    label: 'Da foto e descrizione, l\u2019immobile corrisponde a quello che cerchi?',
    options: [
      { value: '100_percento', label: 'Sì, in pieno' },
      { value: '80_90_percento', label: 'In gran parte' },
      { value: 'parzialmente', label: 'In parte, mancano cose importanti' },
      { value: 'no_altro', label: 'No, sto cercando altro' },
    ],
  },
]

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
  const [showGallery, setShowGallery] = useState(false)
  const [brochureUrl, setBrochureUrl] = useState<string | null>(null)
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

  // Passo 1: controlla i dati e apre il questionario. La prenotazione NON viene ancora registrata.
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedSlot || !openHouse) return

    if (!formData.privacy_accepted) {
      alert('È necessario accettare l\'informativa privacy per procedere.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.email.trim())) {
      alert('Inserisci un indirizzo email valido.')
      return
    }
    if (formData.telefono.replace(/\D/g, '').length < 6) {
      alert('Inserisci un numero di telefono valido.')
      return
    }

    setShowBookingForm(false)
    setShowQuestionnaire(true)
  }

  // Torna al modulo (per cambiare orario o dati) senza perdere le risposte
  const backToForm = () => {
    setShowQuestionnaire(false)
    setShowBookingForm(true)
    setTimeout(() => {
      bookingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  // Passo 2: invio del questionario = registrazione della prenotazione (tutto insieme, lato server)
  const handleQuestionnaireSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedSlot || !openHouse) return

    setSubmittingQuestionnaire(true)

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
          marketing_accepted: formData.marketing_accepted,
          questionario: questionnaireData
        })
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        alert(result.error || 'Errore durante la prenotazione. Riprova.')
        // Aggiorna gli orari (potrebbe essere stato preso da un altro) e torna alla scelta
        await loadOpenHouseData()
        if (response.status === 409) {
          setSelectedSlot(null)
          backToForm()
        }
        return
      }

      setCurrentBookingId(result.bookingId)
      setBrochureUrl(result.brochureUrl || null)
      await loadOpenHouseData()

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
      console.error('Error submitting booking:', error)
      alert('Errore durante la prenotazione. Controlla la connessione e riprova.')
    } finally {
      setSubmittingQuestionnaire(false)
    }
  }

  // ---------- Rendering ----------
  const property = openHouse?.property
  const images = property?.immagini || []
  const isPast = openHouse ? new Date(`${openHouse.data_evento}T${openHouse.ora_fine}`) < new Date() : false
  const eventDate = openHouse
    ? new Date(openHouse.data_evento + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
    : ''
  const priceLabel = property?.prezzo
    ? `${property.caratteristiche?.cantiere ? 'da ' : ''}${property.prezzo.toLocaleString('it-IT')} €`
    : 'Prezzo su richiesta'
  const facts = property
    ? ([
        property.caratteristiche?.mq ? `${property.caratteristiche.mq} m²` : null,
        property.caratteristiche?.locali ? `${property.caratteristiche.locali} locali` : null,
        property.caratteristiche?.bagni ? `${property.caratteristiche.bagni} ${property.caratteristiche.bagni === 1 ? 'bagno' : 'bagni'}` : null,
        property.caratteristiche?.piano ? `Piano ${property.caratteristiche.piano}` : null,
        property.caratteristiche?.cantiere && property.caratteristiche?.unita_totali ? `${property.caratteristiche.unita_totali} unità in vendita` : null,
      ].filter(Boolean) as string[])
    : []
  const mapsUrl = property?.indirizzo
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.indirizzo} ${property.zona || ''}`)}`
    : null
  const freeSlots = timeSlots.filter(s => s.posti_occupati < s.posti_disponibili).length
  const selectedSlotData = timeSlots.find(s => s.id === selectedSlot)

  const scrollToBooking = () => {
    document.getElementById('prenota')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading) {
    return (
      <div className="pub min-h-screen flex items-center justify-center">
        <div className="pub-spinner" aria-label="Caricamento" />
      </div>
    )
  }

  if (!openHouse || !property) {
    return (
      <div className="pub min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="pub-h2 mb-3">Questo Open House non è disponibile</h1>
          <p className="pub-muted mb-8">Potrebbe essere stato concluso o rimosso. Guarda gli altri immobili in programma.</p>
          <button onClick={() => router.push('/')} className="pub-btn">Vedi tutti gli Open House</button>
        </div>
      </div>
    )
  }

  const visibleQuestions = QUESTIONS.filter(q => !(q.key === 'stato_mutuo' && questionnaireData.necessita_mutuo === 'no'))
  const answered = visibleQuestions.filter(q => questionnaireData[q.key] !== '').length
  const allAnswered = answered === visibleQuestions.length

  const setAnswer = (key: keyof QuestionnaireData, value: string) => {
    if (key === 'necessita_mutuo') {
      setQuestionnaireData({
        ...questionnaireData,
        necessita_mutuo: value,
        // senza mutuo la domanda sulla banca non serve
        stato_mutuo: value === 'no' ? 'non_richiedo' : questionnaireData.stato_mutuo === 'non_richiedo' ? '' : questionnaireData.stato_mutuo,
      })
    } else {
      setQuestionnaireData({ ...questionnaireData, [key]: value })
    }
  }

  return (
    <div className="pub min-h-screen">
      {/* Apertura a tutto schermo con le foto dell'immobile */}
      <section className="pub-hero pub-hero-oh">
        <div className="pub-hero-media" aria-hidden="true">
          {images.length > 0 ? (
            images.slice(0, 5).map((src, i, arr) => (
              <Photo key={src} src={src} width={2500} quality={88} alt="" className="pub-kenburns" fetchPriority={i === 0 ? 'high' : 'low'} loading={i === 0 ? 'eager' : 'lazy'} style={{ animationDelay: `${i * 7}s`, animationDuration: `${Math.max(arr.length, 1) * 7}s` }} />
            ))
          ) : (
            <div className="pub-hero-fallback" />
          )}
        </div>
        <div className="pub-hero-shade" aria-hidden="true" />

        <header className="pub-hero-top pub-wrap">
          <button onClick={() => router.push(agent && isAdmin(agent) ? '/admin/dashboard' : '/')} aria-label="Ghergo Immobiliare, tutti gli Open House">
            <Image src="/logo-ghergo-blu.png" alt="Ghergo Immobiliare" width={190} height={48} className="h-9 md:h-12 w-auto pub-logo-white" priority />
          </button>
          <div className="flex items-center gap-5 md:gap-8">
            <button onClick={() => router.push('/')} className="pub-hero-link hidden sm:inline">Tutti gli Open House</button>
            <div className="relative">
              <button onClick={handleShare} className="pub-hero-link">Condividi</button>
              {shareTooltip && <div className="pub-toast">{shareTooltip}</div>}
            </div>
          </div>
        </header>

        <div className="pub-wrap pub-hero-body">
          <p className="pub-hero-kicker">{niceText(property.zona)}</p>
          <h1 className="pub-display pub-hero-title pub-hero-title-oh">
            <span className="pub-line"><span>{niceText(property.titolo)}</span></span>
          </h1>
          <div className="pub-hero-foot">
            <span className="pub-hero-price">{priceLabel}</span>
            {images.length > 0 && (
              <button className="pub-hero-photos" onClick={() => { setCurrentImageIndex(0); setShowGallery(true) }}>
                Guarda le {images.length} foto
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Contenuto + prenotazione */}
      <main className="pub-wrap grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-10 lg:gap-16 py-10 md:py-16">
        <article className="min-w-0">
          {facts.length > 0 && (
            <ul className="pub-facts">
              {facts.map(f => <li key={f}>{f}</li>)}
            </ul>
          )}

          {property.descrizione && (
            <div className="mt-10">
              <h2 className="pub-display pub-section-title-sm mb-5">L&apos;immobile</h2>
              <p className="pub-body whitespace-pre-line">{property.descrizione}</p>
            </div>
          )}

          {openHouse.descrizione_evento && (
            <div className="mt-10">
              <h2 className="pub-display pub-section-title-sm mb-5">Informazioni sulla visita</h2>
              <p className="pub-body whitespace-pre-line">{openHouse.descrizione_evento}</p>
            </div>
          )}

          {images.length > 1 && (
            <div className="pub-thumbs mt-12">
              {images.slice(0, 8).map((img, i) => (
                <button key={img} onClick={() => { setCurrentImageIndex(i); setShowGallery(true) }} aria-label={`Apri la foto ${i + 1}`}>
                  <Photo src={img} width={800} quality={82} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          <div className="pub-info mt-12">
            <div>
              <h2 className="pub-h3 mb-2">Dove</h2>
              <p className="pub-body">{niceText(property.indirizzo || property.zona)}</p>
              {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="pub-link mt-2 inline-block">Apri in Google Maps</a>}
            </div>
            <div>
              <h2 className="pub-h3 mb-2">Ti accoglie</h2>
              <p className="pub-body">{openHouse.agent.nome} {openHouse.agent.cognome}</p>
              <a href={`mailto:${openHouse.agent.email}`} className="pub-link mt-2 inline-block">{openHouse.agent.email}</a>
            </div>
            {property.has_brochure && (
              <div>
                <h2 className="pub-h3 mb-2">Brochure</h2>
                <p className="pub-body">Puoi scaricarla dopo la prenotazione e la riceverai anche per email.</p>
                {!isPast && <button onClick={scrollToBooking} className="pub-link mt-2 inline-block">Prenota la visita</button>}
              </div>
            )}
          </div>
        </article>

        {/* Pannello prenotazione */}
        <aside id="prenota" className="lg:sticky lg:top-8 self-start scroll-mt-6 lg:-mt-40 relative z-10">
          <div className="pub-panel">
            <div className="flex items-center gap-5">
              <div className="pub-cal pub-cal-lg" aria-hidden="true">
                <b>{new Date(openHouse.data_evento + 'T00:00:00').getDate()}</b>
                <small>{new Date(openHouse.data_evento + 'T00:00:00').toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')}</small>
              </div>
              <div>
                <p className="pub-muted text-sm">Open House</p>
                <p className="pub-date first-letter:uppercase">{eventDate}</p>
                <p className="pub-body">dalle {formatTime(openHouse.ora_inizio)} alle {formatTime(openHouse.ora_fine)}</p>
              </div>
            </div>
            {!isPast && (
              <div className="mt-6">
                <p className="pub-muted text-sm mb-2">Inizia tra</p>
                <Countdown date={openHouse.data_evento} time={openHouse.ora_inizio} tone="dark" />
              </div>
            )}

            {totalBookings > 5 && !isPast && (
              <p className="pub-proof mt-5">{totalBookings} persone hanno già prenotato la visita</p>
            )}

            <div className="pub-divider my-6" />

            {isPast ? (
              <p className="pub-body">Questo Open House si è concluso.</p>
            ) : timeSlots.length === 0 ? (
              <p className="pub-body">Gli orari di visita non sono ancora disponibili.</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="pub-h3">Scegli l&apos;orario</h2>
                  <span className="pub-muted text-sm">{freeSlots === 0 ? 'Tutto prenotato' : freeSlots === 1 ? 'Ultimo orario libero' : `${freeSlots} orari liberi`}</span>
                </div>
                <div className="pub-slots" role="list">
                  {timeSlots.map(slot => {
                    const full = slot.posti_occupati >= slot.posti_disponibili
                    const active = selectedSlot === slot.id
                    return (
                      <button
                        key={slot.id}
                        role="listitem"
                        onClick={() => handleSlotSelection(slot.id)}
                        disabled={full}
                        aria-pressed={active}
                        className={`pub-slot ${full ? 'is-full' : ''} ${active ? 'is-active' : ''}`}
                      >
                        <span className="pub-slot-time">{formatTime(slot.ora_inizio)}</span>
                        <span className="pub-slot-state">{full ? 'Completo' : active ? 'Scelto' : 'Libero'}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Modulo dati (dopo la scelta dell'orario) */}
            <div ref={bookingFormRef} className="scroll-mt-24">
              {showBookingForm && selectedSlotData && !isPast && (
                <form onSubmit={handleFormSubmit} className="mt-8 space-y-5">
                  <div className="pub-divider mb-6" />
                  <p className="pub-body">
                    Visita alle <strong className="font-semibold">{formatTime(selectedSlotData.ora_inizio)}</strong>. Inserisci i tuoi dati.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="pub-field">
                      <span>Nome</span>
                      <input type="text" required autoComplete="given-name" value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} />
                    </label>
                    <label className="pub-field">
                      <span>Cognome</span>
                      <input type="text" required autoComplete="family-name" value={formData.cognome} onChange={e => setFormData({ ...formData, cognome: e.target.value })} />
                    </label>
                  </div>
                  <label className="pub-field">
                    <span>Email</span>
                    <input type="email" required autoComplete="email" inputMode="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                  </label>
                  <label className="pub-field">
                    <span>Telefono</span>
                    <input type="tel" required autoComplete="tel" inputMode="tel" value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} />
                  </label>
                  <label className="pub-field">
                    <span>Agente di riferimento (facoltativo)</span>
                    <select value={formData.agente_referente_id} onChange={e => setFormData({ ...formData, agente_referente_id: e.target.value })} disabled={loadingAgents}>
                      <option value="">Nessuno</option>
                      {referenceAgents.map(a => <option key={a.id} value={a.id}>{a.nome} {a.cognome}</option>)}
                    </select>
                  </label>
                  <label className="pub-field">
                    <span>Messaggio (facoltativo)</span>
                    <textarea rows={2} value={formData.messaggio} onChange={e => setFormData({ ...formData, messaggio: e.target.value })} placeholder="Domande o richieste per l'agente" />
                  </label>

                  <div className="space-y-3 pt-1">
                    <label className="pub-check">
                      <input type="checkbox" checked={formData.privacy_accepted} onChange={e => setFormData({ ...formData, privacy_accepted: e.target.checked })} />
                      <span>Ho letto l&apos;informativa privacy e acconsento al trattamento dei dati per gestire la prenotazione (obbligatorio)</span>
                    </label>
                    <label className="pub-check">
                      <input type="checkbox" checked={formData.marketing_accepted} onChange={e => setFormData({ ...formData, marketing_accepted: e.target.checked })} />
                      <span>Voglio ricevere novità e nuovi immobili da Ghergo Immobiliare</span>
                    </label>
                  </div>

                  <button type="submit" disabled={submitting} className="pub-btn w-full">Continua</button>
                  <p className="pub-muted text-sm text-center">
                    Al passo successivo ti chiederemo alcune domande: senza questionario la prenotazione non viene registrata.
                  </p>
                </form>
              )}
            </div>
          </div>
        </aside>
      </main>

      <footer className="pub-footer">
        <div className="pub-wrap py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <Image src="/logo-ghergo-blu.png" alt="Ghergo Immobiliare" width={190} height={48} className="h-10 w-auto pub-logo-white" />
          <p className="text-sm opacity-80">Sogna, Realizza, Abita</p>
        </div>
      </footer>

      {/* Barra mobile per arrivare alla prenotazione */}
      {!isPast && !showBookingForm && !showQuestionnaire && timeSlots.length > 0 && (
        <div className="pub-mobilebar lg:hidden">
          <div>
            <p className="text-sm font-semibold first-letter:uppercase">{eventDate}</p>
            <p className="text-xs opacity-80">{freeSlots > 0 ? `${freeSlots} orari liberi` : 'Tutto prenotato'}</p>
          </div>
          <button onClick={scrollToBooking} className="pub-btn pub-btn-sm">Prenota la visita</button>
        </div>
      )}

      {/* Galleria a schermo intero */}
      {showGallery && images.length > 0 && (
        <div className="pub-lightbox" role="dialog" aria-modal="true" aria-label="Foto dell'immobile">
          <button className="pub-lightbox-close" onClick={() => setShowGallery(false)}>Chiudi</button>
          <Photo key={images[currentImageIndex]} src={images[currentImageIndex]} width={2500} quality={88} alt={`${property.titolo}, foto ${currentImageIndex + 1}`} />
          {images.length > 1 && (
            <>
              <button className="pub-lightbox-nav left-2 md:left-6" aria-label="Foto precedente" onClick={() => setCurrentImageIndex(i => (i === 0 ? images.length - 1 : i - 1))}>‹</button>
              <button className="pub-lightbox-nav right-2 md:right-6" aria-label="Foto successiva" onClick={() => setCurrentImageIndex(i => (i === images.length - 1 ? 0 : i + 1))}>›</button>
            </>
          )}
          <p className="pub-lightbox-count">{currentImageIndex + 1} di {images.length}</p>
        </div>
      )}

      {/* Questionario: per prenotare va compilato */}
      {showQuestionnaire && (
        <div className="pub-modal-backdrop">
          <div className="pub-modal" role="dialog" aria-modal="true" aria-labelledby="q-title">
            <div className="pub-modal-head">
              <button type="button" onClick={backToForm} className="pub-link text-sm">Indietro</button>
              <span className="pub-muted text-sm">{answered} di {visibleQuestions.length}</span>
            </div>
            <div className="pub-progress"><div style={{ width: `${(answered / visibleQuestions.length) * 100}%` }} /></div>

            <form onSubmit={handleQuestionnaireSubmit} className="px-6 md:px-10 pb-8">
              <h2 id="q-title" className="pub-h2 mt-6">Per prenotare compila il questionario</h2>
              <p className="pub-body mt-3">
                La prenotazione delle {selectedSlotData ? formatTime(selectedSlotData.ora_inizio) : ''} viene registrata solo dopo aver risposto a tutte le domande. Ci servono per preparare al meglio la tua visita.
              </p>

              {visibleQuestions.map((q, qi) => (
                <fieldset key={q.key} className="mt-9">
                  <legend className="pub-h3 mb-3">{qi + 1}. {q.label}</legend>
                  <div className="space-y-2">
                    {q.options.map(opt => (
                      <label key={opt.value} className={`pub-option ${questionnaireData[q.key] === opt.value ? 'is-active' : ''}`}>
                        <input
                          type="radio"
                          name={q.key}
                          value={opt.value}
                          checked={questionnaireData[q.key] === opt.value}
                          onChange={() => setAnswer(q.key, opt.value)}
                          required
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}

              <button type="submit" disabled={submittingQuestionnaire || !allAnswered} className="pub-btn w-full mt-10">
                {submittingQuestionnaire ? 'Prenotazione in corso…' : allAnswered ? 'Conferma la prenotazione' : `Rispondi a tutte le domande (${answered} di ${visibleQuestions.length})`}
              </button>
              <p className="pub-muted text-sm text-center mt-3">{property.has_brochure ? 'Dopo la conferma potrai scaricare la brochure e la riceverai anche per email.' : 'Riceverai subito un\u2019email di conferma.'}</p>
            </form>
          </div>
        </div>
      )}

      {/* Conferma */}
      {showSuccess && (
        <div className="pub-modal-backdrop">
          <div className="pub-modal pub-modal-sm text-center px-8 py-10" role="dialog" aria-modal="true" aria-labelledby="ok-title">
            <div className="pub-check-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 id="ok-title" className="pub-h2 mt-6">Prenotazione confermata</h2>
            <p className="pub-body mt-3">
              Ti abbiamo inviato un&apos;email con i dettagli della visita e l&apos;invito per il calendario{brochureUrl ? ', insieme alla brochure dell\u2019immobile' : ''}.
            </p>
            {brochureUrl && (
              <a href={brochureUrl} target="_blank" rel="noopener noreferrer" className="pub-btn w-full mt-8">Scarica la brochure (PDF)</a>
            )}
            <button onClick={() => setShowSuccess(false)} className={brochureUrl ? 'pub-link w-full mt-5' : 'pub-btn w-full mt-8'}>Chiudi</button>
          </div>
        </div>
      )}
    </div>
  )
}
