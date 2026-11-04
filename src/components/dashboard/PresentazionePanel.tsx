'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/api'

// "Prepara la tua visita": email facoltativa con il video della casa e il video della proposta.
// Parte da sola 24 ore prima dell'Open House, oppure subito con "Invia adesso".

interface State {
  attiva: boolean
  video_casa_url: string
  video_proposta_url: string
  video_proposta_suggerito: string
  prenotati: number
  inviate: number
}

const BLU = '#203162'

export default function PresentazionePanel({ openHouseId, eventDate, eventEnd }: { openHouseId: string; eventDate: string; eventEnd: string }) {
  const [s, setS] = useState<State | null>(null)
  const [form, setForm] = useState({ attiva: false, video_casa_url: '', video_proposta_url: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const apply = (d: State) => {
    setS(d)
    setForm({ attiva: d.attiva, video_casa_url: d.video_casa_url, video_proposta_url: d.video_proposta_url || d.video_proposta_suggerito })
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await authFetch(`/api/open-houses/${openHouseId}/presentazione`, { cache: 'no-store' })
      if (alive && res.ok) apply(await res.json())
    })()
    return () => { alive = false }
  }, [openHouseId])

  const call = async (payload: Record<string, unknown>) => {
    setBusy(true); setMsg(null)
    const res = await authFetch(`/api/open-houses/${openHouseId}/presentazione`, { method: 'POST', body: JSON.stringify(payload) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg({ ok: false, text: d.error || 'Operazione non riuscita' }); return false }
    apply(d)
    if (d.ok) setMsg({ ok: true, text: d.ok })
    return true
  }

  if (!s) return null
  if (new Date(`${eventDate}T${eventEnd}`) < new Date()) return null

  const salvata = s.attiva === form.attiva && s.video_casa_url === form.video_casa_url && s.video_proposta_url === form.video_proposta_url
  const daInviare = s.prenotati - s.inviate
  const salva = () => call({ action: 'salva', ...form })

  const inviaAdesso = async () => {
    if (!salvata && !(await salva())) return
    if (!window.confirm(`Invio adesso l'email con i video a ${daInviare} client${daInviare === 1 ? 'e' : 'i'}? Ognuno la riceve una volta sola.`)) return
    await call({ action: 'invia' })
  }

  return (
    <div className="bg-white rounded-lg shadow-md mb-6 px-4 md:px-6 py-4">
      <h2 className="font-bold text-lg" style={{ color: BLU }}>🎬 Presentazione prima dell&apos;Open House</h2>
      <p className="text-sm" style={{ color: 'var(--text-gray)' }}>Email facoltativa con il video della casa e il video su come si fa una proposta.</p>

      <label className={`mt-3 flex gap-3 items-start p-3 rounded-lg border-2 cursor-pointer ${form.attiva ? 'bg-blue-50' : 'border-gray-200'}`} style={form.attiva ? { borderColor: BLU } : undefined}>
        <input type="checkbox" checked={form.attiva} disabled={busy} onChange={e => setForm({ ...form, attiva: e.target.checked })} className="mt-0.5 w-6 h-6 shrink-0" style={{ accentColor: BLU }} />
        <span className="text-sm leading-snug">
          <b>Invia la presentazione ai prenotati</b><br />
          Parte da sola 24 ore prima dell&apos;inizio, dalla casella di chi segue ogni cliente. Chi prenota dopo la riceve comunque prima dell&apos;Open House.
        </span>
      </label>

      <div className="grid md:grid-cols-2 gap-3 mt-3">
        <label className="text-sm">
          <span className="font-semibold" style={{ color: 'var(--text-dark)' }}>Link del video della casa</span>
          <input type="url" value={form.video_casa_url} onChange={e => setForm({ ...form, video_casa_url: e.target.value })} placeholder="https://youtu.be/…" className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="font-semibold" style={{ color: 'var(--text-dark)' }}>Link del video della proposta</span>
          <input type="url" value={form.video_proposta_url} onChange={e => setForm({ ...form, video_proposta_url: e.target.value })} placeholder="https://youtu.be/…" className="mt-1 w-full border rounded-lg px-3 py-2" />
          {!s.video_proposta_url && s.video_proposta_suggerito && <span className="text-xs" style={{ color: 'var(--text-gray)' }}>Proposto quello usato l&apos;ultima volta</span>}
        </label>
      </div>
      <p className="text-xs mt-1" style={{ color: 'var(--text-gray)' }}>Usa link che chiunque può aprire (per esempio YouTube come &quot;non in elenco&quot;).</p>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button disabled={busy || salvata} onClick={salva} className="px-4 py-2 rounded-lg font-semibold text-sm border-2 disabled:opacity-40" style={{ borderColor: BLU, color: BLU }}>Salva</button>
        <button disabled={busy || !form.video_casa_url} onClick={async () => { if (salvata || (await salva())) await call({ action: 'prova' }) }} className="px-4 py-2 rounded-lg font-semibold text-sm border disabled:opacity-40" style={{ color: BLU }}>✉️ Mandami una prova</button>
        <button disabled={busy || !form.attiva || !form.video_casa_url || daInviare === 0} onClick={inviaAdesso} className="px-4 py-2 rounded-lg font-bold text-sm text-white disabled:opacity-40" style={{ background: BLU }}>
          {busy ? 'Invio…' : `📨 Invia adesso${daInviare > 0 ? ` (${daInviare})` : ''}`}
        </button>
        <span className="text-sm" style={{ color: 'var(--text-gray)' }}>Inviata a {s.inviate} su {s.prenotati} prenotati</span>
      </div>
      {msg && <p className={`text-sm mt-2 ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.ok ? '✓ ' : ''}{msg.text}</p>}
    </div>
  )
}
