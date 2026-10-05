// Il titolo dell'immobile non lo scrive l'agente: è sempre "Comune, Via e civico" (+ interno se serve).
// Così due immobili non avranno mai lo stesso titolo e sulla pagina pubblica sono tutti uguali nello stile.

const MINUSCOLE = new Set(['a', 'al', 'alla', 'alle', 'ai', 'agli', 'da', 'dal', 'dalla', 'de', 'dei', 'del', 'della', 'delle', 'degli', 'di', 'e', 'in', 'sul', 'sulla'])

/** "via michelangelo 120d" / "VIA MICHELANGELO 120D" → "Via Michelangelo 120D" */
function capitalizza(input?: string | null) {
  return (input || '')
    .trim()
    .replace(/\s*,\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w, i) => {
      if (/\d/.test(w)) return w.toUpperCase() // civico: 120D, 29/L
      const low = w.toLowerCase()
      if (i > 0 && MINUSCOLE.has(low)) return low
      // apostrofi: d'ancona → D'Ancona
      return low.replace(/(^|['’-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase())
    })
    .join(' ')
}

export const haCivico = (indirizzo: string) => /\d/.test(indirizzo)

export function titoloImmobile(p: { comune?: string | null; indirizzo?: string | null; interno?: string | null }) {
  const comune = capitalizza(p.comune)
  const via = capitalizza(p.indirizzo)
  const interno = (p.interno || '').trim().toUpperCase()
  if (!comune || !via) return ''
  return `${comune}, ${via}${interno ? ` – int. ${interno}` : ''}`
}

/** indirizzo pulito da salvare insieme al titolo */
export const indirizzoPulito = (v?: string | null) => capitalizza(v)
