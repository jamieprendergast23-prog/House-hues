// Pretend Outlook for the demo build: a few sample threads, sending just adds to them.
const now = Date.now()
const ago = (h) => new Date(now - h * 3600_000).toISOString()
const person = (name, address) => ({ emailAddress: { name, address } })
const ME = person('House & Hues', 'hello@houseandhues.com.au')

let msgs = null
function seed(emails, text) {
  const agent = person('Sam (agent)', emails[0] || 'agent@example.com')
  const where = text || 'the property'
  msgs = [
    { id: 'm1', conversationId: 'c1', subject: `Styling quote: ${where}`, from: ME, toRecipients: [agent], receivedDateTime: ago(70), isRead: true,
      bodyPreview: 'Hi Sam, thanks for walking me through today…', body: { content: `<p>Hi Sam,</p><p>Thanks for walking me through ${where} today. Quote attached for a 6 week hire.</p><p>Hayley</p>` } },
    { id: 'm2', conversationId: 'c1', subject: `RE: Styling quote: ${where}`, from: agent, toRecipients: [ME], receivedDateTime: ago(30), isRead: true,
      bodyPreview: 'Vendor is happy to go ahead. Can you do next Thursday?', body: { content: '<p>Vendor is happy to go ahead. Can you do next Thursday?</p><p>Sam</p>' } },
    { id: 'm3', conversationId: 'c2', subject: `Access for install: ${where}`, from: agent, toRecipients: [ME], receivedDateTime: ago(3), isRead: false,
      bodyPreview: 'Lockbox code is 4821. Tenants out by 9am.', body: { content: '<p>Lockbox code is 4821. Tenants out by 9am.</p>' } },
  ]
}

export async function demoMail(fn, body = {}) {
  await new Promise((r) => setTimeout(r, 250))
  if (fn === 'status') return { email: 'hello@houseandhues.com.au', connected_at: ago(48) }
  if (fn === 'mail-connect') return { url: null, demo: true }
  const a = body.action
  if (a === 'list') {
    if (!msgs) seed(body.emails || [], body.text)
    return { messages: [...msgs].sort((x, y) => y.receivedDateTime.localeCompare(x.receivedDateTime)) }
  }
  if (a === 'thread') {
    const t = msgs.filter((m) => m.conversationId === body.conversationId)
    t.forEach((m) => (m.isRead = true))
    return { messages: t.sort((x, y) => x.receivedDateTime.localeCompare(y.receivedDateTime)) }
  }
  if (a === 'reply') {
    const o = msgs.find((m) => m.id === body.id)
    msgs.push({ ...o, id: `m${msgs.length + 1}`, subject: o.subject.startsWith('RE:') ? o.subject : `RE: ${o.subject}`, from: ME,
      toRecipients: [o.from], receivedDateTime: new Date().toISOString(), isRead: true, bodyPreview: body.html.replace(/<[^>]+>/g, ' ').trim().slice(0, 90), body: { content: body.html } })
    return { ok: true }
  }
  if (a === 'send') {
    msgs = msgs || []
    msgs.push({ id: `m${msgs.length + 1}`, conversationId: `c${msgs.length + 1}`, subject: body.subject, from: ME,
      toRecipients: (body.to || []).map((e) => person(e, e)), receivedDateTime: new Date().toISOString(), isRead: true,
      bodyPreview: body.html.replace(/<[^>]+>/g, ' ').trim().slice(0, 90), body: { content: body.html } })
    return { ok: true }
  }
  if (a === 'disconnect') return { ok: true }
  throw new Error('Unknown action')
}
