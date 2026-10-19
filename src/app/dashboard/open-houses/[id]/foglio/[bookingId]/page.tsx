'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { authFetch } from '@/lib/api'
import ConfermaVisitaView from '@/components/ConfermaVisitaView'

export default function ConfermaVisita() {
  const { agent, loading } = useAuth()
  const router = useRouter()
  const { id, bookingId } = useParams<{ id: string; bookingId: string }>()

  useEffect(() => {
    if (!loading && !agent) router.push('/dashboard/login')
  }, [agent, loading, router])

  if (!agent) return null
  const back = () => router.push(`/dashboard/open-houses/${id}/check-in`)
  return (
    <ConfermaVisitaView
      carica={() => authFetch(`/api/open-houses/${id}/foglio?bookingId=${bookingId}`, { cache: 'no-store' })}
      invia={body => authFetch(`/api/open-houses/${id}/foglio`, { method: 'POST', body: JSON.stringify({ ...body, bookingId }) })}
      onBack={back}
      onDone={back}
    />
  )
}
