// Disegno su canvas (1080x1920) della schermata "Numeri del weekend": serve per scaricare il video e il PDF.
// Stessa sequenza dell'animazione a schermo: logo, periodo, numero grande, tre riquadri, frase finale, invito a vendere.

export interface NumeriCanvas {
  da: string
  a: string
  openHouse: number
  immobili: number
  visitatori: number
  senzaMutuo: number
  offerte: number
}

export const W = 1080
export const H = 1920
export const DURATA_MS = 9500 // animazione (~7 s) + qualche secondo fermo sul finale

const BLU = '#203162'
const VERDE = '#22c55e'
const AMBRA = '#fbbf24'
const PAD = 70

const ease = (p: number) => 1 - Math.pow(1 - p, 3)
const clamp = (v: number) => Math.min(1, Math.max(0, v))
/** valore che sale da 0 a target partendo da `delay` ms */
const conta = (target: number, t: number, delay: number, dur: number) => Math.round(target * ease(clamp((t - delay) / dur)))
/** entrata di un blocco: opacità e spostamento verso l'alto */
const entra = (t: number, at: number) => {
  const p = ease(clamp((t - at) / 700))
  return { alpha: p, dy: (1 - p) * 40 }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const w of text.split(' ')) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })

export function periodoDi(n: NumeriCanvas) {
  const da = new Date(n.da + 'T12:00:00')
  const a = new Date(n.a + 'T12:00:00')
  const weekend = da.getDay() === 5 && a.getDay() === 0 && Math.round((a.getTime() - da.getTime()) / 86400000) === 2
  return weekend ? 'Questo fine settimana' : `Dal ${fmt(n.da)} al ${fmt(n.a)}`
}

export async function preparaRisorse() {
  await Promise.all([
    document.fonts.load('900 100px Gotham'),
    document.fonts.load('700 60px Gotham'),
    document.fonts.load('500 40px Gotham'),
  ]).catch(() => undefined)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = '/logo-ghergo-bianco.png'
  })
}

/** Disegna il fotogramma al tempo t (ms dall'inizio). t molto grande = schermata finale completa. */
export function disegnaNumeri(ctx: CanvasRenderingContext2D, n: NumeriCanvas, t: number, logo: HTMLImageElement) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  ctx.save()
  ctx.clearRect(0, 0, W, H)

  // sfondo blu con luce in alto a destra che si muove piano
  const g = ctx.createRadialGradient(W * 0.85, 0, 50, W * 0.85, 0, H * 1.1)
  g.addColorStop(0, '#2c4387')
  g.addColorStop(0.45, BLU)
  g.addColorStop(1, '#121c3d')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const ang = (t / 14000) * Math.PI * 2
  const lx = W / 2 + Math.cos(ang) * W * 0.6
  const ly = H * 0.45 + Math.sin(ang) * H * 0.4
  const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 520)
  glow.addColorStop(0, 'rgba(255,255,255,0.10)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'

  // logo
  let e = entra(t, 0)
  ctx.globalAlpha = e.alpha
  const lh = 88
  ctx.drawImage(logo, PAD, 115 + e.dy, (logo.width / logo.height) * lh, lh)

  // periodo
  e = entra(t, 250)
  ctx.globalAlpha = e.alpha * 0.8
  ctx.font = '500 40px Gotham, Montserrat, sans-serif'
  if ('letterSpacing' in c) c.letterSpacing = '10px'
  ctx.fillText(periodoDi(n).toUpperCase(), PAD, 330 + e.dy)
  if ('letterSpacing' in c) c.letterSpacing = '0px'

  // numero grande
  e = entra(t, 500)
  ctx.globalAlpha = e.alpha
  ctx.font = '900 290px Gotham, Montserrat, sans-serif'
  if ('letterSpacing' in c) c.letterSpacing = '-10px'
  ctx.fillText(String(conta(n.visitatori, t, 700, 1400)), PAD - 6, 600 + e.dy)
  if ('letterSpacing' in c) c.letterSpacing = '0px'
  ctx.font = '700 60px Gotham, Montserrat, sans-serif'
  ctx.fillText('persone hanno visitato', PAD, 690 + e.dy)
  ctx.fillText('i nostri immobili', PAD, 762 + e.dy)

  // tre riquadri
  const gap = 26
  const tw = (W - PAD * 2 - gap * 2) / 3
  const ty = 840
  const th = 250
  const tiles = [
    { v: conta(n.openHouse, t, 2300, 900), l: 'Open House', at: 2100, dot: null as string | null },
    { v: conta(n.senzaMutuo, t, 2600, 900), l: 'comprano senza mutuo', at: 2400, dot: VERDE },
    { v: conta(n.offerte, t, 2900, 900), l: n.offerte === 1 ? 'vuole fare un’offerta' : 'vogliono fare un’offerta', at: 2700, dot: AMBRA },
  ]
  tiles.forEach((s, i) => {
    const en = entra(t, s.at)
    ctx.globalAlpha = en.alpha
    const x = PAD + i * (tw + gap)
    const y = ty + en.dy
    roundRect(ctx, x, y, tw, th, 36)
    ctx.fillStyle = 'rgba(255,255,255,0.09)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = 2
    ctx.stroke()
    let nx = x + 28
    if (s.dot) {
      ctx.save()
      ctx.shadowColor = s.dot
      ctx.shadowBlur = 30
      ctx.fillStyle = s.dot
      ctx.beginPath()
      ctx.arc(nx + 15, y + 82, 15, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      nx += 42
    }
    ctx.fillStyle = '#fff'
    ctx.font = '900 100px Gotham, Montserrat, sans-serif'
    ctx.fillText(String(s.v), nx, y + 118)
    ctx.font = '500 33px Gotham, Montserrat, sans-serif'
    ctx.globalAlpha = en.alpha * 0.9
    wrap(ctx, s.l, tw - 56).slice(0, 3).forEach((ln, k) => ctx.fillText(ln, x + 28, y + 170 + k * 40))
  })

  // frase finale
  e = entra(t, 4200)
  ctx.globalAlpha = e.alpha
  ctx.fillStyle = '#fff'
  ctx.font = '700 54px Gotham, Montserrat, sans-serif'
  let y = 1190 + e.dy
  ctx.fillText(`Gli immobili erano solo ${n.immobili}.`, PAD, y)
  const cercano = conta(Math.max(0, n.visitatori - n.immobili), t, 4600, 1100)
  y += 70
  ctx.font = '900 54px Gotham, Montserrat, sans-serif'
  ctx.fillStyle = AMBRA
  const num = String(cercano)
  ctx.fillText(num, PAD, y)
  const off = ctx.measureText(num + ' ').width
  ctx.font = '700 54px Gotham, Montserrat, sans-serif'
  ctx.fillStyle = '#fff'
  const resto = wrap(ctx, 'persone stanno ancora cercando casa.', W - PAD * 2 - off)
  ctx.fillText(resto[0], PAD + off, y)
  const rest2 = wrap(ctx, resto.slice(1).join(' '), W - PAD * 2)
  rest2.forEach(ln => { y += 70; ctx.fillText(ln, PAD, y) })

  // invito a vendere
  e = entra(t, 6000)
  ctx.globalAlpha = e.alpha
  const bh = 270
  const by = H - 96 - bh + e.dy
  roundRect(ctx, PAD, by, W - PAD * 2, bh, 44)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.fillStyle = BLU
  ctx.font = '900 52px Gotham, Montserrat, sans-serif'
  ctx.fillText('Vuoi vendere il tuo immobile?', PAD + 50, by + 95)
  ctx.font = '500 46px Gotham, Montserrat, sans-serif'
  ctx.fillText('Scrivici: 071 9257300', PAD + 50, by + 170)
  ctx.globalAlpha = e.alpha * 0.7
  ctx.font = '400 36px Gotham, Montserrat, sans-serif'
  ctx.fillText('ghergoimmobiliare.com', PAD + 50, by + 225)

  ctx.restore()
}
