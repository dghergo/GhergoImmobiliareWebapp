import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

// Foglio visita digitale di Ghergo Immobiliare: attestazione di visita, ricevuta di informazioni e documenti,
// accordo sul compenso, presa visione dell'informativa privacy.
// Il testo è scritto dall'agenzia sulla base dei contenuti del modulo cartaceo in uso;
// va fatto verificare dal legale prima dell'uso definitivo. Ogni modifica → cambiare FOGLIO_VERSIONE.

export const FOGLIO_VERSIONE = '2026-10-03'

export const AGENZIA = {
  ragioneSociale: 'Ghergo Immobiliare S.r.l.',
  sede: 'Via D\'Ancona 43/A, 60027 Osimo (AN)',
  telefono: '071 9257300',
  email: 'amministrazione@ghergoimmobiliare.com',
  pec: '', // da completare
  piva: '03016310421',
  rea: 'CCIAA di Ancona, Sezione Agenti Immobiliari, REA n. 307054',
  assicurazione: '', // compagnia, polizza n., scadenza – da completare
  fiaip: '', // n. iscrizione FIAIP – da completare
}

export const COMPENSO = { percentuale: 4, minimo: null as number | null }

export interface Residenza { comune: string; provincia: string; cap: string; indirizzo: string }
export interface Anagrafica {
  luogo_nascita: string
  provincia_nascita: string
  data_nascita: string
  codice_fiscale: string
  residenza: Residenza
  per_conto_di: string
  accompagnato_da: string
}

export interface FoglioDati {
  cliente: { nome: string; cognome: string; email: string; telefono: string }
  anagrafica: Anagrafica
  immobile: {
    titolo: string
    riferimento: string
    comune: string
    provincia: string
    indirizzo: string
    scala: string
    piano: string
    interno: string
    catasto: { foglio: string; particella: string; sub: string; categoria: string }
    prezzo: number | null
  }
  visita: { data: string; ora: string }
  agente: string
}

export const ANAGRAFICA_VUOTA: Anagrafica = {
  luogo_nascita: '', provincia_nascita: '', data_nascita: '', codice_fiscale: '',
  residenza: { comune: '', provincia: '', cap: '', indirizzo: '' }, per_conto_di: '', accompagnato_da: '',
}

/** Valida i dati anagrafici inseriti dal cliente. Ritorna un messaggio d'errore o null. */
export function controllaAnagrafica(a: Anagrafica): string | null {
  if (!a.luogo_nascita.trim() || !a.data_nascita.trim()) return 'Inserisci luogo e data di nascita'
  if (!/^[A-Z0-9]{16}$/i.test(a.codice_fiscale.replace(/\s/g, ''))) return 'Codice fiscale non valido (16 caratteri)'
  const r = a.residenza
  if (!r.comune.trim() || !r.indirizzo.trim()) return 'Inserisci comune e indirizzo di residenza'
  return null
}

export function descriviImmobile(i: FoglioDati['immobile']): string {
  const dove = [i.indirizzo, i.comune && `${i.comune}${i.provincia ? ` (${i.provincia})` : ''}`].filter(Boolean).join(', ')
  const det = [i.scala && `scala ${i.scala}`, i.piano && `piano ${i.piano}`, i.interno && `interno ${i.interno}`].filter(Boolean).join(', ')
  return [i.riferimento && `rif. ${i.riferimento}`, i.titolo, dove, det].filter(Boolean).join(' – ')
}

export function descriviCatasto(c: FoglioDati['immobile']['catasto']): string {
  return [c.foglio && `foglio ${c.foglio}`, c.particella && `particella ${c.particella}`, c.sub && `sub. ${c.sub}`, c.categoria && `cat. ${c.categoria}`]
    .filter(Boolean).join(', ')
}

/** Le dichiarazioni che il cliente accetta una per una. */
export function dichiarazioni(d: FoglioDati): { titolo: string; testo: string }[] {
  const min = COMPENSO.minimo ? `, con un minimo di € ${COMPENSO.minimo.toLocaleString('it-IT')}` : ''
  return [
    {
      titolo: 'Attestazione di visita',
      testo: `Dichiaro di aver ricevuto per la prima volta informazioni e di aver visitato per la prima volta, in data ${d.visita.data}${d.visita.ora ? ` alle ore ${d.visita.ora}` : ''}, l'immobile in vendita sopra descritto, tramite ${d.agente} di ${AGENZIA.ragioneSociale}, mediatore incaricato dal venditore.`,
    },
    {
      titolo: 'Ricevuta di informazioni e documenti',
      testo: 'Dichiaro di aver ricevuto la scheda informativa, le planimetrie, le fotografie, il vademecum e il materiale informativo relativi all\'immobile.',
    },
    {
      titolo: 'Servizio gratuito',
      testo: 'Prendo atto che la visita e le informazioni sono un servizio completamente gratuito: nulla sarà dovuto all\'agenzia per l\'attività svolta in caso di mancata conclusione dell\'affare.',
    },
    {
      titolo: 'Accordo di compenso',
      testo: `Solo in caso di conclusione dell'affare (art. 1326 c.c.) mi obbligo a corrispondere a ${AGENZIA.ragioneSociale} un compenso, a forfait e omnicomprensivo, pari al ${COMPENSO.percentuale}% (${COMPENSO.percentuale === 4 ? 'quattro' : COMPENSO.percentuale} per cento) del prezzo di compravendita${min}, oltre IVA di legge.`,
    },
    {
      titolo: 'Quando è dovuto il compenso',
      testo: 'Il compenso matura e va corrisposto al perfezionamento della proposta d\'acquisto o del contratto preliminare o, in loro assenza, alla stipula del contratto definitivo. È comunque dovuto anche se l\'affare viene concluso direttamente tra le parti in un momento successivo.',
    },
    {
      titolo: 'Informativa privacy',
      testo: 'Dichiaro di aver preso visione dell\'informativa sul trattamento dei dati personali ai sensi degli artt. 13 e 14 del Regolamento UE 2016/679, resa disponibile dall\'agenzia.',
    },
  ]
}

const BLU = rgb(0x20 / 255, 0x31 / 255, 0x62 / 255)
const GRIGIO = rgb(0.42, 0.45, 0.5)
const NERO = rgb(0.1, 0.1, 0.12)

// I font standard del PDF accettano solo caratteri WinAnsi
const safe = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/[^\x20-\x7E -ÿ€]/g, '')

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const w of safe(text).split(/\s+/)) {
    const t = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(t, size) > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = t
  }
  if (line) lines.push(line)
  return lines
}

export async function creaFoglioPdf(p: {
  dati: FoglioDati
  firmaPng: Uint8Array
  firmatoIl: Date
  codice: string
  logoPng?: Uint8Array | null
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Conferma di visita - ${p.dati.cliente.nome} ${p.dati.cliente.cognome}`)
  pdf.setAuthor(AGENZIA.ragioneSociale)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const PW = 595.28, PH = 841.89, M = 44, W = PW - M * 2
  let page: PDFPage = pdf.addPage([PW, PH])
  let y = PH - M

  const ensure = (h: number) => {
    if (y - h < 60) {
      page = pdf.addPage([PW, PH])
      y = PH - M
    }
  }
  const t = (s: string, x: number, size = 9, f: PDFFont = font, color = NERO) =>
    page.drawText(safe(s), { x, y, size, font: f, color })
  const section = (s: string) => {
    ensure(30)
    y -= 6
    t(s.toUpperCase(), M, 8.5, bold, BLU)
    y -= 4
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: rgb(0.85, 0.87, 0.92) })
    y -= 13
  }
  const field = (k: string, v: string, x = M, w = W) => {
    const lines = wrap(v || '-', bold, 9, w - 105)
    ensure(lines.length * 12)
    t(k, x, 8, font, GRIGIO)
    lines.forEach((l, i) => page.drawText(l, { x: x + 105, y: y - i * 12, size: 9, font: bold, color: NERO }))
    y -= lines.length * 12 + 2
  }

  // intestazione
  if (p.logoPng) {
    try {
      const logo = await pdf.embedPng(p.logoPng)
      const h = 30
      page.drawImage(logo, { x: M, y: y - h + 4, width: (logo.width / logo.height) * h, height: h })
    } catch { /* senza logo */ }
  }
  const titolo = 'CONFERMA DI VISITA'
  t(titolo, PW - M - bold.widthOfTextAtSize(titolo, 14), 14, bold, BLU)
  y -= 13
  const sub = 'Attestazione di visita - Ricevuta di informazioni - Condizioni commerciali - Privacy'
  t(sub, PW - M - font.widthOfTextAtSize(sub, 7.5), 7.5, font, GRIGIO)
  y -= 22

  const a = p.dati.anagrafica
  const r = a.residenza
  section('Cliente')
  field('Nome e cognome', `${p.dati.cliente.nome} ${p.dati.cliente.cognome}`)
  // dati anagrafici: solo se già presenti (non vengono chiesti al check-in)
  const dn = /^\d{4}-\d{2}-\d{2}$/.test(a.data_nascita) ? a.data_nascita.split('-').reverse().join('/') : a.data_nascita
  if (a.luogo_nascita || dn) field('Nato/a a', `${a.luogo_nascita}${a.provincia_nascita ? ` (${a.provincia_nascita})` : ''}${dn ? `, il ${dn}` : ''}`)
  if (a.codice_fiscale) field('Codice fiscale', a.codice_fiscale.toUpperCase())
  if (r.comune || r.indirizzo) field('Residente a', `${r.comune}${r.provincia ? ` (${r.provincia})` : ''}${r.cap ? `, ${r.cap}` : ''} - ${r.indirizzo}`)
  field('Telefono / email', `${p.dati.cliente.telefono} - ${p.dati.cliente.email}`)
  if (a.per_conto_di) field('Per conto di', a.per_conto_di)
  if (a.accompagnato_da) field('Accompagnato/a da', a.accompagnato_da)

  section('Agenzia')
  field('Agente', `${p.dati.agente} - ${AGENZIA.ragioneSociale}`)
  field('Sede', `${AGENZIA.sede} - tel. ${AGENZIA.telefono} - ${AGENZIA.email}${AGENZIA.pec ? ` - PEC ${AGENZIA.pec}` : ''}`)
  field('Dati societari', `P.IVA e C.F. ${AGENZIA.piva} - ${AGENZIA.rea}${AGENZIA.fiaip ? ` - iscritta FIAIP n. ${AGENZIA.fiaip}` : ''}`)
  if (AGENZIA.assicurazione) field('Assicurazione', `${AGENZIA.assicurazione} (art. 18 L. 57/2001)`)

  section('Immobile in vendita e visita')
  const im = p.dati.immobile
  field('Immobile', descriviImmobile(im))
  const cat = descriviCatasto(im.catasto)
  if (cat) field('Dati catastali', cat)
  if (im.prezzo) field('Prezzo richiesto', `€ ${im.prezzo.toLocaleString('it-IT')}`)
  field('Data e ora visita', `${p.dati.visita.data}${p.dati.visita.ora ? `, ore ${p.dati.visita.ora}` : ''}`)

  section('Il cliente conferma e accetta')
  dichiarazioni(p.dati).forEach((d, i) => {
    const lines = wrap(d.testo, font, 8.8, W - 16)
    ensure(lines.length * 11.5 + 18)
    page.drawText(`${i + 1}.`, { x: M, y, size: 8.8, font: bold, color: BLU })
    page.drawText(safe(d.titolo), { x: M + 16, y, size: 8.8, font: bold, color: NERO })
    y -= 12
    lines.forEach(l => { page.drawText(l, { x: M + 16, y, size: 8.8, font, color: NERO }); y -= 11.5 })
    y -= 4
  })
  y -= 2
  ensure(14)
  t('Il cliente ha confermato la visita e accettato le condizioni sopra riportate apponendo la propria firma.', M, 8, font, GRIGIO)
  y -= 18

  // firma
  ensure(130)
  const quando = p.firmatoIl.toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  t(`${im.comune || 'Osimo'}, ${quando}`, M, 9)
  t('Il Cliente', M + W * 0.5, 9, font, GRIGIO)
  y -= 8
  const sig = await pdf.embedPng(p.firmaPng)
  const sh = 70
  const sw = Math.min(W * 0.45, (sig.width / sig.height) * sh)
  page.drawImage(sig, { x: M + W * 0.5, y: y - sh, width: sw, height: sh })
  y -= sh + 4
  page.drawLine({ start: { x: M + W * 0.5, y }, end: { x: M + W, y }, thickness: 0.8, color: GRIGIO })
  y -= 12
  t(`${p.dati.cliente.nome} ${p.dati.cliente.cognome}`, M + W * 0.5, 8.5)

  // piè di pagina su tutte le pagine
  for (const pg of pdf.getPages()) {
    pg.drawText(safe(`Firmato elettronicamente sul dispositivo dell'agente il ${quando}. Codice di verifica ${p.codice} - testo v. ${FOGLIO_VERSIONE}`), {
      x: M, y: 28, size: 7, font, color: GRIGIO,
    })
  }
  return pdf.save()
}
