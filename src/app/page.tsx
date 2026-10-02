'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { niceText } from '@/lib/text'
import Link from 'next/link'
import Countdown from '@/components/public/Countdown'
import Reveal from '@/components/public/Reveal'
import Photo from '@/components/public/Photo'

interface OpenHouse {
  id: string
  data_evento: string
  ora_inizio: string
  ora_fine: string
  property: {
    titolo: string
    descrizione: string
    prezzo: number | null
    zona: string
    tipologia: string
    caratteristiche: { mq?: number; locali?: number; bagni?: number; cantiere?: boolean } | null
    immagini: string[] | null
  }
  agent: { nome: string; cognome: string; email: string }
}

const PRICE_RANGES = [
  { value: '', label: 'Qualsiasi prezzo' },
  { value: 'under-200k', label: 'Fino a 200.000 €' },
  { value: '200k-400k', label: '200.000 – 400.000 €' },
  { value: '400k-600k', label: '400.000 – 600.000 €' },
  { value: 'over-600k', label: 'Oltre 600.000 €' },
]

const TYPE_LABELS: Record<string, string> = {
  appartamento: 'Appartamenti',
  villa: 'Ville e case',
  ufficio: 'Uffici',
  locale_commerciale: 'Locali commerciali',
  terreno: 'Terreni',
}

const t = (s: string) => s.slice(0, 5)

export default function Home() {
  const [openHouses, setOpenHouses] = useState<OpenHouse[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [priceRange, setPriceRange] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const response = await fetch('/api/public/open-houses', { cache: 'no-store' })
        if (!response.ok) throw new Error(String(response.status))
        const data = await response.json()
        const now = new Date()
        // Solo gli Open House non ancora conclusi, dal più vicino
        const upcoming = (data.openHouses as OpenHouse[])
          .filter(oh => new Date(`${oh.data_evento}T${oh.ora_fine}`) >= now)
          .sort((a, b) => `${a.data_evento}${a.ora_inizio}`.localeCompare(`${b.data_evento}${b.ora_inizio}`))
        setOpenHouses(upcoming)
      } catch (err) {
        console.error('Error loading open houses:', err)
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const types = useMemo(() => [...new Set(openHouses.map(oh => oh.property.tipologia))].sort(), [openHouses])

  const filtered = openHouses.filter(oh => {
    const q = searchTerm.trim().toLowerCase()
    const matchesSearch =
      !q ||
      oh.property.titolo.toLowerCase().includes(q) ||
      oh.property.zona.toLowerCase().includes(q) ||
      (oh.property.descrizione || '').toLowerCase().includes(q)
    const matchesType = !selectedType || oh.property.tipologia === selectedType
    const price = oh.property.prezzo || 0
    const matchesPrice =
      !priceRange ||
      (priceRange === 'under-200k' && price < 200000) ||
      (priceRange === '200k-400k' && price >= 200000 && price < 400000) ||
      (priceRange === '400k-600k' && price >= 400000 && price < 600000) ||
      (priceRange === 'over-600k' && price >= 600000)
    return matchesSearch && matchesType && matchesPrice
  })

  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  const next = openHouses[0]
  const heroImages = (next?.property.immagini || []).slice(0, 4)
  const day = (d: string) => new Date(d + 'T00:00:00').getDate()
  const month = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')
  const weekday = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long' })

  return (
    <div className="pub min-h-screen">
      {/* Apertura a tutto schermo: il prossimo Open House */}
      <section className="pub-hero">
        <div className="pub-hero-media" aria-hidden="true">
          {heroImages.length > 0 ? (
            heroImages.map((src, i) => (
              <Photo key={src} src={src} width={2500} quality={88} alt="" className="pub-kenburns" fetchPriority={i === 0 ? 'high' : 'low'} loading={i === 0 ? 'eager' : 'lazy'} style={{ animationDelay: `${i * 7}s`, animationDuration: `${Math.max(heroImages.length, 1) * 7}s` }} />
            ))
          ) : (
            <div className="pub-hero-fallback" />
          )}
        </div>
        <div className="pub-hero-shade" aria-hidden="true" />

        <header className="pub-hero-top pub-wrap">
          <Link href="/" aria-label="Ghergo Immobiliare">
            <Image src="/logo-ghergo-blu.png" alt="Ghergo Immobiliare" width={190} height={48} className="h-9 md:h-12 w-auto pub-logo-white" priority />
          </Link>
          <a href="#open-house" className="pub-hero-link">Tutti gli Open House</a>
        </header>

        <div className="pub-wrap pub-hero-body">
          <h1 className="pub-display pub-hero-title">
            <span className="pub-line"><span>Entra.</span></span>
            <span className="pub-line"><span>Guardati intorno.</span></span>
            <span className="pub-line"><span>Immagina.</span></span>
          </h1>

          {next && (
            <Link href={`/open-house/${next.id}`} className="pub-next">
              <span className="pub-next-label">Prossimo Open House</span>
              <span className="pub-next-title">{niceText(next.property.titolo)}</span>
              <span className="pub-next-meta">{niceText(next.property.zona)} — <span className="capitalize">{weekday(next.data_evento)}</span> {day(next.data_evento)} {month(next.data_evento)}, ore {t(next.ora_inizio)}</span>
              <Countdown date={next.data_evento} time={next.ora_inizio} />
              <span className="pub-next-cta">Prenota la visita</span>
            </Link>
          )}
        </div>
        <a href="#open-house" className="pub-scroll" aria-label="Scorri agli Open House"><span /></a>
      </section>

      {/* Ricerca */}
      <section id="open-house" className="pub-wrap pt-16 md:pt-24 pb-10 md:pb-12 scroll-mt-4">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-10 lg:gap-20 items-end">
          <div>
            <h2 className="pub-display pub-section-title">Open House in programma</h2>
            <p className="pub-body pub-muted mt-4 max-w-xl">
              Scegli l&apos;immobile, prenota un orario e vieni a vederlo con calma insieme a uno dei nostri agenti.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-6 md:gap-8 items-end">
            <label className="block">
              <span className="sr-only">Cerca</span>
              <input
                type="search"
                className="pub-search"
                placeholder="Cerca per zona, città o immobile"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </label>
            <label className="pub-field">
              <span>Prezzo</span>
              <select value={priceRange} onChange={e => setPriceRange(e.target.value)}>
                {PRICE_RANGES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {types.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-6">
            <button className={`pub-chip ${selectedType === '' ? 'is-active' : ''}`} onClick={() => setSelectedType('')}>Tutti</button>
            {types.map(type => (
              <button key={type} className={`pub-chip ${selectedType === type ? 'is-active' : ''}`} onClick={() => setSelectedType(type)}>
                {TYPE_LABELS[type] || type}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Elenco */}
      <main className="pub-wrap pb-20">
        {loading ? (
          <div className="flex justify-center py-20"><div className="pub-spinner" aria-label="Caricamento" /></div>
        ) : loadError ? (
          <p className="pub-body py-16">Non riusciamo a caricare gli Open House in questo momento. Ricarica la pagina tra qualche minuto.</p>
        ) : filtered.length === 0 ? (
          <div className="py-16">
            <p className="pub-h3">{openHouses.length === 0 ? 'Nessun Open House in programma al momento' : 'Nessun immobile corrisponde alla ricerca'}</p>
            <p className="pub-body pub-muted mt-2">
              {openHouses.length === 0 ? 'Torna a trovarci presto: pubblichiamo nuovi eventi ogni settimana.' : 'Prova a cambiare zona o fascia di prezzo.'}
            </p>
          </div>
        ) : (
          <>
            <p className="pub-muted text-sm mb-6">
              {filtered.length === 1 ? '1 Open House in programma' : `${filtered.length} Open House in programma`}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-14">
              {filtered.map((oh, idx) => {
                const c = oh.property.caratteristiche || {}
                const details = [c.mq ? `${c.mq} m²` : null, c.locali ? `${c.locali} locali` : null, c.bagni ? `${c.bagni} bagni` : null].filter(Boolean).join('   ')
                return (
                  <Reveal key={oh.id} delay={(idx % 3) * 120}>
                    <Link href={`/open-house/${oh.id}`} className="pub-card group">
                      <div className="pub-card-img">
                        {oh.property.immagini?.[0] ? (
                          <Photo src={oh.property.immagini[0]} width={1400} quality={85} alt={oh.property.titolo} loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center pub-muted">Foto in arrivo</div>
                        )}
                        <div className="pub-cal" aria-hidden="true">
                          <b>{day(oh.data_evento)}</b>
                          <small>{month(oh.data_evento)}</small>
                        </div>
                      </div>
                      <p className="mt-5 text-sm font-semibold first-letter:uppercase" style={{ color: 'var(--ink)' }}>
                        {formatDate(oh.data_evento)}, {t(oh.ora_inizio)}–{t(oh.ora_fine)}
                      </p>
                      <h3 className="pub-display pub-card-title mt-2">{niceText(oh.property.titolo)}</h3>
                      <p className="pub-muted mt-1">{niceText(oh.property.zona)}</p>
                      <div className="flex items-baseline justify-between gap-4 mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {oh.property.prezzo ? `${c.cantiere ? 'da ' : ''}${oh.property.prezzo.toLocaleString('it-IT')} €` : 'Prezzo su richiesta'}
                        </span>
                        {details && <span className="pub-muted text-sm whitespace-pre">{details}</span>}
                      </div>
                    </Link>
                  </Reveal>
                )
              })}
            </div>
          </>
        )}
      </main>

      <footer className="pub-footer">
        <div className="pub-wrap py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <Image src="/logo-ghergo-blu.png" alt="Ghergo Immobiliare" width={190} height={48} className="h-10 w-auto pub-logo-white" />
          <div className="flex items-center gap-6 text-sm">
            <span className="opacity-80">Sogna, Realizza, Abita</span>
            <Link href="/dashboard/login" className="opacity-60 hover:opacity-100">Area agenti</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
