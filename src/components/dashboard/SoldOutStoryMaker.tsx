'use client'

import { useEffect, useRef, useState } from 'react'
import { sized } from '@/lib/img'
import { niceText } from '@/lib/text'
import { drawSoldOutStory, STORY_H, STORY_W } from '@/lib/story-soldout'

// Storia Instagram/Facebook per celebrare un Open House andato Sold Out.

export interface SoldOutStoryInfo {
  titolo: string
  zona: string
  immagini: string[]
  prenotati: number
  giorni: number | null
}

const DEEP = '#111A38'

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

export default function SoldOutStoryMaker({ info, onClose }: { info: SoldOutStoryInfo; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const photos = info.immagini.slice(0, 12)
  const [photo, setPhoto] = useState<string | null>(photos[0] || null)
  const [busy, setBusy] = useState(true)
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator

  useEffect(() => {
    let alive = true
    ;(async () => {
      const canvas = canvasRef.current
      if (!canvas) return
      await Promise.all(['900 80px Gotham', '700 40px Gotham', '400 40px Gotham'].map(f => document.fonts.load(f))).catch(() => undefined)
      const [img, logo] = await Promise.all([
        photo ? loadImage(sized(photo, 1600, 88)).catch(() => null) : Promise.resolve(null),
        loadImage('/logo-ghergo-bianco.png').catch(() => null),
      ])
      if (!alive) return
      canvas.width = STORY_W
      canvas.height = STORY_H
      drawSoldOutStory(canvas.getContext('2d')!, { titolo: niceText(info.titolo), zona: niceText(info.zona), prenotati: info.prenotati, giorni: info.giorni }, img, logo)
      setBusy(false)
    })()
    return () => { alive = false }
  }, [info, photo])

  const choose = (p: string) => {
    if (p === photo) return
    setBusy(true)
    setPhoto(p)
  }

  const fileName = `sold-out-${niceText(info.titolo).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.png`
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

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end md:items-center justify-center p-0 md:p-6" onClick={onClose}>
      <div className="bg-white w-full md:max-w-3xl max-h-[95vh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-4 md:p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold" style={{ color: 'var(--primary-blue)' }}>Storia Sold Out</h2>
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
            <button onClick={canShare ? share : download} disabled={busy} className="btn-primary w-full py-3 font-semibold disabled:opacity-50">
              {canShare ? '📲 Salva / Condividi' : '⬇ Scarica immagine'}
            </button>
            <ol className="list-decimal ml-5 space-y-1" style={{ color: 'var(--text-gray)' }}>
              <li>Salva l&apos;immagine.</li>
              <li>Pubblicala come <b>storia</b> su Instagram e Facebook, anche sul tuo profilo personale.</li>
              <li>Tagga <b>Ghergo Immobiliare</b> così la condividiamo anche dalla pagina dell&apos;agenzia.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
