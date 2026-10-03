'use client'

import { useState } from 'react'
import { authFetch } from '@/lib/api'

// Nel check-in: correggere telefono/email del cliente e (re)inviargli la brochure.
export default function ClientActions({ openHouseId, bookingId, email, telefono, onSaved }: {
  openHouseId: string
  bookingId: string
  email: string
  telefono: string
  onSaved: (c: { email: string; telefono: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email, telefono })
  const [busy, setBusy] = useState<'' | 'save' | 'brochure'>('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const call = async (action: string, extra: object = {}) => {
    const res = await authFetch(`/api/open-houses/${openHouseId}/clients`, {
      method: 'POST',
      body: JSON.stringify({ bookingId, action, ...extra }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Operazione non riuscita')
    return data
  }

  const save = async () => {
    setBusy('save'); setMsg(null)
    try {
      const d = await call('update_contact', form)
      onSaved({ email: d.email, telefono: d.telefono })
      setMsg({ ok: true, text: '✓ Contatti aggiornati' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally { setBusy('') }
  }

  const brochure = async () => {
    if (!window.confirm(`Invio la brochure a ${form.email}?`)) return
    setBusy('brochure'); setMsg(null)
    try {
      const d = await call('send_brochure')
      setMsg({ ok: true, text: `✓ Brochure inviata a ${d.to}` })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally { setBusy('') }
  }

  return (
    <div className="mt-2">
      <button onClick={() => setOpen(o => !o)} className="text-sm font-semibold" style={{ color: 'var(--primary-blue)' }}>
        {open ? '▾' : '▸'} Contatti e brochure
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-lg space-y-2" style={{ background: 'var(--light-gray)' }}>
          <label className="block text-xs" style={{ color: 'var(--text-gray)' }}>
            Telefono
            <input type="tel" inputMode="tel" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })}
              className="mt-0.5 w-full px-3 py-2 rounded border bg-white text-base" style={{ color: 'var(--text-dark)' }} />
          </label>
          <label className="block text-xs" style={{ color: 'var(--text-gray)' }}>
            Email
            <input type="email" inputMode="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              className="mt-0.5 w-full px-3 py-2 rounded border bg-white text-base" style={{ color: 'var(--text-dark)' }} />
          </label>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={save} disabled={!!busy || (form.email === email && form.telefono === telefono)}
              className="py-2.5 rounded-lg font-semibold text-white disabled:opacity-40" style={{ background: 'var(--primary-blue)' }}>
              {busy === 'save' ? 'Salvo…' : 'Salva contatti'}
            </button>
            <button onClick={brochure} disabled={!!busy} className="py-2.5 rounded-lg font-semibold bg-white border disabled:opacity-40" style={{ color: 'var(--primary-blue)' }}>
              {busy === 'brochure' ? 'Invio…' : '📄 Invia brochure'}
            </button>
          </div>
          {msg && <div className={`text-sm font-medium ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</div>}
        </div>
      )}
    </div>
  )
}
