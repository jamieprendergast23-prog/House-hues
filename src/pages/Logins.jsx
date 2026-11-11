import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Loading } from '../components/ui'

const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}
const stamp = (iso) => new Date(iso).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Who's been using the app. Only visible to the app's builder. */
export default function Logins() {
  const [rows, setRows] = useState(null)
  const [who, setWho] = useState('')
  const [kind, setKind] = useState('')

  useEffect(() => {
    supabase.rpc('login_tracker', { p_limit: 1000 }).then(({ data }) => setRows(data || []))
  }, [])

  const people = useMemo(() => {
    const map = new Map()
    const month = Date.now() - 30 * 86400000
    const localDay = (iso) => new Date(iso).toLocaleDateString('en-CA')   // YYYY-MM-DD in local time
    const start = new Date(); start.setDate(start.getDate() - 6)
    const weekStart = start.toLocaleDateString('en-CA')
    for (const r of rows || []) {
      const p = map.get(r.user_id) || { id: r.user_id, name: r.full_name || 'Unnamed', role: r.role, last: r, signIns30: 0, days7: new Set(), devices: new Set() }
      const t = new Date(r.at).getTime()
      if (r.kind === 'sign_in' && t > month) p.signIns30++
      const day = localDay(r.at)
      if (day >= weekStart) p.days7.add(day)
      if (r.device) p.devices.add(r.device)
      map.set(r.user_id, p)
    }
    return [...map.values()].sort((a, b) => b.last.at.localeCompare(a.last.at))
  }, [rows])

  if (!rows) return <Loading />
  const shown = rows.filter((r) => (!who || r.user_id === who) && (!kind || r.kind === kind))

  return (
    <div className="stack">
      <div className="page-head"><h1>Logins</h1></div>
      <p className="small muted">Only you can see this page. Sign-ins are recorded each time someone logs in, and app opens at most once every 30 minutes. Before 12 Nov, only sign-ins and each login’s last activity were available, so earlier days show less detail.</p>

      <div className="login-people">
        {people.length === 0 && <p className="small muted">No activity recorded yet.</p>}
        {people.map((p) => (
          <button key={p.id} type="button" className={`card login-person ${who === p.id ? 'on' : ''}`} onClick={() => setWho(who === p.id ? '' : p.id)}>
            <div className="row between"><b>{p.name}</b><span className={`tc-badge ${Date.now() - new Date(p.last.at) < 86400000 ? 'ok' : 'warn'}`}>{ago(p.last.at)}</span></div>
            <div className="row-sub">{p.role === 'admin' ? 'Admin' : 'Staff'} · last on {p.last.device || 'unknown device'}</div>
            <div className="login-stats">
              <span><b>{p.days7.size}</b> of last 7 days</span>
              <span><b>{p.signIns30}</b> sign-ins in 30 days</span>
            </div>
          </button>
        ))}
      </div>

      <section className="card">
        <div className="row between wrap">
          <h2 style={{ margin: 0 }}>History{who ? `: ${people.find((p) => p.id === who)?.name}` : ''}</h2>
          <div className="seg">
            <button type="button" className={!kind ? 'on' : ''} onClick={() => setKind('')}>All</button>
            <button type="button" className={kind === 'sign_in' ? 'on' : ''} onClick={() => setKind('sign_in')}>Sign-ins</button>
            <button type="button" className={kind === 'open' ? 'on' : ''} onClick={() => setKind('open')}>Opens</button>
          </div>
        </div>
        {shown.length === 0 ? <p className="small muted">Nothing to show.</p> : (
          <ul className="list login-list">
            {shown.slice(0, 300).map((r, i) => (
              <li key={i} className="list-row">
                <i className={`dot ${r.kind === 'sign_in' ? 'c-booked' : 'c-quote'}`} />
                <div className="grow">
                  <div className="row-title">{r.full_name || 'Unnamed'} <span className="muted small">{r.kind === 'sign_in' ? 'signed in' : 'opened the app'}</span></div>
                  <div className="row-sub">{stamp(r.at)}{r.device ? ` · ${r.device}` : ''}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
