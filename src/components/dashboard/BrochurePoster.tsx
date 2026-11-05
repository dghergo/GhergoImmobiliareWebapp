'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { sized } from '@/lib/img'
import { niceText } from '@/lib/text'

// Cartello A4 da stampare e mettere all'ingresso dell'immobile:
// foto di sfondo e QR code che apre (e fa scaricare) la brochure.

export interface PosterProperty {
  titolo: string
  zona: string | null
  indirizzo: string | null
  immagini: string[] | null
  brochure_url: string | null
}

// A4 verticale a 200 dpi
const W = 1654
const H = 2339
const BLU = '#1C3867'
const DEEP = '#111A38'
const SKY = '#00AEEF'
const FONT = 'Gotham, Montserrat, Helvetica, Arial, sans-serif'

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w } else line = test
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines)
    cut[maxLines - 1] = cut[maxLines - 1].replace(/\s+\S*$/, '') + '…'
    return cut
  }
  return lines
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

async function drawPoster(canvas: HTMLCanvasElement, p: PosterProperty, photo: string | null) {
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  await Promise.all(['900 80px Gotham', '700 40px Gotham', '500 40px Gotham', '400 40px Gotham'].map(f => document.fonts.load(f))).catch(() => undefined)

  ctx.fillStyle = DEEP
  ctx.fillRect(0, 0, W, H)

  // foto a tutta pagina
  if (photo) {
    try {
      const img = await loadImage(sized(photo, 2000, 88))
      const scale = Math.max(W / img.width, H / img.height)
      const dw = img.width * scale, dh = img.height * scale
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
    } catch { /* senza foto resta il fondo blu */ }
  }
  // sfumature per leggere i testi
  let g = ctx.createLinearGradient(0, 0, 0, 560)
  g.addColorStop(0, 'rgba(17,26,56,.85)')
  g.addColorStop(1, 'rgba(17,26,56,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, 560)
  g = ctx.createLinearGradient(0, H * 0.28, 0, H)
  g.addColorStop(0, 'rgba(17,26,56,0)')
  g.addColorStop(0.18, 'rgba(17,26,56,.72)')
  g.addColorStop(0.4, 'rgba(17,26,56,.9)')
  g.addColorStop(1, 'rgba(17,26,56,.97)')
  ctx.fillStyle = g
  ctx.fillRect(0, H * 0.28, W, H * 0.72)

  // logo
  try {
    const logo = await loadImage('/logo-ghergo-bianco.png')
    const lw = 460
    ctx.drawImage(logo, 110, 110, lw, (logo.height / logo.width) * lw)
  } catch { /* logo facoltativo */ }

  // etichetta OPEN HOUSE
  ctx.font = `700 40px ${FONT}`
  ctx.textBaseline = 'middle'
  const tag = 'OPEN HOUSE'
  ctx.letterSpacing = '8px'
  const tw = ctx.measureText(tag).width + 80
  roundRect(ctx, W - 110 - tw, 118, tw, 92, 46)
  ctx.fillStyle = SKY
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.fillText(tag, W - 110 - tw + 40, 166)
  ctx.letterSpacing = '0px'

  // titolo e zona
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = 24
  ctx.font = `900 104px ${FONT}`
  const lines = wrap(ctx, niceText(p.titolo), W - 220, 2)
  let y = 960
  lines.forEach(l => { ctx.fillText(l, W / 2, y); y += 118 })
  const zona = [p.zona ? niceText(p.zona) : '', p.indirizzo && !niceText(p.titolo).includes(p.indirizzo) ? p.indirizzo : ''].filter(Boolean).join(' · ')
  if (zona) {
    ctx.font = `500 50px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,.85)'
    ctx.fillText(zona.charAt(0).toUpperCase() + zona.slice(1), W / 2, y + 6)
  }
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  // riquadro bianco con il QR
  const qrSize = 540
  const cardW = 1120, cardH = 880
  const cx = (W - cardW) / 2, cy = 1270
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.35)'
  ctx.shadowBlur = 50
  ctx.shadowOffsetY = 18
  roundRect(ctx, cx, cy, cardW, cardH, 48)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = BLU
  ctx.font = `900 76px ${FONT}`
  ctx.fillText('SCARICA LA BROCHURE', W / 2, cy + 120)
  ctx.font = `500 42px ${FONT}`
  ctx.fillStyle = '#4A5872'
  ctx.fillText('Planimetrie, foto e tutti i dettagli', W / 2, cy + 184)

  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, p.brochure_url || '', { width: qrSize, margin: 0, errorCorrectionLevel: 'M', color: { dark: BLU, light: '#ffffff' } })
  ctx.drawImage(qr, (W - qrSize) / 2, cy + 226, qrSize, qrSize)

  // freccia e invito
  ctx.font = `700 40px ${FONT}`
  ctx.fillStyle = BLU
  ctx.fillText('Inquadra il QR code con la fotocamera del telefono', W / 2, cy + cardH - 44)

  // piede
  ctx.font = `500 40px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,.8)'
  ctx.fillText('Ghergo Immobiliare  ·  Sogna, Realizza, Abita', W / 2, H - 90)
  ctx.textAlign = 'left'
}

export default function BrochurePoster({ property, onClose }: { property: PosterProperty; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const photos = (property.immagini || []).slice(0, 12)
  const [photo, setPhoto] = useState<string | null>(photos[0] || null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!canvasRef.current || !property.brochure_url) return
      await drawPoster(canvasRef.current, property, photo)
      if (alive) setBusy(false)
    })()
    return () => { alive = false }
  }, [property, photo])

  const fileName = `cartello-brochure-${niceText(property.titolo).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.png`

  const download = () => {
    canvasRef.current?.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    }, 'image/png')
  }

  // stampa su A4 a pagina intera, senza margini
  const print = () => {
    const data = canvasRef.current?.toDataURL('image/png')
    if (!data) return
    const frame = document.createElement('iframe')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(frame)
    const doc = frame.contentDocument!
    doc.open()
    doc.write('<!doctype html><html><head><title>Cartello brochure</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0}img{width:210mm;height:297mm;display:block;object-fit:cover}</style></head><body><img id="p"></body></html>')
    doc.close()
    const img = doc.getElementById('p') as HTMLImageElement
    img.onload = () => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      setTimeout(() => frame.remove(), 60000)
    }
    img.src = data
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-6" onClick={onClose}>
      <div className="bg-white w-full md:max-w-3xl max-h-[95vh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-4 md:p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold" style={{ color: 'var(--primary-blue)' }}>Cartello brochure da stampare</h2>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="Chiudi">×</button>
        </div>
        {!property.brochure_url ? (
          <p className="text-sm" style={{ color: 'var(--text-gray)' }}>Per questo immobile non è ancora caricata una brochure: caricala nella scheda dell&apos;immobile e il cartello sarà pronto.</p>
        ) : (
          <div className="grid md:grid-cols-[280px_1fr] gap-5">
            <div className="relative mx-auto" style={{ width: 260 }}>
              <canvas ref={canvasRef} className="w-full rounded-lg shadow" style={{ aspectRatio: '210 / 297', background: DEEP }} />
              {busy && <div className="absolute inset-0 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" /></div>}
            </div>
            <div className="text-sm space-y-4">
              {photos.length > 1 && (
                <div>
                  <div className="font-semibold mb-2" style={{ color: 'var(--text-dark)' }}>Scegli la foto di sfondo</div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {photos.map(p => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p} src={sized(p, 200, 70)} alt="" onClick={() => { if (p !== photo) { setBusy(true); setPhoto(p) } }}
                        className={`aspect-square object-cover rounded cursor-pointer ${photo === p ? 'ring-2 ring-offset-1 ring-sky-500' : 'opacity-80 hover:opacity-100'}`} />
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={print} disabled={busy} className="btn-primary py-3 font-semibold disabled:opacity-50">🖨️ Stampa A4</button>
                <button onClick={download} disabled={busy} className="py-3 rounded-lg font-semibold bg-gray-100 text-gray-800 disabled:opacity-50">⬇ Scarica immagine</button>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-gray)' }}>
                Inquadrando il QR code il telefono apre la brochure, che si può scaricare. Prima di stamparlo, provalo con il tuo telefono.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
