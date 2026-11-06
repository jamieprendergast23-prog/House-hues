// Phase switch. Phase 1 = inventory system. Phase 2 (VITE_ERP=1) switches on the
// business side: booking form, requests, calendar, client pipeline, money.
export const ERP = import.meta.env.VITE_ERP === '1'

// Switched on in Phase 1 too, because this is how she runs her week:
// calendar, houses board (her whiteboard), hire card (her cork board), clients + payment status
export const PLANNER = true
