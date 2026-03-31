'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminOpenHousesRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/open-houses')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
    </div>
  )
}
