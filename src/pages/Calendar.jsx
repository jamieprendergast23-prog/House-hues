import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, friendlyError } from '../lib/supabase'
import { toast } from '../lib/toast'
import { EVENT_KINDS } from '../lib/constants'
import { toISO, today, hireEnd, parseDate, addDays } from '../lib/format'
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
  const [reminders, setReminders] = useState([])

  const loadReminders = () => supabase.from('reminders').select('*, jobs(id, property_address, type, status)').order('due_date')
    .then(({ data }) => setReminders((data || []).filter((r) => r.jobs && r.jobs.status !== 'cancelled')))
  useEffect(() => {
    supabase.from('jobs').select('*, clients(name)').neq('status', 'cancelled').then(({ data }) => setJobs(data || []))
    loadReminders()
  }, [])

  const tick = async (r) => {
    const { error } = await supabase.from('reminders').update({ done_at: r.done_at ? null : new Date().toISOString() }).eq('id', r.id)
    if (error) return toast(friendlyError(error), 'error')
    loadReminders()
  }

  const events = useMemo(() => [
    ...jobEvents(jobs || []),
    ...reminders.map((r) => ({ date: r.due_date, kind: 'reminder', job: r.jobs, reminder: r, label: r.title, cls: `ev-remind${r.done_at ? ' is-done' : ''}` })),
  ].sort((a, b) => a.date.localeCompare(b.date)), [jobs, reminders])
  const overdue = reminders.filter((r) => !r.done_at && r.due_date < today())
  const byDate = useMemo(() => events.reduce((a, e) => ((a[e.date] ||= []).push(e), a), {}), [events])

  // jobs whose furniture is in a house on a given day
  const onHire = (d) => (jobs || []).filter((j) => j.type === 'staging' && j.install_date && j.install_date <= d &&
    d <= (j.collection_date || hireEnd(j)) && !['complete'].includes(j.status))

  const cells = useMemo(() => {
    const first = new Date(month)
    const offset = (first.getDay() + 6) % 7 // Monday start
    const start = new Date(first); start.setDate(1 - offset)
    const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const n = Math.ceil((offset + daysIn) / 7) * 7 // only the weeks this month needs
    return Array.from({ length: n }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [month])

  if (!jobs) return <Loading />

  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  // week view: Monday to Sunday around the selected day
  const sel = parseDate(day)
  const monday = new Date(sel); monday.setDate(sel.getDate() - ((sel.getDay() + 6) % 7))
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return toISO(d) })
  const weekSet = new Set(week)
  const hireWeek = (jobs || []).filter((j) => j.type === 'staging' && j.install_date && !['complete'].includes(j.status) &&
    j.install_date <= week[6] && week[0] <= (j.collection_date || hireEnd(j)))
  const shiftWeek = (n) => {
    const d = addDays(day, n * 7)
    setDay(d)
    const pd = parseDate(d)
    if (pd.getMonth() !== month.getMonth() || pd.getFullYear() !== month.getFullYear()) setMonth(new Date(pd.getFullYear(), pd.getMonth(), 1))
  }

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
        {['ev-visit', 'ev-pack', 'ev-install', 'ev-end', 'ev-collect', 'ev-remind'].map((c, i) => (
          <span key={c}><i className={`dot ${c}`} />{['Visit / consult', 'Pack / unpack', 'Install', 'Hire ends', 'Collection', 'Reminder'][i]}</span>
        ))}
      </div>

      {overdue.length > 0 && (
        <div className="note small">
          <b>{overdue.length} overdue reminder{overdue.length > 1 ? 's' : ''}</b>
          <ul className="list">
            {overdue.map((r) => (
              <li key={r.id} className="list-row">
                <input type="checkbox" checked={false} onChange={() => tick(r)} aria-label="Done" />
                <Link to={`/jobs/${r.job_id}`} className="grow">{r.title} · {r.jobs.property_address} · {parseDate(r.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="cal">
        {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {cells.map((d) => {
          const iso = toISO(d)
          const evs = byDate[iso] || []
          return (
            <button key={iso} onClick={() => setDay(iso)}
              className={`cal-cell ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${iso === today() ? 'is-today' : ''} ${iso === day ? 'sel' : ''} ${weekSet.has(iso) ? 'in-week' : ''}`}>
              <span className="cal-num">{d.getDate()}</span>
              <span className="cal-evs">
                {evs.slice(0, 3).map((e, i) => (
                  <span key={i} className={`cal-ev ${e.cls}`}><span className="cal-ev-txt">{e.label} · {e.job.property_address}</span></span>
                ))}
                {evs.length > 3 && <span className="cal-more">+{evs.length - 3}</span>}
              </span>
            </button>
          )
        })}
      </div>

      <section className="week">
        <div className="row between">
          <h2>Week of {parseDate(week[0]).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}</h2>
          <div className="row">
            <button className="btn btn-small" onClick={() => shiftWeek(-1)} aria-label="Previous week">‹</button>
            <button className="btn btn-small" onClick={() => shiftWeek(1)} aria-label="Next week">›</button>
          </div>
        </div>
        <div className="week-grid">
          {week.map((iso) => {
            const evs = byDate[iso] || []
            const d = parseDate(iso)
            return (
              <div key={iso} className={`week-day ${iso === today() ? 'is-today' : ''} ${iso === day ? 'sel' : ''}`} onClick={() => setDay(iso)}>
                <div className="wd-head">
                  <span>{d.toLocaleDateString('en-AU', { weekday: 'short' })}</span>
                  <b>{d.getDate()}</b>
                </div>
                {evs.length === 0 ? <div className="wd-empty">–</div> : evs.map((e, i) => e.reminder ? (
                  <label key={i} className={`wd-ev ${e.cls}`} onClick={(ev) => ev.stopPropagation()}>
                    <span className="wd-ev-label"><input type="checkbox" checked={Boolean(e.reminder.done_at)} onChange={() => tick(e.reminder)} /> {e.label}</span>
                    <Link to={`/jobs/${e.job.id}`} className="wd-ev-addr">{e.job.property_address}</Link>
                  </label>
                ) : (
                  <Link key={i} to={`/jobs/${e.job.id}`} className={`wd-ev ${e.cls}`}>
                    <span className="wd-ev-label">{e.label}</span>
                    <span className="wd-ev-addr">{e.job.property_address}</span>
                  </Link>
                ))}
              </div>
            )
          })}
        </div>
        {hireWeek.length > 0 && (
          <div className="week-hire">
            <span className="small muted">On hire this week ({hireWeek.length}):</span>
            <div className="chips">
              {hireWeek.map((j) => (
                <Link key={j.id} to={`/jobs/${j.id}`} className="chip">{j.property_address} · until {parseDate(j.collection_date || hireEnd(j)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</Link>
              ))}
            </div>
          </div>
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
