import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { today, addDays, fmtDate, hireEnd, daysUntil } from '../lib/format'
import { paymentLabel } from '../components/HireCard'
import { Loading } from '../components/ui'

// Her whiteboard, digital: houses out + end dates, pack-ups, coming up, quote stage
export default function Houses() {
  const [jobs, setJobs] = useState(null)

  useEffect(() => {
    supabase.from('jobs').select('*, clients(name), job_finance(*), job_items(count)')
      .eq('type', 'staging').neq('status', 'cancelled')
      .then(({ data }) => setJobs(data || []))
  }, [])

  if (!jobs) return <Loading />

  const t = today()
  const soon = addDays(t, 21)
  const done = (j) => ['complete', 'collected'].includes(j.status)

  const out = jobs.filter((j) => !done(j) && j.install_date && j.install_date <= t)
    .map((j) => ({ ...j, end: hireEnd(j) }))
    .sort((a, b) => (a.end || '').localeCompare(b.end || ''))

  const packUps = []
  for (const j of jobs) {
    if (j.status === 'complete') continue
    if (j.pack_date && j.pack_date >= t && j.pack_date <= soon && j.status !== 'installed') packUps.push({ j, date: j.pack_date, what: 'Pack' })
    if (j.collection_date && j.collection_date >= t && j.collection_date <= soon && !done(j)) packUps.push({ j, date: j.collection_date, what: 'Collect' })
    if (j.unpack_date && j.unpack_date >= t && j.unpack_date <= soon) packUps.push({ j, date: j.unpack_date, what: 'Unpack' })
  }
  packUps.sort((a, b) => a.date.localeCompare(b.date))
  const needCollection = out.filter((j) => !j.collection_date && j.end && daysUntil(j.end) <= 14)

  const coming = jobs.filter((j) => !done(j) && j.status !== 'quote_sent' && j.status !== 'enquiry' && (!j.install_date || j.install_date > t))
    .sort((a, b) => (a.install_date || '9').localeCompare(b.install_date || '9'))
  const quotes = jobs.filter((j) => ['quote_sent', 'enquiry'].includes(j.status))
  const recent = jobs.filter(done).sort((a, b) => (hireEnd(b) || '').localeCompare(hireEnd(a) || '')).slice(0, 6)

  return (
    <div className="houses-page stack">
      <div className="page-head">
        <h1>Houses</h1>
        <div className="row">
          <Link className="btn btn-ghost" to="/jobs">All jobs</Link>
          <Link className="btn btn-primary" to="/jobs/new">+ New house</Link>
        </div>
      </div>

      <div className="board">
        <Column title="Out & end dates" count={out.length}>
          {out.length === 0 && <p className="muted small">No houses out.</p>}
          {out.map((j) => {
            const d = daysUntil(j.end)
            return (
              <Card key={j.id} j={j} urgent={d !== null && d <= 7}>
                <div className="hc-line"><b>Ends {fmtDate(j.end)}</b> <span className={d < 0 ? 'warn-text' : d <= 7 ? 'warn-text' : 'muted'}>{d < 0 ? `${-d}d over` : d === 0 ? 'today' : `${d} days`}</span></div>
                <div className="hc-sub">Installed {fmtDate(j.install_date)} · {j.hire_weeks} wks</div>
                <Pay j={j} />
              </Card>
            )
          })}
        </Column>

        <Column title="Pack ups" count={packUps.length}>
          {needCollection.length > 0 && (
            <div className="note small">Book a collection: {needCollection.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`}>{j.property_address}</Link>
            )).reduce((a, b) => [a, ', ', b])}</div>
          )}
          {packUps.length === 0 && <p className="muted small">Nothing in the next 3 weeks.</p>}
          {packUps.map(({ j, date, what }, i) => (
            <Card key={`${j.id}${what}${i}`} j={j} to={what === 'Pack' || what === 'Collect' || what === 'Unpack' ? `/pick/${j.id}` : undefined}>
              <div className="hc-line"><b>{what} · {fmtDate(date)}</b></div>
              <div className="hc-sub">{j.job_items?.[0]?.count || 0} pieces on the list</div>
            </Card>
          ))}
        </Column>

        <Column title="Booked, coming up" count={coming.length}>
          {coming.length === 0 && <p className="muted small">Nothing booked yet.</p>}
          {coming.map((j) => (
            <Card key={j.id} j={j}>
              <div className="hc-line"><b>{j.install_date ? `Install ${fmtDate(j.install_date)}` : 'No install date yet'}</b></div>
              {j.pack_date && <div className="hc-sub">Pack {fmtDate(j.pack_date)}</div>}
              <Pay j={j} />
            </Card>
          ))}
        </Column>

        <Column title="Quote stage" count={quotes.length}>
          {quotes.length === 0 && <p className="muted small">No open quotes.</p>}
          {quotes.map((j) => (
            <Card key={j.id} j={j}>
              <div className="hc-sub">{j.clients?.name || 'No client set'}</div>
            </Card>
          ))}
        </Column>
      </div>

      {recent.length > 0 && (
        <section>
          <h2 className="field-h">Recently finished</h2>
          <div className="chips">
            {recent.map((j) => <Link key={j.id} className="chip" to={`/jobs/${j.id}`}>{j.property_address}</Link>)}
          </div>
        </section>
      )}
    </div>
  )
}

function Column({ title, count, children }) {
  return (
    <section className="board-col">
      <h2 className="board-h">{title} <span>{count}</span></h2>
      {children}
    </section>
  )
}

function Card({ j, urgent, children, to }) {
  return (
    <Link to={to || `/jobs/${j.id}`} className={`house-card ${urgent ? 'urgent' : ''}`}>
      <div className="hc-addr">{j.property_address}</div>
      {children}
    </Link>
  )
}

function Pay({ j }) {
  const p = paymentLabel(j.job_finance)
  return <span className={`pill ${p === 'Paid in full' ? 'pill-in' : p === 'Deposit paid' ? 'pill-out' : 'pill-warn'}`}>{p}</span>
}
