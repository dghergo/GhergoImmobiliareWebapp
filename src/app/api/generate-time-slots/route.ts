import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireStaff } from '@/lib/server-auth'

const supabaseAdmin = getSupabaseAdmin()

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaff(request)
    if (auth.error) return auth.error

    const { openHouseId } = await request.json()

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

    // Un agente può gestire solo i propri Open House
    if (auth.agent.role !== 'admin' && openHouse.agent_id !== auth.agent.id) {
      return NextResponse.json({ error: 'Open House di un altro agente' }, { status: 403 })
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

    // Aggiornamento "senza perdite": le prenotazioni non vengono MAI cancellate.
    // - slot con lo stesso orario: restano (si aggiorna solo la capienza)
    // - orari nuovi (es. Open House allungato): vengono aggiunti
    // - orari non più previsti: se hanno prenotazioni restano ma vengono nascosti
    //   ai nuovi clienti; se sono vuoti vengono eliminati
    const key = (s: { ora_inizio: string; ora_fine: string }) =>
      `${s.ora_inizio.slice(0, 5)}-${s.ora_fine.slice(0, 5)}`

    const newKeys = new Set(newSlots.map(key))
    const existingByKey = new Map(existingSlots.map(s => [key(s), s]))

    // Gli slot modificati a mano dall'agente non si toccano più
    const slotsToKeep = existingSlots.filter(s => !s.manuale && newKeys.has(key(s)))
    const slotsOutside = existingSlots.filter(s => !s.manuale && !newKeys.has(key(s)))
    const slotsToCreate = newSlots.filter(s => !existingByKey.has(key(s)))

    // Quali slot fuori orario hanno prenotazioni (di qualsiasi stato, per non perdere lo storico)
    let bookedOutsideIds = new Set<string>()
    let activeOutside = 0
    if (slotsOutside.length > 0) {
      const { data: outsideBookings, error: obError } = await supabaseAdmin
        .from('gre_bookings')
        .select('time_slot_id, status, cancellation_reason')
        .in('time_slot_id', slotsOutside.map(s => s.id))
      if (obError) throw obError
      bookedOutsideIds = new Set((outsideBookings || []).map(b => b.time_slot_id as string))
      activeOutside = (outsideBookings || []).filter(
        b => b.status === 'confirmed' || b.status === 'completed'
      ).length
    }

    const emptyOutside = slotsOutside.filter(s => !bookedOutsideIds.has(s.id))
    const bookedOutside = slotsOutside.filter(s => bookedOutsideIds.has(s.id))

    // 1. Slot confermati: aggiorna capienza e rendili visibili
    if (slotsToKeep.length > 0) {
      const { error } = await supabaseAdmin
        .from('gre_time_slots')
        .update({ max_partecipanti: openHouse.max_partecipanti_slot, is_available: true })
        .in('id', slotsToKeep.map(s => s.id))
      if (error) throw error
    }

    // 2. Nuovi orari: aggiungi
    if (slotsToCreate.length > 0) {
      const { error } = await supabaseAdmin.from('gre_time_slots').insert(
        slotsToCreate.map(slot => ({
          open_house_id: openHouseId,
          ora_inizio: slot.ora_inizio,
          ora_fine: slot.ora_fine,
          max_partecipanti: slot.max_partecipanti,
          partecipanti_attuali: 0,
          is_available: true
        }))
      )
      if (error) throw error
    }

    // 3. Orari non più previsti ma con prenotazioni: restano, nascosti ai nuovi clienti
    if (bookedOutside.length > 0) {
      const { error } = await supabaseAdmin
        .from('gre_time_slots')
        .update({ is_available: false })
        .in('id', bookedOutside.map(s => s.id))
      if (error) throw error
    }

    // 4. Orari non più previsti e vuoti: elimina
    if (emptyOutside.length > 0) {
      const { error } = await supabaseAdmin
        .from('gre_time_slots')
        .delete()
        .in('id', emptyOutside.map(s => s.id))
      if (error) throw error
    }

    return NextResponse.json({
      success: true,
      action: 'synced',
      slotsKept: slotsToKeep.length,
      slotsCreated: slotsToCreate.length,
      slotsRemoved: emptyOutside.length,
      slotsKeptOutside: bookedOutside.length,
      activeBookingsOutside: activeOutside,
      message: 'Orari aggiornati senza cancellare prenotazioni'
    })

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
