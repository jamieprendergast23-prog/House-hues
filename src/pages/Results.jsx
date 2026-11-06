import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { hireEnd, fmtDate, today, addDays } from '../lib/format'
import { Loading, Empty, Brand } from '../components/ui'
import { toast } from '../lib/toast'

const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)
const money = (n) => (n == null ? '—' : `$${Number(n).toLocaleString('en-AU')}`)
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const hideNumber = (addr) => addr.replace(/^[\d\s/-]+/, '').trim()

// Proof that styling pays: days on market and sale vs guide, with before/after photos
export default function Results() {
  const [jobs, setJobs] = useState(null)
  const [photos, setPhotos] = useState([])
  const [agent, setAgent] = useState('')
  const [period, setPeriod] = useState('all')
  const [hideNos, setHideNos] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('jobs').select('id, property_address, suburb, install_date, hire_weeks, hire_end_date, listed_date, sold_date, guide_price, sale_price, agent_name, status')
        .eq('type', 'staging').neq('status', 'cancelled').not('install_date', 'is', null),
      supabase.from('job_photos').select('job_id, kind, url, room, created_at').in('kind', ['site', 'after', 'design']).order('created_at'),
    ]).then(([j, p]) => { setJobs(j.data || []); setPhotos(p.data || []) })
  }, [])

  const agents = useMemo(() => [...new Set((jobs || []).map((j) => j.agent_name).filter(Boolean))].sort(), [jobs])

  const rows = useMemo(() => {
    if (!jobs) return []
    const from = period === '12m' ? addDays(today(), -365) : period === '6m' ? addDays(today(), -183) : null
    return jobs
      .filter((j) => !agent || j.agent_name === agent)
      .filter((j) => !from || (j.install_date >= from))
      .map((j) => {
        const start = j.listed_date || j.install_date
        const dom = j.sold_date ? days(start, j.sold_date) : null
        const pct = j.guide_price && j.sale_price ? ((j.sale_price - j.guide_price) / j.guide_price) * 100 : null
        const before = photos.find((p) => p.job_id === j.id && p.kind === 'site')
        const after = photos.find((p) => p.job_id === j.id && p.kind === 'after') || photos.find((p) => p.job_id === j.id && p.kind === 'design')
        return { ...j, dom, pct, withinHire: j.sold_date ? j.sold_date <= hireEnd(j) : null, before, after }
      })
      .sort((a, b) => (b.sold_date || b.install_date).localeCompare(a.sold_date || a.install_date))
  }, [jobs, photos, agent, period])

  if (!jobs) return <Loading />

  const sold = rows.filter((r) => r.sold_date)
  const doms = sold.map((r) => r.dom).filter((x) => x !== null && x >= 0)
  const pcts = sold.map((r) => r.pct).filter((x) => x !== null)
  const within = sold.filter((r) => r.withinHire).length
  const stats = {
    styled: rows.length,
    sold: sold.length,
    avgDom: doms.length ? Math.round(doms.reduce((a, b) => a + b, 0) / doms.length) : null,
    medDom: median(doms),
    avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    within: sold.length ? Math.round((within / sold.length) * 100) : null,
  }
  const addr = (r) => (hideNos ? hideNumber(r.property_address) : r.property_address) + (r.suburb ? `, ${r.suburb}` : '')

  const copy = () => {
    const lines = [
      `House & Hues styling results${agent ? ` with ${agent}` : ''}`,
      `${stats.styled} homes styled, ${stats.sold} sold`,
      stats.avgDom !== null && `Average ${stats.avgDom} days on market (median ${stats.medDom})`,
      stats.within !== null && `${stats.within}% sold within the hire period`,
      stats.avgPct !== null && `Average ${stats.avgPct >= 0 ? '+' : ''}${stats.avgPct.toFixed(1)}% vs price guide`,
      '',
      ...sold.map((r) => `${addr(r)}: ${r.dom} days${r.pct !== null ? `, ${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}% vs guide` : ''}`),
    ].filter((x) => x !== false)
    navigator.clipboard?.writeText(lines.join('\n')).then(() => toast('Summary copied'), () => toast('Couldn’t copy', 'error'))
  }

  return (
    <div className="results-page stack">
      <div className="print-only"><Brand large /></div>
      <div className="page-head">
        <h1>Results{agent ? <span className="muted small"> with {agent}</span> : null}</h1>
        <div className="row no-print">
          <button className="btn" onClick={copy}>Copy summary</button>
          <button className="btn btn-primary" onClick={() => window.print()}>Print / PDF</button>
        </div>
      </div>

      <div className="row no-print">
        <select value={agent} onChange={(e) => setAgent(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All agents</option>
          {agents.map((a) => <option key={a}>{a}</option>)}
        </select>
        <div className="seg">
          {[['all', 'All time'], ['12m', '12 months'], ['6m', '6 months']].map(([k, l]) => (
            <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
        <label className="row small"><input type="checkbox" className="big-check" checked={hideNos} onChange={(e) => setHideNos(e.target.checked)} /> Hide house numbers</label>
      </div>

      <div className="stats">
        <div className="stat"><b>{stats.styled}</b><span>homes styled</span></div>
        <div className="stat"><b>{stats.sold}</b><span>sold</span></div>
        <div className="stat"><b>{stats.avgDom ?? '—'}</b><span>avg days on market</span></div>
        <div className="stat"><b>{stats.within !== null ? `${stats.within}%` : '—'}</b><span>sold within hire</span></div>
        <div className="stat"><b>{stats.avgPct !== null ? `${stats.avgPct >= 0 ? '+' : ''}${stats.avgPct.toFixed(1)}%` : '—'}</b><span>avg vs price guide</span></div>
      </div>

      {sold.length === 0 ? (
        <Empty>
          No sales recorded yet. On each house, fill in <b>Sale results</b> (listed date, sold date, guide and sale price) and add an <b>after</b> photo per room.
          The results build up here automatically.
        </Empty>
      ) : (
        <div className="result-grid">
          {sold.map((r) => (
            <Link key={r.id} to={`/jobs/${r.id}`} className="result-card">
              <div className="rc-photos">
                {r.before ? <figure><img src={r.before.url} alt="" loading="lazy" /><figcaption>Before</figcaption></figure> : null}
                {r.after ? <figure><img src={r.after.url} alt="" loading="lazy" /><figcaption>Styled</figcaption></figure> : null}
                {!r.before && !r.after && <div className="rc-nophoto">Add before / after photos on the house</div>}
              </div>
              <div className="rc-body">
                <div className="rc-addr">{addr(r)}</div>
                <div className="rc-nums">
                  <span><b>{r.dom}</b> days on market</span>
                  {r.pct !== null && <span><b>{r.pct >= 0 ? '+' : ''}{r.pct.toFixed(1)}%</b> vs guide</span>}
                </div>
                <div className="rc-sub">
                  Sold {fmtDate(r.sold_date)}{r.sale_price ? ` · ${money(r.sale_price)}` : ''}{r.agent_name ? ` · ${r.agent_name}` : ''}
                  {r.withinHire && ' · within hire'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {rows.length > sold.length && (
        <p className="small muted no-print">{rows.length - sold.length} styled homes have no sale recorded yet.</p>
      )}
    </div>
  )
}
