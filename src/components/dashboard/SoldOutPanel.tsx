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

  const apply = (data: { sold_out: boolean; puo_gestire: boolean; lista: Attesa[] }) => {
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
    if (!res.ok) { setMsg(data.error || 'Non salvato'); return }
    apply(data)
  }

  const toggleSoldOut = () => {
    const ok = soldOut
      ? window.confirm('Riaprire le prenotazioni? I clienti potranno di nuovo scegliere gli orari liberi.')
      : window.confirm('Segnare l\'Open House come SOLD OUT?\n\nLe prenotazioni si chiudono, l\'evento resta in elenco con la scritta Sold Out e chi arriva può lasciare i contatti nella lista d\'attesa. Le prenotazioni già fatte non cambiano.')
    if (ok) act({ action: 'sold_out', on: !soldOut })
  }

  if (!loaded) return null
  // un collega senza contatti in lista non ha niente da vedere qui
  if (!puoGestire && lista.length === 0) return null

  const daContattare = lista.filter(l => l.mine && !l.contattato_at).length
  const quando = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="bg-white rounded-lg shadow-md mb-6 px-4 md:px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2" style={{ color: BLU }}>
            Sold Out e lista d&apos;attesa
            {soldOut && <span className="px-2 py-0.5 rounded text-xs font-bold tracking-widest text-white" style={{ background: BLU }}>SOLD OUT</span>}
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-gray)' }}>
            {soldOut
              ? 'Prenotazioni chiuse: l\'evento resta in elenco e raccoglie la lista d\'attesa.'
              : 'Quando non vuoi più prenotazioni, chiudi l\'Open House senza toglierlo dall\'elenco.'}
          </p>
        </div>
        {puoGestire && (
          <button
            disabled={busy}
            onClick={toggleSoldOut}
            className="px-4 py-2 rounded-lg font-semibold text-sm border-2 disabled:opacity-50"
            style={soldOut ? { borderColor: BLU, color: BLU } : { background: BLU, borderColor: BLU, color: '#fff' }}
          >
            {soldOut ? 'Riapri prenotazioni' : 'Segna come Sold Out'}
          </button>
        )}
      </div>

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
    </div>
  )
}
