import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Client admin con service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { openHouseId, forceRegenerate } = await request.json()

    if (!openHouseId) {
      return NextResponse.json({ error: 'Open House ID mancante' }, { status: 400 })
    }

    // Ottieni dettagli Open House
    const { data: openHouse, error: openHouseError } = await supabaseAdmin
      .from('gre_open_houses')
      .select('*')
      .eq('id', openHouseId)
      .single()

    if (openHouseError || !openHouse) {
      return NextResponse.json({ error: 'Open House non trovato' }, { status: 404 })
    }

    // Genera i nuovi slot teorici
    const newSlots = generateTimeSlots(
      openHouse.ora_inizio,
      openHouse.ora_fine,
      openHouse.durata_slot,
      openHouse.max_partecipanti_slot
    )

    // Recupera slot esistenti
    const { data: existingSlots, error: existingSlotsError } = await supabaseAdmin
      .from('gre_time_slots')
      .select('*')
      .eq('open_house_id', openHouseId)
      .order('ora_inizio')

    if (existingSlotsError) {
      throw existingSlotsError
    }

    // Se non ci sono slot esistenti, crea direttamente
    if (!existingSlots || existingSlots.length === 0) {
      return await createNewSlots(openHouseId, newSlots)
    }

    // Confronta timing: stessi orari/durata?
    const timingChanged = hasTimingChanged(existingSlots, newSlots)

    if (!timingChanged) {
      // Solo capacità cambiata → UPDATE max_partecipanti sugli slot esistenti
      const { error: updateError } = await supabaseAdmin
        .from('gre_time_slots')
        .update({ max_partecipanti: openHouse.max_partecipanti_slot })
        .eq('open_house_id', openHouseId)

      if (updateError) {
        throw updateError
      }

      return NextResponse.json({
        success: true,
        action: 'updated_capacity',
        slotsUpdated: existingSlots.length,
        message: 'Capacità slot aggiornata senza perdita di prenotazioni'
      })
    }

    // Timing cambiato: conta le prenotazioni attive prima di rigenerare
    const { count: activeBookings, error: countError } = await supabaseAdmin
      .from('gre_bookings')
      .select('*', { count: 'exact', head: true })
      .in('time_slot_id', existingSlots.map(s => s.id))
      .in('status', ['confirmed', 'completed'])

    if (countError) {
      throw countError
    }

    // Se ci sono prenotazioni attive e non è stato forzato, avvisa
    if ((activeBookings || 0) > 0 && !forceRegenerate) {
      return NextResponse.json({
        success: false,
        action: 'warning',
        activeBookings: activeBookings || 0,
        message: `Attenzione: ci sono ${activeBookings} prenotazioni attive. Rigenerando gli slot, queste prenotazioni verranno eliminate. Confermare?`
      })
    }

    // Forza rigenerazione: elimina vecchi slot e crea nuovi
    await supabaseAdmin
      .from('gre_time_slots')
      .delete()
      .eq('open_house_id', openHouseId)

    return await createNewSlots(openHouseId, newSlots)

  } catch (error: any) {
    console.error('Error generating time slots:', error)
    return NextResponse.json(
      { error: error.message || 'Errore interno del server' },
      { status: 500 }
    )
  }
}

async function createNewSlots(
  openHouseId: string,
  slots: Array<{ ora_inizio: string; ora_fine: string; max_partecipanti: number }>
) {
  const slotsData = slots.map(slot => ({
    open_house_id: openHouseId,
    ora_inizio: slot.ora_inizio,
    ora_fine: slot.ora_fine,
    max_partecipanti: slot.max_partecipanti,
    partecipanti_attuali: 0,
    is_available: true
  }))

  const { data, error } = await supabaseAdmin
    .from('gre_time_slots')
    .insert(slotsData)
    .select()

  if (error) {
    throw error
  }

  return NextResponse.json({
    success: true,
    action: 'regenerated',
    slotsCreated: data.length,
    slots: data
  })
}

function hasTimingChanged(
  existingSlots: Array<{ ora_inizio: string; ora_fine: string }>,
  newSlots: Array<{ ora_inizio: string; ora_fine: string }>
): boolean {
  if (existingSlots.length !== newSlots.length) return true

  for (let i = 0; i < existingSlots.length; i++) {
    // Normalizza i formati degli orari per confronto (HH:MM:SS)
    const existStart = existingSlots[i].ora_inizio.slice(0, 8)
    const existEnd = existingSlots[i].ora_fine.slice(0, 8)
    const newStart = newSlots[i].ora_inizio.slice(0, 8)
    const newEnd = newSlots[i].ora_fine.slice(0, 8)

    if (existStart !== newStart || existEnd !== newEnd) return true
  }

  return false
}

function generateTimeSlots(
  startTime: string,
  endTime: string,
  slotDurationMinutes: number,
  maxParticipants: number
): Array<{ ora_inizio: string; ora_fine: string; max_partecipanti: number }> {
  const slots = []

  // Converti orari in minuti
  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)

  const startMinutes = startHour * 60 + startMin
  const endMinutes = endHour * 60 + endMin

  // Genera slot
  for (let current = startMinutes; current + slotDurationMinutes <= endMinutes; current += slotDurationMinutes) {
    const slotStart = minutesToTime(current)
    const slotEnd = minutesToTime(current + slotDurationMinutes)

    slots.push({
      ora_inizio: slotStart,
      ora_fine: slotEnd,
      max_partecipanti: maxParticipants
    })
  }

  return slots
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`
}
