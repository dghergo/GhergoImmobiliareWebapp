'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { authFetch } from '@/lib/api'

// Foglio visita da far firmare al cliente sul telefono dell'agente.
// Dati già compilati, dichiarazioni da spuntare, firma con il dito, PDF via email al cliente.

interface Anagrafica {
  luogo_nascita: string
  provincia_nascita: string
  data_nascita: string
  codice_fiscale: string
  residenza: { comune: string; provincia: string; cap: string; indirizzo: string }
  per_conto_di: string
  accompagnato_da: string
}
interface Dati {
  cliente: { nome: string; cognome: string; email: string; telefono: string }
  anagrafica: Anagrafica
  immobile: {
    titolo: string; riferimento: string; comune: string; provincia: string; indirizzo: string
    scala: string; piano: string; interno: string
    catasto: { foglio: string; particella: string; sub: string; categoria: string }
    prezzo: number | null
  }
  visita: { data: string; ora: string }
  agente: string
}

const BLU = '#203162'

function Campo({ label, v, set, cls = '', type = 'text' }: { label: string; v: string; set: (v: string) => void; cls?: string; type?: string }) {
  return (
    <label className={`block text-xs text-gray-500 ${cls}`}>
      {label}
      <input type={type} value={v} onChange={e => set(e.target.value)} className="mt-0.5 w-full px-3 py-2.5 rounded-lg border text-base text-gray-900 bg-white" />
    </label>
  )
}

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
  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    ref.current!.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pos(e)
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const p = pos(e)
    const ctx = ref.current!.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo(last.current!.x, last.current!.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    onChange(false)
  }
  const up = () => { drawing.current = false }

  return (
    <canvas
      ref={ref}
      id="firma"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="w-full rounded-xl bg-white"
      style={{ height: 180, touchAction: 'none', border: '2px dashed #cbd5e1' }}
    />
  )
}

export default function FoglioVisita() {
  const { agent, loading } = useAuth()
  const router = useRouter()
  const { id, bookingId } = useParams<{ id: string; bookingId: string }>()
  const [dati, setDati] = useState<Dati | null>(null)
  const [testi, setTesti] = useState<{ titolo: string; testo: string }[]>([])
  const [an, setAn] = useState<Anagrafica | null>(null)
  const [catastoMancante, setCatastoMancante] = useState(false)
  const [ok, setOk] = useState<boolean[]>([])
  const [vuota, setVuota] = useState(true)
  const [padKey, setPadKey] = useState(0)
  const [stato, setStato] = useState<'carico' | 'pronto' | 'invio' | 'fatto' | 'errore'>('carico')
  const [msg, setMsg] = useState('')
  const [giaFirmato, setGiaFirmato] = useState<string | null>(null)

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
      setAn(data.dati.anagrafica)
      setCatastoMancante(!!data.datiCatastaliMancanti)
      setTesti(data.dichiarazioni)
      setOk(data.dichiarazioni.map(() => false))
      setGiaFirmato(data.firmatoIl)
      setStato('pronto')
    })()
  }, [agent, id, bookingId])

  const tutteOk = ok.length > 0 && ok.every(Boolean)
  const anOk = !!an && !!an.luogo_nascita.trim() && !!an.data_nascita.trim() && /^[A-Z0-9]{16}$/i.test(an.codice_fiscale.replace(/\s/g, '')) && !!an.residenza.comune.trim() && !!an.residenza.indirizzo.trim()

  const firma = async () => {
    if (!tutteOk || vuota || !anOk) return
    setStato('invio')
    const png = (document.getElementById('firma') as HTMLCanvasElement).toDataURL('image/png')
    const res = await authFetch(`/api/open-houses/${id}/foglio`, {
      method: 'POST',
      body: JSON.stringify({ bookingId, accettate: ok, firma: png, anagrafica: an }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMsg(data.error || 'Firma non salvata, riprova')
      setStato('pronto')
      return
    }
    setMsg(data.emailOk ? `Copia inviata a ${dati?.cliente.email}` : 'Firmato e archiviato. L’email non è partita: riprova dal check-in.')
    setStato('fatto')
  }

  const back = () => router.push(`/dashboard/open-houses/${id}/check-in`)

  if (stato === 'carico') return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: BLU }} /></div>
  if (stato === 'errore') return <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center"><p>{msg}</p><button onClick={back} className="btn-primary px-4 py-2">← Check-in</button></div>

  if (stato === 'fatto') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: '#F3F5FA' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl text-white" style={{ background: '#16a34a' }}>✓</div>
        <h1 className="text-2xl font-bold" style={{ color: BLU }}>Foglio visita firmato</h1>
        <p className="text-gray-600">{msg}</p>
        <button onClick={back} className="mt-4 px-6 py-3 rounded-lg font-semibold text-white" style={{ background: BLU }}>← Torna al check-in</button>
      </div>
    )
  }

  const d = dati!
  return (
    <div className="min-h-screen pb-32" style={{ background: '#F3F5FA' }}>
      <div className="sticky top-0 z-10 shadow" style={{ background: BLU, color: '#fff' }}>
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={back} className="text-sm opacity-90">← Check-in</button>
          <span className="font-bold tracking-wide">FOGLIO VISITA</span>
          <span className="w-16" />
        </div>
      </div>

      <main className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {giaFirmato && (
          <div className="rounded-lg p-3 text-sm bg-amber-50 border border-amber-200">
            Già firmato il {new Date(giaFirmato).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Se firmi di nuovo, viene creata una nuova copia.
          </div>
        )}

        <section className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-xs font-bold tracking-wide mb-2" style={{ color: BLU }}>CLIENTE</div>
          <div className="text-lg font-bold">{d.cliente.nome} {d.cliente.cognome}</div>
          <div className="text-sm text-gray-600">{d.cliente.telefono} · {d.cliente.email}</div>
          <div className="text-xs font-bold tracking-wide mt-4 mb-2" style={{ color: BLU }}>IMMOBILE E VISITA</div>
          <div className="font-semibold">{d.immobile.riferimento ? `Rif. ${d.immobile.riferimento} · ` : ''}{d.immobile.titolo}</div>
          <div className="text-sm text-gray-600">
            {[d.immobile.indirizzo, d.immobile.comune && `${d.immobile.comune}${d.immobile.provincia ? ` (${d.immobile.provincia})` : ''}`].filter(Boolean).join(', ')}
            {[d.immobile.scala && ` · scala ${d.immobile.scala}`, d.immobile.piano && ` · piano ${d.immobile.piano}`, d.immobile.interno && ` · int. ${d.immobile.interno}`].filter(Boolean).join('')}
          </div>
          {d.immobile.catasto.foglio && (
            <div className="text-sm text-gray-600">Catasto: foglio {d.immobile.catasto.foglio}, part. {d.immobile.catasto.particella}{d.immobile.catasto.sub ? `, sub. ${d.immobile.catasto.sub}` : ''}{d.immobile.catasto.categoria ? `, cat. ${d.immobile.catasto.categoria}` : ''}</div>
          )}
          {catastoMancante && (
            <div className="mt-2 text-xs p-2 rounded bg-amber-50 text-amber-800">⚠️ Mancano comune o dati catastali: completali in Immobili → Modifica → “Dati per il foglio visita”.</div>
          )}
          <div className="text-sm text-gray-600">
            {d.visita.data}{d.visita.ora ? `, ore ${d.visita.ora}` : ''} · Agente {d.agente}
            {d.immobile.prezzo ? ` · Prezzo € ${d.immobile.prezzo.toLocaleString('it-IT')}` : ''}
          </div>
        </section>

        {an && (
          <section className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-xs font-bold tracking-wide mb-1" style={{ color: BLU }}>DATI DEL CLIENTE</div>
            <p className="text-xs text-gray-500 mb-3">Da compilare una sola volta: restano salvati per le prossime visite.</p>
            <div className="grid grid-cols-6 gap-2">
              <Campo cls="col-span-4" label="Nato/a a" v={an.luogo_nascita} set={v => setAn({ ...an, luogo_nascita: v })} />
              <Campo cls="col-span-2" label="Prov." v={an.provincia_nascita} set={v => setAn({ ...an, provincia_nascita: v.toUpperCase() })} />
              <Campo cls="col-span-6" label="Data di nascita" type="date" v={an.data_nascita} set={v => setAn({ ...an, data_nascita: v })} />
              <Campo cls="col-span-6" label="Codice fiscale" v={an.codice_fiscale} set={v => setAn({ ...an, codice_fiscale: v.toUpperCase() })} />
              <Campo cls="col-span-4" label="Residente a (comune)" v={an.residenza.comune} set={v => setAn({ ...an, residenza: { ...an.residenza, comune: v } })} />
              <Campo cls="col-span-2" label="Prov." v={an.residenza.provincia} set={v => setAn({ ...an, residenza: { ...an.residenza, provincia: v.toUpperCase() } })} />
              <Campo cls="col-span-4" label="Indirizzo" v={an.residenza.indirizzo} set={v => setAn({ ...an, residenza: { ...an.residenza, indirizzo: v } })} />
              <Campo cls="col-span-2" label="CAP" v={an.residenza.cap} set={v => setAn({ ...an, residenza: { ...an.residenza, cap: v } })} />
              <Campo cls="col-span-6" label="Per conto di (facoltativo)" v={an.per_conto_di} set={v => setAn({ ...an, per_conto_di: v })} />
              <Campo cls="col-span-6" label="Accompagnato/a da (facoltativo)" v={an.accompagnato_da} set={v => setAn({ ...an, accompagnato_da: v })} />
            </div>
          </section>
        )}

        <section className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-xs font-bold tracking-wide mb-1" style={{ color: BLU }}>IL CLIENTE DICHIARA</div>
          <p className="text-xs text-gray-500 mb-3">Leggi e spunta ogni dichiarazione.</p>
          <div className="space-y-3">
            {testi.map((t, i) => (
              <label key={i} className={`flex gap-3 items-start p-3 rounded-lg border-2 cursor-pointer ${ok[i] ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                <input type="checkbox" checked={ok[i]} onChange={e => setOk(o => o.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1 w-6 h-6 shrink-0" style={{ accentColor: BLU }} />
                <span className="text-[15px] leading-snug"><b className="block" style={{ color: BLU }}>{t.titolo}</b>{t.testo}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold tracking-wide" style={{ color: BLU }}>FIRMA DEL CLIENTE</div>
            <button onClick={() => { setPadKey(k => k + 1); setVuota(true) }} className="text-sm text-gray-500">Cancella</button>
          </div>
          <SignaturePad key={padKey} onChange={setVuota} />
          <p className="text-xs text-gray-500 mt-2">Firma con il dito nel riquadro.</p>
        </section>
        {msg && <p className="text-sm text-red-600">{msg}</p>}
      </main>

      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t">
        <div className="max-w-xl mx-auto px-4 py-3">
          <button
            onClick={firma}
            disabled={!tutteOk || vuota || !anOk || stato === 'invio'}
            className="w-full py-4 rounded-xl font-bold text-lg text-white disabled:opacity-40"
            style={{ background: BLU }}
          >
            {stato === 'invio' ? 'Salvo e invio…' : !anOk ? 'Completa i dati del cliente' : !tutteOk ? 'Spunta tutte le dichiarazioni' : vuota ? 'Manca la firma' : 'OK – Firma e invia la copia'}
          </button>
        </div>
      </div>
    </div>
  )
}
