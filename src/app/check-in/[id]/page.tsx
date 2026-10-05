'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { niceText } from '@/lib/text'
import ClientBadges from '@/components/ClientBadges'

// Check-in alla porta per i colleghi che hanno ricevuto il link dall'agente.
// Nessun login: il link vale solo per questo Open House e scade a fine giornata.

type Status = 'confirmed' | 'completed' | 'no_show'
interface Row {
  portato_da?: string | null
  senza_mutuo?: boolean
  deve_vendere?: boolean
  id: string
  status: Status
  client: { nome: string; cognome: string; telefono: string }
  slot: { ora_inizio: string; ora_fine: string } | null
}
interface OH {
  id: string
  data_evento: string
  ora_inizio: string
  ora_fine: string
  gre_properties: { titolo: string; zona: string } | null
  gre_agents: { nome: string; cognome: string } | null
  gestori?: string
}

const t = (s?: string | null) => (s ? s.slice(0, 5) : '--:--')
const wa = (phone: string) => {
  let c = phone.replace(/\D/g, '')
  if (!c.startsWith('39')) c = '39' + c
  return c
}

function CheckInCollega() {
  const params = useParams<{ id: string }>()
  const k = useSearchParams().get('k') || ''
  const id = params?.id

  const [oh, setOh] = useState<OH | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  const load = useCallback(async () => {
    if (!id) return
    try {
      const res = await fetch(`/api/public/checkin/${id}?k=${encodeURIComponent(k)}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Link non valido.')
      } else {
        setOh(data.openHouse)
        const list = (data.rows as Row[]).sort(
          (a, b) =>
            (a.slot?.ora_inizio || '99').localeCompare(b.slot?.ora_inizio || '99') ||
            a.client.cognome.localeCompare(b.client.cognome)
        )
        setRows(list)
        setError('')
      }
    } catch {
      // connessione assente: si riprova al prossimo aggiornamento
    } finally {
      setLoading(false)
    }
  }, [id, k])

  useEffect(() => {
    load()
    const i1 = setInterval(load, 30000)
    const i2 = setInterval(() => setNow(new Date()), 30000)
    return () => {
      clearInterval(i1)
      clearInterval(i2)
    }
  }, [load])

  const setStatus = async (row: Row, status: Status) => {
    setSavingId(row.id)
    const prev = rows
    setRows(rs => rs.map(r => (r.id === row.id ? { ...r, status } : r)))
    try {
      const res = await fetch(`/api/public/checkin/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ k, bookingId: row.id, status }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setRows(prev)
        alert(data.error || 'Non sono riuscito a salvare. Riprova.')
      }
    } catch {
      setRows(prev)
      alert('Non sono riuscito a salvare. Controlla la connessione e riprova.')
    }
    setSavingId(null)
  }

  const counts = useMemo(
    () => ({
      attesi: rows.filter(r => r.status === 'confirmed').length,
      arrivati: rows.filter(r => r.status === 'completed').length,
      assenti: rows.filter(r => r.status === 'no_show').length,
    }),
    [rows]
  )

  const isToday = oh ? oh.data_evento === now.toLocaleDateString('sv-SE') : false
  const nowHM = now.toTimeString().slice(0, 5)

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>()
    for (const r of rows) {
      const key = r.slot ? `${t(r.slot.ora_inizio)}–${t(r.slot.ora_fine)}` : 'Orario non indicato'
      map.set(key, [...(map.get(key) || []), r])
    }
    return Array.from(map.entries())
  }, [rows])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
      </div>
    )
  }

  if (error && !oh) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--light-gray)' }}>
        <div className="bg-white rounded-xl shadow-sm p-8 text-center max-w-sm">
          <div className="text-4xl mb-3">🔒</div>
          <p className="font-semibold" style={{ color: 'var(--primary-blue)' }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--light-gray)' }}>
      <div className="sticky top-0 z-20 shadow-md" style={{ background: 'var(--primary-blue)', color: 'white' }}>
        <div className="max-w-xl mx-auto px-4 pt-3 pb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Check-in Open House</span>
            <span className="text-xs opacity-80">si aggiorna da solo</span>
          </div>
          {oh && (
            <>
              <div className="font-semibold text-lg leading-tight mt-1 truncate">{niceText(oh.gre_properties?.titolo || '')}</div>
              <div className="text-xs opacity-80">
                {new Date(oh.data_evento + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} · {t(oh.ora_inizio)}–{t(oh.ora_fine)}
                {oh.gestori ? ` · ${oh.gestori}` : ''}
              </div>
            </>
          )}
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="rounded-lg py-2" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <div className="text-2xl font-bold">{counts.attesi}</div>
              <div className="text-xs opacity-80">Attesi</div>
            </div>
            <div className="rounded-lg py-2 bg-green-500/30">
              <div className="text-2xl font-bold">{counts.arrivati}</div>
              <div className="text-xs opacity-90">Arrivati</div>
            </div>
            <div className="rounded-lg py-2 bg-orange-500/30">
              <div className="text-2xl font-bold">{counts.assenti}</div>
              <div className="text-xs opacity-90">Non venuti</div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-xl mx-auto px-3 py-4 pb-16">
        {error && <div className="bg-white rounded-lg p-4 text-center text-red-600 mb-4">{error}</div>}
        {rows.length === 0 && (
          <div className="bg-white rounded-lg p-8 text-center" style={{ color: 'var(--text-gray)' }}>
            Nessuna prenotazione per questo Open House.
          </div>
        )}

        {groups.map(([label, list]) => {
          const s = list[0].slot
          const current = isToday && s && nowHM >= t(s.ora_inizio) && nowHM < t(s.ora_fine)
          return (
            <section key={label} className="mb-4">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="font-bold" style={{ color: 'var(--primary-blue)' }}>{label}</span>
                {current && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-600 text-white">ORA</span>}
              </div>
              <div className="space-y-2">
                {list.map(r => (
                  <div
                    key={r.id}
                    className={`bg-white rounded-xl shadow-sm p-3 border-l-4 ${
                      r.status === 'completed' ? 'border-green-500' : r.status === 'no_show' ? 'border-orange-400 opacity-80' : current ? 'border-blue-600' : 'border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-base truncate" style={{ color: 'var(--text-dark)' }}>
                          {r.client.nome} {r.client.cognome}
                        </div>
                        <ClientBadges portatoDa={r.portato_da} agente={oh?.gestori || (oh?.gre_agents ? `${oh.gre_agents.nome} ${oh.gre_agents.cognome}` : null)} senzaMutuo={r.senza_mutuo} deveVendere={r.deve_vendere} />
                      </div>
                      {r.client.telefono && <div className="flex gap-1 shrink-0">
                        <a href={`tel:${r.client.telefono}`} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Chiama">📞</a>
                        <a href={`https://wa.me/${wa(r.client.telefono)}`} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center" aria-label="WhatsApp">💬</a>
                      </div>}
                    </div>

                    {r.status === 'confirmed' ? (
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <button disabled={savingId === r.id} onClick={() => setStatus(r, 'completed')} className="py-3 rounded-lg font-semibold text-white bg-green-600 active:bg-green-700 disabled:opacity-50">
                          ✓ Arrivato
                        </button>
                        <button disabled={savingId === r.id} onClick={() => setStatus(r, 'no_show')} className="py-3 rounded-lg font-semibold bg-orange-100 text-orange-800 active:bg-orange-200 disabled:opacity-50">
                          Non venuto
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-3">
                        <span className={`text-sm font-semibold ${r.status === 'completed' ? 'text-green-700' : 'text-orange-700'}`}>
                          {r.status === 'completed' ? '✓ Arrivato' : 'Non venuto'}
                        </span>
                        <button disabled={savingId === r.id} onClick={() => setStatus(r, 'confirmed')} className="text-sm px-3 py-2 rounded-lg bg-gray-100 text-gray-700 disabled:opacity-50">
                          Annulla
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </main>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CheckInCollega />
    </Suspense>
  )
}
