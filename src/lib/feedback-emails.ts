import { sendEmail } from './gmail'
import { niceText } from './text'
import { ASPETTI, OFFERTA_QUANDO, PREZZO, PROSSIMO_PASSO, labelOf, type FeedbackAnswers } from './feedback'

// Email del feedback: richiesta al cliente (a nome del suo agente) e avvisi immediati all'agente.

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://openhouse.ghergoimmobiliare.com'
const BLU = '#203162'
const SKY = '#00AEEF'

const wa = (phone: string) => {
  let c = String(phone || '').replace(/\D/g, '')
  if (c && !c.startsWith('39')) c = '39' + c
  return c
}

const shell = (inner: string) => `
<div style="font-family: Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
  <div style="background:${BLU}; color:#fff; padding:18px 24px; border-radius: 12px 12px 0 0;">
    <div style="font-weight:800; letter-spacing:.08em; font-size:15px;">GHERGO IMMOBILIARE</div>
  </div>
  <div style="padding:24px; background:#f8fafc; border-radius: 0 0 12px 12px;">${inner}</div>
</div>`

interface Person { nome: string; cognome: string; email?: string; telefono?: string }
interface Property { titolo: string; zona?: string; indirizzo?: string | null }

/** Richiesta di feedback al cliente, firmata dal suo agente e inviata dalla sua casella. */
export function feedbackRequestEmail(p: { client: Person; agent: Person; property: Property; bookingId: string }) {
  const link = `${SITE()}/feedback/${p.bookingId}`
  const luogo = p.property.indirizzo || p.property.zona || ''
  const stelle = [1, 2, 3, 4, 5]
    .map(n => `<a href="${link}?voto=${n}" style="display:inline-block; text-decoration:none; font-size:30px; line-height:1; color:#f59e0b; padding:0 3px;">★</a>`)
    .join('')
  return {
    subject: `${p.agent.nome} di Ghergo Immobiliare – com'è andata la visita${luogo ? ` in ${luogo}` : ''}?`,
    html: shell(`
      <p>Ciao <strong>${esc(p.client.nome)}</strong>,</p>
      <p>grazie per essere venuto a vedere <strong>${esc(niceText(p.property.titolo))}</strong>${luogo ? ` (${esc(luogo)})` : ''}.</p>
      <div style="background:#FEF3C7; border:2px solid #F59E0B; border-radius:14px; padding:20px; margin:22px 0; text-align:center;">
        <div style="font-size:20px; font-weight:800; color:${BLU};">🔑 La casa ti è piaciuta?</div>
        <div style="font-size:15px; margin:8px 0 16px; color:#374151;">Prenota subito il tuo appuntamento in ufficio per fare un'offerta.</div>
        <a href="${link}?passo=offerta" style="background:${BLU}; color:#fff; padding:15px 30px; text-decoration:none; border-radius:999px; display:inline-block; font-weight:800; font-size:16px;">Voglio fare un'offerta</a>
      </div>
      <p>Altrimenti, mi aiuti con <strong>30 secondi</strong>? Bastano pochi tocchi: le tue impressioni servono a me e ai proprietari.</p>
      <div style="text-align:center; background:#fff; border-radius:12px; padding:18px; margin:22px 0;">
        <div style="font-size:14px; color:#6b7280; margin-bottom:8px;">Che voto dai all'immobile?</div>
        <div>${stelle}</div>
      </div>
      <div style="text-align:center; margin: 8px 0 22px;">
        <a href="${link}" style="background:${SKY}; color:#fff; padding:14px 30px; text-decoration:none; border-radius:999px; display:inline-block; font-weight:700;">Rispondi in 30 secondi</a>
      </div>
      <p>A presto,<br><strong>${esc(p.agent.nome)} ${esc(p.agent.cognome)}</strong><br><span style="color:#6b7280;">Ghergo Immobiliare</span></p>
    `),
  }
}

const row = (k: string, v: string) =>
  v ? `<tr><td style="padding:6px 0; color:#6b7280; width:150px; vertical-align:top;">${k}</td><td style="padding:6px 0;"><strong>${v}</strong></td></tr>` : ''

/** Avviso immediato all'agente quando il cliente vuole fare un'offerta o rivedere l'immobile. */
export function agentAlertEmail(p: {
  client: Person; agent: Person; property: Property; answers: FeedbackAnswers; commenti: string; quando: string | null
}) {
  const offerta = p.answers.prossimo_passo === 'offerta'
  const tel = p.client.telefono || ''
  const titolo = offerta ? '🔥 OFFERTA' : '🔁 Vuole rivederlo'
  const azioni = `
    <div style="margin:18px 0;">
      ${tel ? `<a href="tel:${esc(tel)}" style="background:${BLU}; color:#fff; padding:12px 20px; border-radius:999px; text-decoration:none; display:inline-block; font-weight:700; margin:0 6px 6px 0;">📞 Chiama ${esc(tel)}</a>` : ''}
      ${tel ? `<a href="https://wa.me/${wa(tel)}" style="background:#16a34a; color:#fff; padding:12px 20px; border-radius:999px; text-decoration:none; display:inline-block; font-weight:700; margin:0 6px 6px 0;">💬 WhatsApp</a>` : ''}
    </div>`
  return {
    subject: `${titolo} – ${p.client.nome} ${p.client.cognome} per ${niceText(p.property.titolo)}`,
    html: shell(`
      <div style="background:${offerta ? '#fef3c7' : '#e0f2fe'}; border-left:4px solid ${offerta ? '#f59e0b' : SKY}; padding:14px 16px; border-radius:8px; margin-bottom:16px;">
        <div style="font-size:18px; font-weight:800;">${titolo}</div>
        <div style="margin-top:4px;">${offerta
          ? `<strong>${esc(p.client.nome)} ${esc(p.client.cognome)}</strong> vuole fare un'offerta per <strong>${esc(niceText(p.property.titolo))}</strong>. Fissa subito l'appuntamento in ufficio.`
          : `<strong>${esc(p.client.nome)} ${esc(p.client.cognome)}</strong> vorrebbe rivedere <strong>${esc(niceText(p.property.titolo))}</strong>.`}</div>
      </div>
      ${azioni}
      <table style="width:100%; border-collapse:collapse; background:#fff; border-radius:8px; padding:8px 14px;">
        ${row('Può passare', esc(labelOf(OFFERTA_QUANDO, p.quando)))}
        ${row('Telefono', esc(tel))}
        ${row('Email', esc(p.client.email))}
        ${row('Voto', '★'.repeat(p.answers.voto) + '☆'.repeat(5 - p.answers.voto))}
        ${row('Prezzo', esc(labelOf(PREZZO, p.answers.prezzo)))}
        ${row('Gli è piaciuto', esc(p.answers.piaciuto.map(v => labelOf(ASPETTI, v)).join(', ')))}
        ${row('Non lo convince', esc(p.answers.non_convinto.map(v => labelOf(ASPETTI, v)).join(', ')))}
        ${row('Prossimo passo', esc(labelOf(PROSSIMO_PASSO, p.answers.prossimo_passo)))}
      </table>
      ${p.commenti ? `<p style="background:#fff; padding:12px 14px; border-radius:8px; font-style:italic; white-space:pre-line;">“${esc(p.commenti)}”</p>` : ''}
      <p style="font-size:13px; color:#6b7280;">La richiesta resta in evidenza nel cruscotto dell'Open House finché non la segni come gestita.</p>
    `),
  }
}

/** Invia dalla casella dell'agente; se non disponibile, dalla casella dell'agenzia. */
type Attachment = { filename: string; content: Buffer; contentType: string }
export async function sendAsAgent(to: string, mail: { subject: string; html: string; attachments?: Attachment[] }, agentId?: string | null) {
  try {
    return await sendEmail({ to, subject: mail.subject, html: mail.html, attachments: mail.attachments, agentId: agentId || undefined })
  } catch (e) {
    if (!agentId) throw e
    console.error('Invio dalla casella dell\'agente non riuscito, uso quella dell\'agenzia:', e)
    return await sendEmail({ to, subject: mail.subject, html: mail.html, attachments: mail.attachments })
  }
}

const quandoGiorno = (dataEvento: string) => {
  const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date())
  const domani = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(Date.now() + 86400000))
  if (dataEvento === oggi) return 'oggi'
  if (dataEvento === domani) return 'domani'
  return new Date(dataEvento + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}
export { quandoGiorno }

/** Promemoria dell'appuntamento con la brochure aggiornata, a nome dell'agente. */
export function reminderEmail(p: {
  client: Person; agent: Person & { email?: string }; property: Property & { brochure_url?: string | null }
  dataEvento: string; ora: string | null
}) {
  const giorno = quandoGiorno(p.dataEvento)
  const ora = p.ora ? p.ora.slice(0, 5) : ''
  const luogo = [p.property.indirizzo, p.property.zona].filter(Boolean).join(', ')
  const maps = luogo ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(luogo)}` : ''
  return {
    subject: `Promemoria: ti aspettiamo ${giorno}${ora ? ` alle ${ora}` : ''} – ${niceText(p.property.titolo)}`,
    html: shell(`
      <p>Ciao <strong>${esc(p.client.nome)}</strong>,</p>
      <p>ti ricordo l'appuntamento per l'Open House di <strong>${esc(niceText(p.property.titolo))}</strong>.</p>
      <div style="background:#fff; border-radius:12px; padding:18px; margin:18px 0; border-left:4px solid ${SKY};">
        <div style="font-size:20px; font-weight:800; color:${BLU};">${esc(giorno.charAt(0).toUpperCase() + giorno.slice(1))}${ora ? ` alle ${esc(ora)}` : ''}</div>
        ${luogo ? `<div style="margin-top:6px;">📍 ${esc(luogo)}${maps ? ` · <a href="${maps}" style="color:${SKY};">Apri la mappa</a>` : ''}</div>` : ''}
      </div>
      ${p.property.brochure_url ? `
      <div style="background:${BLU}; color:#fff; border-radius:14px; padding:20px; margin:18px 0; text-align:center;">
        <div style="font-size:18px; font-weight:800;">📄 La brochure completa dell'immobile</div>
        <div style="font-size:14px; opacity:.85; margin:6px 0 14px;">Planimetrie, foto e tutti i dettagli: dacci un'occhiata prima della visita.</div>
        <a href="${esc(p.property.brochure_url)}" style="background:${SKY}; color:#fff; padding:13px 28px; text-decoration:none; border-radius:999px; display:inline-block; font-weight:800;">Scarica la brochure</a>
      </div>` : ''}
      <p>Se hai un imprevisto o vuoi cambiare orario, rispondi a questa email o scrivimi.</p>
      <p>A presto,<br><strong>${esc(p.agent.nome)} ${esc(p.agent.cognome)}</strong><br><span style="color:#6b7280;">Ghergo Immobiliare</span></p>
    `),
  }
}

/**
 * Avviso di nuova prenotazione.
 * ruolo 'organizzatore': all'agente che gestisce l'Open House (con indicazione del collega che ha portato il cliente)
 * ruolo 'referente': all'agente scelto dal cliente / dal cui link è arrivata la prenotazione
 */
export function bookingAlertEmail(p: {
  ruolo: 'organizzatore' | 'referente'
  stessoAgente: boolean
  destinatario: Person
  organizzatore: Person
  referente: Person | null
  client: Person
  property: Property
  dataEvento: string
  slot: { ora_inizio?: string; ora_fine?: string } | null
  note: string | null
}) {
  const ora = p.slot?.ora_inizio ? `${String(p.slot.ora_inizio).slice(0, 5)}–${String(p.slot.ora_fine || '').slice(0, 5)}` : ''
  const data = new Date(p.dataEvento + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  const titolo = niceText(p.property.titolo)
  const tel = p.client.telefono || ''
  const viaCollega = p.ruolo === 'organizzatore' && p.referente && !p.stessoAgente
  const banner = p.ruolo === 'referente'
    ? `<div style="background:#EAF8FE; border-left:4px solid ${SKY}; padding:14px 16px; border-radius:8px; margin-bottom:16px;">
         <div style="font-size:18px; font-weight:800;">🔗 Un tuo cliente ha prenotato</div>
         <div style="margin-top:4px;">${esc(p.client.nome)} ${esc(p.client.cognome)} ha prenotato l'Open House di <strong>${esc(titolo)}</strong> indicando te come agente di riferimento (dal tuo link o scegliendoti nel modulo).
         ${p.stessoAgente ? '' : `<br>L'Open House è organizzato da <strong>${esc(p.organizzatore.nome)} ${esc(p.organizzatore.cognome)}</strong>, ma il cliente lo segui tu dalla visita all'offerta: i suoi dati e i feedback li vedi solo tu.`}</div>
       </div>`
    : viaCollega
    ? `<div style="background:#FEF3C7; border-left:4px solid #F59E0B; padding:14px 16px; border-radius:8px; margin-bottom:16px;">
         <div style="font-size:18px; font-weight:800;">🤝 Cliente di ${esc(p.referente!.nome)} ${esc(p.referente!.cognome)}</div>
         <div style="margin-top:4px;">Un orario del tuo Open House è stato prenotato da un cliente di ${esc(p.referente!.nome)}. Il cliente lo segue ${esc(p.referente!.nome)}, dalla visita all'offerta: contatti, questionario e feedback li vede solo lui/lei.</div>
       </div>`
    : ''
  return {
    subject: p.ruolo === 'referente' && !p.stessoAgente
      ? `🔗 Un tuo cliente ha prenotato – ${p.client.nome} ${p.client.cognome} per ${titolo}`
      : `Nuova prenotazione${p.stessoAgente && p.referente ? ' dal tuo link' : viaCollega ? ` – cliente di ${p.referente!.nome}` : ''} – ${p.client.nome} ${p.client.cognome} per ${titolo}`,
    html: shell(`
      <p>Ciao <strong>${esc(p.destinatario.nome)}</strong>,</p>
      ${banner || `<p>hai una nuova prenotazione per l'Open House di <strong>${esc(titolo)}</strong>${p.stessoAgente && p.referente ? ' <strong>dal tuo link</strong> 🔗' : ''}.</p>`}
      ${viaCollega ? `<table style="width:100%; border-collapse:collapse; background:#fff; border-radius:8px;">
        ${row('Cliente', `${esc(p.client.nome)} ${esc(p.client.cognome)}`)}
        ${row('Quando', `<span style="text-transform:capitalize;">${esc(data)}</span>${ora ? `, ${esc(ora)}` : ''}`)}
        ${row('Lo segue', `${esc(p.referente!.nome)} ${esc(p.referente!.cognome)}`)}
      </table>` : `
      <table style="width:100%; border-collapse:collapse; background:#fff; border-radius:8px;">
        ${row('Cliente', `${esc(p.client.nome)} ${esc(p.client.cognome)}`)}
        ${row('Telefono', tel ? `<a href="tel:${esc(tel)}">${esc(tel)}</a>` : '')}
        ${row('Email', esc(p.client.email))}
        ${row('Immobile', esc(titolo))}
        ${row('Quando', `<span style="text-transform:capitalize;">${esc(data)}</span>${ora ? `, ${esc(ora)}` : ''}`)}
        ${row('Organizza', `${esc(p.organizzatore.nome)} ${esc(p.organizzatore.cognome)}`)}
        ${p.referente ? row('Agente di riferimento', `${esc(p.referente.nome)} ${esc(p.referente.cognome)}`) : ''}
      </table>
      ${p.note ? `<p style="background:#fff; padding:12px 14px; border-radius:8px; font-style:italic; white-space:pre-line;">“${esc(p.note)}”</p>` : ''}
      <div style="margin:18px 0;">
        ${tel ? `<a href="https://wa.me/${wa(tel)}" style="background:#16a34a; color:#fff; padding:11px 18px; border-radius:999px; text-decoration:none; display:inline-block; font-weight:700; margin:0 6px 6px 0;">💬 WhatsApp</a>` : ''}
        <a href="${SITE()}/dashboard/bookings" style="background:${BLU}; color:#fff; padding:11px 18px; border-radius:999px; text-decoration:none; display:inline-block; font-weight:700;">Apri le prenotazioni</a>
      </div>`}
    `),
  }
}

/** Invio (o reinvio) della brochure completa al cliente, a nome dell'agente che lo segue. */
export function brochureEmail(p: { client: Person; agent: Person; property: Property & { brochure_url: string }; benvenuto?: boolean }) {
  const titolo = niceText(p.property.titolo)
  return {
    subject: p.benvenuto ? `Grazie per la visita a ${titolo} – la brochure completa` : `La brochure di ${titolo} – Ghergo Immobiliare`,
    html: shell(`
      <p>Ciao <strong>${esc(p.client.nome)}</strong>,</p>
      <p>${p.benvenuto ? `grazie per essere passato all'Open House di <strong>${esc(titolo)}</strong>! Come promesso ti invio la documentazione completa.` : `come promesso ti invio la documentazione completa di <strong>${esc(titolo)}</strong>.`}</p>
      <div style="background:${BLU}; color:#fff; border-radius:14px; padding:20px; margin:18px 0; text-align:center;">
        <div style="font-size:18px; font-weight:800;">📄 Brochure completa dell'immobile</div>
        <div style="font-size:14px; opacity:.85; margin:6px 0 14px;">Planimetrie, foto e tutti i dettagli.</div>
        <a href="${esc(p.property.brochure_url)}" style="background:#fff; color:${BLU}; padding:13px 28px; text-decoration:none; border-radius:999px; display:inline-block; font-weight:800;">Scarica la brochure</a>
      </div>
      <p>Per qualsiasi domanda rispondi pure a questa email o scrivimi.</p>
      <p>A presto,<br><strong>${esc(p.agent.nome)} ${esc(p.agent.cognome)}</strong><br><span style="color:#6b7280;">Ghergo Immobiliare</span></p>
    `),
  }
}

/** Copia del foglio visita firmato (al cliente, o all'agente che lo segue). */
export function foglioEmail(p: {
  dati: { cliente: { nome: string; cognome: string }; immobile: { titolo: string }; visita: { data: string }; agente: string }
  perAgente: boolean
}) {
  const titolo = p.dati.immobile.titolo
  return p.perAgente
    ? {
        subject: `✍️ Conferma di visita firmata – ${p.dati.cliente.nome} ${p.dati.cliente.cognome} – ${titolo}`,
        html: shell(`<p>La conferma di visita di <strong>${esc(p.dati.cliente.nome)} ${esc(p.dati.cliente.cognome)}</strong> per <strong>${esc(titolo)}</strong> (${esc(p.dati.visita.data)}) è stata firmata. La trovi in allegato ed è archiviata nella prenotazione.</p>`),
      }
    : {
        subject: `La tua conferma di visita – ${titolo}`,
        html: shell(`
          <p>Ciao <strong>${esc(p.dati.cliente.nome)}</strong>,</p>
          <p>grazie per aver visitato <strong>${esc(titolo)}</strong>. In allegato trovi la copia della conferma di visita che hai firmato oggi.</p>
          <p>Per qualsiasi domanda rispondi pure a questa email.</p>
          <p>A presto,<br><strong>${esc(p.dati.agente)}</strong><br><span style="color:#6b7280;">Ghergo Immobiliare</span></p>
        `),
      }
}
