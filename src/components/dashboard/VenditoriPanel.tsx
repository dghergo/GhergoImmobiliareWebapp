'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/api'
import { niceText } from '@/lib/text'
import { creaGrafica, type DatiGrafica } from '@/lib/venditori-grafica'

// Clienti che devono vendere casa: WhatsApp con grafica dopo l'Open House e quando l'immobile viene venduto.

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
  puoSegnareVenduto: boolean
  immobile: { titolo: string; zona: string; foto: string | null; venduto_il: string | null }
  open_house: { data_evento: string; visitatori: number; prenotati: number }
}

const BLU = '#203162'
const SITUAZIONE: Record<string, string> = {
  si_in_vendita: 'casa già in vendita',
  si_non_in_vendita: 'casa non ancora in vendita',
  si_posso_acquistare_prima: 'può comprare prima di vendere',
}
const wa = (phone: string) => {
  let c = String(phone || '').replace(/\D/g, '')
  if (c && !c.startsWith('39')) c = '39' + c
  return c
}
const ddmm = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

export default function VenditoriPanel({ openHouseId, agentName }: { openHouseId: string; agentName: string }) {
  const [d, setD] = useState<Dati | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [dataVendita, setDataVendita] = useState(new Date().toLocaleDateString('sv-SE'))
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await authFetch(`/api/open-houses/${openHouseId}/venditori`, { cache: 'no-store' })
      if (alive && res.ok) setD(await res.json())
    })()
    return () => { alive = false }
  }, [openHouseId])

  if (!d || (!d.rows.length && !d.puoSegnareVenduto)) return null

  const titolo = niceText(d.immobile.titolo)
  const venduto = d.immobile.venduto_il
  const giorni = venduto ? Math.round((new Date(venduto + 'T12:00:00').getTime() - new Date(d.open_house.data_evento + 'T12:00:00').getTime()) / 86400000) : null
  const grafica: DatiGrafica = { titolo: d.immobile.titolo, zona: d.immobile.zona, foto: d.immobile.foto, visitatori: d.open_house.visitatori, giorni }

  const testo = (r: Row, tipo: 'vendita' | 'venduto') => {
    const nome = niceText(r.client.nome)
    if (tipo === 'vendita') {
      return `Ciao ${nome}, sono ${agentName} di Ghergo Immobiliare. Grazie ancora per essere venuto all'Open House di ${titolo}!\n\n` +
        `Hai visto da vicino il metodo che usiamo per vendere: in un solo giorno abbiamo accolto ${d.open_house.visitatori} persone interessate. Ti è piaciuto?\n\n` +
        `Mi avevi detto che hai anche una casa da vendere: se devi vendere per comprare, questo è il modo giusto per trovare l'acquirente che te lo permette. L'abbiamo già fatto per centinaia di clienti e possiamo farlo anche per te. Se vuoi fissare un appuntamento per valutare la vendita della tua casa, siamo a disposizione.`
    }
    return `Ciao ${nome}, sono ${agentName} di Ghergo Immobiliare. Ti aggiorno: l'immobile di ${titolo} che avevi visitato è stato venduto! 🎉\n\n` +
      `Ecco il risultato dell'Open House: ${d.open_house.visitatori} persone in visita${giorni !== null && giorni >= 0 ? ` e la vendita ${giorni === 0 ? 'il giorno stesso' : `in ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`}` : ''}.\n\n` +
      `Lo stesso risultato possiamo ottenerlo anche per la tua casa: se devi vendere per comprare, è il modo giusto per trovare l'acquirente che te lo permette, come abbiamo già fatto per centinaia di clienti. Se vuoi, fissiamo un appuntamento e ti spiego come lo organizzeremmo.`
  }

  const segnaInviato = async (r: Row, tipo: 'vendita' | 'venduto') => {
    const res = await authFetch(`/api/open-houses/${openHouseId}/venditori`, { method: 'POST', body: JSON.stringify({ action: 'inviato', bookingId: r.id, tipo }) })
    if (!res.ok) return
    const { at } = await res.json()
    setD(x => x && { ...x, rows: x.rows.map(y => (y.id !== r.id ? y : tipo === 'vendita' ? { ...y, wa_vendita_at: at } : { ...y, wa_venduto_at: at })) })
  }

  // Sul telefono: condivisione con immagine + testo (scegli la chat su WhatsApp).
  // Sul computer: scarica l'immagine e apre la chat WhatsApp con il testo pronto (l'immagine si allega trascinandola).
  const invia = async (r: Row, tipo: 'vendita' | 'venduto') => {
    setBusy(`${r.id}-${tipo}`)
    setMsg('')
    try {
      const blob = await creaGrafica(tipo === 'vendita' ? 'metodo' : 'venduto', grafica)
      const file = new File([blob], tipo === 'vendita' ? 'ghergo-open-house.jpg' : 'ghergo-venduto.jpg', { type: 'image/jpeg' })
      const t = testo(r, tipo)
      const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
      if (mobile && navigator.canShare?.({ files: [file] })) {
        await navigator.clipboard?.writeText(t).catch(() => undefined)
        await navigator.share({ files: [file], text: t })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        window.open(`https://wa.me/${wa(r.client.telefono)}?text=${encodeURIComponent(t)}`, '_blank')
        setMsg('Immagine scaricata: trascinala nella chat WhatsApp che si è aperta, poi invia.')
      }
      await segnaInviato(r, tipo)
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setMsg('Non riuscito, riprova.')
    } finally {
      setBusy('')
    }
  }

  const segnaVenduto = async (data: string | null) => {
    setBusy('venduto')
    const res = await authFetch(`/api/open-houses/${openHouseId}/venditori`, { method: 'POST', body: JSON.stringify({ action: 'venduto', data }) })
    setBusy('')
    if (res.ok) {
      const { venduto_il } = await res.json()
      setD(x => x && { ...x, immobile: { ...x.immobile, venduto_il } })
    }
  }

  const anteprima = async (tipo: 'metodo' | 'venduto') => {
    const blob = await creaGrafica(tipo, grafica)
    window.open(URL.createObjectURL(blob), '_blank')
  }

  return (
    <div className="bg-white rounded-lg shadow-md mb-6">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 md:px-6 py-4 text-left">
        <div>
          <h2 className="font-bold text-lg" style={{ color: BLU }}>🏡 Devono vendere casa ({d.rows.length})</h2>
          <p className="text-sm" style={{ color: 'var(--text-gray)' }}>WhatsApp con grafica: il nostro metodo, e la notizia quando l&apos;immobile è venduto</p>
        </div>
        <span className="text-xl" style={{ color: BLU }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="px-4 md:px-6 pb-5 border-t pt-4 space-y-4">
          {d.puoSegnareVenduto && (
            <div className={`rounded-lg p-3 flex flex-wrap items-center gap-3 ${venduto ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
              {venduto ? (
                <>
                  <span className="font-semibold text-green-800">✅ Immobile venduto il {new Date(venduto + 'T12:00:00').toLocaleDateString('it-IT')}</span>
                  <button disabled={busy === 'venduto'} onClick={() => segnaVenduto(null)} className="text-sm underline text-gray-600 ml-auto">Annulla</button>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold" style={{ color: BLU }}>L&apos;immobile è stato venduto?</span>
                  <input type="date" value={dataVendita} onChange={e => setDataVendita(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                  <button disabled={busy === 'venduto'} onClick={() => segnaVenduto(dataVendita)} className="px-3 py-1.5 rounded text-white text-sm font-semibold" style={{ background: BLU }}>Segna come venduto</button>
                </>
              )}
            </div>
          )}

          <div className="flex gap-3 text-sm">
            <button onClick={() => anteprima('metodo')} className="underline" style={{ color: BLU }}>Vedi grafica &quot;metodo&quot;</button>
            {venduto && <button onClick={() => anteprima('venduto')} className="underline" style={{ color: BLU }}>Vedi grafica &quot;venduto&quot;</button>}
          </div>

          {msg && <p className="text-sm text-amber-700">{msg}</p>}

          {d.rows.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-gray)' }}>Nessun cliente che segui ha indicato di dover vendere casa.</p>
          ) : (
            <ul className="divide-y border rounded-lg">
              {d.rows.map(r => (
                <li key={r.id} className="px-3 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium" style={{ color: 'var(--text-dark)' }}>{r.client.nome} {r.client.cognome}</div>
                    <div className="text-xs" style={{ color: 'var(--text-gray)' }}>
                      {SITUAZIONE[r.situazione] || 'deve vendere casa'}
                      {r.status === 'no_show' ? ' · non presentato' : ''}
                      {r.wa_vendita_at ? ` · 1° messaggio il ${ddmm(r.wa_vendita_at)}` : ''}
                      {r.wa_venduto_at ? ` · "venduto" il ${ddmm(r.wa_venduto_at)}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <button
                      disabled={!!busy || !r.client.telefono}
                      onClick={() => invia(r, 'vendita')}
                      className={`px-3 py-2 rounded font-semibold ${r.wa_vendita_at ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-green-600 text-white'}`}
                    >
                      {busy === `${r.id}-vendita` ? 'Preparo…' : r.wa_vendita_at ? '💬 Di nuovo' : '💬 Il nostro metodo'}
                    </button>
                    {venduto && (
                      <button
                        disabled={!!busy || !r.client.telefono}
                        onClick={() => invia(r, 'venduto')}
                        className={`px-3 py-2 rounded font-semibold ${r.wa_venduto_at ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'text-white'}`}
                        style={r.wa_venduto_at ? undefined : { background: BLU }}
                      >
                        {busy === `${r.id}-venduto` ? 'Preparo…' : r.wa_venduto_at ? '🎉 Di nuovo' : '🎉 Venduto!'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
