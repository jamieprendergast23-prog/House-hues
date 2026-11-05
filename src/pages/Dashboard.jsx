import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { today, addDays, hireEnd, fmtDate, daysUntil, money } from '../lib/format'
import { Loading } from '../components/ui'
import { jobEvents, EventRow } from './Calendar'

export default function Dashboard() {
  const [d, setD] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('jobs').select('*, clients(name), job_finance(*)').not('status', 'in', '(cancelled,complete)'),
      supabase.from('booking_requests').select('*').eq('status', 'new').order('created_at', { ascending: false }),
      supabase.from('v_items').select('id, status, out_job_id, condition'),
    ]).then(([j, r, i]) => setD({ jobs: j.data || [], requests: r.data || [], items: i.data || [] }))
  }, [])

  if (!d) return <Loading />

  const t = today(), horizon = addDays(t, 14)
  const upcoming = jobEvents(d.jobs).filter((e) => e.date >= t && e.date <= horizon)
  const ending = d.jobs.filter((j) => j.type === 'staging' && j.status === 'installed' && j.install_date)
    .map((j) => ({ ...j, end: hireEnd(j) }))
    .filter((j) => daysUntil(j.end) <= 7)
    .sort((a, b) => a.end.localeCompare(b.end))
  const owing = d.jobs.filter((j) => {
    const f = j.job_finance
    return f?.quote_amount && !f.paid_in_full_on && ['installed', 'collected', 'packing', 'booked'].includes(j.status)
  })
  const live = d.items.filter((i) => i.status !== 'retired')
  const out = live.filter((i) => i.out_job_id).length
  const repair = live.filter((i) => i.status === 'repair').length

  return (
    <div className="stack">
      <h1>Hi there</h1>

      <div className="stats">
        <Link to="/inventory" className="stat"><b>{live.length}</b><span>pieces</span></Link>
        <Link to="/inventory" className="stat"><b>{out}</b><span>out on jobs</span></Link>
        <Link to="/inventory" className="stat"><b>{live.length - out - repair}</b><span>in the shed</span></Link>
        {repair > 0 && <Link to="/inventory" className="stat warn"><b>{repair}</b><span>need repair</span></Link>}
      </div>

      {d.requests.length > 0 && (
        <section className="card highlight">
          <h2>New booking requests ({d.requests.length})</h2>
          <ul className="list">
            {d.requests.slice(0, 4).map((r) => (
              <li key={r.id}><Link className="list-row" to="/requests"><div className="grow">
                <div className="row-title">{r.property_address}</div>
                <div className="row-sub">{r.name}{r.agency ? `, ${r.agency}` : ''} · {r.service_type}{r.preferred_date ? ` · wants ${fmtDate(r.preferred_date)}` : ''}</div>
              </div></Link></li>
            ))}
          </ul>
        </section>
      )}

      {ending.length > 0 && (
        <section className="card">
          <h2>Hire ending soon</h2>
          <ul className="list">
            {ending.map((j) => (
              <li key={j.id}><Link className="list-row" to={`/jobs/${j.id}`}><div className="grow">
                <div className="row-title">{j.property_address}</div>
                <div className="row-sub">
                  {daysUntil(j.end) < 0 ? `Ended ${-daysUntil(j.end)} days ago` : `Ends ${fmtDate(j.end)}`}
                  {j.collection_date ? ` · collection ${fmtDate(j.collection_date)}` : ' · no collection booked'}
                </div>
              </div></Link></li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="row between"><h2>Next 2 weeks</h2><Link to="/calendar" className="small">Calendar →</Link></div>
        {upcoming.length === 0 ? <p className="muted">Nothing booked.</p> : (
          <ul className="list">{upcoming.map((e, i) => <EventRow key={i} e={e} showDate />)}</ul>
        )}
      </section>

      {owing.length > 0 && (
        <section className="card">
          <h2>Payments to chase</h2>
          <ul className="list">
            {owing.map((j) => {
              const f = j.job_finance
              const bal = Number(f.quote_amount) - (f.deposit_paid_on ? Number(f.deposit_amount || 0) : 0)
              return (
                <li key={j.id}><Link className="list-row" to={`/jobs/${j.id}`}><div className="grow">
                  <div className="row-title">{j.property_address}</div>
                  <div className="row-sub">{money(bal)} owing{j.clients?.name ? ` · ${j.clients.name}` : ''}</div>
                </div></Link></li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
