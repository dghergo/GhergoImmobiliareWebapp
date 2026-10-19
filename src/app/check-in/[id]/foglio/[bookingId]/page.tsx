'use client'

import { Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import ConfermaVisitaView from '@/components/ConfermaVisitaView'

// Conferma di visita dal link di check-in del collega (senza login)
function Pagina() {
  const router = useRouter()
  const { id, bookingId } = useParams<{ id: string; bookingId: string }>()
  const k = useSearchParams().get('k') || ''
  const back = () => router.push(`/check-in/${id}?k=${encodeURIComponent(k)}`)
  return (
    <ConfermaVisitaView
      carica={() => fetch(`/api/public/checkin/${id}/foglio?bookingId=${bookingId}&k=${encodeURIComponent(k)}`, { cache: 'no-store' })}
      invia={body => fetch(`/api/public/checkin/${id}/foglio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, k, bookingId }) })}
      onBack={back}
      onDone={back}
    />
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Pagina />
    </Suspense>
  )
}
