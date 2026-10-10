// Invio di un messaggio WhatsApp con immagine:
// - sul telefono: condivisione di immagine + testo (si sceglie la chat su WhatsApp)
// - sul computer: scarica l'immagine e apre la chat del cliente con il testo pronto (l'immagine si trascina nella chat)
// Ritorna 'condiviso' | 'scaricato'; lancia AbortError se l'utente annulla.

export const waNumber = (phone: string) => {
  let c = String(phone || '').replace(/\D/g, '')
  if (c && !c.startsWith('39')) c = '39' + c
  return c
}

export async function inviaWhatsApp(phone: string, testo: string, immagine: Blob, nomeFile: string): Promise<'condiviso' | 'scaricato'> {
  const file = new File([immagine], nomeFile, { type: immagine.type || 'image/jpeg' })
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
  if (mobile && navigator.canShare?.({ files: [file] })) {
    await navigator.clipboard?.writeText(testo).catch(() => undefined)
    await navigator.share({ files: [file], text: testo })
    return 'condiviso'
  }
  const url = URL.createObjectURL(immagine)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeFile
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  window.open(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(testo)}`, '_blank')
  return 'scaricato'
}
