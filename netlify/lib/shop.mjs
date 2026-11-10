// Shared helpers for the online shop (Stripe Checkout).
// Env (Netlify): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SERVICE_KEY, SITE_URL } from './env.mjs'

export const HOLD_MINUTES = 35          // pieces are held while someone pays
export const SESSION_MINUTES = 31       // Stripe's minimum is 30
export const site = () => SITE_URL

export const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})
export const db = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
export const shopReady = () => Boolean(process.env.STRIPE_SECRET_KEY && SERVICE_KEY)

/** Call Stripe's API with form-encoded params (no SDK needed). */
export async function stripe(path, params, method = 'POST') {
  const body = new URLSearchParams()
  const add = (k, v) => {
    if (v === undefined || v === null) return
    if (typeof v === 'object') for (const [kk, vv] of Object.entries(v)) add(`${k}[${kk}]`, vv)
    else body.append(k, String(v))
  }
  for (const [k, v] of Object.entries(params || {})) add(k, v)
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body,
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error?.message || `Stripe error ${res.status}`)
  return out
}

/** Check Stripe's signature on a webhook (header "Stripe-Signature: t=…,v1=…"). */
export function verifySignature(raw, header, secret, toleranceSec = 300) {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k, v]))
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3))
  const t = Number(parts.t)
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')
  const e = Buffer.from(expected)
  return sigs.some((s) => { const b = Buffer.from(s); return b.length === e.length && timingSafeEqual(b, e) })
}
