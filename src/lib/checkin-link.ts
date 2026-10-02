import { createHmac, timingSafeEqual } from 'crypto'

// Link di check-in per i colleghi: firmato dal server, valido per un solo Open House
// e solo fino a fine giornata dell'evento. Nessun account necessario.
function key(): string {
  const k = process.env.CHECKIN_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!k) throw new Error('Chiave per i link di check-in non configurata')
  return k
}

const sign = (openHouseId: string, exp: number) =>
  createHmac('sha256', key()).update(`checkin:${openHouseId}:${exp}`).digest('base64url')

/** Fine giornata dell'evento (ora italiana, con margine). */
export function expiryFor(dataEvento: string): number {
  return Date.parse(`${dataEvento}T23:59:59+01:00`)
}

export function createCheckinToken(openHouseId: string, dataEvento: string): string {
  const exp = expiryFor(dataEvento)
  return `${exp}.${sign(openHouseId, exp)}`
}

export type TokenCheck = 'ok' | 'invalid' | 'expired'

export function verifyCheckinToken(openHouseId: string, token: string | null | undefined): TokenCheck {
  if (!token) return 'invalid'
  const [expStr, sig] = token.split('.')
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || !sig) return 'invalid'
  const expected = Buffer.from(sign(openHouseId, exp))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid'
  if (Date.now() > exp) return 'expired'
  return 'ok'
}
