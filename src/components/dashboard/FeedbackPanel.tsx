'use client'

import { useEffect, useMemo, useState } from 'react'
import { authFetch } from '@/lib/api'
import { ASPETTI, OFFERTA_QUANDO, PREZZO, PROSSIMO_PASSO, labelOf, type FeedbackAnswers } from '@/lib/feedback'
import { niceText } from '@/lib/text'

export interface FeedbackRow {
  id: string
  status: 'confirmed' | 'completed' | 'no_show'
  feedback_email_sent: boolean
  feedback_completed: boolean
  feedback_whatsapp_at: string | null
  client: { nome: string; cognome: string; telefono: string; email: string }
  ora: string | null
  feedback: {
    rating: number | null
    commenti: string | null
    interesse_acquisto: boolean | null
    richiesta_appuntamento: boolean | null
    risposte: FeedbackAnswers | null
    offerta_quando: string | null
    offerta_gestita_at: string | null
    submitted_at: string
  } | null
}

const wa = (phone: string) => {
  let c = String(phone || '').replace(/\D/g, '')
  if (c && !c.startsWith('39')) c = '39' + c
  return c
}
const stars = (n?: number | null) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '')
const ddmm = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

export default function FeedbackPanel({ openHouseId, titolo, agentName, eventDate, eventEnd, showReport = true }: {
  openHouseId: string
  titolo: string
  agentName: string
  eventDate: string
  eventEnd: string
  showReport?: boolean
}) {
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await authFetch(`/api/open-houses/${openHouseId}/feedback`, { cache: 'no-store' })
      if (!alive) return
      if (res.ok) setRows((await res.json()).rows)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [openHouseId])

  const act = async (bookingId: string, action: string) => {
    const res = await authFetch(`/api/open-houses/${openHouseId}/feedback`, { method: 'POST', body: JSON.stringify({ bookingId, action }) })
    if (res.ok) {
      const { at } = await res.json()
      setRows(rs => rs.map(r => {
        if (r.id !== bookingId) return r
        if (action === 'whatsapp_sent') return { ...r, feedback_whatsapp_at: at }
        if (r.feedback) return { ...r, feedback: { ...r.feedback, offerta_gestita_at: action === 'offer_handled' ? at : null } }
        return r
      }))
    }
  }

  const ended = new Date(`${eventDate}T${eventEnd}`) < new Date()
  // chi ha visitato (o non è stato segnato assente)
  const visitatori = useMemo(() => rows.filter(r => r.status !== 'no_show'), [rows])
  const risposte = useMemo(() => visitatori.filter(r => r.feedback), [visitatori])
  const mancanti = useMemo(() => visitatori.filter(r => !r.feedback), [visitatori])
  const offerte = useMemo(() => risposte.filter(r => r.feedback?.interesse_acquisto), [risposte])
  const rivedere = useMemo(() => risposte.filter(r => r.feedback?.richiesta_appuntamento), [risposte])
  const media = risposte.length ? risposte.reduce((s, r) => s + (r.feedback?.rating || 0), 0) / risposte.filter(r => r.feedback?.rating).length : 0
  const pct = visitatori.length ? Math.round((risposte.length / visitatori.length) * 100) : 0

  const waMessage = (r: FeedbackRow) => {
    const link = `${window.location.origin}/feedback/${r.id}`
    return `Ciao ${niceText(r.client.nome)}, sono ${agentName} di Ghergo Immobiliare. Grazie per essere venuto a vedere ${niceText(titolo)}! ` +
      `Mi lasceresti un parere veloce? Bastano 30 secondi, solo qualche tocco: ${link}\n` +
      `Mi aiuta molto, anche per i proprietari. Grazie!`
  }

  if (loading) return null

  return (
    <div className="bg-white rounded-lg shadow-md mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 md:px-6 py-4 border-b">
        <div>
          <h2 className="font-bold text-lg" style={{ color: 'var(--primary-blue)' }}>Feedback dopo la visita</h2>
          <p className="text-sm" style={{ color: 'var(--text-gray)' }}>
            {ended
              ? 'L’email parte da sola un’ora dopo la fine. A chi non risponde, manda il messaggio WhatsApp già pronto.'
              : 'L’email con la richiesta parte da sola un’ora dopo la fine dell’Open House.'}
          </p>
        </div>
        {showReport && <a href={`/dashboard/open-houses/${openHouseId}/report`} target="_blank" rel="noopener noreferrer" className="btn-primary px-4 py-2 text-sm whitespace-nowrap text-center">
          📄 Report venditore (PDF)
        </a>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 md:px-6">
        <div className="rounded-lg p-3" style={{ background: 'var(--light-gray)' }}>
          <div className="text-xs" style={{ color: 'var(--text-gray)' }}>Risposte</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--primary-blue)' }}>{risposte.length}/{visitatori.length}</div>
          <div className="h-1.5 rounded bg-white mt-2 overflow-hidden"><div className="h-full" style={{ width: `${pct}%`, background: '#00AEEF' }} /></div>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'var(--light-gray)' }}>
          <div className="text-xs" style={{ color: 'var(--text-gray)' }}>Voto medio</div>
          <div className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{media ? media.toFixed(1) : '–'}</div>
        </div>
        <div className="rounded-lg p-3 bg-amber-50">
          <div className="text-xs text-amber-800">Vogliono fare un’offerta</div>
          <div className="text-2xl font-bold text-amber-700">{offerte.length}</div>
        </div>
        <div className="rounded-lg p-3 bg-sky-50">
          <div className="text-xs text-sky-800">Vogliono rivederlo</div>
          <div className="text-2xl font-bold text-sky-700">{rivedere.length}</div>
        </div>
      </div>

      {/* Offerte e richieste di rivedere: da gestire subito */}
      {[...offerte, ...rivedere].length > 0 && (
        <div className="px-4 md:px-6 pb-4 space-y-2">
          {[...offerte, ...rivedere].map(r => {
            const f = r.feedback!
            const offerta = !!f.interesse_acquisto
            const gestita = !!f.offerta_gestita_at
            return (
              <div key={r.id} className={`rounded-lg border-2 p-3 flex flex-col md:flex-row md:items-center gap-3 ${gestita ? 'border-gray-200 opacity-70' : offerta ? 'border-amber-400 bg-amber-50' : 'border-sky-300 bg-sky-50'}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold" style={{ color: 'var(--text-dark)' }}>
                    {offerta ? '🔥 Offerta' : '🔁 Rivedere'} – {r.client.nome} {r.client.cognome}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--text-gray)' }}>
                    {offerta && f.offerta_quando ? `Può passare: ${labelOf(OFFERTA_QUANDO, f.offerta_quando)} · ` : ''}
                    {r.client.telefono}
                    {gestita ? ` · gestita il ${ddmm(f.offerta_gestita_at!)}` : ''}
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  <a href={`tel:${r.client.telefono}`} className="px-3 py-2 rounded bg-white border">📞 Chiama</a>
                  <a href={`https://wa.me/${wa(r.client.telefono)}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded bg-green-100 text-green-800">💬</a>
                  <button onClick={() => act(r.id, gestita ? 'offer_reopen' : 'offer_handled')} className={`px-3 py-2 rounded font-semibold ${gestita ? 'bg-gray-100 text-gray-600' : 'bg-green-600 text-white'}`}>
                    {gestita ? 'Riapri' : '✓ Gestita'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Chi non ha ancora risposto */}
      {ended && mancanti.length > 0 && (
        <div className="px-4 md:px-6 pb-4">
          <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--text-dark)' }}>Non hanno ancora risposto ({mancanti.length})</h3>
          <ul className="divide-y border rounded-lg">
            {mancanti.map(r => (
              <li key={r.id} className="px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium" style={{ color: 'var(--text-dark)' }}>{r.client.nome} {r.client.cognome}</div>
                  <div className="text-xs" style={{ color: 'var(--text-gray)' }}>
                    {r.feedback_email_sent ? 'Email inviata' : 'Email in partenza'}
                    {r.feedback_whatsapp_at ? ` · WhatsApp inviato il ${ddmm(r.feedback_whatsapp_at)}` : ''}
                    {r.status === 'confirmed' ? ' · presenza non segnata' : ''}
                  </div>
                </div>
                <a
                  href={`https://wa.me/${wa(r.client.telefono)}?text=${encodeURIComponent(waMessage(r))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => act(r.id, 'whatsapp_sent')}
                  className={`px-3 py-2 rounded text-sm font-semibold text-center ${r.feedback_whatsapp_at ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-green-600 text-white'}`}
                >
                  💬 {r.feedback_whatsapp_at ? 'Manda di nuovo' : 'Chiedi su WhatsApp'}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risposte ricevute */}
      {risposte.length > 0 && (
        <div className="px-4 md:px-6 pb-5">
          <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--text-dark)' }}>Risposte ricevute</h3>
          <ul className="divide-y border rounded-lg">
            {risposte.map(r => {
              const f = r.feedback!
              const a = f.risposte
              return (
                <li key={r.id} className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium" style={{ color: 'var(--text-dark)' }}>{r.client.nome} {r.client.cognome}</span>
                    <span className="text-amber-500">{stars(f.rating)}</span>
                    {a && <span className="text-xs px-2 py-0.5 rounded bg-gray-100">Prezzo: {labelOf(PREZZO, a.prezzo)}</span>}
                    {a && <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-800">{labelOf(PROSSIMO_PASSO, a.prossimo_passo)}</span>}
                    {!a && f.interesse_acquisto && <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">Interessato all’offerta</span>}
                  </div>
                  {a && (a.piaciuto.length > 0 || a.non_convinto.length > 0) && (
                    <div className="flex flex-wrap gap-1 mt-1.5 text-xs">
                      {a.piaciuto.map(v => <span key={'p' + v} className="px-2 py-0.5 rounded bg-green-50 text-green-800">+ {labelOf(ASPETTI, v)}</span>)}
                      {a.non_convinto.map(v => <span key={'n' + v} className="px-2 py-0.5 rounded bg-red-50 text-red-700">– {labelOf(ASPETTI, v)}</span>)}
                    </div>
                  )}
                  {f.commenti && <p className="text-sm italic mt-1.5" style={{ color: 'var(--text-gray)' }}>“{f.commenti}”</p>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
