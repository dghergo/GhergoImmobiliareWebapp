// Grafiche (1080x1350) per i messaggi WhatsApp ai clienti che devono vendere casa.
// 'metodo': dopo l'Open House — il nostro metodo, ti va di parlarne per la tua casa?
// 'venduto': l'immobile visitato è stato venduto — i risultati, la prossima può essere la tua.

import { sized } from './img'
import { niceText } from './text'

export interface DatiGrafica {
  titolo: string
  zona: string
  foto: string | null
  visitatori: number
  giorni: number | null // giorni dall'Open House alla vendita
}

const W = 1080
const H = 1350
const BLU = '#203162'
const AMBRA = '#fbbf24'
const VERDE = '#22c55e'
const PAD = 80

const carica = (src: string, cross = true) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    if (cross) i.crossOrigin = 'anonymous'
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = src
  })

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = []
  let line = ''
  for (const w of text.split(' ')) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w } else line = t
  }
  if (line) out.push(line)
  return out
}

/** scrive il testo riducendo il carattere finché entra nella larghezza */
function fit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, weight: number, size: number) {
  let sz = size
  do {
    ctx.font = `${weight} ${sz}px Gotham, Montserrat, sans-serif`
    sz -= 2
  } while (ctx.measureText(text).width > maxW && sz > 20)
  ctx.fillText(text, x, y)
}

/** foto che riempie il riquadro (taglio centrale) */
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const r = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const sw = w / r
  const sh = h / r
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h)
}

export async function creaGrafica(tipoIn: 'metodo' | 'venduto' | 'venduto_cliente', d: DatiGrafica): Promise<Blob> {
  // 'venduto_cliente': stessa grafica "venduto" per chi non deve vendere casa (cerca ancora casa)
  const cliente = tipoIn === 'venduto_cliente'
  const tipo: 'metodo' | 'venduto' = tipoIn === 'metodo' ? 'metodo' : 'venduto'
  await Promise.all([
    document.fonts.load('900 100px Gotham'),
    document.fonts.load('700 50px Gotham'),
    document.fonts.load('500 40px Gotham'),
  ]).catch(() => undefined)
  const [logo, foto] = await Promise.all([
    carica('/logo-ghergo-bianco.png', false),
    d.foto ? carica(sized(d.foto, 1400, 85)).catch(() => carica(d.foto!).catch(() => null)) : Promise.resolve(null),
  ])

  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(W * 0.85, 0, 50, W * 0.85, 0, H)
  g.addColorStop(0, '#2c4387')
  g.addColorStop(0.45, BLU)
  g.addColorStop(1, '#121c3d')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // foto in alto con sfumatura verso il blu
  const fh = 500
  if (foto) {
    cover(ctx, foto, 0, 0, W, fh)
    const s = ctx.createLinearGradient(0, fh * 0.35, 0, fh)
    s.addColorStop(0, 'rgba(18,28,61,0)')
    s.addColorStop(1, 'rgba(18,28,61,1)')
    ctx.fillStyle = s
    ctx.fillRect(0, 0, W, fh)
    const top = ctx.createLinearGradient(0, 0, 0, 200)
    top.addColorStop(0, 'rgba(18,28,61,.75)')
    top.addColorStop(1, 'rgba(18,28,61,0)')
    ctx.fillStyle = top
    ctx.fillRect(0, 0, W, 200)
  }
  ctx.drawImage(logo, PAD, 60, (logo.width / logo.height) * 64, 64)

  const luogo = niceText(d.zona || d.titolo)
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'alphabetic'

  if (tipo === 'venduto') {
    // timbro VENDUTO
    ctx.save()
    const conGiorni = d.giorni !== null && d.giorni >= 0
    ctx.translate(W - 290, 300)
    ctx.rotate(-0.16)
    roundRect(ctx, -250, -78, 500, conGiorni ? 210 : 156, 24)
    ctx.fillStyle = AMBRA
    ctx.fill()
    ctx.fillStyle = BLU
    ctx.textAlign = 'center'
    fit(ctx, 'VENDUTO', 0, 36, 440, 900, 104)
    if (conGiorni) fit(ctx, d.giorni === 0 ? 'il giorno dell’Open House' : `in ${d.giorni} ${d.giorni === 1 ? 'giorno' : 'giorni'} dall’Open House`, 0, 100, 440, 700, 36)
    ctx.restore()
    ctx.textAlign = 'left'
  }

  let y = fh + 20
  ctx.fillStyle = AMBRA
  fit(ctx, (tipo === 'venduto' ? `Il risultato dell'Open House di ${luogo}` : `Il nostro metodo · Open House di ${luogo}`).toUpperCase(), PAD, y, W - PAD * 2, 500, 34)
  y += 30

  // numero grande
  ctx.fillStyle = '#fff'
  ctx.font = '900 220px Gotham, Montserrat, sans-serif'
  const num = String(d.visitatori)
  ctx.fillText(num, PAD - 8, y + 190)
  const nw = ctx.measureText(num).width
  ctx.font = '700 46px Gotham, Montserrat, sans-serif'
  const etichetta = wrap(ctx, tipo === 'venduto' ? 'persone hanno visitato la casa' : 'persone in visita in un solo giorno', W - PAD * 2 - nw - 30)
  etichetta.forEach((l, i) => ctx.fillText(l, PAD + nw + 30, y + 120 + i * 56 - (etichetta.length - 2) * 28))
  y += 240

  // il messaggio chiave: chi deve vendere per comprare
  const boxH = 232
  roundRect(ctx, PAD, y, W - PAD * 2, boxH, 28)
  ctx.fillStyle = 'rgba(255,255,255,.1)'
  ctx.fill()
  ctx.fillStyle = AMBRA
  roundRect(ctx, PAD, y, 12, boxH, 6)
  ctx.fill()
  fit(ctx, cliente ? 'Stai ancora cercando casa?' : 'Devi vendere per comprare casa?', PAD + 44, y + 62, W - PAD * 2 - 80, 900, 46)
  ctx.fillStyle = '#fff'
  ctx.font = '500 34px Gotham, Montserrat, sans-serif'
  wrap(ctx, cliente ? 'Ti aggiorniamo sui prossimi Open House e ti segnaliamo per primo gli immobili adatti a te.' : 'È il modo giusto per trovare l’acquirente che te lo permette: l’abbiamo già fatto per centinaia di clienti.', W - PAD * 2 - 80)
    .slice(0, 3)
    .forEach((l, i) => ctx.fillText(l, PAD + 44, y + 115 + i * 42))

  // invito finale
  const bh = 220
  const by = H - 70 - bh
  roundRect(ctx, PAD, by, W - PAD * 2, bh, 36)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.fillStyle = BLU
  fit(ctx, cliente ? 'Grazie per aver partecipato!' : tipo === 'venduto' ? 'Lo stesso risultato per la tua casa' : 'Possiamo farlo anche per la tua casa', PAD + 46, by + 90, W - PAD * 2 - 92, 900, 52)
  fit(ctx, cliente ? 'Prossimi Open House: openhouse.ghergoimmobiliare.com' : tipo === 'venduto' ? 'Fissiamo un appuntamento: 071 9257300' : 'Valutiamo insieme la vendita: 071 9257300', PAD + 46, by + 160, W - PAD * 2 - 92, 500, 40)

  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Grafica non creata'))), 'image/jpeg', 0.9))
}
