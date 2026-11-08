import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, friendlyError } from '../lib/supabase'
import { today, addDays, fmtDate, fmtLong, hireEnd, daysUntil } from '../lib/format'
import { paymentLabel } from '../components/HireCard'
import { Loading, Modal, Field } from '../components/ui'
import { toast } from '../lib/toast'
import StockPicker from '../components/StockPicker'

// Her whiteboard, digital. Houses flow left to right: quote → booked → out → pack up.
const COLS = [
  ['quote', 'Quote stage'],
  ['booked', 'Booked, coming up'],
  ['out', 'Out & end dates'],
  ['packup', 'Pack ups'],
]

export function columnOf(j) {
  if (['enquiry', 'site_visit', 'quote_sent'].includes(j.status)) return 'quote'
  if (['accepted', 'booked', 'packing'].includes(j.status)) return 'booked'
  if (j.status === 'installed') return j.collection_date ? 'packup' : 'out'
  if (j.status === 'collected') return 'packup'
  return null // complete / cancelled
}

export default function Houses() {
  const nav = useNavigate()
  const [jobs, setJobs] = useState(null)
  const [sheet, setSheet] = useState(null) // job tapped
  const [dateFor, setDateFor] = useState(null) // { j, field: 'collection_date' | 'install_date' }
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [soldFor, setSoldFor] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [over, setOver] = useState(null)
  const [picker, setPicker] = useState(null) // job choosing inventory

  const load = useCallback(() => {
    supabase.from('jobs').select('*, clients(name), job_finance(*), job_items(count)')
      .eq('type', 'staging').neq('status', 'cancelled')
      .then(({ data }) => setJobs(data || []))
  }, [])
  useEffect(() => { load() }, [load])

  if (!jobs) return <Loading />

  const t = today()
  const by = { quote: [], booked: [], out: [], packup: [] }
  for (const j of jobs) { const c = columnOf(j); if (c) by[c].push({ ...j, end: hireEnd(j) }) }
  by.quote.sort((a, b) => b.created_at.localeCompare(a.created_at))
  by.booked.sort((a, b) => (a.install_date || '9').localeCompare(b.install_date || '9'))
  by.out.sort((a, b) => (a.end || '9').localeCompare(b.end || '9'))
  by.packup.sort((a, b) => (a.status === 'collected') - (b.status === 'collected') || (a.collection_date || '9').localeCompare(b.collection_date || '9'))
  const recent = jobs.filter((j) => j.status === 'complete').sort((a, b) => (hireEnd(b) || '').localeCompare(hireEnd(a) || '')).slice(0, 6)

  const update = async (j, fields, msg) => {
    setBusy(true)
    const { error } = await supabase.from('jobs').update(fields).eq('id', j.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast(msg)
    setSheet(null); setDateFor(null)
    load()
  }

  const askDate = (j, field) => {
    setSheet(null)
    const def = field === 'install_date' ? (j.install_date || t)
      : j.collection_date || (hireEnd(j) && hireEnd(j) >= t ? hireEnd(j) : t)
    setDate(def)
    setDateFor({ j, field })
  }

  // what happens when a house lands in a column
  const moveTo = (j, col) => {
    if (columnOf(j) === col && col !== 'packup') return
    if (col === 'quote') return update(j, { status: 'quote_sent' }, 'Moved to quote stage')
    if (col === 'booked') return update(j, { status: 'booked', collection_date: null }, 'Moved to booked')
    if (col === 'out') {
      if (!j.install_date) return askDate(j, 'install_date')
      return update(j, { status: 'installed', collection_date: null }, 'Moved to out')
    }
    if (col === 'packup') return askDate({ ...j }, 'collection_date')
  }

  // furniture needs the job's dates so only free pieces are offered
  const selectInventory = (j) => {
    setSheet(null)
    setPicker(j)
  }

  const saveDate = () => {
    const { j, field } = dateFor
    if (field === 'install_date') return update(j, { install_date: date, status: 'installed', collection_date: null }, `Installed ${fmtDate(date)}. Hire ends ${fmtDate(hireEnd({ ...j, install_date: date }))}`)
    return update(j, { collection_date: date, status: j.status === 'collected' ? 'collected' : 'installed' }, `Pack up booked for ${fmtDate(date)}`)
  }

  const askSold = (j) => {
    setSheet(null)
    setSoldFor({ j, sold_date: j.sold_date || t })
  }
  const saveSold = async () => {
    const { j, ...f } = soldFor
    setBusy(true)
    const { error } = await supabase.from('jobs').update({ sold_date: f.sold_date || null }).eq('id', j.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Marked as sold')
    setSoldFor(null)
    load()
    if (!j.collection_date) askDate(j, 'collection_date')
  }

  const onDrop = (col) => (e) => {
    e.preventDefault()
    setOver(null)
    const j = jobs.find((x) => x.id === (dragId || e.dataTransfer.getData('text/plain')))
    setDragId(null)
    if (j) moveTo(j, col)
  }

  const cardBody = (j, col) => {
    if (col === 'quote') return <div className="hc-sub">{j.clients?.name || 'No client set'}{j.site_visit_date ? ` · visit ${fmtDate(j.site_visit_date)}` : ''}</div>
    if (col === 'booked') {
      const late = j.install_date && j.install_date < t
      return (
        <>
          <div className="hc-line"><b>{j.install_date ? `Install ${fmtDate(j.install_date)}` : 'No install date yet'}</b>{late && <span className="warn-text">drag to Out</span>}</div>
          {j.pack_date && <div className="hc-sub">Pack {fmtDate(j.pack_date)} · {j.job_items?.[0]?.count || 0} pieces</div>}
          <Pay j={j} />
        </>
      )
    }
    if (col === 'out') {
      const d = daysUntil(j.end)
      return (
        <>
          <div className="hc-line"><b>Ends {fmtDate(j.end)}</b> <span className={d <= 7 ? 'warn-text' : 'muted'}>{d < 0 ? `${-d}d over` : d === 0 ? 'today' : `${d} days`}</span></div>
          <div className="hc-sub">Installed {fmtDate(j.install_date)} · {j.hire_weeks} wks{j.sold_date ? ` · SOLD ${fmtDate(j.sold_date)}` : ''}</div>
          <Pay j={j} />
        </>
      )
    }
    if (j.status === 'collected') return <div className="hc-line"><b>Collected · unpack</b><span className="muted">{j.job_items?.[0]?.count || 0} pieces</span></div>
    const n = daysUntil(j.collection_date)
    return (
      <>
        <div className="hc-line"><b>Pack up · {fmtDate(j.collection_date)}</b> <span className={n < 0 ? 'warn-text' : 'muted'}>{n < 0 ? `${-n}d ago` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `${n} days`}</span></div>
        <div className="hc-sub">{j.job_items?.[0]?.count || 0} pieces on the list{j.sold_date ? ` · SOLD ${fmtDate(j.sold_date)}` : ''}</div>
      </>
    )
  }

  const urgent = (j, col) => (col === 'out' && daysUntil(j.end) <= 7) || (col === 'packup' && j.status !== 'collected' && daysUntil(j.collection_date) <= 2)
  const sheetCol = sheet && columnOf(sheet)

  return (
    <div className="houses-page stack">
      <div className="page-head">
        <h1>Houses</h1>
        <div className="row">
          <Link className="btn btn-ghost" to="/jobs">All jobs</Link>
          <Link className="btn btn-primary" to="/jobs/new">+ New house</Link>
        </div>
      </div>
      <p className="small muted hide-sm">Drag a house between columns to move it along, or tap it for options.</p>

      <div className="board">
        {COLS.map(([col, title]) => (
          <section key={col} className={`board-col ${over === col ? 'drop-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); if (over !== col) setOver(col) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null) }}
            onDrop={onDrop(col)}>
            <h2 className="board-h">{title} <span>{by[col].length}</span></h2>
            {by[col].length === 0 && <p className="muted small">{{ quote: 'No open quotes.', booked: 'Nothing booked yet.', out: 'No houses out.', packup: 'No pack-ups booked.' }[col]}</p>}
            {by[col].map((j) => (
              <button key={j.id} type="button" draggable
                onDragStart={(e) => { setDragId(j.id); e.dataTransfer.setData('text/plain', j.id); e.dataTransfer.effectAllowed = 'move' }}
                onDragEnd={() => { setDragId(null); setOver(null) }}
                onClick={() => setSheet(j)}
                className={`house-card ${urgent(j, col) ? 'urgent' : ''} ${dragId === j.id ? 'dragging' : ''}`}>
                <div className="hc-addr">{j.property_address}</div>
                {cardBody(j, col)}
              </button>
            ))}
          </section>
        ))}
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
        <Modal title={sheet.property_address} onClose={() => setSheet(null)}>
          <div className="stack action-sheet">
            {sheetCol === 'out' && (
              <>
                <p className="muted small">Hire ends {fmtLong(hireEnd(sheet))}</p>
                <button className="btn btn-primary btn-big btn-block" onClick={() => askDate(sheet, 'collection_date')}>Move to pack up</button>
                <button className="btn btn-big btn-block" onClick={() => askSold(sheet)}>{sheet.sold_date ? `Sold ${fmtDate(sheet.sold_date)} · edit` : 'Property sold'}</button>
              </>
            )}
            {sheetCol === 'packup' && sheet.status !== 'collected' && (
              <>
                <p className="muted small">Pack up {fmtLong(sheet.collection_date)}</p>
                <button className="btn btn-primary btn-big btn-block" onClick={() => nav(`/pick/${sheet.id}`)}>Open pick list</button>
                <button className="btn btn-big btn-block" onClick={() => askDate(sheet, 'collection_date')}>Change pack-up date</button>
                <button className="btn btn-big btn-block" onClick={() => askSold(sheet)}>{sheet.sold_date ? `Sold ${fmtDate(sheet.sold_date)} · edit` : 'Property sold'}</button>
                <button className="btn btn-big btn-block" disabled={busy} onClick={() => update(sheet, { status: 'collected' }, 'Marked collected')}>Mark collected</button>
              </>
            )}
            {sheetCol === 'packup' && sheet.status === 'collected' && (
              <>
                <button className="btn btn-primary btn-big btn-block" onClick={() => nav(`/pick/${sheet.id}`)}>Open unpack list</button>
                <button className="btn btn-big btn-block" disabled={busy} onClick={() => update(sheet, { status: 'complete' }, 'Back in shed, all done')}>Mark unpacked &amp; done</button>
              </>
            )}
            {(sheetCol === 'booked' || sheetCol === 'quote') && (
              <button className="btn btn-primary btn-big btn-block" onClick={() => selectInventory(sheet)}>Select inventory</button>
            )}
            {sheetCol === 'out' && (
              <button className="btn btn-big btn-block" onClick={() => selectInventory(sheet)}>Add inventory</button>
            )}
            {sheetCol === 'booked' && (
              <button className="btn btn-big btn-block" onClick={() => nav(`/pick/${sheet.id}`)}>Open pick list</button>
            )}
            <button className="btn btn-big btn-block" onClick={() => nav(`/jobs/${sheet.id}`)}>View house details</button>
            <div className="move-row">
              <span className="small muted">Move to</span>
              <div className="chips">
                {COLS.filter(([c]) => c !== sheetCol).map(([c, l]) => (
                  <button key={c} className="chip" disabled={busy} onClick={() => moveTo(sheet, c)}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {picker && (
        <StockPicker jobId={picker.id} onClose={() => { setPicker(null); load() }} />
      )}

      {soldFor && (
        <Modal title="Property sold 🎉" onClose={() => setSoldFor(null)}>
          <div className="stack">
            <p><strong>{soldFor.j.property_address}</strong></p>
            <Field label="Sold (unconditional)"><input type="date" value={soldFor.sold_date} onChange={(e) => setSoldFor({ ...soldFor, sold_date: e.target.value })} /></Field>
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
        <Modal title={dateFor.field === 'install_date' ? 'When was it installed?' : 'Pick a pack-up date'} onClose={() => setDateFor(null)}>
          <div className="stack">
            <p><strong>{dateFor.j.property_address}</strong><br />
              <span className="muted small">{dateFor.field === 'install_date' ? `${dateFor.j.hire_weeks} week hire starts from this day` : `Hire ends ${fmtLong(hireEnd(dateFor.j))}`}</span></p>
            <Field label={dateFor.field === 'pack_date' || dateFor.field === 'collection_date' ? 'Pack-up day' : 'Install day'}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="chips">
              {(dateFor.field === 'install_date'
                ? [['Today', t], ['Yesterday', addDays(t, -1)]]
                : [['Hire end', hireEnd(dateFor.j)], ['Today', t], ['Tomorrow', addDays(t, 1)]]
              ).filter(([, v]) => v).map(([l, v]) => (
                <button key={l} className={`chip ${date === v ? 'on' : ''}`} onClick={() => setDate(v)}>{l} · {fmtDate(v)}</button>
              ))}
            </div>
            <div className="row">
              <button className="btn btn-ghost" onClick={() => setDateFor(null)}>Cancel</button>
              <button className="btn btn-primary grow btn-big" disabled={!date || busy} onClick={saveDate}>
                {dateFor.field === 'install_date' ? 'Move to out' : 'Book pack up'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Pay({ j }) {
  const p = paymentLabel(j.job_finance)
  return <span className={`pill ${p === 'Paid in full' ? 'pill-in' : p === 'Deposit paid' ? 'pill-out' : 'pill-warn'}`}>{p}</span>
}
