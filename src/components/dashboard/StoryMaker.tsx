'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { sized } from '@/lib/img'
import { niceText } from '@/lib/text'

// Immagine verticale per le storie Instagram/Facebook (1080x1920) con foto, data, prezzo e QR per prenotare.
// Il link cliccabile si aggiunge su Instagram con lo sticker "Link" nello spazio lasciato libero.

export interface StoryOpenHouse {
  id: string
  data_evento: string
  ora_inizio: string
  ora_fine: string
  property: { titolo: string; zona: string; prezzo: number | null; immagini: string[] | null; caratteristiche?: { mq?: number; locali?: number; bagni?: number; cantiere?: boolean } | null }
}

const W = 1080
const H = 1920
const BLU = '#203162'
const DEEP = '#111A38'
const SKY = '#00AEEF'

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

async function drawStory(canvas: HTMLCanvasElement, oh: StoryOpenHouse, photo: string | null, link: string) {
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  await Promise.all([
    document.fonts.load('900 80px Gotham'),
    document.fonts.load('700 40px Gotham'),
    document.fonts.load('500 40px Gotham'),
    document.fonts.load('400 40px Gotham'),
  ]).catch(() => undefined)

  // Sfondo
  ctx.fillStyle = DEEP
  ctx.fillRect(0, 0, W, H)

  // Foto (taglio "cover") nella parte alta
  const photoH = 1160
  if (photo) {
    try {
      const img = await loadImage(sized(photo, 1600, 88))
      const scale = Math.max(W / img.width, photoH / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      ctx.drawImage(img, (W - dw) / 2, (photoH - dh) / 2, dw, dh)
    } catch {
      // senza foto resta lo sfondo blu
    }
  }
  // sfumature per leggere i testi
  let g = ctx.createLinearGradient(0, 0, 0, 460)
  g.addColorStop(0, 'rgba(17,26,56,.75)')
  g.addColorStop(1, 'rgba(17,26,56,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, 460)
  g = ctx.createLinearGradient(0, photoH - 620, 0, photoH)
  g.addColorStop(0, 'rgba(17,26,56,0)')
  g.addColorStop(1, 'rgba(17,26,56,1)')
  ctx.fillStyle = g
  ctx.fillRect(0, photoH - 620, W, 620)

  // Logo
  try {
    const logo = await loadImage('/logo-ghergo-bianco.png')
    const lw = 300
    ctx.drawImage(logo, 72, 196, lw, (logo.height / logo.width) * lw)
  } catch { /* logo facoltativo */ }

  // Etichetta OPEN HOUSE
  ctx.font = '700 34px Gotham, Helvetica, Arial, sans-serif'
  const tag = 'OPEN HOUSE'
  ctx.letterSpacing = '6px'
  const tw = ctx.measureText(tag).width + 56
  roundRect(ctx, W - 72 - tw, 200, tw, 70, 35)
  ctx.fillStyle = SKY
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.fillText(tag, W - 72 - tw + 28, 236)
  ctx.letterSpacing = '0px'

  // Data in evidenza
  const d = new Date(oh.data_evento + 'T12:00:00')
  const giorno = String(d.getDate())
  const mese = d.toLocaleDateString('it-IT', { month: 'long' }).toUpperCase()
  const weekday = d.toLocaleDateString('it-IT', { weekday: 'long' })
  const orario = `${oh.ora_inizio.slice(0, 5)} – ${oh.ora_fine.slice(0, 5)}`
  const by = 740
  roundRect(ctx, 72, by, 220, 230, 32)
  ctx.fillStyle = SKY
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.font = '900 128px Gotham, Helvetica, Arial, sans-serif'
  ctx.fillText(giorno, 72 + 110, by + 100)
  ctx.font = '700 34px Gotham, Helvetica, Arial, sans-serif'
  ctx.fillText(mese.slice(0, 3), 72 + 110, by + 190)
  ctx.textAlign = 'left'
  ctx.font = '500 44px Gotham, Helvetica, Arial, sans-serif'
  ctx.fillText(weekday.charAt(0).toUpperCase() + weekday.slice(1) + ' ' + giorno + ' ' + mese.toLowerCase(), 330, by + 80)
  ctx.font = '900 64px Gotham, Helvetica, Arial, sans-serif'
  ctx.fillText(orario, 330, by + 155)

  // Titolo
  ctx.textBaseline = 'alphabetic'
  ctx.font = '900 76px Gotham, Helvetica, Arial, sans-serif'
  const lines = wrap(ctx, niceText(oh.property.titolo), W - 144, 3)
  let y = 1110
  lines.forEach(l => { ctx.fillText(l, 72, y); y += 86 })

  // Zona, dettagli, prezzo
  const c = oh.property.caratteristiche || {}
  const dettagli = [c.mq ? `${c.mq} m²` : '', c.locali ? `${c.locali} locali` : '', c.bagni ? `${c.bagni} bagni` : ''].filter(Boolean).join('  ·  ')
  ctx.font = '400 42px Gotham, Helvetica, Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,.82)'
  ctx.fillText([niceText(oh.property.zona), dettagli].filter(Boolean).join('  ·  '), 72, y + 4)
  if (oh.property.prezzo) {
    ctx.font = '700 58px Gotham, Helvetica, Arial, sans-serif'
    ctx.fillStyle = SKY
    ctx.fillText(`${c.cantiere ? 'da ' : ''}€ ${oh.property.prezzo.toLocaleString('it-IT')}`, 72, y + 84)
    y += 84
  }

  // Invito a prenotare + spazio per lo sticker link
  const cy = Math.max(1440, y + 100)
  ctx.fillStyle = '#fff'
  ctx.font = '900 56px Gotham, Helvetica, Arial, sans-serif'
  ctx.fillText('Prenota la tua visita', 72, cy)
  ctx.font = '400 36px Gotham, Helvetica, Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,.75)'
  ctx.fillText('Posti limitati · scegli il tuo orario', 72, cy + 56)

  // QR in basso a destra
  // fuori dalle zone coperte da Instagram (in alto il nome, in basso il campo risposta)
  const qrSize = 220
  const qx = W - 72 - qrSize
  const qy = cy - 90
  roundRect(ctx, qx - 18, qy - 18, qrSize + 36, qrSize + 36, 28)
  ctx.fillStyle = '#fff'
  ctx.fill()
  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, link, { width: qrSize, margin: 0, color: { dark: BLU, light: '#ffffff' } })
  ctx.drawImage(qr, qx, qy, qrSize, qrSize)
  ctx.font = '500 26px Gotham, Helvetica, Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,.75)'
  ctx.textAlign = 'right'
  ctx.fillText('Inquadra per prenotare', W - 72, qy + qrSize + 56)
  ctx.textAlign = 'left'
}

export default function StoryMaker({ oh, link, onClose }: { oh: StoryOpenHouse; link: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const photos = (oh.property.immagini || []).slice(0, 12)
  const [photo, setPhoto] = useState<string | null>(photos[0] || null)
  const [busy, setBusy] = useState(true)
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!canvasRef.current) return
      await drawStory(canvasRef.current, oh, photo, link)
      if (alive) setBusy(false)
    })()
    return () => { alive = false }
  }, [oh, photo, link])

  const choose = (p: string) => {
    if (p === photo) return
    setBusy(true)
    setPhoto(p)
  }

  const fileName = `storia-open-house-${niceText(oh.property.titolo).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.png`

  const toBlob = () => new Promise<Blob | null>(res => canvasRef.current!.toBlob(res, 'image/png'))

  const download = async () => {
    const blob = await toBlob()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const share = async () => {
    const blob = await toBlob()
    if (!blob) return
    const file = new File([blob], fileName, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }) } catch { /* annullato */ }
    } else download()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copia il link:', link)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-6" onClick={onClose}>
      <div className="bg-white w-full md:max-w-3xl max-h-[95vh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-4 md:p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold" style={{ color: 'var(--primary-blue)' }}>Storia Instagram</h2>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="Chiudi">×</button>
        </div>
        <div className="grid md:grid-cols-[260px_1fr] gap-5">
          <div className="relative mx-auto" style={{ width: 240 }}>
            <canvas ref={canvasRef} className="w-full rounded-xl shadow" style={{ aspectRatio: '9 / 16', background: DEEP }} />
            {busy && <div className="absolute inset-0 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" /></div>}
          </div>
          <div className="text-sm space-y-4">
            {photos.length > 1 && (
              <div>
                <div className="font-semibold mb-2" style={{ color: 'var(--text-dark)' }}>Scegli la foto</div>
                <div className="grid grid-cols-6 gap-1.5">
                  {photos.map(p => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p} src={sized(p, 200, 70)} alt="" onClick={() => choose(p)}
                      className={`aspect-square object-cover rounded cursor-pointer ${photo === p ? 'ring-2 ring-offset-1 ring-sky-500' : 'opacity-80 hover:opacity-100'}`} />
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={canShare ? share : download} disabled={busy} className="btn-primary py-3 font-semibold disabled:opacity-50">
                {canShare ? '📲 Salva / Condividi' : '⬇ Scarica immagine'}
              </button>
              <button onClick={copy} className="py-3 rounded-lg font-semibold bg-gray-100 text-gray-800">
                {copied ? '✓ Link copiato' : '🔗 Copia link'}
              </button>
            </div>
            <ol className="list-decimal ml-5 space-y-1" style={{ color: 'var(--text-gray)' }}>
              <li>Salva l’immagine e premi <b>Copia link</b>.</li>
              <li>Su Instagram crea una <b>storia</b> con l’immagine.</li>
              <li>Tocca l’icona degli sticker, scegli <b>“Link”</b> e incolla.</li>
              <li>Metti lo sticker sotto “Prenota la tua visita”, a sinistra del QR.</li>
            </ol>
            <p className="text-xs" style={{ color: 'var(--text-gray)' }}>
              Il link è il tuo: chi prenota ti trova già come agente di riferimento. Anche il QR porta allo stesso link.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
