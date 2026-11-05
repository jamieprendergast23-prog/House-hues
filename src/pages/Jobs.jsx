import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmtDate, hireEnd } from '../lib/format'
import { JobPill, TypeTag, Loading, Empty } from '../components/ui'
import { ERP } from '../lib/features'

const TABS = ERP ? [
  ['active', 'Active'],
  ['enquiry', 'Enquiries & quotes'],
  ['done', 'Done'],
  ['all', 'All'],
] : [
  ['active', 'Upcoming & out'],
  ['done', 'Done'],
  ['all', 'All'],
]
const EARLY = ['enquiry', 'site_visit', 'quote_sent']
const DONE = ['complete', 'cancelled']

export default function Jobs() {
  const [jobs, setJobs] = useState(null)
  const [tab, setTab] = useState('active')
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.from('jobs')
      .select('*, clients(name, agency), job_items(count)')
      .order('install_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => setJobs(data || []))
  }, [])

  const shown = useMemo(() => {
    if (!jobs) return []
    const s = q.trim().toLowerCase()
    return jobs.filter((j) => {
      if (!ERP && j.type !== 'staging') return false
      if (tab === 'active' && ((ERP && EARLY.includes(j.status)) || DONE.includes(j.status))) return false
      if (tab === 'enquiry' && !EARLY.includes(j.status)) return false
      if (tab === 'done' && !DONE.includes(j.status)) return false
      if (!s) return true
      return [j.property_address, j.suburb, j.clients?.name, j.clients?.agency, String(j.job_number)]
        .some((v) => v?.toLowerCase().includes(s))
    })
  }, [jobs, tab, q])

  if (!jobs) return <Loading />

  return (
    <div>
      <div className="page-head">
        <h1>Jobs</h1>
        <Link className="btn btn-primary" to="/jobs/new">+ New job</Link>
      </div>
      <input className="search" placeholder="Search address, client, agency, job #" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {TABS.map(([k, l]) => <button key={k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {shown.length === 0 ? <Empty>No jobs here.</Empty> : (
        <ul className="list">
          {shown.map((j) => (
            <li key={j.id}>
              <Link className="list-row" to={`/jobs/${j.id}`}>
                <div className="grow">
                  <div className="row-title">{j.property_address}</div>
                  <div className="row-sub">
                    #{j.job_number}{j.clients ? ` · ${j.clients.name}${j.clients.agency ? `, ${j.clients.agency}` : ''}` : ''}
                  </div>
                  <div className="row-sub">{jobDates(j)}</div>
                  <div className="row-pills">
                    {ERP && <TypeTag type={j.type} />}<JobPill job={j} />
                    {j.type === 'staging' && <span className="pill pill-muted">{j.job_items?.[0]?.count || 0} items</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function jobDates(j) {
  if (j.type === 'consult') return j.consult_date ? `Consult ${fmtDate(j.consult_date)}` : 'No date yet'
  if (j.install_date) return `Install ${fmtDate(j.install_date)} → ends ${fmtDate(hireEnd(j))}`
  if (j.site_visit_date) return `Site visit ${fmtDate(j.site_visit_date)}`
  return 'No dates yet'
}
