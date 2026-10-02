'use client'

import { useEffect, useMemo, useState } from 'react'
import { authFetch } from '@/lib/api'
import { niceText } from '@/lib/text'

// Promemoria dell'appuntamento + brochure completa: email a tutti i prenotati o WhatsApp uno per uno.

interface Row {
  id: string
  status: string
  promemoria_inviato_at: string | null
  client: { nome: string; cognome: string; telefono: string; email: string }
  ora: string | null
}

const wa = (phone: string) => {
  let c = String(phone || '').replace(/\D/g, '')
  if (c && !c.startsWith('39')) c = '39' + c
  return c
}
const hhmm = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function ReminderPanel({ openHouseId, agentName, eventDate, eventEnd }: {
  openHouseId: string
  agentName: string
  eventDate: string
  eventEnd: string
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [property, setProperty] = useState<{ titolo: string; zona: string; indirizzo: string | null; brochure_url: string | null } | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await authFetch(`/api/open-houses/${openHouseId}/feedback`, { cache: 'no-store' })
      if (!alive || !res.ok) return
      const data = await res.json()
      setRows(data.rows)
      setProperty(data.openHouse.gre_properties)
    })()
    return () => { alive = false }
  }, [openHouseId])

  const confermati = useMemo(() => rows.filter(r => r.status === 'confirmed'), [rows])
  const daInviare = confermati.filter(r => !r.promemoria_inviato_at).length
  const ended = new Date(`${eventDate}T${eventEnd}`) < new Date()
  if (ended || !property || confermati.length === 0) return null

  const oggi = new Date().toLocaleDateString('sv-SE')
  const domani = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE')
  const giorno = eventDate === oggi ? 'oggi' : eventDate === domani ? 'domani' : new Date(eventDate + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  const luogo = [property.indirizzo, niceText(property.zona)].filter(Boolean).join(', ')

  const waText = (r: Row) =>
    `Ciao ${niceText(r.client.nome)}, sono ${agentName} di Ghergo Immobiliare. Ti ricordo l'appuntamento di ${giorno}` +
    `${r.ora ? ` alle ${r.ora.slice(0, 5)}` : ''} per l'Open House di ${niceText(property.titolo)}${luogo ? ` in ${luogo}` : ''}.` +
    (property.brochure_url ? `\nQui trovi la brochure completa dell'immobile: ${property.brochure_url}` : '') +
    `\nSe hai un imprevisto scrivimi pure. A presto!`

  const send = async (soloNonInviati: boolean) => {
    const n = soloNonInviati ? daInviare : confermati.length
    if (!window.confirm(`Invio il promemoria${property.brochure_url ? ' con la brochure' : ''} via email a ${n} client${n === 1 ? 'e' : 'i'}?`)) return
    setSending(true)
    setResult('')
    try {
      const res = await authFetch(`/api/open-houses/${openHouseId}/reminder`, { method: 'POST', body: JSON.stringify({ soloNonInviati }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const now = new Date().toISOString()
      setRows(rs => rs.map(r => (r.status === 'confirmed' && (!soloNonInviati || !r.promemoria_inviato_at) ? { ...r, promemoria_inviato_at: now } : r)))
      setResult(`✓ Inviati ${data.sent}${data.failed?.length ? ` · non riusciti: ${data.failed.join(', ')}` : ''}`)
    } catch (e) {
      setResult(e instanceof Error && e.message ? e.message : 'Invio non riuscito, riprova.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md mb-6">
      <div className="px-4 md:px-6 py-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg" style={{ color: 'var(--primary-blue)' }}>Promemoria e brochure</h2>
          <p className="text-sm" style={{ color: 'var(--text-gray)' }}>
            Ricorda l’appuntamento ai {confermati.length} prenotati e manda la brochure completa.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={() => send(false)} disabled={sending} className="btn-primary px-4 py-2 text-sm whitespace-nowrap disabled:opacity-50">
            {sending ? 'Invio in corso…' : `📧 Invia email a tutti (${confermati.length})`}
          </button>
          {daInviare > 0 && daInviare < confermati.length && (
            <button onClick={() => send(true)} disabled={sending} className="btn-secondary px-4 py-2 text-sm whitespace-nowrap disabled:opacity-50">
              Solo a chi non l’ha ricevuto ({daInviare})
            </button>
          )}
        </div>
      </div>

      <div className="px-4 md:px-6 py-3 text-sm flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
        {property.brochure_url ? (
          <span>📄 Brochure attuale: <a href={property.brochure_url} target="_blank" rel="noopener noreferrer" className="underline font-medium" style={{ color: 'var(--accent-blue)' }}>apri e controlla</a></span>
        ) : (
          <span className="text-orange-700 font-medium">⚠️ Nessuna brochure caricata: il promemoria partirà senza.</span>
        )}
        <span style={{ color: 'var(--text-gray)' }}>
          Per metterne una nuova: <b>Immobili → Modifica → Sostituisci brochure</b>, poi torna qui e invia.
        </span>
      </div>
      {result && <div className="px-4 md:px-6 pb-3 text-sm font-semibold text-green-700">{result}</div>}

      <div className="px-4 md:px-6 pb-4">
        <button onClick={() => setOpen(o => !o)} className="text-sm font-semibold" style={{ color: 'var(--primary-blue)' }}>
          {open ? '▾' : '▸'} Manda su WhatsApp uno per uno ({confermati.length})
        </button>
        {open && (
          <ul className="divide-y border rounded-lg mt-2">
            {confermati.map(r => (
              <li key={r.id} className="px-3 py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate" style={{ color: 'var(--text-dark)' }}>
                    {r.ora ? <span className="mr-2" style={{ color: 'var(--primary-blue)' }}>{r.ora.slice(0, 5)}</span> : null}
                    {r.client.nome} {r.client.cognome}
                  </div>
                  {r.promemoria_inviato_at && <div className="text-xs text-green-700">✓ Email inviata {hhmm(r.promemoria_inviato_at)}</div>}
                </div>
                <a
                  href={`https://wa.me/${wa(r.client.telefono)}?text=${encodeURIComponent(waText(r))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded text-sm font-semibold bg-green-600 text-white whitespace-nowrap"
                >
                  💬 WhatsApp
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
