// Feedback dopo la visita: domande, opzioni ammesse ed etichette (usate da pagina cliente, API, cruscotto e report)

export const ASPETTI: { value: string; label: string }[] = [
  { value: 'posizione', label: 'Posizione / zona' },
  { value: 'luminosita', label: 'Luminosità' },
  { value: 'spazi', label: 'Spazi e distribuzione' },
  { value: 'metratura', label: 'Metratura' },
  { value: 'stato', label: 'Stato e finiture' },
  { value: 'lavori', label: 'Lavori da fare' },
  { value: 'esterni', label: 'Esterni (terrazzo, giardino)' },
  { value: 'garage', label: 'Garage / posto auto' },
  { value: 'vista', label: 'Vista e affaccio' },
  { value: 'rumore', label: 'Rumore / contesto' },
  { value: 'condominio', label: 'Condominio / spese' },
  { value: 'prezzo', label: 'Prezzo' },
]

export const PREZZO: { value: string; label: string }[] = [
  { value: 'conveniente', label: 'Conveniente' },
  { value: 'giusto', label: 'Giusto' },
  { value: 'alto', label: 'Un po’ alto' },
  { value: 'troppo_alto', label: 'Troppo alto' },
]

export const PROSSIMO_PASSO: { value: string; label: string }[] = [
  { value: 'offerta', label: 'Voglio fare un’offerta' },
  { value: 'rivedere', label: 'Vorrei rivederlo' },
  { value: 'ci_penso', label: 'Ci devo pensare' },
  { value: 'non_interessato', label: 'Non fa per me' },
]

export const OFFERTA_QUANDO: { value: string; label: string }[] = [
  { value: 'oggi', label: 'Oggi stesso' },
  { value: 'domani_mattina', label: 'Domani mattina' },
  { value: 'domani_pomeriggio', label: 'Domani pomeriggio' },
  { value: 'questa_settimana', label: 'In settimana' },
  { value: 'chiamatemi', label: 'Chiamatemi per fissare' },
]

export interface FeedbackAnswers {
  voto: number
  prezzo: string
  piaciuto: string[]
  non_convinto: string[]
  prossimo_passo: string
}

const values = (list: { value: string }[]) => list.map(o => o.value)
export const labelOf = (list: { value: string; label: string }[], v?: string | null) =>
  list.find(o => o.value === v)?.label || ''

/** Valida le risposte del cliente. Ritorna null se manca qualcosa di obbligatorio. */
export function validateFeedback(input: unknown): FeedbackAnswers | null {
  if (!input || typeof input !== 'object') return null
  const s = input as Record<string, unknown>
  const voto = Number(s.voto)
  if (!Number.isInteger(voto) || voto < 1 || voto > 5) return null
  if (typeof s.prezzo !== 'string' || !values(PREZZO).includes(s.prezzo)) return null
  if (typeof s.prossimo_passo !== 'string' || !values(PROSSIMO_PASSO).includes(s.prossimo_passo)) return null
  const list = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && values(ASPETTI).includes(x)))] : []
  const piaciuto = list(s.piaciuto)
  const non_convinto = list(s.non_convinto)
  return { voto, prezzo: s.prezzo, piaciuto, non_convinto, prossimo_passo: s.prossimo_passo }
}

export const isOffertaQuando = (v: unknown): v is string => typeof v === 'string' && values(OFFERTA_QUANDO).includes(v)
