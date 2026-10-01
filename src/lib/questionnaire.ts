// Risposte ammesse nel questionario di prenotazione (devono coincidere con le opzioni della pagina pubblica)
export const QUESTIONNAIRE_ALLOWED: Record<string, string[]> = {
  vendita_immobile: ['no', 'si_in_vendita', 'si_non_in_vendita', 'si_posso_acquistare_prima'],
  necessita_mutuo: ['no', 'si_parziale', 'si_maggior_parte'],
  stato_mutuo: ['pre_delibera', 'simulazione', 'appuntamento', 'non_informato', 'ricontatto_consulente', 'non_richiedo'],
  tempistiche_acquisto: ['entro_30_giorni', 'entro_3_mesi', 'entro_6_mesi', 'oltre_6_mesi', 'solo_valutando'],
  corrispondenza_immobile: ['100_percento', '80_90_percento', 'parzialmente', 'no_altro'],
}

/** Ritorna le risposte validate, oppure null se manca o è errata qualche risposta. */
export function validateQuestionnaire(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== 'object') return null
  const src = input as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [key, values] of Object.entries(QUESTIONNAIRE_ALLOWED)) {
    let v = src[key]
    // chi compra senza mutuo non vede la domanda sulla banca
    if (key === 'stato_mutuo' && src.necessita_mutuo === 'no') v = 'non_richiedo'
    if (typeof v !== 'string' || !values.includes(v)) return null
    out[key] = v
  }
  return out
}
