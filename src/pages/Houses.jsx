import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, friendlyError } from '../lib/supabase'
import { today, addDays, fmtDate, fmtLong, hireEnd, daysUntil } from '../lib/format'
import { paymentLabel } from '../components/HireCard'
import { Loading, Modal, Field } from '../components/ui'
import { toast } from '../lib/toast'

// Her whiteboard, digital: houses out + end dates, pack-ups, coming up, quote stage
export default function Houses() {
  const nav = useNavigate()
  const [jobs, setJobs] = useState(null)
  const [sheet, setSheet] = useState(null) // { j, col }
  const [dateFor, setDateFor] = useState(null) // job being given a pack-up date
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [soldFor, setSoldFor] = useState(null) // { j, sold_date, sale_price, guide_price, agent_name }

  const load = useCallback(() => {
    supabase.from('jobs').select('*, clients(name), job_finance(*), job_items(count)')
      .eq('type', 'staging').neq('status', 'cancelled')
      .then(({ data }) => setJobs(data || []))
  }, [])
  useEffect(() => { load() }, [load])

  if (!jobs) return <Loading />

  const t = today()
  const done = (j) => ['complete', 'collected'].includes(j.status)

  // still out, no pack-up booked yet
  const out = jobs.filter((j) => !done(j) && j.install_date && j.install_date <= t && !j.collection_date)
    .map((j) => ({ ...j, end: hireEnd(j) }))
    .sort((a, b) => (a.end || '').localeCompare(b.end || ''))

  // pack-ups: collections booked (any date ahead, or overdue), plus upcoming packing/unpack days
  const packUps = []
  for (const j of jobs) {
    if (j.status === 'complete') continue
    if (j.collection_date && !done(j)) packUps.push({ j, date: j.collection_date, what: 'Pack up', kind: 'collect' })
    if (j.pack_date && j.pack_date >= t && j.pack_date <= addDays(t, 21) && !['installed', 'packing'].includes(j.status)) packUps.push({ j, date: j.pack_date, what: 'Pack for install', kind: 'pack' })
    if (j.status === 'collected' && j.unpack_date && j.unpack_date >= t) packUps.push({ j, date: j.unpack_date, what: 'Unpack', kind: 'unpack' })
  }
  packUps.sort((a, b) => a.date.localeCompare(b.date))

  const coming = jobs.filter((j) => !done(j) && j.status !== 'quote_sent' && j.status !== 'enquiry' && (!j.install_date || j.install_date > t))
    .sort((a, b) => (a.install_date || '9').localeCompare(b.install_date || '9'))
  const quotes = jobs.filter((j) => ['quote_sent', 'enquiry'].includes(j.status))
  const recent = jobs.filter(done).sort((a, b) => (hireEnd(b) || '').localeCompare(hireEnd(a) || '')).slice(0, 6)

  const update = async (j, fields, msg) => {
    setBusy(true)
    const { error } = await supabase.from('jobs').update(fields).eq('id', j.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast(msg)
    setSheet(null); setDateFor(null)
    load()
  }

  const askSold = (j) => {
    setSheet(null)
    setSoldFor({ j, sold_date: j.sold_date || t, sale_price: j.sale_price ?? '', guide_price: j.guide_price ?? '', agent_name: j.agent_name || '', listed_date: j.listed_date || '' })
  }
  const saveSold = async () => {
    const { j, ...f } = soldFor
    setBusy(true)
    const { error } = await supabase.from('jobs').update({
      sold_date: f.sold_date || null, sale_price: f.sale_price || null, guide_price: f.guide_price || null,
      agent_name: f.agent_name || null, listed_date: f.listed_date || null,
    }).eq('id', j.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Sale recorded. Added to your Results.')
    setSoldFor(null)
    load()
    if (!j.collection_date) askDate({ ...j, sold_date: f.sold_date })
  }

  const askDate = (j) => {
    setSheet(null)
    setDate(j.collection_date || (hireEnd(j) && hireEnd(j) >= t ? hireEnd(j) : t))
    setDateFor(j)
  }

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
          {out.length === 0 && <p className="muted small">No houses out without a pack-up booked.</p>}
          {out.map((j) => {
            const d = daysUntil(j.end)
            return (
              <Card key={j.id} j={j} urgent={d !== null && d <= 7} onClick={() => setSheet({ j, col: 'out' })}>
                <div className="hc-line"><b>Ends {fmtDate(j.end)}</b> <span className={d <= 7 ? 'warn-text' : 'muted'}>{d < 0 ? `${-d}d over` : d === 0 ? 'today' : `${d} days`}</span></div>
                <div className="hc-sub">Installed {fmtDate(j.install_date)} · {j.hire_weeks} wks{j.sold_date ? ` · SOLD ${fmtDate(j.sold_date)}` : ''}</div>
                <Pay j={j} />
              </Card>
            )
          })}
        </Column>

        <Column title="Pack ups" count={packUps.length}>
          {packUps.length === 0 && <p className="muted small">No pack-ups booked. Tap a house that’s out to book one.</p>}
          {packUps.map(({ j, date: d, what, kind }) => {
            const n = daysUntil(d)
            return (
              <Card key={`${j.id}${kind}`} j={j} urgent={kind === 'collect' && n <= 2} onClick={() => setSheet({ j, col: kind })}>
                <div className="hc-line"><b>{what} · {fmtDate(d)}</b> <span className={n < 0 ? 'warn-text' : 'muted'}>{n < 0 ? `${-n}d ago` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `${n} days`}</span></div>
                <div className="hc-sub">{j.job_items?.[0]?.count || 0} pieces on the list</div>
              </Card>
            )
          })}
        </Column>

        <Column title="Booked, coming up" count={coming.length}>
          {coming.length === 0 && <p className="muted small">Nothing booked yet.</p>}
          {coming.map((j) => (
            <Card key={j.id} j={j} onClick={() => nav(`/jobs/${j.id}`)}>
              <div className="hc-line"><b>{j.install_date ? `Install ${fmtDate(j.install_date)}` : 'No install date yet'}</b></div>
              {j.pack_date && <div className="hc-sub">Pack {fmtDate(j.pack_date)}</div>}
              <Pay j={j} />
            </Card>
          ))}
        </Column>

        <Column title="Quote stage" count={quotes.length}>
          {quotes.length === 0 && <p className="muted small">No open quotes.</p>}
          {quotes.map((j) => (
            <Card key={j.id} j={j} onClick={() => nav(`/jobs/${j.id}`)}>
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

      {sheet && (
        <Modal title={sheet.j.property_address} onClose={() => setSheet(null)}>
          <div className="stack action-sheet">
            {sheet.col === 'out' && (
              <>
                <p className="muted small">Hire ends {fmtLong(hireEnd(sheet.j))}</p>
                <button className="btn btn-primary btn-big btn-block" onClick={() => askDate(sheet.j)}>Move to pack up</button>
                <button className="btn btn-big btn-block" onClick={() => askSold(sheet.j)}>{sheet.j.sold_date ? `Sold ${fmtDate(sheet.j.sold_date)} · edit` : 'Property sold'}</button>
              </>
            )}
            {sheet.col === 'collect' && (
              <>
                <p className="muted small">Pack up {fmtLong(sheet.j.collection_date)}</p>
                <button className="btn btn-primary btn-big btn-block" onClick={() => nav(`/pick/${sheet.j.id}`)}>Open pick list</button>
                <button className="btn btn-big btn-block" onClick={() => askDate(sheet.j)}>Change pack-up date</button>
                <button className="btn btn-big btn-block" onClick={() => askSold(sheet.j)}>{sheet.j.sold_date ? `Sold ${fmtDate(sheet.j.sold_date)} · edit` : 'Property sold'}</button>
                <button className="btn btn-big btn-block" disabled={busy} onClick={() => update(sheet.j, { status: 'collected' }, 'Marked collected')}>Mark collected</button>
                <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => update(sheet.j, { collection_date: null }, 'Pack-up removed, back to out')}>Cancel pack-up</button>
              </>
            )}
            {(sheet.col === 'pack' || sheet.col === 'unpack') && (
              <button className="btn btn-primary btn-big btn-block" onClick={() => nav(`/pick/${sheet.j.id}`)}>Open pick list</button>
            )}
            {sheet.col === 'unpack' && (
              <button className="btn btn-big btn-block" disabled={busy} onClick={() => update(sheet.j, { status: 'complete' }, 'Back in shed, all done')}>Mark unpacked & done</button>
            )}
            <button className="btn btn-big btn-block" onClick={() => nav(`/jobs/${sheet.j.id}`)}>View house details</button>
          </div>
        </Modal>
      )}

      {soldFor && (
        <Modal title="Property sold 🎉" onClose={() => setSoldFor(null)}>
          <div className="stack">
            <p><strong>{soldFor.j.property_address}</strong><br /><span className="muted small">This builds your results sheet for agents.</span></p>
            <div className="grid2">
              <Field label="Sold (unconditional)"><input type="date" value={soldFor.sold_date} onChange={(e) => setSoldFor({ ...soldFor, sold_date: e.target.value })} /></Field>
              <Field label="Listed (optional)" hint="Blank = install date"><input type="date" value={soldFor.listed_date} onChange={(e) => setSoldFor({ ...soldFor, listed_date: e.target.value })} /></Field>
              <Field label="Sale price ($)"><input type="number" inputMode="numeric" value={soldFor.sale_price} onChange={(e) => setSoldFor({ ...soldFor, sale_price: e.target.value })} /></Field>
              <Field label="Price guide ($)"><input type="number" inputMode="numeric" value={soldFor.guide_price} onChange={(e) => setSoldFor({ ...soldFor, guide_price: e.target.value })} /></Field>
            </div>
            <Field label="Listing agent"><input value={soldFor.agent_name} onChange={(e) => setSoldFor({ ...soldFor, agent_name: e.target.value })} placeholder="e.g. Tom, Riverina Realty" /></Field>
            <div className="row">
              <button className="btn btn-ghost" onClick={() => setSoldFor(null)}>Cancel</button>
              <button className="btn btn-primary grow btn-big" disabled={busy || !soldFor.sold_date} onClick={saveSold}>
                Save{soldFor.j.collection_date ? '' : ' & book pack up'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {dateFor && (
        <Modal title="Pick a pack-up date" onClose={() => setDateFor(null)}>
          <div className="stack">
            <p><strong>{dateFor.property_address}</strong><br /><span className="muted small">Hire ends {fmtLong(hireEnd(dateFor))}</span></p>
            <Field label="Pack-up day">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="chips">
              {[['Hire end', hireEnd(dateFor)], ['Today', t], ['Tomorrow', addDays(t, 1)]].filter(([, v]) => v).map(([l, v]) => (
                <button key={l} className={`chip ${date === v ? 'on' : ''}`} onClick={() => setDate(v)}>{l} · {fmtDate(v)}</button>
              ))}
            </div>
            <div className="row">
              <button className="btn btn-ghost" onClick={() => setDateFor(null)}>Cancel</button>
              <button className="btn btn-primary grow btn-big" disabled={!date || busy}
                onClick={() => update(dateFor, { collection_date: date }, `Pack up booked for ${fmtDate(date)}`)}>
                Book pack up
              </button>
            </div>
          </div>
        </Modal>
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

function Card({ j, urgent, children, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`house-card ${urgent ? 'urgent' : ''}`}>
      <div className="hc-addr">{j.property_address}</div>
      {children}
    </button>
  )
}

function Pay({ j }) {
  const p = paymentLabel(j.job_finance)
  return <span className={`pill ${p === 'Paid in full' ? 'pill-in' : p === 'Deposit paid' ? 'pill-out' : 'pill-warn'}`}>{p}</span>
}
