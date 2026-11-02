// Storia verticale (1080x1920) per celebrare un Open House andato Sold Out.
// Solo disegno: le immagini arrivano già caricate, così la stessa funzione serve al browser e alle anteprime.
// Le zone in alto (nome profilo) e in basso (campo risposta) di Instagram restano libere da testi importanti.

export interface SoldOutStoryData {
  titolo: string
  zona: string
  prenotati: number
  /** giorni dalla pubblicazione dell'Open House al Sold Out (null = non mostrare) */
  giorni: number | null
}

export const STORY_W = 1080
export const STORY_H = 1920
const BLU = '#203162'
const DEEP = '#111A38'
const SKY = '#00AEEF'
const FONT = 'Gotham, Montserrat, Helvetica, Arial, sans-serif'

type Ctx = CanvasRenderingContext2D
type Img = CanvasImageSource & { width: number; height: number }

function wrap(ctx: Ctx, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines)
    cut[maxLines - 1] = cut[maxLines - 1].replace(/\s+\S*$/, '') + '…'
    return cut
  }
  return lines
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Testo con spaziatura tra le lettere (funziona anche dove letterSpacing non è supportato). */
function spaced(ctx: Ctx, text: string, x: number, y: number, spacing: number, align: 'left' | 'center' = 'left') {
  const widths = [...text].map(ch => ctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1)
  let cx = align === 'center' ? x - total / 2 : x
  const prev = ctx.textAlign
  ctx.textAlign = 'left'
  ;[...text].forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + spacing })
  ctx.textAlign = prev
  return total
}

export const giorniLabel = (g: number | null) =>
  g === null ? '' : g < 1 ? 'in meno di 24 ore' : g === 1 ? 'in 1 giorno' : `in ${g} giorni`

export function drawSoldOutStory(ctx: Ctx, d: SoldOutStoryData, photo: Img | null, logo: Img | null) {
  const W = STORY_W
  const H = STORY_H
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  // Sfondo
  ctx.fillStyle = DEEP
  ctx.fillRect(0, 0, W, H)

  // Foto (taglio "cover") nella parte alta
  const photoH = 1120
  if (photo) {
    const scale = Math.max(W / photo.width, photoH / photo.height)
    const dw = photo.width * scale
    const dh = photo.height * scale
    ctx.drawImage(photo, (W - dw) / 2, (photoH - dh) / 2, dw, dh)
  }
  let g = ctx.createLinearGradient(0, 0, 0, 480)
  g.addColorStop(0, 'rgba(17,26,56,.8)')
  g.addColorStop(1, 'rgba(17,26,56,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, 480)
  g = ctx.createLinearGradient(0, photoH - 560, 0, photoH)
  g.addColorStop(0, 'rgba(17,26,56,0)')
  g.addColorStop(1, 'rgba(17,26,56,1)')
  ctx.fillStyle = g
  ctx.fillRect(0, photoH - 560, W, 560)

  // Logo e etichetta
  if (logo) {
    const lw = 300
    ctx.drawImage(logo, 72, 196, lw, (logo.height / logo.width) * lw)
  }
  ctx.font = `700 32px ${FONT}`
  ctx.textBaseline = 'middle'
  const tag = 'OPEN HOUSE'
  const tagW = [...tag].reduce((a, ch) => a + ctx.measureText(ch).width, 0) + 6 * (tag.length - 1) + 56
  roundRect(ctx, W - 72 - tagW, 200, tagW, 68, 34)
  ctx.fillStyle = 'rgba(255,255,255,.16)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,.6)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#fff'
  spaced(ctx, tag, W - 72 - tagW + 28, 235, 6)

  // Fascia SOLD OUT diagonale sulla foto
  ctx.save()
  ctx.translate(W / 2, 600)
  ctx.rotate(-9 * Math.PI / 180)
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 14
  ctx.fillStyle = BLU
  ctx.fillRect(-W, -112, W * 2, 224)
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = SKY
  ctx.fillRect(-W, -112, W * 2, 8)
  ctx.fillRect(-W, 104, W * 2, 8)
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.font = `900 150px ${FONT}`
  spaced(ctx, 'SOLD OUT', 0, 8, 20, 'center')
  ctx.restore()

  // Titolo e zona
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'
  ctx.font = `900 72px ${FONT}`
  const lines = wrap(ctx, d.titolo, W - 144, 2)
  let y = 1060
  lines.forEach(l => { ctx.fillText(l, 72, y); y += 82 })
  if (d.zona) {
    ctx.font = `400 40px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,.78)'
    ctx.fillText(d.zona.charAt(0).toUpperCase() + d.zona.slice(1), 72, y)
    y += 20
  }

  // Il risultato: visite prenotate
  const sy = Math.max(y + 150, 1370)
  if (d.prenotati >= 5) {
    ctx.fillStyle = SKY
    ctx.font = `900 156px ${FONT}`
    const n = String(d.prenotati)
    ctx.fillText(n, 66, sy)
    const nw = ctx.measureText(n).width
    ctx.fillStyle = '#fff'
    ctx.font = `700 52px ${FONT}`
    ctx.fillText('visite prenotate', 66 + nw + 32, sy - 58)
    const gl = giorniLabel(d.giorni)
    ctx.font = `400 42px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,.8)'
    ctx.fillText(gl ? `${gl}. Tutto esaurito.` : 'Tutto esaurito.', 66 + nw + 32, sy)
  } else {
    ctx.fillStyle = '#fff'
    ctx.font = `900 64px ${FONT}`
    ctx.fillText('Tutti gli orari prenotati', 72, sy)
  }

  // Invito per chi vende casa
  const cy = sy + 80
  ctx.fillStyle = 'rgba(255,255,255,.22)'
  ctx.fillRect(72, cy, W - 144, 2)
  ctx.fillStyle = '#fff'
  ctx.font = `900 54px ${FONT}`
  ctx.fillText('Vuoi lo stesso risultato', 72, cy + 86)
  ctx.fillText('per la tua casa?', 72, cy + 148)
  ctx.font = `400 36px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,.78)'
  ctx.fillText('Scrivici: valutiamo insieme il tuo immobile.', 72, cy + 202)
}
