'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAgent, isAdmin } from '@/lib/auth'
import { authFetch } from '@/lib/api'

// Schermata per il video del lunedì: i numeri del fine settimana, grandi e animati, in formato storia (9:16).

interface Numeri {
  da: string
  a: string
  openHouse: number
  immobili: number
  visitatori: number
  senzaMutuo: number
  offerte: number
  prenotati: number
  senzaCheckin?: number
}

const BLU = '#203162'
const VERDE = '#22c55e'
const AMBRA = '#fbbf24'

function useCountUp(target: number, run: number, delay: number, duration = 1400) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now() + delay
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / duration))
      const e = 1 - Math.pow(1 - p, 3)
      setV(Math.round(target * e))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, run, delay, duration])
  return v
}

function Reveal({ at, run, children, className = '' }: { at: number; run: number; children: React.ReactNode; className?: string }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const reset = setTimeout(() => setOn(false), 0)
    const t = setTimeout(() => setOn(true), at + 30)
    return () => { clearTimeout(reset); clearTimeout(t) }
  }, [at, run])
  return (
    <div className={className} style={{ opacity: on ? 1 : 0, transform: on ? 'none' : 'translateY(28px)', transition: 'opacity .7s ease, transform .7s cubic-bezier(.2,.8,.2,1)' }}>
      {children}
    </div>
  )
}

const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })

function isWeekend(n: Numeri) {
  const da = new Date(n.da + 'T12:00:00')
  const a = new Date(n.a + 'T12:00:00')
  return da.getDay() === 5 && a.getDay() === 0 && (a.getTime() - da.getTime()) / 86400000 === 2
}

function Schermata({ n, run }: { n: Numeri; run: number }) {
  const visitatori = useCountUp(n.visitatori, run, 700)
  const oh = useCountUp(n.openHouse, run, 2300, 900)
  const mutuo = useCountUp(n.senzaMutuo, run, 2600, 900)
  const offerte = useCountUp(n.offerte, run, 2900, 900)
  const cercano = Math.max(0, n.visitatori - n.immobili)
  const cercanoV = useCountUp(cercano, run, 4600, 1100)
  const periodo = isWeekend(n) ? 'Questo fine settimana' : `Dal ${fmt(n.da)} al ${fmt(n.a)}`

  return (
    <div className="absolute inset-0 flex flex-col text-white overflow-hidden" style={{ background: `radial-gradient(120% 70% at 85% 0%, #2c4387 0%, ${BLU} 45%, #121c3d 100%)`, padding: '6cqh 6% 5cqh' }}>
      {/* luce che scorre */}
      <div className="absolute -inset-1/2 opacity-30 pointer-events-none" style={{ background: 'conic-gradient(from 0deg, transparent 0 70%, rgba(255,255,255,.18) 80%, transparent 90%)', animation: 'numeri-spin 14s linear infinite' }} />

      <Reveal at={0} run={run} className="relative">
        <Image src="/logo-ghergo-bianco.png" alt="Ghergo Immobiliare" width={719} height={188} className="h-[4.6cqh] w-auto object-contain" priority />
      </Reveal>

      <Reveal at={250} run={run} className="relative mt-[4.5cqh]">
        <div className="uppercase tracking-[0.25em] font-medium text-[2.1cqh] opacity-80">{periodo}</div>
      </Reveal>

      <Reveal at={500} run={run} className="relative mt-[1.5cqh]">
        <div className="font-black leading-none tabular-nums" style={{ fontSize: '15cqh', letterSpacing: '-0.04em' }}>{visitatori}</div>
        <div className="font-bold text-[3.1cqh] leading-tight mt-[0.6cqh]">persone hanno visitato<br />i nostri immobili</div>
      </Reveal>

      <div className="relative grid grid-cols-3 gap-[1.4cqh] mt-[3.5cqh]">
        {[
          { v: oh, l: n.openHouse === 1 ? 'Open House' : 'Open House', at: 2100, dot: null },
          { v: mutuo, l: 'comprano senza mutuo', at: 2400, dot: VERDE },
          { v: offerte, l: n.offerte === 1 ? 'vuole fare un’offerta' : 'vogliono fare un’offerta', at: 2700, dot: AMBRA },
        ].map((s, i) => (
          <Reveal key={i} at={s.at} run={run}>
            <div className="rounded-[2cqh] h-full" style={{ background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.16)', padding: '1.6cqh 1.4cqh' }}>
              <div className="flex items-center gap-[0.8cqh]">
                {s.dot && <span className="inline-block rounded-full" style={{ width: '1.6cqh', height: '1.6cqh', background: s.dot, boxShadow: `0 0 2cqh ${s.dot}` }} />}
                <span className="font-black tabular-nums leading-none text-[5.2cqh]">{s.v}</span>
              </div>
              <div className="font-medium text-[1.7cqh] leading-snug mt-[0.6cqh] opacity-90">{s.l}</div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal at={4200} run={run} className="relative mt-[3.5cqh]">
        <div className="font-bold text-[2.7cqh] leading-snug">
          Gli immobili erano solo <span className="font-black">{n.immobili}</span>.
        </div>
        <div className="font-bold text-[2.7cqh] leading-snug">
          <span className="font-black tabular-nums" style={{ color: AMBRA }}>{cercanoV}</span> persone stanno ancora cercando casa.
        </div>
      </Reveal>

      <div className="flex-1" />

      <Reveal at={6000} run={run} className="relative">
        <div className="rounded-[2.4cqh] bg-white" style={{ color: BLU, padding: '2.2cqh 2.6cqh' }}>
          <div className="font-black text-[3cqh] leading-tight">Vuoi vendere il tuo immobile?</div>
          <div className="font-medium text-[2.3cqh] mt-[0.6cqh]">Scrivici: 071 9257300</div>
          <div className="text-[1.8cqh] mt-[0.4cqh] opacity-70">ghergoimmobiliare.com</div>
        </div>
      </Reveal>
    </div>
  )
}

export default function NumeriWeekend() {
  const { agent, loading } = useAuth()
  const router = useRouter()
  const frameRef = useRef<HTMLDivElement>(null)
  const [n, setN] = useState<Numeri | null>(null)
  const [da, setDa] = useState('')
  const [a, setA] = useState('')
  const [run, setRun] = useState(0)
  const [errore, setErrore] = useState('')

  useEffect(() => {
    if (!loading && (!agent || (!isAgent(agent) && !isAdmin(agent)))) router.push('/dashboard/login')
  }, [agent, loading, router])

  const carica = async (q = '') => {
    setErrore('')
    const res = await authFetch(`/api/stats/weekend${q}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setErrore(data.error || 'Numeri non disponibili'); return }
    setN(data)
    setDa(data.da)
    setA(data.a)
    setRun(r => r + 1)
  }

  useEffect(() => {
    if (!agent) return
    ;(async () => { await carica() })()
  }, [agent])

  const ultimi7 = () => {
    const oggi = new Date()
    const prima = new Date(oggi.getTime() - 6 * 86400000)
    carica(`?da=${prima.toLocaleDateString('sv-SE')}&a=${oggi.toLocaleDateString('sv-SE')}`)
  }

  const schermoIntero = () => {
    const el = frameRef.current
    if (!el) return
    el.requestFullscreen?.().then(() => setRun(r => r + 1)).catch(() => setRun(r => r + 1))
  }

  if (!agent) return null

  return (
    <div className="min-h-screen" style={{ background: '#0b1230' }}>
      <style>{`@keyframes numeri-spin { to { transform: rotate(360deg) } }
        .numeri-frame:fullscreen { width: 100vw; height: 100vh; max-width: none; border-radius: 0; background: #0b1230; }
        .numeri-frame:fullscreen .numeri-inner { height: 100vh; width: calc(100vh * 9 / 16); margin: 0 auto; }`}</style>

      <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center gap-2 text-white">
        <button onClick={() => router.push('/dashboard')} className="text-sm opacity-80 mr-2">← Dashboard</button>
        <span className="font-bold mr-auto">I numeri del lunedì</span>
        <button onClick={() => carica()} className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/10">Ultimo weekend</button>
        <button onClick={ultimi7} className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/10">Ultimi 7 giorni</button>
        <input type="date" value={da} onChange={e => setDa(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm bg-white text-gray-900" />
        <input type="date" value={a} onChange={e => setA(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm bg-white text-gray-900" />
        <button onClick={() => carica(`?da=${da}&a=${a}`)} className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/10">Aggiorna</button>
        <button onClick={() => setRun(r => r + 1)} className="px-3 py-2 rounded-lg text-sm font-bold bg-white" style={{ color: BLU }}>▶ Riproduci</button>
        <button onClick={schermoIntero} className="px-3 py-2 rounded-lg text-sm font-bold bg-white" style={{ color: BLU }}>⛶ Schermo intero</button>
      </div>

      {errore && <p className="text-center text-red-300 text-sm">{errore}</p>}
      {n && !!n.senzaCheckin && (
        <p className="text-center text-amber-200 text-xs px-4">
          {n.senzaCheckin === 1 ? 'In 1 Open House' : `In ${n.senzaCheckin} Open House`} non sono state segnate le presenze: lì contano i prenotati.
        </p>
      )}

      <div className="px-4 pb-8 pt-2 flex justify-center">
        <div ref={frameRef} className="numeri-frame w-full flex justify-center" onClick={() => document.fullscreenElement && setRun(r => r + 1)}>
          <div className="numeri-inner relative rounded-2xl overflow-hidden shadow-2xl" style={{ width: 'min(100%, calc((100vh - 120px) * 9 / 16))', aspectRatio: '9 / 16', containerType: 'size' }}>
            {n ? <Schermata n={n} run={run} /> : <div className="absolute inset-0 flex items-center justify-center text-white/60">Carico i numeri…</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
