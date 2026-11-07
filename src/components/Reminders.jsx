import { useCallback, useEffect, useState } from 'react'
import { supabase, friendlyError } from '../lib/supabase'
import { fmtDate, today } from '../lib/format'
import { toast } from '../lib/toast'

/** Reminders on one booking. Each shows on its day in the calendar. */
export default function Reminders({ jobId }) {
  const [list, setList] = useState(null)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(today())
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    supabase.from('reminders').select('*').eq('job_id', jobId).order('due_date')
      .then(({ data, error }) => { if (error) toast(friendlyError(error), 'error'); setList(data || []) })
  }, [jobId])
  useEffect(() => { load() }, [load])

  const add = async (e) => {
    e.preventDefault()
    if (!title.trim() || !due) return
    setBusy(true)
    const { error } = await supabase.from('reminders').insert({ job_id: jobId, title: title.trim(), due_date: due })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    setTitle(''); load(); toast(`Reminder set for ${fmtDate(due)}`)
  }

  const toggle = async (r) => {
    const { error } = await supabase.from('reminders').update({ done_at: r.done_at ? null : new Date().toISOString() }).eq('id', r.id)
    if (error) return toast(friendlyError(error), 'error')
    load()
  }

  const remove = async (r) => {
    const { error } = await supabase.from('reminders').delete().eq('id', r.id)
    if (error) return toast(friendlyError(error), 'error')
    load()
  }

  return (
    <section className="card">
      <h2>Reminders <span className="muted small">show in the calendar</span></h2>
      {list && list.length > 0 && (
        <ul className="list reminder-list">
          {list.map((r) => (
            <li key={r.id} className={`list-row ${r.done_at ? 'done' : ''} ${!r.done_at && r.due_date < today() ? 'overdue' : ''}`}>
              <input type="checkbox" checked={Boolean(r.done_at)} onChange={() => toggle(r)} aria-label="Done" />
              <div className="grow">
                <div className="row-title">{r.title}</div>
                <div className="row-sub">{fmtDate(r.due_date)}{!r.done_at && r.due_date < today() ? ' · overdue' : ''}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => remove(r)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form className="row wrap" onSubmit={add}>
        <input className="grow" placeholder="e.g. Call agent to confirm access" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: 'auto' }} aria-label="Remind on" />
        <button className="btn btn-primary" disabled={busy || !title.trim()}>Add</button>
      </form>
    </section>
  )
}
