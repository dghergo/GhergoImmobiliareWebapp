'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Photo from '@/components/public/Photo'
import { niceText } from '@/lib/text'
import { ASPETTI, OFFERTA_QUANDO, PREZZO, PROSSIMO_PASSO } from '@/lib/feedback'

interface BookingInfo {
  id: string
  feedback_completed: boolean
  cliente: string
  immobile: { titolo: string; zona: string; foto: string | null }
  agente: string
}

function Chips({ options, value, onToggle, multi }: {
  options: { value: string; label: string }[]
  value: string[]
  onToggle: (v: string) => void
  multi?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2" role={multi ? 'group' : 'radiogroup'}>
      {options.map(o => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={on}
            onClick={() => onToggle(o.value)}
            className={`pub-chip ${on ? 'is-active' : ''}`}
            style={{ padding: '10px 16px', fontSize: '1rem' }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="py-6" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-sm font-bold" style={{ color: 'var(--sky)' }}>{n}</span>
        <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>{title}</h2>
      </div>
      {hint && <p className="pub-muted text-sm mb-3 ml-6">{hint}</p>}
      <div className="ml-6 mt-3">{children}</div>
    </section>
  )
}

function FeedbackForm() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const votoParam = Number(useSearchParams().get('voto'))

  const [info, setInfo] = useState<BookingInfo | null>(null)
  const [state, setState] = useState<'loading' | 'notfound' | 'done' | 'form' | 'sent'>('loading')
  const [voto, setVoto] = useState(votoParam >= 1 && votoParam <= 5 ? votoParam : 0)
  const [prezzo, setPrezzo] = useState('')
  const [piaciuto, setPiaciuto] = useState<string[]>([])
  const [nonConvinto, setNonConvinto] = useState<string[]>([])
  const [passo, setPasso] = useState('')
  const [quando, setQuando] = useState('')
  const [commenti, setCommenti] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/public/feedback/${bookingId}`, { cache: 'no-store' })
        if (!res.ok) return setState('notfound')
        const { booking } = await res.json()
        setInfo(booking)
        setState(booking.feedback_completed ? 'done' : 'form')
      } catch {
        setState('notfound')
      }
    })()
  }, [bookingId])

  const toggle = (list: string[], set: (v: string[]) => void) => (v: string) =>
    set(list.includes(v) ? list.filter(x => x !== v) : [...list, v])

  const missing = !voto ? 'il voto' : !prezzo ? 'il prezzo' : !passo ? 'il prossimo passo' : passo === 'offerta' && !quando ? 'quando puoi passare in ufficio' : ''

  const submit = async () => {
    if (missing) {
      setError(`Manca ${missing}.`)
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          risposte: { voto, prezzo, piaciuto, non_convinto: nonConvinto, prossimo_passo: passo },
          offerta_quando: passo === 'offerta' ? quando : null,
          commenti,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) return setState('done')
      if (!res.ok) throw new Error(data.error || 'Invio non riuscito')
      setState('sent')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invio non riuscito. Riprova.')
    } finally {
      setSending(false)
    }
  }

  const header = (
    <header className="pub-wrap flex items-center justify-between py-5">
      <Image src="/logo-ghergo-blu.png" alt="Ghergo Immobiliare" width={160} height={40} className="h-8 w-auto" priority />
    </header>
  )

  if (state === 'loading') {
    return <div className="pub min-h-screen flex items-center justify-center"><div className="pub-spinner" aria-label="Caricamento" /></div>
  }

  if (state === 'notfound') {
    return (
      <div className="pub min-h-screen">
        {header}
        <main className="pub-wrap py-20 max-w-xl">
          <h1 className="pub-display text-3xl">Link non valido</h1>
          <p className="pub-body pub-muted mt-3">Il link potrebbe essere incompleto. Scrivi al tuo agente e te lo rimanda.</p>
        </main>
      </div>
    )
  }

  if (state === 'done' || state === 'sent') {
    const offerta = state === 'sent' && passo === 'offerta'
    return (
      <div className="pub min-h-screen">
        {header}
        <main className="pub-wrap py-16 max-w-xl text-center">
          <div className="pub-check-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L20 7" /></svg>
          </div>
          <h1 className="pub-display text-3xl mt-6">{state === 'done' ? 'Feedback già inviato' : 'Grazie!'}</h1>
          <p className="pub-body pub-muted mt-3">
            {offerta
              ? `${info?.agente || 'Il tuo agente'} ha ricevuto la tua richiesta e ti contatta a breve per fissare l'appuntamento in ufficio.`
              : state === 'done'
              ? 'Abbiamo già ricevuto le tue impressioni su questa visita.'
              : 'Le tue impressioni ci aiutano davvero. Se cambi idea o hai domande, scrivi pure al tuo agente.'}
          </p>
          <Link href="/" className="pub-btn mt-8">Guarda gli altri Open House</Link>
        </main>
      </div>
    )
  }

  return (
    <div className="pub min-h-screen pb-32">
      {header}
      <main className="pub-wrap max-w-2xl">
        <div className="flex gap-4 items-center">
          {info?.immobile.foto && (
            <Photo src={info.immobile.foto} width={300} quality={82} alt="" className="w-24 h-24 md:w-28 md:h-28 object-cover rounded-2xl shrink-0" />
          )}
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--sky)' }}>La tua visita</p>
            <h1 className="pub-display text-2xl md:text-3xl leading-tight">{niceText(info?.immobile.titolo || '')}</h1>
            <p className="pub-muted">{niceText(info?.immobile.zona || '')}</p>
          </div>
        </div>
        <p className="pub-body mt-6">
          {info?.cliente ? `Ciao ${niceText(info.cliente)}, ` : ''}bastano pochi tocchi: le tue impressioni servono a {info?.agente || 'noi'} e ai proprietari.
        </p>

        <div className="mt-4">
          <Step n={1} title="Che voto dai all'immobile?">
            <div className="flex gap-1" role="radiogroup" aria-label="Voto">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={voto === n}
                  aria-label={`${n} su 5`}
                  onClick={() => setVoto(n)}
                  className="text-5xl leading-none px-1 transition-transform active:scale-90"
                  style={{ color: n <= voto ? '#f59e0b' : '#d1d5db' }}
                >
                  ★
                </button>
              ))}
            </div>
          </Step>

          <Step n={2} title="Il prezzo ti sembra…">
            <Chips options={PREZZO} value={[prezzo]} onToggle={setPrezzo} />
          </Step>

          <Step n={3} title="Cosa ti è piaciuto?" hint="Puoi sceglierne più di uno">
            <Chips multi options={ASPETTI} value={piaciuto} onToggle={toggle(piaciuto, setPiaciuto)} />
          </Step>

          <Step n={4} title="Cosa non ti ha convinto?" hint="Puoi sceglierne più di uno, o nessuno">
            <Chips multi options={ASPETTI} value={nonConvinto} onToggle={toggle(nonConvinto, setNonConvinto)} />
          </Step>

          <Step n={5} title="E adesso?">
            <div className="grid gap-2">
              {PROSSIMO_PASSO.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setPasso(o.value)}
                  className={`pub-option text-left ${passo === o.value ? 'is-active' : ''}`}
                  style={o.value === 'offerta' ? { fontWeight: 700 } : undefined}
                >
                  {o.value === 'offerta' ? '🔑 ' : ''}{o.label}
                </button>
              ))}
            </div>
            {passo === 'offerta' && (
              <div className="mt-5 p-4 rounded-2xl" style={{ background: '#EAF8FE' }}>
                <p className="font-bold" style={{ color: 'var(--ink)' }}>Quando puoi passare in ufficio per formalizzare l&apos;offerta?</p>
                <p className="pub-muted text-sm mb-3">{info?.agente || 'Il tuo agente'} ti contatta subito per confermare.</p>
                <Chips options={OFFERTA_QUANDO} value={[quando]} onToggle={setQuando} />
              </div>
            )}
          </Step>

          <Step n={6} title="Vuoi aggiungere qualcosa?" hint="Facoltativo">
            <textarea
              rows={4}
              value={commenti}
              onChange={e => setCommenti(e.target.value)}
              maxLength={2000}
              className="w-full p-4 rounded-2xl text-base"
              style={{ border: '1px solid var(--line)' }}
              placeholder="Un dettaglio che ti ha colpito, un dubbio, una domanda…"
            />
          </Step>
        </div>
      </main>

      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="pub-wrap max-w-2xl py-3 flex items-center gap-4">
          <p className="flex-1 text-sm" style={{ color: error ? '#dc2626' : 'var(--muted, #6b7280)' }}>
            {error || (missing ? `Manca ${missing}` : 'Tutto pronto')}
          </p>
          <button type="button" onClick={submit} disabled={sending} className="pub-btn pub-btn-sm">
            {sending ? 'Invio…' : passo === 'offerta' ? 'Invia la richiesta' : 'Invia'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={null}>
      <FeedbackForm />
    </Suspense>
  )
}
