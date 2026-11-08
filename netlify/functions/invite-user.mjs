// Admin-only: invite a crew member or admin by email.
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional SITE_URL for the redirect.
import { createClient } from '@supabase/supabase-js'

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '')
  if (!token) return json(401, { error: 'Not signed in' })

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // who is asking, and are they an admin?
  const { data: u, error: uErr } = await admin.auth.getUser(token)
  if (uErr || !u?.user) return json(401, { error: 'Not signed in' })
  const { data: me } = await admin.from('profiles').select('role').eq('id', u.user.id).single()
  if (me?.role !== 'admin') return json(403, { error: 'Only admins can invite people' })

  const { email, full_name, role, permissions } = await req.json().catch(() => ({}))
  const ALLOWED = ['dashboard', 'stock', 'houses', 'calendar', 'money', 'emails', 'field']
  const perms = Array.isArray(permissions) ? permissions.filter((p) => ALLOWED.includes(p)) : ['field']
  if (!email) return json(400, { error: 'Email required' })

  const site = process.env.SITE_URL || process.env.URL
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email.trim(), {
    data: { full_name: full_name || '' },
    redirectTo: site,
  })
  if (error) return json(400, { error: error.message })

  await admin.from('profiles').update(role === 'admin' ? { role: 'admin' } : { role: 'crew', permissions: perms }).eq('id', data.user.id)
  return json(200, { ok: true })
}
