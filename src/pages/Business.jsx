import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, fetchAll } from '../lib/supabase'
import { today, addDays, hireEnd, fmtDate, toISO } from '../lib/format'
import { Loading } from '../components/ui'

// Statuses that count as won work (anything past "quote sent", not cancelled)
const WON = new Set(['accepted', 'booked', 'packing', 'installed', 'collected', 'complete', 'paid', 'consult_booked', 'follow_up_sent', 'in_progress'])
const OPEN_QUOTE = new Set(['enquiry', 'site_visit', 'quote_sent'])

const PERIODS = [
  ['month', 'This month'],
  ['quarter', 'Last 3 months'],
  ['year', 'This year'],
  ['12m', 'Last 12 months'],
]

function periodRange(p) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const end = toISO(new Date(y, m + 1, 0))
  if (p === 'month') return [toISO(new Date(y, m, 1)), end]
  if (p === 'quarter') return [toISO(new Date(y, m - 2, 1)), end]
  if (p === 'year') return [`${y}-01-01`, `${y}-12-31`]
  return [toISO(new Date(y, m - 11, 1)), end]
}

// the date a job "belongs" to for money: install day, else consult, else site visit, else created
const jobDate = (j) => j.install_date || j.consult_date || j.site_visit_date || j.created_at?.slice(0, 10)
const price = (j) => Number(j.job_finance?.quote_amount) || 0
const received = (j) => {
  const f = j.job_finance
  if (!f) return 0
  if (f.paid_in_full_on) return Number(f.quote_amount) || 0
  if (f.deposit_paid_on) return Number(f.deposit_amount) || 0
  return 0
}
const money = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }))
const pct = (n) => `${Math.round(n)}%`

export default function Business() {
  const [d, setD] = useState(null)
  const [period, setPeriod] = useState('month')

  useEffect(() => {
    Promise.all([
      fetchAll(() => supabase.from('jobs').select('*, clients(name, agency), job_finance(*)').order('created_at')),
      fetchAll(() => supabase.from('v_items').select('id, name, sku, category, status, photo_url, out_job_id, condition').order('code')),
      fetchAll(() => supabase.from('item_costs').select('item_id, purchase_cost, replacement_value').order('item_id')),
      fetchAll(() => supabase.from('job_items').select('item_id, job_id, packed_at').order('id')),
    ]).then(([jobs, items, costs, lines]) => setD({ jobs, items, costs, lines }))
      .catch(() => setD({ jobs: [], items: [], costs: [], lines: [] }))
  }, [])

  const s = useMemo(() => {
    if (!d) return null
    const [from, to] = periodRange(period)
    const t = today(), soon = addDays(t, 14)
    const live = d.jobs.filter((j) => j.status !== 'cancelled')
    const inPeriod = (j) => { const x = jobDate(j); return x && x >= from && x <= to }

    // money
    const won = live.filter((j) => WON.has(j.status) && inPeriod(j))
    const booked = won.reduce((a, j) => a + price(j), 0)
    const got = won.reduce((a, j) => a + received(j), 0)
    const noPrice = won.filter((j) => !price(j)).length
    const priced = won.filter((j) => price(j))
    const owing = live.filter((j) => WON.has(j.status) && price(j) && !j.job_finance?.paid_in_full_on)
      .map((j) => ({ ...j, owed: price(j) - received(j) }))
      .filter((j) => j.owed > 0)
      .sort((a, b) => (jobDate(a) || '').localeCompare(jobDate(b) || ''))

    // pipeline
    const quotes = live.filter((j) => OPEN_QUOTE.has(j.status))
    const decided = d.jobs.filter((j) => inPeriod(j) && (WON.has(j.status) || j.status === 'cancelled'))
    const winRate = decided.length ? (decided.filter((j) => WON.has(j.status)).length / decided.length) * 100 : null
    const staging = live.filter((j) => j.type === 'staging' && j.install_date)
    const outNow = staging.filter((j) => j.install_date <= t && t <= (j.collection_date || hireEnd(j)) && !['collected', 'complete'].includes(j.status))
    const installsSoon = staging.filter((j) => j.install_date >= t && j.install_date <= soon)
    const packupsSoon = staging.filter((j) => { const c = j.collection_date || hireEnd(j); return c >= t && c <= soon })

    // 12-month booked value, by month of the job date
    const months = Array.from({ length: 12 }, (_, i) => {
      const dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - 11 + i)
      return { key: toISO(dt).slice(0, 7), label: dt.toLocaleDateString('en-AU', { month: 'short' }), year: dt.getFullYear(), value: 0, jobs: 0 }
    })
    const byKey = Object.fromEntries(months.map((m) => [m.key, m]))
    for (const j of live) {
      if (!WON.has(j.status)) continue
      const m = byKey[(jobDate(j) || '').slice(0, 7)]
      if (m) { m.value += price(j); m.jobs++ }
    }

    // stock
    const pieces = d.items.filter((i) => i.status !== 'retired')
    const out = pieces.filter((i) => i.out_job_id).length
    const repair = pieces.filter((i) => i.status === 'repair' || ['damaged', 'needs_repair'].includes(i.condition)).length
    const ids = new Set(pieces.map((i) => i.id))
    const cost = d.costs.filter((c) => ids.has(c.item_id))
    const stockCost = cost.reduce((a, c) => a + (Number(c.purchase_cost) || 0), 0)
    const replace = cost.reduce((a, c) => a + (Number(c.replacement_value) || 0), 0)
    const uses = new Map()
    for (const l of d.lines) if (l.packed_at) {
      if (!uses.has(l.item_id)) uses.set(l.item_id, new Set())
      uses.get(l.item_id).add(l.job_id)
    }
    const used = pieces.map((i) => ({ ...i, uses: uses.get(i.id)?.size || 0 }))
    const never = used.filter((i) => !i.uses).length
    // one row per product (A1 ×6 counts as one), counting the houses any of them went to
    const prods = new Map()
    for (const i of pieces) {
      const k = `${i.sku || ''}\u0000${i.name}`
      const g = prods.get(k) || { ...i, count: 0, jobs: new Set() }
      g.count++
      if (!g.photo_url && i.photo_url) g.photo_url = i.photo_url
      for (const j of uses.get(i.id) || []) g.jobs.add(j)
      prods.set(k, g)
    }
    const top = [...prods.values()].map((g) => ({ ...g, uses: g.jobs.size })).filter((g) => g.uses)
      .sort((a, b) => b.uses - a.uses).slice(0, 8)

    // agents who bring the work
    const agents = new Map()
    for (const j of won) {
      const key = j.client_id || 'none'
      const a = agents.get(key) || { name: j.clients ? [j.clients.name, j.clients.agency].filter(Boolean).join(', ') : 'No client set', jobs: 0, value: 0 }
      a.jobs++; a.value += price(j); agents.set(key, a)
    }
    const topAgents = [...agents.values()].sort((a, b) => b.value - a.value || b.jobs - a.jobs).slice(0, 5)


    return {
      from, to, won, booked, got, noPrice, avg: priced.length ? booked / priced.length : null, owing,
      quotes, quoteValue: quotes.reduce((a, j) => a + price(j), 0), winRate, outNow, installsSoon, packupsSoon, months,
      pieces: pieces.length, out, util: pieces.length ? (out / pieces.length) * 100 : 0, repair, stockCost, replace, top, never,
      topAgents,
    }
  }, [d, period])

  if (!s) return <Loading />
  const owedTotal = s.owing.reduce((a, j) => a + j.owed, 0)

  return (
    <div className="stack biz">
      <div className="page-head">
        <h1>Business details</h1>
        <div className="seg" role="tablist" aria-label="Period">
          {PERIODS.map(([k, l]) => <button key={k} type="button" className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
      </div>
      <p className="small muted">{fmtDate(s.from, { day: 'numeric', month: 'short', year: 'numeric' })} to {fmtDate(s.to, { day: 'numeric', month: 'short', year: 'numeric' })} · by install date (or consult date)</p>

      <section>
        <h2>Money</h2>
        <div className="stats">
          <div className="stat"><b>{money(s.booked)}</b><span>booked work · {s.won.length} job{s.won.length === 1 ? '' : 's'}</span></div>
          <div className="stat"><b>{money(s.got)}</b><span>received</span></div>
          <div className={`stat ${owedTotal ? 'warn' : ''}`}><b>{money(owedTotal)}</b><span>still owed (all time)</span></div>
          <div className="stat"><b>{s.avg !== null ? money(s.avg) : '—'}</b><span>average job</span></div>
        </div>
        {s.noPrice > 0 && (
          <p className="note small">{s.noPrice} booked job{s.noPrice === 1 ? ' has' : 's have'} no price yet, so totals are low. Add the price in <b>Payment</b> on each house.</p>
        )}
      </section>

      <section className="card">
        <div className="row between"><h2>Booked work by month</h2><span className="small muted">last 12 months</span></div>
        <MonthBars months={s.months} />
      </section>

      <div className="biz-grid">
        <section className="card">
          <h2>Pipeline</h2>
          <dl className="dl">
            <dt>Open quotes</dt><dd>{s.quotes.length}{s.quoteValue ? ` · ${money(s.quoteValue)}` : ''}</dd>
            <dt>Quotes won</dt><dd>{s.winRate !== null ? pct(s.winRate) : '—'}</dd>
            <dt>Houses out now</dt><dd>{s.outNow.length}</dd>
            <dt>Installs, next 2 weeks</dt><dd>{s.installsSoon.length}</dd>
            <dt>Pack-ups, next 2 weeks</dt><dd>{s.packupsSoon.length}</dd>
          </dl>
          <Link to="/houses" className="small">Open Houses →</Link>
        </section>

        <section className="card">
          <h2>Owed to you</h2>
          {s.owing.length === 0 ? <p className="small muted">Nothing owed. 🎉</p> : (
            <ul className="list">
              {s.owing.slice(0, 6).map((j) => (
                <li key={j.id}><Link className="list-row" to={`/jobs/${j.id}`}>
                  <div className="grow">
                    <div className="row-title">{j.property_address}</div>
                    <div className="row-sub">{j.clients?.name || 'No client'}{jobDate(j) ? ` · ${fmtDate(jobDate(j))}` : ''}{j.job_finance?.deposit_paid_on ? ' · deposit paid' : ''}</div>
                  </div>
                  <b>{money(j.owed)}</b>
                </Link></li>
              ))}
            </ul>
          )}
          {s.owing.length > 6 && <p className="small muted">+{s.owing.length - 6} more</p>}
        </section>

        <section className="card">
          <h2>Stock</h2>
          <div className="meter" role="img" aria-label={`${pct(s.util)} of pieces out on hire`}>
            <span style={{ width: `${Math.min(100, s.util)}%` }} />
          </div>
          <p className="small"><b>{pct(s.util)}</b> of pieces out on hire now ({s.out} of {s.pieces})</p>
          <dl className="dl">
            <dt>Paid for stock</dt><dd>{s.stockCost ? money(s.stockCost) : '—'}</dd>
            <dt>Replacement value</dt><dd>{s.replace ? money(s.replace) : '—'}</dd>
            <dt>Need repair</dt><dd>{s.repair}</dd>
            <dt>Never used</dt><dd>{s.never} piece{s.never === 1 ? '' : 's'}</dd>
          </dl>
        </section>

      </div>

      <div className="biz-grid">
        <section className="card">
          <h2>Top agents <span className="muted small">this period</span></h2>
          {s.topAgents.length === 0 ? <p className="small muted">No booked work in this period.</p> : (
            <ul className="list">
              {s.topAgents.map((a) => (
                <li key={a.name} className="list-row">
                  <div className="grow"><div className="row-title">{a.name}</div><div className="row-sub">{a.jobs} job{a.jobs === 1 ? '' : 's'}</div></div>
                  <b>{a.value ? money(a.value) : '—'}</b>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Hardest-working pieces</h2>
          {s.top.length === 0 ? <p className="small muted">Pieces show here once they’ve been out to a house.</p> : (
            <ul className="list">
              {s.top.map((i) => (
                <li key={i.id}><Link className="list-row" to={`/inventory/${i.id}`}>
                  {i.photo_url ? <img className="biz-thumb" src={i.photo_url} alt="" loading="lazy" /> : <span className="biz-thumb" />}
                  <div className="grow"><div className="row-title">{i.name}</div><div className="row-sub">{[i.sku, i.category, i.count > 1 && `${i.count} pieces`].filter(Boolean).join(' · ')}</div></div>
                  <b title="houses">{i.uses} house{i.uses === 1 ? '' : 's'}</b>
                </Link></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

/** Single-series column chart: booked value per month, hover/tap for detail. */
function MonthBars({ months }) {
  const [hover, setHover] = useState(null)
  const [W, setW] = useState(640)
  const box = useRef(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const max = Math.max(...months.map((m) => m.value), 1)
  const H = W < 500 ? 150 : 180, padB = 22, padT = 18, gap = 2
  const bw = W / months.length
  const nowKey = toISO(new Date()).slice(0, 7)
  const any = months.some((m) => m.value)
  const h = hover !== null ? months[hover] : null

  return (
    <div className="mbars" ref={box}>
      {!any && <p className="small muted">No priced jobs in the last 12 months yet.</p>}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Booked work per month: ${months.map((m) => `${m.label} ${money(m.value)}`).join(', ')}`}
        onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H - padB} y2={H - padB} className="mb-axis" />
        {months.map((m, i) => {
          const bh = m.value ? Math.max(4, ((H - padB - padT) * m.value) / max) : 0
          const x = i * bw + gap, w = bw - gap * 2, y = H - padB - bh
          const r = Math.min(4, w / 2, bh)
          return (
            <g key={m.key} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={i * bw} y="0" width={bw} height={H} fill="transparent" />
              {bh > 0 && (
                <path className={`mb-bar ${m.key === nowKey ? 'now' : ''} ${hover === i ? 'hot' : ''}`}
                  d={`M${x},${H - padB} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${H - padB} Z`} />
              )}
              <text x={x + w / 2} y={H - 6} textAnchor="middle" className="mb-label">{bw < 36 ? m.label[0] : m.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="mb-tip small" aria-live="polite">
        {h ? <><b>{h.label} {h.year}</b> · {money(h.value)} · {h.jobs} job{h.jobs === 1 ? '' : 's'}</> : <span className="muted">Tap a month for detail. Peak {money(max === 1 ? 0 : max)}.</span>}
      </div>
    </div>
  )
}
