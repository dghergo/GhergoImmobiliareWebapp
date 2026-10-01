-- Applicata il 1 ottobre 2026.
-- Un orario (slot) con prenotazioni non può più essere eliminato:
-- prima il vincolo era ON DELETE SET NULL e la prenotazione perdeva l'orario.
-- NO ACTION consente comunque l'eliminazione a cascata di un intero Open House
-- (slot e prenotazioni vengono eliminati nella stessa operazione).
ALTER TABLE public.gre_bookings DROP CONSTRAINT gre_bookings_time_slot_id_fkey;
ALTER TABLE public.gre_bookings
  ADD CONSTRAINT gre_bookings_time_slot_id_fkey
  FOREIGN KEY (time_slot_id) REFERENCES public.gre_time_slots(id) ON DELETE NO ACTION;
