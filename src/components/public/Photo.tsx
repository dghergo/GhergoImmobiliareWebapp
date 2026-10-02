'use client'

import { ImgHTMLAttributes, useState } from 'react'
import { sized } from '@/lib/img'

// Foto alleggerita con ripiego automatico sull'originale se il ridimensionamento non è disponibile
export default function Photo({ src, width, quality, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string; width: number; quality?: number }) {
  const [fallback, setFallback] = useState(false)
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      {...rest}
      src={fallback ? src : sized(src, width, quality)}
      decoding="async"
      onError={() => { if (!fallback) setFallback(true) }}
    />
  )
}
