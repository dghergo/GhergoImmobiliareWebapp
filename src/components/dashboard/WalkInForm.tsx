'use client'

import { useState } from 'react'
import { authFetch } from '@/lib/api'

// Check-in: cliente arrivato senza prenotazione. Entra subito nell'elenco come "Arrivato" e riceve la brochure.
export default function WalkInForm({ openHouseId, onClose, onAdded }: {
  openHouseId: string
  onClose: () => void
  onAdded: (msg: string, bookingId: string) => void
}) {
  const [f, setF] = useState({ nome: '', cognome: '', telefono: '', email: '', privacy: false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      const res = await authFetch(`/api/open-houses/${openHouseId}/clients`, { method: 'POST', body: JSON.stringify({ action: 'walk_in', ...f }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Salvataggio non riuscito')
      onAdded(`✓ ${f.nome} ${f.cognome} aggiunto${data.brochureInviata ? ' · brochure inviata' : ''}`, data.bookingId)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const input = (k: 'nome' | 'cognome' | 'telefono' | 'email', label: string, type = 'text', mode?: 'tel' | 'email') => (
    <label className="block text-sm" style={{ color: 'var(--text-gray)' }}>
      {label}
      <input
        type={type}
        inputMode={mode}
        autoCapitalize={k === 'email' ? 'none' : 'words'}
        value={f[k]}
        onChange={e => setF({ ...f, [k]: e.target.value })}
        className="mt-1 w-full px-3 py-3 rounded-lg border text-base bg-white"
        style={{ color: 'var(--text-dark)' }}
      />
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: 'var(--primary-blue)' }}>Cliente senza prenotazione</h2>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="Chiudi">×</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {input('nome', 'Nome')}
          {input('cognome', 'Cognome')}
        </div>
        {input('telefono', 'Telefono', 'tel', 'tel')}
        {input('email', 'Email', 'email', 'email')}
        <label className="flex gap-3 items-start text-sm p-3 rounded-lg bg-gray-50">
          <input type="checkbox" checked={f.privacy} onChange={e => setF({ ...f, privacy: e.target.checked })} className="mt-0.5 w-5 h-5 shrink-0" />
          <span>Il cliente ha letto l’informativa privacy e acconsente al trattamento dei dati.</span>
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          onClick={save}
          disabled={busy || !f.nome || !f.cognome || !f.telefono || !f.email || !f.privacy}
          className="w-full py-3.5 rounded-xl font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--primary-blue)' }}
        >
          {busy ? 'Salvo…' : 'Aggiungi e invia la brochure'}
        </button>
        <p className="text-xs" style={{ color: 'var(--text-gray)' }}>Il cliente entra nell’elenco come “Arrivato”. Subito dopo puoi fargli firmare la conferma di visita.</p>
      </div>
    </div>
  )
}
