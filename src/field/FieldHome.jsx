import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { today, addDays, fmtDate, hireEnd } from '../lib/format'
import { Loading, Empty } from '../components/ui'
import Icon from '../components/Icon'

const ACTIVE = ['accepted', 'booked', 'packing', 'installed', 'collected']

// What's the next physical task on this job, and when?
function nextTask(j, t) {
  const steps = [
    ['Packing', j.pack_date],
    ['Install', j.install_date],
    ['Collection', j.collection_date || hireEnd(j)],
    ['Unpack', j.unpack_date],
  ].filter(([, d]) => d)
  const done = { packing: 1, installed: 2, collected: 3 }[j.status] || 0
  const remaining = steps.slice(done)
  return remaining.find(([, d]) => d >= t) || remaining[0] || null
}

export default function FieldHome() {
  const [jobs, setJobs] = useState(null)

  useEffect(() => {
    supabase.from('jobs')
      .select('id, job_number, property_address, suburb, status, pack_date, install_date, hire_weeks, collection_date, unpack_date, job_items(id, packed_at, returned_at)')
      .eq('type', 'staging').in('status', ACTIVE)
      .then(({ data }) => setJobs(data || []))
  }, [])

  if (!jobs) return <Loading />

  const t = today(), soon = addDays(t, 7)
  const withTask = jobs.map((j) => ({ ...j, task: nextTask(j, t) })).filter((j) => j.task)
    .sort((a, b) => a.task[1].localeCompare(b.task[1]))
  const todayJobs = withTask.filter((j) => j.task[1] <= t)
  const upcoming = withTask.filter((j) => j.task[1] > t && j.task[1] <= soon)
  const later = withTask.filter((j) => j.task[1] > soon)

  return (
    <div className="stack">
      <Link to="/scan" className="big-action">
        <span className="big-action-icon"><Icon name="scan" size={34} /></span>
        <span>Scan an item</span>
      </Link>

      <Section title="Today" jobs={todayJobs} empty="Nothing on today." highlight />
      <Section title="This week" jobs={upcoming} />
      {later.length > 0 && <Section title="Later" jobs={later} />}
      {withTask.length === 0 && <Empty>No jobs booked yet.</Empty>}
    </div>
  )
}

function Section({ title, jobs, empty, highlight }) {
  if (!jobs.length && !empty) return null
  return (
    <section>
      <h2 className="field-h">{title}</h2>
      {!jobs.length ? <p className="muted">{empty}</p> : jobs.map((j) => {
        const total = j.job_items.length
        const packed = j.job_items.filter((l) => l.packed_at).length
        const back = j.job_items.filter((l) => l.returned_at).length
        const returning = ['Collection', 'Unpack'].includes(j.task[0])
        const n = returning ? back : packed
        return (
          <Link key={j.id} to={`/pick/${j.id}`} className={`job-tile ${highlight ? 'today' : ''}`}>
            <div className="job-tile-task">{j.task[0]} · {fmtDate(j.task[1])}</div>
            <div className="job-tile-addr">{j.property_address}</div>
            {j.suburb && <div className="muted">{j.suburb}</div>}
            <div className="progress"><i style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></div>
            <div className="small">{n} of {total} {returning ? 'back in shed' : 'packed'}</div>
          </Link>
        )
      })}
    </section>
  )
}
