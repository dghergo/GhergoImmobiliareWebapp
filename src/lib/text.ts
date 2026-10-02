// Uniforma i testi scritti dagli agenti (es. "APPARTAMENTO OSIMO", "VESCOVARA") così hanno sempre lo stesso aspetto.
const SMALL = new Set(['a', 'al', 'alla', 'alle', 'ai', 'agli', 'con', 'da', 'dal', 'dalla', 'de', 'dei', 'del', 'della', 'delle', 'di', 'e', 'ed', 'in', 'nel', 'nella', 'o', 'per', 'su', 'sul', 'sulla', 'tra', 'fra'])

export function niceText(input?: string | null): string {
  const s = (input || '').trim().replace(/\s+/g, ' ')
  if (!s) return ''
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '')
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, '').length
  // Se è scritto quasi tutto in maiuscolo, lo trasformo in "Iniziali Maiuscole"
  if (letters.length > 0 && upper / letters.length > 0.7) {
    return s
      .toLowerCase()
      .split(' ')
      .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ')
  }
  return s.charAt(0).toUpperCase() + s.slice(1)
}
