import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, friendlyError } from '../lib/supabase'
import { toast } from '../lib/toast'
import { EVENT_KINDS } from '../lib/constants'
import { toISO, today, hireEnd, parseDate, addDays } from '../lib/format'
import { Loading, TypeTag, Modal, Field } from '../components/ui'
import { useAuth } from '../lib/auth'
import Icon from '../components/Icon'

export function jobEvents(jobs) {
  const ev = []
  for (const j of jobs) {
    if (j.status === 'cancelled') continue
    const dates = { ...j, hire_end: j.type === 'staging' ? hireEnd(j) : null }
    for (const k of Object.keys(EVENT_KINDS)) {
      if (dates[k]) ev.push({ date: dates[k], kind: k, field: k === 'hire_end' ? 'hire_end_date' : k, job: j, ...EVENT_KINDS[k] })
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
  const [edit, setEdit] = useState(null)      // event being edited
  const [adding, setAdding] = useState(null)  // date to add something on
  const [drag, setDrag] = useState(null)
  const { can } = useAuth()
  const canDates = can('houses')

  const loadReminders = () => supabase.from('reminders').select('*, jobs(id, property_address, type, status)').order('due_date')
    .then(({ data }) => setReminders((data || []).filter((r) => !r.job_id || (r.jobs && r.jobs.status !== 'cancelled'))))
  const loadJobs = () => supabase.from('jobs').select('*, clients(name)').neq('status', 'cancelled').then(({ data }) => setJobs(data || []))
  useEffect(() => { loadJobs(); loadReminders() }, [])

  /** Move an event to a new day (or clear it with null). */
  const moveEvent = async (e, to) => {
    if (e.reminder) {
      const { error } = await supabase.from('reminders').update({ due_date: to }).eq('id', e.reminder.id)
      if (error) return toast(friendlyError(error), 'error'), false
      loadReminders(); return true
    }
    if (!canDates) return toast('You don’t have Houses access to change dates', 'error'), false
    const patch = { [e.field]: to }
    // installs keep the same hire length unless the end date was set by hand
    const { error } = await supabase.from('jobs').update(patch).eq('id', e.job.id)
    if (error) return toast(friendlyError(error), 'error'), false
    loadJobs(); return true
  }
  const dropOn = async (iso) => {
    const e = drag; setDrag(null)
    if (!e || e.date === iso) return
    if (await moveEvent(e, iso)) toast(`${e.label} moved to ${parseDate(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`)
  }
  const dnd = (iso) => ({
    onDragOver: (ev) => { if (drag) { ev.preventDefault(); ev.currentTarget.classList.add('drop') } },
    onDragLeave: (ev) => ev.currentTarget.classList.remove('drop'),
    onDrop: (ev) => { ev.preventDefault(); ev.currentTarget.classList.remove('drop'); dropOn(iso) },
  })
  const dragProps = (e) => ((e.reminder || canDates) ? {
    draggable: true,
    onDragStart: (ev) => { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', e.label); setDrag(e) },
    onDragEnd: () => setDrag(null),
  } : {})

  const tick = async (r) => {
    const { error } = await supabase.from('reminders').update({ done_at: r.done_at ? null : new Date().toISOString() }).eq('id', r.id)
    if (error) return toast(friendlyError(error), 'error')
    loadReminders()
  }

  const events = useMemo(() => [
    ...jobEvents(jobs || []),
    ...reminders.map((r) => ({ date: r.due_date, kind: 'reminder', job: r.jobs || null, reminder: r, label: r.title, cls: `ev-remind${r.done_at ? ' is-done' : ''}` })),
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
          <span key={c}><i className={`dot ${c}`} />{['Visit / consult', 'Pack / unpack', 'Install', 'Hire ends', 'Collection', 'Note / reminder'][i]}</span>
        ))}
      </div>

      {overdue.length > 0 && (
        <div className="note small">
          <b>{overdue.length} overdue reminder{overdue.length > 1 ? 's' : ''}</b>
          <ul className="list">
            {overdue.map((r) => (
              <li key={r.id} className="list-row">
                <input type="checkbox" checked={false} onChange={() => tick(r)} aria-label="Done" />
                <Link to={r.job_id ? `/jobs/${r.job_id}` : '/calendar'} className="grow">{r.title}{r.jobs ? ` · ${r.jobs.property_address}` : ''} · {parseDate(r.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</Link>
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
            <button key={iso} onClick={() => setDay(iso)} {...dnd(iso)}
              className={`cal-cell ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${iso === today() ? 'is-today' : ''} ${iso === day ? 'sel' : ''} ${weekSet.has(iso) ? 'in-week' : ''}`}>
              <span className="cal-num">{d.getDate()}</span>
              <span className="cal-evs">
                {evs.slice(0, 3).map((e, i) => (
                  <span key={i} className={`cal-ev ${e.cls}`}><span className="cal-ev-txt">{e.label}{e.job ? ` · ${e.job.property_address}` : ''}</span></span>
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
              <div key={iso} className={`week-day ${iso === today() ? 'is-today' : ''} ${iso === day ? 'sel' : ''}`} onClick={() => setDay(iso)} {...dnd(iso)}>
                <div className="wd-head">
                  <span>{d.toLocaleDateString('en-AU', { weekday: 'short' })}</span>
                  <b>{d.getDate()}</b>
                  <button type="button" className="wd-add" aria-label={`Add on ${d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}`}
                    onClick={(ev) => { ev.stopPropagation(); setAdding(iso) }}><Icon name="plus" size={16} /></button>
                </div>
                {evs.length === 0 ? <div className="wd-empty">–</div> : evs.map((e, i) => (
                  <div key={i} role="button" tabIndex={0} className={`wd-ev ${e.cls}`} {...dragProps(e)}
                    onClick={(ev) => { ev.stopPropagation(); setEdit(e) }}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') setEdit(e) }}>
                    <span className="wd-ev-label">
                      {e.reminder && <input type="checkbox" checked={Boolean(e.reminder.done_at)} aria-label="Done"
                        onClick={(ev) => ev.stopPropagation()} onChange={() => tick(e.reminder)} />} {e.label}
                    </span>
                    {e.job && <span className="wd-ev-addr">{e.job.property_address}</span>}
                  </div>
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
      <p className="small muted">Tap anything to change it, or use + on a day to add. On a computer you can also drag things to another day.</p>

      {edit && <EventEditor e={edit} canDates={canDates} onClose={() => setEdit(null)}
        onSaved={() => { setEdit(null); loadJobs(); loadReminders() }} />}
      {adding && <AddOnDay date={adding} jobs={jobs} canDates={canDates} onClose={() => setAdding(null)}
        onSaved={() => { setAdding(null); loadJobs(); loadReminders() }} />}
    </div>
  )
}

const longDate = (iso) => parseDate(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })

/** Change the date of a house event, or edit a reminder. */
function EventEditor({ e, canDates, onClose, onSaved }) {
  const r = e.reminder
  const [date, setDate] = useState(e.date)
  const [title, setTitle] = useState(r?.title || '')
  const [busy, setBusy] = useState(false)
  const autoEnd = e.field === 'install_date' && e.job?.type === 'staging' && !e.job.hire_end_date

  const run = async (fn, msg) => {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast(msg); onSaved()
  }
  const save = (ev) => {
    ev.preventDefault()
    if (r) return run(() => supabase.from('reminders').update({ title: title.trim() || r.title, due_date: date }).eq('id', r.id), 'Note updated')
    return run(() => supabase.from('jobs').update({ [e.field]: date || null }).eq('id', e.job.id), `${e.label} moved to ${longDate(date)}`)
  }
  const remove = () => {
    if (r) {
      if (!confirm('Delete this note?')) return
      return run(() => supabase.from('reminders').delete().eq('id', r.id), 'Note deleted')
    }
    if (!confirm(`Remove the ${e.label.toLowerCase()} date from ${e.job.property_address}?`)) return
    return run(() => supabase.from('jobs').update({ [e.field]: null }).eq('id', e.job.id), `${e.label} date removed`)
  }
  const editable = r || canDates

  return (
    <Modal title={r ? 'Note' : e.label} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <p className="small muted" style={{ margin: 0 }}>{e.job ? e.job.property_address : 'Not linked to a house'}</p>
        {r && <Field label="Note"><textarea rows={3} value={title} onChange={(ev) => setTitle(ev.target.value)} /></Field>}
        <Field label={r ? 'Remind on' : 'Date'}>
          <input type="date" required value={date || ''} onChange={(ev) => setDate(ev.target.value)} disabled={!editable} />
        </Field>
        {autoEnd && <p className="small muted" style={{ margin: 0 }}>Hire end moves with it ({e.job.hire_weeks || 6} weeks).</p>}
        {e.field === 'hire_end_date' && <p className="small muted" style={{ margin: 0 }}>Sets the hire end for this house by hand.</p>}
        {!editable && <p className="small muted">You can view this, but changing house dates needs Houses access.</p>}
        <div className="row sticky-actions">
          {editable && e.field !== 'hire_end_date' && <button type="button" className="btn btn-ghost danger" onClick={remove} disabled={busy}>{r ? 'Delete' : 'Remove date'}</button>}
          {canDates && e.job && <Link className="btn" to={`/jobs/${e.job.id}`}>Open house</Link>}
          {editable && <button className="btn btn-primary grow" disabled={busy || !date}>{busy ? 'Saving…' : 'Save'}</button>}
        </div>
      </form>
    </Modal>
  )
}

const ADD_KINDS = [
  ['reminder', 'Note / reminder'],
  ['site_visit_date', 'Site visit'],
  ['consult_date', 'Consult'],
  ['pack_date', 'Packing'],
  ['install_date', 'Install'],
  ['collection_date', 'Collection'],
  ['unpack_date', 'Unpack'],
]

/** Add a reminder, or set one of a house's dates, on a chosen day. */
function AddOnDay({ date: d0, jobs, canDates, onClose, onSaved }) {
  const [kind, setKind] = useState('reminder')
  const [jobId, setJobId] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(d0)
  const [busy, setBusy] = useState(false)
  const houses = [...jobs].filter((j) => !['complete', 'cancelled'].includes(j.status))
    .sort((a, b) => (a.property_address || '').localeCompare(b.property_address || ''))
  const kinds = canDates ? ADD_KINDS : ADD_KINDS.slice(0, 1)
  const job = houses.find((j) => j.id === jobId)
  const replacing = kind !== 'reminder' && job?.[kind]

  const save = async (ev) => {
    ev.preventDefault()
    if (!jobId && kind !== 'reminder') return toast('Pick a house', 'error')
    setBusy(true)
    const { error } = kind === 'reminder'
      ? await supabase.from('reminders').insert({ job_id: jobId || null, title: title.trim(), due_date: date })
      : await supabase.from('jobs').update({ [kind]: date }).eq('id', jobId)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast(`${kind === 'reminder' ? 'Note' : ADD_KINDS.find(([k]) => k === kind)[1]} set for ${longDate(date)}`)
    onSaved()
  }

  return (
    <Modal title={`Add on ${parseDate(d0).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <div className="chips">
          {kinds.map(([k, l]) => <button type="button" key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{l}</button>)}
        </div>
        {kind === 'reminder' && <Field label="Note"><textarea required rows={3} value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="e.g. Order new cushions, or call agent to confirm access" /></Field>}
        <Field label={kind === 'reminder' ? 'House (optional)' : 'House'}>
          <select required={kind !== 'reminder'} value={jobId} onChange={(ev) => setJobId(ev.target.value)}>
            <option value="">{kind === 'reminder' ? 'No house' : 'Choose a house…'}</option>
            {houses.map((j) => <option key={j.id} value={j.id}>{j.property_address}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" required value={date} onChange={(ev) => setDate(ev.target.value)} /></Field>
        {replacing && <p className="small muted" style={{ margin: 0 }}>This replaces its current date ({longDate(job[kind])}).</p>}
        <div className="row sticky-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary grow" disabled={busy}>{busy ? 'Saving…' : 'Add'}</button>
        </div>
      </form>
    </Modal>
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
