import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { EVENT_KINDS } from '../lib/constants'
import { toISO, today, hireEnd, fmtLong, parseDate } from '../lib/format'
import { Loading, TypeTag } from '../components/ui'

export function jobEvents(jobs) {
  const ev = []
  for (const j of jobs) {
    if (j.status === 'cancelled') continue
    const dates = { ...j, hire_end: j.type === 'staging' ? hireEnd(j) : null }
    for (const k of Object.keys(EVENT_KINDS)) {
      if (dates[k]) ev.push({ date: dates[k], kind: k, job: j, ...EVENT_KINDS[k] })
    }
  }
  return ev.sort((a, b) => a.date.localeCompare(b.date))
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function CalendarPage() {
  const [jobs, setJobs] = useState(null)
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [day, setDay] = useState(today())

  useEffect(() => {
    supabase.from('jobs').select('*, clients(name)').neq('status', 'cancelled').then(({ data }) => setJobs(data || []))
  }, [])

  const events = useMemo(() => jobEvents(jobs || []), [jobs])
  const byDate = useMemo(() => events.reduce((a, e) => ((a[e.date] ||= []).push(e), a), {}), [events])

  // jobs whose furniture is in a house on a given day
  const onHire = (d) => (jobs || []).filter((j) => j.type === 'staging' && j.install_date && j.install_date <= d &&
    d <= (j.collection_date || hireEnd(j)) && !['complete'].includes(j.status))

  const cells = useMemo(() => {
    const first = new Date(month)
    const offset = (first.getDay() + 6) % 7 // Monday start
    const start = new Date(first); start.setDate(1 - offset)
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [month])

  if (!jobs) return <Loading />

  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const dayEvents = byDate[day] || []
  const hire = onHire(day)

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{month.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</h1>
        <div className="row">
          <button className="btn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
          <button className="btn" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setDay(today()) }}>Today</button>
          <button className="btn" onClick={() => shift(1)} aria-label="Next month">›</button>
        </div>
      </div>

      <div className="legend">
        {['ev-visit', 'ev-pack', 'ev-install', 'ev-end', 'ev-collect'].map((c, i) => (
          <span key={c}><i className={`dot ${c}`} />{['Visit / consult', 'Pack / unpack', 'Install', 'Hire ends', 'Collection'][i]}</span>
        ))}
      </div>

      <div className="cal">
        {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {cells.map((d) => {
          const iso = toISO(d)
          const evs = byDate[iso] || []
          const hireN = onHire(iso).length
          return (
            <button key={iso} onClick={() => setDay(iso)}
              className={`cal-cell ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${iso === today() ? 'is-today' : ''} ${iso === day ? 'sel' : ''}`}>
              <span className="cal-num">{d.getDate()}</span>
              <span className="cal-evs">
                {evs.slice(0, 3).map((e, i) => (
                  <span key={i} className={`cal-ev ${e.cls}`}><span className="cal-ev-txt">{e.label} · {e.job.property_address}</span></span>
                ))}
                {evs.length > 3 && <span className="cal-more">+{evs.length - 3}</span>}
              </span>
              {hireN > 0 && <span className="cal-hire" title={`${hireN} on hire`}>{hireN}</span>}
            </button>
          )
        })}
      </div>

      <section className="card">
        <h2>{fmtLong(day)}</h2>
        {dayEvents.length === 0 && <p className="muted">Nothing scheduled.</p>}
        <ul className="list">
          {dayEvents.map((e, i) => <EventRow key={i} e={e} />)}
        </ul>
        {hire.length > 0 && (
          <>
            <h3>On hire ({hire.length})</h3>
            <ul className="list">
              {hire.map((j) => (
                <li key={j.id}><Link className="list-row" to={`/jobs/${j.id}`}><div className="grow">
                  <div className="row-title">{j.property_address}</div>
                  <div className="row-sub">until {parseDate(j.collection_date || hireEnd(j)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</div>
                </div></Link></li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

export function EventRow({ e, showDate }) {
  return (
    <li>
      <Link className="list-row" to={`/jobs/${e.job.id}`}>
        <i className={`dot ${e.cls}`} />
        <div className="grow">
          <div className="row-title">{e.label}{showDate ? ` · ${parseDate(e.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}</div>
          <div className="row-sub">{e.job.property_address}{e.job.clients?.name ? ` · ${e.job.clients.name}` : ''}</div>
        </div>
        <TypeTag type={e.job.type} />
      </Link>
    </li>
  )
}
