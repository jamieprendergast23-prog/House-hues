import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, fetchAll, friendlyError } from '../lib/supabase'
import { today, addDays, hireEnd, parseDate, toISO } from '../lib/format'
import { toast } from '../lib/toast'
import { Loading } from '../components/ui'
import { jobEvents } from './Calendar'
import { columnOf } from './Houses'

const WON = new Set(['accepted', 'booked', 'packing', 'installed', 'collected', 'complete', 'paid', 'consult_booked', 'follow_up_sent', 'in_progress'])
const cash = (n) => Number(n || 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
const short = (iso) => parseDate(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
const price = (j) => Number(j.job_finance?.quote_amount) || 0
const got = (j) => { const f = j.job_finance; return !f ? 0 : f.paid_in_full_on ? Number(f.quote_amount) || 0 : f.deposit_paid_on ? Number(f.deposit_amount) || 0 : 0 }

// small line icons, drawn in the tile's ink colour
const I = {
  cal: <path d="M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />,
  house: <path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-5h4v5" />,
  box: <path d="M4 8l8-4 8 4-8 4-8-4zm0 0v8l8 4 8-4V8M12 12v8" />,
  money: <path d="M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v4M18 10v4" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0" />,
}
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[name]}</svg>
)

function Tile({ icon, tone, title, badge, badgeTone = 'ok', to, action, children }) {
  return (
    <section className="tile-card">
      <header className="tc-head">
        <span className={`tc-icon ${tone}`}><Icon name={icon} /></span>
        <h2>{title}</h2>
        {badge && <span className={`tc-badge ${badgeTone}`}>{badge}</span>}
      </header>
      <div className="tc-body">{children}</div>
      <Link to={to} className="btn btn-block tc-btn">{action}</Link>
    </section>
  )
}

export default function Dashboard2() {
  const [d, setD] = useState(null)

  const load = () => Promise.all([
    fetchAll(() => supabase.from('jobs').select('*, clients(name), job_finance(*)').order('created_at')),
    fetchAll(() => supabase.from('v_items').select('id, status, out_job_id, condition').order('code')),
    fetchAll(() => supabase.from('job_items').select('id, job_id, packed_at, returned_at, missing_at').order('id')),
    supabase.from('reminders').select('*, jobs(id, property_address, status)').is('done_at', null).order('due_date').then((r) => r.data || []),
  ]).then(([jobs, items, lines, reminders]) => setD({ jobs, items, lines, reminders: reminders.filter((r) => r.jobs && r.jobs.status !== 'cancelled') }))
    .catch((e) => { toast(friendlyError(e), 'error'); setD({ jobs: [], items: [], lines: [], reminders: [] }) })
  useEffect(() => { load() }, [])

  const s = useMemo(() => {
    if (!d) return null
    const t = today(), week = addDays(t, 7)
    const live = d.jobs.filter((j) => j.status !== 'cancelled')

    // calendar
    const events = jobEvents(live).filter((e) => e.date >= t)
    const todayCount = events.filter((e) => e.date === t).length
    const weekCount = events.filter((e) => e.date <= week).length

    // houses
    const cols = { quote: [], booked: [], out: [], packup: [] }
    for (const j of live) { const c = columnOf(j); if (c) cols[c].push(j) }
    const next = live.filter((j) => j.type === 'staging' && j.install_date >= t && !['installed', 'collected', 'complete'].includes(j.status))
      .sort((a, b) => a.install_date.localeCompare(b.install_date))[0]
    let nextProg = null
    if (next) {
      const ls = d.lines.filter((l) => l.job_id === next.id)
      nextProg = { total: ls.length, packed: ls.filter((l) => l.packed_at).length }
    }
    const endingSoon = cols.out.filter((j) => { const e = j.collection_date || hireEnd(j); return e && e <= week }).length

    // stock
    const pieces = d.items.filter((i) => i.status !== 'retired')
    const out = pieces.filter((i) => i.out_job_id).length
    const repair = pieces.filter((i) => i.status === 'repair' || i.condition === 'needs_repair').length
    const missing = d.lines.filter((l) => l.missing_at && !l.returned_at).length

    // money (this month, by install / consult date)
    const ym = t.slice(0, 7)
    const dateOf = (j) => j.install_date || j.consult_date || j.site_visit_date || j.created_at?.slice(0, 10)
    const month = live.filter((j) => WON.has(j.status) && (dateOf(j) || '').startsWith(ym))
    const owing = live.filter((j) => WON.has(j.status) && price(j) && !j.job_finance?.paid_in_full_on)
      .map((j) => ({ ...j, owed: price(j) - got(j) })).filter((j) => j.owed > 0).sort((a, b) => b.owed - a.owed)
    const last6 = Array.from({ length: 6 }, (_, i) => {
      const dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - 5 + i)
      const k = toISO(dt).slice(0, 7)
      return { k, label: dt.toLocaleDateString('en-AU', { month: 'short' }), v: live.filter((j) => WON.has(j.status) && (dateOf(j) || '').startsWith(k)).reduce((a, j) => a + price(j), 0) }
    })

    // reminders
    const overdue = d.reminders.filter((r) => r.due_date < t)


    return {
      t, events: events.slice(0, 4), todayCount, weekCount,
      cols, next, nextProg, endingSoon,
      pieces: pieces.length, out, repair, missing, inShed: pieces.length - out - repair,
      booked: month.reduce((a, j) => a + price(j), 0), received: month.reduce((a, j) => a + got(j), 0), monthJobs: month.length,
      owing, owedTotal: owing.reduce((a, j) => a + j.owed, 0), last6,
      reminders: d.reminders.slice(0, 4), overdue: overdue.length, remCount: d.reminders.length,
    }
  }, [d])

  const tick = async (r) => {
    const { error } = await supabase.from('reminders').update({ done_at: new Date().toISOString() }).eq('id', r.id)
    if (error) return toast(friendlyError(error), 'error')
    toast('Done'); load()
  }

  if (!s) return <Loading />
  const util = s.pieces ? Math.round((s.out / s.pieces) * 100) : 0
  const max6 = Math.max(...s.last6.map((m) => m.v), 1)

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Dashboard</h1>
        <span className="small muted">{parseDate(s.t).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>

      <div className="tiles">
        <Tile icon="cal" tone="t-rose" title="Calendar" to="/calendar" action="Open Calendar"
          badge={s.todayCount ? `${s.todayCount} today` : s.weekCount ? `${s.weekCount} this week` : null} badgeTone="info">
          {s.events.length === 0 ? <p className="tc-empty">Nothing coming up.</p> : s.events.map((e, i) => (
            <Link key={i} to={`/jobs/${e.job.id}`} className="tc-row">
              <i className={`dot ${e.cls}`} />
              <div className="grow">
                <div className="tc-title">{e.date === s.t ? 'Today' : short(e.date)}</div>
                <div className="tc-sub">{e.label} · {e.job.property_address}</div>
              </div>
            </Link>
          ))}
        </Tile>

        <Tile icon="house" tone="t-sage" title="Houses" to="/houses" action="Open Houses"
          badge={s.cols.out.length ? `${s.cols.out.length} out` : null} badgeTone="ok">
          <div className="tc-row tc-counts">
            {[['quote', 'Quotes', 'c-quote'], ['booked', 'Booked', 'c-booked'], ['out', 'Out', 'c-out'], ['packup', 'Pack-ups', 'c-pack']].map(([k, l, c]) => (
              <span key={k}><i className={`dot ${c}`} /><b>{s.cols[k].length}</b> {l}</span>
            ))}
          </div>
          {s.next ? (
            <Link to={`/jobs/${s.next.id}`} className="tc-row tc-col">
              <div className="row between"><span className="tc-title">Next install: {s.next.property_address}</span><span className="tc-sub">{short(s.next.install_date)}</span></div>
              {s.nextProg.total > 0 ? (
                <>
                  <div className="meter"><span style={{ width: `${(s.nextProg.packed / s.nextProg.total) * 100}%` }} /></div>
                  <div className="tc-sub">{s.nextProg.packed} of {s.nextProg.total} pieces packed</div>
                </>
              ) : <div className="tc-sub">No furniture picked yet</div>}
            </Link>
          ) : <p className="tc-empty">No installs booked.</p>}
          {s.endingSoon > 0 && <div className="tc-row"><span className="tc-sub"><b>{s.endingSoon}</b> hire{s.endingSoon === 1 ? '' : 's'} ending this week</span></div>}
        </Tile>

        <Tile icon="box" tone="t-sand" title="Stock" to="/inventory" action="Open Stock"
          badge={s.missing ? `${s.missing} missing` : s.repair ? `${s.repair} to repair` : null} badgeTone={s.missing ? 'urgent' : 'warn'}>
          <div className="tc-row tc-col tc-hero">
            <b>{s.out} of {s.pieces}</b>
            <span className="tc-sub">pieces out on hire ({util}%)</span>
            <div className="meter"><span style={{ width: `${util}%` }} /></div>
          </div>
          <div className="tc-row tc-counts">
            <span><b>{s.inShed}</b> in shed</span>
            <span><b>{s.repair}</b> repair</span>
            <span><b>{s.missing}</b> missing</span>
          </div>
        </Tile>

        <Tile icon="money" tone="t-plum" title="Money" to="/business" action="Business details"
          badge={s.owedTotal ? `${cash(s.owedTotal)} owed` : 'All paid'} badgeTone={s.owedTotal ? 'urgent' : 'ok'}>
          <div className="tc-row tc-counts">
            <span><b>{cash(s.booked)}</b> booked</span>
            <span><b>{cash(s.received)}</b> received</span>
          </div>
          <div className="tc-mini" role="img" aria-label={`Booked work, last 6 months: ${s.last6.map((m) => `${m.label} ${cash(m.v)}`).join(', ')}`}>
            {s.last6.map((m, i) => (
              <div key={m.k} className="tm-col" title={`${m.label}: ${cash(m.v)}`}>
                <span className={`tm-bar ${i === 5 ? 'now' : ''}`} style={{ height: `${m.v ? Math.max(6, (m.v / max6) * 100) : 0}%` }} />
                <span className="tm-l">{m.label}</span>
              </div>
            ))}
          </div>
          {s.owing.slice(0, 2).map((j) => (
            <Link key={j.id} to={`/jobs/${j.id}`} className="tc-row">
              <div className="grow"><div className="tc-title">{j.property_address}</div><div className="tc-sub">{j.job_finance?.deposit_paid_on ? 'Deposit paid' : 'Not paid'}</div></div>
              <b>{cash(j.owed)}</b>
            </Link>
          ))}
        </Tile>

        <Tile icon="bell" tone="t-gold" title="Reminders" to="/calendar" action="Open Calendar"
          badge={s.overdue ? `${s.overdue} overdue` : s.remCount ? `${s.remCount} open` : null} badgeTone={s.overdue ? 'urgent' : 'info'}>
          {s.reminders.length === 0 ? <p className="tc-empty">No reminders. Add them on a house.</p> : s.reminders.map((r) => (
            <div key={r.id} className={`tc-row ${r.due_date < s.t ? 'late' : ''}`}>
              <input type="checkbox" aria-label="Done" onChange={() => tick(r)} />
              <Link to={`/jobs/${r.job_id}`} className="grow">
                <div className="tc-title">{r.title}</div>
                <div className="tc-sub">{r.due_date < s.t ? 'Overdue · ' : ''}{short(r.due_date)} · {r.jobs.property_address}</div>
              </Link>
            </div>
          ))}
        </Tile>

      </div>
    </div>
  )
}
