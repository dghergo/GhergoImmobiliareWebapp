'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/api'

// Orari e posti dell'Open House: distribuzione graduale, capienza, apri/chiudi, sposta, aggiungi.

interface Slot {
  id: string
  ora_inizio: string
  ora_fine: string
  capienza: number
  prenotati: number
  chiuso: boolean
  manuale: boolean
  con_prenotazioni: boolean
  stato: 'aperto' | 'in_attesa' | 'completo' | 'chiuso'
}

const BLU = '#203162'
const STATO: Record<Slot['stato'], { t: string; cls: string }> = {
  aperto: { t: 'Prenotabile', cls: 'bg-green-100 text-green-800' },
  in_attesa: { t: 'Si apre più avanti', cls: 'bg-gray-100 text-gray-600' },
  completo: { t: 'Completo', cls: 'bg-amber-100 text-amber-800' },
  chiuso: { t: 'Chiuso', cls: 'bg-red-100 text-red-700' },
}

const addMin = (hhmm: string, m: number) => {
  const [h, mm] = hhmm.split(':').map(Number)
  const t = Math.min(h * 60 + mm + m, 23 * 60 + 59)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export default function SlotManager({ openHouseId }: { openHouseId: string }) {
  const [open, setOpen] = useState(false)
  const [slots, setSlots] = useState<Slot[]>([])
  const [graduale, setGraduale] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [edit, setEdit] = useState<string | null>(null)
  const [orari, setOrari] = useState({ ora_inizio: '', ora_fine: '' })
  const [nuovo, setNuovo] = useState({ ora_inizio: '', ora_fine: '', max: 3 })

  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      const res = await authFetch(`/api/open-houses/${openHouseId}/slots`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!alive) return
      if (res.ok) { setSlots(data.slots); setGraduale(data.graduale) } else setMsg(data.error || 'Non disponibile')
    })()
    return () => { alive = false }
  }, [open, openHouseId])

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true)
    setMsg('')
    const res = await authFetch(`/api/open-houses/${openHouseId}/slots`, { method: 'POST', body: JSON.stringify(payload) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg(data.error || 'Non salvato'); return false }
    setSlots(data.slots)
    setGraduale(data.graduale)
    return true
  }

  const tot = slots.filter(s => !s.chiuso).reduce((a, s) => a + s.capienza, 0)
  const pren = slots.reduce((a, s) => a + s.prenotati, 0)
  const capComune = slots.length && slots.every(s => s.capienza === slots[0].capienza) ? slots[0].capienza : null
  const ultimo = slots[slots.length - 1]

  return (
    <div className="bg-white rounded-lg shadow-md mb-6">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 md:px-6 py-4 text-left">
        <div>
          <h2 className="font-bold text-lg" style={{ color: BLU }}>🕒 Orari e posti</h2>
          <p className="text-sm" style={{ color: 'var(--text-gray)' }}>Aggiungi posti, sposta o chiudi un orario</p>
        </div>
        <span className="text-xl" style={{ color: BLU }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="px-4 md:px-6 pb-5 space-y-4 border-t pt-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1.5 rounded-lg" style={{ background: 'var(--light-gray)' }}><b>{pren}</b> prenotati su <b>{tot}</b> posti</span>
          </div>

          <label className={`flex gap-3 items-start p-3 rounded-lg border-2 cursor-pointer ${graduale ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
            <input type="checkbox" checked={graduale} disabled={busy} onChange={e => act({ action: 'graduale', on: e.target.checked })} className="mt-0.5 w-6 h-6 shrink-0" style={{ accentColor: BLU }} />
            <span className="text-sm leading-snug">
              <b>Distribuzione graduale</b><br />
              I posti si aprono a giri: prima un posto per ogni orario, poi il secondo, poi il terzo. Così i visitatori si distribuiscono su tutto l&apos;Open House.
            </span>
          </label>

          <div>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-dark)' }}>Posti per ogni orario</div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} disabled={busy} onClick={() => act({ action: 'capienza_tutti', max: n })}
                  className="w-11 h-11 rounded-lg font-bold border-2"
                  style={capComune === n ? { background: BLU, color: '#fff', borderColor: BLU } : { borderColor: '#d1d5db', color: BLU }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {msg && <p className="text-sm text-red-600">{msg}</p>}

          <ul className="divide-y border rounded-lg">
            {slots.map(s => (
              <li key={s.id} className={`px-3 py-2.5 ${s.chiuso ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold whitespace-nowrap" style={{ color: BLU }}>{s.ora_inizio}–{s.ora_fine}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATO[s.stato].cls}`}>{STATO[s.stato].t}</span>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs">
                      <button disabled={busy} onClick={() => act({ action: s.chiuso ? 'apri' : 'chiudi', slotId: s.id })} className="underline" style={{ color: BLU }}>
                        {s.chiuso ? 'Riapri' : 'Chiudi'}
                      </button>
                      {s.prenotati === 0 && (
                        <button onClick={() => { setEdit(edit === s.id ? null : s.id); setOrari({ ora_inizio: s.ora_inizio, ora_fine: s.ora_fine }) }} className="underline" style={{ color: BLU }}>
                          Sposta
                        </button>
                      )}
                      {!s.con_prenotazioni && (
                        <button disabled={busy} onClick={() => act({ action: 'elimina', slotId: s.id })} className="underline text-red-600">Elimina</button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button disabled={busy || s.capienza <= Math.max(1, s.prenotati)} onClick={() => act({ action: 'capienza', slotId: s.id, max: s.capienza - 1 })} className="w-9 h-9 rounded border text-lg leading-none disabled:opacity-30">−</button>
                    <span className="w-11 text-center text-sm"><b>{s.prenotati}</b>/{s.capienza}</span>
                    <button disabled={busy || s.capienza >= 20} onClick={() => act({ action: 'capienza', slotId: s.id, max: s.capienza + 1 })} className="w-9 h-9 rounded border text-lg leading-none disabled:opacity-30">+</button>
                  </div>
                </div>
                {edit === s.id && (
                  <div className="flex items-center gap-2 mt-2">
                    <input type="time" value={orari.ora_inizio} onChange={e => setOrari({ ...orari, ora_inizio: e.target.value })} className="border rounded px-2 py-1" />
                    <span>–</span>
                    <input type="time" value={orari.ora_fine} onChange={e => setOrari({ ...orari, ora_fine: e.target.value })} className="border rounded px-2 py-1" />
                    <button disabled={busy} onClick={async () => { if (await act({ action: 'orario', slotId: s.id, ...orari })) setEdit(null) }} className="px-3 py-1 rounded text-white text-sm" style={{ background: BLU }}>Salva</button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="rounded-lg p-3" style={{ background: 'var(--light-gray)' }}>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-dark)' }}>Aggiungi un orario</div>
            <div className="flex flex-wrap items-center gap-2">
              <input type="time" value={nuovo.ora_inizio} onChange={e => setNuovo({ ...nuovo, ora_inizio: e.target.value, ora_fine: nuovo.ora_fine || (e.target.value ? addMin(e.target.value, 10) : '') })} className="border rounded px-2 py-1 bg-white" />
              <span>–</span>
              <input type="time" value={nuovo.ora_fine} onChange={e => setNuovo({ ...nuovo, ora_fine: e.target.value })} className="border rounded px-2 py-1 bg-white" />
              <select value={nuovo.max} onChange={e => setNuovo({ ...nuovo, max: Number(e.target.value) })} className="border rounded px-2 py-1 bg-white">
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? 'posto' : 'posti'}</option>)}
              </select>
              <button
                disabled={busy || !nuovo.ora_inizio || !nuovo.ora_fine}
                onClick={async () => { if (await act({ action: 'aggiungi', ...nuovo })) setNuovo({ ora_inizio: '', ora_fine: '', max: nuovo.max }) }}
                className="px-3 py-1.5 rounded text-white text-sm font-semibold disabled:opacity-40" style={{ background: BLU }}>
                + Aggiungi
              </button>
              {ultimo && !nuovo.ora_inizio && (
                <button onClick={() => {
                  const durata = (() => { const [a, b] = ultimo.ora_inizio.split(':').map(Number); const [c, d] = ultimo.ora_fine.split(':').map(Number); return c * 60 + d - (a * 60 + b) })()
                  setNuovo({ ...nuovo, ora_inizio: ultimo.ora_fine, ora_fine: addMin(ultimo.ora_fine, durata) })
                }} className="text-xs underline" style={{ color: BLU }}>
                  dopo le {ultimo.ora_fine}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
