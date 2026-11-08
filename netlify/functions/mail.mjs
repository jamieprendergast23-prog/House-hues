// Admin-only Outlook actions for the app:
//   list   { emails: [], text }       -> messages involving those addresses or mentioning the text
//   thread { conversationId }         -> every message in a conversation, oldest first, with bodies
//   send   { to: [], cc: [], subject, html }
//   reply  { id, html, all }
//   disconnect {}
import { json, configured, db, adminFrom, accessToken, graph } from '../lib/mail.mjs'

const SUMMARY = 'id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,isRead,hasAttachments,isDraft'
const clean = (s) => String(s || '').replace(/["\\]/g, ' ').trim()
const validEmail = (e) => /^[^\s@"<>]+@[^\s@"<>]+\.[^\s@"<>]+$/.test(e)
const recips = (list) => (list || []).map((e) => String(e).trim()).filter(validEmail).map((address) => ({ emailAddress: { address } }))

async function search(token, term) {
  const out = await graph(token, `/me/messages?$search=${encodeURIComponent(`"${term}"`)}&$top=40&$select=${SUMMARY}`)
  return out?.value || []
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  if (!configured()) return json(503, { error: 'Email isn’t set up on the server yet.' })
  const admin = db()
  const user = await adminFrom(req, admin)
  if (!user) return json(403, { error: 'Only admins can use email' })
  const p = await req.json().catch(() => ({}))

  try {
    if (p.action === 'disconnect') {
      await admin.from('mail_accounts').delete().eq('id', 1)
      return json(200, { ok: true })
    }

    const token = await accessToken(admin)

    if (p.action === 'list') {
      const emails = (p.emails || []).map(clean).filter(validEmail).slice(0, 6)
      const text = clean(p.text).slice(0, 80)
      const terms = [...emails.map((e) => `participants:${e}`), ...(text.length >= 4 ? [text] : [])]
      if (!terms.length) return json(200, { messages: [] })
      const lists = await Promise.all(terms.map((t) => search(token, t)))
      const seen = new Map()
      for (const m of lists.flat()) if (!m.isDraft && !seen.has(m.id)) seen.set(m.id, m)
      const messages = [...seen.values()].sort((a, b) => (b.receivedDateTime || '').localeCompare(a.receivedDateTime || ''))
      return json(200, { messages })
    }

    if (p.action === 'thread') {
      if (!p.conversationId) return json(400, { error: 'conversationId required' })
      const id = String(p.conversationId).replace(/'/g, "''")
      const out = await graph(token, `/me/messages?$filter=${encodeURIComponent(`conversationId eq '${id}'`)}&$top=50&$select=${SUMMARY},body`)
      const msgs = (out?.value || []).filter((m) => !m.isDraft)
        .sort((a, b) => (a.receivedDateTime || '').localeCompare(b.receivedDateTime || ''))
      // mark unread ones as read, like opening them in Outlook
      await Promise.all(msgs.filter((m) => !m.isRead).map((m) =>
        graph(token, `/me/messages/${m.id}`, { method: 'PATCH', body: { isRead: true } }).catch(() => null)))
      return json(200, { messages: msgs })
    }

    if (p.action === 'send') {
      const to = recips(p.to)
      if (!to.length) return json(400, { error: 'Add at least one email address' })
      if (!clean(p.subject)) return json(400, { error: 'Add a subject' })
      await graph(token, '/me/sendMail', {
        method: 'POST',
        body: {
          message: { subject: String(p.subject).slice(0, 250), body: { contentType: 'HTML', content: String(p.html || '') }, toRecipients: to, ccRecipients: recips(p.cc) },
          saveToSentItems: true,
        },
      })
      return json(200, { ok: true })
    }

    if (p.action === 'reply') {
      if (!p.id) return json(400, { error: 'Which email are you replying to?' })
      await graph(token, `/me/messages/${encodeURIComponent(p.id)}/${p.all ? 'replyAll' : 'reply'}`, {
        method: 'POST', body: { comment: String(p.html || '') },
      })
      return json(200, { ok: true })
    }

    return json(400, { error: 'Unknown action' })
  } catch (err) {
    return json(err.status || 500, { error: err.message || 'Email error' })
  }
}
