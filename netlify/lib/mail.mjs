// Shared helpers for the Outlook (Microsoft 365) mail functions.
// Env (Netlify): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL,
//                MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT (optional, default "organizations")
import { createClient } from '@supabase/supabase-js'

export const SCOPES = 'offline_access openid email User.Read Mail.ReadWrite Mail.Send'
export const GRAPH = 'https://graph.microsoft.com/v1.0'

export const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

export const site = () => (process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '')
export const redirectUri = () => `${site()}/.netlify/functions/mail-callback`
const tenant = () => process.env.MS_TENANT || 'organizations'
export const authority = () => `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0`

export function configured() {
  return Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET &&
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

/** Signed-in user from the request's Supabase token if they're an admin
 *  (or, when `perm` is given, have that area ticked on the Team page). */
export async function adminFrom(req, admin, perm) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '')
  if (!token) return null
  const { data: u } = await admin.auth.getUser(token)
  if (!u?.user) return null
  const { data: me } = await admin.from('profiles').select('role, permissions').eq('id', u.user.id).single()
  if (me?.role === 'admin') return u.user
  return perm && (me?.permissions || []).includes(perm) ? u.user : null
}

async function tokenRequest(params) {
  const res = await fetch(`${authority()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      scope: SCOPES,
      ...params,
    }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(out.error_description || out.error || 'Microsoft sign-in failed'); e.code = out.error; throw e }
  return out
}

export const exchangeCode = (code) => tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() })

/** A valid Graph access token for the connected inbox (refreshing it if needed). */
export async function accessToken(admin) {
  const { data: acct } = await admin.from('mail_accounts').select('*').eq('id', 1).maybeSingle()
  if (!acct) { const e = new Error('Email isn’t connected yet'); e.status = 409; throw e }
  if (acct.access_token && acct.expires_at && new Date(acct.expires_at).getTime() > Date.now() + 60_000) return acct.access_token
  let t
  try {
    t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: acct.refresh_token })
  } catch (err) {
    const e = new Error('Outlook needs reconnecting (Team page)'); e.status = 409; e.cause = err; throw e
  }
  await admin.from('mail_accounts').update({
    access_token: t.access_token,
    refresh_token: t.refresh_token || acct.refresh_token,
    expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
  }).eq('id', 1)
  return t.access_token
}

export async function graph(token, path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 202 || res.status === 204) return null
  const out = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(out.error?.message || `Outlook error ${res.status}`); e.status = res.status >= 500 ? 502 : 400; throw e }
  return out
}
