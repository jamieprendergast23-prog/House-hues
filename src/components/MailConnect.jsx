import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isDemo } from '../lib/supabase'
import { mail, mailStatus, connectOutlook } from '../lib/mail'
import { toast } from '../lib/toast'

/** Team page card: connect / disconnect the business Outlook inbox. */
export default function MailConnect() {
  const [status, setStatus] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [params, setParams] = useSearchParams()

  const load = () => mailStatus().then(setStatus).catch(() => setStatus(null))
  useEffect(() => { load() }, [])

  // back from Microsoft sign-in
  useEffect(() => {
    const m = params.get('mail')
    if (!m) return
    if (m === 'connected') toast('Outlook connected')
    else toast(`Couldn’t connect Outlook: ${params.get('reason') || 'unknown error'}`, 'error')
    setParams({}, { replace: true }); load()
  }, [params, setParams])

  const connect = async () => {
    if (isDemo) return toast('In the live app this opens Microsoft sign-in')
    setBusy(true)
    try { const { url } = await connectOutlook(); window.location.href = url }
    catch (e) { toast(e.message, 'error'); setBusy(false) }
  }
  const disconnect = async () => {
    if (!window.confirm('Disconnect Outlook? Emails will stop showing on bookings until it’s connected again.')) return
    try { await mail('disconnect'); toast('Disconnected'); load() } catch (e) { toast(e.message, 'error') }
  }

  if (status === undefined) return null
  return (
    <section className="card">
      <h2>Email (Outlook)</h2>
      {status ? (
        <>
          <p className="small">Connected: <b>{status.email}</b>. Emails with each client show on their booking, and you can reply from there. Only admins see emails.</p>
          <div className="row">
            <button type="button" className="btn" onClick={connect} disabled={busy}>Reconnect</button>
            <button type="button" className="btn btn-ghost danger" onClick={disconnect}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p className="small muted">Connect the business Microsoft 365 email so each booking shows its emails, and you can reply or send from the booking. Only admins see emails.</p>
          <button type="button" className="btn btn-primary" onClick={connect} disabled={busy}>{busy ? 'Opening Microsoft…' : 'Connect Outlook'}</button>
        </>
      )}
    </section>
  )
}
