'use client'

import { useState } from 'react'
import { authFetch } from '@/lib/api'

// Nota personale di chi segue il cliente, legata a questa visita.
// La vede solo chi segue il cliente (e l'admin): non va nel report per il venditore né nelle email.
export default function NotaCliente({ openHouseId, bookingId, nota, notaAt, onSaved }: {
  openHouseId: string
  bookingId: string
  nota: string | null
  notaAt: string | null
  onSaved?: (nota: string | null, at: string | null) => void
}) {
  const [testo, setTesto] = useState(nota || '')
  const [salvata, setSalvata] = useState<{ nota: string | null; at: string | null }>({ nota, at: notaAt })
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setBusy(true); setErr('')
    const res = await authFetch(`/api/open-houses/${openHouseId}/clients`, { method: 'POST', body: JSON.stringify({ bookingId, action: 'nota', nota: testo }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(data.error || 'Nota non salvata'); return }
    setSalvata({ nota: data.nota, at: data.nota_at })
    onSaved?.(data.nota, data.nota_at)
    setEdit(false)
  }

  const quando = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

  if (edit) {
    return (
      <div className="mt-2 space-y-2">
        <textarea
          rows={3}
          value={testo}
          onChange={e => setTesto(e.target.value)}
          placeholder="Nota personale sul cliente: cosa cerca, cosa ti ha detto, come ricontattarlo…"
          className="w-full border rounded-lg p-2 text-sm bg-white"
          autoFocus
        />
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="btn-primary px-3 py-1.5 text-sm font-semibold disabled:opacity-50">{busy ? 'Salvo…' : 'Salva nota'}</button>
          <button onClick={() => { setTesto(salvata.nota || ''); setEdit(false) }} className="px-3 py-1.5 text-sm rounded bg-white border">Annulla</button>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-gray)' }}>La vedi solo tu (e l&apos;admin). Non compare nel report per il venditore.</p>
      </div>
    )
  }

  return salvata.nota ? (
    <button onClick={() => setEdit(true)} className="mt-2 block w-full text-left rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm hover:border-yellow-300">
      <span className="font-semibold text-yellow-900">📝 Nota personale</span>
      {salvata.at && <span className="text-xs text-yellow-800"> · {quando(salvata.at)}</span>}
      <span className="block whitespace-pre-line mt-0.5" style={{ color: 'var(--text-dark)' }}>{salvata.nota}</span>
    </button>
  ) : (
    <button onClick={() => setEdit(true)} className="mt-1.5 text-xs underline" style={{ color: 'var(--primary-blue)' }}>📝 Aggiungi nota personale</button>
  )
}
