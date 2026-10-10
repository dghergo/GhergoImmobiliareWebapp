'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/api'
import { niceText } from '@/lib/text'
import { creaGrafica, type DatiGrafica } from '@/lib/venditori-grafica'
import { inviaWhatsApp } from '@/lib/wa-share'

// Vendita dell'immobile e offerte ricevute.
// - "Segna come venduto" (organizzatori) → avviso: fai sapere ai clienti che è stato venduto, con messaggio WhatsApp a ognuno
// - Offerte: chi, quanto, stato. Collegate alla scheda dell'immobile nel gestionale.

interface Partecipante { id: string; nome: string; cognome: string; telefono: string; deve_vendere: boolean; wa_venduto_at: string | null }
interface Offerta { id: string; booking_id: string; cliente: string; portato_da: string | null; importo: number; data: string; stato: string; condizioni: string | null }
interface Dati {
  role: string
  puoSegnareVenduto: boolean
  venduto_il: string | null
  immobile: { titolo: string; zona: string; foto: string | null }
  open_house: { data_evento: string; visitatori: number }
  partecipanti: Partecipante[]
  clienti: { id: string; nome: string }[]
  offerte: Offerta[]
}

const BLU = '#203162'
const LINK = 'openhouse.ghergoimmobiliare.com'
const STATI: Record<string, { label: string; cls: string }> = {
  presentata: { label: 'Presentata', cls: 'bg-blue-50 text-blue-900 border-blue-200' },
  accettata: { label: 'Accettata', cls: 'bg-green-50 text-green-800 border-green-200' },
  rifiutata: { label: 'Rifiutata', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  ritirata: { label: 'Ritirata', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
}
const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const dataIt = (iso: string) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
const oggi = () => new Date().toLocaleDateString('sv-SE')
const vuota = { id: '', bookingId: '', importo: '', data: oggi(), stato: 'presentata', condizioni: '' }

export default function VenditaPanel({ openHouseId, agentName }: { openHouseId: string; agentName: string }) {
  const [d, setD] = useState<Dati | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [dataVendita, setDataVendita] = useState(oggi())
  const [chiedoVenduto, setChiedoVenduto] = useState(false)
  const [form, setForm] = useState<typeof vuota | null>(null)
  const [apriClienti, setApriClienti] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await authFetch(`/api/open-houses/${openHouseId}/vendita`, { cache: 'no-store' })
      if (alive && res.ok) setD(await res.json())
    })()
    return () => { alive = false }
  }, [openHouseId])

  if (!d) return null

  const post = async (body: object, key: string) => {
    setBusy(key)
    setMsg('')
    const res = await authFetch(`/api/open-houses/${openHouseId}/vendita`, { method: 'POST', body: JSON.stringify(body) })
    setBusy('')
    if (res.ok) {
      setD(await res.json())
      return true
    }
    const e = await res.json().catch(() => ({}))
    setMsg(e.error || 'Non salvato, riprova.')
    return false
  }

  const titolo = niceText(d.immobile.titolo)
  const venduto = d.venduto_il
  const giorni = venduto ? Math.round((new Date(venduto + 'T12:00:00').getTime() - new Date(d.open_house.data_evento + 'T12:00:00').getTime()) / 86400000) : null
  const grafica: DatiGrafica = { titolo: d.immobile.titolo, zona: d.immobile.zona, foto: d.immobile.foto, visitatori: d.open_house.visitatori, giorni }
  const daAvvisare = d.partecipanti.filter(p => !p.wa_venduto_at)
  const inGiorni = giorni !== null && giorni >= 0 ? (giorni === 0 ? ' il giorno stesso' : ` in ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`) : ''

  const testo = (p: Partecipante) => {
    const nome = niceText(p.nome)
    if (p.deve_vendere) {
      return `Ciao ${nome}, sono ${agentName} di Ghergo Immobiliare. Ti aggiorno: l'immobile di ${titolo} che avevi visitato è stato venduto! 🎉\n\n` +
        `Ecco il risultato dell'Open House: ${d.open_house.visitatori} persone in visita${inGiorni ? ` e la vendita${inGiorni}` : ''}.\n\n` +
        `Lo stesso risultato possiamo ottenerlo anche per la tua casa: se devi vendere per comprare, è il modo giusto per trovare l'acquirente che te lo permette, come abbiamo già fatto per centinaia di clienti. Se vuoi, fissiamo un appuntamento e ti spiego come lo organizzeremmo.`
    }
    return `Ciao ${nome}, sono ${agentName} di Ghergo Immobiliare. Ti aggiorno: l'immobile di ${titolo} che hai visitato è stato venduto! 🎉\n\n` +
      `Grazie per aver partecipato all'Open House. Se stai ancora cercando casa, ti tengo aggiornato sui prossimi Open House: li trovi qui ${LINK}\n\n` +
      `Dimmi pure cosa cerchi e ti avviso appena arriva qualcosa di adatto.`
  }

  const invia = async (p: Partecipante) => {
    setBusy(`wa-${p.id}`)
    setMsg('')
    try {
      const blob = await creaGrafica(p.deve_vendere ? 'venduto' : 'venduto_cliente', grafica)
      const esito = await inviaWhatsApp(p.telefono, testo(p), blob, 'ghergo-venduto.jpg')
      if (esito === 'scaricato') setMsg('Immagine scaricata: trascinala nella chat WhatsApp che si è aperta, poi invia.')
      await authFetch(`/api/open-houses/${openHouseId}/vendita`, { method: 'POST', body: JSON.stringify({ action: 'inviato', bookingId: p.id }) })
        .then(async r => r.ok && setD(await r.json()))
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setMsg('Non riuscito, riprova.')
    } finally {
      setBusy('')
    }
  }

  const salvaOfferta = async () => {
    if (!form) return
    const ok = await post(
      form.id
        ? { action: 'offerta_update', id: form.id, importo: form.importo, data: form.data, stato: form.stato, condizioni: form.condizioni }
        : { action: 'offerta_add', bookingId: form.bookingId, importo: form.importo, data: form.data, stato: form.stato, condizioni: form.condizioni },
      'offerta',
    )
    if (ok) setForm(null)
  }

  const migliore = d.offerte.filter(o => o.stato !== 'rifiutata' && o.stato !== 'ritirata').reduce((m, o) => Math.max(m, o.importo), 0)

  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      {/* Stato vendita */}
      {venduto ? (
        <div className="px-4 md:px-6 py-4" style={{ background: daAvvisare.length ? '#fff7ed' : '#f0fdf4' }}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-lg text-green-800">🎉 Immobile venduto il {dataIt(venduto)}{inGiorni ? ` ·${inGiorni} dall'Open House` : ''}</h2>
            {d.puoSegnareVenduto && (
              <button disabled={!!busy} onClick={() => post({ action: 'venduto', data: null }, 'venduto')} className="text-xs underline text-gray-600 ml-auto">
                Annulla vendita
              </button>
            )}
          </div>
          {d.partecipanti.length > 0 && (
            daAvvisare.length ? (
              <div className="mt-2 rounded-lg border-2 border-orange-300 bg-white p-3">
                <p className="font-bold" style={{ color: '#c2410c' }}>📣 Fai sapere ai tuoi clienti che è stato venduto!</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-dark)' }}>
                  Invia un messaggio {daAvvisare.length === 1 ? 'al cliente che ha partecipato' : `ai ${daAvvisare.length} clienti che hanno partecipato`} all&apos;Open House.
                </p>
                {!apriClienti && (
                  <button onClick={() => setApriClienti(true)} className="mt-2 px-4 py-2 rounded text-white font-semibold text-sm bg-green-600">
                    💬 Avvisa i clienti
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm mt-1 text-green-800">✅ Tutti i tuoi clienti sono stati avvisati.</p>
            )
          )}
        </div>
      ) : (
        <div className="px-4 md:px-6 py-4 flex flex-wrap items-center gap-3">
          <h2 className="font-bold text-lg" style={{ color: BLU }}>🏷️ Vendita e offerte</h2>
          {d.puoSegnareVenduto && (
            chiedoVenduto ? (
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <span className="text-sm">Venduto il</span>
                <input type="date" value={dataVendita} onChange={e => setDataVendita(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                <button disabled={!!busy} onClick={async () => { if (await post({ action: 'venduto', data: dataVendita }, 'venduto')) { setChiedoVenduto(false); setApriClienti(true) } }} className="px-3 py-1.5 rounded text-white text-sm font-semibold" style={{ background: BLU }}>
                  Conferma
                </button>
                <button onClick={() => setChiedoVenduto(false)} className="text-sm underline text-gray-600">Annulla</button>
              </div>
            ) : (
              <button onClick={() => setChiedoVenduto(true)} className="ml-auto px-3 py-1.5 rounded text-white text-sm font-semibold" style={{ background: BLU }}>
                Segna come venduto
              </button>
            )
          )}
        </div>
      )}

      <div className="px-4 md:px-6 pb-5 pt-3 border-t space-y-4">
        {msg && <p className="text-sm text-amber-700">{msg}</p>}

        {/* Clienti da avvisare */}
        {venduto && apriClienti && d.partecipanti.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold" style={{ color: BLU }}>Comunica la vendita ai partecipanti</h3>
              <button onClick={() => setApriClienti(false)} className="text-sm underline text-gray-600">Chiudi</button>
            </div>
            <ul className="divide-y border rounded-lg">
              {d.partecipanti.map(p => (
                <li key={p.id} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium" style={{ color: 'var(--text-dark)' }}>{p.nome} {p.cognome}</div>
                    <div className="text-xs" style={{ color: 'var(--text-gray)' }}>
                      {p.deve_vendere ? 'deve vendere casa: messaggio con proposta di valutazione' : 'messaggio di aggiornamento e prossimi Open House'}
                      {p.wa_venduto_at ? ` · inviato il ${dataIt(p.wa_venduto_at)}` : ''}
                      {!p.telefono ? ' · telefono mancante' : ''}
                    </div>
                  </div>
                  <button
                    disabled={!!busy || !p.telefono}
                    onClick={() => invia(p)}
                    className={`px-3 py-2 rounded text-sm font-semibold disabled:opacity-40 ${p.wa_venduto_at ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-green-600 text-white'}`}
                  >
                    {busy === `wa-${p.id}` ? 'Preparo…' : p.wa_venduto_at ? '✓ Di nuovo' : '💬 Invia WhatsApp'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Offerte */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-semibold" style={{ color: BLU }}>💰 Offerte ricevute ({d.offerte.length})</h3>
            {migliore > 0 && <span className="text-sm" style={{ color: 'var(--text-gray)' }}>· migliore {euro(migliore)}</span>}
            {!form && d.clienti.length > 0 && (
              <button onClick={() => setForm({ ...vuota, data: oggi() })} className="ml-auto px-3 py-1.5 rounded text-sm font-semibold border" style={{ color: BLU, borderColor: BLU }}>
                + Aggiungi offerta
              </button>
            )}
          </div>

          {form && (
            <div className="rounded-lg border p-3 mb-3 bg-gray-50 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <label className="flex flex-col gap-1">
                <span className="font-medium">Cliente</span>
                {form.id ? (
                  <span className="py-1.5">{d.offerte.find(o => o.id === form.id)?.cliente}</span>
                ) : (
                  <select value={form.bookingId} onChange={e => setForm({ ...form, bookingId: e.target.value })} className="border rounded px-2 py-1.5 bg-white">
                    <option value="">Scegli il cliente…</option>
                    {d.clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                )}
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Importo (€)</span>
                <input inputMode="numeric" value={form.importo} onChange={e => setForm({ ...form, importo: e.target.value })} placeholder="es. 185.000" className="border rounded px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Data</span>
                <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} className="border rounded px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Stato</span>
                <select value={form.stato} onChange={e => setForm({ ...form, stato: e.target.value })} className="border rounded px-2 py-1.5 bg-white">
                  {Object.entries(STATI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="font-medium">Condizioni (facoltative)</span>
                <input value={form.condizioni} onChange={e => setForm({ ...form, condizioni: e.target.value })} placeholder="es. soggetta a mutuo, rogito entro marzo" className="border rounded px-2 py-1.5" />
              </label>
              {form.stato === 'accettata' && !venduto && (
                <p className="sm:col-span-2 text-xs text-green-800">Con l&apos;offerta accettata l&apos;immobile risulterà venduto in questa data.</p>
              )}
              <div className="sm:col-span-2 flex gap-2">
                <button
                  disabled={busy === 'offerta' || !form.importo || (!form.id && !form.bookingId)}
                  onClick={salvaOfferta}
                  className="px-4 py-2 rounded text-white font-semibold disabled:opacity-50"
                  style={{ background: BLU }}
                >
                  {busy === 'offerta' ? 'Salvo…' : 'Salva offerta'}
                </button>
                <button onClick={() => setForm(null)} className="px-3 py-2 underline text-gray-600">Annulla</button>
              </div>
            </div>
          )}

          {d.offerte.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-gray)' }}>Nessuna offerta registrata.</p>
          ) : (
            <ul className="divide-y border rounded-lg">
              {d.offerte.map(o => (
                <li key={o.id} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold" style={{ color: BLU }}>{euro(o.importo)}</span>
                      <span className="font-medium" style={{ color: 'var(--text-dark)' }}>{o.cliente}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATI[o.stato]?.cls || ''}`}>{STATI[o.stato]?.label || o.stato}</span>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-gray)' }}>
                      {dataIt(o.data)}
                      {o.portato_da ? ` · cliente di ${o.portato_da}` : ''}
                      {o.condizioni ? ` · ${o.condizioni}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <button onClick={() => setForm({ id: o.id, bookingId: o.booking_id, importo: String(Math.round(o.importo)), data: o.data, stato: o.stato, condizioni: o.condizioni || '' })} className="underline" style={{ color: BLU }}>
                      Modifica
                    </button>
                    <button
                      disabled={!!busy}
                      onClick={() => { if (confirm(`Eliminare l'offerta di ${o.cliente}?`)) post({ action: 'offerta_delete', id: o.id }, 'del') }}
                      className="underline text-red-600"
                    >
                      Elimina
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
