'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/api'
import { niceText } from '@/lib/text'
import { creaGrafica, type DatiGrafica } from '@/lib/venditori-grafica'
import { inviaWhatsApp } from '@/lib/wa-share'

// Clienti che devono vendere casa: WhatsApp con grafica dopo l'Open House ("il nostro metodo").
// Il messaggio "venduto" si invia dal riquadro Vendita e offerte, insieme a tutti i partecipanti.

interface Row {
  id: string
  status: string
  situazione: string
  client: { nome: string; cognome: string; telefono: string }
  wa_vendita_at: string | null
  wa_venduto_at: string | null
}
interface Dati {
  rows: Row[]
  immobile: { titolo: string; zona: string; foto: string | null; venduto_il: string | null }
  open_house: { data_evento: string; visitatori: number; prenotati: number }
}

const BLU = '#203162'
const SITUAZIONE: Record<string, string> = {
  si_in_vendita: 'casa già in vendita',
  si_non_in_vendita: 'casa non ancora in vendita',
  si_posso_acquistare_prima: 'può comprare prima di vendere',
}
const ddmm = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

export default function VenditoriPanel({ openHouseId, agentName }: { openHouseId: string; agentName: string }) {
  const [d, setD] = useState<Dati | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await authFetch(`/api/open-houses/${openHouseId}/venditori`, { cache: 'no-store' })
      if (alive && res.ok) setD(await res.json())
    })()
    return () => { alive = false }
  }, [openHouseId])

  if (!d || !d.rows.length) return null

  const titolo = niceText(d.immobile.titolo)
  const grafica: DatiGrafica = { titolo: d.immobile.titolo, zona: d.immobile.zona, foto: d.immobile.foto, visitatori: d.open_house.visitatori, giorni: null }

  const testo = (r: Row) =>
    `Ciao ${niceText(r.client.nome)}, sono ${agentName} di Ghergo Immobiliare. Grazie ancora per essere venuto all'Open House di ${titolo}!\n\n` +
    `Hai visto da vicino il metodo che usiamo per vendere: in un solo giorno abbiamo accolto ${d.open_house.visitatori} persone interessate. Ti è piaciuto?\n\n` +
    `Mi avevi detto che hai anche una casa da vendere: se devi vendere per comprare, questo è il modo giusto per trovare l'acquirente che te lo permette. L'abbiamo già fatto per centinaia di clienti e possiamo farlo anche per te. Se vuoi fissare un appuntamento per valutare la vendita della tua casa, siamo a disposizione.`

  const invia = async (r: Row) => {
    setBusy(r.id)
    setMsg('')
    try {
      const blob = await creaGrafica('metodo', grafica)
      const esito = await inviaWhatsApp(r.client.telefono, testo(r), blob, 'ghergo-open-house.jpg')
      if (esito === 'scaricato') setMsg('Immagine scaricata: trascinala nella chat WhatsApp che si è aperta, poi invia.')
      const res = await authFetch(`/api/open-houses/${openHouseId}/venditori`, { method: 'POST', body: JSON.stringify({ action: 'inviato', bookingId: r.id, tipo: 'vendita' }) })
      if (res.ok) {
        const { at } = await res.json()
        setD(x => x && { ...x, rows: x.rows.map(y => (y.id === r.id ? { ...y, wa_vendita_at: at } : y)) })
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setMsg('Non riuscito, riprova.')
    } finally {
      setBusy('')
    }
  }

  const anteprima = async () => {
    const blob = await creaGrafica('metodo', grafica)
    window.open(URL.createObjectURL(blob), '_blank')
  }

  return (
    <div className="bg-white rounded-lg shadow-md mb-6">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 md:px-6 py-4 text-left">
        <div>
          <h2 className="font-bold text-lg" style={{ color: BLU }}>🏡 Devono vendere casa ({d.rows.length})</h2>
          <p className="text-sm" style={{ color: 'var(--text-gray)' }}>WhatsApp con grafica: ti è piaciuto il nostro metodo? Valutiamo la tua casa</p>
        </div>
        <span className="text-xl" style={{ color: BLU }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="px-4 md:px-6 pb-5 border-t pt-4 space-y-4">
          <button onClick={anteprima} className="text-sm underline" style={{ color: BLU }}>Vedi grafica</button>
          {msg && <p className="text-sm text-amber-700">{msg}</p>}
          <ul className="divide-y border rounded-lg">
            {d.rows.map(r => (
              <li key={r.id} className="px-3 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium" style={{ color: 'var(--text-dark)' }}>{r.client.nome} {r.client.cognome}</div>
                  <div className="text-xs" style={{ color: 'var(--text-gray)' }}>
                    {SITUAZIONE[r.situazione] || 'deve vendere casa'}
                    {r.status === 'no_show' ? ' · non presentato' : ''}
                    {r.wa_vendita_at ? ` · messaggio inviato il ${ddmm(r.wa_vendita_at)}` : ''}
                    {r.wa_venduto_at ? ` · avvisato della vendita il ${ddmm(r.wa_venduto_at)}` : ''}
                  </div>
                </div>
                <button
                  disabled={!!busy || !r.client.telefono}
                  onClick={() => invia(r)}
                  className={`px-3 py-2 rounded text-sm font-semibold ${r.wa_vendita_at ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-green-600 text-white'}`}
                >
                  {busy === r.id ? 'Preparo…' : r.wa_vendita_at ? '💬 Di nuovo' : '💬 Il nostro metodo'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
