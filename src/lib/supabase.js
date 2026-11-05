import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configured = Boolean(url && key)

export const supabase = configured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

// Turn Postgres errors into plain English for non-technical staff
export function friendlyError(err) {
  if (!err) return ''
  const msg = err.message || String(err)
  if (err.code === '23P01' || msg.includes('no_double_booking'))
    return 'One or more items are already booked on another job for those dates.'
  if (err.code === '23505') return 'That has already been added.'
  if (err.code === '23503') return 'This is still linked to a job, so it can’t be deleted. Retire it instead.'
  return msg
}
