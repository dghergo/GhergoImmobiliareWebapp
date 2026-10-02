// Foto alleggerite: Supabase ridimensiona e comprime l'immagine al volo (e la tiene in cache),
// così il telefono scarica poche centinaia di KB invece dell'originale da 10 MB.
export function sized(url: string | null | undefined, width: number, quality = 72): string {
  if (!url) return ''
  if (!url.includes('/storage/v1/object/public/')) return url
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  return `${base}${base.includes('?') ? '&' : '?'}width=${width}&quality=${quality}`
}

/** Riduce una foto prima del caricamento (lato più lungo max 2400 px, JPEG di buona qualità). */
export async function compressForUpload(file: File, maxSide = 2400, quality = 0.84): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
