// Report per il venditore: calcolo dei numeri e creazione del PDF direttamente nel browser
// (niente finestra di stampa: il file si scarica uguale su Chrome, Safari e telefono).

import { ASPETTI, PREZZO, PROSSIMO_PASSO, type FeedbackAnswers } from './feedback'
import { niceText } from './text'
import { sized } from './img'

export interface ReportRow {
  status: string
  q: Record<string, string> | null
  feedback: {
    rating: number | null
    commenti: string | null
    interesse_acquisto: boolean | null
    richiesta_appuntamento: boolean | null
    risposte: FeedbackAnswers | null
  } | null
}

export interface ReportOH {
  data_evento: string
  ora_inizio: string
  ora_fine: string
  gre_properties: { titolo: string; zona: string; indirizzo: string | null; prezzo: number | null; immagini: string[] | null }
  gre_agents: { nome: string; cognome: string; email: string } | null
}

export function calcolaReport(rows: ReportRow[]) {
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
    prenotati: rows.length,
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
}

export type ReportStats = ReturnType<typeof calcolaReport>

// ---------- PDF ----------

/** i font standard del PDF non hanno emoji e simboli speciali: li tolgo */
const safe = (s: string) =>
  (s || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF€\n]/g, '')

/** carica un'immagine e la converte in JPEG (pdf-lib accetta solo JPEG/PNG) */
async function immagineJpeg(src: string, outW: number, ratio: number): Promise<Uint8Array | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = src
    })
    // taglio centrale con le proporzioni del riquadro (ratio = larghezza / altezza)
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    let sw = iw
    let sh = iw / ratio
    if (sh > ih) { sh = ih; sw = ih * ratio }
    const c = document.createElement('canvas')
    c.width = outW
    c.height = Math.round(outW / ratio)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.86))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } catch {
    return null
  }
}

export async function creaReportPdf(oh: ReportOH, s: ReportStats): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Report Open House - ${safe(niceText(oh.gre_properties.titolo))}`)
  pdf.setAuthor('Ghergo Immobiliare')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)

  const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
  const BLU = hex('#203162')
  const GRIGIO = hex('#6b7280')
  const TESTO = hex('#1f2937')
  const TRACCIA = hex('#EEF0F4')
  const BOX = hex('#F3F5FA')
  const VERDE = hex('#16a34a')
  const ROSSO = hex('#dc2626')
  const AMBRA = hex('#f59e0b')
  const BLU_CHIARO = hex('#5b6fae')

  const W = 595.28
  const H = 841.89
  const M = 40
  let page = pdf.addPage([W, H])
  let y = H - M

  const nuovaPagina = () => { page = pdf.addPage([W, H]); y = H - M }
  const spazio = (h: number) => { if (y - h < M + 30) nuovaPagina() }
  const text = (t: string, x: number, yy: number, size: number, f = font, color = TESTO) =>
    page.drawText(safe(t), { x, y: yy, size, font: f, color })
  const wrap = (t: string, size: number, maxW: number, f = font) => {
    const out: string[] = []
    for (const par of safe(t).split('\n')) {
      let line = ''
      for (const w of par.split(' ')) {
        const test = line ? `${line} ${w}` : w
        if (f.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = w } else line = test
      }
      out.push(line)
    }
    return out
  }

  // intestazione
  try {
    const logoBytes = new Uint8Array(await (await fetch('/logo-ghergo-blu.png')).arrayBuffer())
    const logo = await pdf.embedPng(logoBytes)
    const lh = 30
    page.drawImage(logo, { x: M, y: y - lh, width: (logo.width / logo.height) * lh, height: lh })
  } catch {
    text('GHERGO IMMOBILIARE', M, y - 22, 16, bold, BLU)
  }
  const kicker = 'REPORT OPEN HOUSE'
  text(kicker, W - M - bold.widthOfTextAtSize(kicker, 9), y - 20, 9, bold, BLU)
  y -= 42
  page.drawRectangle({ x: M, y, width: W - 2 * M, height: 2.5, color: BLU })
  y -= 22

  // immobile + foto
  const p = oh.gre_properties
  const fotoW = 170
  const fotoH = 113
  const testoW = W - 2 * M - fotoW - 16
  const topHero = y
  const titolo = wrap(niceText(p.titolo), 20, testoW, bold)
  titolo.forEach((l, i) => text(l, M, y - 18 - i * 23, 20, bold, BLU))
  y -= 18 + (titolo.length - 1) * 23 + 20
  const dove = [p.indirizzo, niceText(p.zona)].filter(Boolean).join(' - ')
  if (dove) { text(dove, M, y, 10.5, font, GRIGIO); y -= 15 }
  const giorno = new Date(oh.data_evento + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  text(`${giorno.charAt(0).toUpperCase()}${giorno.slice(1)}, ${oh.ora_inizio.slice(0, 5)}-${oh.ora_fine.slice(0, 5)}`, M, y, 10.5, font, GRIGIO)
  y -= 15
  if (oh.gre_agents) {
    text('Agente: ', M, y, 10.5, font, TESTO)
    text(`${oh.gre_agents.nome} ${oh.gre_agents.cognome}`, M + font.widthOfTextAtSize('Agente: ', 10.5), y, 10.5, bold, TESTO)
    y -= 15
  }
  if (p.immagini?.[0]) {
    const bytes = await immagineJpeg(sized(p.immagini[0], 900, 82), 680, fotoW / fotoH)
    if (bytes) {
      const img = await pdf.embedJpg(bytes)
      page.drawImage(img, { x: W - M - fotoW, y: topHero - fotoH, width: fotoW, height: fotoH })
    }
  }
  y = Math.min(y, topHero - fotoH) - 18

  // riquadri numeri
  const kpi = (items: { v: string; l: string; color?: ReturnType<typeof hex> }[]) => {
    const gap = 8
    const bw = (W - 2 * M - gap * (items.length - 1)) / items.length
    const bh = 52
    spazio(bh + 10)
    items.forEach((k, i) => {
      const x = M + i * (bw + gap)
      page.drawRectangle({ x, y: y - bh, width: bw, height: bh, color: BOX })
      const vw = bold.widthOfTextAtSize(k.v, 20)
      text(k.v, x + (bw - vw) / 2, y - 26, 20, bold, k.color || BLU)
      const lines = wrap(k.l, 8.5, bw - 10)
      lines.slice(0, 2).forEach((ln, j) => {
        const lw = font.widthOfTextAtSize(ln, 8.5)
        text(ln, x + (bw - lw) / 2, y - 38 - j * 10, 8.5, font, GRIGIO)
      })
    })
    y -= bh + 18
  }
  kpi([
    { v: String(s.prenotati), l: 'Prenotazioni' },
    { v: String(s.visitatori), l: 'Visitatori' },
    { v: String(s.risposte), l: 'Feedback ricevuti' },
    { v: s.media ? s.media.toFixed(1).replace('.', ',') : '-', l: 'Voto medio su 5', color: AMBRA },
  ])

  // sezioni con barre, due per riga
  const colW = (W - 2 * M - 22) / 2
  const sezione = (x: number, top: number, titoloSez: string, barre: { label: string; n: number; color: ReturnType<typeof hex> }[], totale: number, vuoto: string) => {
    let yy = top
    text(titoloSez.toUpperCase(), x, yy, 9.5, bold, BLU)
    yy -= 16
    if (!barre.length) { text(vuoto, x, yy, 9.5, font, GRIGIO); return yy - 14 }
    for (const b of barre) {
      const pct = totale ? Math.round((b.n / totale) * 100) : 0
      text(b.label, x, yy, 9.5, font, TESTO)
      const val = `${b.n} (${pct}%)`
      text(val, x + colW - bold.widthOfTextAtSize(val, 9.5), yy, 9.5, bold, TESTO)
      yy -= 7
      page.drawRectangle({ x, y: yy - 4, width: colW, height: 5, color: TRACCIA })
      if (pct) page.drawRectangle({ x, y: yy - 4, width: (colW * pct) / 100, height: 5, color: b.color })
      yy -= 15
    }
    return yy
  }
  const riga = (a: Parameters<typeof sezione>, b: Parameters<typeof sezione>) => {
    const righe = Math.max(a[3].length || 1, b[3].length || 1)
    spazio(20 + righe * 22)
    const ya = sezione(M, y, a[2], a[3], a[4], a[5])
    const yb = sezione(M + colW + 22, y, b[2], b[3], b[4], b[5])
    y = Math.min(ya, yb) - 12
  }
  riga(
    [M, y, 'Interesse dei visitatori', s.passi.map(x => ({ label: x.label, n: x.n, color: x.value === 'offerta' ? AMBRA : x.value === 'non_interessato' ? GRIGIO : BLU_CHIARO })), s.risposte, 'Nessuna risposta ancora.'],
    [M, y, 'Il prezzo è percepito come', s.strutturate ? s.prezzo.map(x => ({ label: x.label, n: x.n, color: x.value === 'troppo_alto' ? ROSSO : x.value === 'alto' ? AMBRA : VERDE })) : [], s.strutturate, 'Nessuna risposta ancora.'],
  )
  riga(
    [M, y, 'Punti di forza', s.forti.slice(0, 6).map(x => ({ label: x.label, n: x.n, color: VERDE })), s.strutturate, 'Nessuna risposta ancora.'],
    [M, y, 'Cosa ha frenato', s.deboli.slice(0, 6).map(x => ({ label: x.label, n: x.n, color: ROSSO })), s.strutturate, 'Nessun punto debole segnalato.'],
  )

  if (s.qualificati.totale > 0) {
    spazio(90)
    text('PROFILO DEI VISITATORI', M, y, 9.5, bold, BLU)
    y -= 12
    kpi([
      { v: String(s.qualificati.senza_mutuo), l: 'Comprano senza mutuo' },
      { v: String(s.qualificati.banca), l: 'Mutuo già verificato in banca' },
      { v: String(s.qualificati.entro3), l: 'Vogliono comprare entro 3 mesi' },
      { v: String(s.qualificati.vendere), l: 'Devono prima vendere casa' },
    ])
  }

  // commenti
  spazio(40)
  text('COSA HANNO DETTO I VISITATORI', M, y, 9.5, bold, BLU)
  y -= 16
  if (!s.commenti.length) {
    text('Nessun commento scritto.', M, y, 9.5, font, GRIGIO)
    y -= 14
  }
  for (const c of s.commenti) {
    const righe = wrap(`"${c.testo}"${c.voto ? `  (voto ${c.voto}/5)` : ''}`, 9.5, W - 2 * M - 14, italic)
    const h = righe.length * 12 + 8
    spazio(h + 6)
    page.drawRectangle({ x: M, y: y - h + 9, width: 2.5, height: h, color: BLU })
    righe.forEach((ln, i) => text(ln, M + 10, y - i * 12, 9.5, italic, TESTO))
    y -= h + 6
  }

  // piè di pagina su tutte le pagine
  const pagine = pdf.getPages()
  const oggi = new Date().toLocaleDateString('it-IT')
  pagine.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: M + 6 }, end: { x: W - M, y: M + 6 }, thickness: 0.5, color: TRACCIA })
    pg.drawText('Ghergo Immobiliare - Sogna, Realizza, Abita', { x: M, y: M - 6, size: 8, font, color: GRIGIO })
    const dx = `Report generato il ${oggi} - dati anonimi${pagine.length > 1 ? ` - pag. ${i + 1}/${pagine.length}` : ''}`
    pg.drawText(dx, { x: W - M - font.widthOfTextAtSize(dx, 8), y: M - 6, size: 8, font, color: GRIGIO })
  })

  return pdf.save()
}
