'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/api'

// Sold Out e lista d'attesa: chiude le prenotazioni senza togliere l'Open House dall'elenco
// e raccoglie i contatti di chi arriva dopo.

interface Attesa {
  id: string
  nome: string
  cognome: string
  email: string
  telefono: string
  messaggio: string | null
  mine: boolean
  portato_da: string | null
  created_at: string
  contattato_at: string | null
}

const BLU = '#203162'

const waNumber = (phone: string) => {
  let c = phone.replace(/\D/g, '')
  if (!c.startsWith('39')) c = '39' + c
  return c
}

export default function SoldOutPanel({ openHouseId, onChange }: { openHouseId: string; onChange?: (soldOut: boolean) => void }) {
  const [soldOut, setSoldOut] = useState(false)
  const [puoGestire, setPuoGestire] = useState(false)
  const [lista, setLista] = useState<Attesa[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [io, setIo] = useState<{ nome: string; qualifica: 'agente' | 'assistente' } | null>(null)
  const [festa, setFesta] = useState(false)

  const apply = (data: { sold_out: boolean; puo_gestire: boolean; lista: Attesa[]; io?: { nome: string; qualifica: 'agente' | 'assistente' } }) => {
    if (data.io) setIo(data.io)
    setSoldOut(data.sold_out)
    setPuoGestire(data.puo_gestire)
    setLista(data.lista || [])
    onChange?.(data.sold_out)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await authFetch(`/api/open-houses/${openHouseId}/waitlist`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!alive) return
      if (res.ok) apply(data)
      else setMsg(data.error || 'Non disponibile')
      setLoaded(true)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openHouseId])

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true)
    setMsg('')
    const res = await authFetch(`/api/open-houses/${openHouseId}/waitlist`, { method: 'POST', body: JSON.stringify(payload) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg(data.error || 'Non salvato'); return false }
    apply(data)
    return true
  }

  const segnaSoldOut = async () => {
    const ok = window.confirm('Confermi che l\'Open House è SOLD OUT?\n\nTutti gli orari risulteranno occupati, sulla foto e nell\'elenco comparirà SOLD OUT e chi arriva potrà lasciare i contatti nella lista d\'attesa. Le prenotazioni già fatte non cambiano.')
    if (ok && await act({ action: 'sold_out', on: true })) setFesta(true)
  }

  const riapri = () => {
    if (window.confirm('Riaprire le prenotazioni? I clienti potranno di nuovo scegliere gli orari liberi.')) act({ action: 'sold_out', on: false })
  }

  if (!loaded) return null
  // un collega senza contatti in lista non ha niente da vedere qui
  if (!puoGestire && lista.length === 0) return null

  const daContattare = lista.filter(l => l.mine && !l.contattato_at).length
  const quando = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="bg-white rounded-lg shadow-md mb-6 px-4 md:px-6 py-4">
      <h2 className="font-bold text-lg flex items-center gap-2" style={{ color: BLU }}>
        Sold Out e lista d&apos;attesa
        {soldOut && <span className="px-2 py-0.5 rounded text-xs font-bold tracking-widest text-white" style={{ background: BLU }}>SOLD OUT</span>}
      </h2>
      {puoGestire ? (
        soldOut ? (
          <p className="text-sm mt-1" style={{ color: 'var(--text-gray)' }}>
            Tutti gli orari risultano occupati e chi arriva lascia i contatti nella lista d&apos;attesa.{' '}
            <button disabled={busy} onClick={riapri} className="underline" style={{ color: BLU }}>Riapri prenotazioni</button>
          </p>
        ) : (
          <div className="mt-3">
            <button disabled={busy} onClick={segnaSoldOut} className="px-5 py-3 rounded-lg font-bold text-white disabled:opacity-50" style={{ background: BLU }}>
              🏆 Open House Sold Out
            </button>
            <p className="text-xs mt-2" style={{ color: 'var(--text-gray)' }}>Quando non vuoi più prenotazioni: l&apos;evento resta in elenco con la scritta SOLD OUT e raccoglie la lista d&apos;attesa.</p>
          </div>
        )
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-gray)' }}>{soldOut ? 'Prenotazioni chiuse: l\'Open House è in Sold Out.' : 'Prenotazioni aperte.'}</p>
      )}

      {msg && <p className="text-sm text-red-600 mt-3">{msg}</p>}

      {(soldOut || lista.length > 0) && (
        <div className="mt-4 border-t pt-4">
          <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-dark)' }}>
            Lista d&apos;attesa: {lista.length} {lista.length === 1 ? 'contatto' : 'contatti'}
            {daContattare > 0 && <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">{daContattare} da contattare</span>}
          </div>
          {lista.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-gray)' }}>Ancora nessuno. I contatti arrivano dalla pagina pubblica e ti avvisiamo per email.</p>
          ) : (
            <ul className="divide-y border rounded-lg">
              {lista.map(l => (
                <li key={l.id} className={`px-3 py-2.5 ${l.contattato_at ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold" style={{ color: 'var(--text-dark)' }}>{l.nome} {l.cognome}</div>
                      <div className="text-xs" style={{ color: 'var(--text-gray)' }}>
                        Iscritto {quando(l.created_at)}
                        {l.contattato_at && ` · contattato ${quando(l.contattato_at)}`}
                      </div>
                      {l.portato_da && <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">Cliente di {l.portato_da} · lo segue lui/lei</span>}
                      {l.mine && l.messaggio && <p className="text-sm italic mt-1" style={{ color: 'var(--text-gray)' }}>“{l.messaggio}”</p>}
                    </div>
                    {l.mine && (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <a href={`tel:${l.telefono}`} className="px-3 py-1.5 rounded-lg border" style={{ color: BLU }}>📞 Chiama</a>
                        <a href={`https://wa.me/${waNumber(l.telefono)}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-green-600 text-white">WhatsApp</a>
                        <a href={`mailto:${l.email}`} className="px-3 py-1.5 rounded-lg border" style={{ color: BLU }}>Email</a>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={!!l.contattato_at} disabled={busy} onChange={e => act({ action: 'contattato', waitId: l.id, on: e.target.checked })} className="w-5 h-5" style={{ accentColor: BLU }} />
                          Contattato
                        </label>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {festa && <Complimenti io={io} onClose={() => setFesta(false)} />}
    </div>
  )
}

// Nomi maschili che finiscono in -a (il programma non registra il sesso: lo si deduce dal nome)
const MASCHILI_IN_A = ['andrea', 'luca', 'gianluca', 'nicola', 'mattia', 'elia', 'enea', 'tobia', 'battista', 'giosuè', 'giona', 'evangelista', 'zaccaria', 'geremia', 'isaia', 'mosè', 'costa']
const femminile = (nome: string) => {
  const n = nome.trim().split(/[\s_]+/)[0].toLowerCase()
  return n.endsWith('a') && !MASCHILI_IN_A.includes(n)
}

function Complimenti({ io, onClose }: { io: { nome: string; qualifica: 'agente' | 'assistente' } | null; onClose: () => void }) {
  const nome = (io?.nome || '').split('_')[0]
  const f = femminile(nome)
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-6" onClick={onClose}>
      <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="so-title">
        <div className="px-6 pt-7 pb-5 text-center text-white rounded-t-2xl" style={{ background: BLU }}>
          <div className="text-5xl" aria-hidden="true">🏆</div>
          <h2 id="so-title" className="text-2xl font-bold mt-2 tracking-wide">Open House Sold Out!</h2>
        </div>
        <div className="px-6 py-6 space-y-4 text-[15px] leading-relaxed" style={{ color: 'var(--text-dark)' }}>
            <>
              <p>Complimenti <b>{nome}</b>, questo risultato è tutto merito tuo. Un Open House che va sold out non è fortuna: nasce da un&apos;acquisizione fatta bene e da una promozione eccellente. Hai scelto l&apos;immobile giusto, l&apos;hai preso al prezzo giusto e l&apos;hai fatto conoscere nel modo giusto.</p>
              <p className="font-semibold">Sono traguardi che raggiungono solo i grandi agenti immobiliari.</p>
              <p>Adesso il lavoro non è solo vendere questo immobile, ma trasformarlo in un successo completo:</p>
              <ul className="space-y-1.5 pl-1">
                <li>• <b>nelle acquisizioni</b>, raccontando ai proprietari che cosa sai ottenere;</li>
                <li>• <b>nella pubblicità</b>, facendo vedere a tutti questo risultato;</li>
                <li>• <b>nella tua reputazione</b>, perché ogni cliente che entra deve uscire convinto della tua professionalità.</li>
              </ul>
              <p>Continua così e ti contraddistinguerai come <b>{f ? 'una vera Top Producer' : 'un vero Top Producer'}</b>. 🚀</p>
            </>
          <button onClick={onClose} className="w-full mt-2 px-5 py-3 rounded-lg font-bold text-white" style={{ background: BLU }}>Grazie!</button>
        </div>
      </div>
    </div>
  )
}
