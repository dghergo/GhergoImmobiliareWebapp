'use client'

import { useState } from 'react'
import { authFetch } from '@/lib/api'

// Scheda immobile (gestionale): venduto + offerte ricevute agli Open House.

export interface OffertaImmobile { id: string; importo: number; data: string; stato: string; condizioni: string | null; cliente: string; agente: string | null; open_house: string | null }

const BLU = '#203162'
const STATO: Record<string, string> = { presentata: 'presentata', accettata: 'accettata ✓', rifiutata: 'rifiutata', ritirata: 'ritirata' }
const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const dataIt = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

export default function ImmobileVendita({ propertyId, vendutoIl, offerte, onVenduto }: {
  propertyId: string
  vendutoIl: string | null
  offerte: OffertaImmobile[]
  onVenduto: (data: string | null) => void
}) {
  const [aperto, setAperto] = useState(false)
  const [chiedo, setChiedo] = useState(false)
  const [data, setData] = useState(new Date().toLocaleDateString('sv-SE'))
  const [busy, setBusy] = useState(false)

  const salva = async (d: string | null) => {
    setBusy(true)
    const res = await authFetch('/api/properties/vendita', { method: 'POST', body: JSON.stringify({ action: 'venduto', propertyId, data: d }) })
    setBusy(false)
    if (res.ok) {
      onVenduto(d)
      setChiedo(false)
    }
  }

  const valide = offerte.filter(o => o.stato !== 'rifiutata' && o.stato !== 'ritirata')
  const migliore = valide.reduce((m, o) => Math.max(m, o.importo), 0)

  return (
    <div className="mb-3 rounded-lg border text-sm" style={{ borderColor: vendutoIl ? '#bbf7d0' : '#e5e7eb', background: vendutoIl ? '#f0fdf4' : '#fafafa' }}>
      <div className="px-3 py-2 flex flex-wrap items-center gap-2">
        {vendutoIl ? (
          <span className="font-bold text-green-800">🎉 VENDUTO il {dataIt(vendutoIl)}</span>
        ) : chiedo ? (
          <>
            <input type="date" value={data} onChange={e => setData(e.target.value)} className="border rounded px-2 py-1 text-xs" />
            <button disabled={busy} onClick={() => salva(data)} className="px-2 py-1 rounded text-white text-xs font-semibold" style={{ background: BLU }}>Conferma venduto</button>
            <button onClick={() => setChiedo(false)} className="text-xs underline text-gray-600">Annulla</button>
          </>
        ) : (
          <button onClick={() => setChiedo(true)} className="text-xs font-semibold underline" style={{ color: BLU }}>Segna come venduto</button>
        )}
        {vendutoIl && <button disabled={busy} onClick={() => salva(null)} className="text-xs underline text-gray-500 ml-auto">annulla</button>}
      </div>

      <button onClick={() => setAperto(a => !a)} disabled={!offerte.length} className="w-full px-3 py-2 border-t text-left flex items-center gap-2" style={{ borderColor: 'inherit' }}>
        <span className="font-semibold" style={{ color: BLU }}>💰 {offerte.length ? `${offerte.length} ${offerte.length === 1 ? 'offerta' : 'offerte'}` : 'Nessuna offerta'}</span>
        {migliore > 0 && <span style={{ color: 'var(--text-gray)' }}>· migliore {euro(migliore)}</span>}
        {offerte.length > 0 && <span className="ml-auto" style={{ color: BLU }}>{aperto ? '▾' : '▸'}</span>}
      </button>
      {aperto && (
        <ul className="border-t divide-y divide-green-100" style={{ borderColor: "inherit" }}>
          {offerte.map(o => (
            <li key={o.id} className="px-3 py-2">
              <div className="flex flex-wrap gap-x-2">
                <span className="font-bold" style={{ color: BLU }}>{euro(o.importo)}</span>
                <span>{o.cliente}</span>
                <span className={o.stato === 'accettata' ? 'text-green-700 font-semibold' : 'text-gray-500'}>· {STATO[o.stato] || o.stato}</span>
              </div>
              <div className="text-xs" style={{ color: 'var(--text-gray)' }}>
                {dataIt(o.data)}
                {o.agente ? ` · ${o.agente}` : ''}
                {o.open_house ? ` · Open House del ${dataIt(o.open_house)}` : ''}
                {o.condizioni ? ` · ${o.condizioni}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="px-3 pb-2 text-xs" style={{ color: 'var(--text-gray)' }}>Le offerte si registrano dal cruscotto dell&apos;Open House.</p>
    </div>
  )
}
