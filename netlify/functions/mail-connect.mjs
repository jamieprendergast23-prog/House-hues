// Admin-only: start the "Connect Outlook" sign-in. Returns the Microsoft sign-in URL.
import { randomBytes } from 'node:crypto'
import { json, configured, db, adminFrom, authority, redirectUri, SCOPES } from '../lib/mail.mjs'

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  if (!configured()) return json(503, { error: 'Email isn’t set up on the server yet (Microsoft app details missing).' })
  const admin = db()
  const user = await adminFrom(req, admin)
  if (!user) return json(403, { error: 'Only admins can connect email' })

  const state = randomBytes(24).toString('base64url')
  // clear out old unfinished attempts, then remember this one
  await admin.from('mail_oauth_states').delete().lt('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
  const { error } = await admin.from('mail_oauth_states').insert({ state, user_id: user.id })
  if (error) return json(500, { error: error.message })

  const url = `${authority()}/authorize?` + new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPES,
    state,
    prompt: 'select_account',
  })
  return json(200, { url })
}
