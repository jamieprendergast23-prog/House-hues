// Phase switch. Phase 1 = inventory system. Phase 2 (VITE_ERP=1) switches on the
// business side: booking form, requests, calendar, client pipeline, money.
export const ERP = import.meta.env.VITE_ERP === '1'
