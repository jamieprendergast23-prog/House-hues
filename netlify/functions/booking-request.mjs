// Public booking form -> saves to Supabase -> emails the owner (and a receipt to the requester).
// Env vars (Netlify > Site settings > Environment variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (required)
//   RESEND_API_KEY, NOTIFY_EMAIL, FROM_EMAIL  (optional: email notifications via resend.com)
//   SITE_URL                                  (optional: used for the link in the email)
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SERVICE_KEY, SITE_URL, MISSING_KEY } from '../lib/env.mjs'

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

const clean = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  let b
  try { b = await req.json() } catch { return json(400, { error: 'Bad request' }) }

  // honeypot: bots fill every field
  if (b.website) return json(200, { ok: true })

  const row = {
    name: clean(b.name, 120),
    email: clean(b.email, 200),
    phone: clean(b.phone, 40),
    agency: clean(b.agency, 120),
    property_address: clean(b.property_address, 200),
    suburb: clean(b.suburb, 80),
    service_type: ['staging', 'consult', 'design'].includes(b.service_type) ? b.service_type : 'staging',
    preferred_date: /^\d{4}-\d{2}-\d{2}$/.test(b.preferred_date || '') ? b.preferred_date : null,
    property_type: clean(b.property_type, 40),
    bedrooms: Number.isInteger(Number(b.bedrooms)) && b.bedrooms !== '' ? Number(b.bedrooms) : null,
    occupied: b.occupied === 'true' ? true : b.occupied === 'false' ? false : null,
    message: clean(b.message, 3000),
  }
  if (!row.name || !row.email || !row.property_address) return json(400, { error: 'Name, email and address are required' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) return json(400, { error: 'That email doesn’t look right' })

  if (!SERVICE_KEY) return json(503, { error: MISSING_KEY })
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { error } = await db.from('booking_requests').insert(row)
  if (error) { console.error(error); return json(500, { error: 'Could not save your request' }) }

  // email notifications (skip quietly if not configured)
  const key = process.env.RESEND_API_KEY
  const to = process.env.NOTIFY_EMAIL
  const from = process.env.FROM_EMAIL || 'House & Hues <onboarding@resend.dev>'
  if (key && to) {
    const site = SITE_URL
    const lines = [
      ['Service', row.service_type], ['Address', `${row.property_address}${row.suburb ? `, ${row.suburb}` : ''}`],
      ['Preferred date', row.preferred_date], ['Property', [row.property_type, row.bedrooms && `${row.bedrooms} bed`].filter(Boolean).join(', ')],
      ['Name', row.name], ['Agency', row.agency], ['Phone', row.phone], ['Email', row.email], ['Message', row.message],
    ].filter(([, v]) => v)
    const html = `<h2>New ${esc(row.service_type)} request</h2><table>${lines
      .map(([k, v]) => `<tr><td style="color:#777;padding:4px 12px 4px 0">${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      ${site ? `<p><a href="${site}/requests">Open in House & Hues</a></p>` : ''}`
    const send = (payload) => fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, ...payload }),
    }).catch((e) => console.error('email failed', e))

    await Promise.all([
      send({ to, reply_to: row.email, subject: `New booking request: ${row.property_address}`, html }),
      process.env.FROM_EMAIL && send({
        to: row.email, reply_to: to, subject: 'We’ve got your request – House & Hues',
        html: `<p>Hi ${esc(row.name.split(' ')[0])},</p><p>Thanks for your request for ${esc(row.property_address)}. I’ll be in touch shortly to confirm.</p><p>House & Hues</p>`,
      }),
    ])
  }

  return json(200, { ok: true })
}
