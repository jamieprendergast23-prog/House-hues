import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { mail, mailStatus, textToHtml } from '../lib/mail'
import { toast } from '../lib/toast'
import { Modal, Loading, Field } from './ui'

const who = (r) => r?.emailAddress?.name || r?.emailAddress?.address || ''
const when = (iso) => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

/**
 * Outlook emails for one booking: anything with the client/agent's address, or
 * mentioning the property address. Open, reply, or start a new email.
 */
export default function BookingEmails({ job, client }) {
  const [status, setStatus] = useState(undefined)
  const [msgs, setMsgs] = useState(null)
  const [err, setErr] = useState('')
  const [extra, setExtra] = useState('')
  const [extraUsed, setExtraUsed] = useState('')
  const [open, setOpen] = useState(null)          // conversationId
  const [compose, setCompose] = useState(false)

  const emails = useMemo(() => [client?.email, ...extraUsed.split(/[\s,;]+/)].filter(Boolean), [client?.email, extraUsed])
  const text = job.property_address || ''

  useEffect(() => { mailStatus().then(setStatus).catch(() => setStatus(null)) }, [])

  const load = useCallback(() => {
    setErr('')
    mail('list', { emails, text }).then((o) => setMsgs(o.messages)).catch((e) => { setErr(e.message); setMsgs([]) })
  }, [emails, text])
  useEffect(() => { if (status) load() }, [status, load])

  // one row per conversation, newest first
  const threads = useMemo(() => {
    const map = new Map()
    for (const m of msgs || []) {
      const t = map.get(m.conversationId)
      if (!t) map.set(m.conversationId, { ...m, count: 1, unread: !m.isRead })
      else { t.count++; if (!m.isRead) t.unread = true }
    }
    return [...map.values()]
  }, [msgs])

  if (status === undefined) return null
  if (!status) {
    return (
      <section className="card">
        <h2>Emails</h2>
        <p className="small muted">Connect Outlook on the <Link to="/team">Team page</Link> to see and send this booking’s emails here.</p>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="row between">
        <h2>Emails</h2>
        <div className="row">
          <button type="button" className="btn btn-small btn-ghost" onClick={load} aria-label="Refresh">↻</button>
          <button type="button" className="btn btn-small btn-primary" onClick={() => setCompose(true)}>New email</button>
        </div>
      </div>
      <p className="small muted">
        From {status.email}. Showing emails with {client?.email || 'the client (add their email)'}{text ? ` or mentioning “${text}”` : ''}.
      </p>
      <details className="small">
        <summary>Include other addresses</summary>
        <input placeholder="e.g. vendor@gmail.com, office@agency.com.au" value={extra} onChange={(e) => setExtra(e.target.value)} onBlur={() => setExtraUsed(extra)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setExtraUsed(extra) } }} />
      </details>

      {err && <p className="note small">{err}</p>}
      {!msgs ? <Loading /> : threads.length === 0 ? <p className="small muted">No emails found for this booking yet.</p> : (
        <ul className="list mail-list">
          {threads.map((t) => (
            <li key={t.conversationId}>
              <button type="button" className={`list-row mail-row ${t.unread ? 'unread' : ''}`} onClick={() => setOpen(t.conversationId)}>
                <div className="grow">
                  <div className="row between">
                    <span className="row-title">{who(t.from)}{t.count > 1 ? ` (${t.count})` : ''}</span>
                    <span className="small muted">{when(t.receivedDateTime)}</span>
                  </div>
                  <div className="mail-subject">{t.subject || '(no subject)'}</div>
                  <div className="row-sub mail-preview">{t.bodyPreview}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <Thread conversationId={open} onClose={() => { setOpen(null); load() }} />}
      {compose && (
        <Compose to={emails.join(', ')} subject={text ? `${text}: ` : ''}
          onClose={(sent) => { setCompose(false); if (sent) setTimeout(load, 1500) }} />
      )}
    </section>
  )
}

function Thread({ conversationId, onClose }) {
  const [msgs, setMsgs] = useState(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => mail('thread', { conversationId }).then((o) => setMsgs(o.messages))
    .catch((e) => { toast(e.message, 'error'); setMsgs([]) }), [conversationId])
  useEffect(() => { load() }, [load])

  const last = msgs?.[msgs.length - 1]
  const send = async (all) => {
    if (!reply.trim()) return
    setBusy(true)
    try {
      await mail('reply', { id: last.id, html: textToHtml(reply), all })
      toast('Reply sent'); setReply('')
      setTimeout(load, 1500)
    } catch (e) { toast(e.message, 'error') }
    setBusy(false)
  }

  return (
    <Modal title={msgs?.[0]?.subject || 'Email'} onClose={onClose} wide>
      {!msgs ? <Loading /> : (
        <div className="stack">
          {msgs.map((m) => (
            <article key={m.id} className="mail-msg">
              <div className="row between small">
                <b>{who(m.from)}</b>
                <span className="muted">{new Date(m.receivedDateTime).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
              </div>
              <div className="small muted">To {(m.toRecipients || []).map(who).join(', ')}{m.hasAttachments ? ' · 📎 has attachments (open in Outlook)' : ''}</div>
              <MailBody html={m.body?.content || ''} />
            </article>
          ))}
          {last && (
            <div className="stack">
              <Field label={`Reply to ${who(last.from)}`}>
                <textarea rows={5} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write your reply…" />
              </Field>
              <div className="row sticky-actions">
                <button type="button" className="btn" disabled={busy || !reply.trim()} onClick={() => send(true)}>Reply all</button>
                <button type="button" className="btn btn-primary grow" disabled={busy || !reply.trim()} onClick={() => send(false)}>{busy ? 'Sending…' : 'Reply'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/** Email HTML shown in a locked-down frame: no scripts can run, links open in a new tab. */
function MailBody({ html }) {
  const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:">
<base target="_blank"><style>body{font-family:Arial,sans-serif;font-size:14px;margin:0;color:#222;word-wrap:break-word}img{max-width:100%;height:auto}</style>
</head><body>${html}</body></html>`
  const fit = (e) => {
    try { const b = e.target.contentDocument?.documentElement; if (b) e.target.style.height = `${Math.min(b.scrollHeight + 8, 1600)}px` } catch { /* ignore */ }
  }
  return <iframe className="mail-body" title="Email" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} onLoad={fit} />
}

function Compose({ to: to0, subject: sub0, onClose }) {
  const [to, setTo] = useState(to0)
  const [subject, setSubject] = useState(sub0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await mail('send', { to: to.split(/[\s,;]+/).filter(Boolean), subject, html: textToHtml(body) })
      toast('Email sent'); onClose(true)
    } catch (err) { toast(err.message, 'error'); setBusy(false) }
  }

  return (
    <Modal title="New email" onClose={() => onClose(false)}>
      <form className="stack" onSubmit={send}>
        <Field label="To"><input required value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" /></Field>
        <Field label="Subject"><input required value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message"><textarea required rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="row sticky-actions">
          <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>Cancel</button>
          <button className="btn btn-primary grow" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </form>
    </Modal>
  )
}
