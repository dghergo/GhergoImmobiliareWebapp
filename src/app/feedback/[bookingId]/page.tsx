'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Logo from '@/components/Logo'

interface BookingData {
  id: string
  feedback_completed: boolean
  gre_open_houses: {
    id: string
    data_evento: string
    gre_properties: {
      id: string
      titolo: string
      zona: string
    }
  }
}

export default function FeedbackPage() {
  const params = useParams()
  const bookingId = params.bookingId as string

  const [booking, setBooking] = useState<BookingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [commenti, setCommenti] = useState('')
  const [vuoleFareOfferta, setVuoleFareOfferta] = useState(false)

  useEffect(() => {
    if (bookingId) {
      loadBooking()
    }
  }, [bookingId])

  const loadBooking = async () => {
    try {
      const { data, error } = await supabase
        .from('gre_bookings')
        .select(`
          id,
          feedback_completed,
          gre_open_houses (
            id,
            data_evento,
            gre_properties (id, titolo, zona)
          )
        `)
        .eq('id', bookingId)
        .single()

      if (error || !data) {
        setNotFound(true)
        return
      }

      // Normalize Supabase joined data
      const normalized = {
        ...data,
        gre_open_houses: data.gre_open_houses as any
      } as BookingData

      if (normalized.feedback_completed) {
        setAlreadySubmitted(true)
        setBooking(normalized)
        return
      }

      setBooking(normalized)
    } catch (error) {
      console.error('Error loading booking:', error)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!booking) return

    setSubmitting(true)

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          commenti,
          vuole_fare_offerta: vuoleFareOfferta
        })
      })

      const result = await response.json()

      if (!response.ok) {
        alert(result.error || 'Errore nell\'invio del feedback')
        return
      }

      setSubmitted(true)
    } catch (error) {
      console.error('Error submitting feedback:', error)
      alert('Errore nell\'invio del feedback. Riprova.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent-blue)' }}></div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">&#128533;</div>
          <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-dark)' }}>
            Prenotazione non trovata
          </h1>
          <p style={{ color: 'var(--text-gray)' }}>
            Il link potrebbe essere errato o la prenotazione non esiste.
          </p>
        </div>
      </div>
    )
  }

  if (alreadySubmitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header style={{ backgroundColor: 'var(--primary-blue)' }} className="text-white py-1 md:py-0 md:h-16">
        <div className="container mx-auto px-4 h-full">
            <Logo height={56} />
          </div>
        </header>
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-md mx-auto px-4">
            <div className="text-6xl mb-4">&#10003;</div>
            <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-dark)' }}>
              Feedback già inviato
            </h1>
            <p style={{ color: 'var(--text-gray)' }}>
              Ha già condiviso il suo feedback per questa visita. Grazie!
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header style={{ backgroundColor: 'var(--primary-blue)' }} className="text-white py-1 md:py-0 md:h-16">
        <div className="container mx-auto px-4 h-full">
            <Logo height={56} />
          </div>
        </header>
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-md mx-auto px-4">
            <div className="text-6xl mb-4">&#128588;</div>
            <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-dark)' }}>
              Grazie per il suo feedback!
            </h1>
            <p style={{ color: 'var(--text-gray)' }}>
              Le sue impressioni sono preziose per noi e ci aiutano a migliorare il servizio.
            </p>
            {vuoleFareOfferta && (
              <p className="mt-4 font-medium" style={{ color: 'var(--primary-blue)' }}>
                Il suo agente la contatterà al più presto per discutere la sua offerta.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const property = booking!.gre_open_houses.gre_properties

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header style={{ backgroundColor: 'var(--primary-blue)' }} className="text-white py-1 md:py-0 md:h-16">
        <div className="container mx-auto px-4 h-full">
          <Logo height={56} />
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* Card Header */}
            <div className="px-6 py-4" style={{ backgroundColor: 'var(--primary-blue)' }}>
              <h2 className="text-xl font-bold text-white">Il suo feedback</h2>
              <p className="text-sm text-blue-100 mt-1">
                {property.titolo} - {property.zona}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-dark)' }}>
                  Condivida le sue impressioni sulla visita
                </label>
                <textarea
                  rows={5}
                  value={commenti}
                  onChange={(e) => setCommenti(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Come è andata la visita? L'immobile ha corrisposto alle sue aspettative? Ha suggerimenti per migliorare la nostra organizzazione?"
                />
              </div>

              <div className="p-4 rounded-lg border-2 border-gray-200">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vuoleFareOfferta}
                    onChange={(e) => setVuoleFareOfferta(e.target.checked)}
                    className="mt-1 w-5 h-5 accent-blue-600"
                  />
                  <div>
                    <span className="font-semibold" style={{ color: 'var(--text-dark)' }}>
                      Sono interessato/a a fare un&apos;offerta per questo immobile
                    </span>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-gray)' }}>
                      Selezionando questa opzione, il suo agente la contatterà per discutere i dettagli.
                    </p>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full btn-primary py-3 font-bold text-lg disabled:opacity-50"
              >
                {submitting ? 'Invio in corso...' : 'INVIA FEEDBACK'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
