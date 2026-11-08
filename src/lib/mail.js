import { supabase, isDemo } from './supabase'
import { demoMail } from './mailDemo'

/** Call a Netlify mail function as the signed-in admin. */
async function call(fn, body) {
  if (isDemo) return demoMail(fn, body)
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/.netlify/functions/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(body || {}),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(out.error || 'Email error'), { status: res.status })
  return out
}

export const mail = (action, payload) => call('mail', { action, ...payload })
export const connectOutlook = () => call('mail-connect')

export async function mailStatus() {
  if (isDemo) return demoMail('status')
  const { data } = await supabase.rpc('mail_status')
  return Array.isArray(data) ? data[0] || null : data
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
/** Plain text typed in the app -> simple email HTML. */
export const textToHtml = (t) => `<div style="font-family:Arial,sans-serif;font-size:14px">${esc(t).replace(/\n/g, '<br>')}</div>`
