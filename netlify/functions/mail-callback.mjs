// Microsoft sends the browser back here after "Connect Outlook". Saves the connection,
// then returns to the app's Team page.
import { db, exchangeCode, graph, site, configured } from '../lib/mail.mjs'

const back = (q) => Response.redirect(`${site()}/team?${new URLSearchParams(q)}`, 302)

export default async (req) => {
  if (!configured()) return back({ mail: 'error', reason: 'Email isn’t set up on the server yet' })
  const u = new URL(req.url)
  const code = u.searchParams.get('code')
  const state = u.searchParams.get('state')
  if (u.searchParams.get('error')) return back({ mail: 'error', reason: u.searchParams.get('error_description') || u.searchParams.get('error') })
  if (!code || !state) return back({ mail: 'error', reason: 'Sign-in was cancelled' })

  const admin = db()
  // the state must be one we issued in the last 15 minutes, and is single-use
  const { data: st } = await admin.from('mail_oauth_states').delete().eq('state', state).select().maybeSingle()
  if (!st || Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) return back({ mail: 'error', reason: 'Sign-in expired, try again' })

  try {
    const t = await exchangeCode(code)
    const me = await graph(t.access_token, '/me?$select=mail,userPrincipalName')
    const { error } = await admin.from('mail_accounts').upsert({
      id: 1,
      email: me.mail || me.userPrincipalName,
      refresh_token: t.refresh_token,
      access_token: t.access_token,
      expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
      connected_by: st.user_id,
      connected_at: new Date().toISOString(),
    })
    if (error) throw error
    return back({ mail: 'connected' })
  } catch (err) {
    return back({ mail: 'error', reason: err.message || 'Could not connect' })
  }
}
