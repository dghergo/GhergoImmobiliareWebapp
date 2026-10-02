'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAgent, isAdmin } from '@/lib/auth'
import { authFetch } from '@/lib/api'

interface Row {
  mine: boolean
  portato_da: string | null
  id: string
  status: 'confirmed' | 'completed' | 'no_show'
  cancellation_reason: string | null
  note_cliente: string | null
  client: { nome: string; cognome: string; telefono: string }
  slot: { ora_inizio: string; ora_fine: string } | null
  q: { necessita_mutuo?: string; vendita_immobile?: string } | null
}

interface OH {
  id: string
  data_evento: string
  ora_inizio: string
  ora_fine: string
  gre_properties: { titolo: string; zona: string }
}

const isCancelled = (r: Row) => r.status === 'no_show' && r.cancellation_reason === 'cancelled_by_agent'
const t = (s?: string | null) => (s ? s.slice(0, 5) : '--:--')
const wa = (phone: string) => {
  let c = phone.replace(/\D/g, '')
  if (!c.startsWith('39')) c = '39' + c
  return c
}

export default function CheckInPage() {
  const { agent, loading } = useAuth()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const openHouseId = params?.id

  const [oh, setOh] = useState<OH | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [error, setError] = useState('')
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // Link per un collega alla porta: niente login, solo questo Open House, scade a fine giornata
  const createShareLink = async () => {
    setShareBusy(true)
    try {
      const res = await authFetch('/api/checkin-link', { method: 'POST', body: JSON.stringify({ openHouseId }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShareLink(`${window.location.origin}${data.path}`)
    } catch {
      alert('Non sono riuscito a creare il link. Riprova.')
    }
    setShareBusy(false)
  }


  useEffect(() => {
    if (!loading && (!agent || (!isAgent(agent) && !isAdmin(agent)))) router.push('/dashboard/login')
  }, [agent, loading, router])

  const load = useCallback(async () => {
    if (!agent || !openHouseId) return
    // Dal server: i clienti dei colleghi arrivano con nome e orario, senza contatti né questionario
    const res = await authFetch(`/api/open-houses/${openHouseId}/clients`, { cache: 'no-store' })
    if (!res.ok) {
      setError('Open House non trovato o non accessibile.')
      setLoadingData(false)
      return
    }
    const data = await res.json()
    setOh(data.openHouse as OH)
    const mapped: Row[] = data.rows
    mapped.sort((a, b) =>
      (a.slot?.ora_inizio || '99').localeCompare(b.slot?.ora_inizio || '99') ||
      a.client.cognome.localeCompare(b.client.cognome)
    )
    setRows(mapped)
    setError('')
    setLoadingData(false)
  }, [agent, openHouseId])

  useEffect(() => {
    load()
    // aggiornamento automatico: nuove prenotazioni e orario corrente
    const i1 = setInterval(load, 30000)
    const i2 = setInterval(() => setNow(new Date()), 30000)
    return () => {
      clearInterval(i1)
      clearInterval(i2)
    }
  }, [load])

  const setStatus = async (row: Row, status: Row['status']) => {
    setSavingId(row.id)
    const prev = rows
    setRows(rs => rs.map(r => (r.id === row.id ? { ...r, status } : r)))
    const res = await authFetch(`/api/open-houses/${openHouseId}/clients`, { method: 'POST', body: JSON.stringify({ bookingId: row.id, status }) })
    if (!res.ok) {
      setRows(prev)
      alert('Non sono riuscito a salvare. Controlla la connessione e riprova.')
    }
    setSavingId(null)
  }

  const active = useMemo(() => rows.filter(r => !isCancelled(r)), [rows])
  const counts = useMemo(
    () => ({
      attesi: active.filter(r => r.status === 'confirmed').length,
      arrivati: active.filter(r => r.status === 'completed').length,
      assenti: active.filter(r => r.status === 'no_show').length,
    }),
    [active]
  )

  // Orario in corso (solo il giorno dell'evento)
  const isToday = oh ? oh.data_evento === now.toLocaleDateString('sv-SE') : false
  const nowHM = now.toTimeString().slice(0, 5)
  const slotState = (r: Row): 'past' | 'current' | 'future' | 'none' => {
    if (!isToday || !r.slot) return 'none'
    if (nowHM >= t(r.slot.ora_fine)) return 'past'
    if (nowHM >= t(r.slot.ora_inizio)) return 'current'
    return 'future'
  }

  // Raggruppa per orario
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>()
    for (const r of active) {
      const key = r.slot ? `${t(r.slot.ora_inizio)}–${t(r.slot.ora_fine)}` : 'Orario non indicato'
      map.set(key, [...(map.get(key) || []), r])
    }
    return Array.from(map.entries())
  }, [active])

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
      </div>
    )
  }

  if (!agent) return null

  return (
    <div className="min-h-screen" style={{ background: 'var(--light-gray)' }}>
      {/* Barra fissa in alto */}
      <div className="sticky top-0 z-20 shadow-md" style={{ background: 'var(--primary-blue)', color: 'white' }}>
        <div className="max-w-xl mx-auto px-4 pt-3 pb-3">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => router.push(`/dashboard/open-houses/${openHouseId}`)}
              className="text-sm opacity-90 hover:opacity-100"
            >
              ← Cruscotto
            </button>
            <button
              onClick={createShareLink}
              disabled={shareBusy}
              className="text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-60"
              style={{ background: 'rgba(255,255,255,0.18)' }}
            >
              {shareBusy ? 'Creo il link…' : '🔗 Link per un collega'}
            </button>
          </div>
          {oh && (
            <>
              <div className="font-semibold text-lg leading-tight mt-1 truncate">{oh.gre_properties.titolo}</div>
              <div className="text-xs opacity-80">
                {new Date(oh.data_evento + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} · {t(oh.ora_inizio)}–{t(oh.ora_fine)}
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

        {shareLink && oh && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4 border-2" style={{ borderColor: 'var(--accent-blue)' }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold" style={{ color: 'var(--primary-blue)' }}>Link per il check-in</div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-gray)' }}>
                  Chi lo riceve può segnare arrivati e non venuti solo per questo Open House, senza login.
                  Vede nome, orario e telefono, non il questionario. Scade a fine giornata.
                </p>
              </div>
              <button onClick={() => setShareLink(null)} className="text-gray-400 text-xl leading-none" aria-label="Chiudi">×</button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Check-in Open House ${oh.gre_properties.titolo}: apri questo link e segna chi arriva ${shareLink}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 rounded-lg font-semibold text-center bg-green-600 text-white"
              >
                Invia su WhatsApp
              </a>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareLink)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  } catch {
                    window.prompt('Copia il link:', shareLink)
                  }
                }}
                className="py-3 rounded-lg font-semibold bg-gray-100 text-gray-800"
              >
                {copied ? '✓ Copiato' : 'Copia link'}
              </button>
            </div>
          </div>
        )}

        {!error && active.length === 0 && (
          <div className="bg-white rounded-lg p-8 text-center" style={{ color: 'var(--text-gray)' }}>
            Nessuna prenotazione per questo Open House.
          </div>
        )}

        {groups.map(([label, list]) => {
          const state = slotState(list[0])
          return (
            <section key={label} className="mb-4">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="font-bold" style={{ color: 'var(--primary-blue)' }}>{label}</span>
                {state === 'current' && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-600 text-white">ORA</span>
                )}
              </div>
              <div className="space-y-2">
                {list.map(r => (
                  <div
                    key={r.id}
                    className={`bg-white rounded-xl shadow-sm p-3 border-l-4 ${
                      r.status === 'completed'
                        ? 'border-green-500'
                        : r.status === 'no_show'
                        ? 'border-orange-400 opacity-80'
                        : state === 'current'
                        ? 'border-blue-600'
                        : 'border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-base truncate" style={{ color: 'var(--text-dark)' }}>
                          {r.client.nome} {r.client.cognome}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {r.portato_da && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Cliente di {r.portato_da}</span>
                          )}
                          {r.q?.necessita_mutuo === 'no' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800">Senza mutuo</span>
                          )}
                          {r.q?.vendita_immobile?.startsWith('si') && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-800">Deve vendere</span>
                          )}
                        </div>
                        {r.note_cliente && (
                          <div className="text-xs mt-1 italic" style={{ color: 'var(--text-gray)' }}>“{r.note_cliente}”</div>
                        )}
                      </div>
                      {r.mine && <div className="flex gap-1 shrink-0">
                        <a href={`tel:${r.client.telefono}`} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Chiama">📞</a>
                        <a href={`https://wa.me/${wa(r.client.telefono)}`} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center" aria-label="WhatsApp">💬</a>
                      </div>}
                    </div>

                    {r.status === 'confirmed' ? (
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <button
                          disabled={savingId === r.id}
                          onClick={() => setStatus(r, 'completed')}
                          className="py-3 rounded-lg font-semibold text-white bg-green-600 active:bg-green-700 disabled:opacity-50"
                        >
                          ✓ Arrivato
                        </button>
                        <button
                          disabled={savingId === r.id}
                          onClick={() => setStatus(r, 'no_show')}
                          className="py-3 rounded-lg font-semibold bg-orange-100 text-orange-800 active:bg-orange-200 disabled:opacity-50"
                        >
                          Non venuto
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-3">
                        <span className={`text-sm font-semibold ${r.status === 'completed' ? 'text-green-700' : 'text-orange-700'}`}>
                          {r.status === 'completed' ? '✓ Arrivato' : 'Non venuto'}
                        </span>
                        <button
                          disabled={savingId === r.id}
                          onClick={() => setStatus(r, 'confirmed')}
                          className="text-sm px-3 py-2 rounded-lg bg-gray-100 text-gray-700 disabled:opacity-50"
                        >
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
