'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { authFetch } from '@/lib/api'

// Conferma di visita al check-in: tutto già compilato.
// Il cliente tocca "Confermo", firma con il dito, l'agente preme OK: il PDF arriva per email al cliente.

interface Dati {
  cliente: { nome: string; cognome: string; email: string; telefono: string }
  immobile: { titolo: string; riferimento: string; comune: string; provincia: string; indirizzo: string; prezzo: number | null }
  visita: { data: string; ora: string }
  agente: string
}

const BLU = '#203162'

function SignaturePad({ onChange }: { onChange: (empty: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const c = ref.current!
    const ratio = Math.max(window.devicePixelRatio || 1, 2)
    const rect = c.getBoundingClientRect()
    c.width = rect.width * ratio
    c.height = rect.height * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  return (
    <canvas
      ref={ref}
      id="firma"
      onPointerDown={e => { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e) }}
      onPointerMove={e => {
        if (!drawing.current) return
        const p = pos(e)
        const ctx = ref.current!.getContext('2d')!
        ctx.beginPath()
        ctx.moveTo(last.current!.x, last.current!.y)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        last.current = p
        onChange(false)
      }}
      onPointerUp={() => { drawing.current = false }}
      onPointerCancel={() => { drawing.current = false }}
      className="w-full rounded-xl bg-white"
      style={{ height: 200, touchAction: 'none', border: '2px dashed #cbd5e1' }}
    />
  )
}

export default function ConfermaVisita() {
  const { agent, loading } = useAuth()
  const router = useRouter()
  const { id, bookingId } = useParams<{ id: string; bookingId: string }>()
  const [dati, setDati] = useState<Dati | null>(null)
  const [testi, setTesti] = useState<{ titolo: string; testo: string }[]>([])
  const [conferma, setConferma] = useState(false)
  const [condizioni, setCondizioni] = useState(false)
  const [vuota, setVuota] = useState(true)
  const [padKey, setPadKey] = useState(0)
  const [stato, setStato] = useState<'carico' | 'pronto' | 'invio' | 'fatto' | 'errore'>('carico')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!loading && !agent) router.push('/dashboard/login')
  }, [agent, loading, router])

  useEffect(() => {
    if (!agent) return
    ;(async () => {
      const res = await authFetch(`/api/open-houses/${id}/foglio?bookingId=${bookingId}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(data.error || 'Non disponibile')
        setStato('errore')
        return
      }
      setDati(data.dati)
      setTesti(data.dichiarazioni)
      setStato('pronto')
    })()
  }, [agent, id, bookingId])

  const firma = async () => {
    if (!conferma || vuota) return
    setStato('invio')
    setMsg('')
    const png = (document.getElementById('firma') as HTMLCanvasElement).toDataURL('image/png')
    const res = await authFetch(`/api/open-houses/${id}/foglio`, {
      method: 'POST',
      body: JSON.stringify({ bookingId, accettata: true, firma: png }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMsg(data.error || 'Firma non salvata, riprova')
      setStato('pronto')
      return
    }
    setMsg(data.emailOk ? `Copia inviata a ${dati?.cliente.email}` : 'Firmata e archiviata. L’email non è partita: riprova dal check-in.')
    setStato('fatto')
    // torna da solo al check-in per il prossimo cliente
    setTimeout(() => router.push(`/dashboard/open-houses/${id}/check-in`), 2500)
  }

  const back = () => router.push(`/dashboard/open-houses/${id}/check-in`)

  if (stato === 'carico') return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: BLU }} /></div>
  if (stato === 'errore') return <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center"><p>{msg}</p><button onClick={back} className="btn-primary px-4 py-2">← Check-in</button></div>

  if (stato === 'fatto') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: '#F3F5FA' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl text-white" style={{ background: '#16a34a' }}>✓</div>
        <h1 className="text-2xl font-bold" style={{ color: BLU }}>Visita confermata</h1>
        <p className="text-gray-600">{msg}</p>
        <button onClick={back} className="mt-4 px-6 py-3 rounded-lg font-semibold text-white" style={{ background: BLU }}>← Torna al check-in</button>
      </div>
    )
  }

  const d = dati!
  const luogo = [d.immobile.indirizzo, d.immobile.comune].filter(Boolean).join(', ')
  return (
    <div className="min-h-screen pb-28" style={{ background: '#F3F5FA' }}>
      <div className="sticky top-0 z-10 shadow" style={{ background: BLU, color: '#fff' }}>
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={back} className="text-sm opacity-90">← Check-in</button>
          <span className="font-bold tracking-wide">CONFERMA DI VISITA</span>
          <span className="w-16" />
        </div>
      </div>

      <main className="max-w-xl mx-auto px-4 py-4 space-y-3">
        <section className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-xl font-bold" style={{ color: BLU }}>{d.cliente.nome} {d.cliente.cognome}</div>
          <div className="mt-1 text-[15px]">
            ha visitato <b>{d.immobile.titolo}</b>{luogo ? ` – ${luogo}` : ''}
          </div>
          <div className="text-sm text-gray-600 mt-0.5">
            il {d.visita.data}{d.visita.ora ? ` alle ${d.visita.ora}` : ''} con {d.agente} di Ghergo Immobiliare
          </div>
        </section>

        <section className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <label className={`flex gap-3 items-start p-3 rounded-lg border-2 cursor-pointer ${conferma ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
            <input type="checkbox" checked={conferma} onChange={e => setConferma(e.target.checked)} className="mt-0.5 w-7 h-7 shrink-0" style={{ accentColor: BLU }} />
            <span className="text-[16px] leading-snug">
              <b>Confermo di aver visitato l’immobile</b> con Ghergo Immobiliare, di aver ricevuto le informazioni e la documentazione e di <b>accettare le condizioni commerciali</b>: in caso di acquisto, compenso del <b>4% + IVA</b> sul prezzo.
            </span>
          </label>
          <button onClick={() => setCondizioni(c => !c)} className="text-sm font-semibold" style={{ color: BLU }}>
            {condizioni ? '▾' : '▸'} Leggi le condizioni complete
          </button>
          {condizioni && (
            <ol className="text-[13px] text-gray-700 space-y-2 list-decimal ml-5">
              {testi.map((t, i) => <li key={i}><b>{t.titolo}.</b> {t.testo}</li>)}
            </ol>
          )}
        </section>

        <section className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold tracking-wide" style={{ color: BLU }}>FIRMA DEL CLIENTE</div>
            <button onClick={() => { setPadKey(k => k + 1); setVuota(true) }} className="text-sm text-gray-500">Cancella</button>
          </div>
          <SignaturePad key={padKey} onChange={setVuota} />
        </section>
        {msg && <p className="text-sm text-red-600">{msg}</p>}
      </main>

      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t">
        <div className="max-w-xl mx-auto px-4 py-3">
          <button
            onClick={firma}
            disabled={!conferma || vuota || stato === 'invio'}
            className="w-full py-4 rounded-xl font-bold text-lg text-white disabled:opacity-40"
            style={{ background: BLU }}
          >
            {stato === 'invio' ? 'Salvo e invio…' : !conferma ? 'Tocca “Confermo”' : vuota ? 'Manca la firma' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
