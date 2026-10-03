'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { authFetch } from '@/lib/api'
import { niceText } from '@/lib/text'
import { ASPETTI, PREZZO, PROSSIMO_PASSO } from '@/lib/feedback'
import type { FeedbackRow } from '@/components/dashboard/FeedbackPanel'
import Photo from '@/components/public/Photo'

// Report per il venditore: solo numeri e commenti anonimi, niente nomi né contatti dei clienti.

type Row = FeedbackRow & { q: Record<string, string> | null }
interface OH {
  data_evento: string
  ora_inizio: string
  ora_fine: string
  gre_properties: { titolo: string; zona: string; indirizzo: string | null; prezzo: number | null; immagini: string[] | null }
  gre_agents: { nome: string; cognome: string; email: string } | null
}

const BLU = '#203162'
const SKY = '#00AEEF'

function Bar({ label, value, total, color = SKY }: { label: string; value: number; total: number; color?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="rp-bar">
      <div className="rp-bar-head"><span>{label}</span><b>{value} <small>({pct}%)</small></b></div>
      <div className="rp-bar-track"><div style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  )
}

export default function ReportVenditore() {
  const { agent, loading } = useAuth()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [oh, setOh] = useState<OH | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && !agent) router.push('/dashboard/login')
  }, [agent, loading, router])

  useEffect(() => {
    if (!agent) return
    ;(async () => {
      const res = await authFetch(`/api/open-houses/${id}/report`, { cache: 'no-store' })
      if (!res.ok) return setError('Open House non trovato o non accessibile.')
      const data = await res.json()
      setOh(data.openHouse)
      setRows(data.rows)
    })()
  }, [agent, id])

  const s = useMemo(() => {
    const prenotati = rows.length
    const visitatori = rows.filter(r => r.status !== 'no_show')
    const fb = visitatori.filter(r => r.feedback).map(r => r.feedback!)
    const strutt = fb.filter(f => f.risposte)
    const voti = fb.filter(f => f.rating).map(f => f.rating!)
    const count = (key: 'piaciuto' | 'non_convinto') => {
      const m = new Map<string, number>()
      strutt.forEach(f => f.risposte![key].forEach(v => m.set(v, (m.get(v) || 0) + 1)))
      return ASPETTI.map(a => ({ ...a, n: m.get(a.value) || 0 })).filter(a => a.n > 0).sort((a, b) => b.n - a.n)
    }
    const passo = (v: string) =>
      fb.filter(f => (f.risposte ? f.risposte.prossimo_passo === v : v === 'offerta' ? f.interesse_acquisto : v === 'rivedere' ? f.richiesta_appuntamento : false)).length
    const q = visitatori.map(r => r.q).filter(Boolean) as Record<string, string>[]
    return {
      prenotati,
      visitatori: visitatori.length,
      risposte: fb.length,
      strutturate: strutt.length,
      media: voti.length ? voti.reduce((a, b) => a + b, 0) / voti.length : 0,
      prezzo: PREZZO.map(p => ({ ...p, n: strutt.filter(f => f.risposte!.prezzo === p.value).length })),
      passi: PROSSIMO_PASSO.map(p => ({ ...p, n: passo(p.value) })),
      forti: count('piaciuto'),
      deboli: count('non_convinto'),
      commenti: fb.filter(f => f.commenti && f.commenti.trim()).map(f => ({ testo: f.commenti!.trim(), voto: f.rating })),
      qualificati: {
        totale: q.length,
        senza_mutuo: q.filter(x => x.necessita_mutuo === 'no').length,
        banca: q.filter(x => x.necessita_mutuo && x.necessita_mutuo !== 'no' && ['pre_delibera', 'simulazione'].includes(x.stato_mutuo)).length,
        vendere: q.filter(x => x.vendita_immobile?.startsWith('si')).length,
        entro3: q.filter(x => ['entro_30_giorni', 'entro_3_mesi'].includes(x.tempistiche_acquisto)).length,
      },
    }
  }, [rows])

  if (error) return <div className="p-10 text-center">{error}</div>
  if (!oh) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: BLU }} /></div>

  const p = oh.gre_properties
  const data = new Date(oh.data_evento + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="rp">
      <style>{`
        .rp { background: #e5e7eb; min-height: 100vh; padding: 24px 12px; color: #1f2937; font-family: 'Gotham', Helvetica, Arial, sans-serif; }
        .rp-toolbar { max-width: 210mm; margin: 0 auto 16px; display: flex; gap: 8px; justify-content: space-between; align-items: center; }
        .rp-toolbar button { padding: 10px 18px; border-radius: 999px; font-weight: 600; }
        .rp-page { background: #fff; max-width: 210mm; margin: 0 auto; padding: 14mm; box-shadow: 0 10px 30px rgba(0,0,0,.12); }
        .rp-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${BLU}; padding-bottom: 10px; }
        .rp-kicker { color: ${SKY}; font-weight: 700; letter-spacing: .12em; font-size: 11px; text-transform: uppercase; }
        .rp h1 { color: ${BLU}; font-weight: 900; font-size: 26px; line-height: 1.1; margin: 4px 0; }
        .rp h2 { color: ${BLU}; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: .08em; margin: 0 0 10px; }
        .rp-hero { display: grid; grid-template-columns: 1fr 180px; gap: 16px; margin: 16px 0; align-items: center; }
        .rp-hero img { width: 180px; height: 120px; object-fit: cover; border-radius: 10px; }
        .rp-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0 20px; }
        .rp-kpi { background: #F3F5FA; border-radius: 10px; padding: 12px; text-align: center; }
        .rp-kpi b { display: block; font-size: 26px; font-weight: 900; color: ${BLU}; line-height: 1.1; }
        .rp-kpi span { font-size: 11px; color: #6b7280; }
        .rp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 20px; }
        .rp-box { break-inside: avoid; }
        .rp-bar { margin-bottom: 8px; }
        .rp-bar-head { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 3px; }
        .rp-bar-head small { color: #6b7280; font-weight: 400; }
        .rp-bar-track { height: 8px; background: #EEF0F4; border-radius: 99px; overflow: hidden; }
        .rp-bar-track div { height: 100%; border-radius: 99px; }
        .rp-empty { font-size: 12.5px; color: #9ca3af; }
        .rp-quote { border-left: 3px solid ${SKY}; padding: 6px 10px; margin: 0 0 8px; font-size: 12.5px; font-style: italic; break-inside: avoid; background: #FAFBFD; }
        .rp-quote small { color: #f59e0b; font-style: normal; margin-left: 6px; }
        .rp-foot { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 10.5px; color: #6b7280; }
        @media print {
          @page { size: A4; margin: 0; }
          .rp { background: #fff; padding: 0; }
          .rp-toolbar { display: none; }
          .rp-page { box-shadow: none; max-width: none; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="rp-toolbar">
        <button onClick={() => router.push(`/dashboard/open-houses/${id}`)} className="bg-white">← Cruscotto</button>
        <span className="text-sm text-gray-600 hidden sm:block">Nel riquadro di stampa scegli “Salva come PDF”</span>
        <button onClick={() => window.print()} className="text-white" style={{ background: BLU }}>⬇ Scarica PDF</button>
      </div>

      <div className="rp-page">
        <div className="rp-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-ghergo-blu.png" alt="Ghergo Immobiliare" style={{ height: 34 }} />
          <div className="rp-kicker">Report Open House</div>
        </div>

        <div className="rp-hero">
          <div>
            <h1>{niceText(p.titolo)}</h1>
            <div style={{ color: '#4b5563', fontSize: 13 }}>{[p.indirizzo, niceText(p.zona)].filter(Boolean).join(' – ')}</div>
            <div style={{ color: '#4b5563', fontSize: 13, marginTop: 4, textTransform: 'capitalize' }}>
              {data}, {oh.ora_inizio.slice(0, 5)}–{oh.ora_fine.slice(0, 5)}
            </div>
            {oh.gre_agents && <div style={{ fontSize: 13, marginTop: 4 }}>Agente: <b>{oh.gre_agents.nome} {oh.gre_agents.cognome}</b></div>}
          </div>
          {p.immagini?.[0] && <Photo src={p.immagini[0]} width={500} quality={85} alt="" />}
        </div>

        <div className="rp-kpis">
          <div className="rp-kpi"><b>{s.prenotati}</b><span>Prenotazioni</span></div>
          <div className="rp-kpi"><b>{s.visitatori}</b><span>Visitatori</span></div>
          <div className="rp-kpi"><b>{s.risposte}</b><span>Feedback ricevuti</span></div>
          <div className="rp-kpi"><b style={{ color: '#f59e0b' }}>{s.media ? s.media.toFixed(1) : '–'}</b><span>Voto medio su 5</span></div>
        </div>

        <div className="rp-grid">
          <div className="rp-box">
            <h2>Interesse dei visitatori</h2>
            {s.passi.map(x => <Bar key={x.value} label={x.label} value={x.n} total={s.risposte} color={x.value === 'offerta' ? '#f59e0b' : x.value === 'non_interessato' ? '#9ca3af' : SKY} />)}
          </div>
          <div className="rp-box">
            <h2>Il prezzo è percepito come</h2>
            {s.strutturate ? s.prezzo.map(x => <Bar key={x.value} label={x.label} value={x.n} total={s.strutturate} color={x.value === 'troppo_alto' ? '#dc2626' : x.value === 'alto' ? '#f59e0b' : '#16a34a'} />) : <p className="rp-empty">Nessuna risposta ancora.</p>}
          </div>
          <div className="rp-box">
            <h2>Punti di forza</h2>
            {s.forti.length ? s.forti.slice(0, 6).map(x => <Bar key={x.value} label={x.label} value={x.n} total={s.strutturate} color="#16a34a" />) : <p className="rp-empty">Nessuna risposta ancora.</p>}
          </div>
          <div className="rp-box">
            <h2>Cosa ha frenato</h2>
            {s.deboli.length ? s.deboli.slice(0, 6).map(x => <Bar key={x.value} label={x.label} value={x.n} total={s.strutturate} color="#dc2626" />) : <p className="rp-empty">Nessun punto debole segnalato.</p>}
          </div>
        </div>

        {s.qualificati.totale > 0 && (
          <div className="rp-box" style={{ marginBottom: 20 }}>
            <h2>Profilo dei visitatori</h2>
            <div className="rp-kpis" style={{ margin: 0 }}>
              <div className="rp-kpi"><b>{s.qualificati.senza_mutuo}</b><span>Comprano senza mutuo</span></div>
              <div className="rp-kpi"><b>{s.qualificati.banca}</b><span>Mutuo già verificato in banca</span></div>
              <div className="rp-kpi"><b>{s.qualificati.entro3}</b><span>Vogliono comprare entro 3 mesi</span></div>
              <div className="rp-kpi"><b>{s.qualificati.vendere}</b><span>Devono prima vendere casa</span></div>
            </div>
          </div>
        )}

        <div>
          <h2>Cosa hanno detto i visitatori</h2>
          {s.commenti.length ? s.commenti.map((c, i) => (
            <p key={i} className="rp-quote">“{c.testo}”{c.voto ? <small>{'★'.repeat(c.voto)}</small> : null}</p>
          )) : <p className="rp-empty">Nessun commento scritto.</p>}
        </div>

        <div className="rp-foot">
          <span>Ghergo Immobiliare · Sogna, Realizza, Abita</span>
          <span>Report generato il {new Date().toLocaleDateString('it-IT')} · dati anonimi</span>
        </div>
      </div>
    </div>
  )
}
