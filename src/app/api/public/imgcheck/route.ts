import { NextResponse } from 'next/server'
// Temporaneo: verifica il ridimensionamento delle foto
export async function GET() {
  const base = 'https://fsussaksudzzsxwzeozq.supabase.co/storage/v1'
  const path = 'gre_property_images/c74fecd3-488b-4070-80c1-cb6e12b36e42/1790002010450.jpg'
  const out: Record<string, unknown> = {}
  for (const [k, u] of [['originale', `${base}/object/public/${path}`], ['ridotta', `${base}/render/image/public/${path}?width=900&quality=72`]]) {
    const t = Date.now()
    const r = await fetch(u, { cache: 'no-store' })
    const b = await r.arrayBuffer()
    out[k] = { status: r.status, kb: Math.round(b.byteLength / 1024), ms: Date.now() - t, type: r.headers.get('content-type') }
  }
  return NextResponse.json(out)
}
