'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Logo from '@/components/Logo'

// Helper function per rimuovere i secondi dagli orari
const formatTime = (timeString: string): string => {
  return timeString.slice(0, 5) // Prende solo HH:MM
}

interface OpenHouse {
  id: string
  data_evento: string
  ora_inizio: string
  ora_fine: string
  property: {
    titolo: string
    descrizione: string
    prezzo: number
    zona: string
    tipologia: string
    caratteristiche: any
    immagini: string[]
  }
  agent: {
    nome: string
    cognome: string
    email: string
  }
}

export default function Home() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const [openHouses, setOpenHouses] = useState<OpenHouse[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [priceRange, setPriceRange] = useState('')

  useEffect(() => {
    async function loadData() {
      try {
        // Test connessione
        const { error: testError } = await supabase.from('gre_properties').select('count').limit(1)
        setIsConnected(!testError)

        if (!testError) {
          // Carica Open House con join ottimizzato - includi anche eventi passati
          const { data, error } = await supabase
            .from('gre_open_houses')
            .select(`
              id,
              data_evento,
              ora_inizio,
              ora_fine,
              gre_properties!inner (
                titolo,
                descrizione,
                prezzo,
                tipologia,
                zona,
                caratteristiche,
                immagini
              ),
              gre_agents!inner (
                nome,
                cognome,
                email
              )
            `)
            .eq('is_active', true)
            .eq('gre_properties.is_active', true)
            .order('data_evento', { ascending: true })

          if (!error && data) {
            // Trasforma i dati per matchare l'interfaccia
            const transformedData = data.map((item: any) => ({
              ...item,
              property: item.gre_properties,
              agent: item.gre_agents
            }))
            setOpenHouses(transformedData)
          } else {
            console.error('Error loading open houses:', error)
          }
        }
      } catch (err) {
        setIsConnected(false)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // Logica filtri
  const filteredOpenHouses = openHouses.filter(oh => {
    const matchesSearch = searchTerm === '' ||
      oh.property.titolo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      oh.property.zona.toLowerCase().includes(searchTerm.toLowerCase()) ||
      oh.property.descrizione.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCity = selectedCity === '' ||
      oh.property.zona.toLowerCase() === selectedCity.toLowerCase()

    const matchesType = selectedType === '' ||
      oh.property.tipologia.toLowerCase() === selectedType.toLowerCase()

    let matchesPrice = true
    if (priceRange) {
      const price = oh.property.prezzo
      switch (priceRange) {
        case 'under-200k':
          matchesPrice = price < 200000
          break
        case '200k-400k':
          matchesPrice = price >= 200000 && price < 400000
          break
        case '400k-600k':
          matchesPrice = price >= 400000 && price < 600000
          break
        case 'over-600k':
          matchesPrice = price >= 600000
          break
      }
    }

    return matchesSearch && matchesCity && matchesType && matchesPrice
  })


  // Opzioni per i filtri
  const cities = [...new Set(openHouses.map(oh => oh.property.zona))].sort()
  const types = [...new Set(openHouses.map(oh => oh.property.tipologia))].sort()

  return (
    <div className="min-h-screen">
      {/* Header Navigation */}
      <header style={{ backgroundColor: 'var(--primary-blue)' }} className="text-white py-2 md:py-0 md:h-16">
        <div className="container mx-auto px-4 h-full">
          <div className="flex justify-between items-center h-full">
            <Logo height={56} />
            <div className="nav-text text-sm flex items-center space-x-3 md:space-x-4">
              <span className="hidden sm:inline">OPEN HOUSE</span>
              <a href="/admin/login" className="text-white hover:text-gray-200 transition-colors">
                ADMIN
              </a>
              <div className="flex items-center gap-2">
                {isConnected === null ? (
                  <>
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                    <span>Caricamento...</span>
                  </>
                ) : isConnected ? (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>Online</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span>Offline</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="bg-white py-6 md:py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl md:text-4xl font-bold mb-2 md:mb-4" style={{ color: 'var(--text-dark)' }}>
            Open House Disponibili
          </h1>
          <p className="text-base md:text-lg mb-4 md:mb-8" style={{ color: 'var(--text-gray)' }}>
            Prenota la tua visita e scopri la casa dei tuoi sogni
          </p>

          {/* Filters Section */}
          <div className="max-w-6xl mx-auto bg-gray-50 rounded-lg p-4 md:p-6 mb-4 md:mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">

              {/* Search Input */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium mb-2 text-left" style={{ color: 'var(--text-dark)' }}>
                  Cerca immobile
                </label>
                <input
                  type="text"
                  placeholder="Cerca per titolo, città..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Zone Filter */}
              <div>
                <label className="block text-sm font-medium mb-2 text-left" style={{ color: 'var(--text-dark)' }}>
                  Zona
                </label>
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Tutte le zone</option>
                  {cities.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              {/* Type Filter */}
              <div>
                <label className="block text-sm font-medium mb-2 text-left" style={{ color: 'var(--text-dark)' }}>
                  Tipologia
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Tutti i tipi</option>
                  {types.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Price Range Filter */}
              <div>
                <label className="block text-sm font-medium mb-2 text-left" style={{ color: 'var(--text-dark)' }}>
                  Fascia prezzo
                </label>
                <select
                  value={priceRange}
                  onChange={(e) => setPriceRange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Tutti i prezzi</option>
                  <option value="under-200k">Fino a €200.000</option>
                  <option value="200k-400k">€200.000 - €400.000</option>
                  <option value="400k-600k">€400.000 - €600.000</option>
                  <option value="over-600k">Oltre €600.000</option>
                </select>
              </div>
            </div>

            {/* Results Count */}
            <div className="mt-4 text-center">
              <span className="text-sm" style={{ color: 'var(--text-gray)' }}>
                {loading ? 'Caricamento...' : `${filteredOpenHouses.length} Open House ${filteredOpenHouses.length === 1 ? 'trovato' : 'trovati'}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 pb-12">

        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: 'var(--accent-blue)' }}></div>
            <p className="mt-4" style={{ color: 'var(--text-gray)' }}>Caricamento immobili...</p>
          </div>
        ) : filteredOpenHouses.length === 0 ? (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto bg-white rounded-lg p-8 shadow-md">
              <h3 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-dark)' }}>
                Nessun Open House disponibile
              </h3>
              <p style={{ color: 'var(--text-gray)' }}>
                {openHouses.length === 0
                  ? 'Al momento non ci sono eventi programmati. Controlla più tardi per nuove opportunità.'
                  : 'Nessun immobile corrisponde ai filtri selezionati. Prova a modificare i criteri di ricerca.'
                }
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-1 xl:grid-cols-1 max-w-4xl mx-auto">
            {filteredOpenHouses.map((openHouse) => {
              const isExpired = new Date(openHouse.data_evento) < new Date(new Date().toDateString())
              return (
              <div key={openHouse.id} className={`property-card relative ${isExpired ? 'opacity-80' : ''}`}>
                {/* Property Images */}
                <div className="h-48 md:h-64 relative overflow-hidden">
                  {/* Watermark per eventi scaduti */}
                  {isExpired && (
                    <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-10">
                      <div className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold text-lg transform -rotate-12">
                        EVENTO SCADUTO
                      </div>
                    </div>
                  )}
                  {openHouse.property.immagini && openHouse.property.immagini.length > 0 ? (
                    <img
                      src={openHouse.property.immagini[0]}
                      alt={openHouse.property.titolo}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const nextSibling = e.currentTarget.nextElementSibling as HTMLElement;
                        if (nextSibling) nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="w-full h-full bg-gradient-to-r from-gray-200 to-gray-300 flex items-center justify-center"
                    style={{ display: openHouse.property.immagini?.length > 0 ? 'none' : 'flex' }}
                  >
                    <span style={{ color: 'var(--text-gray)' }}>Immagine non disponibile</span>
                  </div>

                  {/* Image count indicator */}
                  {openHouse.property.immagini && openHouse.property.immagini.length > 1 && (
                    <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                      {openHouse.property.immagini.length} foto
                    </div>
                  )}
                </div>

                <div className="p-4 md:p-6">
                  {/* Status Tag */}
                  <div className="flex justify-between items-start mb-3 md:mb-4">
                    <span className="status-tag">OPEN HOUSE</span>
                    <div className="text-right">
                      <p className="text-xl md:text-3xl font-bold" style={{ color: 'var(--primary-blue)' }}>
                        €{openHouse.property.prezzo?.toLocaleString('it-IT')}
                      </p>
                      <p className="text-sm capitalize" style={{ color: 'var(--text-gray)' }}>
                        {openHouse.property.tipologia}
                      </p>
                    </div>
                  </div>

                  {/* Property Title and Location */}
                  <h3 className="text-xl md:text-2xl font-semibold mb-2" style={{ color: 'var(--text-dark)' }}>
                    {openHouse.property.titolo}
                  </h3>
                  <p className="mb-4" style={{ color: 'var(--text-gray)' }}>
                    📍 {openHouse.property.zona}
                  </p>

                  {/* Property Description */}
                  <p className="mb-6 leading-relaxed" style={{ color: 'var(--text-dark)' }}>
                    {openHouse.property.descrizione}
                  </p>

                  {/* Property Features */}
                  <div className="flex flex-wrap gap-3 mb-6">
                    {openHouse.property.caratteristiche?.mq && (
                      <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-gray)' }}>
                        <span>📏</span>
                        <span>{openHouse.property.caratteristiche.mq} m²</span>
                      </div>
                    )}
                    {openHouse.property.caratteristiche?.locali && (
                      <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-gray)' }}>
                        <span>🏠</span>
                        <span>{openHouse.property.caratteristiche.locali} locali</span>
                      </div>
                    )}
                    {openHouse.property.caratteristiche?.bagni && (
                      <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-gray)' }}>
                        <span>🚿</span>
                        <span>{openHouse.property.caratteristiche.bagni} bagni</span>
                      </div>
                    )}
                    {openHouse.property.caratteristiche?.piano && (
                      <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-gray)' }}>
                        <span>🏢</span>
                        <span>Piano {openHouse.property.caratteristiche.piano}</span>
                      </div>
                    )}
                  </div>

                  {/* Open House Info */}
                  <div className="border-t pt-4 mb-6" style={{ borderColor: 'var(--light-gray)' }}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="font-medium" style={{ color: 'var(--primary-blue)' }}>Data:</span>
                        <p style={{ color: 'var(--text-dark)' }}>
                          {new Date(openHouse.data_evento).toLocaleDateString('it-IT', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium" style={{ color: 'var(--primary-blue)' }}>Orario:</span>
                        <p style={{ color: 'var(--text-dark)' }}>{formatTime(openHouse.ora_inizio)} - {formatTime(openHouse.ora_fine)}</p>
                      </div>
                      <div>
                        <span className="font-medium" style={{ color: 'var(--primary-blue)' }}>Agente:</span>
                        <p style={{ color: 'var(--text-dark)' }}>
                          {openHouse.agent?.nome || 'N/A'} {openHouse.agent?.cognome || ''}
                        </p>
                        <p className="text-sm" style={{ color: 'var(--text-gray)' }}>
                          {openHouse.agent?.email || ''}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="flex justify-center">
                    {isExpired ? (
                      <button
                        disabled
                        className="w-full md:w-auto bg-gray-400 text-white px-8 py-3 text-base md:text-lg font-medium nav-text rounded cursor-not-allowed opacity-60"
                      >
                        EVENTO SCADUTO
                      </button>
                    ) : (
                      <a
                        href={`/open-house/${openHouse.id}`}
                        className="btn-primary block md:inline-block text-center px-8 py-3 text-base md:text-lg font-medium nav-text"
                      >
                        PRENOTA LA TUA VISITA
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
