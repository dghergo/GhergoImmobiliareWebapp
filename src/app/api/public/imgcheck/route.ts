import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server-auth'
import { sized } from '@/lib/img'
export const maxDuration = 60
// TEMPORANEO: verifica foto ridimensionate
export async function GET() {
  const { data } = await getSupabaseAdmin().from('gre_properties').select('immagini').eq('is_active', true).limit(2)
  const urls = (data || []).flatMap(p => (p.immagini || []).slice(0, 2)) as string[]
  const out = []
  for (const u of urls) {
    for (const [w, q] of [[800, 82], [1400, 85], [2500, 88]]) {
      const r = await fetch(sized(u, w, q), { headers: { Accept: 'image/webp,image/*' } })
      const buf = Buffer.from(await r.arrayBuffer())
      let dim = ''
      if (buf.slice(0, 4).toString() === 'RIFF') { // webp
        const t = buf.slice(12, 16).toString()
        if (t === 'VP8 ') dim = `${buf.readUInt16LE(26) & 0x3fff}x${buf.readUInt16LE(28) & 0x3fff}`
        else if (t === 'VP8X') dim = `${1 + buf.readUIntLE(24, 3)}x${1 + buf.readUIntLE(27, 3)}`
        else if (t === 'VP8L') { const b = buf.readUInt32LE(21); dim = `${(b & 0x3fff) + 1}x${((b >> 14) & 0x3fff) + 1}` }
      }
      out.push({ u: u.slice(-40), w, q, status: r.status, type: r.headers.get('content-type'), kb: Math.round(buf.length / 1024), dim })
    }
  }
  return NextResponse.json(out)
}
